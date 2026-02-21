from playwright.sync_api import Page, expect, sync_playwright

def test_game_scene(page: Page):
    # 1. Go to the game
    page.goto("http://localhost:3200")

    # Wait for canvas to be present
    page.wait_for_selector("canvas")

    # Hide the unsupported banner if present, so it doesn't block clicks
    page.evaluate("document.getElementById('unsupported-banner').style.display = 'none'")

    # 2. Click "QUICK DEMO" button coordinates
    # Based on 1280x720 viewport:
    # cx = 640, cy = 720/2 = 360 (center)
    # Wait, MenuScene onResize uses this.scale.width / height.
    # The canvas size matches the window size because of Scale.RESIZE mode.

    # MenuScene layout:
    # Start buttons at y = height - 60.
    # Quick Demo x = cx - 215.

    viewport = page.viewport_size
    width = viewport['width']
    height = viewport['height']

    cx = width / 2
    btn_y = height - 60

    # The button is centered at (cx - 215, height - 60)
    # Width 200, Height 52.

    click_x = cx - 215
    click_y = btn_y

    print(f"Clicking at ({click_x}, {click_y})")

    page.mouse.click(click_x, click_y)

    # 3. Wait for the game scene to load
    # We can wait for a bit. The scene transition takes time.
    page.wait_for_timeout(3000)

    # 4. Take a screenshot
    page.screenshot(path="verification/verification.png")
    print("Screenshot saved to verification/verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a consistent viewport
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        try:
            test_game_scene(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
