import { describe, it, expect } from 'vitest';
import {
  roundCurrency,
  toPaise,
  fromPaise,
  addCurrency,
  subCurrency,
  mulCurrency,
  roundVolume,
  calcMeterQty,
  calcSaleAmount,
  calcTaxSplit,
  calcSec194QTds,
  calcLfr,
  calcDipVariance,
  calcTankUllage,
  convertDensityTo15C,
  calcDenominationsTotalFromRecord,
  interpolateStrappingVolume,
  calculateCylindricalTankVolume,
  validatePurchaseDecantation,
  validateCreditSaleLimit,
  calculateCashierShiftTally,
  validateAndCalcMeterReading,
} from './petroMath';

describe('petroMath - Fixed-Point Decimal Math & Forecourt Operations', () => {
  it('correctly rounds currency using Half-Up rounding without floating point drift', () => {
    expect(roundCurrency(102.655)).toBe(102.66);
    expect(roundCurrency(102.654)).toBe(102.65);
    expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
  });

  it('converts to/from paise reliably', () => {
    expect(toPaise(96.72)).toBe(9672);
    expect(fromPaise(9672)).toBe(96.72);
    expect(addCurrency(100.15, 200.25)).toBe(300.4);
    expect(subCurrency(500.0, 123.45)).toBe(376.55);
    expect(mulCurrency(45.5, 96.72)).toBe(4400.76);
  });

  it('calculates net meter volume with testing and rollover support', () => {
    // Normal case
    const normal = calcMeterQty(12500.5, 12750.5, 10.0);
    expect(normal.gross).toBe(250.0);
    expect(normal.net).toBe(240.0);

    // Rollover case (e.g. meter exceeded 999999.9)
    const rollover = calcMeterQty(999950.0, 50.0, 0, true, 6);
    expect(rollover.gross).toBe(100.0);
    expect(rollover.net).toBe(100.0);
  });

  it('enforces closing >= opening validation or requires supervisor PIN override', () => {
    const invalid = validateAndCalcMeterReading({
      opening: 1000,
      closing: 900,
      rate: 96.72,
    });
    expect(invalid.isValid).toBe(false);
    expect(invalid.error).toContain('Supervisor PIN override');

    const authorized = validateAndCalcMeterReading({
      opening: 1000,
      closing: 900,
      rate: 96.72,
      supervisorPinAuthorized: true,
      isRollover: true,
    });
    expect(authorized.isValid).toBe(true);
  });

  it('calculates tax split, Section 194Q TDS, and LFR recoveries', () => {
    const tax = calcTaxSplit(1000.0, 18.0);
    expect(tax.baseAmount).toBe(847.46);
    expect(tax.taxAmount).toBe(152.54);

    const tds = calcSec194QTds(1200000);
    expect(tds).toBe(1200.0);

    const lfr = calcLfr(12000, 450); // 12 KL * 450
    expect(lfr).toBe(5400.0);
  });

  it('interpolates tank strapping chart accurately', () => {
    const strappingChart = [
      { dip_mm: 0, volume_litres: 0 },
      { dip_mm: 500, volume_litres: 3200 },
      { dip_mm: 1000, volume_litres: 8500 },
      { dip_mm: 1500, volume_litres: 14500 },
      { dip_mm: 2000, volume_litres: 20000 },
    ];

    expect(interpolateStrappingVolume(0, strappingChart, 20000)).toBe(0);
    expect(interpolateStrappingVolume(500, strappingChart, 20000)).toBe(3200);
    // Midpoint between 500 and 1000 mm (750 mm)
    expect(interpolateStrappingVolume(750, strappingChart, 20000)).toBe(5850);
    expect(interpolateStrappingVolume(2200, strappingChart, 20000)).toBe(20000);
  });

  it('calculates cylindrical horizontal tank volume', () => {
    const half = calculateCylindricalTankVolume(1100, 2200, 20000);
    // At half height, a symmetric horizontal cylinder should be at 50% capacity = 10,000 L
    expect(Math.round(half)).toBe(10000);
  });

  it('calculates dip variance and status flags', () => {
    const normal = calcDipVariance(14250, 14260, 20000); // 10L variance on 20,000L tank
    expect(normal.diffLitres).toBe(-10);
    expect(normal.isWithinTolerance).toBe(true);
    expect(normal.status).toBe('LOSS');

    const critical = calcDipVariance(13000, 14260, 20000); // 1260L variance
    expect(critical.isWithinTolerance).toBe(false);
    expect(critical.status).toBe('CRITICAL_LOSS');
  });

  it('validates tanker purchase decantation and prevents overflow', () => {
    // Current stock: 15,000L, Capacity: 20,000L. Gross ullage: 5,000L.
    // Incoming 6,000L should fail with overflow guard!
    const overflow = validatePurchaseDecantation(15000, 6000, 20000);
    expect(overflow.isValid).toBe(false);
    expect(overflow.error).toContain('CRITICAL TANK OVERFLOW');

    // Incoming 3,000L fits comfortably within safe ullage (19,000 - 15,000 = 4,000 safe ullage)
    const valid = validatePurchaseDecantation(15000, 3000, 20000);
    expect(valid.isValid).toBe(true);
    expect(valid.exceededByLitres).toBe(0);
  });

  it('enforces strict credit limit validation and requires supervisor PIN', () => {
    // Customer has 40,000 outstanding, limit is 50,000.
    // Proposed bill of 15,000 pushes outstanding to 55,000 (exceeds limit by 5,000).
    const blocked = validateCreditSaleLimit(40000, 50000, 15000, false);
    expect(blocked.allowed).toBe(false);
    expect(blocked.requiresSupervisorPin).toBe(true);
    expect(blocked.excessAmount).toBe(5000);

    const overridden = validateCreditSaleLimit(40000, 50000, 15000, true);
    expect(overridden.allowed).toBe(true);
    expect(overridden.reason).toContain('OVERRIDE AUTHORIZED');
  });

  it('exercises remaining utility helpers (roundVolume, calcSaleAmount, calcTankUllage, convertDensityTo15C, calcDenominationsTotalFromRecord)', () => {
    // roundVolume: rounds to 3 decimal places when explicitly passed
    expect(roundVolume(12.34567, 3)).toBe(12.346);

    // calcSaleAmount: qty (L) × rate (₹/L) rounded to 2 dp
    expect(calcSaleAmount(10.5, 96.72)).toBe(1015.56);

    // calcTankUllage(capacity, currentStock): grossUllage = 20000-8000 = 12000; fillPercent = 40
    const ullage = calcTankUllage(20000, 8000);
    expect(ullage.grossUllage).toBe(12000);
    expect(ullage.fillPercent).toBe(40);

    // convertDensityTo15C: returns { density15C, isWithinStatutoryLimit }
    const densityResult = convertDensityTo15C(835, 30);
    expect(densityResult.density15C).toBeGreaterThan(0);

    // calcDenominationsTotalFromRecord: 500×2 + 100×3 + 50×1 = 1350
    const denomTotal = calcDenominationsTotalFromRecord({ 500: 2, 100: 3, 50: 1 });
    expect(denomTotal).toBe(1350);
  });

  it('reconciles shift cashier day book tally', () => {
    // Sales: 50,000, Credit: 10,000, Digital Cards: 15,000, Expenses: 1,000, Collections: 5,000
    // Expected Cash = 50,000 - 10,000 - 15,000 - 1,000 + 5,000 = 29,000
    const balanced = calculateCashierShiftTally({
      meterSales: 50000,
      creditSales: 10000,
      digitalCards: 15000,
      expenses: 1000,
      creditCollections: 5000,
      actualCash: 29000,
    });
    expect(balanced.expectedCash).toBe(29000);
    expect(balanced.gapAmount).toBe(0);
    expect(balanced.status).toBe('BALANCED');

    const shortage = calculateCashierShiftTally({
      meterSales: 50000,
      creditSales: 10000,
      digitalCards: 15000,
      expenses: 1000,
      creditCollections: 5000,
      actualCash: 28500, // 500 short
    });
    expect(shortage.gapAmount).toBe(-500);
    expect(shortage.status).toBe('SHORTAGE');
  });
});
