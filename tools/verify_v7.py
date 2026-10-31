#!/usr/bin/env python3
"""QA vòng 7: chụp viewport matrix, bắt console error, kiểm scroll ngang / WebGL / product-slot.

Chạy: python3 tools/verify_v7.py
- Mở index.html qua file:// (kiểm lỗi + layout, không chụp) và http://127.0.0.1 (chụp ảnh).
- Ảnh: docs/shots/v7-<section>-<width>.png
- Exit code 1 nếu có console error, scroll ngang, hoặc .product-slot có rect 0.
"""
import asyncio
import base64
import itertools
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

import websockets

PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SHOTS_DIR = os.path.join(PROJECT_DIR, "docs", "shots")
os.makedirs(SHOTS_DIR, exist_ok=True)

CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CDP_PORT = 9297
HTTP_PORT = 8798

VIEWPORTS = [
    (360, 780),
    (390, 844),
    (768, 1024),
    (1024, 768),
    (1440, 900),
    (1920, 1080),
]

FIND_SECTIONS_JS = """
(() => {
  const out = [];
  const seen = new Set();
  const hero = document.querySelector('.hero, #top');
  if (hero) {
    out.push({ name: 'hero', id: hero.id || 'top' });
    seen.add(hero.id || 'top');
  }
  document.querySelectorAll('section[id]').forEach((s) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    out.push({ name: s.id, id: s.id });
  });
  return out;
})()
"""

METRICS_JS = """
(() => {
  const de = document.documentElement;
  const body = document.body;
  const iw = window.innerWidth;
  const sw = Math.max(de.scrollWidth, body ? body.scrollWidth : 0);
  const offenders = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    if (r.right > iw + 1 || r.left < -1) {
      if (offenders.length < 8) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          cls: (typeof el.className === 'string' ? el.className : '') || null,
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
      }
    }
  });

  const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
    let isWebGL = false;
    try {
      isWebGL = !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (e) {}
    const r = c.getBoundingClientRect();
    return {
      id: c.id || null,
      cls: (typeof c.className === 'string' ? c.className : '') || null,
      w: Math.round(r.width),
      h: Math.round(r.height),
      webgl: isWebGL,
    };
  });

  const slots = Array.from(document.querySelectorAll('.product-slot')).map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      cls: (typeof el.className === 'string' ? el.className : '') || '',
      products: el.dataset.products || '',
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      display: cs.display,
      visibility: cs.visibility,
      zero: r.width === 0 || r.height === 0,
    };
  });

  return {
    innerWidth: iw,
    scrollWidth: sw,
    overflowX: sw > iw + 1,
    offenders,
    canvases,
    webglCount: canvases.filter((c) => c.webgl).length,
    slots,
    zeroSlots: slots.filter((s) => s.zero),
  };
})()
"""


def log(*args):
    print(*args, flush=True)


