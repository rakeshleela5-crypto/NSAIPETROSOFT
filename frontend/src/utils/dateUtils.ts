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
 * Formats any Date or string to DD-MMM-YYYY for receipts, thermal printouts, and reports.
 * Seamlessly handles YYYY-MM-DD ISO strings, Date instances, and DD-MMM-YYYY strings.
 */
export function formatErpDate(input?: Date | string | null): string {
  if (!input) return getTodayErpDate();
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(trimmed)) {
      return trimmed;
    }
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const year = isoMatch[1];
      const monthIdx = parseInt(isoMatch[2], 10) - 1;
      const day = isoMatch[3];
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${day}-${MONTH_NAMES[monthIdx]}-${year}`;
      }
    }
  }
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Returns the first day of the current month formatted as YYYY-MM-DD (e.g. 2026-10-01).
 */
export function getCurrentMonthStartIsoDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

/**
 * Converts any date representation (DD-MMM-YYYY, ISO string, timestamp) into
 * strict YYYY-MM-DD format mandated by HTML5 <input type="date"> elements.
 * Eliminates browser format warnings.
 */
export function toIsoDate(val?: string | null): string {
  if (!val) return getTodayIsoDate();
  const trimmed = val.trim();
  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // If DD-MMM-YYYY (e.g. 21-Oct-2026)
  const parts = trimmed.split('-');
  if (parts.length === 3 && parts[1].length === 3) {
    const monthIdx = MONTH_NAMES.indexOf(parts[1]);
    if (monthIdx !== -1) {
      const day = parts[0].padStart(2, '0');
      const month = String(monthIdx + 1).padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
  }

  // Fallback via standard Date constructor
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return getTodayIsoDate();
}
