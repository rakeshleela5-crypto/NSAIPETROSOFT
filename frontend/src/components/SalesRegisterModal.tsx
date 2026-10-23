import React, { useState } from 'react';
import type { CreditSaleItem, StationProfile } from '../models';
import type { CardSettlementEntry } from '../store/erpStore';
import { erpStore } from '../store/erpStore';
import { exportToCsv } from '../utils/exportCsv';
import { getTodayErpDate } from '../utils/dateUtils';

interface SalesRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  creditBills?: CreditSaleItem[];
  cardSettlements?: CardSettlementEntry[];
  salesReadings?: any[];
  stationProfile?: StationProfile;
  showToast?: (msg: string) => void;
}

export const SalesRegisterModal: React.FC<SalesRegisterModalProps> = ({
  isOpen,
  onClose,
  creditBills = erpStore.getState().creditBills,
  cardSettlements = erpStore.getState().cardSettlements,
  salesReadings = [],
  showToast,
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'CASH' | 'CREDIT' | 'DIGITAL'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  if (!isOpen) return null;

  // Aggregate unified transaction list
  const unifiedTransactions: Array<{
    id: string | number;
    date: string;
    type: 'CASH' | 'CREDIT' | 'DIGITAL';
    particulars: string;
    reference: string;
    litres?: number;
    amount: number;
    status: string;
  }> = [
    // Credit Bills
    ...creditBills.map((c) => ({
      id: `CR-${c.id}`,
      date: c.date,
      type: 'CREDIT' as const,
      particulars: `${c.customer_name || c.cust || 'Credit Customer'} (${c.vehicle_no || c.vehicle || '-'}) - ${c.product || c.product_name || 'Fuel'}`,
      reference: c.bill_no || c.bill || c.slip_no || c.slip || 'CR-BILL',
      litres: c.qty,
      amount: Number(c.amount ?? c.total ?? 0),
      status: 'POSTED',
    })),
    // Digital Settlements
    ...cardSettlements.map((s) => ({
      id: `POS-${s.id}`,
      date: s.date,
      type: 'DIGITAL' as const,
      particulars: `${s.machine_name || s.machine || 'EDC Machine'} (Batch #${s.batch_no || s.batch || '001'})`,
      reference: `SLIPS-${s.slip_count ?? s.slips ?? 1}`,
      amount: Number(s.amount || 0),
      status: 'SETTLED',
    })),
    // Shift Meter Readings (Cash Sales)
    ...salesReadings.map((r, i) => ({
      id: `NOZ-${i}`,
      date: getTodayErpDate(),
      type: 'CASH' as const,
      particulars: `${r.nozzle} (${r.item}) Meter Sales`,
      reference: `MTR-${r.close}`,
      litres: r.qty,
      amount: r.amount,
      status: 'CLOSED',
    })),
  ];

  const filtered = unifiedTransactions.filter((tx) => {
    if (filterType !== 'ALL' && tx.type !== filterType) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return (
        tx.particulars.toLowerCase().includes(s) ||
        tx.reference.toLowerCase().includes(s) ||
        String(tx.amount).includes(s)
      );
    }
    return true;
  });

  const totalFilteredAmount = filtered.reduce((sum, tx) => sum + (tx.amount || 0), 0);

  const handleExport = () => {
    exportToCsv(
      `NSAIPETROSOFT_Sales_Register_${getTodayErpDate()}`,
      ['Date', 'Type', 'Reference', 'Particulars', 'Litres', 'Amount (INR)', 'Status'],
      filtered.map((tx) => [
        tx.date,
        tx.type,
        tx.reference,
        tx.particulars,
        tx.litres || '-',
        tx.amount,
        tx.status,
      ])
    );
    if (showToast) showToast('✔ Sales register exported to CSV successfully!');
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '920px', maxHeight: '90vh' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📊</span>
            <span>Comprehensive Sales Register (Cash, Card, & Credit Audit Trail)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div className="win-actions-row">
              {(['ALL', 'CREDIT', 'DIGITAL', 'CASH'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`win-btn-classic ${filterType === t ? 'win-btn-primary' : ''}`}
                  onClick={() => setFilterType(t)}
                  style={{ fontWeight: filterType === t ? 700 : 400 }}
                >
                  {t === 'ALL' ? 'All Transactions' : t}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search reference or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="win-input"
                style={{ width: '220px' }}
              />
              <button
                type="button"
                className="win-btn-classic"
                onClick={handleExport}
                style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 700 }}
              >
                📥 Export CSV
              </button>
            </div>
          </div>

          <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '420px', overflowY: 'auto' }}>
            <table className="win-datagrid">
              <thead>
                <tr>
                  <th style={{ width: '10%' }}>Date</th>
                  <th style={{ width: '10%' }}>Type</th>
                  <th style={{ width: '12%' }}>Ref #</th>
                  <th style={{ width: '42%' }}>Particulars</th>
                  <th style={{ width: '10%', textAlign: 'right' }}>Litres</th>
                  <th style={{ width: '16%', textAlign: 'right' }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.date}</td>
                    <td>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background:
                            tx.type === 'CREDIT'
                              ? '#ffebee'
                              : tx.type === 'DIGITAL'
                              ? '#e3f2fd'
                              : '#e8f5e9',
                          color:
                            tx.type === 'CREDIT'
                              ? '#c62828'
                              : tx.type === 'DIGITAL'
                              ? '#1565c0'
                              : '#2e7d32',
                        }}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{tx.reference}</td>
                    <td style={{ color: '#0a246a' }}>{tx.particulars}</td>
                    <td className="text-right">{tx.litres ? `${tx.litres.toFixed(2)} L` : '-'}</td>
                    <td className="text-right" style={{ fontWeight: 700, color: '#002b80' }}>
                      ₹ {tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '10px', padding: '8px 12px', background: '#ece9d8', border: '1px solid #7f9db9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Showing {filtered.length} Recorded Transactions</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0a246a' }}>
              Filtered Total: ₹ {totalFilteredAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
