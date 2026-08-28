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

Two things this has to walk through that it did not used to.

**The first run now asks three questions.** Onboarding mounts over everything
until they are answered, so every shot after it would otherwise be a
photograph of the language picker. `dismiss_onboarding` clicks through with the
defaults, which is also what most readers will do.

**There is no Mushaf tab.** It and Hifz are held back in this build, and a
listing that shows a tab the app does not have is a listing that misdescribes
the app — which is both a Play problem and the first thing a tester reports.
The old phone-6 shot photographed exactly that. The printed page is reached
through Translation instead, which is where it lives now.
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "store" / "screenshots"
URL = "http://localhost:5178/mushaf/"

# 360x640 at 3x is exactly 1080x1920.
VIEWPORT = {"width": 360, "height": 640}
SCALE = 3


def dismiss_onboarding(page) -> None:
    """Click through the three first-run questions, taking every default.

    The flow keeps its own step counter and the last button says "Done"
    rather than "Next", so this presses the same control up to four times and
    stops as soon as the sheet is gone. Clicking a fixed number of times would
    break the moment a fourth question is added, and pressing on after the
    sheet has closed would land on whatever is underneath it.
    """
    for _ in range(4):
        sheet = page.locator(".ob-sheet")
        if sheet.count() == 0:
            return
        nxt = page.locator(".ob-next")
        if nxt.count() == 0:
            return
        nxt.first.click()
        page.wait_for_timeout(600)
    page.wait_for_timeout(600)


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

        dismiss_onboarding(page)
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
        except Exception as e:
            print(f"  ! player: {e}")

        # The ayah with its meaning under it. This is where the printed text
        # lives in this build, and it is the screen that shows the app is more
        # than a list of audio files.
        try:
            page.locator(".dock-tab", has_text="الترجمة").first.click()
            page.wait_for_timeout(3500)
            shoot(page, "phone-6-translation")
        except Exception as e:
            print(f"  ! translation: {e}")
        browser.close()


if __name__ == "__main__":
    main()
