import { API_BASE_URL, fetchWithTimeout, getAuthHeaders } from '../api/client';

export interface DynamicUpiQrRequest {
  amount: number;
  shift_id?: number;
  nozzle_id?: number;
  lane_id?: string;
  bill_no?: string;
  purpose_message?: string;
  expiry_minutes?: number;
  reference_id?: string;
}

export interface DynamicUpiQrResponse {
  reference_id: string;
  decentro_txn_id?: string;
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILURE' | 'EXPIRED';
  upi_uri: string;
  qr_code_base64?: string;
  shift_id?: number;
  nozzle_id?: number;
  lane_id?: string;
  bill_no?: string;
  created_at: string;
  message: string;
}

export interface UpiStatusResponse {
  reference_id: string;
  decentro_txn_id?: string;
  status: 'PENDING' | 'SUCCESS' | 'PAID' | 'FAILURE' | 'EXPIRED';
  amount: number;
  bank_reference_number?: string;
  utr?: string;
  payer_vpa?: string;
  paid_at?: string;
}

export interface FleetVirtualAccountResponse {
  customer_id: number;
  customer_name: string;
  account_number: string;
  ifsc: string;
  bank_name: string;
  upi_id?: string;
  status: string;
  created_at: string;
}

export interface SupplierPayoutRequest {
  vendor_name: string;
  account_number: string;
  ifsc: string;
  amount: number;
  transfer_type?: 'RTGS' | 'NEFT' | 'IMPS' | 'UPI';
  purpose_message: string;
  idempotency_key: string;
}

export interface SupplierPayoutResponse {
  reference_id: string;
  idempotency_key: string;
  decentro_txn_id?: string;
  vendor_name: string;
  amount: number;
  transfer_type: string;
  status: 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILURE' | 'REVERSED';
  bank_reference_number?: string;
  created_at: string;
  message: string;
}

export interface GstinKycResponse {
  gstin: string;
  legal_name?: string;
  trade_name?: string;
  taxpayer_type?: string;
  constitution_of_business?: string;
  state_jurisdiction?: string;
  state_code?: string;
  registration_status: string;
  address?: string;
  customer_updated?: boolean;
  message: string;
}

