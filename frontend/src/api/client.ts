const rawEnv = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '').trim();
let sanitizedUrl = rawEnv.replace(/\/+$/, '');
if (sanitizedUrl.endsWith('/api/v1')) {
  sanitizedUrl = sanitizedUrl.slice(0, -7).replace(/\/+$/, '');
}
export const API_BASE_URL = sanitizedUrl
  ? sanitizedUrl.startsWith('http://') || sanitizedUrl.startsWith('https://')
    ? sanitizedUrl
    : `https://${sanitizedUrl}`
  : 'https://nsaipetrosoft-production.up.railway.app';

/**
 * Executes a fetch request with a strict AbortController timeout (default 2500ms).
 * Prevents UI preloader deadlocks on Cloudflare Pages when the Railway backend is asleep/down.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 2500
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      credentials: 'include',
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Forecourt API request timed out after ${timeoutMs}ms (${url})`);
    }
    throw err;
  }
}

export type * from '../models';
import type { StationProfile } from '../models';

// In-memory runtime session token (ZERO localStorage storage)
let inMemoryManagerToken: string | null = null;

// Purge any legacy browser storage tokens
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('nsai_manager_token');
    localStorage.removeItem('nsai_auth_token');
  }
} catch {}

export function setManagerToken(token: string | null): void {
  inMemoryManagerToken = token;
}

export function getAuthHeaders(): Record<string, string> {
  return inMemoryManagerToken ? { Authorization: `Bearer ${inMemoryManagerToken}` } : {};
}

export interface VerifyPinResponse {
  authorized: boolean;
  message: string;
  authorized_by: string;
  role: string;
  token?: string;
}

export async function verifyManagerPinApi(pin: string, actionTitle?: string): Promise<VerifyPinResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, action_title: actionTitle }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Invalid PIN (Status: ${res.status})`);
  }
  const data = await res.json();
  if (data.token) {
    setManagerToken(data.token);
  }
  return data;
}

export interface ThermalSlipResponse {
  sale_id: number;
  bill_no: string;
  slip_no: string;
  customer: string;
  vehicle_no: string;
  slip_text: string;
  html: string;
}

export async function fetchCreditSaleThermalSlip(saleId: number): Promise<ThermalSlipResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/credit-sales/${saleId}/thermal-slip`);
  if (!res.ok) throw new Error(`Fetch thermal slip failed: ${res.status}`);
  return res.json();
}


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
  const response = await fetchWithTimeout(`${API_BASE_URL}/health`);
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/dashboard`);
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/rates`);
  if (!res.ok) throw new Error(`Rates API failed: ${res.status}`);
  return res.json();
}

export async function updateRate(productId: number, rate: number): Promise<{ message: string }> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/rates`, {
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/shifts/current`);
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
    is_rollover?: boolean;
    max_meter_digits?: number;
    split_closing_meter?: number;
    split_rate?: number;
  }[];
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/shifts/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Save shift meters failed: ${res.status}`);
  }
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
  customer_mobile?: string;
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/credit-sales`);
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
  odometer_km?: number;
  driver_name?: string;
  driver_mobile?: string;
  indent_no?: string;
  manager_override_pin?: string;
  remarks?: string;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/credit-sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Create credit sale failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteCreditSale(saleId: number): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/credit-sales/${saleId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Delete credit sale failed: ${res.status}`);
  }
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
  is_blocked?: boolean;
  vehicles: string[];
}

export async function fetchCustomers(): Promise<CustomerFull[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/customers`);
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create customer failed: ${res.status}`);
  return res.json();
}

export async function addVehicle(customerId: number, vehicleNo: string): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: customerId, vehicle_no: vehicleNo }),
  });
  if (!res.ok) throw new Error(`Add vehicle failed: ${res.status}`);
  return res.json();
}

export async function updateCustomer(
  customerId: number,
  data: {
    name?: string;
    mobile?: string;
    city?: string;
    state?: string;
    address?: string;
    gst_no?: string;
    pan_no?: string;
    credit_limit?: number;
    bill_period?: string;
  }
): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/customers/${customerId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Update customer failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteCustomer(customerId: number): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/customers/${customerId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete customer failed: ${res.status}`);
  }
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/dips`);
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/dips`, {
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/settlements/calculate`, {
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/settlements/save`, {
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/settlements`);
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/purchases`);
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
  observed_density?: number;
  observed_temp?: number;
  invoice_density_15c?: number;
  manager_override_pin?: string;
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Create purchase failed: ${res.status}`);
  }
  return res.json();
}

export async function deletePurchase(purchaseId: number): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/purchases/${purchaseId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Delete purchase failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Reports: DSR, VAT, Profit
// ---------------------------------------------------------------------------
export async function fetchDsrReport(): Promise<any[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/reports/dsr`);
  if (!res.ok) throw new Error(`DSR Report API failed: ${res.status}`);
  return res.json();
}

export async function fetchVatSummary(): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/reports/vat-summary`);
  if (!res.ok) throw new Error(`VAT Summary API failed: ${res.status}`);
  return res.json();
}

export async function fetchProfitSummary(): Promise<any[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/reports/profit-summary`);
  if (!res.ok) throw new Error(`Profit Summary API failed: ${res.status}`);
  return res.json();
}

export async function fetchTdsSummary(): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/reports/tds-summary`);
  if (!res.ok) throw new Error(`TDS Summary API failed: ${res.status}`);
  return res.json();
}

export async function fetchDealerCommission(): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/reports/dealer-commission`);
  if (!res.ok) throw new Error(`Dealer Commission API failed: ${res.status}`);
  return res.json();
}

export async function fetchLfrSummary(): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/reports/lfr-summary`);
  if (!res.ok) throw new Error(`LFR Summary API failed: ${res.status}`);
  return res.json();
}

export async function fetchProfitLossSummary(): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/reports/profit-loss`);
  if (!res.ok) throw new Error(`Profit Loss API failed: ${res.status}`);
  return res.json();
}


// ---------------------------------------------------------------------------
// Expenses, Transfers, Customer Statements, Stamping
// ---------------------------------------------------------------------------
export async function fetchExpenses(): Promise<any[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/expenses`);
  if (!res.ok) throw new Error(`Expenses API failed: ${res.status}`);
  return res.json();
}

export async function createExpense(data: {
  category: string;
  amount: number;
  narration?: string;
  paid_to?: string;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create expense failed: ${res.status}`);
  return res.json();
}

export async function deleteExpense(expenseId: number): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/expenses/${expenseId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Delete expense failed: ${res.status}`);
  }
  return res.json();
}

export async function createTransfer(data: {
  from_account_id: number;
  to_account_id: number;
  amount: number;
  remarks?: string;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/transfers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Transfer API failed: ${res.status}`);
  return res.json();
}

export async function fetchCustomerStatement(customerId: number): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/customers/${customerId}/statement`);
  if (!res.ok) throw new Error(`Statement API failed: ${res.status}`);
  return res.json();
}

export async function fetchStampingReminders(): Promise<any[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/stamping-reminders`);
  if (!res.ok) throw new Error(`Stamping API failed: ${res.status}`);
  return res.json();
}

export async function fetchPayments(): Promise<any[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/payments`);
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create payment receipt failed: ${res.status}`);
  return res.json();
}

export async function deletePaymentReceipt(paymentId: number): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/payments/${paymentId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Delete payment receipt failed: ${res.status}`);
  }
  return res.json();
}

export async function createBankAccount(data: {
  account_name: string;
  account_type?: string;
  balance?: number;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/bank-accounts`, {
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/card-settlements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Card settlement failed: ${res.status}`);
  return res.json();
}

export async function fetchCardSettlements(): Promise<any[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/card-settlements`);
  if (!res.ok) throw new Error(`Fetch card settlements failed: ${res.status}`);
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
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/backups/status`);
  if (!res.ok) throw new Error(`Backup status API failed: ${res.status}`);
  return res.json();
}

export async function fetchBackupsList(): Promise<BackupItem[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/backups`);
  if (!res.ok) throw new Error(`Backups list API failed: ${res.status}`);
  return res.json();
}

export async function triggerCreateBackup(): Promise<CreateBackupResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/backups/create`, {
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

export async function resetOperationsToCleanSlate(): Promise<{ status: string; message: string }> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/system/reset-operations?confirm=CONFIRM_CLEAN_SLATE`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Reset operations failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Tank Strapping & Dip Volume Calculation API
// ---------------------------------------------------------------------------
export interface DipCalculationResult {
  tank_id: number;
  tank_name: string;
  dip_cm: number;
  volume_liters: number;
  capacity_liters: number;
  fill_percent: number;
}

export async function calculateDipVolumeApi(tankId: number, dipCm: number): Promise<DipCalculationResult> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/tanks/${tankId}/calculate-dip?dip_cm=${dipCm}`);
  if (!res.ok) throw new Error(`Calculate dip failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Tanker ASTM Table 53B Density Verification API
// ---------------------------------------------------------------------------
export interface DensityVerificationRequest {
  product_code: string;
  invoice_density: number;
  observed_density: number;
  observed_temp_c: number;
}

export interface DensityVerificationResult {
  product_code: string;
  invoice_density: number;
  observed_density: number;
  observed_temp_c: number;
  converted_density_15c: number;
  density_difference: number;
  is_within_tolerance: boolean;
  tolerance_limit: number;
  status: 'PASS' | 'REJECT';
  message: string;
}

export async function verifyTankerDensityApi(payload: DensityVerificationRequest): Promise<DensityVerificationResult> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/purchases/verify-density`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Verify density API failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Customer Credit Block / Unblock Toggle API
// ---------------------------------------------------------------------------
export interface ToggleBlockResult {
  id: number;
  name: string;
  is_blocked: boolean;
  status: string;
  message: string;
}

export async function toggleCustomerBlockApi(customerId: number): Promise<ToggleBlockResult> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/customers/${customerId}/toggle-block`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(`Toggle block failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Store / Station Profile Settings API (Cloud Database Sync)
// ---------------------------------------------------------------------------
export async function fetchStationProfileApi(): Promise<StationProfile | null> {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/station-profile`, {}, 3000);
    if (!res.ok) {
      // Endpoint not deployed or 404: gracefully return null so local state is retained
      return null;
    }
    const data = await res.json();
    if (!data || !data.station_name) return null;
    return {
      stationName: data.station_name || 'NSAIPETROSOFT RETAIL OUTLET',
      oilCompany: data.oil_company || 'BHARAT PETROLEUM CORPORATION LTD',
      dealerCode: data.dealer_code || '',
      address: data.address || '',
      city: data.city || '',
      state: data.state || '',
      stateCode: data.state_code || '',
      pincode: data.pincode || '',
      gstin: data.gstin || '',
      panNo: data.pan_no || '',
      phone: data.phone || '',
      upiVpa: data.upi_vpa || '',
      printerPaperWidth: data.printer_paper_width === '58mm' ? '58mm' : '80mm',
      managerPin: data.manager_pin || '',
    };
  } catch (_err) {
    // Suppress network/offline errors; fallback transparently to memory profile
    return null;
  }
}

export async function saveStationProfileApi(profile: StationProfile): Promise<any> {
  try {
    const payload = {
      station_name: profile.stationName,
      oil_company: profile.oilCompany,
      dealer_code: profile.dealerCode || '',
      address: profile.address || '',
      city: profile.city || '',
      state: profile.state || '',
      state_code: profile.stateCode || '',
      pincode: profile.pincode || '',
      gstin: profile.gstin || '',
      pan_no: profile.panNo || '',
      phone: profile.phone || '',
      upi_vpa: profile.upiVpa || '',
      printer_paper_width: profile.printerPaperWidth || '80mm',
      manager_pin: profile.managerPin || undefined,
    };
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/station-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch (_err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hardware Meter Replacement / Swap API
// ---------------------------------------------------------------------------
export async function recordMeterSwapApi(
  nozzleId: number,
  data: {
    old_final_meter: number;
    new_initial_meter: number;
    reason: string;
    wm_seal_no?: string;
    manager_pin: string;
  }
): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/nozzles/${nozzleId}/meter-swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Meter swap failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchMeterSwapsApi(nozzleId: number): Promise<any[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/nozzles/${nozzleId}/meter-swaps`);
  if (!res.ok) throw new Error(`Fetch meter swaps failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Underground Tank Strapping / Calibration Chart API
// ---------------------------------------------------------------------------
export async function fetchTankStrappingChartApi(tankId: number): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/tanks/${tankId}/strapping-chart`);
  if (!res.ok) throw new Error(`Fetch strapping chart failed: ${res.status}`);
  return res.json();
}

export async function saveTankStrappingChartApi(
  tankId: number,
  points: Array<{ dip_cm: number; volume_liters: number; notes?: string }>
): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/tanks/${tankId}/strapping-chart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) throw new Error(`Save strapping chart failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Packaged Lubricants & DEF (AdBlue) Stock API
// ---------------------------------------------------------------------------
export async function fetchLubesApi(): Promise<any[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/lubes`);
  if (!res.ok) throw new Error(`Fetch lubes failed: ${res.status}`);
  return res.json();
}

export async function saveLubeProductApi(data: any): Promise<any> {
  const normalized = {
    code: (data.code || data.product_code || data.item_code || `LUB-${Date.now().toString().slice(-4)}`).toString().trim().toUpperCase(),
    name: (data.name || data.product_name || data.item_name || 'LUBRICANT').toString().trim().toUpperCase(),
    category: data.category || '4T Engine Oil',
    package_size: data.package_size || data.pack_size || '1 Litre',
    barcode: data.barcode || null,
    mrp: Number(data.mrp ?? data.sale_price ?? 0),
    sale_price: Number(data.sale_price ?? 0),
    cost_price: Number(data.cost_price ?? 0),
    current_stock_units: Number(data.current_stock_units ?? data.stock_qty ?? 0),
    reorder_level: Number(data.reorder_level ?? 5),
  };
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/lubes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(normalized),
  });
  if (!res.ok) throw new Error(`Save lube item failed: ${res.status}`);
  return res.json();
}

export async function recordLubeSaleApi(data: {
  shift_id?: number;
  lube_product_id: number;
  qty_units: number;
  rate?: number;
  payment_mode?: string;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/lubes/sale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Lube sale failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Employee Shortage Recovery API
// ---------------------------------------------------------------------------
export async function settleEmployeeShortageApi(
  empId: number,
  data: {
    amount: number;
    settlement_type: string;
    notes?: string;
    manager_pin: string;
  }
): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/employees/${empId}/settle-shortage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Settle shortage failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchEmployeeShortagesApi(empId: number): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/employees/${empId}/shortages`);
  if (!res.ok) throw new Error(`Fetch shortages failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Statutory Inspection Registers (Weights & Measures & Density)
// ---------------------------------------------------------------------------
export async function fetchStampingRegisterApi(): Promise<any[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/reports/stamping-register`);
  if (!res.ok) throw new Error(`Fetch stamping register failed: ${res.status}`);
  return res.json();
}

export async function fetchDensityRegisterApi(): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/reports/density-register`);
  if (!res.ok) throw new Error(`Fetch density register failed: ${res.status}`);
  return res.json();
}



