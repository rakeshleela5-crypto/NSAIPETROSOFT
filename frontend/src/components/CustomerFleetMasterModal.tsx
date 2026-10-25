import React, { useState, useRef } from 'react';
import type { CustomerFull } from '../models';
import { erpStore } from '../store/erpStore';
import {
  createCustomer,
  updateCustomer,
  deleteCustomer as deleteCustomerApi,
  addVehicle,
  deleteCustomerVehicleApi,
  toggleCustomerBlockApi,
  bulkImportCustomersCsvApi,
} from '../api/client';
import { exportToCsv } from '../utils/exportCsv';

interface CustomerFleetMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerFull[];
  openCustomerStatement: (id: number) => void;
  showToast: (msg: string) => void;
  loadAllErpData: () => Promise<void>;
  requestManagerAuthorization?: (actionDesc: string, onAuthorized: (pin?: string) => Promise<void> | void) => void;
}

export const CustomerFleetMasterModal: React.FC<CustomerFleetMasterModalProps> = ({
  isOpen,
  onClose,
  customers,
  openCustomerStatement,
  showToast,
  loadAllErpData,
  requestManagerAuthorization,
}) => {
  const [masterCustSearch, setMasterCustSearch] = useState<string>('');
  const [selectedCustId, setSelectedCustId] = useState<number | null>(null);

  // CSV Import State
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);

  // Form state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editCustId, setEditCustId] = useState<number | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formMobile, setFormMobile] = useState<string>('');
  const [formCity, setFormCity] = useState<string>('SURAT');
  const [formGstin, setFormGstin] = useState<string>('');
  const [formPan, setFormPan] = useState<string>('');
  const [formCreditLimit, setFormCreditLimit] = useState<number>(50000);
  const [formOpeningBal, setFormOpeningBal] = useState<number>(0);
  const [formBillPeriod, setFormBillPeriod] = useState<string>('FORTNIGHTLY');

  // Vehicles for selected/editing customer
  const [vehicleList, setVehicleList] = useState<Array<{ vehicle_no: string; fuel_type: string; driver_name: string }>>([]);
  const [newVehNo, setNewVehNo] = useState<string>('');
  const [newVehFuel, setNewVehFuel] = useState<string>('HSD');
  const [newVehDriver, setNewVehDriver] = useState<string>('');

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setIsEditing(true);
    setEditCustId(null);
    setFormName('');
    setFormMobile('');
    setFormCity('SURAT');
    setFormGstin('');
    setFormPan('');
    setFormCreditLimit(50000);
    setFormOpeningBal(0);
    setFormBillPeriod('FORTNIGHTLY');
    setVehicleList([]);
  };

  const handleStartEdit = (c: CustomerFull) => {
    setIsEditing(true);
    setEditCustId(c.id);
    setFormName(c.name);
    setFormMobile(c.mobile || '');
    setFormCity(c.city || 'SURAT');
    setFormGstin(c.gst_no || '');
    setFormPan(c.pan_no || '');
    setFormCreditLimit(c.credit_limit || 50000);
    setFormOpeningBal(c.current_outstanding || 0);
    setFormBillPeriod(c.bill_period || 'FORTNIGHTLY');
    setVehicleList(
      (c.vehicles || []).map((v) => ({
        vehicle_no: v,
        fuel_type: 'HSD',
        driver_name: 'Fleet Driver',
      }))
    );
  };

  const handleAddVehicle = () => {
    if (!newVehNo.trim()) return;
    const cleanVeh = newVehNo.trim().toUpperCase();
    if (vehicleList.some((v) => v.vehicle_no === cleanVeh)) {
      showToast('⚠ Vehicle number already exists in fleet list');
      return;
    }
    setVehicleList([...vehicleList, { vehicle_no: cleanVeh, fuel_type: newVehFuel, driver_name: newVehDriver.trim() || 'Driver' }]);
    setNewVehNo('');
    setNewVehDriver('');
  };

  const handleRemoveVehicle = async (vehNo: string) => {
    const doRemove = async (pin?: string) => {
      if (editCustId) {
        try {
          await deleteCustomerVehicleApi(editCustId, vehNo, pin);
          setVehicleList((prev) => prev.filter((v) => v.vehicle_no !== vehNo));
          erpStore.removeCustomerVehicle(editCustId, vehNo);
          showToast(`✔ Vehicle ${vehNo} removed from fleet`);
          await loadAllErpData();
        } catch (err: any) {
          showToast(`❌ Cannot remove vehicle: ${err.message || 'Operation failed'}`);
        }
      } else {
        setVehicleList((prev) => prev.filter((v) => v.vehicle_no !== vehNo));
      }
    };

    if (requestManagerAuthorization && editCustId) {
      requestManagerAuthorization(`Remove Vehicle "${vehNo}" from Customer Fleet`, doRemove);
    } else {
      doRemove();
    }
  };

  const handleDownloadFleetTemplate = () => {
    const headers = [
      'name',
      'mobile',
      'city',
      'state',
      'address',
      'gst_no',
      'pan_no',
      'credit_limit',
      'opening_balance',
      'bill_period',
      'vehicles',
    ];
    const sampleRows = [
      [
        'SHREE BALAJI LOGISTICS & TRANSPORT',
        '9825123456',
        'SURAT',
        'GUJARAT',
        'Ring Road Transport Hub',
        '24AAACS5432D1Z8',
        'AAACS5432D',
        250000.0,
        68450.0,
        'FORTNIGHTLY',
        'GJ05AB1234,GJ05CD5678,GJ05EF9012',
      ],
      [
        'GUJARAT EARTHMOVERS & INFRA',
        '9898011223',
        'SURAT',
        'GUJARAT',
        'Hazira Port Highway',
        '24AABCE1122C1Z4',
        'AABCE1122C',
        150000.0,
        42100.0,
        'MONTHLY',
        'GJ05XY9988,GJ05JK4455',
      ],
      [
        'PATEL TRAVELS & BUS SERVICE',
        '9824055667',
        'SURAT',
        'GUJARAT',
        'Central Bus Stand Station Road',
        '24AACCP7788P1Z2',
        'AACCP7788P',
        100000.0,
        18900.0,
        'WEEKLY',
        'GJ05TR7711,GJ05TR7722',
      ],
    ];
    exportToCsv('NSAIPETROSOFT_Fleet_Customers_Template', headers, sampleRows);
    if (showToast) showToast('📄 Fleet CSV Template downloaded! Fill in Excel and click Import CSV.');
  };

  const handleCustomerCsvSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csvText = event.target?.result as string;
      if (!csvText || !csvText.trim()) {
        if (showToast) showToast('❌ Selected CSV file is empty.');
        return;
      }

      setIsImporting(true);
      try {
        const res = await bulkImportCustomersCsvApi({ csv_content: csvText });
        if (res.status === 'success') {
          showToast(`✔ ${res.message} Permanently committed to PostgreSQL!`);
          await loadAllErpData();
        } else {
          showToast(`⚠ Import response: ${res.message}`);
        }
      } catch (err: any) {
        showToast(`❌ Bulk Fleet CSV Import Error: ${err.message || 'Server rejected file'}`);
      } finally {
        setIsImporting(false);
        if (csvFileInputRef.current) {
          csvFileInputRef.current.value = '';
        }
      }
    };
    reader.onerror = () => {
      showToast('❌ Error reading file from disk.');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('❌ Customer/Firm name is required');
      return;
    }

    if (formGstin.trim()) {
      const gstinClean = formGstin.trim().toUpperCase();
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(gstinClean)) {
        showToast('❌ Invalid GSTIN: Must be 15 characters (e.g. 24AAACS5432D1Z8)');
        return;
      }
    }

    try {
      // 1. Direct Cloud PostgreSQL Persistence (Strict Fail-Closed)
      let persistedCustId = editCustId;
      if (editCustId) {
        await updateCustomer(editCustId, {
          name: formName.trim().toUpperCase(),
          mobile: formMobile.trim(),
          city: formCity.trim().toUpperCase(),
          gst_no: formGstin.trim().toUpperCase() || undefined,
          pan_no: formPan.trim().toUpperCase() || undefined,
          credit_limit: formCreditLimit,
          bill_period: formBillPeriod,
        });
      } else {
        const res = await createCustomer({
          name: formName.trim().toUpperCase(),
          mobile: formMobile.trim(),
          city: formCity.trim().toUpperCase(),
          gst_no: formGstin.trim().toUpperCase() || undefined,
          pan_no: formPan.trim().toUpperCase() || undefined,
          credit_limit: formCreditLimit,
          current_outstanding: formOpeningBal,
          opening_balance: formOpeningBal,
          bill_period: formBillPeriod,
        });
        persistedCustId = res.id;
      }

      // Persist vehicles
      if (persistedCustId && vehicleList.length > 0) {
        for (const v of vehicleList) {
          try {
            await addVehicle(persistedCustId, v.vehicle_no);
          } catch {
            // Duplicate vehicle or already assigned
          }
        }
      }

      // 2. Update local ACID store only after PostgreSQL commit succeeded
      erpStore.saveCustomer({
        id: persistedCustId || undefined,
        name: formName.trim().toUpperCase(),
        mobile: formMobile.trim(),
        city: formCity.trim().toUpperCase(),
        gst_no: formGstin.trim().toUpperCase() || undefined,
        pan_no: formPan.trim().toUpperCase() || undefined,
        credit_limit: formCreditLimit,
        current_outstanding: editCustId ? undefined : formOpeningBal,
        bill_period: formBillPeriod,
        vehicles: vehicleList.map((v) => v.vehicle_no),
      });

      showToast(`✔ Customer "${formName.toUpperCase()}" saved to PostgreSQL!`);
      setIsEditing(false);
      await loadAllErpData();
    } catch (err: any) {
      showToast(`❌ Database Error: ${err.message || 'Failed to save customer to PostgreSQL'}`);
    }
  };

  const handleDeleteCustomer = (c: CustomerFull) => {
    const doDelete = async (pin?: string) => {
      try {
        await deleteCustomerApi(c.id, pin);
        erpStore.deleteCustomer(c.id);
        showToast(`✔ Customer "${c.name}" deleted from database.`);
        await loadAllErpData();
      } catch (err: any) {
        showToast(`❌ Cannot delete: ${err.message || 'Operation failed'}`);
      }
    };

    if (requestManagerAuthorization) {
      requestManagerAuthorization(`Delete Customer "${c.name}"`, doDelete);
    } else {
      if (!window.confirm(`Are you sure you want to delete customer "${c.name}"?`)) return;
      doDelete();
    }
  };

  const handleToggleBlockCustomer = (c: CustomerFull) => {
    const actionDesc = c.is_blocked
      ? `Unblock Customer "${c.name}" (Restore Credit Dispensing)`
      : `Block Customer "${c.name}" from Credit Fuel Dispensing`;
    const doToggle = async () => {
      try {
        const res = await toggleCustomerBlockApi(c.id);
        showToast(`✔ Customer "${c.name}" credit status: ${res.is_blocked ? 'BLOCKED 🚫' : 'ACTIVE ✅'}`);
        await loadAllErpData();
      } catch (err: any) {
        showToast(`❌ Cannot toggle credit block: ${err.message || 'Operation failed'}`);
      }
    };

    if (requestManagerAuthorization) {
      requestManagerAuthorization(actionDesc, doToggle);
    } else {
      if (!window.confirm(`Are you sure you want to ${actionDesc}?`)) return;
      doToggle();
    }
  };

  const filtered = customers.filter((c) => {
    if (!masterCustSearch) return true;
    const s = masterCustSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(s) ||
      (c.city && c.city.toLowerCase().includes(s)) ||
      (c.mobile && c.mobile.includes(s)) ||
      (c.gst_no && c.gst_no.toLowerCase().includes(s)) ||
      (c.vehicles && c.vehicles.some((v) => v.toLowerCase().includes(s)))
    );
  });

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '1020px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>👥</span>
            <span>Customer Fleet Master & Credit Ledger Settings</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: isEditing ? '1.2fr 1fr' : '1fr', gap: '12px' }}>
          {/* Left / Main Table View */}
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <div className="win-search-box" style={{ flex: 1, margin: 0 }}>
                <span style={{ fontWeight: 600 }}>🔍 Search:</span>
                <input
                  type="text"
                  placeholder="Search name, mobile, vehicle, or GSTIN..."
                  value={masterCustSearch}
                  onChange={(e) => setMasterCustSearch(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              <input
                type="file"
                ref={csvFileInputRef}
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleCustomerCsvSelected}
              />
              <button
                type="button"
                className="win-btn-classic"
                onClick={handleDownloadFleetTemplate}
                style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Download standard CSV template for Fleet Customers & Vehicles"
              >
                <span>📄</span> Template
              </button>
              <button
                type="button"
                className="win-btn-classic"
                onClick={() => csvFileInputRef.current?.click()}
                disabled={isImporting}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: isImporting ? '#e0e0e0' : '#eef8ff',
                  borderColor: '#2980b9',
                  fontWeight: 600,
                  color: '#1a5276'
                }}
                title="Bulk Import 20, 50, 100+ Fleet Customer Accounts & Vehicles directly into PostgreSQL"
              >
                <span>📥</span> {isImporting ? 'Importing...' : 'Import CSV'}
              </button>
              <button
                type="button"
                className="win-btn-classic win-btn-primary"
                onClick={handleStartAdd}
                style={{ fontWeight: 700, padding: '4px 12px' }}
              >
                ➕ Add New Customer
              </button>
            </div>

            <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: isEditing ? '380px' : '460px', overflowY: 'auto' }}>
              <table className="win-datagrid">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Customer Name</th>
                    <th>Mobile</th>
                    <th>GSTIN</th>
                    <th className="text-right">Balance (₹)</th>
                    <th className="text-right">Credit Limit (₹)</th>
                    <th>Vehicles</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const bal = c.current_outstanding || 0;
                    const isOver = bal > c.credit_limit;
                    return (
                      <tr
                        key={c.id}
                        className={selectedCustId === c.id ? 'win-selected-row' : ''}
                        onClick={() => setSelectedCustId(c.id)}
                      >
                        <td style={{ fontWeight: 600 }}>{c.code}</td>
                        <td style={{ color: c.is_blocked ? '#c0392b' : '#0055ea', fontWeight: 600, cursor: 'pointer' }} onClick={() => openCustomerStatement(c.id)}>
                          {c.name}
                          {c.is_blocked && (
                            <span style={{ marginLeft: '6px', fontSize: '9px', background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', padding: '1px 4px', borderRadius: '3px', fontWeight: 700 }}>
                              🚫 BLOCKED
                            </span>
                          )}
                        </td>
                        <td>{c.mobile || '-'}</td>
                        <td style={{ fontSize: '10.5px' }}>{c.gst_no || '-'}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: bal > 0 ? (isOver ? '#b71c1c' : '#c0392b') : '#2e7d32' }}>
                          {bal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="text-right">{c.credit_limit.toLocaleString('en-IN')}</td>
                        <td>
                          <span style={{ fontSize: '10.5px', background: '#eef2f7', padding: '1px 4px', borderRadius: '3px' }}>
                            {c.vehicles?.length || 0} Veh
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="win-btn-classic"
                            style={{
                              fontSize: '10px',
                              height: '20px',
                              padding: '0 4px',
                              marginRight: '4px',
                              color: c.is_blocked ? '#2e7d32' : '#c62828',
                              fontWeight: 600,
                              background: c.is_blocked ? '#e8f5e9' : '#fff',
                            }}
                            onClick={() => handleToggleBlockCustomer(c)}
                            title={c.is_blocked ? "Unblock customer credit fuel dispensing" : "Block customer from credit fuel dispensing"}
                          >
                            {c.is_blocked ? '🔓 Unblock' : '🔒 Block'}
                          </button>
                          <button
                            type="button"
                            className="win-btn-classic"
                            style={{ fontSize: '10px', height: '20px', padding: '0 4px', marginRight: '4px' }}
                            onClick={() => handleStartEdit(c)}
                            title="Edit customer details and vehicle fleet"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            className="win-btn-classic"
                            style={{ fontSize: '10px', height: '20px', padding: '0 4px', color: '#c00000' }}
                            onClick={() => handleDeleteCustomer(c)}
                            title="Delete customer (Guarded: only allowed if balance is zero and no transaction history)"
                          >
                            🗑️ Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Editor Form (When Adding or Editing) */}
          {isEditing && (
            <div style={{ background: '#f5f5f5', border: '1px solid #7f9db9', padding: '12px', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc', paddingBottom: '6px', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, color: '#0a246a' }}>
                  {editCustId ? '✏️ Edit Customer & Fleet' : '➕ Add Fleet Customer'}
                </span>
                <button type="button" className="win-btn-classic" onClick={() => setIsEditing(false)}>✕ Cancel</button>
              </div>

              <form onSubmit={handleSaveCustomer}>
                <div className="win-form-row">
                  <span className="win-label" style={{ width: '100px' }}>Firm Name *</span>
                  <input type="text" className="win-input" required value={formName} onChange={(e) => setFormName(e.target.value)} style={{ flex: 1, fontWeight: 700 }} />
                </div>

                <div className="win-form-row">
                  <span className="win-label" style={{ width: '100px' }}>Mobile/WA *</span>
                  <input type="text" className="win-input" required value={formMobile} onChange={(e) => setFormMobile(e.target.value)} style={{ flex: 1 }} />
                </div>

                <div className="win-form-row">
                  <span className="win-label" style={{ width: '100px' }}>GSTIN (15-Ch)</span>
                  <input type="text" className="win-input" placeholder="24AAACS5432D1Z8" value={formGstin} onChange={(e) => setFormGstin(e.target.value)} style={{ flex: 1 }} />
                </div>

                <div className="win-form-row">
                  <span className="win-label" style={{ width: '100px' }}>PAN No</span>
                  <input type="text" className="win-input" placeholder="AAACS5432D" value={formPan} onChange={(e) => setFormPan(e.target.value)} style={{ flex: 1 }} />
                </div>

                <div className="win-form-row">
                  <span className="win-label" style={{ width: '100px' }}>Credit Limit ₹</span>
                  <input type="number" step="1000" className="win-input" value={formCreditLimit} onChange={(e) => setFormCreditLimit(parseFloat(e.target.value) || 0)} style={{ flex: 1, fontWeight: 700 }} />
                </div>

                {!editCustId && (
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '100px' }}>Opening Bal ₹</span>
                    <input type="number" step="10" className="win-input" value={formOpeningBal} onChange={(e) => setFormOpeningBal(parseFloat(e.target.value) || 0)} style={{ flex: 1 }} />
                  </div>
                )}

                <div className="win-form-row">
                  <span className="win-label" style={{ width: '100px' }}>Bill Cycle</span>
                  <select className="win-select" value={formBillPeriod} onChange={(e) => setFormBillPeriod(e.target.value)} style={{ flex: 1 }}>
                    <option value="WEEKLY">Weekly</option>
                    <option value="FORTNIGHTLY">Fortnightly (15-Day)</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>

                {/* Assigned Vehicles List */}
                <div style={{ marginTop: '10px', borderTop: '1px dashed #bbb', paddingTop: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '11.5px', marginBottom: '4px' }}>
                    Assigned Vehicles Fleet ({vehicleList.length}):
                  </div>

                  <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                    <input
                      type="text"
                      className="win-input"
                      placeholder="GJ05AB1234"
                      value={newVehNo}
                      onChange={(e) => setNewVehNo(e.target.value)}
                      style={{ width: '110px', fontWeight: 600 }}
                    />
                    <select className="win-select" value={newVehFuel} onChange={(e) => setNewVehFuel(e.target.value)} style={{ width: '60px' }}>
                      <option value="HSD">HSD</option>
                      <option value="MS">MS</option>
                    </select>
                    <input
                      type="text"
                      className="win-input"
                      placeholder="Driver Name"
                      value={newVehDriver}
                      onChange={(e) => setNewVehDriver(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="win-btn-classic" onClick={handleAddVehicle}>➕ Add</button>
                  </div>

                  <div style={{ maxHeight: '110px', overflowY: 'auto', background: '#fff', border: '1px solid #ccc', padding: '4px' }}>
                    {vehicleList.length === 0 ? (
                      <div style={{ fontSize: '10.5px', color: '#888', fontStyle: 'italic' }}>No vehicles mapped yet.</div>
                    ) : (
                      vehicleList.map((v) => (
                        <div key={v.vehicle_no} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '2px 0', borderBottom: '1px solid #eee' }}>
                          <span><strong>{v.vehicle_no}</strong> ({v.fuel_type}) - {v.driver_name}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveVehicle(v.vehicle_no)}
                            style={{ background: 'none', border: 'none', color: '#c00000', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="win-actions-row" style={{ marginTop: '12px' }}>
                  <button type="button" className="win-btn-classic" onClick={() => setIsEditing(false)}>Cancel</button>
                  <button type="submit" className="win-btn-classic win-btn-primary" style={{ fontWeight: 700 }}>
                    <span>💾</span>
                    <span>Save Customer</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
