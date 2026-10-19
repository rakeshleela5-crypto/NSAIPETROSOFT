/**
 * NSAIPETROSOFT Petroleum Domain Calculations & Precision Math
 * Standardized across Shift Sales, DSM Settlement, Tank Dips, and Crystal Reports.
 * Eliminates IEEE-754 floating point rounding drift (e.g. 0.1 + 0.2 = 0.30000000000000004).
 */

/**
 * Rounds a currency amount to exact 2 decimal places using Number.EPSILON
 */
export function roundCurrency(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Rounds a volume/liters/meter reading to exact 3 decimal places using Number.EPSILON
 */
export function roundVolume(liters: number): number {
  if (!Number.isFinite(liters)) return 0;
  const rounded = Math.round((liters + Number.EPSILON) * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Safely adds numbers eliminating floating point rounding noise
 */
export function safeAdd(...nums: number[]): number {
  const sum = nums.reduce((acc, curr) => {
    const val = Number.isFinite(curr) ? curr : 0;
    return acc + Math.round((val + Number.EPSILON) * 10000);
  }, 0);
  return roundCurrency(sum / 10000);
}

/**
 * Safely subtracts b from a with specified decimal precision
 */
export function safeSubtract(a: number, b: number, decimals: 2 | 3 = 2): number {
  const factor = decimals === 3 ? 1000 : 100;
  const valA = Number.isFinite(a) ? a : 0;
  const valB = Number.isFinite(b) ? b : 0;
  const diff = Math.round((valA + Number.EPSILON) * factor) - Math.round((valB + Number.EPSILON) * factor);
  const result = diff / factor;
  return decimals === 3 ? roundVolume(result) : roundCurrency(result);
}

/**
 * Safely multiplies two numbers (e.g. Qty × Rate) with exact rounding
 */
export function safeMultiply(a: number, b: number, decimals: 2 | 3 = 2): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const product = a * b;
  return decimals === 3 ? roundVolume(product) : roundCurrency(product);
}

/**
 * Safely divides two numbers, guarding against divide-by-zero
 */
export function safeDivide(numerator: number, denominator: number, decimals: 2 | 3 = 2): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  const quotient = numerator / denominator;
  return decimals === 3 ? roundVolume(quototientSafe(quotient)) : roundCurrency(quototientSafe(quotient));
}

function quototientSafe(q: number): number {
  return Number.isFinite(q) ? q : 0;
}

/**
 * Calculates net meter sales quantity taking into account:
 * 1. Testing fuel (5L/10L calibration test poured back to underground tank)
 * 2. Mechanical/electronic dispenser totalizer rollover (e.g. 999950.0 -> 45.0)
 */
export function calculateNetMeterQty(
  openingMeter: number,
  closingMeter: number,
  testingQty: number = 0,
  isRollover: boolean = false,
  maxDigits: number = 6
): number {
  if (openingMeter < 0 || closingMeter < 0) return 0;

  let rawDiff = closingMeter - openingMeter;
  if (isRollover || rawDiff < 0) {
    const digits = [5, 6, 7, 8].includes(maxDigits) ? maxDigits : 6;
    const rolloverLimit = Math.pow(10, digits);
    rawDiff = (rolloverLimit - openingMeter) + closingMeter;
  }

  const validDiff = Math.max(0, rawDiff);
  const net = Math.max(0, validDiff - Math.max(0, testingQty));
  return roundVolume(net);
}

export interface MeterValidationResult {
  isValid: boolean;
  error?: string;
  netQty: number;
  rawDiff: number;
}

/**
 * Enforces strict validation for nozzle totalizer meter inputs
 */
export function validateMeterReading(
  openingMeter: number,
  closingMeter: number,
  isRollover: boolean = false,
  testingQty: number = 0,
  maxDigits: number = 6
): MeterValidationResult {
  if (!Number.isFinite(openingMeter) || openingMeter < 0) {
    return { isValid: false, error: 'Opening meter reading cannot be negative or empty', netQty: 0, rawDiff: 0 };
  }
  if (!Number.isFinite(closingMeter) || closingMeter < 0) {
    return { isValid: false, error: 'Closing meter reading cannot be negative or empty', netQty: 0, rawDiff: 0 };
  }
  if (!Number.isFinite(testingQty) || testingQty < 0) {
    return { isValid: false, error: 'Testing quantity cannot be negative', netQty: 0, rawDiff: 0 };
  }

  if (closingMeter < openingMeter && !isRollover) {
    return {
      isValid: false,
      error: `Closing meter (${closingMeter.toFixed(2)}) is less than Opening meter (${openingMeter.toFixed(2)}). If the totalizer rolled over 999999 to 000000, enable the 'Meter Rollover' checkbox.`,
      netQty: 0,
      rawDiff: closingMeter - openingMeter,
    };
  }

  const netQty = calculateNetMeterQty(openingMeter, closingMeter, testingQty, isRollover, maxDigits);
  const rawDiff = isRollover
    ? (Math.pow(10, maxDigits) - openingMeter) + closingMeter
    : closingMeter - openingMeter;

  if (testingQty > rawDiff) {
    return {
      isValid: false,
      error: `Testing fuel (${testingQty.toFixed(2)} Ltr) exceeds total meter throughput (${rawDiff.toFixed(2)} Ltr).`,
      netQty: 0,
      rawDiff,
    };
  }

  return { isValid: true, netQty, rawDiff };
}

export interface CreditSaleValidationResult {
  isValid: boolean;
  error?: string;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  creditAmount: number;
  newOutstanding: number;
  exceedsLimit: boolean;
}

/**
 * Strict validation and precision computation for Credit Customer & Vehicle fuel sales
 */
export function validateCreditSaleInputs(
  qty: number,
  rate: number,
  discountPercent: number = 0,
  cashPaid: number = 0,
  creditLimit: number = 0,
  currentOutstanding: number = 0
): CreditSaleValidationResult {
  if (!Number.isFinite(qty) || qty <= 0) {
    return {
      isValid: false,
      error: 'Fuel quantity must be greater than zero',
      grossAmount: 0,
      discountAmount: 0,
      netAmount: 0,
      creditAmount: 0,
      newOutstanding: currentOutstanding,
      exceedsLimit: false,
    };
  }

  if (!Number.isFinite(rate) || rate <= 0) {
    return {
      isValid: false,
      error: 'Fuel unit rate must be greater than zero',
      grossAmount: 0,
      discountAmount: 0,
      netAmount: 0,
      creditAmount: 0,
      newOutstanding: currentOutstanding,
      exceedsLimit: false,
    };
  }

  if (discountPercent < 0 || discountPercent > 100) {
    return {
      isValid: false,
      error: 'Discount percentage must be between 0% and 100%',
      grossAmount: 0,
      discountAmount: 0,
      netAmount: 0,
      creditAmount: 0,
      newOutstanding: currentOutstanding,
      exceedsLimit: false,
    };
  }

  if (cashPaid < 0) {
    return {
      isValid: false,
      error: 'Cash paid amount cannot be negative',
      grossAmount: 0,
      discountAmount: 0,
      netAmount: 0,
      creditAmount: 0,
      newOutstanding: currentOutstanding,
      exceedsLimit: false,
    };
  }

  const grossAmount = safeMultiply(qty, rate, 2);
  const discountAmount = roundCurrency((grossAmount * discountPercent) / 100);
  const netAmount = safeSubtract(grossAmount, discountAmount, 2);

  if (cashPaid > netAmount) {
    return {
      isValid: false,
      error: `Cash paid (₹${cashPaid.toFixed(2)}) cannot exceed net bill amount (₹${netAmount.toFixed(2)})`,
      grossAmount,
      discountAmount,
      netAmount,
      creditAmount: 0,
      newOutstanding: currentOutstanding,
      exceedsLimit: false,
    };
  }

  const creditAmount = safeSubtract(netAmount, cashPaid, 2);
  const newOutstanding = safeAdd(currentOutstanding, creditAmount);
  const exceedsLimit = creditLimit > 0 && newOutstanding > creditLimit;

  return {
    isValid: true,
    grossAmount,
    discountAmount,
    netAmount,
    creditAmount,
    newOutstanding,
    exceedsLimit,
  };
}
