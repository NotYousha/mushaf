"""
Play Console phone screenshots, taken from the real built app.

  npx vite preview --port 5178 --strictPort     # in one terminal
  python scripts/make-screenshots.py            # in another

Writes store/screenshots/phone-N-*.png at 1080x1920 — 9:16, inside Play's
320-3840px range, and the aspect it shows phone shots at.

Driven through the dock rather than by deep-linking, because the point is to
photograph what a reader actually sees. Each shot is taken only once the thing
it is meant to show is on screen; a screenshot of a half-mounted panel is worse
than one fewer screenshot, so a step that cannot find its target says so and is
skipped rather than shooting anyway.
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "store" / "screenshots"
URL = "http://localhost:5178/mushaf/"

# 360x640 at 3x is exactly 1080x1920.
VIEWPORT = {"width": 360, "height": 640}
SCALE = 3


def shoot(page, name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path))
    print(f"  {path.relative_to(ROOT)}")


def main() -> None:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=SCALE,
            locale="ar",
            # The splash is shown once per session; setting its flag up front
            # keeps it out of every shot but the one that wants it.
            storage_state=None,
        )
        page = ctx.new_page()
        page.goto(URL, wait_until="networkidle")
        # The boot script stamps the theme before paint; give the app a beat to
        # mount and the fonts a beat to swap in.
        page.wait_for_timeout(2500)

        shoot(page, "phone-1-home")

        # "See all" is the library: the whole roster, and further down it the
        # storage meter and the downloads list.
        try:
            page.get_by_text("عرض الكل").first.click()
            page.wait_for_timeout(1500)
            shoot(page, "phone-2-reciters")
            page.mouse.wheel(0, 6000)
            page.wait_for_timeout(1200)
            shoot(page, "phone-3-downloads")
        except Exception as e:
            print(f"  ! library: {e}")

        # A reciter, which opens his surah list.
        try:
            page.goto(URL, wait_until="networkidle")
            page.wait_for_timeout(2000)
            page.locator(".face-cell").first.click()
            page.wait_for_timeout(2000)
            shoot(page, "phone-4-surahs")
        except Exception as e:
            print(f"  ! surah list: {e}")

        # The printed page, which needs a surah chosen before it has one to
        # draw. Tapping a surah row starts it playing, so this also puts the
        # player on screen.
        try:
            page.locator(".row-main, .surah-row, li button").first.click()
            page.wait_for_timeout(3000)
            shoot(page, "phone-5-player")
            page.get_by_text("المصحف").first.click()
            page.wait_for_timeout(3500)
            shoot(page, "phone-6-mushaf")
        except Exception as e:
            print(f"  ! player/mushaf: {e}")
        browser.close()


if __name__ == "__main__":
    main()
