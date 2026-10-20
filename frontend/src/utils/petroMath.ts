/**
 * NSAIPETROSOFT Fixed-Point Decimal Math & Forecourt Operational Engine
 * 
 * Enforces Zero Floating-Point Drift across all accounting, forecourt throughput,
 * underground tank calibration, shift reconciliation, and credit limit checks.
 * Uses integer paise (INR ₹) and millilitres (Litres / KL).
 * Half-Up Rounding Rule: Math.round((val + Number.EPSILON) * 100) / 100
 */

// ---------------------------------------------------------------------------
// 1. Fixed-Point Currency Math (INR ₹ - Integer Paise / 2 Decimals)
// ---------------------------------------------------------------------------

export function roundCurrency(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function toPaise(val: number): number {
  return Math.round((val + Number.EPSILON) * 100);
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

export function addCurrency(a: number, b: number): number {
  return fromPaise(toPaise(a) + toPaise(b));
}

export function subCurrency(a: number, b: number): number {
  return fromPaise(toPaise(a) - toPaise(b));
}

export function mulCurrency(amount: number, factor: number): number {
  return roundCurrency(amount * factor);
}

export function sumCurrency(amounts: number[]): number {
  const totalPaise = amounts.reduce((acc, curr) => acc + toPaise(curr || 0), 0);
  return fromPaise(totalPaise);
}

// ---------------------------------------------------------------------------
// 2. Fixed-Point Fuel Volume Math (Litres / Millilitres)
// ---------------------------------------------------------------------------

export function roundVolume(val: number, decimals: number = 2): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

export function toMillilitres(litres: number): number {
  return Math.round((litres + Number.EPSILON) * 1000);
}

export function fromMillilitres(ml: number): number {
  return ml / 1000;
}

export function addVolume(a: number, b: number): number {
  return fromMillilitres(toMillilitres(a) + toMillilitres(b));
}

export function subVolume(a: number, b: number): number {
  return fromMillilitres(toMillilitres(a) - toMillilitres(b));
}

// ---------------------------------------------------------------------------
// 3. Nozzle Meter Totalizer Throughput
// ---------------------------------------------------------------------------

export interface MeterReadingCalculation {
  gross: number;
  net: number;
  amount: number;
  isRollover: boolean;
  isValid: boolean;
  error?: string;
}

export function calcMeterQty(
  opening: number,
  closing: number,
  testing: number = 0,
  isRollover: boolean = false,
  maxDigits: number = 7
): { gross: number; net: number } {
  let gross = 0;
  if (isRollover && closing < opening) {
    const rolloverCap = Math.pow(10, maxDigits);
    gross = (rolloverCap - opening) + closing;
  } else {
    gross = Math.max(0, closing - opening);
  }
  const cleanTesting = Math.max(0, Math.min(testing, gross));
  const net = Math.max(0, gross - cleanTesting);
  return {
    gross: roundVolume(gross, 2),
    net: roundVolume(net, 2),
  };
}

export function validateAndCalcMeterReading(params: {
  opening: number;
  closing: number;
  testing?: number;
  rate: number;
  isRollover?: boolean;
  supervisorPinAuthorized?: boolean;
  maxDigits?: number;
}): MeterReadingCalculation {
  const {
    opening,
    closing,
    testing = 0,
    rate,
    isRollover = false,
    supervisorPinAuthorized = false,
    maxDigits = 7,
  } = params;

  if (closing < opening && !isRollover && !supervisorPinAuthorized) {
    return {
      gross: 0,
      net: 0,
      amount: 0,
      isRollover: false,
      isValid: false,
      error: `Closing meter (${closing}) cannot be less than Opening meter (${opening}) without Rollover toggle or Supervisor PIN override.`,
    };
  }

  const { gross, net } = calcMeterQty(opening, closing, testing, isRollover || (closing < opening && supervisorPinAuthorized), maxDigits);
  const amount = roundCurrency(net * rate);

  return {
    gross,
    net,
    amount,
    isRollover,
    isValid: true,
  };
}

export function calcSaleAmount(litres: number, rate: number): number {
  return roundCurrency(litres * rate);
}

// ---------------------------------------------------------------------------
// 4. Statutory Tax, TDS & OMC Recoveries
// ---------------------------------------------------------------------------

export function calcTaxSplit(
  totalInclusive: number,
  taxPercent: number
): { baseAmount: number; taxAmount: number } {
  if (taxPercent <= 0) {
    return { baseAmount: roundCurrency(totalInclusive), taxAmount: 0 };
  }
  const base = roundCurrency(totalInclusive / (1 + taxPercent / 100));
  const tax = subCurrency(totalInclusive, base);
  return { baseAmount: base, taxAmount: tax };
}

export function calcSec194QTds(
  purchaseAmount: number,
  tdsRatePercent: number = 0.1
): number {
  return roundCurrency((purchaseAmount * tdsRatePercent) / 100);
}

export function calcLfr(volumeLiters: number, ratePerKl: number): number {
  const kl = volumeLiters / 1000;
  return roundCurrency(kl * ratePerKl);
}

// ---------------------------------------------------------------------------
// 5. Underground Tank Calibration & Strapping Chart Interpolation
// ---------------------------------------------------------------------------

export interface StrappingChartPoint {
  dip_mm: number;
  volume_litres: number;
}

/**
 * Standard W&M Strapping Chart Piecewise Linear Interpolation
 * Maps dip reading in millimetres (or cm converted to mm) to calibrated tank volume.
 */
export function interpolateStrappingVolume(
  dipMm: number,
  strappingChart: StrappingChartPoint[],
  maxCapacityLitres: number = 20000
): number {
  if (dipMm <= 0) return 0;
  if (!strappingChart || strappingChart.length === 0) {
    // If no explicit calibration table is provided, use standard horizontal cylinder formula
    return calculateCylindricalTankVolume(dipMm, 2200, maxCapacityLitres);
  }

  const sorted = [...strappingChart].sort((a, b) => a.dip_mm - b.dip_mm);
  if (dipMm <= sorted[0].dip_mm) {
    const ratio = dipMm / sorted[0].dip_mm;
    return roundVolume(Math.max(0, sorted[0].volume_litres * ratio), 2);
  }

  const lastPoint = sorted[sorted.length - 1];
  if (dipMm >= lastPoint.dip_mm) {
    return roundVolume(Math.min(maxCapacityLitres, lastPoint.volume_litres), 2);
  }

  // Find bounding segment
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i + 1];
    if (dipMm >= p1.dip_mm && dipMm <= p2.dip_mm) {
      if (p2.dip_mm === p1.dip_mm) return roundVolume(p1.volume_litres, 2);
      const fraction = (dipMm - p1.dip_mm) / (p2.dip_mm - p1.dip_mm);
      const interpolated = p1.volume_litres + fraction * (p2.volume_litres - p1.volume_litres);
      return roundVolume(Math.min(maxCapacityLitres, Math.max(0, interpolated)), 2);
    }
  }

  return roundVolume(Math.min(maxCapacityLitres, lastPoint.volume_litres), 2);
}

