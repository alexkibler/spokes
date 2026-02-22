from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3200")

        # Wait for canvas
        page.wait_for_selector("canvas", timeout=10000)

        # Wait a bit for Phaser to render
        time.sleep(3)

        page.screenshot(path="verification/menu.png")
        browser.close()

if __name__ == "__main__":
    run()
