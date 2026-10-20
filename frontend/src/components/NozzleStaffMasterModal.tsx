import React, { useState } from 'react';
import type { NozzleMasterItem, TankMasterItem } from '../store/erpStore';
import type { LubeProductItem } from '../models';
import { erpStore } from '../store/erpStore';

interface NozzleStaffMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  nozzles?: NozzleMasterItem[];
  tanks?: TankMasterItem[];
  employees?: Array<{ id: number; name: string; code: string; mobile?: string }>;
  products?: LubeProductItem[];
  showToast?: (msg: string) => void;
  loadAllErpData?: () => Promise<void>;
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
}) => {
  const [activeTab, setActiveTab] = useState<'nozzles' | 'staff' | 'lubes'>('nozzles');

  // Nozzle Form State
  const [editingNozzleId, setEditingNozzleId] = useState<number | null>(null);
  const [nozName, setNozName] = useState<string>('');
  const [nozMachine, setNozMachine] = useState<string>('MPD 1');
  const [nozTankId, setNozTankId] = useState<number>(tanks[0]?.id || 1);
  const [nozRate, setNozRate] = useState<number>(102.65);
  const [nozOpening, setNozOpening] = useState<number>(0);

  // Staff Form State
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

  if (!isOpen) return null;

  const handleSaveNozzle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nozName.trim()) return;

    const tank = tanks.find((t) => t.id === nozTankId) || tanks[0];
    try {
      erpStore.saveNozzle({
        id: editingNozzleId || undefined,
        name: nozName.trim(),
        machine_name: nozMachine.trim(),
        product_name: tank ? tank.product : 'Motor Spirit',
        product_code: tank ? tank.code : 'MS',
        tank_id: nozTankId,
        opening_meter: nozOpening,
        rate: nozRate,
      });

      if (showToast) showToast(`✔ Nozzle "${nozName}" saved successfully!`);
      setEditingNozzleId(null);
      setNozName('');
      if (loadAllErpData) await loadAllErpData();
    } catch (err: any) {
      if (showToast) showToast(`❌ Error: ${err.message}`);
    }
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim()) return;

    const state = erpStore.getState();
    const newEmp = {
      id: Date.now(),
      name: staffName.trim().toUpperCase(),
      code: staffCode.trim().toUpperCase() || `EMP0${employees.length + 1}`,
      mobile: staffMobile.trim(),
    };

    state.employees.push(newEmp);
    if (showToast) showToast(`✔ Staff Member "${newEmp.name}" added!`);
    setStaffName('');
    setStaffCode('');
    setStaffMobile('');
    if (loadAllErpData) await loadAllErpData();
  };

  const handleSaveLube = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lubeName.trim()) return;

    try {
      erpStore.saveLubeProduct({
        code: lubeCode.trim().toUpperCase() || `LUB-${Date.now().toString().slice(-4)}`,
        name: lubeName.trim().toUpperCase(),
        category: lubeCategory,
        package_size: lubePkg,
        mrp: lubeMrp,
        cost_price: lubeCost,
        sale_price: lubeSale,
        current_stock_units: lubeStock,
        reorder_level: lubeReorder,
      });

      if (showToast) showToast(`✔ Lube product "${lubeName}" added!`);
      setLubeName('');
      setLubeCode('');
      if (loadAllErpData) await loadAllErpData();
    } catch (err: any) {
      if (showToast) showToast(`❌ Error: ${err.message}`);
    }
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '920px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🚰</span>
            <span>Nozzles, DSM Attendants & Non-Fuel Inventory Master</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tab Selection */}
        <div className="win-tab-header" style={{ padding: '6px 12px 0', borderBottom: '1px solid #7f9db9' }}>
          <button
            type="button"
            className={`win-tab-btn ${activeTab === 'nozzles' ? 'active' : ''}`}
            onClick={() => setActiveTab('nozzles')}
          >
            🚰 Nozzles & Dispensers ({nozzles.length})
          </button>
          <button
            type="button"
            className={`win-tab-btn ${activeTab === 'staff' ? 'active' : ''}`}
            onClick={() => setActiveTab('staff')}
          >
            👨‍💼 DSM Staff Attendants ({employees.length})
          </button>
          <button
            type="button"
            className={`win-tab-btn ${activeTab === 'lubes' ? 'active' : ''}`}
            onClick={() => setActiveTab('lubes')}
          >
            🛢️ Lube & Packed Products ({products.length})
          </button>
        </div>

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
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                      {editingNozzleId && (
                        <button type="button" className="win-btn-classic" onClick={() => { setEditingNozzleId(null); setNozName(''); }}>Cancel</button>
                      )}
                      <button type="submit" className="win-btn-classic win-btn-primary" style={{ fontWeight: 700 }}>
                        💾 Save Nozzle
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
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp) => (
                        <tr key={emp.id}>
                          <td style={{ fontWeight: 700 }}>{emp.code}</td>
                          <td style={{ color: '#0a246a', fontWeight: 600 }}>{emp.name}</td>
                          <td>{emp.mobile || '-'}</td>
                          <td><span style={{ color: '#27ae60', fontWeight: 700 }}>● Active</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ background: '#f5f5f5', border: '1px solid #7f9db9', padding: '12px', borderRadius: '4px' }}>
                <div style={{ fontWeight: 700, fontSize: '12.5px', marginBottom: '8px', color: '#0a246a' }}>
                  ➕ Enroll DSM Staff Attendant
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
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <button type="submit" className="win-btn-classic win-btn-primary" style={{ fontWeight: 700 }}>
                      💾 Register Staff Attendant
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
                        <th>Pack</th>
                        <th className="text-right">Sale ₹</th>
                        <th className="text-right">Stock</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.code}</td>
                          <td style={{ fontWeight: 600, color: '#0a246a' }}>{p.name}</td>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ background: '#f5f5f5', border: '1px solid #7f9db9', padding: '12px', borderRadius: '4px' }}>
                <div style={{ fontWeight: 700, fontSize: '12.5px', marginBottom: '8px', color: '#0a246a' }}>
                  ➕ Add Lubricant / Non-Fuel Product
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
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <button type="submit" className="win-btn-classic win-btn-primary" style={{ fontWeight: 700 }}>
                      💾 Save Product
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
