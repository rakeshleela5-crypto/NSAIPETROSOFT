import React, { useState } from 'react';
import type { StationProfile } from '../models';
import { getTodayErpDate } from '../utils/dateUtils';

interface CrystalReportViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeReportTitle: string;
  reportCriteriaRadio: string;
  openCrystalReport: (rep: string) => void;
  stationProfile: StationProfile;
  critFromDate: string;
  critToDate: string;
  critShift: string;
  critItem: string;
  salesReadings: any[];
  dsrReport: any[];
  creditBillsList: any[];
  cardSettlements: any[];
  vatReport: any;
  purPoHistory: any[];
  profitReport: any[];
  commissionReport: any;
  lfrReport: any;
  tdsReport: any;
  profitLossReport: any;
  expensesList: any[];
  payReceiptsHistory: any[];
  showToast: (msg: string) => void;
}

export const CrystalReportViewerModal: React.FC<CrystalReportViewerModalProps> = ({
  isOpen,
  onClose,
  activeReportTitle,
  reportCriteriaRadio,
  openCrystalReport,
  stationProfile,
  critFromDate,
  critToDate,
  critShift,
  critItem,
  salesReadings,
  dsrReport,
  creditBillsList,
  cardSettlements,
  vatReport,
  purPoHistory,
  profitReport,
  commissionReport,
  lfrReport,
  tdsReport,
  profitLossReport,
  expensesList,
  payReceiptsHistory,
  showToast,
}) => {
  const [crystalPage, setCrystalPage] = useState<number>(1);
  const [crystalTotalPages] = useState<number>(1);
  const [reportZoom, setReportZoom] = useState<string>('100%');
  const [crystalSearchText, setCrystalSearchText] = useState<string>('');

  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="crystal-viewer-dialog">
        {/* Title Bar */}
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📑</span>
            <span>SAP Crystal Reports — {activeReportTitle}</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        {/* Crystal Toolbar */}
        <div className="crystal-toolbar">
          <button className="crystal-tool-btn" onClick={() => setCrystalPage(1)} title="First Page">|◀◀</button>
          <button className="crystal-tool-btn" onClick={() => setCrystalPage(Math.max(1, crystalPage - 1))} title="Previous Page">◀</button>
          <div className="crystal-page-counter">
            <span>Page</span>
            <input type="text" className="win-input" value={crystalPage} readOnly style={{ width: '28px', textAlign: 'center', height: '18px', padding: 0 }} />
            <span>of</span>
            <span>{crystalTotalPages}</span>
          </div>
          <button className="crystal-tool-btn" onClick={() => setCrystalPage(Math.min(crystalTotalPages, crystalPage + 1))} title="Next Page">▶</button>
          <button className="crystal-tool-btn" onClick={() => setCrystalPage(crystalTotalPages)} title="Last Page">▶▶|</button>
          <div className="win-menu-divider" style={{ height: '18px', margin: '0 4px' }} />
          <button className="crystal-tool-btn" onClick={() => showToast('Loading stopped')} title="Stop">🛑</button>
          <button className="crystal-tool-btn" onClick={() => openCrystalReport(reportCriteriaRadio)} title="Refresh">🔄</button>
          <div className="win-menu-divider" style={{ height: '18px', margin: '0 4px' }} />
          <button className="crystal-tool-btn" onClick={() => window.print()} title="Print Document">🖨️ Print</button>
          <button className="crystal-tool-btn" onClick={() => showToast(`✔ ${activeReportTitle} exported to PDF & Excel!`)} title="Export">💾 Export PDF</button>
          <div className="win-menu-divider" style={{ height: '18px', margin: '0 4px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>Zoom:</span>
            <select className="win-select" value={reportZoom} onChange={(e) => setReportZoom(e.target.value)} style={{ height: '20px', fontSize: '11px' }}>
              <option>Whole Page</option>
              <option>Page Width</option>
              <option>100%</option>
              <option>75%</option>
              <option>50%</option>
            </select>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>Find:</span>
            <input
              type="text"
              className="win-input"
              value={crystalSearchText}
              onChange={(e) => setCrystalSearchText(e.target.value)}
              placeholder="Search report..."
              style={{ height: '18px', width: '120px' }}
            />
            {crystalSearchText && (
              <button
                type="button"
                className="crystal-tool-btn"
                onClick={() => setCrystalSearchText('')}
                title="Clear search"
                style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Crystal Canvas Sheet */}
        <div className="crystal-canvas-wrapper">
          <div className="crystal-report-sheet">
            {/* Header */}
            <div className="crystal-company-name">{stationProfile.stationName}</div>
            <div style={{ textAlign: 'center', fontSize: '11px', color: '#444' }}>
              DEALERS IN: {stationProfile.oilCompany} | {stationProfile.city}, {stationProfile.state} - {stationProfile.pincode}
            </div>
            <div className="crystal-report-title">{activeReportTitle}</div>
            <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: '#333', marginBottom: '8px' }}>
              Period: {critFromDate} To {critToDate} | Shift: {critShift} | Item: {critItem}
            </div>

            {/* 1. DSR Report View */}
            {(reportCriteriaRadio === 'DSR' || reportCriteriaRadio === 'DSR REPORT') && (
              <div>
                <div className="crystal-table-subhead">1. Nozzle Meter Totalizers & Sales Register</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Nozzle</th>
                      <th>Product</th>
                      <th>Opening Meter</th>
                      <th>Closing Meter</th>
                      <th>Testing</th>
                      <th>Sale Qty (L)</th>
                      <th>Rate (₹)</th>
                      <th className="text-right">Total Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesReadings.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{r.nozzle}</td>
                        <td>{r.item}</td>
                        <td>{r.open.toFixed(2)}</td>
                        <td>{r.close.toFixed(2)}</td>
                        <td>{r.test.toFixed(2)}</td>
                        <td style={{ fontWeight: 700, color: '#1565c0' }}>{r.qty.toFixed(2)}</td>
                        <td>{r.rate}</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>{r.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="crystal-table-subhead" style={{ marginTop: '12px' }}>2. Underground Tank DIP & Evaporation Variation Register</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Tank</th>
                      <th>Product</th>
                      <th>Opening Stock</th>
                      <th>Receipt</th>
                      <th>Meter Sale</th>
                      <th>Book Stock</th>
                      <th>Actual DIP Stock</th>
                      <th>Daily Variation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dsrReport.map((t, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700 }}>{t.tank}</td>
                        <td>{t.product}</td>
                        <td>{t.opening_stock} L</td>
                        <td>{t.receipt} L</td>
                        <td>{t.meter_sale} L</td>
                        <td>{t.closing_book_stock} L</td>
                        <td style={{ fontWeight: 700 }}>{t.actual_dip_stock || t.closing_book_stock} L</td>
                        <td style={{ color: '#c0392b', fontWeight: 700 }}>{t.daily_variation} L</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '12px' }}>
                  <div>
                    <div className="crystal-table-subhead">3. Product Summary (Shift Sales)</div>
                    {(() => {
                      const prodMap: { [key: string]: { qty: number; value: number } } = {};
                      salesReadings.forEach((r) => {
                        const name = r.item || 'Other Fuel';
                        if (!prodMap[name]) prodMap[name] = { qty: 0, value: 0 };
                        prodMap[name].qty += Number(r.qty || 0);
                        prodMap[name].value += Number(r.amount || 0);
                      });
                      const prodList = Object.keys(prodMap).map((k) => ({
                        product: k,
                        qty: prodMap[k].qty,
                        value: prodMap[k].value,
                      }));
                      const totalSoldLiters = prodList.reduce((sum, p) => sum + p.qty, 0);
                      const totalSoldValue = prodList.reduce((sum, p) => sum + p.value, 0);

                      return (
                        <table className="crystal-table">
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th className="text-right">Liters Sold</th>
                              <th className="text-right">Total Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prodList.length > 0 ? (
                              prodList.map((p, idx) => (
                                <tr key={idx}>
                                  <td>{p.product}</td>
                                  <td className="text-right">{p.qty.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</td>
                                  <td className="text-right">₹ {p.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={3} style={{ textAlign: 'center', padding: '8px' }}>No nozzle sales entered for current shift</td>
                              </tr>
                            )}
                            <tr className="crystal-highlight-row">
                              <td>TOTAL FUEL SALES</td>
                              <td className="text-right">{totalSoldLiters.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</td>
                              <td className="text-right" style={{ fontWeight: 800 }}>₹ {totalSoldValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                  <div>
                    <div className="crystal-table-subhead">4. Cashier Shift Settlement Summary</div>
                    {(() => {
                      const grossSales = salesReadings.reduce((sum, r) => sum + Number(r.amount || 0), 0);
                      const creditBillsSum = creditBillsList.reduce((sum, b) => sum + Number(b.total || 0), 0);
                      const cardSettlementSum = cardSettlements.reduce((sum, c) => sum + Number(c.amount || 0), 0);
                      const cashCollected = Math.max(0, grossSales - creditBillsSum - cardSettlementSum);

                      return (
                        <div style={{ border: '1px solid #999', padding: '6px', fontSize: '11px', background: '#fafafa' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                            <span>Physical Cash Collected:</span>
                            <strong>₹ {cashCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                            <span>Credit Bills Total:</span>
                            <strong>₹ {creditBillsSum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                            <span>Digital Card / POS Swipes:</span>
                            <strong>₹ {cardSettlementSum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                          </div>
                          <div style={{ borderTop: '1px solid #777', paddingTop: '4px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1565c0' }}>
                            <span>Gross Day Collection:</span>
                            <span>₹ {grossSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* 2. VAT SUMMARY */}
            {(reportCriteriaRadio === 'VAT SUMMARY' || reportCriteriaRadio === 'VAT SUMMARY REPORT') && (
              <div>
                <div className="crystal-table-subhead">PURCHASE (Input Tax Credit)</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Invoice / Ref</th>
                      <th>Product</th>
                      <th className="text-right">Qty (L)</th>
                      <th className="text-right">Basic Amount (₹)</th>
                      <th className="text-right">VAT Rate %</th>
                      <th className="text-right">VAT Amount (₹)</th>
                      <th className="text-right">Cess (₹)</th>
                      <th className="text-right">Total Purchase (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vatReport?.purchase && vatReport.purchase.length > 0 ? (
                      vatReport.purchase.map((p: any, idx: number) => (
                        <tr key={idx}>
                          <td>{purPoHistory[idx]?.inv || `INV-P00${idx + 1}`}</td>
                          <td>{p.item}</td>
                          <td className="text-right">{Number(p.qty || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="text-right">{Number(p.basic || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="text-right">{p.vat_pct}%</td>
                          <td className="text-right">{Number(p.vat_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="text-right">{Number(p.cess || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>₹ {Number(p.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: '8px' }}>No purchase invoices recorded for this period.</td></tr>
                    )}
                    {vatReport?.purchase && vatReport.purchase.length > 0 && (
                      <tr className="crystal-highlight-row">
                        <td colSpan={3}>TOTAL PURCHASE ITC</td>
                        <td className="text-right">₹ {vatReport.purchase.reduce((s: number, p: any) => s + (p.basic || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td></td>
                        <td className="text-right">₹ {vatReport.purchase.reduce((s: number, p: any) => s + (p.vat_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="text-right">₹ {vatReport.purchase.reduce((s: number, p: any) => s + (p.cess || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="text-right" style={{ fontWeight: 800 }}>₹ {vatReport.purchase.reduce((s: number, p: any) => s + (p.total || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="crystal-table-subhead" style={{ marginTop: '14px' }}>SALES (Output Tax Liability)</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Period / Shift</th>
                      <th>Product</th>
                      <th className="text-right">Qty (L)</th>
                      <th className="text-right">Basic Sales (₹)</th>
                      <th className="text-right">VAT Rate %</th>
                      <th className="text-right">VAT Amount (₹)</th>
                      <th className="text-right">Total Sales (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vatReport?.sales && vatReport.sales.length > 0 ? (
                      vatReport.sales.map((s: any, idx: number) => (
                        <tr key={idx}>
                          <td>{getTodayErpDate()} (Current Shift)</td>
                          <td>{s.item}</td>
                          <td className="text-right">{Number(s.qty || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="text-right">{Number(s.basic || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="text-right">{s.vat_pct}%</td>
                          <td className="text-right">{Number(s.vat_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>₹ {Number(s.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: '8px' }}>No sales liability recorded for this period.</td></tr>
                    )}
                    {vatReport?.sales && vatReport.sales.length > 0 && (
                      <tr className="crystal-highlight-row">
                        <td colSpan={3}>TOTAL SALES LIABILITY</td>
                        <td className="text-right">₹ {vatReport.sales.reduce((sum: number, s: any) => sum + (s.basic || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td></td>
                        <td className="text-right">₹ {vatReport.sales.reduce((sum: number, s: any) => sum + (s.vat_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="text-right" style={{ fontWeight: 800 }}>₹ {vatReport.sales.reduce((sum: number, s: any) => sum + (s.total || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Net Payable State VAT Calculation */}
                <div style={{ marginTop: '16px', background: '#ffebee', border: '2px solid #b71c1c', padding: '10px', width: '400px', marginLeft: 'auto' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#b71c1c', borderBottom: '1px solid #b71c1c', paddingBottom: '4px', marginBottom: '6px' }}>
                    STATE COMMERCIAL TAX (VAT) COMPUTATION
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>Total Sales Output VAT:</span>
                    <span>₹ {(vatReport?.payable?.sales_vat || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>Less: Purchase Input VAT ITC:</span>
                    <span>- ₹ {(vatReport?.payable?.purchase_vat || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>Input Cess Inward:</span>
                    <span>₹ {(vatReport?.purchase || []).reduce((s: number, p: any) => s + (p.cess || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ borderTop: '2px solid #b71c1c', paddingTop: '6px', marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '14px', color: '#b71c1c' }}>
                    <span>NET PAYABLE STATE VAT:</span>
                    <span>₹ {(vatReport?.payable?.net_payable_vat || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. PROFIT SUMMARY */}
            {(reportCriteriaRadio === 'PROFIT SUMMARY' || reportCriteriaRadio === 'PROFIT SUMMARY REPORT') && (
              <div>
                <div className="crystal-table-subhead">Dealer Profit Margin Analysis (Product Wise LFR)</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Product</th>
                      <th className="text-right">Sale Qty (L)</th>
                      <th className="text-right">Purchase Rate</th>
                      <th className="text-right">Purchase Amt</th>
                      <th className="text-right">Sale Rate</th>
                      <th className="text-right">Sale Amt</th>
                      <th className="text-right">Gross Profit (₹)</th>
                      <th className="text-right">LFR Margin / L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitReport && profitReport.length > 0 ? (
                      profitReport.map((p: any, idx: number) => {
                        const purchAmt = Number((p.sale_qty || 0) * (p.purchase_rate || 0));
                        const saleAmt = Number((p.sale_qty || 0) * (p.sale_rate || 0));
                        return (
                          <tr key={idx}>
                            <td>{p.date || getTodayErpDate()}</td>
                            <td>{p.item || 'Fuel Dispense'}</td>
                            <td className="text-right">{Number(p.sale_qty || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right">₹ {Number(p.purchase_rate || 0).toFixed(2)}</td>
                            <td className="text-right">₹ {purchAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right">₹ {Number(p.sale_rate || 0).toFixed(2)}</td>
                            <td className="text-right">₹ {saleAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right" style={{ color: '#2e7d32', fontWeight: 700 }}>₹ {Number(p.gross_profit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right" style={{ fontWeight: 700 }}>₹ {Number(p.profit_per_liter || 0).toFixed(2)} / L</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr><td colSpan={9} style={{ textAlign: 'center', padding: '10px' }}>No profit ledger transactions recorded for selected date range.</td></tr>
                    )}
                    {profitReport && profitReport.length > 0 && (
                      <tr className="crystal-highlight-row">
                        <td colSpan={2}>CUMULATIVE DEALER MARGIN</td>
                        <td className="text-right">{profitReport.reduce((s: number, p: any) => s + (p.sale_qty || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</td>
                        <td colSpan={4}></td>
                        <td className="text-right" style={{ fontWeight: 800, color: '#2e7d32', fontSize: '13px' }}>
                          ₹ {profitReport.reduce((s: number, p: any) => s + (p.gross_profit || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="text-right">
                          Avg ₹ {(profitReport.reduce((s: number, p: any) => s + (p.gross_profit || 0), 0) / Math.max(1, profitReport.reduce((s: number, p: any) => s + (p.sale_qty || 0), 0))).toFixed(2)} / L
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* 4. DEALER COMMISION REPORT */}
            {(reportCriteriaRadio === 'DEALER COMMISION REPORT') && (
              <div>
                <div className="crystal-table-subhead">Oil Marketing Company Dealer Commission Ledger</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Oil Company</th>
                      <th>Product</th>
                      <th className="text-right">Inward Qty (KL)</th>
                      <th className="text-right">Commission Rate / KL</th>
                      <th className="text-right">Total Commission</th>
                      <th className="text-right">TDS 5% Sec 194H</th>
                      <th className="text-right">Net Credited</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissionReport?.items && commissionReport.items.length > 0 ? (
                      commissionReport.items.map((c: any, idx: number) => {
                        const totalComm = Number(c.total_amount || 0);
                        const tdsH = totalComm * 0.05;
                        const net = totalComm - tdsH;
                        return (
                          <tr key={idx}>
                            <td>{stationProfile.oilCompany}</td>
                            <td>{c.item}</td>
                            <td className="text-right">{Number(c.qty || 0).toFixed(3)} KL</td>
                            <td className="text-right">₹ {Number(c.rate || 0).toFixed(2)}</td>
                            <td className="text-right" style={{ fontWeight: 700 }}>₹ {totalComm.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right">- ₹ {tdsH.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right" style={{ fontWeight: 800, color: '#2e7d32' }}>₹ {net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: '10px' }}>No commission records available.</td></tr>
                    )}
                    {commissionReport?.total && (
                      <tr className="crystal-highlight-row">
                        <td colSpan={2}>TOTAL COMMISSION REVENUE</td>
                        <td className="text-right">{Number(commissionReport.total.qty || 0).toFixed(3)} KL</td>
                        <td></td>
                        <td className="text-right" style={{ fontWeight: 800 }}>₹ {Number(commissionReport.total.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="text-right" style={{ color: '#c0392b' }}>- ₹ {(Number(commissionReport.total.total_amount || 0) * 0.05).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="text-right" style={{ fontWeight: 800, color: '#2e7d32' }}>₹ {(Number(commissionReport.total.total_amount || 0) * 0.95).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* 5. PURCHASE LFR SUMMARY */}
            {(reportCriteriaRadio === 'PURCHASE LFR SUMMARY') && (
              <div>
                <div className="crystal-table-subhead">Purchase LFR Reimbursement Summary (Oil Co Inward)</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Oil Company</th>
                      <th>Product</th>
                      <th className="text-right">Inward Qty (KL)</th>
                      <th className="text-right">LFR Rate / KL</th>
                      <th className="text-right">Basic LFR (₹)</th>
                      <th className="text-right">CGST 9%</th>
                      <th className="text-right">SGST 9%</th>
                      <th className="text-right">TDS 10% (194C)</th>
                      <th className="text-right">Net Reimbursement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lfrReport?.purchases && lfrReport.purchases.length > 0 ? (
                      lfrReport.purchases.map((p: any, idx: number) => {
                        const basic = Number(p.basic || 0);
                        const cgst = Number(p.cgst || 0);
                        const sgst = Number(p.sgst || 0);
                        const tds = basic * 0.10;
                        const net = Number(p.total || 0) - tds;
                        return (
                          <tr key={idx}>
                            <td>{stationProfile.oilCompany}</td>
                            <td>{p.item}</td>
                            <td className="text-right">{Number(p.qty || 0).toFixed(2)} KL</td>
                            <td className="text-right">₹ {Number(p.lfr_rate || 0).toFixed(2)}</td>
                            <td className="text-right">{basic.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right">{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right">{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right" style={{ color: '#c0392b', fontWeight: 700 }}>₹ {tds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right" style={{ fontWeight: 800 }}>₹ {net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr><td colSpan={9} style={{ textAlign: 'center', padding: '10px' }}>No LFR purchases on record.</td></tr>
                    )}
                    {lfrReport?.total && (
                      <tr className="crystal-highlight-row">
                        <td colSpan={2}>TOTAL LFR REIMBURSEMENT</td>
                        <td className="text-right">{Number(lfrReport.total.qty || 0).toFixed(2)} KL</td>
                        <td></td>
                        <td className="text-right">{Number(lfrReport.total.basic || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="text-right">{Number(lfrReport.total.cgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="text-right">{Number(lfrReport.total.sgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="text-right" style={{ color: '#c0392b', fontWeight: 800 }}>₹ {(Number(lfrReport.total.basic || 0) * 0.10).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="text-right" style={{ fontWeight: 800, color: '#2e7d32' }}>₹ {(Number(lfrReport.total.total || 0) - (Number(lfrReport.total.basic || 0) * 0.10)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* 6. TDS SUMMARY */}
            {(reportCriteriaRadio === 'TDS SUMMARY' || reportCriteriaRadio === 'TDS SUMMARY REPORT') && (
              <div>
                <div className="crystal-table-subhead">Income Tax TDS Deduction Summary (Section 194Q / 194C)</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Section</th>
                      <th>PAN No</th>
                      <th>Deductee Party</th>
                      <th className="text-right">Gross Amount (₹)</th>
                      <th className="text-right">TDS Rate %</th>
                      <th className="text-right">TDS Deducted (₹)</th>
                      <th>Deposit Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tdsReport?.purchases && tdsReport.purchases.length > 0 ? (
                      tdsReport.purchases.map((p: any, idx: number) => {
                        const basic = Number(p.basic_amount || 0);
                        const tdsVal = basic * 0.001; // 0.1% 194Q
                        return (
                          <tr key={idx}>
                            <td>194Q</td>
                            <td>{stationProfile.panNo || 'AAACB1234K'}</td>
                            <td>{stationProfile.oilCompany} ({p.item})</td>
                            <td className="text-right">{basic.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right">0.10%</td>
                            <td className="text-right" style={{ fontWeight: 700, color: '#c0392b' }}>₹ {tdsVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td><span style={{ color: '#2e7d32', fontWeight: 700 }}>PAID / CHALLAN OK</span></td>
                          </tr>
                        );
                      })
                    ) : null}
                    {lfrReport?.tds_summary && (
                      <tr>
                        <td>194C</td>
                        <td>{stationProfile.panNo || 'AAACB1234K'}</td>
                        <td>{stationProfile.oilCompany} LFR Freight</td>
                        <td className="text-right">{Number(lfrReport.tds_summary.basic_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="text-right">{lfrReport.tds_summary.tds_percent || '10.00%'}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: '#c0392b' }}>₹ {Number(lfrReport.tds_summary.tds_payable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td><span style={{ color: '#2e7d32', fontWeight: 700 }}>PAID / CHALLAN OK</span></td>
                      </tr>
                    )}
                    <tr className="crystal-highlight-row">
                      <td colSpan={5}>TOTAL TDS PAYABLE / DEPOSITED</td>
                      <td className="text-right" style={{ fontWeight: 800, color: '#c0392b', fontSize: '13px' }}>
                        ₹ {((tdsReport?.tds_summary?.tds_payable || 0) + (lfrReport?.tds_summary?.tds_payable || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td>CHALLAN VERIFIED</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* 7. PROFIT LOSS SUMMARY */}
            {(reportCriteriaRadio === 'PROFIT LOSS SUMMARY') && (
              <div>
                <div className="crystal-table-subhead">Petroleum Retail Station Trading & Profit & Loss Statement</div>
                {(() => {
                  const openingVal = Number(profitLossReport?.opening_stock_total || 0);
                  const purchaseVal = Number(profitLossReport?.purchases_total || 0);
                  const totalExpenses = expensesList.reduce((sum, e) => sum + Number(e.amount || 0), 0);
                  const salesVal = Number(profitLossReport?.sales_total || 0);
                  const lubeVal = Number(profitLossReport?.sale_lube || 0);
                  const closingVal = Number(profitLossReport?.closing_stock_total || 0);

                  const totalDebits = openingVal + purchaseVal + totalExpenses;
                  const totalCredits = salesVal + lubeVal + closingVal;
                  const netProfit = totalCredits - totalDebits;

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
                      <div style={{ border: '1px solid #777', padding: '8px', background: '#fafafa' }}>
                        <div style={{ fontWeight: 700, borderBottom: '1px solid #999', paddingBottom: '3px', marginBottom: '6px' }}>Debits / Outflows</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Opening Fuel Stock Valuation:</span>
                          <strong>₹ {openingVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Total Inward Purchases:</span>
                          <strong>₹ {purchaseVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Operating Expenses & Overheads:</span>
                          <strong>₹ {totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div style={{ borderTop: '1px solid #999', paddingTop: '4px', marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                          <span>Total Debits:</span>
                          <span>₹ {totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                      <div style={{ border: '1px solid #777', padding: '8px', background: '#fafafa' }}>
                        <div style={{ fontWeight: 700, borderBottom: '1px solid #999', paddingBottom: '3px', marginBottom: '6px' }}>Credits / Revenue</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Gross Fuel Dispensing Sales:</span>
                          <strong>₹ {salesVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Lube & 2T Oil Sales:</span>
                          <strong>₹ {lubeVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Closing Tank Stock Valuation:</span>
                          <strong>₹ {closingVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div style={{ borderTop: '2px solid #2e7d32', paddingTop: '6px', marginTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '13px', color: netProfit >= 0 ? '#2e7d32' : '#c0392b' }}>
                          <span>NET OPERATING {netProfit >= 0 ? 'PROFIT' : 'LOSS'}:</span>
                          <span>₹ {netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Generic view for any other of the 44 reports */}
            {!['DSR', 'DSR REPORT', 'VAT SUMMARY', 'VAT SUMMARY REPORT', 'PROFIT SUMMARY', 'PROFIT SUMMARY REPORT', 'DEALER COMMISION REPORT', 'PURCHASE LFR SUMMARY', 'TDS SUMMARY', 'TDS SUMMARY REPORT', 'PROFIT LOSS SUMMARY'].includes(reportCriteriaRadio) && (
              <div>
                <div className="crystal-table-subhead">Register Output & Transaction Audit Trail ({reportCriteriaRadio})</div>
                {(() => {
                  const txns: any[] = [];
                  creditBillsList.forEach((b, idx) => {
                    txns.push({
                      date: b.date || getTodayErpDate(),
                      ref: `BILL-${b.bill || idx + 1}`,
                      particulars: `Credit Sale: ${b.cust} (${b.vehicle || '-'})`,
                      shift: b.shift || 'First',
                      category: 'Credit Fuel',
                      qty: b.qty || 0,
                      rate: b.qty ? (b.total / b.qty).toFixed(2) : '-',
                      debit: b.total || 0,
                      credit: 0,
                    });
                  });
                  payReceiptsHistory.forEach((p, idx) => {
                    txns.push({
                      date: p.date || getTodayErpDate(),
                      ref: `REC-${idx + 1}`,
                      particulars: `Customer Payment: ${p.cust} via ${p.mode}`,
                      shift: p.shift || 'First',
                      category: 'Receipt',
                      qty: '-',
                      rate: '-',
                      debit: 0,
                      credit: p.amt || 0,
                    });
                  });
                  purPoHistory.forEach((po, idx) => {
                    txns.push({
                      date: po.date || getTodayErpDate(),
                      ref: po.inv || `PO-${idx + 1}`,
                      particulars: `Tanker Inward: ${po.dealer}`,
                      shift: 'First',
                      category: 'Decanting',
                      qty: '-',
                      rate: '-',
                      debit: 0,
                      credit: po.amount || 0,
                    });
                  });
                  expensesList.forEach((exp, idx) => {
                    txns.push({
                      date: exp.date || getTodayErpDate(),
                      ref: `EXP-${exp.id || idx + 1}`,
                      particulars: `${exp.category}: ${exp.narration || exp.paid_to || ''}`,
                      shift: 'First',
                      category: 'Expense',
                      qty: '-',
                      rate: '-',
                      debit: exp.amount || 0,
                      credit: 0,
                    });
                  });

                  const filtered = txns.filter((t) => {
                    if (!crystalSearchText.trim()) return true;
                    const q = crystalSearchText.toLowerCase();
                    return (
                      t.particulars.toLowerCase().includes(q) ||
                      t.ref.toLowerCase().includes(q) ||
                      t.category.toLowerCase().includes(q)
                    );
                  });

                  const totalDebits = filtered.reduce((s, t) => s + (typeof t.debit === 'number' ? t.debit : 0), 0);
                  const totalCredits = filtered.reduce((s, t) => s + (typeof t.credit === 'number' ? t.credit : 0), 0);

                  return (
                    <table className="crystal-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Ref No</th>
                          <th>Particulars</th>
                          <th>Shift</th>
                          <th>Category</th>
                          <th className="text-right">Qty / Liters</th>
                          <th className="text-right">Rate</th>
                          <th className="text-right">Debit (₹)</th>
                          <th className="text-right">Credit (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length > 0 ? (
                          filtered.map((t, idx) => (
                            <tr key={idx}>
                              <td>{t.date}</td>
                              <td>{t.ref}</td>
                              <td>{t.particulars}</td>
                              <td>{t.shift}</td>
                              <td>{t.category}</td>
                              <td className="text-right">{typeof t.qty === 'number' ? t.qty.toFixed(2) : t.qty}</td>
                              <td className="text-right">{t.rate}</td>
                              <td className="text-right">{t.debit ? `₹ ${t.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹ 0.00'}</td>
                              <td className="text-right">{t.credit ? `₹ ${t.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹ 0.00'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan={9} style={{ textAlign: 'center', padding: '10px' }}>No transactions match criteria.</td></tr>
                        )}
                        <tr className="crystal-highlight-row">
                          <td colSpan={7}>TOTAL AUDIT BALANCE ({filtered.length} TRANSACTIONS)</td>
                          <td className="text-right">₹ {totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="text-right">₹ {totalCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            )}

            {/* Sheet Footer */}
            <div style={{ marginTop: '36px', borderTop: '1px solid #999', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555' }}>
              <span>Printed By: NSAIPETROSOFT SYSTEM | Station Shift: {critShift}</span>
              <span>{getTodayErpDate()} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span style={{ fontWeight: 700 }}>Authorized Signatory: _________________________</span>
            </div>
          </div>
        </div>

        {/* Viewer Dialog Footer */}
        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">Crystal Reports Engine 13.0 Active | ESC=Close</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