/**
 * Geometric Volume of Horizontal Cylindrical Tank with Diameter D and Capacity V
 */
export function calculateCylindricalTankVolume(
  dipMm: number,
  diameterMm: number = 2200,
  maxCapacityLitres: number = 20000
): number {
  if (dipMm <= 0) return 0;
  if (dipMm >= diameterMm) return maxCapacityLitres;

  const r = diameterMm / 2;
  const h = Math.min(dipMm, diameterMm);

  // Cross-sectional filled area: r^2 * acos((r - h)/r) - (r - h) * sqrt(2*r*h - h^2)
  const term1 = Math.acos((r - h) / r);
  const term2 = (r - h) * Math.sqrt(Math.max(0, 2 * r * h - h * h));
  const filledArea = r * r * term1 - term2;
  const totalArea = Math.PI * r * r;

  const volumeRatio = filledArea / totalArea;
  return roundVolume(Math.min(maxCapacityLitres, maxCapacityLitres * volumeRatio), 2);
}

/**
 * Tank Dip Variance Calculation
 * Variance = Physical Stock - Book Stock
 * Flagging evaporation or handling loss
 */
export function calcDipVariance(
  physicalLitres: number,
  bookLitres: number,
  tankCapacity: number = 20000
): {
  diffLitres: number;
  diffPercent: number;
  isWithinTolerance: boolean;
  status: 'NORMAL' | 'GAIN' | 'LOSS' | 'CRITICAL_LOSS';
} {
  const diff = roundVolume(physicalLitres - bookLitres, 2);
  const percent = bookLitres > 0 ? roundVolume((diff / bookLitres) * 100, 2) : 0;
  // Statutory tolerance threshold: 0.5% of tank capacity or 100 litres
  const toleranceLitres = roundVolume(Math.max(100, tankCapacity * 0.005), 2);
  const isWithinTolerance = Math.abs(diff) <= toleranceLitres;

  let status: 'NORMAL' | 'GAIN' | 'LOSS' | 'CRITICAL_LOSS' = 'NORMAL';
  if (diff > toleranceLitres) {
    status = 'GAIN';
  } else if (diff < -toleranceLitres) {
    status = 'CRITICAL_LOSS';
  } else if (diff < 0) {
    status = 'LOSS';
  }

  return {
    diffLitres: diff,
    diffPercent: percent,
    isWithinTolerance,
    status,
  };
}

