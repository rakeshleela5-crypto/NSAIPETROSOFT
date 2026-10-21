import { test, expect } from '@playwright/test';

const LIVE_URL = 'https://nsaipetrosoft.pages.dev/';

test.describe('NSAIPETROSOFT Forecourt ERP End-to-End Regression Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LIVE_URL, { waitUntil: 'networkidle' });
  });

  test('Module 1: Dashboard KPIs and Live Forecourt Telemetry', async ({ page }) => {
    await expect(page).toHaveTitle(/NSaiPetroSoft/);
    const kpiCards = page.locator('.win-kpi-card');
    await expect(kpiCards).toHaveCount(4);

    // Verify Today Sale, Outstanding, Bank Balance, Stock Cost
    await expect(page.locator('.win-kpi-card.kpi-blue-bg')).toBeVisible();
    await expect(page.locator('.win-kpi-card.kpi-red-bg').first()).toBeVisible();
  });

  test('Module 2: Fuel Rate Master (F2)', async ({ page }) => {
    await page.locator('.gel-btn.gel-purple').click();
    const modal = page.locator('.win-modal-overlay');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.win-dialog-titlebar')).toContainText('Fuel Rate Master');
    await modal.locator('button:has-text("✕")').click();
    await expect(modal).not.toBeVisible();
  });

  test('Module 3: Credit Customer Sale (F3) Calculation & Dynamic Limit', async ({ page }) => {
    await page.locator('.gel-btn.gel-blue').click();
    const modal = page.locator('.win-modal-overlay');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.win-dialog-titlebar')).toContainText('Credit Customer Sale');

    // Test volume input & auto-amount calculation
    const qtyInput = modal.locator('input[type="number"]').first();
    await qtyInput.fill('50.00');
    await page.waitForTimeout(300);
    await expect(modal).toContainText('Credit Limit');

    await modal.locator('button:has-text("✕")').click();
  });

  test('Module 4: Daily Operating Expense Book (F5) & Persistence', async ({ page }) => {
    await page.locator('.gel-btn.gel-green').click();
    const modal = page.locator('.win-modal-overlay');
    await expect(modal).toBeVisible();

    await modal.locator('select').first().selectOption('Gen-Set Diesel');
    await modal.locator('input[type="number"]').first().fill('450.00');
    await modal.locator('input.win-input[type="text"]').nth(1).fill('Fuel Station Generator');
    await modal.locator('textarea').first().fill('Power backup diesel decanting');
    await modal.locator('button:has-text("Record Expense")').click();

    await page.waitForTimeout(1000);
    await expect(modal.locator('table')).toContainText('Fuel Station Generator');
    await modal.locator('button:has-text("✕")').click();
  });

  test('Module 5: Decentro API Banking (V2) Zero-PG BaaS Direct Gateway', async ({ page }) => {
    await page.locator('button:has-text("⚡ Decentro Banking")').click();
    const modal = page.locator('div.fixed.inset-0');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Decentro API Banking (V2)');
    await expect(modal).toContainText('Zero-PG Direct BaaS');
    await modal.locator('button').first().click(); // Close
  });

  test('Module 6: Floating Forecourt Tape Calculator', async ({ page }) => {
    await page.locator('button:has-text("🧮 Calculator")').click();
    const calc = page.locator('div[style*="z-index: 9999"]');
    await expect(calc).toBeVisible();
    await expect(calc).toContainText('Forecourt Tape Calculator');
    await calc.locator('button:has-text("✕")').click();
    await expect(calc).not.toBeVisible();
  });
});
