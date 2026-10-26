"""Takes the README screenshots and records the demo GIF.

Run it from the project folder with `python scripts/capture.py`. It starts `node serve.mjs` itself when nothing is
answering on port 5173, and stops it again afterwards. It needs Playwright for Python and ffmpeg on the PATH.
"""
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import Browser, Playwright, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "screenshots"
GIF = ROOT / "docs" / "demo.gif"
URL = "http://localhost:5173/"
DEMO_SECONDS = 24
GIF_LIMIT_BYTES = 8 * 1024 * 1024
# Tried in order; the second is only used if the first GIF comes out over the size limit.
GIF_SETTINGS = [(15, 128), (12, 64)]


def is_serving() -> bool:
    try:
        urllib.request.urlopen(URL, timeout=1)
        return True
    except OSError:
        return False


def start_server() -> subprocess.Popen | None:
    """Starts the project server unless something already answers. Returns the process to stop, if any."""
    if is_serving():
        return None
    server = subprocess.Popen(["node", "serve.mjs"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        if is_serving():
            return server
        time.sleep(0.1)
    server.terminate()
    raise RuntimeError("node serve.mjs did not start answering on port 5173 within five seconds.")


def launch(playwright: Playwright) -> Browser:
    """Uses Playwright's own Chromium, or an installed Chrome or Edge when that download is missing."""
    errors = []
    for channel in (None, "chrome", "msedge"):
        try:
            return playwright.chromium.launch(headless=True, channel=channel)
        except Exception as error:  # Playwright raises a plain Error when a browser is not installed.
            errors.append(f"{channel or 'chromium'}: {str(error).splitlines()[0]}")
    raise RuntimeError("No browser could be started. " + "; ".join(errors))


def screenshot(browser: Browser, query: str, width: int, height: int, name: str, full_page: bool) -> None:
    page = browser.new_page(viewport={"width": width, "height": height})
    problems: list[str] = []
    page.on("pageerror", lambda error: problems.append(str(error)))
    page.on("console", lambda message: message.type == "error" and problems.append(message.text))
    page.goto(URL + query)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1200)
    page.screenshot(path=str(SHOTS / name), full_page=full_page)
    page.close()
    if problems:
        raise RuntimeError(f"{name}: the console reported {problems}")
    print(f"wrote {SHOTS / name}")


def record_demo(browser: Browser, work: Path) -> tuple[Path, float, dict[str, float]]:
    """Records ?demo. Returns the video, how many seconds to cut from its start, and the board's rectangle."""
    size = {"width": 1100, "height": 780}
    context = browser.new_context(viewport=size, record_video_dir=str(work), record_video_size=size)
    page = context.new_page()
    started = time.monotonic()
    page.goto(URL + "?demo")
    # The page runs the fast-forward to wave 19 in one go, and the mode only changes once it is over.
    page.wait_for_function("document.body.dataset.mode === 'demo'", timeout=120_000)
    lead = time.monotonic() - started
    page.wait_for_timeout(DEMO_SECONDS * 1000)
    box = page.locator("#game").bounding_box()
    video = page.video.path()
    context.close()
    return Path(video), lead, box


def make_gif(video: Path, lead: float, box: dict[str, float]) -> None:
    for fps, colours in GIF_SETTINGS:
        crop = f"crop={int(box['width'])}:{int(box['height'])}:{int(box['x'])}:{int(box['y'])}"
        filters = (
            f"{crop},fps={fps},scale=720:-1:flags=neighbor,split[a][b];"
            f"[a]palettegen=max_colors={colours}[palette];[b][palette]paletteuse=dither=none"
        )
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{lead + 0.5:.2f}", "-i", str(video), "-filter_complex", filters, str(GIF)],
            check=True,
        )
        if GIF.stat().st_size <= GIF_LIMIT_BYTES:
            print(f"wrote {GIF} ({GIF.stat().st_size / 1024 / 1024:.1f} MB)")
            return
    raise RuntimeError(f"{GIF} is still over 8 MB at the lowest settings.")


def main() -> int:
    if shutil.which("ffmpeg") is None:
        print("ffmpeg is not on the PATH, so the GIF cannot be made. Install it and run this again.", file=sys.stderr)
        return 1
    SHOTS.mkdir(parents=True, exist_ok=True)
    server = start_server()
    try:
        with sync_playwright() as playwright:
            browser = launch(playwright)
            screenshot(browser, "", 1440, 900, "title-1440.png", full_page=False)
            screenshot(browser, "?fixture", 1440, 900, "fixture-1440.png", full_page=True)
            screenshot(browser, "?fixture", 375, 812, "fixture-375.png", full_page=True)
            screenshot(browser, "?sheet", 1440, 900, "sheet-1440.png", full_page=True)
            with tempfile.TemporaryDirectory() as work:
                video, lead, box = record_demo(browser, Path(work))
                make_gif(video, lead, box)
            browser.close()
    finally:
        if server:
            server.terminate()
    return 0


if __name__ == "__main__":
    sys.exit(main())
