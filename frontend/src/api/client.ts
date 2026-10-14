const rawUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');
export const API_BASE_URL = rawUrl
  ? rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
    ? rawUrl
    : `https://${rawUrl}`
  : 'https://nsaipetrosoft-production.up.railway.app';

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
export interface HealthResponse {
  status: string;
  database: string;
  environment: string;
  timestamp: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed with status: ${response.status}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Petrol Pump ERP Interfaces & APIs
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

export interface DashboardResponse {
  kpis: DashboardKPIs;
  breakdown: PaymentBreakdown;
  tanks: TankStock[];
  customers: CustomerOutstanding[];
  accounts: BankAccountItem[];
  active_shift: {
    so_number: string;
    date: string;
    shift_name: string;
    status: string;
  };
}

export async function fetchDashboard(): Promise<DashboardResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/dashboard`);
  if (!res.ok) throw new Error(`Dashboard API failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Rates
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

export async function fetchRates(): Promise<RatesResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/rates`);
  if (!res.ok) throw new Error(`Rates API failed: ${res.status}`);
  return res.json();
}

export async function updateRate(productId: number, rate: number): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId, rate }),
  });
  if (!res.ok) throw new Error(`Update rate failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Shift Sales & Nozzle Readings
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

export interface ShiftDetailsResponse {
  so_number: string;
  date: string;
  shift_name: string;
  status: string;
  employees: { id: number; name: string; code: string }[];
  nozzles: NozzleMeterItem[];
}

export async function fetchCurrentShift(): Promise<ShiftDetailsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/shifts/current`);
  if (!res.ok) throw new Error(`Current shift API failed: ${res.status}`);
  return res.json();
}

export async function saveShiftMeters(data: {
  shift_name: string;
  readings: {
    nozzle_id: number;
    employee_id?: number;
    opening_meter: number;
    closing_meter: number;
    testing_qty: number;
    lube_amount?: number;
  }[];
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/shifts/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Save shift meters failed: ${res.status}`);
  return res.json();
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
  vehicle_no: string;
  product: string;
  qty: number;
  rate: number;
  amount: number;
  cash_paid: number;
  credit_amount: number;
  balance_after: number;
}

export async function fetchCreditSales(): Promise<CreditSaleItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/credit-sales`);
  if (!res.ok) throw new Error(`Credit sales API failed: ${res.status}`);
  return res.json();
}

export async function createCreditSale(data: {
  customer_id: number;
  vehicle_no: string;
  product_id: number;
  nozzle_id?: number;
  slip_no: string;
  qty: number;
  rate?: number;
  discount_percent?: number;
  cash_paid?: number;
  remarks?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/credit-sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create credit sale failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Customers & Vehicles
// ---------------------------------------------------------------------------
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
  vehicles: string[];
}

export async function fetchCustomers(): Promise<CustomerFull[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/customers`);
  if (!res.ok) throw new Error(`Customers API failed: ${res.status}`);
  return res.json();
}

export async function createCustomer(data: {
  name: string;
  mobile: string;
  city?: string;
  state?: string;
  address?: string;
  gst_no?: string;
  pan_no?: string;
  credit_limit?: number;
  bill_period?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create customer failed: ${res.status}`);
  return res.json();
}

export async function addVehicle(customerId: number, vehicleNo: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: customerId, vehicle_no: vehicleNo }),
  });
  if (!res.ok) throw new Error(`Add vehicle failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Tank Dip Register
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

export async function fetchDips(): Promise<DipRegisterItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/dips`);
  if (!res.ok) throw new Error(`Dips API failed: ${res.status}`);
  return res.json();
}

export async function createTankDip(data: {
  tank_id: number;
  opening_dip: number;
  opening_stock: number;
  receipt_liters: number;
  closing_dip: number;
  closing_stock: number;
  notes?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/dips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create dip failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Cash Denomination Settlement
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

export async function calculateSettlement(data: {
  denominations: DenominationMap;
  digital_cards: number;
  credit_sales: number;
  expenses: number;
  credit_collections: number;
  total_meter_sales: number;
}): Promise<{
  cash_total: number;
  expected_cash: number;
  gap_amount: number;
  status: string;
}> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/settlements/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Settlement API failed: ${res.status}`);
  return res.json();
}