export function calcTankUllage(
  capacity: number,
  currentStock: number,
  safeFactor: number = 0.95
): {
  safeUllage: number;
  grossUllage: number;
  fillPercent: number;
} {
  const grossUllage = Math.max(0, roundVolume(capacity - currentStock, 2));
  const safeCapacity = capacity * safeFactor;
  const safeUllage = Math.max(0, roundVolume(safeCapacity - currentStock, 2));
  const fillPercent = capacity > 0 ? roundVolume((currentStock / capacity) * 100, 1) : 0;

  return { safeUllage, grossUllage, fillPercent };
}

/**
 * Decantation Guard: Validates that incoming tanker purchase does not overflow the tank
 */
export interface DecantationValidationResult {
  isValid: boolean;
  safeUllage: number;
  grossUllage: number;
  exceededByLitres: number;
  error?: string;
}

export function validatePurchaseDecantation(
  currentStockLitres: number,
  purchaseQtyLitres: number,
  capacityLitres: number,
  safeFactor: number = 0.95
): DecantationValidationResult {
  const { safeUllage, grossUllage } = calcTankUllage(capacityLitres, currentStockLitres, safeFactor);

  if (purchaseQtyLitres > grossUllage) {
    const overflow = roundVolume(purchaseQtyLitres - grossUllage, 2);
    return {
      isValid: false,
      safeUllage,
      grossUllage,
      exceededByLitres: overflow,
      error: `CRITICAL TANK OVERFLOW: Decanting ${purchaseQtyLitres.toLocaleString()} L into tank with current stock of ${currentStockLitres.toLocaleString()} L exceeds total capacity of ${capacityLitres.toLocaleString()} L by ${overflow.toLocaleString()} Litres!`,
    };
  }

  if (purchaseQtyLitres > safeUllage) {
    const warningLitres = roundVolume(purchaseQtyLitres - safeUllage, 2);
    return {
      isValid: true,
      safeUllage,
      grossUllage,
      exceededByLitres: warningLitres,
      error: `WARNING: Incoming batch exceeds 95% safe filling limit by ${warningLitres.toLocaleString()} L, but fits within gross ullage.`,
    };
  }

  return {
    isValid: true,
    safeUllage,
    grossUllage,
    exceededByLitres: 0,
  };
}

// ---------------------------------------------------------------------------
// 6. Petroleum Density Temperature Conversion (ASTM 53B Standard)
// ---------------------------------------------------------------------------

