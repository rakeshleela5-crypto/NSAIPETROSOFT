/**
 * NSAIPETROSOFT Domain Models & TypeScript Data Contracts
 * 
 * Separates domain data structures and contracts from presentation logic (App.tsx).
 * Zero circular dependency risk, shared across API client, pages, components, and tests.
 */

// ---------------------------------------------------------------------------
// System & Shell Dialog Enums
// ---------------------------------------------------------------------------
export type DialogType =
  | 'sales'
  | 'credit'
  | 'payment'
  | 'expense'
  | 'transfer'
  | 'rate'
  | 'purchase'
  | 'dip'
  | 'denom'
  | 'statement'
  | 'stamping'
  | 'help'
  | 'calc'
  | 'reports'
  | 'customerMaster'
  | 'tankMaster'
  | 'nozzleMaster'
  | 'bankMaster'
  | 'controlPanel'
  | 'cardEntry'
  | 'cashBill'
  | 'viewStock'
  | 'employeeSettlement'
  | 'dayBookReport'
  | 'crystalViewer'
  | 'selectCustomerBill'
  | 'backup'
  | null;

export interface StationProfile {
  stationName: string;
  oilCompany: 'IOCL' | 'BPCL' | 'HPCL' | 'NAYARA' | 'RELIANCE' | string;
  dealerCode?: string;
  address: string;
  city: string;
  state: string;
  stateCode?: string;
  pincode: string;
  gstin: string;
  phone: string;
  panNo?: string;
  upiVpa?: string;
  printerPaperWidth?: '80mm' | '58mm';
  managerPin?: string;
  licenseDaysLeft?: number;
}