def free_port(preferred):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            pass
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class CdpSession:
    def __init__(self, port):
        self.port = port
        self.ids = itertools.count(1)
        self.responses = {}
        self.events = []
        self.load_seen = asyncio.Event()
        self.ws = None
        self._reader_task = None

    async def connect(self):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/json") as resp:
            targets = json.loads(resp.read().decode())
        page = next(t for t in targets if t.get("type") == "page")
        self.ws = await websockets.connect(page["webSocketDebuggerUrl"], max_size=40_000_000)
        self._reader_task = asyncio.create_task(self._reader())
        await self.send("Runtime.enable")
        await self.send("Page.enable")
        await self.send("DOM.enable")
        await self.send("Log.enable")

    async def _reader(self):
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                if "id" in msg:
                    self.responses[msg["id"]] = msg
                    continue
                method = msg.get("method")
                params = msg.get("params", {})
                if method == "Runtime.exceptionThrown":
                    exc = params.get("exceptionDetails", {})
                    text = (exc.get("exception") or {}).get("description") or exc.get("text") or "unknown exception"
                    self.events.append(("exception", text))
                elif method == "Runtime.consoleAPICalled":
                    if params.get("type") in ("error", "assert"):
                        args = params.get("args", [])
                        parts = []
                        for a in args:
                            parts.append(a.get("value") or a.get("description") or a.get("type") or "")
                        self.events.append(("console.error", " ".join(str(p) for p in parts)))
                elif method == "Log.entryAdded":
                    entry = params.get("entry", {})
                    if entry.get("level") == "error":
                        self.events.append(("log.error", entry.get("text") or entry.get("url") or ""))
                elif method == "Page.loadEventFired":
                    self.load_seen.set()
        except Exception:
            pass

    async def send(self, method, params=None, timeout=30.0):
        cmd_id = next(self.ids)
        req = {"id": cmd_id, "method": method}
        if params is not None:
            req["params"] = params
        await self.ws.send(json.dumps(req))
        deadline = time.monotonic() + timeout
        while cmd_id not in self.responses:
            if time.monotonic() > deadline:
                raise TimeoutError(f"CDP timeout: {method}")
            await asyncio.sleep(0.01)
        return self.responses.pop(cmd_id)

    async def evaluate(self, expression):
        res = await self.send("Runtime.evaluate", {"expression": expression, "returnByValue": True})
        result = res.get("result", {})
        if result.get("exceptionDetails"):
            return None
        return result.get("result", {}).get("value")

    async def navigate(self, url):
        self.load_seen.clear()
        await self.send("Page.navigate", {"url": url})
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            state = await self.evaluate(
                "JSON.stringify({ ready: document.readyState, href: location.href })"
            )
            if state:
                info = json.loads(state)
                if info.get("ready") == "complete" and info.get("href", "").startswith(url):
                    break
            await asyncio.sleep(0.15)
        await asyncio.sleep(2.2)

    async def close(self):
        if self._reader_task:
            self._reader_task.cancel()
        if self.ws:
            await self.ws.close()


