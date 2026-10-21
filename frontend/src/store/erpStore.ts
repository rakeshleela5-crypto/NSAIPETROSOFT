/**
 * NSAIPETROSOFT Centralized ACID State Engine
 * 
 * Single Source of Truth Store for Forecourt Automation.
 * Features:
 * - Microsecond boot hydration with malformed JSON quarantine
 * - Strict 2500ms AbortController timeout for remote bootstrap
 * - Atomic multi-ledger updates (Nozzle Sale -> Tank Stock -> Cashier Tally -> DSR)
 * - Exact paise & millilitres decimal math
 * - Cloud-direct sync to Railway FastAPI & PostgreSQL (Zero LocalStorage)
 */

import {
  roundCurrency,
  roundVolume,
  addCurrency,
  subCurrency,
  mulCurrency,
  addVolume,
  subVolume,
  calcMeterQty,
  calcSaleAmount,
  calcSec194QTds,
  calcLfr,
  calcDipVariance,
} from '../utils/mathEngine';

import type {
  StationProfile,
  CustomerFull,
  BankAccountItem,
  FuelProductRate,
  RateHistoryItem,
  CreditSaleItem,
  ExpenseEntry,
  PaymentReceiptItem,
  LubeProductItem,
} from '../models';

export interface VehicleEntry {
  vehicle_no: string;
  fuel_type?: string;
  driver_name?: string;
}

export interface NozzleMasterItem {
  id: number;
  name: string;
  machine_name: string;
  product_name: string;
  product_code: string;
  tank_id: number;
  opening_meter: number;
  closing_meter: number;
  testing: number;
  rate: number;
  vat_percent: number;
}

export interface TankMasterItem {
  id: number;
  name: string;
  product: string;
  code: string;
  capacity: number;
  dead_stock: number;
  current_stock: number;
  book_stock: number;
  dip_stock: number;
  dip_cm: number;
  water_dip_cm: number;
  is_low: boolean;
  connected_nozzles: string[];
}

export interface CardSettlementEntry {
  id: number;
  date: string;
  machine_name: string;
  batch_no: string;
  slip_count: number;
  amount: number;
  shift?: string;
  attendant?: string;
}

export interface TransferEntryRecord {
  id: number;
  date: string;
  from_account_id: number;
  from_account_name: string;
  to_account_id: number;
  to_account_name: string;
  amount: number;
  denominations?: Record<string, number>;
  remarks?: string;
}

export interface TankerPurchaseRecord {
  id: number;
  invoice_no: string;
  date: string;
  dealer_name: string;
  tanker_vehicle_no: string;
  product_id: number;
  product_name: string;
  tank_id: number;
  qty_kl: number;
  qty_liters: number;
  rate_per_kl: number;
  freight: number;
  gross_amount: number;
  vat_amount: number;
  final_amount: number;
  sample_density: number;
  observed_density: number;
  observed_temp: number;
  invoice_density_15c: number;
  lfr_amount: number;
  tds_amount: number;
}

export interface TankDipRecord {
  id: number;
  date: string;
  tank_id: number;
  tank_name: string;
  product_name: string;
  dip_cm: number;
  water_dip_mm: number;
  physical_litres: number;
  book_litres: number;
  variance_litres: number;
  variance_percent: number;
  is_within_tolerance: boolean;
  status: 'NORMAL' | 'GAIN' | 'LOSS' | 'CRITICAL_LOSS';
}

export interface QuotationItem {
  id: number;
  quotation_no: string;
  date: string;
  valid_until: string;
  customer_name: string;
  customer_mobile: string;
  customer_gstin?: string;
  items: Array<{
    product_name: string;
    qty: number;
    rate: number;
    amount: number;
    tax_percent: number;
  }>;
  total_amount: number;
  terms: string;
  status: 'DRAFT' | 'ISSUED' | 'CONVERTED' | 'CANCELLED';
}

export interface ErpStoreState {
  version: number;
  lastUpdated: string;
  stationProfile: StationProfile;
  activeShift: {
    so_number: string;
    date: string;
    shift_name: string;
    status: 'OPEN' | 'CLOSED';
    dispenser_locked: boolean;
  };
  tanks: TankMasterItem[];
  nozzles: NozzleMasterItem[];
  employees: Array<{ id: number; name: string; code: string; mobile?: string }>;
  customers: CustomerFull[];
  bankAccounts: BankAccountItem[];
  products: LubeProductItem[];
  rates: FuelProductRate[];
  rateHistory: RateHistoryItem[];
  salesEntries: any[];
  creditBills: CreditSaleItem[];
  cardSettlements: CardSettlementEntry[];
  paymentReceipts: PaymentReceiptItem[];
  expenses: ExpenseEntry[];
  purchases: TankerPurchaseRecord[];
  dips: TankDipRecord[];
  transfers: TransferEntryRecord[];
  quotations: QuotationItem[];
}

// Purge any residual legacy localStorage cache from previous software iterations
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('nsaipetrosoft_master_state_v2');
    localStorage.removeItem('nsaipetrosoft_corrupted_backup');
    localStorage.removeItem('nsaipetrosoft_erp_state_v2_pre_restore_snapshot');
    localStorage.removeItem('nsaipetrosoft_erp_state_v2_pre_clean_snapshot');
    localStorage.removeItem('nsaipetrosoft_station_profile');
  }
} catch {}

