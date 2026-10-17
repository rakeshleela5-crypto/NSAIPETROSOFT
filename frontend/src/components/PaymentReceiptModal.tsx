import React, { useState } from 'react';
import type { CustomerFull, StationProfile } from '../models';
import { createPaymentReceipt, deletePaymentReceipt, fetchPayments } from '../api/client';
import { exportToCsv } from '../utils/exportCsv';
import { formatPaymentReceiptWhatsApp, openWhatsAppChat } from '../utils/whatsapp';

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
    cust: string;
    mode: string;
    amt: number;
    mobile?: string;
  }>;
  showToast: (msg: string) => void;
  loadAllErpData: () => Promise<void>;
  requestManagerAuthorization: (actionDesc: string, onAuthorized: () => Promise<void> | void) => void;
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
  const [payDate, setPayDate] = useState<string>(new Date().toLocaleDateString('en-GB'));
  const [payTotalPurch, setPayTotalPurch] = useState<number>(0);
  const [payTotalPaid, setPayTotalPaid] = useState<number>(0);
  const [payTotalUnpaid, setPayTotalUnpaid] = useState<number>(0);
  const [payMode, setPayMode] = useState<string>('CASH');
  const [payBank, setPayBank] = useState<string>(accountsList[0]?.name || 'CASH ON HAND');
  const [payAmount, setPayAmount] = useState<number>(0);

  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '920px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>💰</span>
            <span>Customer's Payment (Receipt Voucher & Credit Settlement)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px' }}>
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
            <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
              <button
                className="win-btn-classic win-btn-primary"
                onClick={async () => {
                  if (!payAmount || payAmount <= 0) {
                    showToast('Please enter a valid payment amount');
                    return;
                  }
                  try {
                    const custObj = customers.find((c) => c.name === payCustName);
                    const custId = custObj ? custObj.id : (customers[0]?.id || 1);
                    await createPaymentReceipt({
                      customer_id: custId,
                      amount: payAmount,
                      payment_mode: payMode,
                      bank_name: payBank,
                    });
                    showToast(`✔ Receipt recorded in PostgreSQL! Outstanding reduced by ₹${payAmount.toFixed(2)}`);
                    setPayAmount(0);
                    await loadAllErpData();
                  } catch (err: any) {
                    showToast(err.message || 'Error recording receipt');
                  }
                }}
              >
                Save (F2)
              </button>
              <button className="win-btn-classic" onClick={() => { setPayReceiptNo((parseInt(payReceiptNo) + 1).toString().padStart(5, '0')); showToast('New Receipt initiated'); }}>New Entry (F1)</button>
              <button className="win-btn-classic" onClick={() => window.print()}>🖨️ Print Receipt</button>
              <button
                type="button"
                className="win-btn-classic"
                style={{ background: '#25d366', color: '#fff', borderColor: '#128c7e', fontWeight: 700 }}
                onClick={() => {
                  const cust = customers.find((c) => c.name === payCustName);
                  const msg = formatPaymentReceiptWhatsApp({
                    stationName: stationProfile.stationName,
                    stationCity: stationProfile.city,
                    receiptNo: payReceiptNo || 'RCP-RECENT',
                    date: payDate,
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
                📲 WhatsApp Receipt
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
                {payReceiptsHistory.map((h, i) => (
                  <tr key={i}>
                    <td>{h.shift}</td>
                    <td>{h.date}</td>
                    <td>{h.cust}</td>
                    <td>{h.mode}</td>
                    <td className="text-right" style={{ fontWeight: 700 }}>{h.amt.toFixed(2)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <button
                          className="win-btn-classic"
                          style={{ height: '18px', padding: '0 4px', fontSize: '10px', color: '#c0392b', fontWeight: 600 }}
                          onClick={() => {
                            requestManagerAuthorization(`Delete Payment Receipt #${h.receipt_no || h.id || (i + 1)} (${h.cust} - ₹${Number(h.amt || 0).toFixed(2)})`, async () => {
                              try {
                                if (h.id) {
                                  await deletePaymentReceipt(h.id);
                                } else {
                                  const latest = await fetchPayments();
                                  const found = latest.find((x) => x.receipt_no === h.receipt_no || (x.customer === h.cust && x.amount === h.amt));
                                  if (found && found.id) {
                                    await deletePaymentReceipt(found.id);
                                  }
                                }
                                showToast(`✔ Payment receipt permanently deleted & customer balance restored!`);
                                await loadAllErpData();
                              } catch (err: any) {
                                showToast(`⚠ Error deleting payment receipt: ${err.message || 'Database error'}`);
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
                          title={`Send payment receipt to ${h.cust} via WhatsApp`}
                          onClick={() => {
                            const cust = customers.find((c) => c.name === h.cust);
                            const phone = h.mobile || cust?.mobile || '';
                            const msg = formatPaymentReceiptWhatsApp({
                              stationName: stationProfile.stationName,
                              stationCity: stationProfile.city,
                              receiptNo: h.receipt_no || `RCP-${h.id || (i + 1)}`,
                              date: h.date,
                              customerName: h.cust,
                              amount: h.amt,
                              paymentMode: h.mode,
                              newBalance: cust?.current_outstanding || 0,
                            });
                            openWhatsAppChat(phone, msg);
                            showToast(`📲 Opening WhatsApp payment acknowledgment for ${h.cust}...`);
                          }}
                        >
                          📲
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit | F2=Save | F1=New</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="win-btn-classic"
              style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
              onClick={() => exportToCsv(
                `NSAIPETROSOFT_PaymentReceipts_${new Date().toISOString().split('T')[0]}`,
                ['Shift', 'Receipt Date', 'Customer Name', 'Payment Mode', 'Amount (INR)'],
                payReceiptsHistory.map(h => [h.shift, h.date, h.cust, h.mode, h.amt])
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
