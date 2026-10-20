import { describe, it, expect } from 'vitest';
import {
  roundCurrency,
  toPaise,
  fromPaise,
  addCurrency,
  subCurrency,
  sumCurrency,
  calcMeterQty,
  calcSaleAmount,
  calcTaxSplit,
  calcSec194QTds,
  calcLfr,
  calcDipVariance,
  calcTankUllage,
  convertDensityTo15C,
  calcDenominationsTotal,
} from './mathEngine';

describe('mathEngine - Zero Floating-Point Drift & Half-Up Rounding', () => {
  it('correctly rounds currency using Half-Up rounding without float drift', () => {
    // 0.1 + 0.2 in JS is 0.30000000000000004
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(addCurrency(0.1, 0.2)).toBe(0.3);

    expect(roundCurrency(102.654)).toBe(102.65);
    expect(roundCurrency(102.655)).toBe(102.66);
    expect(roundCurrency(102.656)).toBe(102.66);
  });

  it('accurately converts to and from integer paise', () => {
    expect(toPaise(102.65)).toBe(10265);
    expect(fromPaise(10265)).toBe(102.65);
  });

  it('accurately adds and subtracts currencies', () => {
    expect(addCurrency(14500.5, 2300.25)).toBe(16800.75);
    expect(subCurrency(100.0, 99.99)).toBe(0.01);
  });

  it('accurately sums currency arrays', () => {
    expect(sumCurrency([10.05, 20.1, 30.15, 0.7])).toBe(61.0);
  });

  it('calculates net meter volume with rollover and testing deductions', () => {
    // Normal case
    const normal = calcMeterQty(1000.0, 1550.5, 10.0);
    expect(normal.gross).toBe(550.5);
    expect(normal.net).toBe(540.5);

    // Rollover case
    const rollover = calcMeterQty(999990.0, 10.0, 5.0, true, 6);
    expect(rollover.gross).toBe(20.0);
    expect(rollover.net).toBe(15.0);
  });

  it('calculates sale amounts accurately', () => {
    expect(calcSaleAmount(20.0, 102.65)).toBe(2053.0);
    expect(calcSaleAmount(33.333, 94.5)).toBe(3149.97); // 33.333 * 94.5 = 3149.9685 -> 3149.97
  });

  it('calculates tax split (VAT/GST) accurately', () => {
    const split = calcTaxSplit(1000, 18);
    // 1000 / 1.18 = 847.4576... -> 847.46
    expect(split.baseAmount).toBe(847.46);
    expect(split.taxAmount).toBe(152.54);
    expect(addCurrency(split.baseAmount, split.taxAmount)).toBe(1000);
  });

  it('computes Sec 194Q TDS (0.1%) accurately', () => {
    expect(calcSec194QTds(1000000)).toBe(1000.0);
    expect(calcSec194QTds(874240.32)).toBe(874.24);
  });

  it('computes LFR accurately', () => {
    expect(calcLfr(12000, 450)).toBe(5400.0);
  });

  it('computes dip variance and tolerance alerts', () => {
    const normal = calcDipVariance(9980, 10000, 20000);
    expect(normal.diffLitres).toBe(-20);
    expect(normal.isWithinTolerance).toBe(true);

    const highLoss = calcDipVariance(9800, 10000, 20000);
    expect(highLoss.diffLitres).toBe(-200);
    expect(highLoss.isWithinTolerance).toBe(false);
    expect(highLoss.status).toBe('CRITICAL_LOSS');
  });

  it('computes tank ullage and fill percent', () => {
    const ullage = calcTankUllage(20000, 15000);
    expect(ullage.grossUllage).toBe(5000);
    expect(ullage.safeUllage).toBe(4000); // 95% is 19000, 19000 - 15000 = 4000
    expect(ullage.fillPercent).toBe(75);
  });

  it('converts density to 15C and verifies statutory tolerance', () => {
    const { density15C, isWithinStatutoryLimit } = convertDensityTo15C(825.0, 25.0, 'HSD');
    expect(density15C).toBeGreaterThan(825.0);
    const check = isWithinStatutoryLimit(830.0);
    expect(typeof check.isWithin).toBe('boolean');
  });

  it('calculates currency denominations accurately', () => {
    const total = calcDenominationsTotal({
      n500: 10,
      n200: 5,
      n100: 10,
      coins: 25,
    });
    // 5000 + 1000 + 1000 + 25 = 7025
    expect(total).toBe(7025);
  });
});
