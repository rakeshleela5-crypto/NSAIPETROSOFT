/**
 * ERP Date Utilities for NSAIPETROSOFT Petroleum Management
 * Ensures dynamic, real-time date formatting (DD-MMM-YYYY and YYYY-MM-DD).
 */

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Returns today's date formatted as DD-MMM-YYYY (e.g., 14-Oct-2026).
 */
export function getTodayErpDate(offsetDays: number = 0): string {
  const d = new Date();
  if (offsetDays !== 0) {
    d.setDate(d.getDate() + offsetDays);
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Returns today's date formatted as YYYY-MM-DD for native HTML date pickers.
 */
export function getTodayIsoDate(offsetDays: number = 0): string {
  const d = new Date();
  if (offsetDays !== 0) {
    d.setDate(d.getDate() + offsetDays);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the first day of the current month formatted as DD-MMM-YYYY (e.g., 01-Oct-2026).
 */
export function getCurrentMonthStartErpDate(): string {
  const d = new Date();
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `01-${month}-${year}`;
}

/**
 * Formats any Date or string to DD-MMM-YYYY.
 */
export function formatErpDate(input?: Date | string | null): string {
  if (!input) return getTodayErpDate();
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}
