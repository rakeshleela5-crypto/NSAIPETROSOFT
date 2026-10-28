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
 * Automatically attaches an X-Idempotency-Key header with crypto.randomUUID() on all state-mutating requests (POST, PUT, PATCH).
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 2500
): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});

  // Automatically attach X-Idempotency-Key on state-mutating requests (POST, PUT, PATCH)
  if (['POST', 'PUT', 'PATCH'].includes(method) && !headers.has('X-Idempotency-Key')) {
    const idempotencyKey =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'idem-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now();
    headers.set('X-Idempotency-Key', idempotencyKey);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
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

export function getManagerToken(): string | null {
  return inMemoryManagerToken;
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
  id?: number;
  shift_id?: number;
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

export async function deleteCreditSale(saleId: number, managerPin?: string): Promise<any> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/credit-sales/${saleId}${pinParam}`, {
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
  current_outstanding?: number;
  opening_balance?: number;
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
    current_outstanding?: number;
    opening_balance?: number;
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

export async function deleteCustomer(customerId: number, managerPin?: string): Promise<any> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/customers/${customerId}${pinParam}`, {
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
  water_dip_cm?: number;
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
  water_dip_cm?: number;
  notes?: string;
  observed_density?: number;
  observed_temp?: number;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/dips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Create dip failed: ${res.status}`);
  }
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

export async function deletePurchase(purchaseId: number, managerPin?: string): Promise<any> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/purchases/${purchaseId}${pinParam}`, {
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

export async function deleteExpense(expenseId: number, managerPin?: string): Promise<any> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/expenses/${expenseId}${pinParam}`, {
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

export async function deletePaymentReceipt(paymentId: number, managerPin?: string): Promise<any> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/payments/${paymentId}${pinParam}`, {
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

export interface RestoreBackupResult {
  status: string;
  records_restored: number;
  table_stats: Record<string, number>;
  message: string;
}

export async function restoreBackupApi(
  payload: { data?: any; filename?: string; snapshot?: any },
  managerPin?: string
): Promise<RestoreBackupResult> {
  const pinParam = managerPin ? `?pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/api/v1/pump/backups/restore${pinParam}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    15000
  );
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Database restore failed (${res.status})`);
  }
  return res.json();
}

export interface SupervisorReversalVoucherItem {
  id: number;
  voucher_no: string;
  action_type: string;
  target_reference: string;
  amount: number;
  reason: string;
  authorized_by: string;
  created_at: string;
}

export async function fetchReversalVouchersApi(managerPin?: string): Promise<SupervisorReversalVoucherItem[]> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/reversal-vouchers${pinParam}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Fetch reversal vouchers failed: ${res.status}`);
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

export async function saveStationProfileApi(profile: StationProfile, currentManagerPin?: string): Promise<any> {
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
    current_manager_pin: currentManagerPin || profile.managerPin || '1234',
  };
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/station-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to update station profile (${res.status})`);
  }
  return await res.json().catch(() => ({ message: 'Station profile updated successfully' }));
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

export interface BulkImportResponse {
  status: string;
  message: string;
  total_rows: number;
  inserted: number;
  updated: number;
  vehicles_added?: number;
  errors?: Array<{ row: number; error: string }>;
  products?: any[];
}

export async function bulkImportLubesCsvApi(payload: {
  csv_content?: string;
  items?: any[];
}): Promise<BulkImportResponse> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/api/v1/pump/lubes/bulk-import-csv`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(payload),
    },
    30000
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Lube bulk CSV import failed (${res.status})`);
  }
  return res.json();
}

export async function bulkImportCustomersCsvApi(payload: {
  csv_content?: string;
  items?: any[];
}): Promise<BulkImportResponse> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/api/v1/pump/customers/bulk-import-csv`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(payload),
    },
    30000
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Customer fleet bulk CSV import failed (${res.status})`);
  }
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

// ---------------------------------------------------------------------------
// Tanks CRUD APIs
// ---------------------------------------------------------------------------
export interface TankCrudItem {
  id: number;
  name: string;
  tank_name: string;
  product_id: number;
  product: string;
  product_name: string;
  code: string;
  product_code: string;
  capacity: number;
  capacity_liters: number;
  current_stock: number;
  current_dip_cm: number;
  min_alert_level: number;
  percent: number;
  is_low: boolean;
  connected_nozzles: string[];
}

