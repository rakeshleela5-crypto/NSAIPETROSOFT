import React, { useState } from 'react';
import type { CustomerFull } from '../models';
import { createCustomer, addVehicle, toggleCustomerBlockApi } from '../api/client';

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
  const [togglingId, setTogglingId] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleToggleBlock = async (c: CustomerFull) => {
    try {
      setTogglingId(c.id);
      const res = await toggleCustomerBlockApi(c.id);
      showToast(`✔ ${c.name}: Credit status is now ${res.status}`);
      await loadAllErpData();
    } catch (err: any) {
      showToast(`⚠ Failed to toggle status: ${err.message}`);
    } finally {
      setTogglingId(null);
    }
  };

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
      <div className="win-form-dialog" style={{ width: '980px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>👥</span>
            <span>Customer Fleet & Credit Limits Master</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '12px' }}>
          <div>
            <div className="win-search-box">
              <span style={{ fontWeight: 600 }}>Search Customers:</span>
              <input
                type="text"
                placeholder="Search name, mobile, or city..."
                value={masterCustSearch}
                onChange={(e) => setMasterCustSearch(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ border: '1px solid #7f9db9', background: '#fff', height: '340px', overflowY: 'auto' }}>
              <table className="win-datagrid">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Mobile</th>
                    <th className="text-right">Balance</th>
                    <th className="text-right">Credit Limit</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {customers
                    .filter((c) =>
                      masterCustSearch
                        ? c.name.toLowerCase().includes(masterCustSearch.toLowerCase()) ||
                          c.city?.toLowerCase().includes(masterCustSearch.toLowerCase()) ||
                          c.mobile?.includes(masterCustSearch)
                        : true
                    )
                    .map((c) => {
                      const balance = c.current_outstanding || 0;
                      const isOverLimit = balance > c.credit_limit;
                      return (
                        <tr key={c.id} style={{ background: c.is_blocked ? '#fff3f3' : undefined }}>
                          <td style={{ fontWeight: 600 }}>{c.code}</td>
                          <td style={{ color: '#0055ea', fontWeight: 600 }}>{c.name}</td>
                          <td>{c.mobile}</td>
                          <td className="text-right" style={{ fontWeight: 700, color: balance > 0 ? (isOverLimit ? '#b71c1c' : '#c0392b') : '#2e7d32' }}>
                            ₹ {balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="text-right">₹ {c.credit_limit.toLocaleString('en-IN')}</td>
                          <td>
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '2px',
                              background: c.is_blocked ? '#ffebee' : '#e8f5e9',
                              color: c.is_blocked ? '#c62828' : '#2e7d32',
                              border: `1px solid ${c.is_blocked ? '#ef9a9a' : '#a5d6a7'}`,
                            }}>
                              {c.is_blocked ? 'BLOCKED' : 'ACTIVE'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '3px' }}>
                              <button
                                className="win-btn-classic"
                                style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                                onClick={() => openCustomerStatement(c.id)}
                                title="Open ledger statement"
                              >
                                Statement
                              </button>
                              <button
                                className="win-btn-classic"
                                style={{
                                  height: '18px',
                                  padding: '0 4px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  background: c.is_blocked ? '#e8f5e9' : '#ffebee',
                                  color: c.is_blocked ? '#1b5e20' : '#b71c1c',
                                  borderColor: c.is_blocked ? '#81c784' : '#e57373',
                                }}
                                onClick={() => handleToggleBlock(c)}
                                disabled={togglingId === c.id}
                                title={c.is_blocked ? 'Unblock customer credit fueling' : 'Block customer credit due to default'}
                              >
                                {togglingId === c.id ? '...' : (c.is_blocked ? 'Unblock' : 'Block')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
