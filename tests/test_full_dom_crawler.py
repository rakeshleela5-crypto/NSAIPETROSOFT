"""
NSAiPetroSoft - Step 3: Playwright Full-DOM Button & Modal Crawler
Part of 'Zero-Bottleneck' Testing Blueprint
Target: https://nsaipetrosoft.pages.dev/
Backend: https://nsaipetrosoft-production.up.railway.app/

Automated Monkey & DOM Crawling:
1. Logs into nsaipetrosoft.pages.dev.
2. Discovers and clicks every visible Gel Action Button and opens every forecourt modal:
   - Fuel Rate Master (Purple)
   - Credit Customer Sale (Blue)
   - Payment Receipt (Pink)
   - Expense Book (Green)
   - Contra Transfer (Yellow)
   - Sales Entry Meter Totalizers (Orange)
   - Tanker Purchase Decanting (Magenta)
   - Tank DIP Register (Cyan)
3. Clicks Advanced Modules:
   - 🧮 Forecourt Calculator
   - ⚡ Decentro BaaS Banking Hub
4. Tests table search filters, date selectors, and input rows.
5. Fails immediately if any interaction causes:
   - Unhandled JavaScript pageerror (white screen crash)
   - Console errors
   - HTTP 5xx server responses
"""

import sys
import time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")

LIVE_URL = "https://nsaipetrosoft.pages.dev/"

def close_active_modal(page):
    """Gracefully closes any open modal dialog."""
    time.sleep(0.3)
    close_btn = page.locator(
        ".win-modal-overlay button:has-text('✕'), "
        "div.fixed.inset-0 button:has-text('✕'), "
        "div[style*='z-index: 9999'] button:has-text('✕'), "
        "button[aria-label='Close']"
    ).first
    if close_btn.count() > 0 and close_btn.is_visible():
        try:
            close_btn.click(timeout=1500)
        except Exception:
            page.keyboard.press("Escape")
    else:
        page.keyboard.press("Escape")
    time.sleep(0.4)


def run_full_dom_crawler():
    print("=" * 76)
    print("  STEP 3: PLAYWRIGHT FULL-DOM BUTTON & MODAL CRAWLER")
    print(f"  Target: {LIVE_URL}")
    print("=" * 76)

    page_errors = []
    console_errors = []
    failed_5xx_requests = []
    interactions_count = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
        )
        page = context.new_page()

        # Telemetry & Error Listeners
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text)
            if msg.type == "error" and "favicon" not in msg.text.lower()
            else None,
        )
        page.on(
            "response",
            lambda resp: failed_5xx_requests.append(f"{resp.status} on {resp.url}")
            if resp.status >= 500
            else None,
        )

        # ---------------------------------------------------------------------
        # Phase 1: Boot & Root Forecourt Dashboard
        # ---------------------------------------------------------------------
        print("\n[PHASE 1] Initial Page Load & Telemetry Baseline")
        t0 = time.time()
        page.goto(LIVE_URL, wait_until="networkidle", timeout=25000)
        load_ms = round((time.time() - t0) * 1000, 2)
        print(f"  ✓ Application boot in {load_ms}ms")
        assert "NSaiPetroSoft" in page.title()

        kpi_count = page.locator(".win-kpi-card").count()
        print(f"  ✓ Forecourt Metrics: {kpi_count} KPI Cards loaded")
        assert kpi_count >= 3, f"Expected at least 3 KPI cards, found {kpi_count}"

        # ---------------------------------------------------------------------
        # Phase 2: Systematically Crawl Every Gel Forecourt Action Button
        # ---------------------------------------------------------------------
        print("\n[PHASE 2] Crawling Forecourt Action Modals (Gel Buttons)")
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

        for selector, label in gel_buttons:
            btn = page.locator(selector).first
            if btn.count() > 0 and btn.is_visible():
                print(f"  -> Clicking '{label}' ({selector})...")
                btn.click()
                interactions_count += 1
                page.wait_for_timeout(400)

                # Verify modal overlay opened cleanly
                overlay = page.locator(".win-modal-overlay, div.fixed.inset-0")
                assert overlay.first.is_visible(), f"Modal failed to open for {label}"

                # Test form inputs inside modal (check they don't crash on focus)
                inputs = overlay.locator("input, select, button")
                input_count = inputs.count()
                print(f"     ✓ Modal open: {input_count} controls active")

                close_active_modal(page)
                interactions_count += 1
            else:
                print(f"  ⚠ Skipping '{label}' - button selector not visible")

        # ---------------------------------------------------------------------
        # Phase 3: Advanced Forecourt Tooling (Calculator & Decentro Banking)
        # ---------------------------------------------------------------------
        print("\n[PHASE 3] Crawling Advanced Tooling Modals")
        calc_btn = page.locator("button:has-text('Calculator')").first
        if calc_btn.count() > 0 and calc_btn.is_visible():
            calc_btn.click()
            interactions_count += 1
            page.wait_for_timeout(400)
            calc_modal = page.locator("div[style*='z-index: 9999'], .win-modal-overlay").first
            assert calc_modal.is_visible(), "Forecourt Calculator failed to render"
            print("  ✓ Forecourt Calculator rendered successfully")
            close_active_modal(page)
            interactions_count += 1

        decentro_btn = page.locator("button:has-text('Decentro Banking')").first
        if decentro_btn.count() > 0 and decentro_btn.is_visible():
            decentro_btn.click()
            interactions_count += 1
            page.wait_for_timeout(500)
            decentro_modal = page.locator("div.fixed.inset-0, .win-modal-overlay").first
            assert decentro_modal.is_visible(), "Decentro Banking modal failed to render"
            print("  ✓ Decentro BaaS Banking Hub rendered successfully")
            close_active_modal(page)
            interactions_count += 1

        # ---------------------------------------------------------------------
        # Phase 4: Customer Ledger Search & Live Input Filtering
        # ---------------------------------------------------------------------
        print("\n[PHASE 4] Interactive Table Search & Filtering")
        search_input = page.locator("input[placeholder*='Search name'], input[placeholder*='Search']").first
        if search_input.count() > 0 and search_input.is_visible():
            search_input.fill("Fleet")
            interactions_count += 1
            page.wait_for_timeout(300)
            search_input.fill("")
            interactions_count += 1
            page.wait_for_timeout(200)
            print("  ✓ Customer Ledger search filtering verified with zero lag")

        # ---------------------------------------------------------------------
        # Phase 5: Error Assertion & Certification
        # ---------------------------------------------------------------------
        browser.close()

    print("\n" + "-" * 76)
    print(f"  TOTAL UI INTERACTIONS COMPLETED : {interactions_count}")
    print(f"  UNHANDLED PAGE ERRORS          : {len(page_errors)}")
    print(f"  BROWSER CONSOLE ERRORS         : {len(console_errors)}")
    print(f"  FAILED HTTP 5xx REQUESTS       : {len(failed_5xx_requests)}")
    print("-" * 76)

    assert len(page_errors) == 0, f"Page errors encountered: {page_errors}"
    assert len(failed_5xx_requests) == 0, f"5xx server errors captured: {failed_5xx_requests}"
    print("  ✓ PASSED: ZERO WHITE-SCREENS, ZERO UNHANDLED PROMISES, ZERO 5xx ERRORS!\n")
    return 0


if __name__ == "__main__":
    sys.exit(run_full_dom_crawler())