export async function fetchTanksApi(): Promise<TankCrudItem[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/tanks`);
  if (!res.ok) throw new Error(`Fetch tanks failed: ${res.status}`);
  return res.json();
}

export async function createTankApi(data: {
  tank_name: string;
  product_id?: number;
  product_code?: string;
  capacity_liters?: number;
  current_stock?: number;
  current_dip_cm?: number;
  min_alert_level?: number;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/tanks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Create tank failed: ${res.status}`);
  }
  return res.json();
}

export async function updateTankApi(
  tankId: number,
  data: {
    tank_name?: string;
    product_id?: number;
    product_code?: string;
    capacity_liters?: number;
    current_stock?: number;
    current_dip_cm?: number;
    min_alert_level?: number;
  }
): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/tanks/${tankId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Update tank failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteTankApi(tankId: number, managerPin?: string): Promise<any> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/tanks/${tankId}${pinParam}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete tank failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Nozzles CRUD APIs
// ---------------------------------------------------------------------------
export interface NozzleCrudItem {
  id: number;
  name: string;
  nozzle_name: string;
  machine_name: string;
  tank_id: number;
  tank_name: string;
  product_id: number;
  product_name: string;
  product_code: string;
  current_meter: number;
  rate: number;
  vat_percent: number;
  active: boolean;
}

export async function fetchNozzlesApi(): Promise<NozzleCrudItem[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/nozzles`);
  if (!res.ok) throw new Error(`Fetch nozzles failed: ${res.status}`);
  return res.json();
}

export async function createNozzleApi(data: {
  nozzle_name: string;
  machine_name?: string;
  tank_id: number;
  product_id?: number;
  product_code?: string;
  current_meter?: number;
  active?: boolean;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/nozzles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Create nozzle failed: ${res.status}`);
  }
  return res.json();
}

export async function updateNozzleApi(
  nozzleId: number,
  data: {
    nozzle_name?: string;
    machine_name?: string;
    tank_id?: number;
    product_id?: number;
    product_code?: string;
    current_meter?: number;
    active?: boolean;
  }
): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/nozzles/${nozzleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Update nozzle failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteNozzleApi(nozzleId: number, managerPin?: string): Promise<any> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/nozzles/${nozzleId}${pinParam}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete nozzle failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Employees / Attendants CRUD APIs
// ---------------------------------------------------------------------------
export interface EmployeeCrudItem {
  id: number;
  code: string;
  name: string;
  phone?: string;
  mobile?: string;
  role: string;
  active: boolean;
  shortage_balance: number;
}

export async function fetchEmployeesApi(): Promise<EmployeeCrudItem[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/employees`);
  if (!res.ok) throw new Error(`Fetch employees failed: ${res.status}`);
  return res.json();
}

export async function createEmployeeApi(data: {
  name: string;
  code?: string;
  phone?: string;
  mobile?: string;
  role?: string;
  active?: boolean;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Create employee failed: ${res.status}`);
  }
  return res.json();
}

