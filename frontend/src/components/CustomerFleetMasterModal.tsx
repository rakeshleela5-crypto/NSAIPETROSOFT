import React, { useState } from 'react';
import type { CustomerFull } from '../models';
import { createCustomer, addVehicle } from '../api/client';

interface CustomerFleetMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerFull[];
  openCustomerStatement: (id: number) => void;
  showToast: (msg: string) => void;
  loadAllErpData: () => Promise<void>;
}

export const CustomerFleetMasterModal: React.FC<CustomerFleetMasterModalProps> = ({
  isOpen,
  onClose,
  customers,
  openCustomerStatement,
  showToast,
  loadAllErpData,
}) => {
  const [masterCustSearch, setMasterCustSearch] = useState<string>('');
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustMobile, setNewCustMobile] = useState<string>('');
  const [newCustCity, setNewCustCity] = useState<string>('SURAT');
  const [newCustLimit, setNewCustLimit] = useState<number>(50000);
  const [newCustVehicle, setNewCustVehicle] = useState<string>('');

  if (!isOpen) return null;

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName) return;
    try {
      const res = await createCustomer({
        name: newCustName,
        mobile: newCustMobile,
        city: newCustCity,
        credit_limit: newCustLimit,
      });
      if (newCustVehicle) {
        await addVehicle(res.id, newCustVehicle);
      }
      showToast(`✔ Customer "${newCustName.toUpperCase()}" created successfully in PostgreSQL!`);
      setNewCustName('');
      setNewCustMobile('');
      setNewCustVehicle('');
      await loadAllErpData();
    } catch (err: any) {
      showToast(`⚠ Error creating customer: ${err.message || 'Database error'}`);
    }
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '920px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>👥</span>
            <span>Customer Fleet & Credit Limits Master</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
          <div>
            <div className="win-search-box">
              <span style={{ fontWeight: 600 }}>Search Customers:</span>
              <input
                type="text"
                placeholder="Search name or vehicle..."
                value={masterCustSearch}
                onChange={(e) => setMasterCustSearch(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ border: '1px solid #7f9db9', background: '#fff', height: '320px', overflowY: 'auto' }}>
              <table className="win-datagrid">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>City</th>
                    <th>Mobile</th>
                    <th className="text-right">Credit Limit</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {customers
                    .filter((c) =>
                      masterCustSearch
                        ? c.name.toLowerCase().includes(masterCustSearch.toLowerCase()) ||
                          c.city?.toLowerCase().includes(masterCustSearch.toLowerCase())
                        : true
                    )
                    .map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.code}</td>
                        <td style={{ color: '#0055ea', fontWeight: 600 }}>{c.name}</td>
                        <td>{c.city}</td>
                        <td>{c.mobile}</td>
                        <td className="text-right">₹ {c.credit_limit.toLocaleString('en-IN')}</td>
                        <td>
                          <button
                            className="win-btn-classic"
                            style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                            onClick={() => openCustomerStatement(c.id)}
                          >
                            Statement
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>Add New Fleet Account</div>
            <form onSubmit={handleCreateCustomer}>
              <div className="win-form-row">
                <span className="win-label">Name</span>
                <input type="text" className="win-input" required value={newCustName} onChange={(e) => setNewCustName(e.target.value)} style={{ flex: 1 }} placeholder="e.g. BALAJI LOGISTICS" />
              </div>
              <div className="win-form-row">
                <span className="win-label">Mobile</span>
                <input type="text" className="win-input" value={newCustMobile} onChange={(e) => setNewCustMobile(e.target.value)} style={{ flex: 1 }} placeholder="+91 9898989898" />
              </div>
              <div className="win-form-row">
                <span className="win-label">City</span>
                <input type="text" className="win-input" value={newCustCity} onChange={(e) => setNewCustCity(e.target.value)} style={{ flex: 1 }} />
              </div>
              <div className="win-form-row">
                <span className="win-label">Credit Limit (₹)</span>
                <input type="number" className="win-input" value={newCustLimit} onChange={(e) => setNewCustLimit(parseFloat(e.target.value) || 0)} style={{ flex: 1, fontWeight: 700 }} />
              </div>
              <div className="win-form-row">
                <span className="win-label">Vehicle No.</span>
                <input type="text" className="win-input" value={newCustVehicle} onChange={(e) => setNewCustVehicle(e.target.value.toUpperCase())} style={{ flex: 1 }} placeholder="e.g. GJ19AB1234" />
              </div>
              <button type="submit" className="win-btn-classic win-btn-primary" style={{ width: '100%', marginTop: '10px' }}>
                Save Customer Account
              </button>
            </form>
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
