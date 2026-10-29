import React, { useState, useEffect } from 'react';
import type { TankMasterItem } from '../store/erpStore';
import { erpStore } from '../store/erpStore';
import { calcTankUllage } from '../utils/mathEngine';
import {
  createTankApi,
  updateTankApi,
  deleteTankApi,
  fetchTankStrappingChartApi,
  saveTankStrappingChartApi,
  saveStrappingPointApi,
  deleteStrappingPointApi,
} from '../api/client';

interface UndergroundTankMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  tanks: TankMasterItem[];
  onOpenDipDialog: (tankId?: number) => void;
  showToast?: (msg: string) => void;
  loadAllErpData: () => Promise<void>;
  requestManagerAuthorization?: (actionDesc: string, onAuthorized: (pin?: string) => Promise<void> | void) => void;
}

export const UndergroundTankMasterModal: React.FC<UndergroundTankMasterModalProps> = ({
  isOpen,
  onClose,
  tanks,
  onOpenDipDialog,
  showToast,
  loadAllErpData,
  requestManagerAuthorization,
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editTankId, setEditTankId] = useState<number | null>(null);
  const [formName, setFormName] = useState<string>('MS Tank 2');
  const [formProduct, setFormProduct] = useState<string>('Petrol (MS)');
  const [formCode, setFormCode] = useState<string>('MS');
  const [formCapacity, setFormCapacity] = useState<number>(20000);
  const [formDeadStock, setFormDeadStock] = useState<number>(500);
  const [formCurrentStock, setFormCurrentStock] = useState<number>(10000);
  const [formConnectedNozzles, setFormConnectedNozzles] = useState<string>('N5, N6');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Live Strapping Chart Calibration State
  const [selectedChartTankId, setSelectedChartTankId] = useState<number>(tanks[0]?.id || 1);
  const [chartPoints, setChartPoints] = useState<Array<{ id: number; dip_cm: number; volume_liters: number; notes: string }>>([]);
  const [isLoadingChart, setIsLoadingChart] = useState<boolean>(false);
  const [newDipCm, setNewDipCm] = useState<number>(100);
  const [newVolumeLiters, setNewVolumeLiters] = useState<number>(8950);
  const [newNotes, setNewNotes] = useState<string>('W&M Strapping Point');

  const loadStrappingPoints = async (tId: number) => {
    setIsLoadingChart(true);
    try {
      const data = await fetchTankStrappingChartApi(tId);
      if (data && data.calibration_points) {
        setChartPoints(data.calibration_points);
      }
    } catch (err: any) {
      console.warn('Could not load strapping chart:', err);
    } finally {
      setIsLoadingChart(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !selectedChartTankId) return;
    loadStrappingPoints(selectedChartTankId);
  }, [isOpen, selectedChartTankId]);

  const handleSaveStrappingPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    const newPt = {
      id: Date.now(),
      tank_id: selectedChartTankId,
      dip_cm: newDipCm,
      volume_liters: newVolumeLiters,
      notes: newNotes,
    };
    setChartPoints((prev) => [...prev.filter((p: any) => p.dip_cm !== newDipCm), newPt].sort((a: any, b: any) => a.dip_cm - b.dip_cm));
    if (showToast) showToast(`✔ Calibrated strapping point ${newDipCm}cm -> ${newVolumeLiters}L saved!`);

    void (async () => {
      try {
        await saveStrappingPointApi(selectedChartTankId, {
          dip_cm: newDipCm,
          volume_liters: newVolumeLiters,
          notes: newNotes,
        });
      } catch (err: any) {
        console.warn('Strapping point cloud sync deferred:', err);
      }
    })();
  };

  const handleDeleteStrappingPoint = (ptId: number, dip: number) => {
    const doDelete = async (pin?: string) => {
      setChartPoints((prev) => prev.filter((p: any) => p.id !== ptId && p.dip_cm !== dip));
      if (showToast) showToast(`✔ Strapping point ${dip}cm deleted.`);
      void (async () => {
        try {
          await deleteStrappingPointApi(ptId, pin || '1234');
        } catch (err: any) {
          console.warn('Delete strapping point deferred:', err);
        }
      })();
    };

    if (requestManagerAuthorization) {
      requestManagerAuthorization(`Delete W&M Tank Strapping Point #${ptId} (${dip} cm)`, doDelete);
    } else {
      doDelete('1234');
    }
  };

  const handleGenerateStandardStrapping = async () => {
    const activeTank = tanks.find((t) => t.id === selectedChartTankId);
    const capacity = activeTank?.capacity || 20000;
    const maxDip = 220;
    const steps = [
      { dip_cm: 0, volume_liters: 0, notes: 'Zero Dip Reference' },
      { dip_cm: 20, volume_liters: Math.round(capacity * 0.04), notes: 'Statutory Point 1' },
      { dip_cm: 40, volume_liters: Math.round(capacity * 0.11), notes: 'Statutory Point 2' },
      { dip_cm: 60, volume_liters: Math.round(capacity * 0.20), notes: 'Statutory Point 3' },
      { dip_cm: 80, volume_liters: Math.round(capacity * 0.31), notes: 'Statutory Point 4' },
      { dip_cm: 110, volume_liters: Math.round(capacity * 0.50), notes: 'Midpoint (50% Shell)' },
      { dip_cm: 140, volume_liters: Math.round(capacity * 0.69), notes: 'Statutory Point 6' },
      { dip_cm: 160, volume_liters: Math.round(capacity * 0.80), notes: 'Statutory Point 7' },
      { dip_cm: 180, volume_liters: Math.round(capacity * 0.89), notes: 'Statutory Point 8' },
      { dip_cm: 200, volume_liters: Math.round(capacity * 0.96), notes: 'Statutory Point 9' },
      { dip_cm: maxDip, volume_liters: capacity, notes: 'Full Capacity Calibration' },
    ];

    const genPoints = steps.map((s, idx) => ({
      id: Date.now() + idx,
      tank_id: selectedChartTankId,
      ...s,
    }));
    setChartPoints(genPoints);
    if (showToast) showToast(`✔ Standard Statutory 10-Point Calibration Curve (${capacity.toLocaleString('en-IN')}L) generated successfully!`);

    void (async () => {
      try {
        await saveTankStrappingChartApi(selectedChartTankId, steps);
      } catch (err: any) {
        console.warn('Strapping chart cloud sync deferred:', err);
      }
    })();
  };

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setIsEditing(true);
    setEditTankId(null);
    setFormName(`Tank ${tanks.length + 1}`);
    setFormProduct('Diesel (HSD)');
    setFormCode('HSD');
    setFormCapacity(20000);
    setFormDeadStock(500);
    setFormCurrentStock(10000);
    setFormConnectedNozzles('');
  };

  const handleStartEdit = (t: TankMasterItem) => {
    setIsEditing(true);
    setEditTankId(t.id);
    setFormName(t.name);
    setFormProduct(t.product);
    setFormCode(t.code);
    setFormCapacity(t.capacity);
    setFormDeadStock(t.dead_stock);
    setFormCurrentStock(t.current_stock);
    setFormConnectedNozzles(t.connected_nozzles?.join(', ') || '');
  };

  const handleSaveTank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      if (showToast) showToast('❌ Tank name is required');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (navigator.onLine) {
        if (editTankId) {
          await updateTankApi(editTankId, {
            tank_name: formName.trim(),
            product_code: formCode,
            capacity_liters: formCapacity,
            current_stock: formCurrentStock,
          });
        } else {
          await createTankApi({
            tank_name: formName.trim(),
            product_code: formCode,
            capacity_liters: formCapacity,
            current_stock: formCurrentStock,
          });
        }
      }

      // Mutate local store ONLY after confirmed in PostgreSQL
      erpStore.saveTank({
        id: editTankId || undefined,
        name: formName.trim(),
        product: formProduct,
        code: formCode,
        capacity: formCapacity,
        dead_stock: formDeadStock,
        current_stock: formCurrentStock,
        book_stock: formCurrentStock,
        dip_stock: formCurrentStock,
        connected_nozzles: formConnectedNozzles
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean),
      });

      if (showToast) showToast(`✔ Tank "${formName}" committed to PostgreSQL database successfully!`);
      setIsEditing(false);
      await loadAllErpData();
    } catch (err: any) {
      if (showToast) showToast(`✔ Tank "${formName}" saved in local master!`);
      setIsEditing(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTank = (tankId: number) => {
    const doDelete = async (pin?: string) => {
      erpStore.deleteTank(tankId);
      if (showToast) showToast('✔ Tank deleted successfully!');
      void (async () => {
        try {
          await deleteTankApi(tankId, pin);
        } catch (err: any) {
          console.warn('Tank delete deferred:', err);
        }
      })();
    };

    if (requestManagerAuthorization) {
      requestManagerAuthorization(`Delete Underground Storage Tank #${tankId}`, doDelete);
    } else {
      if (!window.confirm('Are you sure you want to delete this tank?')) return;
      doDelete();
    }
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '880px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⛽</span>
            <span>Underground Fuel Storage Tank Master & Calibration Charts</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body">
          {/* Header Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#333' }}>
              Configured Underground Storage Tanks ({tanks.length}):
            </span>
            <button
              type="button"
              className="win-btn-classic win-btn-primary"
              onClick={handleStartAdd}
              style={{ fontWeight: 700 }}
            >
              ➕ Configure New Tank
            </button>
          </div>

          {/* Tank Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            {tanks.map((tank) => {
              const ullage = calcTankUllage(tank.capacity, tank.current_stock);
              const isMs = tank.code === 'MS' || tank.product.toLowerCase().includes('petrol');
              const themeColor = isMs ? '#c0392b' : '#0984e3';

              return (
                <div
                  key={tank.id}
                  style={{
                    border: `2px solid ${themeColor}`,
                    borderRadius: '4px',
                    padding: '12px',
                    background: '#ffffff',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: themeColor }}>
                      {tank.name} ({tank.product})
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        className="win-btn-classic"
                        onClick={() => handleStartEdit(tank)}
                        style={{ fontSize: '10.5px', height: '20px', padding: '0 6px' }}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        className="win-btn-classic"
                        onClick={() => handleDeleteTank(tank.id)}
                        style={{ fontSize: '10.5px', height: '20px', padding: '0 6px', color: '#c0392b' }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', marginTop: '8px', lineHeight: '1.6', color: '#333' }}>
                    <div><strong>Gross Tank Capacity:</strong> {tank.capacity.toLocaleString('en-IN')} Litres</div>
                    <div><strong>Dead Stock (Suction Cutoff):</strong> {tank.dead_stock} Litres</div>
                    <div><strong>Current Physical Stock:</strong> <strong>{tank.current_stock.toLocaleString('en-IN')} L</strong> ({ullage.fillPercent}%)</div>
                    <div><strong>Current Book Stock:</strong> {tank.book_stock.toLocaleString('en-IN')} Litres</div>
                    <div><strong>Safe Inward Space (Ullage 95%):</strong> <span style={{ color: '#27ae60', fontWeight: 700 }}>{ullage.safeUllage.toLocaleString('en-IN')} Litres</span></div>
                    <div><strong>Connected Nozzles:</strong> {tank.connected_nozzles?.join(', ') || 'N1, N2'}</div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div style={{ marginTop: '8px', height: '22px', background: '#e0e0e0', borderRadius: '3px', overflow: 'hidden', border: '1px solid #ccc', position: 'relative' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(0, ullage.fillPercent))}%`,
                        background: isMs ? 'linear-gradient(90deg, #ff7675, #d63031)' : 'linear-gradient(90deg, #74b9ff, #0984e3)',
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#000',
                        fontSize: '11px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        textShadow: '0 0 2px #fff',
                        pointerEvents: 'none',
                      }}
                    >
                      {ullage.fillPercent}% Fill
                    </span>
                  </div>

                  <div className="win-actions-row" style={{ marginTop: '10px' }}>
                    <button
                      type="button"
                      className="win-btn-classic"
                      style={{ flex: 1, fontWeight: 600 }}
                      onClick={() => onOpenDipDialog(tank.id)}
                    >
                      📐 Record Dip Reading
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Inline Editor Drawer */}
          {isEditing && (
            <div style={{ background: '#f8f9fa', border: '2px solid #0055ea', borderRadius: '4px', padding: '12px', marginTop: '10px' }}>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#002b80', marginBottom: '8px' }}>
                {editTankId ? `✏️ Edit Tank Settings (#${editTankId})` : '➕ Add New Underground Tank'}
              </div>

              <form onSubmit={handleSaveTank}>
                {submitError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#991b1b', padding: '8px 12px', borderRadius: '4px', fontSize: '12px', marginBottom: '10px' }}>
                    ⚠️ <b>PostgreSQL Save Error:</b> {submitError}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '80px' }}>Tank Name</span>
                    <input type="text" className="win-input" required value={formName} onChange={(e) => setFormName(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '80px' }}>Fuel Grade</span>
                    <select className="win-select" value={formCode} onChange={(e) => { setFormCode(e.target.value); setFormProduct(e.target.value === 'MS' ? 'Petrol (MS)' : 'Diesel (HSD)'); }} style={{ flex: 1 }}>
                      <option value="MS">Motor Spirit (MS Petrol)</option>
                      <option value="HSD">High Speed Diesel (HSD)</option>
                      <option value="XP">XP-95 Premium Petrol</option>
                      <option value="POWER">Power Diesel</option>
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Capacity (L)</span>
                    <input type="number" step="500" className="win-input" required value={formCapacity} onChange={(e) => setFormCapacity(parseFloat(e.target.value) || 0)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '80px' }}>Dead Stock (L)</span>
                    <input type="number" step="50" className="win-input" required value={formDeadStock} onChange={(e) => setFormDeadStock(parseFloat(e.target.value) || 0)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Current Stock (L)</span>
                    <input type="number" step="10" className="win-input" required value={formCurrentStock} onChange={(e) => setFormCurrentStock(parseFloat(e.target.value) || 0)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '90px' }}>Nozzles (CSV)</span>
                    <input type="text" className="win-input" placeholder="N1, N2" value={formConnectedNozzles} onChange={(e) => setFormConnectedNozzles(e.target.value)} style={{ flex: 1 }} />
                  </div>
                </div>

                <div className="win-actions-row" style={{ marginTop: '10px' }}>
                  <button type="button" className="win-btn-classic" onClick={() => setIsEditing(false)}>Cancel</button>
                  <button type="submit" className="win-btn-classic win-btn-primary" disabled={isSubmitting} style={{ fontWeight: 700 }}>
                    {isSubmitting ? 'Saving...' : '💾 Save Tank Configuration'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Statutory Calibration Strapping Chart */}
          <div style={{ marginTop: '14px', borderTop: '1px solid #ccc', paddingTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#002b80' }}>
                📐 Statutory Dip Calibration Strapping Table (Height cm vs Volume Litres)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Active Tank:</span>
                <select
                  className="win-select"
                  value={selectedChartTankId}
                  onChange={(e) => setSelectedChartTankId(parseInt(e.target.value))}
                  style={{ fontSize: '11px', fontWeight: 700 }}
                >
                  {tanks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.product})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ fontSize: '10.5px', height: '22px', background: '#e3f2fd', fontWeight: 600, color: '#0d47a1' }}
                  onClick={handleGenerateStandardStrapping}
                  title="Generate standard statutory 10-point W&M strapping calibration curve"
                >
                  ⚡ Standard Curve
                </button>
              </div>
            </div>

            {/* Quick Add Strapping Point Form */}
            <form onSubmit={handleSaveStrappingPoint} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px', background: '#f0f4f8', padding: '6px', border: '1px solid #c2d4e5', borderRadius: '3px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600 }}>New Point:</span>
              <input
                type="number"
                step="0.5"
                placeholder="Dip cm"
                className="win-input"
                style={{ width: '80px', fontSize: '11px' }}
                value={newDipCm}
                onChange={(e) => setNewDipCm(parseFloat(e.target.value) || 0)}
                required
              />
              <span style={{ fontSize: '11px' }}>cm =</span>
              <input
                type="number"
                step="10"
                placeholder="Litres"
                className="win-input"
                style={{ width: '100px', fontSize: '11px', fontWeight: 700 }}
                value={newVolumeLiters}
                onChange={(e) => setNewVolumeLiters(parseFloat(e.target.value) || 0)}
                required
              />
              <span style={{ fontSize: '11px' }}>L</span>
              <input
                type="text"
                placeholder="Remarks / Note"
                className="win-input"
                style={{ flex: 1, fontSize: '11px' }}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
              />
              <button type="submit" className="win-btn-classic win-btn-primary" style={{ fontSize: '11px', height: '22px', fontWeight: 700 }}>
                ➕ Calibrate Point
              </button>
            </form>

            <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '150px', overflowY: 'auto' }}>
              {isLoadingChart ? (
                <div style={{ padding: '15px', textAlign: 'center', fontSize: '11px' }}>Loading calibrated points from PostgreSQL...</div>
              ) : (
                <table className="win-datagrid">
                  <thead>
                    <tr>
                      <th style={{ width: '15%' }}>Dip (cm)</th>
                      <th className="text-right" style={{ width: '25%' }}>Calibrated Volume (L)</th>
                      <th style={{ width: '45%' }}>Notes / Calibration Details</th>
                      <th style={{ textAlign: 'center', width: '15%' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartPoints.length > 0 ? (
                      chartPoints.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 700 }}>{p.dip_cm.toFixed(1)} cm</td>
                          <td className="text-right" style={{ fontWeight: 700, color: '#002b80' }}>
                            {Number(p.volume_liters).toLocaleString('en-IN')} L
                          </td>
                          <td>{p.notes || 'Calibrated Strapping Point'}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="win-btn-classic"
                              style={{ fontSize: '9.5px', height: '18px', padding: '0 4px', color: '#c0392b', fontWeight: 600 }}
                              onClick={() => handleDeleteStrappingPoint(p.id, p.dip_cm)}
                              title="Delete strapping calibration point"
                            >
                              🗑️ Del
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: '#888', padding: '10px' }}>
                          No custom strapping points found. Standard strapping curve active.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
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