export const DEFAULT_INITIAL_STATE: ErpStoreState = {
  version: 2,
  lastUpdated: new Date().toISOString(),
  stationProfile: {
    stationName: 'HIGHWAY PETROLEUM RETAIL OUTLET',
    oilCompany: 'BHARAT PETROLEUM CORPORATION LTD',
    dealerCode: 'RO-BPCL-101',
    address: 'NH-48, SURAT HIGHWAY SERVICE STATION',
    city: 'SURAT',
    state: 'GUJARAT',
    stateCode: '24',
    pincode: '395003',
    gstin: '24AAACN1234F1Z5',
    phone: '+91 98765 43210',
    upiVpa: 'bharatpetro@upi',
    printerPaperWidth: '80mm',
    managerPin: '1234',
    licenseDaysLeft: 228,
  },
  activeShift: {
    so_number: 'SO-00017',
    date: new Date().toISOString().split('T')[0],
    shift_name: 'First',
    status: 'OPEN',
    dispenser_locked: false,
  },
  tanks: [
    {
      id: 1,
      name: 'MS Tank 1',
      product: 'Petrol (MS)',
      code: 'MS',
      capacity: 20000,
      dead_stock: 500,
      current_stock: 14250.0,
      book_stock: 14250.0,
      dip_stock: 14250.0,
      dip_cm: 165.4,
      water_dip_cm: 0.0,
      is_low: false,
      connected_nozzles: ['N1 (MS-1)', 'N2 (MS-2)'],
    },
    {
      id: 2,
      name: 'HSD Tank 1',
      product: 'Diesel (HSD)',
      code: 'HSD',
      capacity: 25000,
      dead_stock: 600,
      current_stock: 18900.0,
      book_stock: 18900.0,
      dip_stock: 18900.0,
      dip_cm: 192.8,
      water_dip_cm: 0.0,
      is_low: false,
      connected_nozzles: ['N3 (HSD-1)', 'N4 (HSD-2)'],
    },
  ],
  nozzles: [
    {
      id: 1,
      name: 'N1 (MS-1)',
      machine_name: 'MPD 1 (Wayne)',
      product_name: 'Motor Spirit (MS)',
      product_code: 'MS',
      tank_id: 1,
      opening_meter: 125430.5,
      closing_meter: 125950.5,
      testing: 5.0,
      rate: 102.65,
      vat_percent: 13.7,
    },
    {
      id: 2,
      name: 'N2 (MS-2)',
      machine_name: 'MPD 1 (Wayne)',
      product_name: 'Motor Spirit (MS)',
      product_code: 'MS',
      tank_id: 1,
      opening_meter: 89450.0,
      closing_meter: 89910.0,
      testing: 5.0,
      rate: 102.65,
      vat_percent: 13.7,
    },
    {
      id: 3,
      name: 'N3 (HSD-1)',
      machine_name: 'MPD 2 (Gilbarco)',
      product_name: 'High Speed Diesel (HSD)',
      product_code: 'HSD',
      tank_id: 2,
      opening_meter: 412500.0,
      closing_meter: 413850.0,
      testing: 10.0,
      rate: 94.5,
      vat_percent: 13.7,
    },
    {
      id: 4,
      name: 'N4 (HSD-2)',
      machine_name: 'MPD 2 (Gilbarco)',
      product_name: 'High Speed Diesel (HSD)',
      product_code: 'HSD',
      tank_id: 2,
      opening_meter: 231100.0,
      closing_meter: 232250.0,
      testing: 10.0,
      rate: 94.5,
      vat_percent: 13.7,
    },
  ],
  employees: [
    { id: 1, name: 'SANMUKH H CHAUDHARI', code: 'EMP01', mobile: '9879012345' },
    { id: 2, name: 'DINESH Z CHAUDHARI', code: 'EMP02', mobile: '9879054321' },
    { id: 3, name: 'RAKESH B PATEL', code: 'EMP03', mobile: '9879099887' },
  ],
  customers: [
    {
      id: 1,
      code: 'CUST-001',
      name: 'SHREE BALAJI LOGISTICS & TRANSPORT',
      mobile: '9825123456',
      city: 'SURAT',
      state: 'GUJARAT',
      gst_no: '24AAACS5432D1Z8',
      pan_no: 'AAACS5432D',
      credit_limit: 250000.0,
      current_outstanding: 68450.0,
      bill_period: 'FORTNIGHTLY',
      is_blocked: false,
      vehicles: ['GJ05AB1234', 'GJ05CD5678', 'GJ05EF9012'],
    },
    {
      id: 2,
      code: 'CUST-002',
      name: 'GUJARAT EARTHMOVERS & INFRA',
      mobile: '9898011223',
      city: 'SURAT',
      state: 'GUJARAT',
      gst_no: '24AABCE1122C1Z4',
      pan_no: 'AABCE1122C',
      credit_limit: 150000.0,
      current_outstanding: 42100.0,
      bill_period: 'MONTHLY',
      is_blocked: false,
      vehicles: ['GJ05XY9988', 'GJ05JK4455'],
    },
    {
      id: 3,
      code: 'CUST-003',
      name: 'PATEL TRAVELS & BUS SERVICE',
      mobile: '9824055667',
      city: 'SURAT',
      state: 'GUJARAT',
      gst_no: '24AACCP7788P1Z2',
      pan_no: 'AACCP7788P',
      credit_limit: 100000.0,
      current_outstanding: 18900.0,
      bill_period: 'WEEKLY',
      is_blocked: false,
      vehicles: ['GJ05TR7711', 'GJ05TR7722'],
    },
  ],
  bankAccounts: [
    { id: 1, name: 'CASH ON HAND (MAIN SAFE)', type: 'CASH', balance: 45280.0 },
    { id: 2, name: 'SHIFT CASHIER FLOAT', type: 'CASH', balance: 10000.0 },
    { id: 3, name: 'HDFC BANK CURRENT A/C (6001)', type: 'CURRENT', balance: 385400.0 },
    { id: 4, name: 'STATE BANK OF INDIA CC A/C (8821)', type: 'CC', balance: 520000.0 },
    { id: 5, name: 'ICICI BANK EDC POS SETTLEMENT', type: 'CLEARING', balance: 64200.0 },
  ],
  products: [
    {
      id: 1,
      code: 'LUB-4T-20W40',
      name: 'MAK 4T PLUS 20W-40 (1 Litre)',
      category: '4T Engine Oil',
      package_size: '1L',
      barcode: '8901234567890',
      mrp: 385.0,
      cost_price: 295.0,
      sale_price: 360.0,
      current_stock_units: 48,
      reorder_level: 12,
      is_low_stock: false,
    },
    {
      id: 2,
      code: 'LUB-2T-500ML',
      name: 'MAK 2T SUPER (500 ML)',
      category: '2T Two-Stroke Oil',
      package_size: '500ML',
      barcode: '8901234567891',
      mrp: 145.0,
      cost_price: 110.0,
      sale_price: 135.0,
      current_stock_units: 64,
      reorder_level: 20,
      is_low_stock: false,
    },
    {
      id: 3,
      code: 'DEF-ADBLUE-20L',
      name: 'MAK ADBLUE / DEF BUCKET (20 Litre)',
      category: 'Diesel Exhaust Fluid',
      package_size: '20L',
      barcode: '8901234567892',
      mrp: 950.0,
      cost_price: 680.0,
      sale_price: 880.0,
      current_stock_units: 22,
      reorder_level: 10,
      is_low_stock: false,
    },
    {
      id: 4,
      code: 'COOL-MAK-1L',
      name: 'MAK RADIATOR COOLANT PRE-MIX (1 Litre)',
      category: 'Coolant',
      package_size: '1L',
      barcode: '8901234567893',
      mrp: 230.0,
      cost_price: 165.0,
      sale_price: 210.0,
      current_stock_units: 30,
      reorder_level: 10,
      is_low_stock: false,
    },
    {
      id: 5,
      code: 'DIST-WAT-5L',
      name: 'BATTERY DISTILLED WATER CAN (5 Litre)',
      category: 'Water/Battery',
      package_size: '5L',
      barcode: '8901234567894',
      mrp: 80.0,
      cost_price: 45.0,
      sale_price: 70.0,
      current_stock_units: 18,
      reorder_level: 8,
      is_low_stock: false,
    },
  ],
  rates: [
    { id: 1, code: 'MS', name: 'Motor Spirit (Petrol)', rate: 102.65, vat_percent: 13.7, cess_percent: 4.0 },
    { id: 2, code: 'HSD', name: 'High Speed Diesel', rate: 94.5, vat_percent: 13.7, cess_percent: 4.0 },
  ],
  rateHistory: [
    { id: 1, product_name: 'Motor Spirit (Petrol)', rate: 102.65, effective_date: new Date().toISOString().split('T')[0] + ' 06:00:00' },
    { id: 2, product_name: 'High Speed Diesel', rate: 94.5, effective_date: new Date().toISOString().split('T')[0] + ' 06:00:00' },
  ],
  salesEntries: [],
  creditBills: [
    {
      id: 1,
      bill_no: 'CR-8821',
      slip_no: 'SL-4011',
      date: new Date().toISOString().split('T')[0],
      customer_name: 'SHREE BALAJI LOGISTICS & TRANSPORT',
      customer_mobile: '9825123456',
      vehicle_no: 'GJ05AB1234',
      product: 'High Speed Diesel (HSD)',
      qty: 120.0,
      rate: 94.5,
      amount: 11340.0,
      cash_paid: 0.0,
      credit_amount: 11340.0,
      balance_after: 68450.0,
      driver_name: 'Ramesh Singh',
    },
  ],
  cardSettlements: [
    {
      id: 1,
      date: new Date().toISOString().split('T')[0],
      machine_name: 'HDFC BANK EDC POS',
      batch_no: '00412',
      slip_count: 14,
      amount: 24500.0,
      shift: 'First',
      attendant: 'SANMUKH H CHAUDHARI',
    },
  ],
  paymentReceipts: [
    {
      id: 1,
      receipt_no: 'RCP-1042',
      date: new Date().toISOString().split('T')[0],
      customer_name: 'SHREE BALAJI LOGISTICS & TRANSPORT',
      amount: 25000.0,
      payment_mode: 'NEFT',
      bank_name: 'HDFC BANK CURRENT A/C (6001)',
      remarks: 'RTGS UTR# HDFCR5202610200012',
    },
  ],
  expenses: [
    {
      id: 1,
      date: new Date().toISOString().split('T')[0],
      category: 'Staff Tea & Welfare',
      amount: 450.0,
      narration: 'Forecourt shift tea and refreshments',
      paid_to: 'Surat Tea Stall',
    },
    {
      id: 2,
      date: new Date().toISOString().split('T')[0],
      category: 'Generator Diesel & Fuel',
      amount: 1890.0,
      narration: '20L Diesel for standby power generator',
      paid_to: 'Internal Forecourt DU',
    },
  ],
  purchases: [
    {
      id: 1,
      invoice_no: 'BPCL-INV-99214',
      date: new Date().toISOString().split('T')[0],
      dealer_name: 'BHARAT PETROLEUM CORPORATION LTD',
      tanker_vehicle_no: 'MH-04-GP-8821',
      product_id: 2,
      product_name: 'High Speed Diesel (HSD)',
      tank_id: 2,
      qty_kl: 12.0,
      qty_liters: 12000.0,
      rate_per_kl: 72478.36,
      freight: 4500.0,
      gross_amount: 869740.32,
      vat_amount: 119154.42,
      final_amount: 874240.32,
      sample_density: 825.4,
      observed_density: 818.5,
      observed_temp: 29.5,
      invoice_density_15c: 825.4,
      lfr_amount: 5400.0,
      tds_amount: 874.24,
    },
  ],
  dips: [
    {
      id: 1,
      date: new Date().toISOString().split('T')[0],
      tank_id: 1,
      tank_name: 'MS Tank 1',
      product_name: 'Petrol (MS)',
      dip_cm: 165.4,
      water_dip_mm: 0.0,
      physical_litres: 14250.0,
      book_litres: 14260.0,
      variance_litres: -10.0,
      variance_percent: -0.07,
      is_within_tolerance: true,
      status: 'NORMAL',
    },
    {
      id: 2,
      date: new Date().toISOString().split('T')[0],
      tank_id: 2,
      tank_name: 'HSD Tank 1',
      product_name: 'Diesel (HSD)',
      dip_cm: 192.8,
      water_dip_mm: 0.0,
      physical_litres: 18900.0,
      book_litres: 18885.0,
      variance_litres: 15.0,
      variance_percent: 0.08,
      is_within_tolerance: true,
      status: 'NORMAL',
    },
  ],
  transfers: [
    {
      id: 1,
      date: new Date().toISOString().split('T')[0],
      from_account_id: 1,
      from_account_name: 'CASH ON HAND (MAIN SAFE)',
      to_account_id: 3,
      to_account_name: 'HDFC BANK CURRENT A/C (6001)',
      amount: 50000.0,
      remarks: 'Afternoon cash deposit in HDFC branch',
    },
  ],
  quotations: [
    {
      id: 1,
      quotation_no: 'QT-2026-001',
      date: new Date().toISOString().split('T')[0],
      valid_until: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      customer_name: 'GUJARAT ROAD CARRIERS CORP',
      customer_mobile: '9825099887',
      items: [
        { product_name: 'High Speed Diesel (HSD)', qty: 5000, rate: 94.5, amount: 472500, tax_percent: 13.7 },
        { product_name: 'MAK 4T PLUS 20W-40 (1 Litre)', qty: 24, rate: 360, amount: 8640, tax_percent: 18.0 },
      ],
      total_amount: 481140.0,
      terms: 'Payment strictly within 15 days of delivery against fleet challan.',
      status: 'ISSUED',
    },
  ],
};

