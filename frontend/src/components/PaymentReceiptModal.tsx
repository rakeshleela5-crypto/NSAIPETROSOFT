import React, { useState } from 'react';
import type { CustomerFull, StationProfile } from '../models';
import { createPaymentReceipt, deletePaymentReceipt, fetchPayments } from '../api/client';
import { exportToCsv } from '../utils/exportCsv';
import { formatPaymentReceiptWhatsApp, openWhatsAppChat } from '../utils/whatsapp';
import { printThermalReceiptHtml, generateUpiQrUrl } from '../utils/thermalPrinter';
import { erpStore } from '../store/erpStore';
import { getTodayErpDate, formatErpDate } from '../utils/dateUtils';
import { enqueueOfflineRecord } from '../utils/offlineQueue';

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerFull[];
  accountsList: Array<{ id: number; name: string; type: string }>;
  stationProfile: StationProfile;
  payReceiptsHistory: Array<{
    id?: number;
    receipt_no?: string;
    shift: string;
    date: string;
    cust?: string;
    customer_name?: string;
    mode?: string;
    payment_mode?: string;
    amt?: number;
    amount?: number;
    mobile?: string;
  }>;
  showToast: (msg: string) => void;
  loadAllErpData: () => Promise<void>;
  requestManagerAuthorization: (actionDesc: string, onAuthorized: (pin?: string) => Promise<void> | void) => void;
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  isOpen,
  onClose,
  customers,
  accountsList,
  stationProfile,
  payReceiptsHistory,
  showToast,
  loadAllErpData,
  requestManagerAuthorization,
}) => {
  const [payShift, setPayShift] = useState<string>('First');
  const [payReceiptNo, setPayReceiptNo] = useState<string>('00142');
  const [payCustName, setPayCustName] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(() => getTodayErpDate());
  const [payTotalPurch, setPayTotalPurch] = useState<number>(0);
  const [payTotalPaid, setPayTotalPaid] = useState<number>(0);
  const [payTotalUnpaid, setPayTotalUnpaid] = useState<number>(0);
  const [payMode, setPayMode] = useState<string>('CASH');
  const [payBank, setPayBank] = useState<string>(accountsList[0]?.name || 'CASH ON HAND');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePrintPaymentReceipt = () => {
    const cust = customers.find((c) => c.name === payCustName);
    const is58mm = stationProfile.printerPaperWidth === '58mm';
    const paperWidth = is58mm ? 58 : 80;
    const bodyWidth = is58mm ? '200px' : '280px';
    const fontSize = is58mm ? '10px' : '11.5px';
    const titleSize = is58mm ? '13px' : '15px';

    const qrImg = stationProfile.upiVpa && payMode.toUpperCase().includes('UPI')
      ? `<div style="text-align: center; margin: 6px 0;">
          <img src="${generateUpiQrUrl(stationProfile.upiVpa, stationProfile.stationName, payAmount, `RCP-${payReceiptNo || 'PMT'}`)}" style="width: 100px; height: 100px;" alt="UPI QR"/>
          <div style="font-size: 8.5px;">UPI: ${stationProfile.upiVpa}</div>
         </div>`
      : '';

    const html = `
      <div style="font-family: 'Courier New', monospace; font-size: ${fontSize}; width: ${bodyWidth}; margin: 0 auto; line-height: 1.35; color: #000;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: ${titleSize}; font-weight: bold;">${stationProfile.stationName}</div>
          <div style="font-size: 10.5px;">${stationProfile.oilCompany} DEALER</div>
          ${stationProfile.dealerCode ? `<div style="font-size: 9.5px;">RO Code: ${stationProfile.dealerCode}</div>` : ''}
          <div style="font-size: 9.5px;">${stationProfile.address ? `${stationProfile.address}, ` : ''}${stationProfile.city || ''}</div>
          <div style="font-size: 9.5px;">GSTIN: ${stationProfile.gstin || '-'} | PH: ${stationProfile.phone || '-'}</div>
          <div style="font-weight: bold; margin-top: 4px; border-top: 1px dashed #000; padding-top: 2px;">PAYMENT RECEIPT</div>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Receipt: ${payReceiptNo || 'RCP-001'}</span>
          <span>${formatErpDate(payDate)}</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div><b>Customer:</b> ${payCustName || 'Customer'}</div>
        <div><b>Mobile:</b> ${cust?.mobile || '-'}</div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between;">
          <span>Payment Mode:</span>
          <span><b>${payMode}</b></span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Account/Bank:</span>
          <span>${payBank || 'CASH ON HAND'}</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13.5px;">
          <span>AMOUNT RECEIVED:</span>
          <span>Rs ${payAmount.toFixed(2)}</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span>Remaining Balance:</span>
          <span>Rs ${(cust?.current_outstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
        ${qrImg}
        <div style="margin-top: 25px; border-top: 1px solid #000; padding-top: 4px; font-size: 9.5px; display: flex; justify-content: space-between;">
          <span>Cashier Sign</span>
          <span>Customer Sign</span>
        </div>
        <div style="text-align: center; font-size: 8.5px; margin-top: 8px;">
          <div>THANK YOU FOR YOUR PAYMENT</div>
          <div>POWERED BY NSAIPETROSOFT SYSTEM</div>
        </div>
      </div>
    `;
    printThermalReceiptHtml(html, { paperWidthMm: paperWidth });
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog payment-receipt-dialog" style={{ width: '920px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>💰</span>
            <span>Customer's Payment (Receipt Voucher & Credit Settlement)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body payment-receipt-body">
          {submitError && (
            <div style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#991b1b', padding: '8px 12px', borderRadius: '4px', fontSize: '12px', marginBottom: '10px' }}>
              ⚠️ <b>PostgreSQL Save Error:</b> {submitError}
            </div>
          )}
          <div>
            <div className="win-form-row">
              <span className="win-label">Shift</span>
              <select
                className="win-select"
                style={{ width: '75px' }}
                value={payShift}
                onChange={(e) => setPayShift(e.target.value)}
              >
                <option>First</option>
                <option>Second</option>
              </select>
              <span className="win-label" style={{ minWidth: '70px', marginLeft: '6px' }}>Receipt No.</span>
              <input
                type="text"
                className="win-input"
                value={payReceiptNo}
                onChange={(e) => setPayReceiptNo(e.target.value)}
                style={{ width: '65px', fontWeight: 700 }}
              />
            </div>
            <div className="win-form-row">
              <span className="win-label">Customer</span>
              <select
                className="win-select"
                style={{ flex: 1, fontWeight: 600 }}
                value={payCustName}
                onChange={(e) => {
                  const name = e.target.value;
                  setPayCustName(name);
                  const matched = customers.find((c) => c.name === name);
                  if (matched) {
                    const bal = matched.current_outstanding || (matched as any).outstanding || 0;
                    setPayTotalUnpaid(bal);
                    setPayTotalPurch(bal + 15000);
                    setPayTotalPaid(15000);
                  }
                }}
              >
                <option value="">-- Select Customer Account --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} (Bal: ₹{(c.current_outstanding || (c as any).outstanding || 0).toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            </div>
            <div className="win-form-row">
              <span className="win-label">Receipt Date</span>
              <input type="text" className="win-input" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={{ width: '100px', fontWeight: 600 }} />
            </div>
            <div className="win-form-row">
              <span className="win-label">Total Purchase</span>
              <input type="number" step="0.01" className="win-input" value={payTotalPurch} onChange={(e) => setPayTotalPurch(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="win-form-row">
              <span className="win-label">Total Paid</span>
              <input type="number" step="0.01" className="win-input" value={payTotalPaid} onChange={(e) => setPayTotalPaid(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="win-form-row">
              <span className="win-label">Total Unpaid</span>
              <input type="number" step="0.01" className="win-input" value={payTotalUnpaid} onChange={(e) => setPayTotalUnpaid(parseFloat(e.target.value) || 0)} style={{ color: '#c0392b', fontWeight: 700 }} />
            </div>
            <div className="win-form-row">
              <span className="win-label">Payment Mode</span>
              <select className="win-select" style={{ flex: 1 }} value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                <option>CASH</option>
                <option>UPI PAYMENT</option>
                <option>CHEQUE</option>
                <option>NEFT / RTGS</option>
              </select>
            </div>
            <div className="win-form-row">
              <span className="win-label">Receiving Bank</span>
              <select className="win-select" style={{ flex: 1 }} value={payBank} onChange={(e) => setPayBank(e.target.value)}>
                {accountsList.map((a) => (
                  <option key={a.id} value={a.name}>{a.name} ({a.type})</option>
                ))}
              </select>
            </div>
            <div className="win-form-row">
              <span className="win-label">Amount</span>
              <input
                type="number"
                className="win-input"
                value={payAmount}
                onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                style={{ fontWeight: 700, fontSize: '13px' }}
              />
            </div>
            {payMode.toUpperCase().includes('UPI') && stationProfile.upiVpa && (
              <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', padding: '8px', borderRadius: '4px', textAlign: 'center', marginTop: '6px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#0d47a1', marginBottom: '4px' }}>
                  📱 Scan & Pay via UPI (₹{payAmount > 0 ? payAmount.toFixed(2) : '0.00'})
                </div>
                <img
                  src={generateUpiQrUrl(stationProfile.upiVpa, stationProfile.stationName, payAmount > 0 ? payAmount : undefined, `RCP-${payReceiptNo || 'DUE'}`)}
                  alt="UPI QR"
                  style={{ width: '110px', height: '110px', display: 'block', margin: '0 auto', background: '#fff', padding: '4px', border: '1px solid #ccc' }}
                />
                <div style={{ fontSize: '10px', color: '#1565c0', fontWeight: 600, marginTop: '2px' }}>{stationProfile.upiVpa}</div>
                <div style={{ fontSize: '9px', color: '#666' }}>GPay • PhonePe • Paytm • BHIM</div>
              </div>
            )}
            <div className="payment-receipt-actions">
              <button
                type="button"
                className="win-btn-classic win-btn-primary payment-receipt-btn"
                disabled={isSubmitting}
                onClick={async () => {
                  if (!payAmount || payAmount <= 0) {
                    showToast('Please enter a valid payment amount');
                    return;
                  }
                  setIsSubmitting(true);
                  setSubmitError(null);
                  try {
                    const custObj = customers.find((c) => c.name === payCustName);
                    const custId = custObj ? custObj.id : (customers[0]?.id || 1);

                    const pmtPayload = {
                      customer_id: custId,
                      amount: payAmount,
                      payment_mode: payMode,
                      bank_name: payBank,
                    };

                    // 1. Instant local state & ledger update (<1ms)
                    erpStore.recordPaymentReceipt({
                      customer_name: custObj?.name || payCustName,
                      amount: payAmount,
                      payment_mode: payMode,
                      bank_name: payBank,
                    });
                    showToast(`✔ Receipt of ₹${payAmount.toFixed(2)} recorded successfully! Customer outstanding decremented.`);
                    setPayAmount(0);

                    // 2. Non-blocking cloud sync in background
                    void (async () => {
                      try {
                        await createPaymentReceipt(pmtPayload);
                      } catch (backendErr: any) {
                        enqueueOfflineRecord('PAYMENT_RECEIPT', pmtPayload);
                        console.warn('Payment receipt sync buffered:', backendErr);
                      }
                    })();
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              >
                <span>💾</span>
                <span>{isSubmitting ? 'Saving...' : 'Save (F2)'}</span>
              </button>
              <button
                type="button"
                className="win-btn-classic payment-receipt-btn"
                onClick={() => { setPayReceiptNo((parseInt(payReceiptNo) + 1).toString().padStart(5, '0')); showToast('New Receipt initiated'); }}
              >
                <span>📄</span>
                <span>New Entry (F1)</span>
              </button>
              <button
                type="button"
                className="win-btn-classic payment-receipt-btn"
                onClick={handlePrintPaymentReceipt}
              >
                <span>🖨️</span>
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                className="win-btn-classic payment-receipt-btn payment-receipt-whatsapp-btn"
                onClick={() => {
                  const cust = customers.find((c) => c.name === payCustName);
                  const msg = formatPaymentReceiptWhatsApp({
                    stationName: stationProfile.stationName,
                    stationCity: stationProfile.city,
                    receiptNo: payReceiptNo || 'RCP-RECENT',
                    date: formatErpDate(payDate),
                    customerName: payCustName || 'Customer',
                    amount: payAmount || 0,
                    paymentMode: payMode,
                    bankName: payBank,
                    newBalance: cust?.current_outstanding || 0,
                  });
                  openWhatsAppChat(cust?.mobile || '', msg);
                  showToast(`📲 Opening WhatsApp payment acknowledgment for ${payCustName}...`);
                }}
              >
                <span>📲</span>
                <span>WhatsApp Receipt</span>
              </button>
            </div>
          </div>

          <div style={{ border: '1px solid #7f9db9', background: '#fff', height: '320px', overflowY: 'auto' }}>
            <table className="win-datagrid">
              <thead>
                <tr>
                  <th>Shift</th>
                  <th>Receipt Date</th>
                  <th>CustomerName</th>
                  <th>Mode</th>
                  <th className="text-right">Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {payReceiptsHistory.map((h, i) => {
                  const custName = h.cust || h.customer_name || 'Customer';
                  const payModeStr = h.mode || h.payment_mode || 'CASH';
                  const amountVal = Number(h.amt ?? h.amount ?? 0);

                  return (
                    <tr key={i}>
                      <td>{h.shift}</td>
                      <td>{h.date}</td>
                      <td>{custName}</td>
                      <td>{payModeStr}</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>{amountVal.toFixed(2)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '3px' }}>
                          <button
                            className="win-btn-classic"
                            style={{ height: '18px', padding: '0 4px', fontSize: '10px', color: '#c0392b', fontWeight: 600 }}
                            onClick={() => {
                              requestManagerAuthorization(`Delete Payment Receipt #${h.receipt_no || h.id || (i + 1)} (${custName} - ₹${amountVal.toFixed(2)})`, async (pin?: string) => {
                                try {
                                  if (h.id) {
                                    await deletePaymentReceipt(h.id, pin);
                                  } else {
                                    const latest = await fetchPayments();
                                    const found = latest.find((x) => x.receipt_no === h.receipt_no || (x.customer === custName && x.amount === amountVal));
                                    if (found && found.id) {
                                      await deletePaymentReceipt(found.id, pin);
                                    }
                                  }
                                  erpStore.deletePaymentReceipt(h.id || h.receipt_no || (i + 1));
                                  showToast(`✔ Payment receipt permanently deleted & customer balance restored!`);
                                  await loadAllErpData();
                                } catch (err: any) {
                                  showToast(`❌ Error deleting payment receipt: ${err.message || 'Database error'}`);
                                }
                              });
                            }}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="win-btn-classic"
                            style={{ height: '18px', padding: '0 3px', fontSize: '10px', background: '#25d366', color: '#fff', borderColor: '#128c7e', fontWeight: 700 }}
                            title={`Send payment receipt to ${custName} via WhatsApp`}
                            onClick={() => {
                              const cust = customers.find((c) => c.name === custName);
                              const phone = h.mobile || cust?.mobile || '';
                              const msg = formatPaymentReceiptWhatsApp({
                                stationName: stationProfile.stationName,
                                stationCity: stationProfile.city,
                                receiptNo: h.receipt_no || `RCP-${h.id || (i + 1)}`,
                                date: h.date,
                                customerName: custName,
                                amount: amountVal,
                                paymentMode: payModeStr,
                                newBalance: cust?.current_outstanding || 0,
                              });
                              openWhatsAppChat(phone, msg);
                              showToast(`📲 Opening WhatsApp payment acknowledgment for ${custName}...`);
                            }}
                          >
                            📲
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit | F2=Save | F1=New</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              type="button"
              className="win-btn-classic"
              style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
              onClick={() => exportToCsv(
                `NSAIPETROSOFT_PaymentReceipts_${new Date().toISOString().split('T')[0]}`,
                ['Receipt No', 'Shift', 'Receipt Date', 'Customer Name', 'Payment Mode', 'Amount (INR)'],
                payReceiptsHistory.map(h => [
                  h.receipt_no || `RCP-${h.id}`,
                  h.shift,
                  h.date,
                  h.cust || h.customer_name || 'Customer',
                  h.mode || h.payment_mode || 'CASH',
                  Number(h.amt ?? h.amount ?? 0)
                ])
              )}
              title="Export customer receipts to Microsoft Excel or CSV"
            >
              📥 Export to Excel (CSV)
            </button>
            <button className="win-btn-classic" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};
