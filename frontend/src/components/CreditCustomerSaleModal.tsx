import React from 'react';
import type { CustomerFull, FuelProductRate, StationProfile } from '../models';
import { exportToCsv } from '../utils/exportCsv';
import { formatCreditSaleWhatsApp, openWhatsAppChat } from '../utils/whatsapp';
import { printThermalReceiptHtml } from '../utils/thermalPrinter';

interface CreditCustomerSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerFull[];
  ratesList: FuelProductRate[];
  stationProfile: StationProfile;
  creditDate: string;
  setCreditDate: (d: string) => void;
  creditShift: string;
  setCreditShift: (s: string) => void;
  creditSlipNo: string;
  setCreditSlipNo: (s: string) => void;
  creditBillNo: string;
  setCreditBillNo: (b: string) => void;
  creditCustId: number;
  setCreditCustId: (id: number) => void;
  creditVehicle: string;
  setCreditVehicle: (v: string) => void;
  creditProductId: number;
  setCreditProductId: (id: number) => void;
  creditRate: number;
  setCreditRate: (r: number) => void;
  creditQty: number;
  setCreditQty: (q: number) => void;
  creditCashPaid: number;
  setCreditCashPaid: (c: number) => void;
  creditRemark: string;
  setCreditRemark: (r: string) => void;
  whatsappSlip: string | null;
  creditRecipientMobile: string;
  setCreditRecipientMobile: (m: string) => void;
  lastCreditSlip: any;
  creditBillsList: any[];
  showPrintConfirm: boolean;
  onSaveCreditSale: (e: React.FormEvent) => void;
  onExecuteCreditSaleSave: (shouldPrint: boolean) => void;
  onDeleteCreditBill: (b: any) => void;
  showToast: (msg: string) => void;
}

