/**
 * NSAIPETROSOFT Petroleum Domain Calculations
 * Standardized across Shift Sales, DSM Settlement, and Crystal Reports.
 */

/**
 * Calculates net meter sales quantity taking into account:
 * 1. Testing fuel (5L/10L calibration test poured back to underground tank)
 * 2. Mechanical/electronic dispenser totalizer rollover (e.g. 999950.0 -> 45.0)
 */
export function calculateNetMeterQty(
  openingMeter: number,
  closingMeter: number,
  testingQty: number = 0
): number {
  let diff = closingMeter - openingMeter;
  if (diff < 0 && openingMeter > 0) {
    // Dispenser totalizer rollover detection
    const rolloverLimit =
      openingMeter >= 900000
        ? 1000000
        : openingMeter >= 90000
        ? 100000
        : 10000000;
    diff = rolloverLimit - openingMeter + closingMeter;
  }
  return Math.max(0, parseFloat((diff - testingQty).toFixed(2)));
}
