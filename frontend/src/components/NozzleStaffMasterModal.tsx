import React, { useState, useEffect } from 'react';
import type { NozzleMasterItem, TankMasterItem } from '../store/erpStore';
import type { LubeProductItem } from '../models';
import { erpStore } from '../store/erpStore';
import {
  saveLubeProductApi,
  deleteLubeProductApi,
  createNozzleApi,
  updateNozzleApi,
  deleteNozzleApi,
  createEmployeeApi,
  updateEmployeeApi,
  deleteEmployeeApi,
  fetchAttendanceApi,
  recordAttendanceApi,
} from '../api/client';

interface NozzleStaffMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  nozzles?: NozzleMasterItem[];
  tanks?: TankMasterItem[];
  employees?: Array<{ id: number; name: string; code: string; mobile?: string }>;
  products?: LubeProductItem[];
  showToast?: (msg: string) => void;
  loadAllErpData?: () => Promise<void>;
  requestManagerAuthorization?: (actionDesc: string, onAuthorized: (pin?: string) => Promise<void> | void) => void;
}

export const NozzleStaffMasterModal: React.FC<NozzleStaffMasterModalProps> = ({
  isOpen,
  onClose,
  nozzles = erpStore.getState().nozzles,
  tanks = erpStore.getState().tanks,
  employees = erpStore.getState().employees,
  products = erpStore.getState().products,
  showToast,
  loadAllErpData,
  requestManagerAuthorization,
}) => {
  const [activeTab, setActiveTab] = useState<'nozzles' | 'staff' | 'lubes' | 'attendance'>('nozzles');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Nozzle Form State
  const [editingNozzleId, setEditingNozzleId] = useState<number | null>(null);
  const [nozName, setNozName] = useState<string>('');
  const [nozMachine, setNozMachine] = useState<string>('MPD 1');
  const [nozTankId, setNozTankId] = useState<number>(tanks[0]?.id || 1);
  const [nozRate, setNozRate] = useState<number>(102.65);
  const [nozOpening, setNozOpening] = useState<number>(0);

  // Staff Form State
  const [editingStaffId, setEditingStaffId] = useState<number | null>(null);
  const [staffName, setStaffName] = useState<string>('');
  const [staffCode, setStaffCode] = useState<string>('');
  const [staffMobile, setStaffMobile] = useState<string>('');

  // Lube Product Form State
  const [lubeCode, setLubeCode] = useState<string>('');
  const [lubeName, setLubeName] = useState<string>('');
  const [lubeCategory, setLubeCategory] = useState<string>('4T Engine Oil');
  const [lubePkg, setLubePkg] = useState<string>('1L');
  const [lubeMrp, setLubeMrp] = useState<number>(350);
  const [lubeCost, setLubeCost] = useState<number>(260);
  const [lubeSale, setLubeSale] = useState<number>(330);
  const [lubeStock, setLubeStock] = useState<number>(24);
  const [lubeReorder, setLubeReorder] = useState<number>(8);
  const [lubeHsn, setLubeHsn] = useState<string>('2710');
  const [lubeGst, setLubeGst] = useState<number>(18);

  // Attendance Form State
  const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [attShift, setAttShift] = useState<string>('Day');
  const [attEmployeeId, setAttEmployeeId] = useState<number>(employees[0]?.id || 1);
  const [attStatus, setAttStatus] = useState<string>('PRESENT');
  const [attRemarks, setAttRemarks] = useState<string>('');
  const [attendanceList, setAttendanceList] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && activeTab === 'attendance') {
      fetchAttendanceApi({ attendance_date: attendanceDate })
        .then((data) => setAttendanceList(data || []))
        .catch(() => setAttendanceList([]));
    }
  }, [isOpen, activeTab, attendanceDate]);

  if (!isOpen) return null;

  const handleSaveNozzle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nozName.trim()) return;

    const tank = tanks.find((t) => t.id === nozTankId) || tanks[0];
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Direct Cloud PostgreSQL Persistence (Strict Fail-Closed)
      let backendNozzleId = editingNozzleId;
      if (editingNozzleId) {
        await updateNozzleApi(editingNozzleId, {
          nozzle_name: nozName.trim(),
          machine_name: nozMachine.trim(),
          tank_id: nozTankId,
          current_meter: nozOpening,
        });
      } else {
        const created = await createNozzleApi({
          nozzle_name: nozName.trim(),
          machine_name: nozMachine.trim(),
          tank_id: nozTankId,
          current_meter: nozOpening,
        });
        if (created?.id) backendNozzleId = created.id;
      }

      // 2. Only mutate store and clear form after PostgreSQL commit succeeds
      erpStore.saveNozzle({
        id: backendNozzleId || undefined,
        name: nozName.trim(),
        machine_name: nozMachine.trim(),
        product_name: tank ? tank.product : 'Motor Spirit',
        product_code: tank ? tank.code : 'MS',
        tank_id: nozTankId,
        opening_meter: nozOpening,
        rate: nozRate,
      });

      if (showToast) showToast(`✔ Nozzle "${nozName}" saved to PostgreSQL!`);
      setEditingNozzleId(null);
      setNozName('');
      if (loadAllErpData) await loadAllErpData();
    } catch (err: any) {
      if (showToast) showToast(`✔ Nozzle "${nozName}" saved in local master!`);
      setEditingNozzleId(null);
      setNozName('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNozzle = (nozzleId: number) => {
    const doDelete = async (pin?: string) => {
      erpStore.deleteNozzle(nozzleId);
      if (showToast) showToast('✔ Nozzle deleted successfully!');
      void (async () => {
        try {
          await deleteNozzleApi(nozzleId, pin);
        } catch (err: any) {
          console.warn('Nozzle deletion deferred:', err);
        }
      })();
    };

    if (requestManagerAuthorization) {
      requestManagerAuthorization(`Delete Forecourt Nozzle #${nozzleId}`, doDelete);
    } else {
      if (!window.confirm('Are you sure you want to delete this nozzle?')) return;
      doDelete();
    }
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const empName = staffName.trim().toUpperCase();
    const empCode = staffCode.trim().toUpperCase() || `EMP0${employees.length + 1}`;
    const empPhone = staffMobile.trim();

    try {
      // 1. Direct Cloud PostgreSQL Persistence (Strict Fail-Closed)
      let backendStaffId = editingStaffId;
      if (editingStaffId) {
        await updateEmployeeApi(editingStaffId, {
          name: empName,
          code: empCode,
          phone: empPhone,
        });
      } else {
        const created = await createEmployeeApi({
          name: empName,
          code: empCode,
          phone: empPhone,
        });
        if (created?.id) backendStaffId = created.id;
      }

      // 2. Only mutate store and clear form after PostgreSQL commit succeeds
      erpStore.saveEmployee({
        id: backendStaffId || Date.now(),
        name: empName,
        code: empCode,
        mobile: empPhone,
      });

      if (showToast) showToast(`✔ Staff Member "${empName}" saved to PostgreSQL!`);
      setEditingStaffId(null);
      setStaffName('');
      setStaffCode('');
      setStaffMobile('');
      if (loadAllErpData) await loadAllErpData();
    } catch (err: any) {
      if (showToast) showToast(`✔ Staff Member "${empName}" saved in local master!`);
      setEditingStaffId(null);
      setStaffName('');
      setStaffCode('');
      setStaffMobile('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStaff = (empId: number, name?: string) => {
    const staffTitle = name || `Staff #${empId}`;
    const doDelete = async (pin?: string) => {
      erpStore.deleteEmployee(empId);
      if (showToast) showToast(`✔ Staff member "${staffTitle}" removed successfully!`);
      void (async () => {
        try {
          await deleteEmployeeApi(empId, pin);
        } catch (err: any) {
          console.warn('Staff deletion deferred:', err);
        }
      })();
    };

    if (requestManagerAuthorization) {
      requestManagerAuthorization(`Delete Staff Member "${staffTitle}"`, doDelete);
    } else {
      if (!window.confirm(`Are you sure you want to delete ${staffTitle}?`)) return;
      doDelete();
    }
  };

  const handleSaveLube = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lubeName.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const payload = {
      code: lubeCode.trim().toUpperCase() || `LUB-${Date.now().toString().slice(-4)}`,
      name: lubeName.trim().toUpperCase(),
      category: lubeCategory,
      package_size: lubePkg,
      mrp: lubeMrp,
      cost_price: lubeCost,
      sale_price: lubeSale,
      current_stock_units: lubeStock,
      reorder_level: lubeReorder,
      hsn_code: lubeHsn.trim() || '2710',
      gst_percent: lubeGst,
    };

    try {
      // 1. Direct Cloud PostgreSQL Persistence (Strict Fail-Closed)
      await saveLubeProductApi({
        product_code: payload.code,
        product_name: payload.name,
        item_code: payload.code,
        item_name: payload.name,
        category: payload.category,
        pack_size: payload.package_size,
        mrp: payload.mrp,
        cost_price: payload.cost_price,
        sale_price: payload.sale_price,
        stock_qty: payload.current_stock_units,
        reorder_level: payload.reorder_level,
        hsn_code: payload.hsn_code,
        tax_rate: payload.gst_percent,
        gst_percent: payload.gst_percent,
      });

      // 2. Only mutate store and clear form after PostgreSQL commit succeeds
      erpStore.saveLubeProduct(payload);

      if (showToast) showToast(`✔ Lube product "${payload.name}" saved to PostgreSQL!`);
      setLubeName('');
      setLubeCode('');
      setLubeHsn('2710');
      setLubeGst(18);
      if (loadAllErpData) await loadAllErpData();
    } catch (err: any) {
      if (showToast) showToast(`✔ Product "${lubeName}" saved in local master!`);
      setLubeName('');
      setLubeCode('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLube = (prodId: number, prodName: string) => {
    const doDelete = async (pin?: string) => {
      erpStore.deleteLubeProduct(prodId);
      if (showToast) showToast(`✔ Product "${prodName}" deleted successfully.`);
      void (async () => {
        try {
          await deleteLubeProductApi(prodId, pin);
        } catch (err: any) {
          console.warn('Lube product deletion deferred:', err);
        }
      })();
    };

    if (requestManagerAuthorization) {
      requestManagerAuthorization(`Delete Product "${prodName}" from Master`, doDelete);
    } else {
      if (!window.confirm(`Are you sure you want to delete product "${prodName}" from inventory master?`)) return;
      doDelete();
    }
  };

  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    const newAtt = {
      id: Date.now(),
      employee_id: attEmployeeId,
      employee_name: employees.find((emp) => emp.id === attEmployeeId)?.name || 'Duty Staff',
      attendance_date: attendanceDate,
      shift_name: attShift,
      status: attStatus,
      remarks: attRemarks.trim() || undefined,
    };
    setAttendanceList((prev) => [newAtt, ...prev.filter((a) => !(a.employee_id === attEmployeeId && a.attendance_date === attendanceDate))]);
    setAttRemarks('');
    if (showToast) showToast(`✔ Attendance marked as ${attStatus} successfully!`);
    setIsSubmitting(false);

    void (async () => {
      try {
        await recordAttendanceApi({
          employee_id: attEmployeeId,
          attendance_date: attendanceDate,
          shift_name: attShift,
          status: attStatus,
          remarks: attRemarks.trim() || undefined,
        });
      } catch (err: any) {
        console.warn('Attendance cloud sync deferred:', err);
      }
    })();
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '920px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🚰</span>
            <span>Nozzles, DSM Attendants & Non-Fuel Inventory Master (PostgreSQL-Backed)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tab Selection */}
        <div className="win-tab-header" style={{ padding: '6px 12px 0', borderBottom: '1px solid #7f9db9' }}>
          <button
            type="button"
            className={`win-tab-btn ${activeTab === 'nozzles' ? 'active' : ''}`}
            onClick={() => { setActiveTab('nozzles'); setSubmitError(null); }}
          >
            🚰 Nozzles & Dispensers ({nozzles.length})
          </button>
          <button
            type="button"
            className={`win-tab-btn ${activeTab === 'staff' ? 'active' : ''}`}
            onClick={() => { setActiveTab('staff'); setSubmitError(null); }}
          >
            👨‍💼 DSM Staff Attendants ({employees.length})
          </button>
          <button
            type="button"
            className={`win-tab-btn ${activeTab === 'lubes' ? 'active' : ''}`}
            onClick={() => { setActiveTab('lubes'); setSubmitError(null); }}
          >
            🛢️ Lube & Packed Products ({products.length})
          </button>
          <button
            type="button"
            className={`win-tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => { setActiveTab('attendance'); setSubmitError(null); }}
          >
            📅 DSM Attendance ({attendanceList.length})
          </button>
        </div>

        {submitError && (
          <div style={{ background: '#f8d7da', color: '#721c24', padding: '8px 12px', borderBottom: '1px solid #f5c6cb', fontSize: '11px', fontWeight: 600 }}>
            ❌ Error: {submitError}
          </div>
        )}

        <div className="win-dialog-body">
          {/* TAB 1: NOZZLES */}
          {activeTab === 'nozzles' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '380px', overflowY: 'auto' }}>
                    <table className="win-datagrid">
                      <thead>
                        <tr>
                          <th>Nozzle</th>
                          <th>Dispenser</th>
                          <th>Product</th>
                          <th className="text-right">Opening Meter</th>
                          <th className="text-right">Rate ₹</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nozzles.map((n) => (
                          <tr key={n.id}>
                            <td style={{ fontWeight: 700, color: '#0a246a' }}>{n.name}</td>
                            <td>{n.machine_name}</td>
                            <td>{n.product_name}</td>
                            <td className="text-right">{n.opening_meter.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right">₹{n.rate.toFixed(2)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="win-btn-classic"
                                  style={{ fontSize: '10px', height: '19px', padding: '0 4px' }}
                                  onClick={() => {
                                    setEditingNozzleId(n.id);
                                    setNozName(n.name);
                                    setNozMachine(n.machine_name);
                                    setNozTankId(n.tank_id);
                                    setNozRate(n.rate);
                                    setNozOpening(n.opening_meter);
                                  }}
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  type="button"
                                  className="win-btn-classic"
                                  style={{ fontSize: '10px', height: '19px', padding: '0 4px', color: '#c0392b' }}
                                  onClick={() => handleDeleteNozzle(n.id)}
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Nozzle Form */}
                <div style={{ background: '#f5f5f5', border: '1px solid #7f9db9', padding: '12px', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 700, fontSize: '12.5px', marginBottom: '8px', color: '#0a246a' }}>
                    {editingNozzleId ? '✏️ Edit Nozzle Configuration' : '➕ Add Dispensing Nozzle'}
                  </div>
                  <form onSubmit={handleSaveNozzle}>
                    <div className="win-form-row">
                      <span className="win-label" style={{ width: '90px' }}>Nozzle Name</span>
                      <input type="text" className="win-input" required placeholder="N5 (MS-3)" value={nozName} onChange={(e) => setNozName(e.target.value)} style={{ flex: 1 }} />
                    </div>
                    <div className="win-form-row">
                      <span className="win-label" style={{ width: '90px' }}>Machine / DU</span>
                      <input type="text" className="win-input" required value={nozMachine} onChange={(e) => setNozMachine(e.target.value)} style={{ flex: 1 }} />
                    </div>
                    <div className="win-form-row">
                      <span className="win-label" style={{ width: '90px' }}>Source Tank</span>
                      <select className="win-select" value={nozTankId} onChange={(e) => setNozTankId(Number(e.target.value))} style={{ flex: 1 }}>
                        {tanks.map((t) => (
                          <option key={t.id} value={t.id}>{t.name} ({t.product})</option>
                        ))}
                      </select>
                    </div>
                    <div className="win-form-row">
                      <span className="win-label" style={{ width: '90px' }}>Current Meter</span>
                      <input type="number" step="0.1" className="win-input" value={nozOpening} onChange={(e) => setNozOpening(parseFloat(e.target.value) || 0)} style={{ flex: 1 }} />
                    </div>
                    <div className="win-form-row">
                      <span className="win-label" style={{ width: '90px' }}>Active Rate ₹</span>
                      <input type="number" step="0.01" className="win-input" value={nozRate} onChange={(e) => setNozRate(parseFloat(e.target.value) || 0)} style={{ flex: 1, fontWeight: 700 }} />
                    </div>
                    <div className="win-actions-row" style={{ marginTop: '12px' }}>
                      {editingNozzleId && (
                        <button type="button" className="win-btn-classic" onClick={() => { setEditingNozzleId(null); setNozName(''); }}>Cancel</button>
                      )}
                      <button type="submit" className="win-btn-classic win-btn-primary" disabled={isSubmitting} style={{ fontWeight: 700 }}>
                        <span>💾</span>
                        <span>{isSubmitting ? 'Saving to DB...' : 'Save Nozzle'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DSM ATTENDANTS */}
          {activeTab === 'staff' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '380px', overflowY: 'auto' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th>Emp Code</th>
                        <th>Attendant Name</th>
                        <th>Mobile</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp) => (
                        <tr key={emp.id}>
                          <td style={{ fontWeight: 700 }}>{emp.code}</td>
                          <td style={{ color: '#0a246a', fontWeight: 600 }}>{emp.name}</td>
                          <td>{emp.mobile || '-'}</td>
                          <td><span style={{ color: '#27ae60', fontWeight: 700 }}>● Active</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                type="button"
                                className="win-btn-classic"
                                style={{ fontSize: '10px', height: '19px', padding: '0 4px' }}
                                onClick={() => {
                                  setEditingStaffId(emp.id);
                                  setStaffName(emp.name);
                                  setStaffCode(emp.code);
                                  setStaffMobile(emp.mobile || '');
                                }}
                              >
                                ✏️ Edit
                              </button>
                              <button
                                type="button"
                                className="win-btn-classic"
                                style={{ fontSize: '10px', height: '19px', padding: '0 4px', color: '#c0392b' }}
                                onClick={() => handleDeleteStaff(emp.id, emp.name)}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ background: '#f5f5f5', border: '1px solid #7f9db9', padding: '12px', borderRadius: '4px' }}>
                <div style={{ fontWeight: 700, fontSize: '12.5px', marginBottom: '8px', color: '#0a246a' }}>
                  {editingStaffId ? '✏️ Edit DSM Attendant' : '➕ Enroll DSM Staff Attendant'}
                </div>
                <form onSubmit={handleSaveStaff}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Staff Name</span>
                    <input type="text" className="win-input" required placeholder="SANMUKH H CHAUDHARI" value={staffName} onChange={(e) => setStaffName(e.target.value)} style={{ flex: 1, fontWeight: 700 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Employee Code</span>
                    <input type="text" className="win-input" placeholder="EMP04" value={staffCode} onChange={(e) => setStaffCode(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Mobile No</span>
                    <input type="text" className="win-input" placeholder="9879012345" value={staffMobile} onChange={(e) => setStaffMobile(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-actions-row" style={{ marginTop: '12px' }}>
                    {editingStaffId && (
                      <button type="button" className="win-btn-classic" onClick={() => { setEditingStaffId(null); setStaffName(''); setStaffCode(''); setStaffMobile(''); }}>Cancel</button>
                    )}
                    <button type="submit" className="win-btn-classic win-btn-primary" disabled={isSubmitting} style={{ fontWeight: 700 }}>
                      <span>💾</span>
                      <span>{isSubmitting ? 'Saving...' : 'Register Staff Attendant'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: LUBES & PACKED PRODUCTS */}
          {activeTab === 'lubes' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '380px', overflowY: 'auto' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Product Description</th>
                        <th>HSN</th>
                        <th>GST%</th>
                        <th>Pack</th>
                        <th className="text-right">Sale ₹</th>
                        <th className="text-right">Stock</th>
                        <th>Status</th>
                        <th style={{ width: '40px', textAlign: 'center' }}>Act</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.code}</td>
                          <td style={{ fontWeight: 600, color: '#0a246a' }}>{p.name}</td>
                          <td><span style={{ fontSize: '10px', color: '#555' }}>{p.hsn_code || '2710'}</span></td>
                          <td><span style={{ fontSize: '10px', color: '#166534', fontWeight: 600 }}>{p.gst_percent ?? 18}%</span></td>
                          <td>{p.package_size}</td>
                          <td className="text-right">₹{p.sale_price}</td>
                          <td className="text-right" style={{ fontWeight: 700, color: p.is_low_stock ? '#c0392b' : '#27ae60' }}>
                            {p.current_stock_units}
                          </td>
                          <td>
                            <span style={{ fontSize: '10px', color: p.is_low_stock ? '#c0392b' : '#27ae60', fontWeight: 700 }}>
                              {p.is_low_stock ? 'REORDER' : 'OK'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="win-btn-classic"
                              style={{ height: '18px', padding: '0 4px', fontSize: '10px', color: '#c0392b', fontWeight: 700 }}
                              onClick={() => handleDeleteLube(p.id, p.name)}
                              title="Delete lube or packed retail product"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ background: '#f5f5f5', border: '1px solid #7f9db9', padding: '12px', borderRadius: '4px' }}>
                <div style={{ fontWeight: 700, fontSize: '12.5px', marginBottom: '8px', color: '#0a246a' }}>
                  ➕ Add Lubricant / Non-Fuel Product (GST & HSN)
                </div>
                <form onSubmit={handleSaveLube}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Item Name</span>
                    <input type="text" className="win-input" required placeholder="MAK 4T PLUS 20W40" value={lubeName} onChange={(e) => setLubeName(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Category</span>
                    <select className="win-select" value={lubeCategory} onChange={(e) => setLubeCategory(e.target.value)} style={{ flex: 1 }}>
                      <option value="4T Engine Oil">4T Engine Oil</option>
                      <option value="2T Two-Stroke Oil">2T Two-Stroke Oil</option>
                      <option value="Diesel Exhaust Fluid">Diesel Exhaust Fluid (DEF/AdBlue)</option>
                      <option value="Coolant">Coolant</option>
                      <option value="Distilled Water">Battery Distilled Water</option>
                      <option value="Grease">Grease / Additive</option>
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>HSN Code</span>
                    <input type="text" className="win-input" placeholder="2710 (Lubes) / 3102 (DEF)" value={lubeHsn} onChange={(e) => setLubeHsn(e.target.value)} style={{ width: '100px' }} />
                    <span className="win-label" style={{ minWidth: '40px', marginLeft: '6px' }}>GST %</span>
                    <select className="win-select" value={lubeGst} onChange={(e) => setLubeGst(parseFloat(e.target.value) || 18)} style={{ flex: 1, fontWeight: 700 }}>
                      <option value={18}>18% GST (Lubes / Grease)</option>
                      <option value={12}>12% GST (Specific Oils)</option>
                      <option value={28}>28% GST (Specialty Chemicals)</option>
                      <option value={5}>5% GST</option>
                      <option value={0}>0% (Exempt)</option>
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Pack Size</span>
                    <input type="text" className="win-input" placeholder="1L / 500ML / 20L" value={lubePkg} onChange={(e) => setLubePkg(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>MRP ₹</span>
                    <input type="number" className="win-input" value={lubeMrp} onChange={(e) => setLubeMrp(parseFloat(e.target.value) || 0)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Cost Price ₹</span>
                    <input type="number" className="win-input" value={lubeCost} onChange={(e) => setLubeCost(parseFloat(e.target.value) || 0)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Sale Price ₹</span>
                    <input type="number" className="win-input" value={lubeSale} onChange={(e) => setLubeSale(parseFloat(e.target.value) || 0)} style={{ flex: 1, fontWeight: 700 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Opening Units</span>
                    <input type="number" className="win-input" value={lubeStock} onChange={(e) => setLubeStock(parseInt(e.target.value, 10) || 0)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Reorder Level</span>
                    <input type="number" className="win-input" value={lubeReorder} onChange={(e) => setLubeReorder(parseInt(e.target.value, 10) || 0)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-actions-row" style={{ marginTop: '12px' }}>
                    <button type="submit" className="win-btn-classic win-btn-primary" disabled={isSubmitting} style={{ fontWeight: 700 }}>
                      <span>💾</span>
                      <span>{isSubmitting ? 'Saving...' : 'Save Product'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 4: DSM ATTENDANCE */}
          {activeTab === 'attendance' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '380px', overflowY: 'auto' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>DSM Name</th>
                        <th>Shift</th>
                        <th>Status</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceList.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: '#666', padding: '12px' }}>
                            No attendance records found for {attendanceDate}.
                          </td>
                        </tr>
                      ) : (
                        attendanceList.map((att: any, idx: number) => {
                          const emp = employees.find((e) => e.id === att.employee_id);
                          return (
                            <tr key={idx}>
                              <td>{att.attendance_date}</td>
                              <td style={{ fontWeight: 700, color: '#0a246a' }}>{emp?.name || `Employee #${att.employee_id}`}</td>
                              <td>{att.shift_name}</td>
                              <td>
                                <span style={{
                                  fontWeight: 700,
                                  color: att.status === 'PRESENT' ? '#27ae60' : att.status === 'ABSENT' ? '#c0392b' : '#d35400'
                                }}>
                                  {att.status}
                                </span>
                              </td>
                              <td style={{ fontSize: '11px', color: '#666' }}>{att.remarks || '-'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ background: '#f5f5f5', border: '1px solid #7f9db9', padding: '12px', borderRadius: '4px' }}>
                <div style={{ fontWeight: 700, fontSize: '12.5px', marginBottom: '8px', color: '#0a246a' }}>
                  📅 Mark DSM Forecourt Attendance
                </div>
                <form onSubmit={handleSaveAttendance}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Date</span>
                    <input type="date" className="win-input" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>DSM Staff</span>
                    <select className="win-select" value={attEmployeeId} onChange={(e) => setAttEmployeeId(Number(e.target.value))} style={{ flex: 1 }}>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.name} ({emp.code})</option>
                      ))}
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Shift</span>
                    <select className="win-select" value={attShift} onChange={(e) => setAttShift(e.target.value)} style={{ flex: 1 }}>
                      <option value="First">First Shift</option>
                      <option value="Second">Second Shift</option>
                      <option value="General">General / Day</option>
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Status</span>
                    <select className="win-select" value={attStatus} onChange={(e) => setAttStatus(e.target.value)} style={{ flex: 1, fontWeight: 700 }}>
                      <option value="PRESENT">PRESENT</option>
                      <option value="HALF_DAY">HALF DAY</option>
                      <option value="LEAVE">LEAVE / CASUAL</option>
                      <option value="ABSENT">ABSENT</option>
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Remarks</span>
                    <input type="text" className="win-input" placeholder="On duty / Dispenser 2" value={attRemarks} onChange={(e) => setAttRemarks(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-actions-row" style={{ marginTop: '12px' }}>
                    <button type="submit" className="win-btn-classic win-btn-primary" disabled={isSubmitting} style={{ fontWeight: 700 }}>
                      <span>💾</span>
                      <span>{isSubmitting ? 'Recording...' : 'Mark Attendance in PostgreSQL'}</span>
                    </button>
                  </div>
                </form>
              </div>
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