export const CreditCustomerSaleModal: React.FC<CreditCustomerSaleModalProps> = ({
  isOpen,
  onClose,
  customers,
  ratesList,
  stationProfile,
  creditDate,
  setCreditDate,
  creditShift,
  setCreditShift,
  creditSlipNo,
  setCreditSlipNo,
  creditBillNo,
  setCreditBillNo,
  creditCustId,
  setCreditCustId,
  creditVehicle,
  setCreditVehicle,
  creditProductId,
  setCreditProductId,
  creditRate,
  setCreditRate,
  creditQty,
  setCreditQty,
  creditCashPaid,
  setCreditCashPaid,
  creditRemark,
  setCreditRemark,
  whatsappSlip,
  creditRecipientMobile,
  setCreditRecipientMobile,
  lastCreditSlip,
  creditBillsList,
  showPrintConfirm,
  onSaveCreditSale,
  onExecuteCreditSaleSave,
  onDeleteCreditBill,
  showToast,
}) => {
  if (!isOpen) return null;

  const handlePrintSlip = () => {
    const cust = customers.find((c) => c.id === creditCustId);
    const prod = ratesList.find((r) => r.id === creditProductId);
    const gross = (creditQty * creditRate).toFixed(2);
    const net = (creditQty * creditRate - creditCashPaid).toFixed(2);
    const priorBal = (cust?.current_outstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const html = `
      <div style="font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; line-height: 1.4; color: #000;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: 15px; font-weight: bold;">${stationProfile.stationName}</div>
          <div style="font-size: 11px;">${stationProfile.oilCompany} DEALER</div>
          <div style="font-size: 10px;">${stationProfile.address ? `${stationProfile.address}, ` : ''}${stationProfile.city || ''}</div>
          <div style="font-size: 10px;">GSTIN: ${stationProfile.gstin || '-'} | PH: ${stationProfile.phone || '-'}</div>
          <div style="font-weight: bold; margin-top: 4px; border-top: 1px dashed #000; padding-top: 2px;">CREDIT DELIVERY NOTE</div>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Bill: ${creditBillNo || 'CB-01'}</span>
          <span>Slip: ${creditSlipNo || '-'}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Date: ${creditDate}</span>
          <span>Shift: ${creditShift}</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div><b>Cust:</b> ${cust?.name || 'CREDIT CUSTOMER'}</div>
        <div><b>Vehicle:</b> ${creditVehicle || 'N/A'}</div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>${prod?.name || 'Fuel Product'}</span>
          <span>${creditQty.toFixed(2)} L</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Rate/L:</span>
          <span>Rs ${creditRate.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Gross:</span>
          <span>Rs ${gross}</span>
        </div>
        ${creditCashPaid > 0 ? `
        <div style="display: flex; justify-content: space-between;">
          <span>Advance Cash:</span>
          <span>- Rs ${creditCashPaid.toFixed(2)}</span>
        </div>` : ''}
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px;">
          <span>NET CREDIT:</span>
          <span>Rs ${net}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #333;">
          <span>Customer Balance:</span>
          <span>Rs ${priorBal}</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
        <div style="margin-top: 25px; border-top: 1px solid #000; padding-top: 4px; font-size: 10px; display: flex; justify-content: space-between;">
          <span>Driver Sign</span>
          <span>Authorized Sign</span>
        </div>
        <div style="text-align: center; font-size: 9px; margin-top: 8px;">
          <div>THANK YOU! VISIT AGAIN</div>
          <div>POWERED BY NSAIPETROSOFT SYSTEM</div>
        </div>
      </div>
    `;
    printThermalReceiptHtml(html);
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '960px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📋</span>
            <span>Credit Customer Sale (Vehicle Delivery Slip & Invoicing)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '12px' }}>
          <div>
            <form onSubmit={onSaveCreditSale}>
              <div className="win-form-row">
                <span className="win-label">Date</span>
                <input
                  type="text"
                  className="win-input"
                  value={creditDate}
                  onChange={(e) => setCreditDate(e.target.value)}
                  style={{ width: '90px', fontWeight: 600 }}
                />
                <span className="win-label" style={{ minWidth: '35px', marginLeft: '6px' }}>Shift</span>
                <select
                  className="win-select"
                  style={{ width: '70px' }}
                  value={creditShift}
                  onChange={(e) => setCreditShift(e.target.value)}
                >
                  <option>First</option>
                  <option>Second</option>
                </select>
              </div>

              <div className="win-form-row">
                <span className="win-label">Slip No</span>
                <input
                  type="text"
                  className="win-input"
                  value={creditSlipNo}
                  onChange={(e) => setCreditSlipNo(e.target.value)}
                  style={{ width: '60px' }}
                />
                <span className="win-label" style={{ minWidth: '45px', marginLeft: '6px' }}>Bill No</span>
                <input
                  type="text"
                  className="win-input"
                  value={creditBillNo}
                  onChange={(e) => setCreditBillNo(e.target.value)}
                  style={{ width: '60px', fontWeight: 700 }}
                />
              </div>

              <div className="win-form-row">
                <span className="win-label">Customer</span>
                <select
                  className="win-select"
                  style={{ flex: 1 }}
                  value={creditCustId}
                  onChange={(e) => {
                    const id = parseInt(e.target.value);
                    setCreditCustId(id);
                    const c = customers.find((x) => x.id === id);
                    if (c && c.vehicles && c.vehicles.length > 0) {
                      setCreditVehicle(c.vehicles[0]);
                    }
                  }}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.is_blocked ? ' ⛔ (BLOCKED)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="win-form-row">
                <span className="win-label">Vehicle</span>
                <input
                  type="text"
                  className="win-input"
                  style={{ flex: 1 }}
                  value={creditVehicle}
                  onChange={(e) => setCreditVehicle(e.target.value.toUpperCase())}
                  placeholder="e.g. GJ19AS1454"
                />
              </div>

              <div className="win-form-row">
                <span className="win-label">Item Name</span>
                <select
                  className="win-select"
                  style={{ flex: 1 }}
                  value={creditProductId}
                  onChange={(e) => {
                    const pid = parseInt(e.target.value);
                    setCreditProductId(pid);
                    const matched = ratesList.find(r => r.id === pid);
                    if (matched) {
                      setCreditRate(matched.rate);
                    }
                  }}
                >
                  {ratesList.length > 0 ? (
                    ratesList.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} - ₹{r.rate.toFixed(2)}
                      </option>
                    ))
                  ) : (
                    <option value="">Connecting to database rates...</option>
                  )}
                </select>
              </div>

              <div className="win-form-row">
                <span className="win-label">Rate (₹)</span>
                <input
                  type="number"
                  step="0.01"
                  className="win-input"
                  value={creditRate}
                  onChange={(e) => setCreditRate(parseFloat(e.target.value) || 0)}
                  style={{ width: '80px', fontWeight: 600 }}
                />
                <span className="win-label" style={{ minWidth: '35px', marginLeft: '6px' }}>Qty</span>
                <input
                  type="number"
                  step="0.01"
                  className="win-input"
                  value={creditQty}
                  onChange={(e) => setCreditQty(parseFloat(e.target.value) || 0)}
                  style={{ width: '80px', fontWeight: 700 }}
                />
              </div>

              <div className="win-form-row">
                <span className="win-label">Amount</span>
                <input
                  type="text"
                  className="win-input"
                  readOnly
                  value={`₹ ${(creditQty * creditRate).toFixed(2)}`}
                  style={{ fontWeight: 700, color: '#1565c0' }}
                />
              </div>

              <div className="win-form-row">
                <span className="win-label">Advance Cash</span>
                <input
                  type="number"
                  className="win-input"
                  value={creditCashPaid}
                  onChange={(e) => setCreditCashPaid(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
              </div>

              <div className="win-form-row">
                <span className="win-label">Remark</span>
                <input
                  type="text"
                  className="win-input"
                  style={{ flex: 1 }}
                  value={creditRemark}
                  onChange={(e) => setCreditRemark(e.target.value)}
                />
              </div>

              {whatsappSlip && (
                <div style={{ background: '#e8f8f5', border: '1px solid #2ecc71', padding: '8px', borderRadius: '3px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, color: '#16a085', fontSize: '11px' }}>
                      📲 WhatsApp Delivery Slip for {lastCreditSlip?.cust || 'Customer'}
                    </span>
                    <span style={{ fontSize: '10px', color: '#555' }}>
                      Customer Mobile: <b>{creditRecipientMobile || 'Not Set'}</b>
                    </span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '10px', background: '#fff', border: '1px solid #c8e6c9', padding: '6px', maxHeight: '100px', overflowY: 'auto', color: '#2c3e50', lineHeight: '1.4' }}>
                    {whatsappSlip}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#333', fontWeight: 600 }}>Recipient Mobile:</span>
                    <input
                      type="text"
                      className="win-input"
                      placeholder="e.g. 9845012345"
                      style={{ width: '130px', fontSize: '11px', height: '22px' }}
                      value={creditRecipientMobile}
                      onChange={(e) => setCreditRecipientMobile(e.target.value)}
                    />
                    <button
                      type="button"
                      className="win-btn-classic"
                      style={{ background: '#25d366', color: '#fff', borderColor: '#128c7e', fontWeight: 700, height: '22px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                      onClick={() => {
                        const mobile = creditRecipientMobile || customers.find((c) => c.id === creditCustId)?.mobile || '';
                        openWhatsAppChat(mobile, whatsappSlip);
                        showToast('📲 WhatsApp chat opened with pre-filled delivery slip!');
                      }}
                    >
                      📲 Dispatch WhatsApp Slip
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                <button type="submit" className="win-btn-classic win-btn-primary" style={{ flex: 1 }}>Save (F2)</button>
                <button
                  type="button"
                  className="win-btn-classic"
                  onClick={() => {
                    setCreditSlipNo((parseInt(creditSlipNo) + 1).toString());
                    setCreditQty(100.0);
                    showToast('New Credit Slip initiated');
                  }}
                >
                  New Entry
                </button>
                <button type="button" className="win-btn-classic" onClick={handlePrintSlip}>🖨️ Print Slip</button>
              </div>

              {/* Dedicated 80mm Thermal Receipt for Credit Fuel Dispense */}
              <div className="thermal-slip-box" style={{ display: 'none' }}>
                <div className="thermal-slip-header">
                  <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{stationProfile.stationName}</div>
                  <div style={{ fontSize: '10px', color: '#333' }}>{stationProfile.oilCompany} DEALER</div>
                  <div>{stationProfile.address ? `${stationProfile.address}, ` : ''}{stationProfile.city}, {stationProfile.state}</div>
                  <div>GSTIN: {stationProfile.gstin} {stationProfile.phone ? `| PH: ${stationProfile.phone}` : ''}</div>
                  <div style={{ fontWeight: 'bold', marginTop: '4px', borderTop: '1px dashed #000', paddingTop: '2px' }}>CREDIT FUEL SALE SLIP</div>
                </div>
                <div className="thermal-slip-row"><span>Bill No: {creditBillNo || 'CB-01'}</span><span>Slip No: {creditSlipNo || '-'}</span></div>
                <div className="thermal-slip-row"><span>Date: {creditDate}</span><span>Shift: {creditShift}</span></div>
                <div className="thermal-slip-row"><span>Customer: {customers.find((c) => c.id === creditCustId)?.name || 'CREDIT CUSTOMER'}</span></div>
                <div className="thermal-slip-row"><span>Vehicle: {creditVehicle || 'N/A'}</span></div>
                <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />
                <div className="thermal-slip-row">
                  <span>{ratesList.find((r) => r.id === creditProductId)?.name || 'High Speed Diesel (HSD)'}</span>
                  <span>{creditQty.toFixed(2)} L</span>
                </div>
                <div className="thermal-slip-row">
                  <span>Rate / L:</span>
                  <span>₹ {creditRate.toFixed(2)}</span>
                </div>
                <div className="thermal-slip-row">
                  <span>Gross Amount:</span>
                  <span>₹ {(creditQty * creditRate).toFixed(2)}</span>
                </div>
                {creditCashPaid > 0 && (
                  <div className="thermal-slip-row">
                    <span>Cash Paid:</span>
                    <span>- ₹ {creditCashPaid.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />
                <div className="thermal-slip-row" style={{ fontWeight: 'bold', fontSize: '13px' }}>
                  <span>NET CREDIT DEBIT:</span>
                  <span>₹ {(creditQty * creditRate - creditCashPaid).toFixed(2)}</span>
                </div>
                <div className="thermal-slip-row" style={{ fontSize: '10px', color: '#333' }}>
                  <span>Prior Customer Balance:</span>
                  <span>₹ {(customers.find((c) => c.id === creditCustId)?.current_outstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="thermal-slip-footer">
                  <div style={{ marginTop: '20px', borderTop: '1px solid #000', paddingTop: '4px', fontSize: '10px' }}>Driver / Receiver Signature</div>
                  <div style={{ fontSize: '9px', marginTop: '4px' }}>POWERED BY NSAIPETROSOFT SYSTEM</div>
                </div>
              </div>
            </form>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #7f9db9', background: '#fff', height: '360px' }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table className="win-datagrid">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>BillNo</th>
                    <th>CustomerName</th>
                    <th>VehicleNo</th>
                    <th className="text-right">QTY</th>
                    <th className="text-right">TotalAmount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {creditBillsList.map((b, i) => (
                    <tr key={i}>
                      <td>{b.date}</td>
                      <td>{b.bill}</td>
                      <td>{b.cust}</td>
                      <td>{b.vehicle}</td>
                      <td className="text-right">{b.qty.toFixed(2)}</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>{b.total.toFixed(2)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '3px' }}>
                          <button
                            className="win-btn-classic"
                            style={{ height: '18px', padding: '0 4px', fontSize: '10px', color: '#c0392b', fontWeight: 600 }}
                            onClick={() => onDeleteCreditBill(b)}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="win-btn-classic"
                            style={{ height: '18px', padding: '0 3px', fontSize: '10px', background: '#25d366', color: '#fff', borderColor: '#128c7e', fontWeight: 700 }}
                            title={`Send this slip to customer (${b.mobile || 'Registered Mobile'}) via WhatsApp`}
                            onClick={() => {
                              const cust = customers.find((c) => c.name === b.cust);
                              const phone = b.mobile || cust?.mobile || '';
                              const text = formatCreditSaleWhatsApp({
                                stationName: stationProfile.stationName,
                                stationCity: stationProfile.city,
                                billNo: b.bill,
                                slipNo: b.slip,
                                date: b.date,
                                customerName: b.cust,
                                vehicleNo: b.vehicle,
                                productName: 'High Speed Diesel (HSD)',
                                qty: b.qty,
                                rate: ratesList[0]?.rate || 94.25,
                                amount: b.total,
                                balanceAfter: cust?.current_outstanding || b.total,
                              });
                              openWhatsAppChat(phone, text);
                              showToast(`📲 Opening WhatsApp delivery slip for ${b.cust}...`);
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

            <div style={{ background: '#ece9d8', borderTop: '1px solid #7f9db9', padding: '4px 8px', display: 'flex', justifyContent: 'flex-end', fontWeight: 700 }}>
              Total Credit Amount: ₹ {creditBillsList.reduce((acc, curr) => acc + curr.total, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
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
                `NSAIPETROSOFT_CreditBills_${new Date().toISOString().split('T')[0]}`,
                ['Bill No', 'Date', 'Customer Name', 'Vehicle No', 'Quantity (Ltrs)', 'Total Amount (INR)'],
                creditBillsList.map(b => [b.bill, b.date, b.cust, b.vehicle, b.qty, b.total])
              )}
              title="Export credit sales register to Microsoft Excel or CSV"
            >
              📥 Export to Excel (CSV)
            </button>
            <button className="win-btn-classic" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Frame 0050: Are you Sure? Do you want to Print this Receipt..?? */}
        {showPrintConfirm && (
          <div className="win-modal-overlay" style={{ zIndex: 10000 }}>
            <div className="win-form-dialog" style={{ width: '380px', border: '2px solid #0055ea', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
              <div className="win-dialog-titlebar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🖨️</span>
                  <span>Print Confirmation</span>
                </div>
              </div>
              <div className="win-dialog-body" style={{ textAlign: 'center', padding: '18px 12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '14px', color: '#111' }}>
                  Are you Sure? Do you want to Print this Receipt..??
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                  <button
                    className="win-btn-classic win-btn-primary"
                    style={{ width: '80px', fontWeight: 700 }}
                    onClick={() => onExecuteCreditSaleSave(true)}
                  >
                    Yes
                  </button>
                  <button
                    className="win-btn-classic"
                    style={{ width: '80px', fontWeight: 700 }}
                    onClick={() => onExecuteCreditSaleSave(false)}
                  >
                    No
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