export async function saveShiftSettlement(data: {
  shift_id?: number;
  shift_name?: string;
  employee_id?: number;
  remarks?: string;
  denominations: DenominationMap;
  cash_total: number;
  digital_total?: number;
  credit_total?: number;
  expense_total?: number;
  expected_cash: number;
  actual_cash: number;
  gap_amount: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/settlements/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Save Settlement API failed: ${res.status}`);
  return res.json();
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

export async function fetchShiftSettlements(): Promise<ShiftSettlementItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/settlements`);
  if (!res.ok) throw new Error(`Settlements history API failed: ${res.status}`);
  return res.json();
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

export async function fetchPurchases(): Promise<PurchaseHistoryItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/purchases`);
  if (!res.ok) throw new Error(`Purchases API failed: ${res.status}`);
  return res.json();
}

export async function createPurchase(data: {
  invoice_no: string;
  dealer_name: string;
  tanker_vehicle_no: string;
  wooden_seals?: string;
  aluminum_seals?: string;
  sample_density: number;
  product_id: number;
  tank_id?: number;
  qty_kl: number;
  rate_per_kl: number;
  basic_excise?: number;
  vat_percent?: number;
  cess_percent?: number;
  tcs_amount?: number;
  freight?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create purchase failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Reports: DSR, VAT, Profit
// ---------------------------------------------------------------------------
export async function fetchDsrReport(): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/reports/dsr`);
  if (!res.ok) throw new Error(`DSR Report API failed: ${res.status}`);
  return res.json();
}

export async function fetchVatSummary(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/reports/vat-summary`);
  if (!res.ok) throw new Error(`VAT Summary API failed: ${res.status}`);
  return res.json();
}

export async function fetchProfitSummary(): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/reports/profit-summary`);
  if (!res.ok) throw new Error(`Profit Summary API failed: ${res.status}`);
  return res.json();
}

export async function fetchTdsSummary(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/reports/tds-summary`);
  if (!res.ok) throw new Error(`TDS Summary API failed: ${res.status}`);
  return res.json();
}

export async function fetchDealerCommission(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/reports/dealer-commission`);
  if (!res.ok) throw new Error(`Dealer Commission API failed: ${res.status}`);
  return res.json();
}

export async function fetchLfrSummary(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/reports/lfr-summary`);
  if (!res.ok) throw new Error(`LFR Summary API failed: ${res.status}`);
  return res.json();
}

export async function fetchProfitLossSummary(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/reports/profit-loss`);
  if (!res.ok) throw new Error(`Profit Loss API failed: ${res.status}`);
  return res.json();
}


// ---------------------------------------------------------------------------
// Expenses, Transfers, Customer Statements, Stamping
// ---------------------------------------------------------------------------
export async function fetchExpenses(): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/expenses`);
  if (!res.ok) throw new Error(`Expenses API failed: ${res.status}`);
  return res.json();
}

export async function createExpense(data: {
  category: string;
  amount: number;
  narration?: string;
  paid_to?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create expense failed: ${res.status}`);
  return res.json();
}

export async function createTransfer(data: {
  from_account_id: number;
  to_account_id: number;
  amount: number;
  remarks?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/transfers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Transfer API failed: ${res.status}`);
  return res.json();
}

export async function fetchCustomerStatement(customerId: number): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/customers/${customerId}/statement`);
  if (!res.ok) throw new Error(`Statement API failed: ${res.status}`);
  return res.json();
}

export async function fetchStampingReminders(): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/stamping-reminders`);
  if (!res.ok) throw new Error(`Stamping API failed: ${res.status}`);
  return res.json();
}

export async function fetchPayments(): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/payments`);
  if (!res.ok) throw new Error(`Payments API failed: ${res.status}`);
  return res.json();
}

export async function createPaymentReceipt(data: {
  customer_id: number;
  amount: number;
  payment_mode?: string;
  bank_name?: string;
  cheque_no?: string;
  remarks?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create payment receipt failed: ${res.status}`);
  return res.json();
}

export async function createBankAccount(data: {
  account_name: string;
  account_type?: string;
  balance?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/bank-accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create bank account failed: ${res.status}`);
  return res.json();
}

export async function createCardSettlement(data: {
  machine_name: string;
  batch_no: string;
  slip_count: number;
  amount: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/card-settlements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Card settlement failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Cloudflare R2 Disaster Recovery & Database Backups
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

export async function fetchBackupStatus(): Promise<BackupStatusResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/backups/status`);
  if (!res.ok) throw new Error(`Backup status API failed: ${res.status}`);
  return res.json();
}

export async function fetchBackupsList(): Promise<BackupItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/backups`);
  if (!res.ok) throw new Error(`Backups list API failed: ${res.status}`);
  return res.json();
}

export async function triggerCreateBackup(): Promise<CreateBackupResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/pump/backups/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Create backup API failed: ${res.status}`);
  return res.json();
}

export function getBackupDownloadUrl(filename: string): string {
  return `${API_BASE_URL}/api/v1/pump/backups/download/${encodeURIComponent(filename)}`;
}

export function getMasterExcelDownloadUrl(): string {
  return `${API_BASE_URL}/api/v1/pump/backups/export-excel`;
}

