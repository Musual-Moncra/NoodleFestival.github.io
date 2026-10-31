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
PORT = 9278

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
    print(f"Testing localhost and capturing v6b screenshots: {url}")

    async def actions(send_cmd):
        # 1. Desktop 1440x900 Hero
        await send_cmd(99, "Emulation.setDeviceMetricsOverride", {
            "width": 1440,
            "height": 900,
            "deviceScaleFactor": 1,
            "mobile": False
        })
        await send_cmd(100, "Runtime.evaluate", {
            "expression": """
                document.documentElement.style.scrollBehavior = 'auto';
                window.dispatchEvent(new Event('resize'));
            """
        })
        await asyncio.sleep(2.0)

        # Shoot v6b-hero-1440-dark.png
        res = await send_cmd(101, "Page.captureScreenshot", {"format": "png"})
        hero_dark_path = os.path.join(SHOTS_DIR, "v6b-hero-1440-dark.png")
        with open(hero_dark_path, "wb") as f:
            f.write(base64.b64decode(res["result"]["data"]))
        print(f"Saved: {hero_dark_path}")

        # 2. Scroll to #flavors and shoot v6b-flavors-1440.png
        await send_cmd(102, "Runtime.evaluate", {
            "expression": """
                (() => {
                    const headEl = document.querySelector('#flavors .section-head') || document.querySelector('#flavors');
                    if (headEl) {
                        headEl.scrollIntoView({ behavior: 'instant', block: 'center' });
                        window.dispatchEvent(new Event('scroll'));
                        document.querySelectorAll('#flavors .reveal').forEach(el => el.classList.add('is-visible'));
                    }
                })()
            """
        })
        await asyncio.sleep(2.0)
        res = await send_cmd(103, "Page.captureScreenshot", {"format": "png"})
        flavors_1440_path = os.path.join(SHOTS_DIR, "v6b-flavors-1440.png")
        with open(flavors_1440_path, "wb") as f:
            f.write(base64.b64decode(res["result"]["data"]))
        print(f"Saved: {flavors_1440_path}")

        # 3. Scroll to #tickets and shoot v6b-tickets-1440.png
        await send_cmd(104, "Runtime.evaluate", {
            "expression": """
                (() => {
                    const headEl = document.querySelector('#tickets .section-head') || document.querySelector('#tickets');
                    if (headEl) {
                        headEl.scrollIntoView({ behavior: 'instant', block: 'center' });
                        window.dispatchEvent(new Event('scroll'));
                        document.querySelectorAll('#tickets .reveal').forEach(el => el.classList.add('is-visible'));
                    }
                })()
            """
        })
        await asyncio.sleep(2.0)
        res = await send_cmd(105, "Page.captureScreenshot", {"format": "png"})
        tickets_1440_path = os.path.join(SHOTS_DIR, "v6b-tickets-1440.png")
        with open(tickets_1440_path, "wb") as f:
            f.write(base64.b64decode(res["result"]["data"]))
        print(f"Saved: {tickets_1440_path}")

        # 4. Mobile Viewport 375x812: Hero
        await send_cmd(106, "Emulation.setDeviceMetricsOverride", {
            "width": 375,
            "height": 812,
            "deviceScaleFactor": 2,
            "mobile": True
        })
        await send_cmd(107, "Runtime.evaluate", {
            "expression": """
                window.scrollTo(0, 0);
                window.dispatchEvent(new Event('resize'));
            """
        })
        await asyncio.sleep(2.0)
        res = await send_cmd(108, "Page.captureScreenshot", {"format": "png"})
        hero_mobile_path = os.path.join(SHOTS_DIR, "v6b-hero-375.png")
        with open(hero_mobile_path, "wb") as f:
            f.write(base64.b64decode(res["result"]["data"]))
        print(f"Saved: {hero_mobile_path}")

    errors = await run_cdp_session(url, actions)
    print(f"localhost console errors count: {len(errors)}")
    return errors

async def main():
    file_errors = await test_file_protocol()
    local_errors = await test_localhost_and_screenshots()

    all_errors = file_errors + local_errors
    print("\n================ VERIFICATION SUMMARY ================")
    print(f"file:// errors: {len(file_errors)}")
    print(f"localhost errors: {len(local_errors)}")
    if len(all_errors) > 0:
        print("FAILED: Console errors encountered:")
        for err in all_errors:
            print(" -", err)
        exit(1)
    else:
        print("PASSED: 0 console errors on both file:// and localhost.")

if __name__ == "__main__":
    asyncio.run(main())