async def launch_chrome(url):
    user_data = tempfile.mkdtemp(prefix="verify_v7_chrome_")
    port = free_port(CDP_PORT)
    proc = subprocess.Popen(
        [
            CHROME_BIN,
            "--headless=new",
            f"--remote-debugging-port={port}",
            f"--user-data-dir={user_data}",
            "--window-size=1920,1080",
            "--no-first-run",
            "--no-default-browser-check",
            "--allow-file-access-from-files",
            "--enable-unsafe-swiftshader",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            "--force-device-scale-factor=1",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=1):
                return proc, user_data, port
        except Exception:
            await asyncio.sleep(0.2)
    proc.terminate()
    raise RuntimeError("Chrome CDP không khởi động được")


def cleanup_chrome(proc, user_data):
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
    subprocess.run(["rm", "-rf", user_data], check=False)


def wait_http(port, timeout=10.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/index.html", timeout=1):
                return True
        except Exception:
            time.sleep(0.2)
    return False


async def main():
    failures = []
    all_errors = []
    server = None

    http_port = free_port(HTTP_PORT)

    file_url = "file://" + os.path.join(PROJECT_DIR, "index.html")
    try:
        server = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(http_port), "--bind", "127.0.0.1", "--directory", PROJECT_DIR],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if not wait_http(http_port):
            log("FAIL: python3 -m http.server không phản hồi")
            return 1
        log(f"http.server: http://127.0.0.1:{http_port} (dir={PROJECT_DIR})")

        await _visit(file_url, "file", False, failures, all_errors)
        await _visit(f"http://127.0.0.1:{http_port}/index.html", "http", True, failures, all_errors)
    finally:
        if server:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()

    log("\n==============================")
    log(f"Failures: {len(failures)}")
    log(f"Console errors: {len(all_errors)}")
    log(f"Ảnh đã lưu vào: {os.path.relpath(SHOTS_DIR, PROJECT_DIR)}/v7-<section>-<width>.png")
    log("==============================")
    if failures:
        log("KẾT QUẢ: FAIL")
        return 1
    log("KẾT QUẢ: PASS")
    return 0


async def _visit(url, protocol, capture, failures, all_errors):
    proc, user_data, port = await launch_chrome(url)
    try:
        await _visit_with_proc(url, protocol, capture, failures, all_errors, port)
    finally:
        cleanup_chrome(proc, user_data)


async def _visit_with_proc(url, protocol, capture, failures, all_errors, port):
    log(f"\n=== {protocol}: {url} ===")
    session = CdpSession(port)
    await session.connect()
    try:
        for width, height in VIEWPORTS:
            await session.send(
                "Emulation.setDeviceMetricsOverride",
                {"width": width, "height": height, "screenWidth": width, "screenHeight": height, "scale": 1, "deviceScaleFactor": 1, "mobile": width <= 860},
            )
            await session.navigate(url)
            errors_before = len(session.events)

            sections = await session.evaluate(FIND_SECTIONS_JS) or [{"name": "hero", "id": "top"}]
            metrics = await session.evaluate(METRICS_JS) or {}

            log(
                f"[{protocol} {width}x{height}] sections={[s['name'] for s in sections]} "
                f"webgl={metrics.get('webglCount')}/{len(metrics.get('canvases', []))} "
                f"overflowX={metrics.get('overflowX')} (scrollWidth={metrics.get('scrollWidth')}, innerWidth={metrics.get('innerWidth')}) "
                f"slots={len(metrics.get('slots', []))} zeroSlots={len(metrics.get('zeroSlots', []))}"
            )

            if metrics.get("overflowX"):
                msg = f"scroll ngang: scrollWidth={metrics['scrollWidth']} > innerWidth={metrics['innerWidth']}"
                log(f"  FAIL {msg}")
                for o in metrics.get("offenders", []):
                    log(f"    offender: {o['tag']}#{o['id']}.{o['cls']} left={o['left']} right={o['right']} w={o['width']}")
                failures.append(f"{protocol} {width}px {msg}")

            for c in metrics.get("canvases", []):
                if not c["webgl"]:
                    log(f"  warn: canvas không có WebGL context: id={c['id']} cls={c['cls']} {c['w']}x{c['h']}")
            if metrics.get("webglCount", 0) == 0:
                log("  warn: không tìm thấy canvas WebGL nào")

            for s in metrics.get("zeroSlots", []):
                msg = f".product-slot rect 0: {s['cls']} data-products='{s['products']}' display={s['display']} visibility={s['visibility']}"
                log(f"  FAIL {msg}")
                failures.append(f"{protocol} {width}px {msg}")

            for sec in sections:
                if sec["name"] == "hero":
                    await session.evaluate("window.scrollTo({ top: 0, left: 0, behavior: 'instant' })")
                else:
                    await session.evaluate(
                        f"(() => {{ const el = document.getElementById({json.dumps(sec['id'])}); if (el) el.scrollIntoView({{ behavior: 'instant', block: 'start' }}); }})()"
                    )
                await asyncio.sleep(1.0)

                if capture:
                    res = await session.send("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
                    data = res.get("result", {}).get("data")
                    if not data:
                        failures.append(f"{protocol} {width}px không chụp được {sec['name']}")
                        continue
                    path = os.path.join(SHOTS_DIR, f"v7-{sec['name']}-{width}.png")
                    with open(path, "wb") as f:
                        f.write(base64.b64decode(data))
                    log(f"  saved {os.path.relpath(path, PROJECT_DIR)}")

            new_events = session.events[errors_before:]
            seen = set()
            for kind, text in new_events:
                text = " ".join(str(text).split())
                key = (kind, text)
                if key in seen:
                    continue
                seen.add(key)
                log(f"  FAIL [{kind}] {text}")
                failures.append(f"{protocol} {width}px [{kind}] {text}")
                all_errors.append((protocol, width, kind, text))
    finally:
        await session.close()


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        sys.exit(130)