export function convertDensityTo15C(
  observedDensity: number,
  observedTempC: number,
  productType: 'MS' | 'HSD' = 'HSD'
): {
  density15C: number;
  isWithinStatutoryLimit: (invoiceDensity: number) => { isWithin: boolean; diff: number };
} {
  const alpha = productType === 'MS' ? 0.0012 : 0.0007;
  const tempDiff = observedTempC - 15.0;
  const density15C = roundVolume(observedDensity + (observedDensity * alpha * tempDiff), 1);

  return {
    density15C,
    isWithinStatutoryLimit: (invoiceDensity: number) => {
      const diff = roundVolume(density15C - invoiceDensity, 1);
      // OMC statutory variation threshold is ±3.0 kg/m³
      return {
        isWithin: Math.abs(diff) <= 3.0,
        diff,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// 7. Credit Limit Hardening & Fleet Approval Guards
// ---------------------------------------------------------------------------

export interface CreditValidationResult {
  allowed: boolean;
  requiresSupervisorPin: boolean;
  currentOutstanding: number;
  creditLimit: number;
  proposedSaleAmount: number;
  projectedOutstanding: number;
  excessAmount: number;
  reason?: string;
}

export function validateCreditSaleLimit(
  currentOutstanding: number,
  creditLimit: number,
  proposedSaleAmount: number,
  hasManagerPinOverride: boolean = false
): CreditValidationResult {
  const curOut = roundCurrency(currentOutstanding || 0);
  const limit = roundCurrency(creditLimit || 0);
  const saleAmt = roundCurrency(proposedSaleAmount || 0);
  const projected = roundCurrency(curOut + saleAmt);

  if (limit > 0 && projected > limit) {
    const excess = roundCurrency(projected - limit);
    if (!hasManagerPinOverride) {
      return {
        allowed: false,
        requiresSupervisorPin: true,
        currentOutstanding: curOut,
        creditLimit: limit,
        proposedSaleAmount: saleAmt,
        projectedOutstanding: projected,
        excessAmount: excess,
        reason: `CREDIT LIMIT EXCEEDED: Proposed bill of ₹${saleAmt.toLocaleString('en-IN')} pushes outstanding to ₹${projected.toLocaleString('en-IN')}, exceeding approved limit of ₹${limit.toLocaleString('en-IN')} by ₹${excess.toLocaleString('en-IN')}. Supervisor override PIN required.`,
      };
    }

    return {
      allowed: true,
      requiresSupervisorPin: true,
      currentOutstanding: curOut,
      creditLimit: limit,
      proposedSaleAmount: saleAmt,
      projectedOutstanding: projected,
      excessAmount: excess,
      reason: `CREDIT LIMIT OVERRIDE AUTHORIZED: Bill approved with Supervisor PIN.`,
    };
  }

  return {
    allowed: true,
    requiresSupervisorPin: false,
    currentOutstanding: curOut,
    creditLimit: limit,
    proposedSaleAmount: saleAmt,
    projectedOutstanding: projected,
    excessAmount: 0,
  };
}

// ---------------------------------------------------------------------------
// 8. Shift Cashier Tally (Day Book Reconciliation Formula)
// ---------------------------------------------------------------------------

export interface CashierReconciliationResult {
  totalMeterSales: number;
  creditSales: number;
  digitalSettlements: number;
  shiftExpenses: number;
  creditCollections: number;
  expectedCash: number;
  actualCash: number;
  gapAmount: number;
  status: 'BALANCED' | 'SHORTAGE' | 'EXCESS';
}

/**
 * Reconciles cashier shift collection:
 * Expected Cash = Total Meter Sales - Credit Sales - Digital Cards - Shift Expenses + Credit Collections
 * Gap = Actual Cash - Expected Cash
 */
export function calculateCashierShiftTally(params: {
  meterSales: number;
  creditSales: number;
  digitalCards: number;
  expenses: number;
  creditCollections: number;
  actualCash: number;
}): CashierReconciliationResult {
  const {
    meterSales,
    creditSales,
    digitalCards,
    expenses,
    creditCollections,
    actualCash,
  } = params;

  const totalSales = roundCurrency(meterSales);
  const credit = roundCurrency(creditSales);
  const digital = roundCurrency(digitalCards);
  const exp = roundCurrency(expenses);
  const recovery = roundCurrency(creditCollections);
  const actual = roundCurrency(actualCash);

  // Expected Cash calculation
  const expected = roundCurrency(totalSales - credit - digital - exp + recovery);
  const gap = roundCurrency(actual - expected);

  let status: 'BALANCED' | 'SHORTAGE' | 'EXCESS' = 'BALANCED';
  if (gap < -1.0) {
    status = 'SHORTAGE';
  } else if (gap > 1.0) {
    status = 'EXCESS';
  }

  return {
    totalMeterSales: totalSales,
    creditSales: credit,
    digitalSettlements: digital,
    shiftExpenses: exp,
    creditCollections: recovery,
    expectedCash: expected,
    actualCash: actual,
    gapAmount: gap,
    status,
  };
}

// ---------------------------------------------------------------------------
// 9. Currency Denominations Total
// ---------------------------------------------------------------------------

export function calcDenominationsTotal(denoms: {
  n2000?: number;
  n500?: number;
  n200?: number;
  n100?: number;
  n50?: number;
  n20?: number;
  n10?: number;
  n5?: number;
  coins?: number;
}): number {
  const total =
    (denoms.n2000 || 0) * 2000 +
    (denoms.n500 || 0) * 500 +
    (denoms.n200 || 0) * 200 +
    (denoms.n100 || 0) * 100 +
    (denoms.n50 || 0) * 50 +
    (denoms.n20 || 0) * 20 +
    (denoms.n10 || 0) * 10 +
    (denoms.n5 || 0) * 5 +
    (denoms.coins || 0) * 1;
  return roundCurrency(total);
}



/**
 * Generic denomination total (Record<faceValue, count> overload)
 * e.g. { 500: 2, 100: 3 } → 1300
 * Use calcDenominationsTotal for the named INR denomination helper.
 */
export function calcDenominationsTotalFromRecord(denomRecord: Record<number, number>): number {
  const total = Object.entries(denomRecord).reduce(
    (sum, [face, count]) => sum + Number(face) * (count || 0),
    0
  );
  return roundCurrency(total);
}