// ---------------------------------------------------------------------------
// Health & Diagnostics
// ---------------------------------------------------------------------------
export interface HealthResponse {
  status: string;
  database: string;
  environment: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Dashboard KPIs & State
// ---------------------------------------------------------------------------
export interface DashboardKPIs {
  today_sale: number;
  total_outstanding: number;
  total_balance: number;
  total_stock_cost: number;
}

export interface PaymentBreakdown {
  cash: number;
  credit: number;
  digital: number;
  total: number;
}

export interface TankStock {
  id: number;
  name: string;
  product: string;
  code: string;
  capacity: number;
  current_stock: number;
  percent: number;
  dip_cm: number;
  is_low: boolean;
}

export interface CustomerOutstanding {
  id: number;
  code: string;
  name: string;
  city?: string;
  mobile: string;
  outstanding: number;
  credit_limit: number;
}

export interface BankAccountItem {
  id: number;
  name: string;
  type: string;
  balance: number;
}

export interface ActiveShiftInfo {
  so_number: string;
  date: string;
  shift_name: string;
  status: string;
}

export interface DashboardResponse {
  kpis: DashboardKPIs;
  breakdown: PaymentBreakdown;
  tanks: TankStock[];
  customers: CustomerOutstanding[];
  accounts: BankAccountItem[];
  active_shift: ActiveShiftInfo;
}

// ---------------------------------------------------------------------------
// Daily Rate Master
// ---------------------------------------------------------------------------
export interface FuelProductRate {
  id: number;
  code: string;
  name: string;
  rate: number;
  vat_percent: number;
  cess_percent: number;
}

export interface RateHistoryItem {
  id: number;
  product_name: string;
  rate: number;
  effective_date: string;
}

export interface RatesResponse {
  products: FuelProductRate[];
  history: RateHistoryItem[];
}

// ---------------------------------------------------------------------------
// Shift Sales & Nozzle Totalizers
// ---------------------------------------------------------------------------
export interface NozzleMeterItem {
  nozzle_id: number;
  nozzle_name: string;
  machine_name: string;
  product_name: string;
  product_code: string;
  opening_meter: number;
  closing_meter: number;
  testing: number;
  rate: number;
  vat_percent: number;
}

export interface ShiftEmployeeItem {
  id: number;
  name: string;
  code: string;
}

export interface ShiftDetailsResponse {
  so_number: string;
  date: string;
  shift_name: string;
  status: string;
  employees: ShiftEmployeeItem[];
  nozzles: NozzleMeterItem[];
}

export interface ShiftReadingInput {
  nozzle_id: number;
  employee_id?: number;
  opening_meter: number;
  closing_meter: number;
  testing_qty: number;
  lube_amount?: number;
  is_rollover?: boolean;
  max_meter_digits?: number;
  split_closing_meter?: number;
  split_rate?: number;
}

export interface NozzleMeterReplacement {
  id: number;
  nozzle_id: number;
  date: string;
  old_final_meter: number;
  new_initial_meter: number;
  reason: string;
  wm_seal_no?: string;
  authorized_by: string;
}

export interface StrappingPoint {
  id?: number;
  dip_cm: number;
  volume_liters: number;
  notes?: string;
}

export interface LubeProductItem {
  id: number;
  code: string;
  name: string;
  category: string;
  package_size: string;
  barcode?: string;
  mrp: number;
  sale_price: number;
  cost_price: number;
  current_stock_units: number;
  reorder_level: number;
  is_low_stock: boolean;
}

export interface EmployeeShortageLedgerItem {
  id: number;
  date: string;
  amount: number;
  gap_type: string;
  status: string;
  notes?: string;
  settled_at?: string;
}

export interface StampingRegisterItem {
  nozzle_id: number;
  nozzle_name: string;
  machine_name: string;
  product: string;
  current_meter: number;
  last_stamping_date: string;
  next_stamping_due: string;
  days_left: number;
  wm_seal_no: string;
  status: 'VALID' | 'DUE_SOON' | 'EXPIRED';
}

// ---------------------------------------------------------------------------
// Credit Customer & Vehicle Slips
// ---------------------------------------------------------------------------
export interface CreditSaleItem {
  id: number;
  bill_no: string;
  slip_no: string;
  date: string;
  customer_name: string;
  customer_mobile?: string;
  vehicle_no: string;
  product: string;
  qty: number;
  rate: number;
  amount: number;
  cash_paid: number;
  credit_amount: number;
  balance_after: number;
  odometer_km?: number;
  driver_name?: string;
  indent_no?: string;
}

export interface CustomerFull {
  id: number;
  code: string;
  name: string;
  city?: string;
  state?: string;
  mobile: string;
  pan_no?: string;
  gst_no?: string;
  credit_limit: number;
  current_outstanding: number;
  bill_period: string;
  is_blocked?: boolean;
  vehicles: string[];
}

// ---------------------------------------------------------------------------
// Tank Dip Register & Losses
// ---------------------------------------------------------------------------
export interface DipRegisterItem {
  id: number;
  date: string;
  tank_name: string;
  opening_dip: number;
  opening_stock: number;
  receipt: number;
  closing_dip: number;
  closing_stock: number;
  dip_sale: number;
  meter_sale: number;
  variation: number;
  tolerance_limit: number;
}

// ---------------------------------------------------------------------------
// Denomination & Cash Reconciliation
// ---------------------------------------------------------------------------
export interface DenominationMap {
  n2000: number;
  n500: number;
  n200: number;
  n100: number;
  n50: number;
  n20: number;
  n10: number;
  n5: number;
  coins: number;
}

export interface SettlementCalculationResult {
  cash_total: number;
  expected_cash: number;
  gap_amount: number;
  status: 'BALANCED' | 'SHORTAGE' | 'EXCESS' | string;
}

export interface ShiftSettlementItem {
  id: number;
  shift_so: string;
  shift_name: string;
  date: string;
  employee: string;
  cash_total: number;
  credit_total: number;
  digital_total: number;
  expense_total: number;
  expected_cash: number;
  actual_cash: number;
  gap_amount: number;
  settled_at: string;
}

// ---------------------------------------------------------------------------
// Tanker Decanting Inward Purchase
// ---------------------------------------------------------------------------
export interface PurchaseHistoryItem {
  id: number;
  invoice_no: string;
  date: string;
  dealer_name: string;
  tanker_vehicle_no: string;
  product: string;
  tank: string;
  qty_kl: number;
  qty_liters: number;
  rate_per_kl: number;
  gross_amount: number;
  vat_amount: number;
  final_amount: number;
  sample_density: number;
}

// ---------------------------------------------------------------------------
// Expenses, Bank Transfers, & Payments
// ---------------------------------------------------------------------------
export interface ExpenseEntry {
  id: number;
  date: string;
  category: string;
  amount: number;
  narration?: string;
  paid_to?: string;
}

export interface PaymentReceiptItem {
  id: number;
  receipt_no: string;
  date: string;
  customer_name: string;
  amount: number;
  payment_mode: 'Cash' | 'Cheque' | 'NEFT' | 'RTGS' | 'UPI' | 'Company Card' | string;
  bank_name?: string;
  cheque_no?: string;
  remarks?: string;
}

export interface CardSettlementItem {
  id: number;
  date: string;
  machine_name: string;
  batch_no: string;
  slip_count: number;
  amount: number;
}

// ---------------------------------------------------------------------------
// Regulatory & Statutory Reports (VAT, DSR, Profit, TDS, LFR)
// ---------------------------------------------------------------------------
export interface DsrReportItem {
  date: string;
  product: string;
  opening_stock: number;
  inward_purchase: number;
  total_stock: number;
  testing_qty: number;
  meter_sales: number;
  closing_book_stock: number;
  closing_dip_stock: number;
  variation: number;
  tolerance_limit: number;
  status: 'NORMAL' | 'EXCESS_LOSS' | string;
}

export interface DayWiseVatItem {
  date: string;
  product: string;
  sale_qty: number;
  purchase_rate: number;
  sale_rate: number;
  sale_amount: number;
  vat_amount: number;
  gross_profit: number;
  net_profit: number;
  profit_per_liter: number;
}

export interface VatSummaryResponse {
  period: string;
  total_output_vat: number;
  total_input_itc: number;
  net_vat_payable: number;
  daywise: DayWiseVatItem[];
}

export interface LfrSummaryResponse {
  total_lfr_amount: number;
  threshold_limit: number;
  is_tds_applicable: boolean;
  tds_rate_percent: number;
  calculated_tds: number;
}

export interface TdsSummaryResponse {
  turnover_above_10cr: boolean;
  sec_194q_rate: number;
  total_purchases_amount: number;
  total_tds_payable: number;
}

export interface ProfitLossSummaryResponse {
  gross_sales: number;
  cogs_purchases: number;
  gross_margin: number;
  operating_expenses: number;
  evaporation_loss_allowance: number;
  net_dealer_profit: number;
}

// ---------------------------------------------------------------------------
// Cloudflare R2 Backups & Disaster Recovery
// ---------------------------------------------------------------------------
export interface BackupItem {
  key: string;
  filename: string;
  size_bytes: number;
  size_kb: number;
  last_modified: string;
  storage: string;
}

export interface BackupStatusResponse {
  status: string;
  r2_connection: {
    connected: boolean;
    configured: boolean;
    bucket?: string;
    endpoint?: string;
    message: string;
    error_code?: string;
  };
  backup_count: number;
  latest_backup: BackupItem | null;
  configuration_instructions: {
    required_env_vars: string[];
    help_url: string;
  };
}

export interface CreateBackupResponse {
  status: string;
  filename: string;
  size_kb: number;
  total_records: number;
  sha256: string;
  storage: string;
  uploaded_to_r2: boolean;
  r2_key?: string;
  message: string;
  stats: Record<string, number>;
  created_at: string;
}
