import React, { useState } from 'react';
import type { CustomerFull, StationProfile } from '../models';

interface SelectCustomerBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerFull[];
  stationProfile: StationProfile;
  openCustomerStatement: (id: number) => void;
}

export const SelectCustomerBillModal: React.FC<SelectCustomerBillModalProps> = ({
  isOpen,
  onClose,
  customers,
  stationProfile,
  openCustomerStatement,
}) => {
  const [selectedCustForBill, setSelectedCustForBill] = useState<string>(customers[0]?.name || '');

  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '520px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>👥</span>
            <span>Select Customer (Credit Statement Generation)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          <div style={{ fontSize: '11px', marginBottom: '8px', color: '#333' }}>
            Select an institutional credit customer to generate the {stationProfile.oilCompany} Statement of Accounts:
          </div>
          <div className="win-form-row">
            <span className="win-label" style={{ minWidth: '100px' }}>Customer Name</span>
            <select
              className="win-select"
              style={{ flex: 1, fontWeight: 700 }}
              value={selectedCustForBill}
              onChange={(e) => setSelectedCustForBill(e.target.value)}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name} ({c.city || 'Station Fleet'})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: '14px', border: '1px solid #7f9db9', background: '#fff', maxHeight: '160px', overflowY: 'auto' }}>
            <table className="win-datagrid">
              <thead>
                <tr>
                  <th>Customer Name</th>
                  <th>City</th>
                  <th className="text-right">Current Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCustForBill(c.name)}
                    style={{ cursor: 'pointer', background: selectedCustForBill === c.name ? '#cce8ff' : '' }}
                  >
                    <td style={{ fontWeight: 700 }}>{c.name}</td>
                    <td>{c.city || '-'}</td>
                    <td className="text-right" style={{ color: '#c0392b', fontWeight: 700 }}>
                      ₹ {c.current_outstanding ? c.current_outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="win-btn-classic win-btn-primary"
              onClick={() => {
                const cust = customers.find((c) => c.name.includes(selectedCustForBill)) || customers[0];
                if (cust) {
                  openCustomerStatement(cust.id);
                } else {
                  openCustomerStatement(1);
                }
              }}
            >
              📑 Open Statement of Accounts (F2)
            </button>
            <button type="button" className="win-btn-classic" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};
