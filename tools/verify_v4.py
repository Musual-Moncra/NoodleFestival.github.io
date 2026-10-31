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
PORT = 9268

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

        async with websockets.connect(ws_url, max_size=25_000_000) as ws:
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
    print(f"Testing localhost and capturing screenshots: {url}")

    async def actions(send_cmd):
        await send_cmd(99, "Emulation.setDeviceMetricsOverride", {
            "width": 1440,
            "height": 900,
            "deviceScaleFactor": 1,
            "mobile": False
        })
        # 1. Ensure smooth scrolling is off
        await send_cmd(100, "Runtime.evaluate", {
            "expression": "document.documentElement.style.scrollBehavior = 'auto';"
        })
        await asyncio.sleep(1.8)

        # 2. Shot: v4-hero-1440-dark.png
        res = await send_cmd(101, "Page.captureScreenshot", {"format": "png"})
        dark_hero_path = os.path.join(SHOTS_DIR, "v4-hero-1440-dark.png")
        with open(dark_hero_path, "wb") as f:
            f.write(base64.b64decode(res["result"]["data"]))
        print(f"Saved: {dark_hero_path}")

        # Close crop of center cup
        try:
            from PIL import Image
            dark_img = Image.open(dark_hero_path)
            crop_cup = dark_img.crop((580, 360, 860, 620))
            crop_path = os.path.join(SHOTS_DIR, "v4-hero-crop-center.png")
            crop_cup.save(crop_path)
            print(f"Saved: {crop_path}")
        except Exception as e:
            print("Failed to save crop:", e)

        # 3. Switch to Light theme
        await send_cmd(102, "Runtime.evaluate", {
            "expression": "document.documentElement.dataset.theme = 'light'; window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: 'light' } }));"
        })
        await asyncio.sleep(1.2)

        # 4. Shot: v4-hero-1440-light.png
        res = await send_cmd(103, "Page.captureScreenshot", {"format": "png"})
        light_hero_path = os.path.join(SHOTS_DIR, "v4-hero-1440-light.png")
        with open(light_hero_path, "wb") as f:
            f.write(base64.b64decode(res["result"]["data"]))
        print(f"Saved: {light_hero_path}")

        # Switch back to dark theme
        await send_cmd(104, "Runtime.evaluate", {
            "expression": "document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: 'dark' } }));"
        })
        await asyncio.sleep(0.5)

        # 5. Scroll to #about & capture v4-side-about-1440.png
        await send_cmd(105, "Runtime.evaluate", {
            "expression": "document.querySelector('#about').scrollIntoView(); window.scrollBy(0, 30);"
        })
        await asyncio.sleep(1.4)
        res = await send_cmd(106, "Page.captureScreenshot", {"format": "png"})
        side_about_path = os.path.join(SHOTS_DIR, "v4-side-about-1440.png")
        with open(side_about_path, "wb") as f:
            f.write(base64.b64decode(res["result"]["data"]))
        print(f"Saved: {side_about_path}")

        # 6. Scroll to #flavors & capture v4-side-flavors-1440.png
        await send_cmd(107, "Runtime.evaluate", {
            "expression": "document.querySelector('#flavors').scrollIntoView(); window.scrollBy(0, 30);"
        })
        await asyncio.sleep(1.4)
        res = await send_cmd(108, "Page.captureScreenshot", {"format": "png"})
        side_flavors_path = os.path.join(SHOTS_DIR, "v4-side-flavors-1440.png")
        with open(side_flavors_path, "wb") as f:
            f.write(base64.b64decode(res["result"]["data"]))
        print(f"Saved: {side_flavors_path}")

        # 7. Mobile Viewport 375x812 & capture v4-hero-375.png
        await send_cmd(109, "Emulation.setDeviceMetricsOverride", {
            "width": 375,
            "height": 812,
            "deviceScaleFactor": 2,
            "mobile": True
        })
        await send_cmd(110, "Runtime.evaluate", {
            "expression": "window.scrollTo(0, 0);"
        })
        await asyncio.sleep(1.4)
        res = await send_cmd(111, "Page.captureScreenshot", {"format": "png"})
        hero_mobile_path = os.path.join(SHOTS_DIR, "v4-hero-375.png")
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
