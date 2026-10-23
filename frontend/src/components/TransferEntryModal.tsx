import React from 'react';
import type { BankAccountItem } from '../models';
import { exportToCsv } from '../utils/exportCsv';

export interface TransferHistoryItem {
  id: number;
  date: string;
  from_account_id: number;
  from_account_name: string;
  to_account_id: number;
  to_account_name: string;
  amount: number;
  remarks?: string;
  reference_no?: string;
}

interface TransferEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountsList: BankAccountItem[];
  fromAccId: number;
  setFromAccId: (id: number) => void;
  toAccId: number;
  setToAccId: (id: number) => void;
  transferAmt: number;
  setTransferAmt: (amt: number) => void;
  transferRemarks?: string;
  setTransferRemarks?: (r: string) => void;
  onSaveTransfer: (e: React.FormEvent) => void;
  transfersList?: TransferHistoryItem[];
  onDeleteTransfer?: (id: number) => void;
}

export const TransferEntryModal: React.FC<TransferEntryModalProps> = ({
  isOpen,
  onClose,
  accountsList,
  fromAccId,
  setFromAccId,
  toAccId,
  setToAccId,
  transferAmt,
  setTransferAmt,
  transferRemarks = '',
  setTransferRemarks,
  onSaveTransfer,
  transfersList = [],
  onDeleteTransfer,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '740px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔄</span>
            <span>Contra Transfer Entry (Cash & Bank Deposit / Inter-Bank Transfer)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          <form onSubmit={onSaveTransfer}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '95px' }}>From Account</span>
                <select
                  className="win-select"
                  style={{ flex: 1 }}
                  value={fromAccId}
                  onChange={(e) => setFromAccId(parseInt(e.target.value))}
                >
                  {accountsList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (₹ {a.balance.toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '85px' }}>To Account</span>
                <select
                  className="win-select"
                  style={{ flex: 1 }}
                  value={toAccId}
                  onChange={(e) => setToAccId(parseInt(e.target.value))}
                >
                  {accountsList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (₹ {a.balance.toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '10px', marginTop: '6px' }}>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '95px' }}>Amount (₹)</span>
                <input
                  type="number"
                  step="0.01"
                  className="win-input"
                  value={transferAmt}
                  onChange={(e) => setTransferAmt(parseFloat(e.target.value) || 0)}
                  style={{ flex: 1, fontWeight: 700, fontSize: '13px', color: '#1a5276' }}
                />
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '85px' }}>Remarks / Slip</span>
                <input
                  type="text"
                  className="win-input"
                  placeholder="e.g. Bank Deposit Slip #4012 or RTGS Ref"
                  value={transferRemarks}
                  onChange={(e) => setTransferRemarks && setTransferRemarks(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                type="submit"
                className="win-btn-classic win-btn-primary"
                style={{ padding: '4px 18px', fontWeight: 700 }}
              >
                <span>⚡</span>
                <span style={{ marginLeft: '4px' }}>Execute Fund Transfer (F2)</span>
              </button>
            </div>
          </form>

          {/* Past Contra Transfers Audit Register */}
          <div style={{ marginTop: '14px', borderTop: '1px solid #7f9db9', paddingTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#333' }}>
                Recent Contra Transfers History (Cash & Bank Logs)
              </span>
              <span style={{ fontSize: '11px', color: '#666' }}>
                Total Transfers: {transfersList.length}
              </span>
            </div>

            <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '180px', overflowY: 'auto' }}>
              <table className="win-datagrid">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>From Account</th>
                    <th>To Account</th>
                    <th className="text-right">Amount (₹)</th>
                    <th>Remarks</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {transfersList.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: '#888', padding: '10px' }}>
                        No past contra transfers recorded.
                      </td>
                    </tr>
                  ) : (
                    transfersList.map((t) => (
                      <tr key={t.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                        <td style={{ fontWeight: 600, color: '#c0392b' }}>{t.from_account_name}</td>
                        <td style={{ fontWeight: 600, color: '#27ae60' }}>{t.to_account_name}</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>
                          ₹ {Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ fontSize: '11px', color: '#555' }}>{t.remarks || '-'}</td>
                        <td style={{ textAlign: 'center' }}>
                          {onDeleteTransfer && (
                            <button
                              type="button"
                              className="win-btn-classic"
                              style={{ height: '18px', padding: '0 4px', fontSize: '10px', color: '#c0392b', fontWeight: 600 }}
                              onClick={() => onDeleteTransfer(t.id)}
                              title="Void and revert this contra transfer"
                            >
                              Void
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit | F2=Execute</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {transfersList.length > 0 && (
              <button
                type="button"
                className="win-btn-classic"
                style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
                onClick={() => exportToCsv(
                  `NSAIPETROSOFT_ContraTransfers_${new Date().toISOString().split('T')[0]}`,
                  ['Date', 'From Account', 'To Account', 'Amount (INR)', 'Remarks', 'Ref No'],
                  transfersList.map((t) => [t.date, t.from_account_name, t.to_account_name, t.amount, t.remarks || '', t.reference_no || ''])
                )}
              >
                📥 Export CSV
              </button>
            )}
            <button className="win-btn-classic" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};
