import React from 'react';
import type { BankAccountItem } from '../models';

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
  onSaveTransfer: (e: React.FormEvent) => void;
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
  onSaveTransfer,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '640px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔄</span>
            <span>Contra Transfer Entry (Cash & Bank Deposit)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          <form onSubmit={onSaveTransfer}>
            <div className="win-form-row">
              <span className="win-label">From Account</span>
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
              <span className="win-label">To Account</span>
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
            <div className="win-form-row">
              <span className="win-label">Transfer Amount</span>
              <input
                type="number"
                step="0.01"
                className="win-input"
                value={transferAmt}
                onChange={(e) => setTransferAmt(parseFloat(e.target.value) || 0)}
                style={{ fontWeight: 700, fontSize: '13px' }}
              />
            </div>
            <button
              type="submit"
              className="win-btn-classic win-btn-primary"
              style={{ width: '100%', marginTop: '12px' }}
            >
              Execute Fund Transfer
            </button>
          </form>
        </div>
        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit | F2=Execute</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