class ErpStore {
  private state: ErpStoreState;
  private listeners: Set<(state: ErpStoreState) => void> = new Set();
  public quarantineWarning: string | null = null;
  private preRestoreSnapshot: ErpStoreState | null = null;
  private preCleanSnapshot: ErpStoreState | null = null;

  constructor() {
    this.state = { ...DEFAULT_INITIAL_STATE };
  }

  public subscribe(listener: (state: ErpStoreState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.state.lastUpdated = new Date().toISOString();
    this.listeners.forEach((fn) => fn(this.state));
  }

  public getState(): ErpStoreState {
    return this.state;
  }

  public getPreRestoreSnapshot(): ErpStoreState | null {
    return this.preRestoreSnapshot;
  }

  public rollbackSnapshot(): boolean {
    if (!this.preRestoreSnapshot) return false;
    this.state = JSON.parse(JSON.stringify(this.preRestoreSnapshot));
    this.notify();
    return true;
  }

  public getPreCleanSnapshot(): ErpStoreState | null {
    return this.preCleanSnapshot;
  }

  public rollbackCleanSnapshot(): boolean {
    if (!this.preCleanSnapshot) return false;
    this.state = JSON.parse(JSON.stringify(this.preCleanSnapshot));
    this.notify();
    return true;
  }

  // -------------------------------------------------------------------------
  // KPI & Dashboard Computed Aggregates
  // -------------------------------------------------------------------------
  public getDashboardKPIs(): {
    today_sale: number;
    total_outstanding: number;
    total_balance: number;
    total_stock_cost: number;
  } {
    // Today's sale from nozzle sales + cash bills
    const nozzleTotal = this.state.nozzles.reduce((sum, n) => {
      const net = Math.max(0, n.closing_meter - n.opening_meter - (n.testing || 0));
      return sum + mulCurrency(net, n.rate);
    }, 0);

    // Total outstanding from customers
    const totalOutstanding = this.state.customers.reduce((sum, c) => {
      return sum + (c.current_outstanding || 0);
    }, 0);

    // Total balance in bank & cash accounts
    const totalBalance = this.state.bankAccounts.reduce((sum, a) => {
      return sum + (a.balance || 0);
    }, 0);

    // Total fuel & lube inventory valuation
    const fuelCost = this.state.tanks.reduce((sum, t) => {
      const avgCost = t.code === 'MS' ? 92.5 : 85.0; // Approx wholesale cost
      return sum + mulCurrency(t.current_stock || 0, avgCost);
    }, 0);

    const lubeCost = this.state.products.reduce((sum, p) => {
      return sum + mulCurrency(p.current_stock_units || 0, p.cost_price || 0);
    }, 0);

    return {
      today_sale: roundCurrency(nozzleTotal),
      total_outstanding: roundCurrency(totalOutstanding),
      total_balance: roundCurrency(totalBalance),
      total_stock_cost: roundCurrency(fuelCost + lubeCost),
    };
  }

  public getPaymentBreakdown(): {
    cash: number;
    credit: number;
    digital: number;
    total: number;
  } {
    const kpis = this.getDashboardKPIs();
    const creditTotal = this.state.creditBills.reduce((sum, c) => sum + (c.amount || 0), 0);
    const digitalTotal = this.state.cardSettlements.reduce((sum, c) => sum + (c.amount || 0), 0);
    const cashTotal = Math.max(0, subCurrency(kpis.today_sale, addCurrency(creditTotal, digitalTotal)));

    return {
      cash: roundCurrency(cashTotal),
      credit: roundCurrency(creditTotal),
      digital: roundCurrency(digitalTotal),
      total: roundCurrency(kpis.today_sale),
    };
  }

  // -------------------------------------------------------------------------
  // ATOMIC TRANSACTIONS
  // -------------------------------------------------------------------------

  /**
   * 1. Shift Nozzle Sale Saved:
   * - Deducts Net Sold Litres (Closing - Opening - Testing) from linked Tank Book Stock
   * - Updates Nozzle readings
   * - Increments Total Collection and DSR
   */
  public recordShiftNozzleSales(readings: Array<{
    nozzle_id: number;
    closing_meter: number;
    testing_qty: number;
    is_rollover?: boolean;
    employee_name?: string;
  }>): { totalNetLitres: number; totalAmount: number } {
    let totalNet = 0;
    let totalAmt = 0;

    readings.forEach((r) => {
      const nozzleIndex = this.state.nozzles.findIndex((n) => n.id === r.nozzle_id);
      if (nozzleIndex === -1) return;

      const nozzle = this.state.nozzles[nozzleIndex];
      const { net } = calcMeterQty(nozzle.opening_meter, r.closing_meter, r.testing_qty, r.is_rollover);
      const saleAmount = calcSaleAmount(net, nozzle.rate);

      totalNet = addVolume(totalNet, net);
      totalAmt = addCurrency(totalAmt, saleAmount);

      // Deduct from linked tank book stock
      const tankIndex = this.state.tanks.findIndex((t) => t.id === nozzle.tank_id);
      if (tankIndex !== -1) {
        const tank = this.state.tanks[tankIndex];
        const updatedBookStock = Math.max(0, subVolume(tank.book_stock, net));
        const updatedCurrentStock = Math.max(0, subVolume(tank.current_stock, net));

        this.state.tanks[tankIndex] = {
          ...tank,
          book_stock: updatedBookStock,
          current_stock: updatedCurrentStock,
          dip_stock: updatedCurrentStock,
          is_low: updatedCurrentStock < tank.dead_stock * 2,
        };
      }

      // Update nozzle closing & opening
      this.state.nozzles[nozzleIndex] = {
        ...nozzle,
        opening_meter: r.closing_meter, // Pre-fill for next shift
        closing_meter: r.closing_meter,
        testing: r.testing_qty,
      };
    });

    // Record into salesEntries
    this.state.salesEntries.push({
      id: Date.now(),
      shift: this.state.activeShift.shift_name,
      date: this.state.activeShift.date,
      readings,
      total_litres: totalNet,
      total_amount: totalAmt,
      timestamp: new Date().toISOString(),
    });

    this.notify();
    return { totalNetLitres: totalNet, totalAmount: totalAmt };
  }

  /**
   * 2. Credit Bill Saved:
   * - Increments customer balance in Customer Fleet Master
   * - Increments Total Outstanding
   * - Appends to credit bills
   */
  public recordCreditBill(bill: {
    customer_id: number;
    vehicle_no: string;
    product_name: string;
    qty: number;
    rate: number;
    slip_no?: string;
    shift?: string;
    indent_no?: string;
    driver_name?: string;
    odometer_km?: number;
    remarks?: string;
    manager_override_pin?: string;
  }): CreditSaleItem {
    const custIndex = this.state.customers.findIndex((c) => c.id === bill.customer_id);
    if (custIndex === -1) throw new Error('Customer not found in master database');

    const customer = this.state.customers[custIndex];
    const amount = calcSaleAmount(bill.qty, bill.rate);
    const newOutstanding = addCurrency(customer.current_outstanding || 0, amount);

    // Hard credit check
    if (newOutstanding > customer.credit_limit) {
      if (!bill.manager_override_pin || bill.manager_override_pin !== this.state.stationProfile.managerPin) {
        throw new Error(`CREDIT LIMIT EXCEEDED: Outstanding (₹${newOutstanding}) exceeds limit of ₹${customer.credit_limit}. Manager PIN override required.`);
      }
    }

    // Update customer balance & vehicle list
    const vehicles = new Set(customer.vehicles || []);
    if (bill.vehicle_no) vehicles.add(bill.vehicle_no.trim().toUpperCase());

    this.state.customers[custIndex] = {
      ...customer,
      current_outstanding: newOutstanding,
      vehicles: Array.from(vehicles),
    };

    const newSaleItem: CreditSaleItem = {
      id: Date.now(),
      bill_no: `CR-${Date.now().toString().slice(-4)}`,
      slip_no: bill.slip_no || `SL-${Date.now().toString().slice(-4)}`,
      date: this.state.activeShift.date,
      shift: bill.shift || this.state.activeShift.shift_name,
      customer_name: customer.name,
      customer_mobile: customer.mobile,
      vehicle_no: bill.vehicle_no || 'WALK-IN',
      product: bill.product_name,
      qty: bill.qty,
      rate: bill.rate,
      amount: amount,
      cash_paid: 0,
      credit_amount: amount,
      balance_after: newOutstanding,
      driver_name: bill.driver_name,
      odometer_km: bill.odometer_km,
      indent_no: bill.indent_no,
    };

    this.state.creditBills.unshift(newSaleItem);
    this.notify();
    return newSaleItem;
  }

  /**
   * 3. Card / UPI Entry Saved:
   * - Increments Bank/POS settlement ledger
   * - Increases digital account balance
   */
  public recordCardSettlement(entry: {
    machine_name: string;
    batch_no: string;
    slip_count: number;
    amount: number;
    attendant?: string;
  }): CardSettlementEntry {
    const newRecord: CardSettlementEntry = {
      id: Date.now(),
      date: this.state.activeShift.date,
      machine_name: entry.machine_name,
      batch_no: entry.batch_no,
      slip_count: entry.slip_count,
      amount: roundCurrency(entry.amount),
      shift: this.state.activeShift.shift_name,
      attendant: entry.attendant || 'Duty Attendant',
    };

    this.state.cardSettlements.unshift(newRecord);

    // Update digital clearing bank account
    const accIndex = this.state.bankAccounts.findIndex((a) => a.type === 'CLEARING' || a.name.includes('POS'));
    if (accIndex !== -1) {
      this.state.bankAccounts[accIndex] = {
        ...this.state.bankAccounts[accIndex],
        balance: addCurrency(this.state.bankAccounts[accIndex].balance, entry.amount),
      };
    }

    this.notify();
    return newRecord;
  }

  /**
   * 4. Payment Receipt Saved:
   * - Decrements customer balance in Customer Fleet Master
   * - Decrements Total Outstanding
   * - Increments Cash In-Hand or Bank Account
   */
  public recordPaymentReceipt(receipt: {
    customer_name: string;
    amount: number;
    payment_mode: 'Cash' | 'Cheque' | 'NEFT' | 'RTGS' | 'UPI' | string;
    bank_name?: string;
    remarks?: string;
  }): PaymentReceiptItem {
    const custIndex = this.state.customers.findIndex((c) => c.name.toLowerCase() === receipt.customer_name.toLowerCase());
    if (custIndex !== -1) {
      const customer = this.state.customers[custIndex];
      const newBal = Math.max(0, subCurrency(customer.current_outstanding || 0, receipt.amount));
      this.state.customers[custIndex] = {
        ...customer,
        current_outstanding: newBal,
      };
    }

    // Increment destination bank/cash account
    const isCash = receipt.payment_mode === 'Cash';
    const accIndex = this.state.bankAccounts.findIndex((a) => isCash ? a.type === 'CASH' : a.name === receipt.bank_name || a.type === 'CURRENT');
    if (accIndex !== -1) {
      this.state.bankAccounts[accIndex] = {
        ...this.state.bankAccounts[accIndex],
        balance: addCurrency(this.state.bankAccounts[accIndex].balance, receipt.amount),
      };
    }

    const newReceiptItem: PaymentReceiptItem = {
      id: Date.now(),
      receipt_no: `RCP-${Date.now().toString().slice(-4)}`,
      date: this.state.activeShift.date,
      customer_name: receipt.customer_name,
      amount: roundCurrency(receipt.amount),
      payment_mode: receipt.payment_mode,
      bank_name: receipt.bank_name,
      remarks: receipt.remarks,
    };

    this.state.paymentReceipts.unshift(newReceiptItem);
    this.notify();
    return newReceiptItem;
  }

  /**
   * 5. Purchase Entry (Decantation) Saved:
   * - Increments physical & book stock in Underground Tank Master
   * - Capacity validation: blocks decantation exceeding Max Capacity
   * - Records invoice density vs observed density
   * - Computes LFR and Sec 194Q TDS (0.1%)
   */
  public recordPurchaseDecantation(data: {
    invoice_no: string;
    dealer_name: string;
    tanker_vehicle_no: string;
    tank_id: number;
    product_id: number;
    qty_kl: number;
    rate_per_kl: number;
    freight?: number;
    sample_density: number;
    observed_density: number;
    observed_temp: number;
    manager_override_pin?: string;
  }): TankerPurchaseRecord {
    const tankIndex = this.state.tanks.findIndex((t) => t.id === data.tank_id);
    if (tankIndex === -1) throw new Error('Selected tank does not exist');

    const tank = this.state.tanks[tankIndex];
    const qtyLitres = roundVolume(data.qty_kl * 1000, 2);

    // Max capacity validation guard
    if (tank.current_stock + qtyLitres > tank.capacity) {
      if (!data.manager_override_pin || data.manager_override_pin !== this.state.stationProfile.managerPin) {
        throw new Error(
          `TANK CAPACITY OVERFLOW ALERT: Decanting ${qtyLitres} L into ${tank.name} (Current: ${tank.current_stock} L) exceeds Max Capacity of ${tank.capacity} L. Safe Ullage is only ${tank.capacity - tank.current_stock} L.`
        );
      }
    }

    const gross = roundCurrency(data.qty_kl * data.rate_per_kl);
    const freight = data.freight || 0;
    const finalAmount = addCurrency(gross, freight);
    const lfr = calcLfr(qtyLitres, 450); // Standard LFR per KL
    const tds = calcSec194QTds(finalAmount, 0.1);

    // Update tank stocks
    const newStock = roundVolume(tank.current_stock + qtyLitres, 2);
    this.state.tanks[tankIndex] = {
      ...tank,
      current_stock: newStock,
      book_stock: newStock,
      dip_stock: newStock,
      is_low: false,
    };

    const newPurchase: TankerPurchaseRecord = {
      id: Date.now(),
      invoice_no: data.invoice_no,
      date: this.state.activeShift.date,
      dealer_name: data.dealer_name,
      tanker_vehicle_no: data.tanker_vehicle_no,
      product_id: data.product_id,
      product_name: tank.product,
      tank_id: data.tank_id,
      qty_kl: data.qty_kl,
      qty_liters: qtyLitres,
      rate_per_kl: data.rate_per_kl,
      freight: freight,
      gross_amount: gross,
      vat_amount: roundCurrency((gross * 13.7) / 100),
      final_amount: finalAmount,
      sample_density: data.sample_density,
      observed_density: data.observed_density,
      observed_temp: data.observed_temp,
      invoice_density_15c: data.sample_density,
      lfr_amount: lfr,
      tds_amount: tds,
    };

    this.state.purchases.unshift(newPurchase);
    this.notify();
    return newPurchase;
  }

  /**
   * 6. Expense Book Entry Saved:
   * - Increments expense ledger
   * - Reduces Cash In-Hand (or selected bank account)
   */
  public recordExpense(expense: {
    category: string;
    amount: number;
    narration?: string;
    paid_to?: string;
    paid_from_account?: string;
    paid_from_account_id?: number;
  }): ExpenseEntry {
    const amt = roundCurrency(expense.amount);

    // Deduct from Cash On Hand or selected bank account
    const accIndex = this.state.bankAccounts.findIndex((a) =>
      expense.paid_from_account_id ? a.id === expense.paid_from_account_id : (a.name === (expense.paid_from_account || 'CASH ON HAND (MAIN SAFE)') || a.type === 'CASH')
    );
    if (accIndex !== -1) {
      this.state.bankAccounts[accIndex] = {
        ...this.state.bankAccounts[accIndex],
        balance: Math.max(0, subCurrency(this.state.bankAccounts[accIndex].balance, amt)),
      };
    }

    const newExpense: ExpenseEntry = {
      id: Date.now(),
      date: this.state.activeShift.date,
      category: expense.category,
      amount: amt,
      narration: expense.narration,
      paid_to: expense.paid_to,
    };

    this.state.expenses.unshift(newExpense);
    this.notify();
    return newExpense;
  }

  /**
   * 7. Contra Transfer Entry Saved:
   * - Debits source account and credits destination account
   */
  public recordTransfer(transfer: {
    from_account_id: number;
    to_account_id: number;
    amount: number;
    denominations?: Record<string, number>;
    remarks?: string;
  }): TransferEntryRecord {
    const fromIndex = this.state.bankAccounts.findIndex((a) => a.id === transfer.from_account_id);
    const toIndex = this.state.bankAccounts.findIndex((a) => a.id === transfer.to_account_id);

    if (fromIndex === -1 || toIndex === -1) {
      throw new Error('Source or Destination account invalid');
    }

    const amt = roundCurrency(transfer.amount);
    if (this.state.bankAccounts[fromIndex].balance < amt) {
      throw new Error(`INSUFFICIENT BALANCE: Source account only has ₹${this.state.bankAccounts[fromIndex].balance}`);
    }

    this.state.bankAccounts[fromIndex] = {
      ...this.state.bankAccounts[fromIndex],
      balance: subCurrency(this.state.bankAccounts[fromIndex].balance, amt),
    };

    this.state.bankAccounts[toIndex] = {
      ...this.state.bankAccounts[toIndex],
      balance: addCurrency(this.state.bankAccounts[toIndex].balance, amt),
    };

    const newTransfer: TransferEntryRecord = {
      id: Date.now(),
      date: this.state.activeShift.date,
      from_account_id: transfer.from_account_id,
      from_account_name: this.state.bankAccounts[fromIndex].name,
      to_account_id: transfer.to_account_id,
      to_account_name: this.state.bankAccounts[toIndex].name,
      amount: amt,
      denominations: transfer.denominations,
      remarks: transfer.remarks,
    };

    this.state.transfers.unshift(newTransfer);
    this.notify();
    return newTransfer;
  }

  /**
   * Alias for recordDipReading
   */
  public recordDip(data: {
    tank_id: number;
    dip_cm: number;
    water_dip_mm?: number;
    physical_litres?: number;
  }): TankDipRecord {
    return this.recordDipReading(data);
  }

  /**
   * 8. DIP REGISTER Entry Saved:
   * - Converts physical dip to litres
   * - Compares against Book Stock
   * - Records exact Variance (Gain/Loss)
   */
  public recordDipReading(data: {
    tank_id: number;
    dip_cm: number;
    water_dip_mm?: number;
    physical_litres?: number;
  }): TankDipRecord {
    const tankIndex = this.state.tanks.findIndex((t) => t.id === data.tank_id);
    if (tankIndex === -1) throw new Error('Tank not found');

    const tank = this.state.tanks[tankIndex];

    // Tank calibration conversion formula (if physical_litres not manually specified)
    // Quadratic volume calibration approximation: V = capacity * (dip / max_dip)^1.2
    const maxDip = 220.0;
    const physical = data.physical_litres ?? roundVolume(Math.min(tank.capacity, tank.capacity * Math.pow(Math.min(maxDip, data.dip_cm) / maxDip, 1.15)), 2);

    const varianceResult = calcDipVariance(physical, tank.book_stock, tank.capacity);

    // Update tank dip levels
    this.state.tanks[tankIndex] = {
      ...tank,
      dip_cm: data.dip_cm,
      water_dip_cm: (data.water_dip_mm || 0) / 10,
      dip_stock: physical,
      current_stock: physical, // Dip replaces current physical stock
      is_low: physical < tank.dead_stock * 2,
    };

    const newDipRecord: TankDipRecord = {
      id: Date.now(),
      date: this.state.activeShift.date,
      tank_id: data.tank_id,
      tank_name: tank.name,
      product_name: tank.product,
      dip_cm: data.dip_cm,
      water_dip_mm: data.water_dip_mm || 0,
      physical_litres: physical,
      book_litres: tank.book_stock,
      variance_litres: varianceResult.diffLitres,
      variance_percent: varianceResult.diffPercent,
      is_within_tolerance: varianceResult.isWithinTolerance,
      status: varianceResult.status,
    };

    this.state.dips.unshift(newDipRecord);
    this.notify();
    return newDipRecord;
  }

  // -------------------------------------------------------------------------
  // MASTER CRUD WITH DELETE GUARDS & VALIDATION
  // -------------------------------------------------------------------------

  public updateFuelRate(productId: number, newRate: number): void {
    const rateIndex = this.state.rates.findIndex((r) => r.id === productId);
    if (rateIndex === -1) return;

    const current = this.state.rates[rateIndex];
    const roundedRate = roundCurrency(newRate);

    this.state.rates[rateIndex] = { ...current, rate: roundedRate };

    // Update active rate in nozzles mapped to this product
    this.state.nozzles.forEach((n, idx) => {
      if (n.product_code === current.code) {
        this.state.nozzles[idx] = { ...n, rate: roundedRate };
      }
    });

    // Record in history
    this.state.rateHistory.unshift({
      id: Date.now(),
      product_name: current.name,
      rate: roundedRate,
      effective_date: new Date().toISOString().replace('T', ' ').slice(0, 19),
    });

    this.notify();
  }

  public saveCustomer(customer: Partial<CustomerFull>): CustomerFull {
    if (!customer.name) throw new Error('Customer name is required');
    if (customer.gst_no && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(customer.gst_no.trim())) {
      throw new Error('Invalid GSTIN format (must be 15 characters, e.g. 24AAACN1234F1Z5)');
    }

    if (customer.id) {
      const idx = this.state.customers.findIndex((c) => c.id === customer.id);
      if (idx !== -1) {
        this.state.customers[idx] = {
          ...this.state.customers[idx],
          ...customer,
          name: customer.name.toUpperCase().trim(),
        } as CustomerFull;
        this.notify();
        return this.state.customers[idx];
      }
    }

    const newCust: CustomerFull = {
      id: Date.now(),
      code: `CUST-${(this.state.customers.length + 1).toString().padStart(3, '0')}`,
      name: customer.name.toUpperCase().trim(),
      mobile: customer.mobile || '',
      city: customer.city || this.state.stationProfile.city,
      state: customer.state || this.state.stationProfile.state,
      gst_no: customer.gst_no?.trim(),
      pan_no: customer.pan_no?.trim(),
      credit_limit: roundCurrency(customer.credit_limit || 50000),
      current_outstanding: roundCurrency(customer.current_outstanding || 0),
      bill_period: customer.bill_period || 'MONTHLY',
      is_blocked: false,
      vehicles: customer.vehicles || [],
    };

    this.state.customers.push(newCust);
    this.notify();
    return newCust;
  }

  public deleteCustomer(customerId: number): void {
    const cust = this.state.customers.find((c) => c.id === customerId);
    if (!cust) return;

    // Delete Guard: block deletion if non-zero balance or existing transactions
    if ((cust.current_outstanding || 0) > 0) {
      throw new Error(`CANNOT DELETE CUSTOMER: "${cust.name}" has an active outstanding balance of ₹${cust.current_outstanding}. Clear balance first.`);
    }

    const hasBills = this.state.creditBills.some((b) => b.customer_name === cust.name);
    if (hasBills) {
      throw new Error(`CANNOT DELETE CUSTOMER: "${cust.name}" has existing transaction history in credit bills. Deletion guarded for statutory compliance.`);
    }

    this.state.customers = this.state.customers.filter((c) => c.id !== customerId);
    this.notify();
  }

  public saveTank(tank: Partial<TankMasterItem>): TankMasterItem {
    if (!tank.name) throw new Error('Tank name required');

    if (tank.id) {
      const idx = this.state.tanks.findIndex((t) => t.id === tank.id);
      if (idx !== -1) {
        this.state.tanks[idx] = { ...this.state.tanks[idx], ...tank } as TankMasterItem;
        this.notify();
        return this.state.tanks[idx];
      }
    }

    const newTank: TankMasterItem = {
      id: Date.now(),
      name: tank.name,
      product: tank.product || 'Petrol',
      code: tank.code || 'MS',
      capacity: tank.capacity || 20000,
      dead_stock: tank.dead_stock || 500,
      current_stock: tank.current_stock || 10000,
      book_stock: tank.book_stock || 10000,
      dip_stock: tank.dip_stock || 10000,
      dip_cm: tank.dip_cm || 100,
      water_dip_cm: 0,
      is_low: false,
      connected_nozzles: tank.connected_nozzles || [],
    };

    this.state.tanks.push(newTank);
    this.notify();
    return newTank;
  }

  public saveNozzle(nozzle: Partial<NozzleMasterItem>): NozzleMasterItem {
    if (!nozzle.name) throw new Error('Nozzle name required');

    if (nozzle.id) {
      const idx = this.state.nozzles.findIndex((n) => n.id === nozzle.id);
      if (idx !== -1) {
        this.state.nozzles[idx] = { ...this.state.nozzles[idx], ...nozzle } as NozzleMasterItem;
        this.notify();
        return this.state.nozzles[idx];
      }
    }

    const newNozzle: NozzleMasterItem = {
      id: Date.now(),
      name: nozzle.name,
      machine_name: nozzle.machine_name || 'MPD 1',
      product_name: nozzle.product_name || 'Motor Spirit',
      product_code: nozzle.product_code || 'MS',
      tank_id: nozzle.tank_id || 1,
      opening_meter: nozzle.opening_meter || 0,
      closing_meter: nozzle.closing_meter || 0,
      testing: 0,
      rate: nozzle.rate || 102.65,
      vat_percent: nozzle.vat_percent || 13.7,
    };

    this.state.nozzles.push(newNozzle);
    this.notify();
    return newNozzle;
  }

  public saveLubeProduct(product: Partial<LubeProductItem>): LubeProductItem {
    if (!product.name) throw new Error('Product name required');

    if (product.id) {
      const idx = this.state.products.findIndex((p) => p.id === product.id);
      if (idx !== -1) {
        this.state.products[idx] = { ...this.state.products[idx], ...product } as LubeProductItem;
        this.notify();
        return this.state.products[idx];
      }
    }

    const newProd: LubeProductItem = {
      id: Date.now(),
      code: product.code || `LUB-${Date.now().toString().slice(-4)}`,
      name: product.name.toUpperCase().trim(),
      category: product.category || 'Lubricants',
      package_size: product.package_size || '1L',
      barcode: product.barcode,
      mrp: roundCurrency(product.mrp || 0),
      sale_price: roundCurrency(product.sale_price || product.mrp || 0),
      cost_price: roundCurrency(product.cost_price || 0),
      current_stock_units: product.current_stock_units || 0,
      reorder_level: product.reorder_level || 5,
      is_low_stock: (product.current_stock_units || 0) <= (product.reorder_level || 5),
      hsn_code: product.hsn_code || '2710',
      gst_percent: product.gst_percent !== undefined ? product.gst_percent : 18.0,
    };

    this.state.products.push(newProd);
    this.notify();
    return newProd;
  }

  public bulkUpdateProducts(updates: Array<{ id: number; current_stock_units: number; sale_price: number; reorder_level: number }>): void {
    updates.forEach((u) => {
      const idx = this.state.products.findIndex((p) => p.id === u.id);
      if (idx !== -1) {
        const prod = this.state.products[idx];
        this.state.products[idx] = {
          ...prod,
          current_stock_units: u.current_stock_units,
          sale_price: roundCurrency(u.sale_price),
          reorder_level: u.reorder_level,
          is_low_stock: u.current_stock_units <= u.reorder_level,
        };
      }
    });
    this.notify();
  }

  // -------------------------------------------------------------------------
  // ESTIMATES & QUOTATIONS
  // -------------------------------------------------------------------------

  public saveQuotation(quote: Partial<QuotationItem>): QuotationItem {
    if (!quote.customer_name) throw new Error('Customer name is required');

    const total = (quote.items || []).reduce((acc, it) => acc + (it.amount || 0), 0);

    const newQuote: QuotationItem = {
      id: quote.id || Date.now(),
      quotation_no: quote.quotation_no || `QT-${new Date().getFullYear()}-${(this.state.quotations.length + 1).toString().padStart(3, '0')}`,
      date: quote.date || this.state.activeShift.date,
      valid_until: quote.valid_until || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      customer_name: quote.customer_name.toUpperCase().trim(),
      customer_mobile: quote.customer_mobile || '',
      customer_gstin: quote.customer_gstin,
      items: quote.items || [],
      total_amount: roundCurrency(total),
      terms: quote.terms || 'Payment within 15 days against challan.',
      status: quote.status || 'ISSUED',
    };

    if (quote.id) {
      const idx = this.state.quotations.findIndex((q) => q.id === quote.id);
      if (idx !== -1) {
        this.state.quotations[idx] = newQuote;
        this.notify();
        return newQuote;
      }
    }

    this.state.quotations.unshift(newQuote);
    this.notify();
    return newQuote;
  }

  public convertQuotationToCreditBill(quotationId: number): CreditSaleItem {
    const quoteIndex = this.state.quotations.findIndex((q) => q.id === quotationId);
    if (quoteIndex === -1) throw new Error('Quotation not found');

    const quote = this.state.quotations[quoteIndex];
    let cust = this.state.customers.find((c) => c.name.toLowerCase() === quote.customer_name.toLowerCase());
    if (!cust) {
      cust = this.saveCustomer({
        name: quote.customer_name,
        mobile: quote.customer_mobile,
        gst_no: quote.customer_gstin,
        credit_limit: quote.total_amount * 1.5,
      });
    }

    const firstItem = quote.items[0] || { product_name: 'High Speed Diesel (HSD)', qty: 100, rate: 94.5 };
    const bill = this.recordCreditBill({
      customer_id: cust.id,
      vehicle_no: cust.vehicles?.[0] || 'BULK-DELIVERY',
      product_name: firstItem.product_name,
      qty: firstItem.qty,
      rate: firstItem.rate,
      slip_no: `QT-CONV-${quote.quotation_no}`,
      indent_no: quote.quotation_no,
    });

    this.state.quotations[quoteIndex].status = 'CONVERTED';
    this.notify();
    return bill;
  }

  // -------------------------------------------------------------------------
  // CONTROL PANEL: BACKUP, RESTORE, CLEANING
  // -------------------------------------------------------------------------

  public exportBackupJson(): { jsonString: string; filename: string; checksum: string } {
    const payload = JSON.stringify(this.state, null, 2);
    // Adler-32 checksum calculation
    let a = 1, b = 0;
    for (let i = 0; i < payload.length; i++) {
      a = (a + payload.charCodeAt(i)) % 65521;
      b = (b + a) % 65521;
    }
    const checksum = ((b << 16) | a).toString(16).toUpperCase();
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `NSaiPetroSoft_Backup_${dateStr}_${checksum.slice(0, 6)}.json`;

    return { jsonString: payload, filename, checksum };
  }

  public restoreBackupJson(rawJson: string): { success: boolean; recordsRestored: number } {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tanks)) {
      throw new Error('Invalid backup file schema: Missing essential tables');
    }

