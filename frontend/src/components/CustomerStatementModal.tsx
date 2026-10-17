import React from 'react';
import type { StationProfile } from '../models';
import { exportToCsv } from '../utils/exportCsv';
import { formatStatementWhatsApp, openWhatsAppChat } from '../utils/whatsapp';
import { getCurrentMonthStartErpDate, getTodayErpDate } from '../utils/dateUtils';

interface CustomerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStatement: any;
  stationProfile: StationProfile;
  showToast: (msg: string) => void;
}

export const CustomerStatementModal: React.FC<CustomerStatementModalProps> = ({
  isOpen,
  onClose,
  selectedStatement,
  stationProfile,
  showToast,
}) => {
  if (!isOpen || !selectedStatement) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '850px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📑</span>
            <span>Customer's Statement of Accounts (Printable Format)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body">
          <div className="statement-sheet">
            <div className="statement-title-bar">
              <div className="statement-bunk-name">{stationProfile.stationName}</div>
              <div className="statement-subtitle">Dealers In: {stationProfile.oilCompany} | {stationProfile.city}, {stationProfile.state}</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '4px' }}>STATEMENT OF ACCOUNTS</div>
            </div>

            <div className="statement-meta-grid">
              <div>
                <div><strong>Customer:</strong> {selectedStatement.customer.name}</div>
                <div><strong>City:</strong> {selectedStatement.customer.city}</div>
                <div><strong>Mobile:</strong> {selectedStatement.customer.mobile}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div><strong>Statement Period:</strong> {getCurrentMonthStartErpDate()} to {getTodayErpDate()}</div>
                <div><strong>Code:</strong> {selectedStatement.customer.code}</div>
                <div><strong>Current Outstanding:</strong> ₹ {selectedStatement.customer.outstanding.toLocaleString('en-IN')}</div>
              </div>
            </div>

            <table className="statement-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bill No</th>
                  <th>Vehicle No</th>
                  <th>Slip No</th>
                  <th className="text-right">Qty (Ltr)</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {selectedStatement.bills.map((b: any, idx: number) => (
                  <tr key={idx}>
                    <td>{b.date}</td>
                    <td>{b.bill_no}</td>
                    <td>{b.vehicle_no}</td>
                    <td>{b.slip_no}</td>
                    <td className="text-right">{b.qty.toFixed(2)}</td>
                    <td className="text-right">{b.rate}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{b.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="statement-bottom-summary">
              <div className="terms-box">
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Terms & Condition</div>
                {selectedStatement.summary.terms.map((t: string, i: number) => (
                  <div key={i} style={{ marginBottom: '2px', lineHeight: '1.2' }}>{t}</div>
                ))}
                <div style={{ marginTop: '24px', fontWeight: 'bold', whiteSpace: 'pre-line' }}>
                  {selectedStatement.summary.signatory || `For ${stationProfile.stationName}\nAuthorized Signatory`}
                </div>
              </div>

              <div className="totals-calc-box">
                <div className="totals-calc-row">
                  <span>Total Purchase:</span>
                  <strong>₹ {selectedStatement.summary.total_purchase.toFixed(2)}</strong>
                </div>
                <div className="totals-calc-row">
                  <span>Total Other Lube:</span>
                  <span>₹ {selectedStatement.summary.total_other_lube.toFixed(2)}</span>
                </div>
                <div className="totals-calc-row">
                  <span>Previous Dues:</span>
                  <strong>₹ {selectedStatement.summary.previous_dues.toFixed(2)}</strong>
                </div>
                <div className="totals-calc-row">
                  <span>Total Paid in Period:</span>
                  <span style={{ color: '#27ae60' }}>- ₹ {selectedStatement.summary.total_paid_period.toFixed(2)}</span>
                </div>
                <div className="totals-calc-row final-due">
                  <span>Net Payables to you:</span>
                  <span style={{ color: '#c0392b' }}>₹ {selectedStatement.summary.net_payables.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="win-btn-classic"
              style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
              onClick={() => exportToCsv(
                `NSAIPETROSOFT_Statement_${(selectedStatement?.header?.name || 'Customer').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`,
                ['Date', 'Particulars', 'Debit (INR)', 'Credit (INR)', 'Balance (INR)'],
                (selectedStatement?.entries || []).map((e: any) => [e.date, e.particulars, e.debit || 0, e.credit || 0, e.balance || 0])
              )}
              title="Export this customer statement directly to Microsoft Excel or CSV"
            >
              📥 Export to Excel (CSV)
            </button>
            <button className="win-btn-classic win-btn-primary" onClick={() => window.print()}>🖨️ Print Statement</button>
            <button
              type="button"
              className="win-btn-classic"
              style={{ background: '#25d366', color: '#fff', borderColor: '#128c7e', fontWeight: 700 }}
              onClick={() => {
                const cust = selectedStatement?.customer;
                const summary = selectedStatement?.summary;
                const msg = formatStatementWhatsApp({
                  stationName: stationProfile.stationName,
                  stationCity: stationProfile.city,
                  customerName: cust?.name || 'Customer',
                  date: getTodayErpDate(),
                  totalDebits: summary?.total_purchase || 0,
                  totalCredits: summary?.total_paid_period || 0,
                  outstandingBalance: summary?.net_payables || cust?.outstanding || 0,
                });
                openWhatsAppChat(cust?.mobile || '', msg);
                showToast(`📲 Opening WhatsApp Statement for ${cust?.name}...`);
              }}
            >
              📲 WhatsApp Statement
            </button>
            <button className="win-btn-classic" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};
