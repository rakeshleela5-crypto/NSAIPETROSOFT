/**
 * NSAIPETROSOFT Exact Decimal & Forecourt Math Engine
 * 
 * Enforces Zero Floating-Point Drift using integer paise (INR ₹)
 * and millilitres (Litres / KL).
 * Uses Half-Up rounding: Math.round((val + Number.EPSILON) * 100) / 100
 */

// ---------------------------------------------------------------------------
// Currency Arithmetic (INR ₹ - 2 Decimals / Integer Paise)
// ---------------------------------------------------------------------------

/**
 * Rounds a number to exactly 2 decimal places using Half-Up rounding
 */
export function roundCurrency(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Converts INR to integer paise (e.g. 102.65 -> 10265)
 */
export function toPaise(val: number): number {
  return Math.round((val + Number.EPSILON) * 100);
}

/**
 * Converts integer paise back to INR currency (e.g. 10265 -> 102.65)
 */
export function fromPaise(paise: number): number {
  return paise / 100;
}

/**
 * Precise currency addition
 */
export function addCurrency(a: number, b: number): number {
  return fromPaise(toPaise(a) + toPaise(b));
}

/**
 * Precise currency subtraction
 */
export function subCurrency(a: number, b: number): number {
  return fromPaise(toPaise(a) - toPaise(b));
}

/**
 * Precise currency multiplication (e.g., litres * rate)
 */
export function mulCurrency(amount: number, factor: number): number {
  return roundCurrency(amount * factor);
}

/**
 * Sum an array of currency amounts safely
 */
export function sumCurrency(amounts: number[]): number {
  const totalPaise = amounts.reduce((acc, curr) => acc + toPaise(curr || 0), 0);
  return fromPaise(totalPaise);
}

// ---------------------------------------------------------------------------
// Fuel Volume Arithmetic (Litres / KL - 2 to 3 Decimals / Millilitres)
// ---------------------------------------------------------------------------

/**
 * Rounds fuel volume to specified decimal places (default 2, up to 3 for millilitres)
 */
export function roundVolume(val: number, decimals: number = 2): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Converts litres to millilitres integer
 */
export function toMillilitres(litres: number): number {
  return Math.round((litres + Number.EPSILON) * 1000);
}

/**
 * Converts millilitres integer back to litres
 */
export function fromMillilitres(ml: number): number {
  return ml / 1000;
}

/**
 * Precise volume addition
 */
export function addVolume(a: number, b: number): number {
  return fromMillilitres(toMillilitres(a) + toMillilitres(b));
}

/**
 * Precise volume subtraction
 */
export function subVolume(a: number, b: number): number {
  return fromMillilitres(toMillilitres(a) - toMillilitres(b));
}

// ---------------------------------------------------------------------------
// Forecourt Domain Calculation Functions
// ---------------------------------------------------------------------------

/**
 * Calculate net meter quantity:
 * Gross = Closing - Opening (or rollover handled)
 * Net = Gross - Testing
 */
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

/**
 * Calculate sale amount from volume and rate
 */
export function calcSaleAmount(litres: number, rate: number): number {
  return roundCurrency(litres * rate);
}

/**
 * Calculate tax split (VAT/GST) from inclusive amount
 * Base = Amount / (1 + Rate / 100)
 * Tax = Amount - Base
 */
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

/**
 * Section 194Q TDS: 0.1% on purchase value exceeding statutory threshold
 */
export function calcSec194QTds(
  purchaseAmount: number,
  tdsRatePercent: number = 0.1
): number {
  return roundCurrency((purchaseAmount * tdsRatePercent) / 100);
}

/**
 * License Fee Recovery (LFR) Calculation
 */
export function calcLfr(volumeLiters: number, ratePerKl: number): number {
  const kl = volumeLiters / 1000;
  return roundCurrency(kl * ratePerKl);
}

/**
 * Tank Dip Variance Calculation:
 * Variance = Physical Stock - Book Stock
 * Allowed daily tolerance: 0.05% of throughput or 0.5% of tank capacity
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
  // Statutory threshold: 0.5% of tank capacity or 100 litres
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

/**
 * Tank Ullage (Remaining safe empty space)
 */
export function calcTankUllage(capacity: number, currentStock: number, safeFactor: number = 0.95): {
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
 * Convert observed density and temperature to standard density at 15°C
 * ASTM 53B Table Approximation for Petroleum Products (MS & HSD)
 * MS Alpha approx: 0.0012 / °C
 * HSD Alpha approx: 0.0007 / °C
 */
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
      // OMC statutory tolerance is ±3.0 kg/m³
      return {
        isWithin: Math.abs(diff) <= 3.0,
        diff,
      };
    },
  };
}

/**
 * Currency Denomination Calculator
 */
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
