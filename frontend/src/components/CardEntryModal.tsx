import React from 'react';
import { exportToCsv } from '../utils/exportCsv';

interface CardSettlementRow {
  id?: number;
  machine?: string;
  batch?: string;
  slips?: number;
  amount: number;
  status?: string;
  machine_name?: string;
  batch_no?: string;
  slip_count?: number;
}

interface CardEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardMachine: string;
  setCardMachine: (m: string) => void;
  cardBatchNo: string;
  setCardBatchNo: (b: string) => void;
  cardSlipsCount: number;
  setCardSlipsCount: (cnt: number) => void;
  cardBatchTotal: number;
  setCardBatchTotal: (tot: number) => void;
  cardSettlements: CardSettlementRow[];
  onSaveCardSettlement: () => void;
  onDeleteCardSettlement?: (idOrBatch: string | number, machineName: string, amount: number) => void;
}

export const CardEntryModal: React.FC<CardEntryModalProps> = ({
  isOpen,
  onClose,
  cardMachine,
  setCardMachine,
  cardBatchNo,
  setCardBatchNo,
  cardSlipsCount,
  setCardSlipsCount,
  cardBatchTotal,
  setCardBatchTotal,
  cardSettlements,
  onSaveCardSettlement,
  onDeleteCardSettlement,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '740px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>💳</span>
            <span>Digital POS Machine Batch Settlement (Card Swipe & QR)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>Record EDC Batch Settlement</div>
            <div className="win-form-row">
              <span className="win-label">EDC Machine</span>
              <select
                className="win-select"
                style={{ flex: 1 }}
                value={cardMachine}
                onChange={(e) => setCardMachine(e.target.value)}
              >
                <option>M SWIPE</option>
                <option>PAYTM QR</option>
                <option>ICICI CARD</option>
                <option>PETRO CARD</option>
                <option>GPAY</option>
              </select>
            </div>
            <div className="win-form-row">
              <span className="win-label">Batch No</span>
              <input
                type="text"
                className="win-input"
                value={cardBatchNo}
                onChange={(e) => setCardBatchNo(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div className="win-form-row">
              <span className="win-label">Slip Count</span>
              <input
                type="number"
                className="win-input"
                value={cardSlipsCount}
                onChange={(e) => setCardSlipsCount(parseInt(e.target.value) || 0)}
                style={{ flex: 1 }}
              />
            </div>
            <div className="win-form-row">
              <span className="win-label">Batch Total (₹)</span>
              <input
                type="number"
                step="0.01"
                className="win-input"
                value={cardBatchTotal}
                onChange={(e) => setCardBatchTotal(parseFloat(e.target.value) || 0)}
                style={{ flex: 1, fontWeight: 700 }}
              />
            </div>
            <button
              type="button"
              className="win-btn-classic win-btn-primary"
              style={{ width: '100%', marginTop: '10px' }}
              onClick={onSaveCardSettlement}
            >
              Save Batch Settlement
            </button>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>Today's POS Batch History</div>
            <div style={{ border: '1px solid #7f9db9', background: '#fff', height: '220px', overflowY: 'auto' }}>
              <table className="win-datagrid">
                <thead>
                  <tr>
                    <th>Machine</th>
                    <th>Batch</th>
                    <th>Slips</th>
                    <th className="text-right">Amount</th>
                    <th>Status</th>
                    <th style={{ width: '36px', textAlign: 'center' }}>Del</th>
                  </tr>
                </thead>
                <tbody>
                  {cardSettlements.map((c, i) => {
                    const rowKey = c.id ?? c.batch ?? c.batch_no ?? i;
                    const machineName = c.machine || c.machine_name || 'EDC POS';
                    const batchKey = c.id ?? c.batch ?? c.batch_no ?? '';
                    return (
                      <tr key={rowKey}>
                        <td style={{ fontWeight: 600 }}>{machineName}</td>
                        <td>{c.batch || c.batch_no || '001'}</td>
                        <td>{c.slips ?? c.slip_count ?? 1}</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>₹ {c.amount.toFixed(2)}</td>
                        <td><span style={{ color: '#27ae60', fontWeight: 700 }}>{c.status || 'SETTLED'}</span></td>
                        <td style={{ textAlign: 'center' }}>
                          {onDeleteCardSettlement && (
                            <button
                              type="button"
                              className="win-btn-classic"
                              style={{ height: '18px', padding: '0 4px', fontSize: '10px', color: '#c0392b', fontWeight: 700 }}
                              onClick={() => onDeleteCardSettlement(batchKey, machineName, c.amount)}
                              title="Void this POS EDC batch settlement"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit</span>
          <div className="win-actions-row">
            <button
              type="button"
              className="win-btn-classic"
              style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
              onClick={() => exportToCsv(
                `NSAIPETROSOFT_CardBatches_${new Date().toISOString().split('T')[0]}`,
                ['EDC Machine', 'Batch No', 'Slips Count', 'Amount (INR)', 'Status'],
                cardSettlements.map(c => [
                  c.machine || c.machine_name || 'EDC POS',
                  c.batch || c.batch_no || '001',
                  c.slips ?? c.slip_count ?? 1,
                  c.amount,
                  c.status || 'SETTLED'
                ])
              )}
              title="Export POS EDC card settlements to Microsoft Excel or CSV"
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