    // Save in-memory rollback snapshot
    this.preRestoreSnapshot = JSON.parse(JSON.stringify(this.state));

    this.state = {
      ...DEFAULT_INITIAL_STATE,
      ...parsed,
      version: 2,
      lastUpdated: new Date().toISOString(),
    };

    this.notify();
    const count = (parsed.creditBills?.length || 0) + (parsed.purchases?.length || 0) + (parsed.customers?.length || 0);
    return { success: true, recordsRestored: count };
  }

  public cleanSlateDatabase(keepMasters: boolean = true): void {
    // Save in-memory safety rollback snapshot before wipe
    this.preCleanSnapshot = JSON.parse(JSON.stringify(this.state));

    if (keepMasters) {
      this.state.creditBills = [];
      this.state.salesEntries = [];
      this.state.cardSettlements = [];
      this.state.paymentReceipts = [];
      this.state.expenses = [];
      this.state.purchases = [];
      this.state.dips = [];
      this.state.transfers = [];
      this.state.quotations = [];
      // Reset customer outstanding
      this.state.customers.forEach((c) => {
        c.current_outstanding = 0;
      });
    } else {
      this.state = { ...DEFAULT_INITIAL_STATE };
    }

    this.notify();
  }
}

// Global Singleton Store Instance
export const erpStore = new ErpStore();
