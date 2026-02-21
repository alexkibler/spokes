from playwright.sync_api import Page, expect, sync_playwright

def debug_landing_page(page: Page):
    page.goto("http://localhost:3200")
    page.wait_for_timeout(2000)
    page.screenshot(path="verification/landing_debug.png")
    print("Landing page screenshot taken.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        try:
            debug_landing_page(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
