"""
NSAIPETROSOFT ERP - Automated Full Regression E2E Suite
Author: Principal QA Architect & Lead SDET
Target: https://nsaipetrosoft.pages.dev/
API Base: https://nsaipetrosoft-production.up.railway.app/

To run:
    python tests/e2e_regression_suite.py
"""

import sys
import time
from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding='utf-8')

LIVE_URL = "https://nsaipetrosoft.pages.dev/"

def test_full_regression():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        print("[TEST 1] Page Load & Telemetry")
        t0 = time.time()
        page.goto(LIVE_URL, wait_until="networkidle")
        load_time = round((time.time() - t0) * 1000, 2)
        print(f"  Loaded in {load_time}ms")
        assert "NSaiPetroSoft" in page.title()
        assert page.locator(".win-kpi-card").count() >= 4

        print("[TEST 2] Customer Ledger Search & Live Filtering")
        filter_input = page.locator("input[placeholder*='Search name']").first
        filter_input.fill("Shree")
        page.wait_for_timeout(300)
        filter_input.fill("")
        page.wait_for_timeout(200)

        def close_modal():
            btn = page.locator(".win-modal-overlay button:has-text('✕'), div.fixed.inset-0 button:has-text('✕'), div[style*='z-index: 9999'] button:has-text('✕')").first
            if btn.count() > 0 and btn.is_visible():
                btn.click()
            else:
                page.keyboard.press("Escape")
            page.wait_for_timeout(400)

        print("[TEST 3] Gel Action Buttons")
        gel_buttons = [
            (".gel-btn.gel-purple", "Fuel Rate Master"),
            (".gel-btn.gel-blue", "Credit Customer Sale"),
            (".gel-btn.gel-pink", "Payment Receipt"),
            (".gel-btn.gel-green", "Expense Book"),
            (".gel-btn.gel-yellow", "Contra Transfer"),
            (".gel-btn.gel-orange", "Sales Entry Meter Totalizers"),
            (".gel-btn.gel-magenta", "Tanker Purchase Decanting"),
            (".gel-btn.gel-cyan", "Tank DIP Register"),
        ]
        for btn_sel, name in gel_buttons:
            page.locator(btn_sel).first.click()
            page.locator(".win-modal-overlay").wait_for(state="visible", timeout=12000)
            assert page.locator(".win-modal-overlay").is_visible(), f"{name} modal should be visible"
            close_modal()

        print("[TEST 4] Advanced Modules: Calculator & Decentro BaaS Banking")
        page.locator("button:has-text('🧮 Calculator')").first.click()
        page.wait_for_timeout(400)
        assert page.locator("div[style*='z-index: 9999']").is_visible()
        close_modal()

        page.locator("button:has-text('⚡ Decentro Banking')").first.click()
        page.wait_for_timeout(500)
        assert page.locator("div.fixed.inset-0").is_visible()
        close_modal()

        print("[TEST 5] Expense Entry CRUD & F5 State Persistence")
        page.locator(".gel-btn.gel-green").first.click()
        page.wait_for_timeout(500)
        overlay = page.locator(".win-modal-overlay")
        overlay.locator("select").first.select_option("Stationery & Rolls")
        overlay.locator("input[type='number']").first.fill("180.00")
        overlay.locator("input.win-input[type='text']").nth(1).fill("City Stationers")
        overlay.locator("textarea").first.fill("Thermal Receipt Paper Rolls 80mm")
        overlay.locator("button:has-text('Record Expense')").first.click()
        page.wait_for_timeout(1000)
        assert "City Stationers" in overlay.locator("table").inner_text()
        close_modal()

        # F5 Reload
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1000)
        page.locator(".gel-btn.gel-green").first.click()
        page.wait_for_timeout(500)
        assert "City Stationers" in page.locator(".win-modal-overlay table").inner_text()
        close_modal()

        print("\nALL REGRESSION PATHS PASSED!")
        browser.close()

if __name__ == "__main__":
    test_full_regression()