export async function updateEmployeeApi(
  employeeId: number,
  data: {
    name?: string;
    code?: string;
    phone?: string;
    mobile?: string;
    role?: string;
    active?: boolean;
  }
): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/employees/${employeeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Update employee failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteEmployeeApi(employeeId: number, managerPin?: string): Promise<any> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/employees/${employeeId}${pinParam}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete employee failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Finalize & Close Shift API (PostgreSQL Immutability Enforcement)
// ---------------------------------------------------------------------------
export async function closeShiftApi(
  shiftId: number,
  managerPin?: string
): Promise<{ status: string; message: string; shift_id: number; shift_status: string }> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/shifts/${shiftId}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ manager_pin: managerPin || '1234' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Close shift failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Bank Accounts CRUD Additions
// ---------------------------------------------------------------------------
export async function updateBankAccountApi(
  accountId: number,
  data: { account_name?: string; account_type?: string; balance?: number }
): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/bank-accounts/${accountId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Update bank account failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteBankAccountApi(accountId: number, managerPin?: string): Promise<any> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/bank-accounts/${accountId}${pinParam}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete bank account failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Card Settlement Void / Deletion
// ---------------------------------------------------------------------------
export async function deleteCardSettlementApi(settlementId: number, managerPin?: string): Promise<any> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/card-settlements/${settlementId}${pinParam}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete card settlement failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Tank Dip Entry Deletion
// ---------------------------------------------------------------------------
export async function deleteTankDipApi(dipId: number, managerPin?: string): Promise<any> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/dips/${dipId}${pinParam}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete tank dip failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Packaged Lube & DEF Product Deletion
// ---------------------------------------------------------------------------
export async function deleteLubeProductApi(productId: number, managerPin?: string): Promise<any> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/lubes/${productId}${pinParam}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete lube product failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Contra Transfers API
// ---------------------------------------------------------------------------
export async function fetchTransfersApi(): Promise<any[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/transfers`);
  if (!res.ok) throw new Error(`Transfers API failed: ${res.status}`);
  return res.json();
}

export async function deleteTransferApi(transferId: number, managerPin?: string): Promise<any> {
  const url = managerPin
    ? `${API_BASE_URL}/api/v1/pump/transfers/${transferId}?manager_pin=${encodeURIComponent(managerPin)}`
    : `${API_BASE_URL}/api/v1/pump/transfers/${transferId}`;
  const res = await fetchWithTimeout(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete transfer failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Quotations & Estimates API
// ---------------------------------------------------------------------------
export async function fetchQuotationsApi(): Promise<any[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/quotations`);
  if (!res.ok) throw new Error(`Quotations API failed: ${res.status}`);
  return res.json();
}

export async function saveQuotationApi(data: any): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/quotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Save quotation failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteQuotationApi(quotationId: number, managerPin?: string): Promise<any> {
  const url = managerPin
    ? `${API_BASE_URL}/api/v1/pump/quotations/${quotationId}?manager_pin=${encodeURIComponent(managerPin)}`
    : `${API_BASE_URL}/api/v1/pump/quotations/${quotationId}`;
  const res = await fetchWithTimeout(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete quotation failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Customer Vehicle Deletion API
// ---------------------------------------------------------------------------
export async function deleteCustomerVehicleApi(customerId: number, vehicleNo: string, managerPin?: string): Promise<any> {
  const pinParam = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/api/v1/pump/customers/${customerId}/vehicles/${encodeURIComponent(vehicleNo)}${pinParam}`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete customer vehicle failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Weights & Measures Nozzle Stamping API
// ---------------------------------------------------------------------------
export async function updateNozzleStampingApi(
  nozzleId: number,
  data: {
    last_stamped_date: string;
    stamping_due_date?: string;
    wm_seal_no?: string;
    wm_certificate_no?: string;
    manager_pin?: string;
  }
): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/nozzles/${nozzleId}/stamping`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Update nozzle stamping failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Retail Cash Invoices & Walk-in POS Memos API
// ---------------------------------------------------------------------------
export interface RetailCashBillItem {
  id: number;
  bill_no: string;
  date: string;
  vehicle_no: string;
  product_name: string;
  product_code: string;
  qty: number;
  rate: number;
  amount: number;
  tax_amount?: number;
  payment_mode: 'CASH' | 'UPI' | 'SPLIT' | 'CREDIT';
  split_details?: string;
  driver_name?: string;
  status: string;
  created_at?: string;
}

export interface CreateCashBillPayload {
  bill_no?: string;
  date?: string;
  vehicle_no?: string;
  product_name: string;
  product_code?: string;
  qty: number;
  rate: number;
  amount: number;
  tax_amount?: number;
  payment_mode?: string;
  split_details?: string;
  driver_name?: string;
}

export async function fetchCashBillsApi(limit: number = 100): Promise<RetailCashBillItem[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/cash-bills?limit=${limit}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Fetch cash bills failed: ${res.status}`);
  }
  return res.json();
}

export async function saveCashBillApi(data: CreateCashBillPayload): Promise<RetailCashBillItem> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/cash-bills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Save cash bill failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteCashBillApi(billId: number, managerPin?: string): Promise<any> {
  const url = managerPin
    ? `${API_BASE_URL}/api/v1/pump/cash-bills/${billId}?manager_pin=${encodeURIComponent(managerPin)}`
    : `${API_BASE_URL}/api/v1/pump/cash-bills/${billId}`;
  const res = await fetchWithTimeout(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete cash bill failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Fuel Rate Revision Reversal API
// ---------------------------------------------------------------------------
export async function deleteRateHistoryApi(historyId: number, managerPin?: string): Promise<any> {
  const url = managerPin
    ? `${API_BASE_URL}/api/v1/pump/rates/history/${historyId}?manager_pin=${encodeURIComponent(managerPin)}`
    : `${API_BASE_URL}/api/v1/pump/rates/history/${historyId}`;
  const res = await fetchWithTimeout(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete rate history failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Nozzle Meter Replacement Swap Reversal API
// ---------------------------------------------------------------------------
export async function deleteMeterSwapApi(swapId: number, managerPin?: string): Promise<any> {
  const url = managerPin
    ? `${API_BASE_URL}/api/v1/pump/nozzles/meter-swaps/${swapId}?manager_pin=${encodeURIComponent(managerPin)}`
    : `${API_BASE_URL}/api/v1/pump/nozzles/meter-swaps/${swapId}`;
  const res = await fetchWithTimeout(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete meter swap failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Tank Strapping Calibration Chart Points API
// ---------------------------------------------------------------------------

export async function saveStrappingPointApi(
  tankId: number,
  point: { dip_cm: number; volume_liters: number; notes?: string }
): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/tanks/${tankId}/strapping-chart/point`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(point),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Save strapping point failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteStrappingPointApi(pointId: number, managerPin?: string): Promise<any> {
  const url = managerPin
    ? `${API_BASE_URL}/api/v1/pump/tanks/strapping-chart/${pointId}?manager_pin=${encodeURIComponent(managerPin)}`
    : `${API_BASE_URL}/api/v1/pump/tanks/strapping-chart/${pointId}`;
  const res = await fetchWithTimeout(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete strapping point failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Packaged Lube & DEF Sales API
// ---------------------------------------------------------------------------
export async function fetchLubeSalesApi(limit: number = 100): Promise<any[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/lubes/sales?limit=${limit}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Fetch lube sales failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteLubeSaleApi(saleId: number, managerPin?: string): Promise<any> {
  const url = managerPin
    ? `${API_BASE_URL}/api/v1/pump/lubes/sales/${saleId}?manager_pin=${encodeURIComponent(managerPin)}`
    : `${API_BASE_URL}/api/v1/pump/lubes/sales/${saleId}`;
  const res = await fetchWithTimeout(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Void lube sale failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Employee Shortage Ledger Deletion API
// ---------------------------------------------------------------------------
export async function deleteEmployeeShortageApi(shortageId: number, managerPin?: string): Promise<any> {
  const url = managerPin
    ? `${API_BASE_URL}/api/v1/pump/employees/shortages/${shortageId}?manager_pin=${encodeURIComponent(managerPin)}`
    : `${API_BASE_URL}/api/v1/pump/employees/shortages/${shortageId}`;
  const res = await fetchWithTimeout(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Void employee shortage failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Expenses CRUD API (Committed to PostgreSQL & Cash on Hand)
// ---------------------------------------------------------------------------
export async function createExpenseApi(data: {
  category: string;
  amount: number;
  narration?: string;
  paid_to?: string;
  account_id?: number;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Create expense failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteExpenseApi(expenseId: number): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/expenses/${expenseId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete expense failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Forecourt Automation Dispenser Controller API
// ---------------------------------------------------------------------------
export interface ForecourtLogItem {
  id: number;
  tx_id: string;
  event_time: string;
  pump_id: number;
  nozzle_name: string;
  product_name: string;
  product_code: string;
  liters: number;
  rate: number;
  amount: number;
  protocol: string;
  controller_ip: string;
  status: string;
  created_at: string;
}

export async function fetchForecourtLogsApi(status?: string, limit: number = 50): Promise<ForecourtLogItem[]> {
  const q = status ? `?status=${encodeURIComponent(status)}&limit=${limit}` : `?limit=${limit}`;
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/automation/logs${q}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(`Forecourt logs failed: ${res.status}`);
  return res.json();
}

export async function simulateForecourtDropApi(data: {
  pump_id: number;
  nozzle_name: string;
  product_name: string;
  product_code?: string;
  liters: number;
  rate: number;
  protocol?: string;
  controller_ip?: string;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/automation/simulate-drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Simulate dispenser drop failed: ${res.status}`);
  }
  return res.json();
}

export async function pushForecourtLogToPosApi(data: {
  log_id: number;
  payment_mode?: string;
  customer_name?: string;
  vehicle_no?: string;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/automation/push-to-pos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Push to POS failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Shift Cash Safe Drops API
// ---------------------------------------------------------------------------
export interface ShiftCashDropItem {
  id: number;
  shift_id?: number;
  employee_id?: number;
  employee_name: string;
  drop_time: string;
  amount: number;
  vault_account_id: number;
  vault_name: string;
  witness_name?: string;
  notes?: string;
  created_at: string;
}

export async function fetchCashDropsApi(shiftId?: number): Promise<ShiftCashDropItem[]> {
  const q = shiftId ? `?shift_id=${shiftId}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/cash-drops${q}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(`Cash drops API failed: ${res.status}`);
  return res.json();
}

export async function recordCashDropApi(data: {
  shift_id?: number;
  employee_id?: number;
  amount: number;
  vault_account_id?: number;
  witness_name?: string;
  notes?: string;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/cash-drops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Safe drop failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteCashDropApi(dropId: number, managerPin?: string): Promise<any> {
  const q = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/cash-drops/${dropId}${q}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Void safe drop failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// DSM Employee Attendance & Cash Float API
// ---------------------------------------------------------------------------
export interface EmployeeAttendanceItem {
  id: number;
  employee_id: number;
  employee_name: string;
  shift_id?: number;
  date: string;
  status: string;
  in_time?: string;
  out_time?: string;
  opening_cash_float: number;
  remarks?: string;
  created_at: string;
}

export async function fetchAttendanceApi(
  shiftIdOrOptions?: number | { shift_id?: number; attendance_date?: string; target_date?: string },
  dateStr?: string
): Promise<EmployeeAttendanceItem[]> {
  const params = new URLSearchParams();
  if (typeof shiftIdOrOptions === 'object' && shiftIdOrOptions !== null) {
    if (shiftIdOrOptions.shift_id) params.append('shift_id', String(shiftIdOrOptions.shift_id));
    const d = shiftIdOrOptions.target_date || shiftIdOrOptions.attendance_date;
    if (d) params.append('target_date', d);
  } else {
    if (shiftIdOrOptions) params.append('shift_id', String(shiftIdOrOptions));
    if (dateStr) params.append('target_date', dateStr);
  }
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/employees/attendance${q}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(`Attendance API failed: ${res.status}`);
  return res.json();
}

export async function recordAttendanceApi(data: {
  employee_id: number;
  shift_id?: number;
  date?: string;
  attendance_date?: string;
  shift_name?: string;
  status?: string;
  in_time?: string;
  out_time?: string;
  opening_cash_float?: number;
  remarks?: string;
}): Promise<any> {
  const payload = {
    employee_id: data.employee_id,
    shift_id: data.shift_id,
    date: data.date || data.attendance_date,
    status: data.status,
    in_time: data.in_time,
    out_time: data.out_time,
    opening_cash_float: data.opening_cash_float,
    remarks: data.remarks,
  };
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/employees/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Record attendance failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Statutory Compliance Licenses API
// ---------------------------------------------------------------------------
export interface StatutoryLicenseItem {
  id: number;
  license_name: string;
  license_number: string;
  issuing_authority: string;
  issue_date: string;
  expiry_date: string;
  reminder_days_before: number;
  days_remaining: number;
  document_key?: string;
  status: string;
  remarks?: string;
  created_at: string;
}

export async function fetchStatutoryLicensesApi(): Promise<StatutoryLicenseItem[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/compliance/licenses`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(`Compliance licenses API failed: ${res.status}`);
  return res.json();
}

export async function createStatutoryLicenseApi(data: {
  license_type?: string;
  license_name: string;
  license_number: string;
  issuing_authority?: string;
  issue_date: string;
  expiry_date: string;
  reminder_days_before?: number;
  alert_days_before?: number;
  document_key?: string;
  remarks?: string;
}): Promise<any> {
  const payload = {
    license_name: data.license_name,
    license_number: data.license_number,
    issuing_authority: data.issuing_authority,
    issue_date: data.issue_date,
    expiry_date: data.expiry_date,
    reminder_days_before: data.reminder_days_before ?? data.alert_days_before ?? 30,
    document_key: data.document_key,
    remarks: data.remarks,
  };
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/compliance/licenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Create compliance license failed: ${res.status}`);
  }
  return res.json();
}

export async function updateStatutoryLicenseApi(licenseId: number, data: Partial<StatutoryLicenseItem>): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/compliance/licenses/${licenseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Update compliance license failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteStatutoryLicenseApi(licenseId: number, managerPin?: string): Promise<any> {
  const q = managerPin ? `?manager_pin=${encodeURIComponent(managerPin)}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/compliance/licenses/${licenseId}${q}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete compliance license failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Packaged Lube Stock Inward API
// ---------------------------------------------------------------------------
export interface LubeInwardItem {
  id: number;
  invoice_no: string;
  date: string;
  supplier_name: string;
  lube_product_id: number;
  product_name: string;
  category?: string;
  package_size?: string;
  qty_units: number;
  cost_price: number;
  total_amount: number;
  batch_no?: string;
  notes?: string;
  created_at: string;
}

export async function fetchLubeInwardApi(limit: number = 50): Promise<LubeInwardItem[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/lubes/inward?limit=${limit}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(`Lube inward API failed: ${res.status}`);
  return res.json();
}

export async function recordLubeInwardApi(data: {
  invoice_no?: string;
  invoice_number?: string;
  date?: string;
  invoice_date?: string;
  supplier_name?: string;
  lube_product_id: number;
  qty_units?: number;
  qty_received?: number;
  cost_price?: number;
  unit_cost?: number;
  batch_no?: string;
  notes?: string;
  remarks?: string;
}): Promise<any> {
  const payload = {
    invoice_no: data.invoice_no || data.invoice_number || `INV-${Date.now().toString().slice(-4)}`,
    date: data.date || data.invoice_date,
    supplier_name: data.supplier_name,
    lube_product_id: data.lube_product_id,
    qty_units: data.qty_units ?? data.qty_received ?? 1,
    cost_price: data.cost_price ?? data.unit_cost ?? 0,
    batch_no: data.batch_no,
    notes: data.notes || data.remarks,
  };
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/lubes/inward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Record lube inward failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Fleet & Credit Party B2B Invoices API
// ---------------------------------------------------------------------------
export interface FleetInvoiceItem {
  id: number;
  invoice_no: string;
  customer_id: number;
  customer_name: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  total_liters: number;
  gst_amount: number;
  status: string;
  pdf_object_key?: string;
  created_at: string;
}

export async function fetchFleetInvoicesApi(customerId?: number): Promise<FleetInvoiceItem[]> {
  const q = customerId ? `?customer_id=${customerId}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/fleet-invoices${q}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(`Fleet invoices API failed: ${res.status}`);
  return res.json();
}

export async function createFleetInvoiceApi(data: {
  customer_id: number;
  period_start: string;
  period_end: string;
  credit_sale_ids?: number[];
  invoice_no?: string;
}): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/fleet-invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Generate fleet invoice failed: ${res.status}`);
  }
  return res.json();
}

export async function getFleetInvoiceApi(invoiceId: number): Promise<FleetInvoiceItem> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/pump/fleet-invoices/${invoiceId}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(`Get fleet invoice failed: ${res.status}`);
  return res.json();
}


