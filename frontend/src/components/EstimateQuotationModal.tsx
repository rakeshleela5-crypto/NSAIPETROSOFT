import React, { useState } from 'react';
import type { CustomerFull, StationProfile } from '../models';
import type { QuotationItem } from '../store/erpStore';
import { erpStore } from '../store/erpStore';
import { createCreditSale } from '../api/client';

interface EstimateQuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotations?: QuotationItem[];
  customers?: CustomerFull[];
  ratesList?: any[];
  stationProfile?: StationProfile;
  showToast?: (msg: string) => void;
  loadAllErpData?: () => Promise<void>;
  onOpenCreditDialog?: () => void;
}

export const EstimateQuotationModal: React.FC<EstimateQuotationModalProps> = ({
  isOpen,
  onClose,
  quotations = erpStore.getState().quotations,
  customers = erpStore.getState().customers,
  stationProfile = erpStore.getState().stationProfile,
  showToast,
  loadAllErpData,
}) => {
  const [isCreating, setIsCreating] = useState<boolean>(false);

  // Form
  const [custName, setCustName] = useState<string>('');
  const [custMobile, setCustMobile] = useState<string>('');
  const [validDays, setValidDays] = useState<number>(14);
  const [terms, setTerms] = useState<string>('Payment strictly within 15 days against fleet challan.');
  const [items, setItems] = useState<Array<{ product_name: string; qty: number; rate: number; amount: number; tax_percent: number }>>([
    { product_name: 'High Speed Diesel (HSD)', qty: 5000, rate: 94.5, amount: 472500, tax_percent: 13.7 },
  ]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems([
      ...items,
      { product_name: 'MAK 4T PLUS 20W-40', qty: 12, rate: 360, amount: 4320, tax_percent: 18.0 },
    ]);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...items];
    const it = { ...updated[index], [field]: value };
    if (field === 'qty' || field === 'rate') {
      it.amount = Math.round((it.qty * it.rate + Number.EPSILON) * 100) / 100;
    }
    updated[index] = it;
    setItems(updated);
  };

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) {
      if (showToast) showToast('❌ Customer / Firm name required');
      return;
    }

    try {
      const q = erpStore.saveQuotation({
        customer_name: custName.trim().toUpperCase(),
        customer_mobile: custMobile.trim(),
        valid_until: new Date(Date.now() + validDays * 86400000).toISOString().split('T')[0],
        terms,
        items,
      });

      if (showToast) showToast(`✔ Quotation #${q.quotation_no} created successfully!`);
      setIsCreating(false);
      if (loadAllErpData) await loadAllErpData();
    } catch (err: any) {
      if (showToast) showToast(`❌ Error: ${err.message}`);
    }
  };

  const handleConvertToBill = async (quoteId: number) => {
    try {
      const q = quotations.find((item) => item.id === quoteId);
      const bill = erpStore.convertQuotationToCreditBill(quoteId);

      try {
        const matchedCust = customers?.find((c) => c.name.toUpperCase() === (bill.customer_name || bill.cust || '').toUpperCase());
        const custId = matchedCust?.id || customers?.[0]?.id || 1;
        await createCreditSale({
          customer_id: custId,
          vehicle_no: bill.vehicle_no || bill.vehicle || 'GJ05AB1234',
          product_id: (bill.product || bill.product_name || '').toUpperCase().includes('PETROL') || (bill.product || bill.product_name || '').toUpperCase().includes('MS') ? 1 : 2,
          slip_no: bill.slip_no || bill.slip || `QT-CONV-${quoteId}`,
          qty: bill.qty,
          rate: bill.rate,
          cash_paid: 0,
          remarks: `Converted from Quotation #${q?.quotation_no || ''}`,
          indent_no: bill.indent_no,
        });
      } catch (backendErr) {
        console.warn('Backend converted quotation sync deferred or offline:', backendErr);
      }

      if (showToast) showToast(`✔ Quotation converted to active Credit Bill #${bill.bill_no}! Customer ledger updated.`);
      if (loadAllErpData) await loadAllErpData();
    } catch (err: any) {
      if (showToast) showToast(`❌ Conversion error: ${err.message}`);
    }
  };

  const escapeHtml = (str: any): string => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const handlePrintQuote = (q: QuotationItem) => {
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #111;">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #0a246a; padding-bottom: 10px;">
          <div>
            <h2 style="margin: 0; color: #0a246a;">${escapeHtml(stationProfile.stationName)}</h2>
            <div style="font-size: 13px;">${escapeHtml(stationProfile.oilCompany)} AUTHORIZED FORECOURT</div>
            <div style="font-size: 12px;">${escapeHtml(stationProfile.address)}, ${escapeHtml(stationProfile.city)}</div>
            <div style="font-size: 12px;">GSTIN: ${escapeHtml(stationProfile.gstin) || '-'} | Phone: ${escapeHtml(stationProfile.phone) || '-'}</div>
          </div>
          <div style="text-align: right;">
            <h3 style="margin: 0; color: #d35400;">B2B FUEL & LUBE ESTIMATE</h3>
            <div style="font-size: 13px; font-weight: bold;">Quote #: ${escapeHtml(q.quotation_no)}</div>
            <div style="font-size: 12px;">Date: ${escapeHtml(q.date)}</div>
            <div style="font-size: 12px;">Valid Until: ${escapeHtml(q.valid_until)}</div>
          </div>
        </div>

        <div style="margin: 15px 0; background: #f8f9fa; padding: 10px; border-radius: 4px;">
          <strong>Quote Prepared For:</strong><br/>
          <span style="font-size: 14px; font-weight: bold; color: #0a246a;">${escapeHtml(q.customer_name)}</span><br/>
          <span>Phone / Contact: ${escapeHtml(q.customer_mobile) || '-'}</span>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12.5px;">
          <thead>
            <tr style="background: #0a246a; color: #fff;">
              <th style="padding: 8px; text-align: left;">#</th>
              <th style="padding: 8px; text-align: left;">Product / Service Description</th>
              <th style="padding: 8px; text-align: right;">Quantity</th>
              <th style="padding: 8px; text-align: right;">Tariff Rate (₹)</th>
              <th style="padding: 8px; text-align: right;">Total Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${q.items.map((it, idx) => `
              <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;">${idx + 1}</td>
                <td style="padding: 8px;"><strong>${escapeHtml(it.product_name)}</strong></td>
                <td style="padding: 8px; text-align: right;">${it.qty.toLocaleString('en-IN')}</td>
                <td style="padding: 8px; text-align: right;">₹ ${it.rate.toFixed(2)}</td>
                <td style="padding: 8px; text-align: right; font-weight: bold;">₹ ${it.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background: #eee; font-weight: bold; font-size: 14px;">
              <td colspan="4" style="padding: 10px; text-align: right;">GRAND TOTAL ESTIMATED AMOUNT:</td>
              <td style="padding: 10px; text-align: right; color: #0a246a;">₹ ${q.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>

        <div style="margin-top: 25px; font-size: 11.5px; border-left: 3px solid #0a246a; padding-left: 10px;">
          <strong>Commercial Terms & Conditions:</strong><br/>
          ${escapeHtml(q.terms)}
        </div>

        <div style="margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px;">
          <div>Customer Acceptance Signature</div>
          <div>Authorized Commercial Signatory</div>
        </div>
      </div>
    `;

    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => printWin.print(), 250);
    }
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '920px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📑</span>
            <span>B2B Commercial Fuel Quotations & Contract Estimates</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>
              Quotations & Estimates Archive ({quotations.length}):
            </span>
            <button
              type="button"
              className="win-btn-classic win-btn-primary"
              onClick={() => setIsCreating(true)}
              style={{ fontWeight: 700 }}
            >
              ➕ Draft New B2B Quotation
            </button>
          </div>

          {isCreating ? (
            <div style={{ background: '#f5f5f5', border: '1px solid #7f9db9', padding: '12px', borderRadius: '4px' }}>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#0a246a', marginBottom: '8px' }}>
                Draft Commercial Fuel / Lube Quotation
              </div>
              <form onSubmit={handleSaveQuotation}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '8px' }}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Fleet Firm *</span>
                    <input
                      type="text"
                      className="win-input"
                      list="quotation-customers-list"
                      required
                      placeholder="e.g. Surat Highway Infra Ltd"
                      value={custName}
                      onChange={(e) => setCustName(e.target.value)}
                      style={{ flex: 1, fontWeight: 700 }}
                    />
                    <datalist id="quotation-customers-list">
                      {customers.map((c) => (
                        <option key={c.id} value={c.name} />
                      ))}
                    </datalist>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '80px' }}>Mobile / WA</span>
                    <input
                      type="text"
                      className="win-input"
                      placeholder="9825000000"
                      value={custMobile}
                      onChange={(e) => setCustMobile(e.target.value)}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '80px' }}>Valid Days</span>
                    <input
                      type="number"
                      className="win-input"
                      value={validDays}
                      onChange={(e) => setValidDays(parseInt(e.target.value, 10) || 14)}
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '10px', fontWeight: 700, fontSize: '12px' }}>Quotation Line Items:</div>
                {items.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <input
                      type="text"
                      className="win-input"
                      value={it.product_name}
                      onChange={(e) => handleItemChange(idx, 'product_name', e.target.value)}
                      style={{ flex: 2, fontWeight: 600 }}
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      className="win-input text-right"
                      value={it.qty}
                      onChange={(e) => handleItemChange(idx, 'qty', parseFloat(e.target.value) || 0)}
                      style={{ width: '100px' }}
                    />
                    <input
                      type="number"
                      placeholder="Rate"
                      className="win-input text-right"
                      value={it.rate}
                      onChange={(e) => handleItemChange(idx, 'rate', parseFloat(e.target.value) || 0)}
                      style={{ width: '100px' }}
                    />
                    <div style={{ width: '120px', textAlign: 'right', fontWeight: 700, lineHeight: '22px' }}>
                      ₹ {it.amount.toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}

                <button type="button" className="win-btn-classic" onClick={handleAddItem} style={{ marginTop: '6px' }}>
                  ➕ Add Item
                </button>

                <div className="win-form-row" style={{ marginTop: '10px' }}>
                  <span className="win-label" style={{ width: '90px' }}>Terms</span>
                  <input
                    type="text"
                    className="win-input"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>

                <div className="win-actions-row" style={{ marginTop: '12px' }}>
                  <button type="button" className="win-btn-classic" onClick={() => setIsCreating(false)}>Cancel</button>
                  <button type="submit" className="win-btn-classic win-btn-primary" style={{ fontWeight: 700 }}>
                    <span>💾</span>
                    <span>Save Quotation</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '420px', overflowY: 'auto' }}>
              <table className="win-datagrid">
                <thead>
                  <tr>
                    <th>Quote No</th>
                    <th>Date</th>
                    <th>Customer / Transport Firm</th>
                    <th className="text-right">Total Amount (₹)</th>
                    <th>Valid Until</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.map((q) => (
                    <tr key={q.id}>
                      <td style={{ fontWeight: 700, color: '#0a246a' }}>{q.quotation_no}</td>
                      <td>{q.date}</td>
                      <td style={{ fontWeight: 600 }}>{q.customer_name}</td>
                      <td className="text-right" style={{ fontWeight: 700, color: '#002b80' }}>
                        ₹ {q.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td>{q.valid_until}</td>
                      <td>
                        <span style={{
                          padding: '1px 6px',
                          borderRadius: '3px',
                          fontSize: '10px',
                          fontWeight: 700,
                          background: q.status === 'CONVERTED' ? '#e8f5e9' : '#fff3e0',
                          color: q.status === 'CONVERTED' ? '#1b5e20' : '#e65100',
                        }}>
                          {q.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="win-btn-classic"
                          style={{ fontSize: '10px', height: '20px', padding: '0 6px', marginRight: '4px' }}
                          onClick={() => handlePrintQuote(q)}
                          title="Print Formal B2B Quotation PDF"
                        >
                          🖨️ PDF
                        </button>
                        {q.status !== 'CONVERTED' && (
                          <button
                            type="button"
                            className="win-btn-classic win-btn-primary"
                            style={{ fontSize: '10px', height: '20px', padding: '0 6px', fontWeight: 700 }}
                            onClick={() => handleConvertToBill(q.id)}
                            title="1-Click Convert to active Credit Bill"
                          >
                            ⚡ Convert to Credit Bill
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
