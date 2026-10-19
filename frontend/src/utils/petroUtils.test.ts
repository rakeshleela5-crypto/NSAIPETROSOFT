import { describe, it, expect } from 'vitest';
import {
  roundCurrency,
  roundVolume,
  safeAdd,
  safeSubtract,
  safeMultiply,
  safeDivide,
  calculateNetMeterQty,
  validateMeterReading,
  validateCreditSaleInputs,
} from './petroUtils';

describe('Petroleum Domain Precision Math (QA-04)', () => {
  it('eliminates raw IEEE-754 floating point drift for currency', () => {
    // Classic IEEE 754 float failure: 0.1 + 0.2 = 0.30000000000000004
    const rawSum = 0.1 + 0.2;
    expect(rawSum).not.toBe(0.3);
    expect(roundCurrency(rawSum)).toBe(0.3);
    expect(safeAdd(0.1, 0.2)).toBe(0.3);
  });

  it('correctly rounds currency to 2 decimal places with half-up epsilon rounding', () => {
    expect(roundCurrency(10.005)).toBe(10.01);
    expect(roundCurrency(10.004)).toBe(10.00);
    expect(roundCurrency(95.75 * 12.33)).toBe(1180.60);
  });

  it('correctly rounds fuel volume to 3 decimal places', () => {
    expect(roundVolume(123.4567)).toBe(123.457);
    expect(roundVolume(50.0004)).toBe(50.0);
    expect(roundVolume(0.0006)).toBe(0.001);
  });

  it('performs safe subtraction without precision bleed', () => {
    // 0.3 - 0.1 often yields 0.19999999999999998
    expect(safeSubtract(0.3, 0.1)).toBe(0.2);
    expect(safeSubtract(1000.55, 500.25)).toBe(500.3);
  });

  it('performs safe multiplication and handles zero gracefully', () => {
    expect(safeMultiply(50.5, 96.42)).toBe(4869.21);
    expect(safeMultiply(0, 96.42)).toBe(0);
  });

  it('safely guards against divide-by-zero errors', () => {
    expect(safeDivide(100, 0)).toBe(0);
    expect(safeDivide(100, 3)).toBe(33.33);
  });
});

describe('Nozzle Totalizer Meter Reading & Rollover Calculations (QA-04 & QA-07)', () => {
  it('calculates standard net meter quantity deducting calibration test fuel', () => {
    const net = calculateNetMeterQty(1000.0, 1250.0, 5.0);
    expect(net).toBe(245.0);
  });

  it('handles dispenser totalizer rollover seamlessly (e.g. 999950.0 -> 45.0)', () => {
    // 6-digit totalizer flips from 999950 to 000045 => (1,000,000 - 999950) + 45 = 95L
    const net = calculateNetMeterQty(999950.0, 45.0, 0, true, 6);
    expect(net).toBe(95.0);
  });

  it('deducts testing fuel accurately after rollover', () => {
    const net = calculateNetMeterQty(999950.0, 45.0, 5.0, true, 6);
    expect(net).toBe(90.0);
  });

  it('validates normal meter readings successfully', () => {
    const res = validateMeterReading(1000.0, 1500.0, false, 5.0);
    expect(res.isValid).toBe(true);
    expect(res.netQty).toBe(495.0);
    expect(res.rawDiff).toBe(500.0);
  });

  it('rejects closing meter less than opening meter without rollover flag', () => {
    const res = validateMeterReading(500.0, 450.0, false);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('less than Opening meter');
  });

  it('rejects negative meter inputs', () => {
    const res = validateMeterReading(-10.0, 100.0);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('cannot be negative');
  });

  it('rejects calibration testing fuel greater than total throughput', () => {
    const res = validateMeterReading(100.0, 105.0, false, 10.0);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('exceeds total meter throughput');
  });
});

describe('Credit Customer Fuel Sale Validation & Balances (QA-07)', () => {
  it('validates a correct credit sale and computes net dues', () => {
    const res = validateCreditSaleInputs(50.0, 95.0, 0, 0, 50000, 10000);
    expect(res.isValid).toBe(true);
    expect(res.grossAmount).toBe(4750.0);
    expect(res.netAmount).toBe(4750.0);
    expect(res.creditAmount).toBe(4750.0);
    expect(res.newOutstanding).toBe(14750.0);
    expect(res.exceedsLimit).toBe(false);
  });

  it('applies percentage discounts and partial cash payments accurately', () => {
    // 100L @ ₹100 = ₹10,000. 5% discount = ₹500. Net = ₹9,500. Cash paid = ₹2,000. Net Credit = ₹7,500.
    const res = validateCreditSaleInputs(100.0, 100.0, 5, 2000.0, 50000, 5000);
    expect(res.isValid).toBe(true);
    expect(res.grossAmount).toBe(10000.0);
    expect(res.discountAmount).toBe(500.0);
    expect(res.netAmount).toBe(9500.0);
    expect(res.creditAmount).toBe(7500.0);
    expect(res.newOutstanding).toBe(12500.0);
    expect(res.exceedsLimit).toBe(false);
  });

  it('detects credit limit breaches', () => {
    // Current dues: ₹48,000. Limit: ₹50,000. New credit: ₹4,750. New dues: ₹52,750 > ₹50,000.
    const res = validateCreditSaleInputs(50.0, 95.0, 0, 0, 50000, 48000);
    expect(res.isValid).toBe(true);
    expect(res.exceedsLimit).toBe(true);
    expect(res.newOutstanding).toBe(52750.0);
  });

  it('rejects zero or negative fuel quantities', () => {
    const res = validateCreditSaleInputs(0, 95.0);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('greater than zero');
  });

  it('rejects invalid discount percentages outside 0-100%', () => {
    const res = validateCreditSaleInputs(50.0, 95.0, 120);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('between 0% and 100%');
  });

  it('rejects cash paid exceeding net bill amount', () => {
    const res = validateCreditSaleInputs(10.0, 100.0, 0, 1500.0);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('cannot exceed net bill amount');
  });
});
