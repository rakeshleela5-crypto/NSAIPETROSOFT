import React from 'react';
import type { BankAccountItem } from '../models';
import { exportToCsv } from '../utils/exportCsv';

interface BankAccountsMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountsList: BankAccountItem[];
  newBankName: string;
  setNewBankName: (name: string) => void;
  newBankType: string;
  setNewBankType: (type: string) => void;
  newBankBalance: number;
  setNewBankBalance: (bal: number) => void;
  onCreateBankAccount: (e: React.FormEvent) => void;
  onOpenTransfer: () => void;
}

export const BankAccountsMasterModal: React.FC<BankAccountsMasterModalProps> = ({
  isOpen,
  onClose,
  accountsList,
  newBankName,
  setNewBankName,
  newBankType,
  setNewBankType,
  newBankBalance,
  setNewBankBalance,
  onCreateBankAccount,
  onOpenTransfer,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '780px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🏦</span>
            <span>Bank Accounts & General Ledger Master</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>All Station Accounts & POS Terminals</div>
            <div style={{ border: '1px solid #7f9db9', background: '#fff', height: '300px', overflowY: 'auto' }}>
              <table className="win-datagrid">
                <thead>
                  <tr>
                    <th>Account Name</th>
                    <th>Type</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {accountsList.map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.name}</td>
                      <td>{a.type}</td>
                      <td className="text-right" style={{ fontWeight: 700, color: a.balance > 0 ? '#1b6b80' : '#c0392b' }}>
                        ₹ {a.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>Add New Bank / Ledger</div>
            <form onSubmit={onCreateBankAccount}>
              <div className="win-form-row">
                <span className="win-label">Account Name</span>
                <input
                  type="text"
                  className="win-input"
                  required
                  value={newBankName}
                  onChange={(e) => setNewBankName(e.target.value)}
                  style={{ flex: 1 }}
                  placeholder="e.g. SBI CURRENT 9821"
                />
              </div>
              <div className="win-form-row">
                <span className="win-label">Type</span>
                <select
                  className="win-select"
                  style={{ flex: 1 }}
                  value={newBankType}
                  onChange={(e) => setNewBankType(e.target.value)}
                >
                  <option>CURRENT</option>
                  <option>SAVINGS</option>
                  <option>POS</option>
                  <option>WALLET</option>
                  <option>CASH</option>
                </select>
              </div>
              <div className="win-form-row">
                <span className="win-label">Opening Bal (₹)</span>
                <input
                  type="number"
                  step="0.01"
                  className="win-input"
                  value={newBankBalance}
                  onChange={(e) => setNewBankBalance(parseFloat(e.target.value) || 0)}
                  style={{ flex: 1, fontWeight: 700 }}
                />
              </div>
              <button
                type="submit"
                className="win-btn-classic win-btn-primary"
                style={{ width: '100%', marginTop: '10px' }}
              >
                Create Account
              </button>
              <button
                type="button"
                className="win-btn-classic"
                style={{ width: '100%', marginTop: '6px' }}
                onClick={onOpenTransfer}
              >
                Contra Fund Transfer ▾
              </button>
            </form>
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
                `NSAIPETROSOFT_BankAccounts_${new Date().toISOString().split('T')[0]}`,
                ['Account Name', 'Type', 'Current Balance (INR)'],
                accountsList.map(a => [a.name, a.type, a.balance])
              )}
              title="Export bank and ledger accounts to Microsoft Excel or CSV"
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
