import React from 'react';
import { exportToCsv } from '../utils/exportCsv';
import { printThermalReceiptHtml } from '../utils/thermalPrinter';

interface ExpenseItem {
  id: number;
  date: string;
  category: string;
  amount: number;
  paid_to?: string;
  narration?: string;
}

interface ExpenseBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  expensesList: ExpenseItem[];
  expDate: string;
  setExpDate: (d: string) => void;
  expCategory: string;
  setExpCategory: (c: string) => void;
  expAmount: number;
  setExpAmount: (a: number) => void;
  expPaidTo: string;
  setExpPaidTo: (p: string) => void;
  expNarration: string;
  setExpNarration: (n: string) => void;
  onSaveExpense: (e: React.FormEvent) => void;
  onDeleteExpense: (id: number) => void;
}

export const ExpenseBookModal: React.FC<ExpenseBookModalProps> = ({
  isOpen,
  onClose,
  expensesList,
  expDate,
  setExpDate,
  expCategory,
  setExpCategory,
  expAmount,
  setExpAmount,
  expPaidTo,
  setExpPaidTo,
  expNarration,
  setExpNarration,
  onSaveExpense,
  onDeleteExpense,
}) => {
  if (!isOpen) return null;

  const handlePrintExpenseVoucher = () => {
    const html = `
      <div style="font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; line-height: 1.4; color: #000;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: 15px; font-weight: bold;">NSAIPETROSOFT FUELS</div>
          <div style="font-size: 11px;">PETTY CASH PAYMENT VOUCHER</div>
          <div style="font-size: 10px;">Forecourt Petty Cash & Operational Expenses</div>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Date: ${expDate}</span>
          <span>Cash on Hand</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div><b>Category:</b> ${expCategory}</div>
        <div><b>Paid To:</b> ${expPaidTo || '-'}</div>
        <div><b>Narration:</b> ${expNarration || '-'}</div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px;">
          <span>AMOUNT PAID:</span>
          <span>Rs ${expAmount.toFixed(2)}</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="margin-top: 35px; border-top: 1px solid #000; padding-top: 4px; font-size: 10px; display: flex; justify-content: space-between;">
          <span>Payee Sign</span>
          <span>Manager / Cashier Sign</span>
        </div>
      </div>
    `;
    printThermalReceiptHtml(html);
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '780px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📝</span>
            <span>Daily Expense Book (Cashier Vouchers)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px' }}>
          <form onSubmit={onSaveExpense}>
            <div className="win-form-row">
              <span className="win-label">Date</span>
              <input
                type="text"
                className="win-input"
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div className="win-form-row">
              <span className="win-label">Category</span>
              <select
                className="win-select"
                style={{ flex: 1 }}
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value)}
              >
                <option>Gen-Set Diesel</option>
                <option>Staff Tea & Snacks</option>
                <option>Stationery & Rolls</option>
                <option>Pump Sweeper / Cleaning</option>
                <option>Electricity & Water</option>
                <option>Staff Daily Advance</option>
              </select>
            </div>
            <div className="win-form-row">
              <span className="win-label">Amount (₹)</span>
              <input
                type="number"
                step="0.01"
                className="win-input"
                value={expAmount}
                onChange={(e) => setExpAmount(parseFloat(e.target.value) || 0)}
                style={{ fontWeight: 700 }}
              />
            </div>
            <div className="win-form-row">
              <span className="win-label">Paid To</span>
              <input
                type="text"
                className="win-input"
                value={expPaidTo}
                onChange={(e) => setExpPaidTo(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div className="win-form-row">
              <span className="win-label">Narration</span>
              <textarea
                className="win-input"
                style={{ flex: 1, height: '60px' }}
                value={expNarration}
                onChange={(e) => setExpNarration(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <button type="submit" className="win-btn-classic win-btn-primary" style={{ flex: 1 }}>
                Record Expense (F2)
              </button>
              <button type="button" className="win-btn-classic" onClick={handlePrintExpenseVoucher}>🖨️ Print Voucher</button>
            </div>
          </form>

          <div style={{ border: '1px solid #7f9db9', background: '#fff', height: '240px', overflowY: 'auto' }}>
            <table className="win-datagrid">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Paid To</th>
                  <th className="text-right">Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {expensesList.map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td style={{ fontWeight: 600 }}>{e.category}</td>
                    <td>{e.paid_to}</td>
                    <td className="text-right" style={{ color: '#c0392b', fontWeight: 700 }}>₹ {e.amount.toFixed(2)}</td>
                    <td>
                      <button
                        className="win-btn-classic"
                        style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                        onClick={() => onDeleteExpense(e.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit | F2=Save</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="win-btn-classic"
              style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
              onClick={() => exportToCsv(
                `NSAIPETROSOFT_Expenses_${new Date().toISOString().split('T')[0]}`,
                ['Voucher ID', 'Date', 'Category', 'Amount (INR)', 'Paid To', 'Narration'],
                expensesList.map(e => [e.id, e.date, e.category, e.amount, e.paid_to || '', e.narration || ''])
              )}
              title="Export this expenses register to Microsoft Excel or CSV"
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