class DecentroBankingService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${API_BASE_URL}/api/v1/banking`;
  }

  /**
   * 1. Nozzle & Shift Dynamic UPI QR Generation
   * Generates a collect/intent dynamic UPI QR code linked to the station's collection Virtual Account.
   */
  async generateDynamicUpiQr(params: DynamicUpiQrRequest): Promise<DynamicUpiQrResponse> {
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/upi-qr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(params),
      }, 5000);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to generate Dynamic UPI QR' }));
        throw new Error(err.detail || 'Decentro BaaS UPI QR generation failed');
      }

      return await res.json();
    } catch (err: any) {
      // Offline / Network fallback to NPCI Standard UPI Intent
      const refId = params.reference_id || `UPI_${(params.lane_id || 'POS').toUpperCase()}_${Date.now()}`;
      const upiUri = `upi://pay?pa=nsaipetro@yesbank&pn=NSAI+PetroSoft&am=${params.amount.toFixed(2)}&tr=${refId}&tn=${encodeURIComponent(params.purpose_message || 'Fuel')}&cu=INR`;
      return {
        reference_id: refId,
        amount: params.amount,
        status: 'PENDING',
        upi_uri: upiUri,
        created_at: new Date().toISOString(),
        message: 'Generated offline fallback Dynamic UPI URI',
      };
    }
  }

  /**
   * Poll Dynamic UPI QR payment confirmation status.
   */
  async pollUpiQrStatus(referenceId: string): Promise<UpiStatusResponse> {
    const res = await fetchWithTimeout(`${this.baseUrl}/upi-qr/${encodeURIComponent(referenceId)}/status`, {
      method: 'GET',
      headers: getAuthHeaders(),
    }, 4000);

    if (!res.ok) {
      throw new Error(`Failed to fetch status for reference: ${referenceId}`);
    }

    return await res.json();
  }

  /**
   * Real-time Server-Sent Events (SSE) stream for dispenser screen.
   * Turns the attendant's screen bright green the instant the customer pays.
   * Returns an unsubscribe/cleanup function.
   */
  subscribeToUpiQrStream(
    referenceId: string,
    onUpdate: (data: UpiStatusResponse) => void,
    onSuccess: (data: UpiStatusResponse) => void,
    onError?: (err: any) => void
  ): () => void {
    const streamUrl = `${this.baseUrl}/upi-qr/${encodeURIComponent(referenceId)}/stream`;
    let eventSource: EventSource | null = null;
    let isTerminated = false;

    try {
      eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (event) => {
        try {
          const data: UpiStatusResponse = JSON.parse(event.data);
          onUpdate(data);

          if (data.status === 'SUCCESS' || data.status === 'PAID') {
            onSuccess(data);
            if (eventSource) {
              eventSource.close();
            }
          }
        } catch (e) {
          // ignore parse jitter
        }
      };

      eventSource.onerror = (err) => {
        if (!isTerminated && onError) {
          onError(err);
        }
        if (eventSource) {
          eventSource.close();
        }
      };
    } catch (e) {
      if (onError) onError(e);
    }

    // Return cleanup
    return () => {
      isTerminated = true;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }

  /**
   * 2. B2B Dedicated Virtual Account Provisioning for Fleet Customers.
   */
  async createFleetVirtualAccount(
    customerId: number,
    bankCode: string = 'YESB',
    customVpa?: string
  ): Promise<FleetVirtualAccountResponse> {
    const res = await fetchWithTimeout(`${this.baseUrl}/virtual-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        customer_id: customerId,
        bank_code: bankCode,
        custom_vpa: customVpa,
      }),
    }, 6000);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create virtual account' }));
      throw new Error(err.detail || 'Decentro Virtual Account creation failed');
    }

    return await res.json();
  }

  /**
   * 3. OMC & Fuel Tanker Supplier Payouts (IOCL, BPCL, HPCL, Lubes).
   * Enforces client-generated idempotency keys to strictly avoid duplicate bank transfers.
   */
  async initiateSupplierPayout(params: SupplierPayoutRequest): Promise<SupplierPayoutResponse> {
    const res = await fetchWithTimeout(`${this.baseUrl}/payouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(params),
    }, 8000);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to disburse supplier payout' }));
      throw new Error(err.detail || 'Decentro Payout disbursement failed');
    }

    return await res.json();
  }

  /**
   * 4. B2B Fleet & Vendor GSTIN KYC Verification
   * Calls Decentro KYC V2 Public Registry to validate 15-digit GSTIN and auto-populate ERP forms.
   */
  async verifyGstinKyc(
    gstin: string,
    customerId?: number,
    autoPopulate: boolean = true
  ): Promise<GstinKycResponse> {
    const cleanGstin = gstin.trim().toUpperCase();
    const pattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!pattern.test(cleanGstin)) {
      throw new Error('Invalid GSTIN format. Expected 15 characters (e.g. 24AAACB2233M1Z5)');
    }

    const res = await fetchWithTimeout(`${this.baseUrl}/kyc/gstin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        gstin: cleanGstin,
        customer_id: customerId,
        auto_populate: autoPopulate,
      }),
    }, 6000);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'GSTIN verification failed' }));
      throw new Error(err.detail || 'Decentro GSTIN KYC verification failed');
    }

    return await res.json();
  }
}

export interface NozzleQRResponse {
  reference_id: string;
  decentro_txn_id: string;
  amount: number;
  qr_base64: string; // Render as <img src={`data:image/png;base64,${qr_base64}`} />
  upi_uri: string;
  status: "PENDING" | "SUCCESS" | "FAILURE" | "EXPIRED";
}

export const PetroSoftBankingAPI = {
  /**
   * 1. Generate Dynamic UPI QR for a Nozzle Dispense Sale (No Razorpay)
   */
  async createNozzleQR(payload: {
    shift_id: string;
    nozzle_id: string;
    attendant_id: string;
    fuel_type: "MS" | "HSD" | "CNG" | "XP95";
    liters_dispensed?: number;
    amount: number;
  }): Promise<NozzleQRResponse> {
    const res = await fetch(`${API_BASE_URL}/api/v1/banking/upi-qr`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to generate Nozzle UPI QR");
    return res.json();
  },

  /**
   * 2. Poll Nozzle QR Payment Status (Auto-resolves when customer scans & pays)
   */
  pollQRStatus(
    referenceId: string,
    onSuccess: (utr: string, payerVpa: string) => void,
    onFailure: () => void,
    intervalMs = 2500
  ): () => void {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/banking/upi-qr/${referenceId}/status`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "SUCCESS") {
          clearInterval(timer);
          onSuccess(data.bank_utr, data.payer_vpa);
        } else if (data.status === "FAILURE" || data.status === "EXPIRED") {
          clearInterval(timer);
          onFailure();
        }
      } catch (err) {
        console.error("QR polling error:", err);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  },

  /**
   * 3. Verify Fleet Customer or Tanker Supplier GSTIN & Auto-Fill Form
   */
  async verifyGSTIN(gstin: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/banking/kyc/gstin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ gstin, consent: true }),
    });
    if (!res.ok) throw new Error("Invalid GSTIN or verification failed");
    return res.json();
  },

  /**
   * 4. Create Dedicated RTGS/NEFT Virtual Account for a B2B Fleet Customer
   */
  async createFleetVirtualAccount(payload: {
    business_name: string;
    gstin?: string;
    contact_phone: string;
    contact_email: string;
    credit_limit: number;
  }) {
    const res = await fetch(`${API_BASE_URL}/api/v1/banking/virtual-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to provision Virtual Account");
    return res.json();
  },

  /**
   * 5. Initiate OMC (IOCL/BPCL/HPCL) or Tanker Supplier RTGS/NEFT/IMPS Payout
   */
  async initiateSupplierPayout(payload: {
    supplier_name: string;
    supplier_gstin?: string;
    invoice_number: string;
    beneficiary_account: string;
    beneficiary_ifsc: string;
    transfer_type: "IMPS" | "NEFT" | "RTGS";
    amount: number;
  }) {
    const res = await fetch(`${API_BASE_URL}/api/v1/banking/payouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Supplier payout initiation failed");
    return res.json();
  },
};

export const decentroBanking = new DecentroBankingService();
export default decentroBanking;

