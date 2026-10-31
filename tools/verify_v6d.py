import asyncio
import base64
import json
import os
import subprocess
import time
import urllib.request
import websockets

PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SHOTS_DIR = os.path.join(PROJECT_DIR, "docs", "shots")
os.makedirs(SHOTS_DIR, exist_ok=True)

CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT = 9289

async def run_cdp_session(url, actions_cb):
    chrome = subprocess.Popen([
        CHROME_BIN,
        "--headless=new",
        f"--remote-debugging-port={PORT}",
        "--window-size=1440,900",
        "--no-first-run",
        "--no-default-browser-check",
        "--allow-file-access-from-files",
        url
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    time.sleep(2.0)
    errors = []
    responses = {}

    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json") as resp:
            targets = json.loads(resp.read().decode())
        page = next(t for t in targets if t.get("type") == "page")
        ws_url = page["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url, max_size=30_000_000) as ws:
            async def reader():
                while True:
                    try:
                        raw = await ws.recv()
                        msg = json.loads(raw)
                        if "id" in msg:
                            responses[msg["id"]] = msg
                        if msg.get("method") == "Runtime.exceptionThrown":
                            exc = msg["params"]["exceptionDetails"]
                            text = exc.get("exception", {}).get("description") or exc.get("text")
                            errors.append(text)
                            print("[Console Exception]:", text)
                    except Exception:
                        break

            reader_task = asyncio.create_task(reader())

            async def send_cmd(cmd_id, method, params=None):
                req = {"id": cmd_id, "method": method}
                if params:
                    req["params"] = params
                await ws.send(json.dumps(req))
                while cmd_id not in responses:
                    await asyncio.sleep(0.04)
                return responses[cmd_id]

            await send_cmd(1, "Runtime.enable")
            await send_cmd(2, "Page.enable")
            await send_cmd(3, "DOM.enable")

            await actions_cb(send_cmd)

            reader_task.cancel()
    finally:
        chrome.terminate()
        chrome.wait()

    return errors

async def test_file_protocol():
    file_url = f"file://{PROJECT_DIR}/index.html"
    print(f"Testing file:// protocol: {file_url}")

    async def actions(send_cmd):
        await asyncio.sleep(2.0)
        res = await send_cmd(10, "Runtime.evaluate", {
            "expression": "Boolean(window.MGF_PRODUCTS && window.MGF_PRODUCTS.length > 0)",
            "returnByValue": True
        })
        val = res.get("result", {}).get("result", {}).get("value")
        print("file:// window.MGF_PRODUCTS loaded:", val)

    errors = await run_cdp_session(file_url, actions)
    print(f"file:// console errors count: {len(errors)}")
    return errors

async def test_localhost_and_screenshots():
    url = "http://localhost:5173"
    print(f"Testing localhost and capturing v6d screenshots: {url}")

    async def actions(send_cmd):
        # 1. Mobile 375x812 Hero
        print("\n--- Testing Mobile 375x812 Hero ---")
        await send_cmd(100, "Emulation.setDeviceMetricsOverride", {
            "width": 375,
            "height": 812,
            "deviceScaleFactor": 2,
            "mobile": True
        })
        await send_cmd(101, "Runtime.evaluate", {
            "expression": """
                (() => {
                    window.scrollTo(0, 0);
                    document.documentElement.style.scrollBehavior = 'auto';
                    document.documentElement.setAttribute('data-theme', 'dark');
                    localStorage.setItem('mgf-theme', 'dark');
                    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: 'dark', palette: 'orange' } }));
                    window.dispatchEvent(new Event('resize'));
                })()
            """
        })
        await asyncio.sleep(2.0)

        # Inspect Hero debug metrics on mobile
        res = await send_cmd(102, "Runtime.evaluate", {
            "expression": """
                (() => {
                    const dbg = window.__HERO_DEBUG;
                    if (!dbg) return { error: 'no HERO_DEBUG' };
                    const stageW = dbg.stageRect ? dbg.stageRect.width : 0;
                    const stageH = dbg.stageRect ? dbg.stageRect.height : 0;
                    const scaledGroupW = dbg.groupW * dbg.containScale;
                    const scaledGroupH = dbg.groupH * dbg.containScale;
                    return {
                        stageRect: dbg.stageRect,
                        groupW: dbg.groupW,
                        groupH: dbg.groupH,
                        containScale: dbg.containScale,
                        scaledGroupW,
                        scaledGroupH,
                        widthSpanRatio: stageW ? (scaledGroupW / stageW) : 0,
                        heightSpanRatio: stageH ? (scaledGroupH / stageH) : 0
                    };
                })()
            """,
            "returnByValue": True
        })
        mobile_hero_metrics = res.get("result", {}).get("result", {}).get("value")
        print("Mobile Hero Metrics:", json.dumps(mobile_hero_metrics, indent=2))

        # Capture v6d-hero-375.png
        res = await send_cmd(103, "Page.captureScreenshot", {"format": "png"})
        hero_375_path = os.path.join(SHOTS_DIR, "v6d-hero-375.png")
        with open(hero_375_path, "wb") as f:
            f.write(base64.b64decode(res["result"]["data"]))
        print(f"Saved: {hero_375_path}")

        # 2. Switch to Desktop 1440x900
        print("\n--- Testing Desktop 1440x900 Sections ---")
        await send_cmd(104, "Emulation.setDeviceMetricsOverride", {
            "width": 1440,
            "height": 900,
            "deviceScaleFactor": 1,
            "mobile": False
        })
        await send_cmd(105, "Runtime.evaluate", {
            "expression": """
                (() => {
                    window.dispatchEvent(new Event('resize'));
                })()
            """
        })
        await asyncio.sleep(1.0)

        # Inspect slot product mappings and verify uniqueness
        res = await send_cmd(106, "Runtime.evaluate", {
            "expression": """
                (() => {
                    const slots = Array.from(document.querySelectorAll('.product-slot[data-products]'));
                    return slots.map(slot => {
                        const sec = slot.closest('section');
                        return {
                            sectionId: sec ? sec.id : null,
                            dataProducts: slot.getAttribute('data-products')
                        };
                    });
                })()
            """,
            "returnByValue": True
        })
        slots_declared = res.get("result", {}).get("result", {}).get("value")
        print("Slots in HTML:", json.dumps(slots_declared, indent=2))

        # 3. Scroll to #activities and capture v6d-activities-1440.png
        await send_cmd(107, "Runtime.evaluate", {
            "expression": """
                (() => {
                    const el = document.getElementById('activities');
                    if (el) {
                        el.scrollIntoView({ behavior: 'instant', block: 'start' });
                    }
                })()
            """
        })
        await asyncio.sleep(1.5)

        res = await send_cmd(108, "Page.captureScreenshot", {"format": "png"})
        activities_path = os.path.join(SHOTS_DIR, "v6d-activities-1440.png")
        with open(activities_path, "wb") as f:
            f.write(base64.b64decode(res["result"]["data"]))
        print(f"Saved: {activities_path}")

        # 4. Scroll to #schedule and capture v6d-schedule-1440.png
        await send_cmd(109, "Runtime.evaluate", {
            "expression": """
                (() => {
                    const el = document.getElementById('schedule');
                    if (el) {
                        el.scrollIntoView({ behavior: 'instant', block: 'start' });
                    }
                })()
            """
        })
        await asyncio.sleep(1.5)

        res = await send_cmd(110, "Page.captureScreenshot", {"format": "png"})
        schedule_path = os.path.join(SHOTS_DIR, "v6d-schedule-1440.png")
        with open(schedule_path, "wb") as f:
            f.write(base64.b64decode(res["result"]["data"]))
        print(f"Saved: {schedule_path}")

    errors = await run_cdp_session(url, actions)
    print(f"localhost console errors count: {len(errors)}")
    return errors

async def main():
    file_errors = await test_file_protocol()
    localhost_errors = await test_localhost_and_screenshots()
    total_errors = len(file_errors) + len(localhost_errors)
    print(f"\n==============================")
    print(f"Total verification errors: {total_errors}")
    print(f"==============================")
    if total_errors > 0:
        exit(1)

if __name__ == "__main__":
    asyncio.run(main())
