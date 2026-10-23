import React, { useState, useEffect } from 'react';
import { decentroBanking } from '../services/decentroBanking';
import type { DynamicUpiQrResponse, GstinKycResponse, SupplierPayoutResponse } from '../services/decentroBanking';
import type { CustomerFull } from '../models';
import { erpStore } from '../store/erpStore';
import { createCardSettlement } from '../api/client';

interface DecentroBankingModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerFull[];
  activeShiftId?: number | string;
  onCustomerUpdated?: () => void;
  showToast?: (msg: string) => void;
  loadAllErpData?: () => Promise<void>;
}

export const DecentroBankingModal: React.FC<DecentroBankingModalProps> = ({
  isOpen,
  onClose,
  customers,
  activeShiftId,
  onCustomerUpdated,
  showToast,
  loadAllErpData,
}) => {
  const [activeTab, setActiveTab] = useState<'upi_qr' | 'virtual_accounts' | 'payouts' | 'gstin'>('upi_qr');

  // Tab 1: Dynamic UPI QR state
  const [upiAmount, setUpiAmount] = useState<string>('1500');
  const [upiLane, setUpiLane] = useState<string>('LANE-1');
  const [upiBillNo, setUpiBillNo] = useState<string>('');
  const [qrLoading, setQrLoading] = useState<boolean>(false);
  const [currentQr, setCurrentQr] = useState<DynamicUpiQrResponse | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState<boolean>(false);
  const [confirmedUtr, setConfirmedUtr] = useState<string>('');
  const [qrError, setQrError] = useState<string>('');

  // Tab 2: Virtual Account state
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(customers[0]?.id || 0);
  const [vaLoading, setVaLoading] = useState<boolean>(false);
  const [vaDetails, setVaDetails] = useState<any>(null);
  const [vaMessage, setVaMessage] = useState<string>('');

  // Tab 3: Supplier Payout state
  const [vendorName, setVendorName] = useState<string>('BHARAT PETROLEUM CORPORATION LTD');
  const [payoutAccount, setPayoutAccount] = useState<string>('001122334455');
  const [payoutIfsc, setPayoutIfsc] = useState<string>('SBIN0001234');
  const [payoutAmount, setPayoutAmount] = useState<string>('150000');
  const [payoutTransferType, setPayoutTransferType] = useState<'RTGS' | 'NEFT' | 'IMPS'>('RTGS');
  const [payoutPurpose, setPayoutPurpose] = useState<string>('Tanker Decantation Indent 12KL MS');
  const [payoutLoading, setPayoutLoading] = useState<boolean>(false);
  const [payoutResult, setPayoutResult] = useState<SupplierPayoutResponse | null>(null);

  // Tab 4: GSTIN Verification state
  const [gstinInput, setGstinInput] = useState<string>('24AAACB2233M1Z5');
  const [gstinKycCustomer, setGstinKycCustomer] = useState<number>(customers[0]?.id || 0);
  const [gstinLoading, setGstinLoading] = useState<boolean>(false);
  const [gstinResult, setGstinResult] = useState<GstinKycResponse | null>(null);
  const [gstinError, setGstinError] = useState<string>('');

  const handlePaymentSuccess = async (utr: string) => {
    setPaymentConfirmed(true);
    setConfirmedUtr(utr);
    const amt = parseFloat(upiAmount) || 0;
    if (amt > 0) {
      try {
        erpStore.recordCardSettlement({
          machine_name: `UPI QR (${upiLane})`,
          batch_no: utr.slice(-6),
          slip_count: 1,
          amount: amt,
        });
        await createCardSettlement({
          machine_name: `UPI QR (${upiLane})`,
          batch_no: utr.slice(-6),
          slip_count: 1,
          amount: amt,
        }).catch((e) => console.warn('Backend settlement note:', e));

        if (showToast) showToast(`✔ Real-time UPI payment of ₹${amt.toFixed(2)} received (UTR: ${utr})!`);
        if (loadAllErpData) await loadAllErpData();
        else if (onCustomerUpdated) onCustomerUpdated();
      } catch (err: any) {
        console.warn('UPI auto-settlement record note:', err);
      }
    }
  };

  // Real-Time SSE Subscription for Dynamic UPI QR
  useEffect(() => {
    if (!currentQr?.reference_id || paymentConfirmed) return;

    const cleanup = decentroBanking.subscribeToUpiQrStream(
      currentQr.reference_id,
      (update) => {
        if (update.status === 'SUCCESS' || update.status === 'PAID') {
          handlePaymentSuccess(update.utr || update.bank_reference_number || 'YESB' + Date.now().toString().slice(-8));
        }
      },
      (success) => {
        handlePaymentSuccess(success.utr || success.bank_reference_number || 'YESB' + Date.now().toString().slice(-8));
      },
      () => {
        // Fallback polling if SSE is interrupted
        const timer = setInterval(async () => {
          try {
            const status = await decentroBanking.pollUpiQrStatus(currentQr.reference_id);
            if (status.status === 'SUCCESS' || status.status === 'PAID') {
              handlePaymentSuccess(status.bank_reference_number || status.utr || 'YESB' + Date.now().toString().slice(-8));
              clearInterval(timer);
            }
          } catch (e) {
            // keep polling
          }
        }, 2000);
        return () => clearInterval(timer);
      }
    );

    return cleanup;
  }, [currentQr, paymentConfirmed]);

  if (!isOpen) return null;

  const handleGenerateQr = async () => {
    const amt = parseFloat(upiAmount);
    if (isNaN(amt) || amt <= 0) {
      setQrError('Please enter a valid amount in INR');
      return;
    }
    setQrError('');
    setQrLoading(true);
    setPaymentConfirmed(false);
    setConfirmedUtr('');
    try {
      const resp = await decentroBanking.generateDynamicUpiQr({
        amount: amt,
        lane_id: upiLane,
        bill_no: upiBillNo || `BILL-${Date.now().toString().slice(-4)}`,
        shift_id: typeof activeShiftId === 'number' ? activeShiftId : (activeShiftId ? parseInt(String(activeShiftId), 10) || undefined : undefined),
        purpose_message: `NSAI Fuel ${upiLane} - INR ${amt}`,
      });
      setCurrentQr(resp);
    } catch (err: any) {
      setQrError(err.message || 'Failed to generate Dynamic UPI QR');
    } finally {
      setQrLoading(false);
    }
  };

  const handleProvisionVa = async () => {
    if (!selectedCustomerId) return;
    setVaLoading(true);
    setVaMessage('');
    try {
      const resp = await decentroBanking.createFleetVirtualAccount(selectedCustomerId);
      setVaDetails(resp);
      setVaMessage(`Dedicated Virtual Account active: ${resp.account_number} (${resp.bank_name})`);
      if (showToast) showToast(`✔ Dedicated Virtual Account active for fleet customer: ${resp.account_number}`);
      if (loadAllErpData) await loadAllErpData();
      else if (onCustomerUpdated) onCustomerUpdated();
    } catch (err: any) {
      setVaMessage(`Error: ${err.message}`);
    } finally {
      setVaLoading(false);
    }
  };

  const handleExecutePayout = async () => {
    const amt = parseFloat(payoutAmount);
    if (isNaN(amt) || amt <= 0) {
      if (showToast) showToast('❌ Invalid payout amount');
      return;
    }
    const idempKey = `IDEMP_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    setPayoutLoading(true);
    setPayoutResult(null);
    try {
      const resp = await decentroBanking.initiateSupplierPayout({
        vendor_name: vendorName,
        account_number: payoutAccount,
        ifsc: payoutIfsc,
        amount: amt,
        transfer_type: payoutTransferType,
        purpose_message: payoutPurpose,
        idempotency_key: idempKey,
      });
      setPayoutResult(resp);
      if (resp) {
        try {
          erpStore.recordExpense({
            category: 'Supplier Payout (OMC)',
            amount: amt,
            paid_to: vendorName,
            narration: `${payoutTransferType} Payout via Decentro BaaS (Txn: ${resp.decentro_txn_id || idempKey}) - ${payoutPurpose}`,
            paid_from_account_id: 1,
          });
          if (showToast) showToast(`✔ Supplier payout of ₹${amt.toLocaleString('en-IN')} recorded in expense ledger!`);
          if (loadAllErpData) await loadAllErpData();
        } catch (e) {
          console.warn('ERP store expense sync warning:', e);
        }
      }
    } catch (err: any) {
      if (showToast) {
        showToast(`❌ Payout failed: ${err.message}`);
      }
    } finally {
      setPayoutLoading(false);
    }
  };

  const handleVerifyGstin = async () => {
    if (!gstinInput.trim()) return;
    setGstinLoading(true);
    setGstinError('');
    setGstinResult(null);
    try {
      const resp = await decentroBanking.verifyGstinKyc(gstinInput, gstinKycCustomer, true);
      setGstinResult(resp);
      if (showToast) showToast(`✔ GSTIN verified: ${resp.legal_name || resp.trade_name || 'Active'}`);
      if (loadAllErpData) await loadAllErpData();
      else if (onCustomerUpdated) onCustomerUpdated();
    } catch (err: any) {
      setGstinError(err.message || 'GSTIN verification failed');
    } finally {
      setGstinLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-sans backdrop-blur-sm">
      <div className="flex h-[90vh] max-h-[720px] w-full max-w-4xl flex-col rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 font-bold border border-blue-500/30">
              ⚡
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Decentro API Banking (V2)
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                  Zero-PG Direct BaaS
                </span>
              </h2>
              <p className="text-xs text-slate-400">Forecourt Dynamic UPI, B2B Virtual Accounts, OMC Payouts & Registry KYC</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-1 border-b border-slate-800 bg-slate-950/50 px-4">
          <button
            onClick={() => setActiveTab('upi_qr')}
            className={`border-b-2 py-3 px-4 text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'upi_qr'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>📱</span> Nozzle Dynamic UPI QR
          </button>
          <button
            onClick={() => setActiveTab('virtual_accounts')}
            className={`border-b-2 py-3 px-4 text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'virtual_accounts'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🏛️</span> B2B Fleet Virtual Accounts
          </button>
          <button
            onClick={() => setActiveTab('payouts')}
            className={`border-b-2 py-3 px-4 text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'payouts'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>💸</span> OMC & Supplier Payouts
          </button>
          <button
            onClick={() => setActiveTab('gstin')}
            className={`border-b-2 py-3 px-4 text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'gstin'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🔍</span> GSTIN KYC Registry
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: DYNAMIC UPI QR */}
          {activeTab === 'upi_qr' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
              {/* Left Column: Form */}
              <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
                  Dispenser / Lane QR Details
                </h3>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Fuel Dispense Amount (INR)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 font-bold">₹</span>
                    <input
                      type="number"
                      value={upiAmount}
                      onChange={(e) => setUpiAmount(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 pl-8 pr-3 text-lg font-bold text-white focus:border-blue-500 focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Forecourt Lane / Island</label>
                    <select
                      value={upiLane}
                      onChange={(e) => setUpiLane(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="LANE-1">LANE 1 (MS Nozzle 1)</option>
                      <option value="LANE-2">LANE 2 (HSD Nozzle 2)</option>
                      <option value="LANE-3">LANE 3 (MS Speed)</option>
                      <option value="LANE-4">LANE 4 (HSD Hi-Speed)</option>
                      <option value="POS-COUNTER">POS Counter Bill</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Fuel Bill / Slip No</label>
                    <input
                      type="text"
                      value={upiBillNo}
                      onChange={(e) => setUpiBillNo(e.target.value)}
                      placeholder="e.g. BILL-1049"
                      className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {qrError && (
                  <div className="rounded bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-400">
                    {qrError}
                  </div>
                )}

                <button
                  onClick={handleGenerateQr}
                  disabled={qrLoading}
                  className="w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {qrLoading ? 'Generating Decentro QR...' : '⚡ Generate Dynamic UPI QR'}
                </button>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Generates an NPCI-compliant unique dynamic QR bound to this transaction. Attendant's screen turns green in real-time the instant the customer scans and approves payment.
                </p>
              </div>

              {/* Right Column: Dynamic Screen */}
              <div
                className={`flex flex-col items-center justify-center rounded-lg border p-6 transition-all duration-300 ${
                  paymentConfirmed
                    ? 'border-emerald-500 bg-emerald-950/40 shadow-2xl shadow-emerald-500/20'
                    : 'border-slate-800 bg-slate-950/60'
                }`}
              >
                {paymentConfirmed ? (
                  <div className="text-center space-y-4 animate-in fade-in duration-300">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white text-4xl shadow-xl shadow-emerald-500/40">
                      ✓
                    </div>
                    <div>
                      <h4 className="text-2xl font-black text-emerald-400 tracking-tight">PAYMENT RECEIVED</h4>
                      <p className="text-xl font-bold text-white mt-1">₹{parseFloat(upiAmount).toFixed(2)}</p>
                    </div>
                    <div className="rounded-md bg-emerald-900/40 border border-emerald-500/30 p-3 text-xs text-emerald-300">
                      <p className="font-mono font-bold">UTR: {confirmedUtr}</p>
                      <p className="text-[10px] text-emerald-400/80 mt-1">Reconciled to Cashier Shift & Bank Ledger</p>
                    </div>
                    <button
                      onClick={() => {
                        setPaymentConfirmed(false);
                        setCurrentQr(null);
                      }}
                      className="rounded bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition"
                    >
                      Next Customer Dispense
                    </button>
                  </div>
                ) : currentQr ? (
                  <div className="text-center space-y-3">
                    <div className="inline-block rounded-xl bg-white p-3 shadow-xl">
                      {currentQr.qr_code_base64?.startsWith('data:') ? (
                        <img
                          src={currentQr.qr_code_base64}
                          alt="Dynamic UPI QR"
                          className="h-48 w-48 object-contain"
                        />
                      ) : (
                        <img
                          src={`data:image/svg+xml;base64,${currentQr.qr_code_base64}`}
                          alt="Dynamic UPI QR"
                          className="h-48 w-48 object-contain"
                        />
                      )}
                    </div>
                    <div>
                      <p className="text-lg font-bold text-white">₹{currentQr.amount.toFixed(2)}</p>
                      <p className="text-xs text-slate-400 font-mono">Ref: {currentQr.reference_id}</p>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-xs text-amber-400">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
                      Listening for customer scan via BaaS SSE...
                    </div>
                    {/* Simulated Test Pay Button */}
                    <button
                      onClick={() => {
                        handlePaymentSuccess(`YESBR5${Date.now().toString().slice(-8)}`);
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-300 underline"
                    >
                      [Simulate Customer PhonePe/GPay Approval]
                    </button>
                  </div>
                ) : (
                  <div className="text-center text-slate-500">
                    <div className="text-4xl mb-2">📲</div>
                    <p className="text-sm font-medium">Enter amount & click Generate</p>
                    <p className="text-xs text-slate-600 mt-1">Live QR will render here for customer</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: VIRTUAL ACCOUNTS */}
          {activeTab === 'virtual_accounts' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300 mb-3">
                  Fleet Khata Dedicated Virtual Account Provisioning
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-1">Select Fleet Customer</label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-blue-500 focus:outline-none"
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} - {c.name} (Outstanding: ₹{c.current_outstanding?.toFixed(2) || '0.00'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleProvisionVa}
                    disabled={vaLoading}
                    className="rounded-lg bg-blue-600 py-2.5 px-4 text-xs font-bold text-white hover:bg-blue-500 transition disabled:opacity-50"
                  >
                    {vaLoading ? 'Provisioning...' : '🏛️ Provision Dedicated VAN'}
                  </button>
                </div>

                {vaMessage && (
                  <div className="mt-3 rounded bg-blue-500/10 border border-blue-500/20 p-2.5 text-xs text-blue-300">
                    {vaMessage}
                  </div>
                )}
              </div>

              {/* Sample Virtual Account Card */}
              <div className="rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 p-6 shadow-lg">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Decentro Virtual Escrow Partner
                    </span>
                    <h4 className="text-base font-bold text-white">YES BANK NODAL CMS</h4>
                  </div>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                    ACTIVE
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">Assigned Account No (VAN)</span>
                    <span className="font-mono font-bold text-white text-sm">
                      {vaDetails?.account_number || `NSAI${selectedCustomerId ? String(selectedCustomerId).padStart(6, '0') : '000001'}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Bank IFSC Code</span>
                    <span className="font-mono font-bold text-white text-sm">YESB0CMSNOC</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Virtual UPI ID</span>
                    <span className="font-mono font-bold text-white text-sm">
                      nsai{selectedCustomerId ? String(selectedCustomerId).padStart(6, '0') : '000001'}@yesbank
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Reconciliation Protocol</span>
                    <span className="font-bold text-emerald-400 text-sm">FIFO Indent Clearing</span>
                  </div>
                </div>
                <p className="mt-4 text-[11px] text-slate-500 border-t border-slate-800 pt-3">
                  Fleet drivers and finance teams transfer funds directly via RTGS/NEFT to this assigned VAN. When received, the system automatically allocates payment to the oldest unpaid fuel slips.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: OMC & SUPPLIER PAYOUTS */}
          {activeTab === 'payouts' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
                  OMC & Fuel Tanker Disbursement
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Beneficiary OMC / Vendor</label>
                    <select
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="BHARAT PETROLEUM CORPORATION LTD">BHARAT PETROLEUM CORPORATION LTD (BPCL)</option>
                      <option value="INDIAN OIL CORPORATION LTD">INDIAN OIL CORPORATION LTD (IOCL)</option>
                      <option value="HINDUSTAN PETROLEUM CORPORATION LTD">HINDUSTAN PETROLEUM CORPORATION LTD (HPCL)</option>
                      <option value="CASTROL INDIA LUBRICANTS LTD">CASTROL INDIA LUBRICANTS LTD</option>
                      <option value="LOCAL TANKER TRANSPORTERS">LOCAL TANKER TRANSPORTERS</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Transfer Type</label>
                    <select
                      value={payoutTransferType}
                      onChange={(e) => setPayoutTransferType(e.target.value as any)}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="RTGS">RTGS (High Value / Instant Settlement)</option>
                      <option value="NEFT">NEFT (Standard Batch)</option>
                      <option value="IMPS">IMPS (Immediate 24x7)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Beneficiary Account Number</label>
                    <input
                      type="text"
                      value={payoutAccount}
                      onChange={(e) => setPayoutAccount(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 px-3 text-xs font-mono text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Beneficiary IFSC</label>
                    <input
                      type="text"
                      value={payoutIfsc}
                      onChange={(e) => setPayoutIfsc(e.target.value.toUpperCase())}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 px-3 text-xs font-mono text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Disbursement Amount (INR)</label>
                    <input
                      type="number"
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 px-3 text-sm font-bold text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Purpose / Indent Narration</label>
                    <input
                      type="text"
                      value={payoutPurpose}
                      onChange={(e) => setPayoutPurpose(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  onClick={handleExecutePayout}
                  disabled={payoutLoading}
                  className="rounded-lg bg-emerald-600 py-2.5 px-6 text-xs font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50"
                >
                  {payoutLoading ? 'Executing Payout...' : '💸 Authorize & Disburse Bank Transfer'}
                </button>
              </div>

              {payoutResult && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-4 text-xs space-y-2">
                  <p className="font-bold text-emerald-400">✓ Payout Disbursed Successfully!</p>
                  <p className="text-white">Vendor: <span className="font-semibold">{payoutResult.vendor_name}</span></p>
                  <p className="text-white font-mono">Bank Reference (UTR): <span className="font-bold text-emerald-300">{payoutResult.bank_reference_number}</span></p>
                  <p className="text-slate-400">Amount: ₹{payoutResult.amount.toFixed(2)} via {payoutResult.transfer_type}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: GSTIN KYC REGISTRY */}
          {activeTab === 'gstin' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
                  Decentro KYC V2 Public Registry Verification
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-1">15-Digit GSTIN</label>
                    <input
                      type="text"
                      value={gstinInput}
                      onChange={(e) => setGstinInput(e.target.value.toUpperCase())}
                      placeholder="e.g. 24AAACB2233M1Z5"
                      maxLength={15}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 px-3 text-sm font-mono font-bold text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Link Fleet Customer</label>
                    <select
                      value={gstinKycCustomer}
                      onChange={(e) => setGstinKycCustomer(Number(e.target.value))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value={0}>None (Lookup Only)</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} - {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleVerifyGstin}
                    disabled={gstinLoading}
                    className="rounded-lg bg-blue-600 py-2.5 px-4 text-xs font-bold text-white hover:bg-blue-500 transition disabled:opacity-50"
                  >
                    {gstinLoading ? 'Verifying...' : '🔍 Validate on Registry'}
                  </button>
                </div>

                {gstinError && (
                  <div className="rounded bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-400">
                    {gstinError}
                  </div>
                )}
              </div>

              {gstinResult && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 space-y-4 text-xs">
                  <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">Official Legal Entity</span>
                      <h4 className="text-base font-bold text-white">{gstinResult.legal_name}</h4>
                      {gstinResult.trade_name && (
                        <p className="text-xs text-slate-400">Trade: {gstinResult.trade_name}</p>
                      )}
                    </div>
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                      {gstinResult.registration_status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <span className="text-slate-500 block">GSTIN</span>
                      <span className="font-mono font-bold text-white">{gstinResult.gstin}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Taxpayer Type</span>
                      <span className="text-white font-medium">{gstinResult.taxpayer_type || 'Regular'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">State Jurisdiction</span>
                      <span className="text-white font-medium">{gstinResult.state_jurisdiction} ({gstinResult.state_code})</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Constitution</span>
                      <span className="text-white font-medium">{gstinResult.constitution_of_business || 'Private Limited'}</span>
                    </div>
                  </div>

                  {gstinResult.address && (
                    <div className="border-t border-slate-800 pt-3">
                      <span className="text-slate-500 block mb-0.5">Principal Place of Business</span>
                      <p className="text-slate-300 leading-relaxed">{gstinResult.address}</p>
                    </div>
                  )}

                  {gstinResult.customer_updated && (
                    <div className="rounded bg-emerald-500/10 border border-emerald-500/20 p-2 text-emerald-400 text-xs flex items-center gap-2">
                      <span>✓</span> Fleet Customer Profile has been auto-populated with verified GSTIN, PAN, and address!
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DecentroBankingModal;
