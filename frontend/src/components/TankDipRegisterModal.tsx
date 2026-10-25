import React, { useState } from 'react';
import type { TankStock } from '../models';
import { exportToCsv } from '../utils/exportCsv';
import { calculateDipVolumeApi } from '../api/client';
import { calculateCylindricalTankVolume, calcDipVariance, roundVolume, convertDensityTo15C } from '../utils/petroMath';
import { erpStore } from '../store/erpStore';

interface TankDipRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  tanks: TankStock[];
  dipTankId: number;
  setDipTankId: (id: number) => void;
  dipOpenCm: number;
  setDipOpenCm: (cm: number) => void;
  dipOpenStock: number;
  setDipOpenStock: (stock: number) => void;
  dipReceipt: number;
  setDipReceipt: (receipt: number) => void;
  dipCloseCm: number;
  setDipCloseCm: (cm: number) => void;
  dipCloseStock: number;
  setDipCloseStock: (stock: number) => void;
  dipObservedDensity?: number;
  setDipObservedDensity?: (density: number | undefined) => void;
  dipObservedTemp?: number;
  setDipObservedTemp?: (temp: number | undefined) => void;
  dipsList: any[];
  salesReadings?: any[];
  onSaveDip: (e: React.FormEvent) => void;
  onDeleteDip?: (id: number) => void;
}

export const TankDipRegisterModal: React.FC<TankDipRegisterModalProps> = ({
  isOpen,
  onClose,
  tanks,
  dipTankId,
  setDipTankId,
  dipOpenCm,
  setDipOpenCm,
  dipOpenStock,
  setDipOpenStock,
  dipReceipt,
  setDipReceipt,
  dipCloseCm,
  setDipCloseCm,
  dipCloseStock,
  setDipCloseStock,
  dipObservedDensity,
  setDipObservedDensity,
  dipObservedTemp,
  setDipObservedTemp,
  dipsList,
  salesReadings,
  onSaveDip,
  onDeleteDip,
}) => {
  const [calcNotice, setCalcNotice] = useState<string>('');

  if (!isOpen) return null;

  const currentTank = tanks.find((t) => t.id === dipTankId) || tanks[0];
  const tankCapacity = currentTank?.capacity || 20000;

  const handleCalcOpen = async () => {
    if (dipOpenCm <= 0) return;
    try {
      setCalcNotice('Calculating open volume from strapping table...');
      const res = await calculateDipVolumeApi(dipTankId, dipOpenCm);
      setDipOpenStock(res.volume_liters);
      setCalcNotice(`✔ Opening Dip ${dipOpenCm} cm = ${res.volume_liters} L (${res.fill_percent}% full)`);
    } catch {
      // Local mathematical strapping calibration (horizontal cylindrical shell formula)
      const vol = calculateCylindricalTankVolume(dipOpenCm * 10, 2200, tankCapacity);
      const fillPct = roundVolume((vol / tankCapacity) * 100, 1);
      setDipOpenStock(vol);
      setCalcNotice(`✔ Offline Strapping Calibration: ${dipOpenCm} cm = ${vol.toLocaleString('en-IN')} L (${fillPct}% capacity)`);
    }
  };

  const handleCalcClose = async () => {
    if (dipCloseCm <= 0) return;
    try {
      setCalcNotice('Calculating closing volume from strapping table...');
      const res = await calculateDipVolumeApi(dipTankId, dipCloseCm);
      setDipCloseStock(res.volume_liters);
      setCalcNotice(`✔ Closing Dip ${dipCloseCm} cm = ${res.volume_liters} L (${res.fill_percent}% full)`);
    } catch {
      // Local mathematical strapping calibration
      const vol = calculateCylindricalTankVolume(dipCloseCm * 10, 2200, tankCapacity);
      const fillPct = roundVolume((vol / tankCapacity) * 100, 1);
      setDipCloseStock(vol);
      setCalcNotice(`✔ Offline Strapping Calibration: ${dipCloseCm} cm = ${vol.toLocaleString('en-IN')} L (${fillPct}% capacity)`);
    }
  };

  // Sum nozzle meter sales drawn from this tank
  const storeState = erpStore.getState();
  const tankNozzles = storeState.nozzles.filter((n) => n.tank_id === dipTankId);
  const tankNozzleIds = new Set(tankNozzles.map((n) => n.id));

  const meterSalesFromReadings = (salesReadings || [])
    .filter((r) => r.nozzle_id && tankNozzleIds.has(r.nozzle_id))
    .reduce((acc, r) => acc + (r.qty || 0), 0);

  const meterSalesFromStore = tankNozzles.reduce((acc, n) => {
    const net = Math.max(0, n.closing_meter - n.opening_meter - (n.testing || 0));
    return acc + net;
  }, 0);

  const effectiveMeterSales = roundVolume(meterSalesFromReadings > 0 ? meterSalesFromReadings : meterSalesFromStore, 2);

  // Live Variance Analysis: Book vs Dip (Opening + Receipts - Meter Sales)
  const expectedBookStock = Math.max(0, roundVolume(dipOpenStock + dipReceipt - effectiveMeterSales, 2));
  const varianceResult = calcDipVariance(dipCloseStock, expectedBookStock, tankCapacity);
  const isAbnormalShrinkage = varianceResult.status === 'CRITICAL_LOSS' || (varianceResult.diffLitres < -100);

  // ASTM Table 53B Hydrometer Density Conversion & Statutory Verification
  const isMS = (currentTank?.product || '').toUpperCase().includes('MS') || (currentTank?.name || '').toUpperCase().includes('MS');
  const densityCalc = (dipObservedDensity && dipObservedDensity > 0 && dipObservedTemp && dipObservedTemp > 0)
    ? convertDensityTo15C(dipObservedDensity, dipObservedTemp, isMS ? 'MS' : 'HSD')
    : null;
  const isDensityCompliant = densityCalc
    ? isMS
      ? densityCalc.density15C >= 720 && densityCalc.density15C <= 775
      : densityCalc.density15C >= 820 && densityCalc.density15C <= 860
    : true;

  const handleFormSubmit = (e: React.FormEvent) => {
    onSaveDip(e);
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '660px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📐</span>
            <span>Tank Dip Register & Evaporation Loss Audit</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          {calcNotice && (
            <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', color: '#0d47a1', padding: '4px 8px', fontSize: '11px', marginBottom: '8px', fontWeight: 600 }}>
              {calcNotice}
            </div>
          )}
          <form onSubmit={handleFormSubmit}>
            <div className="win-form-row">
              <span className="win-label">Tank</span>
              <select
                className="win-select"
                style={{ flex: 1 }}
                value={dipTankId}
                onChange={(e) => setDipTankId(parseInt(e.target.value))}
              >
                {tanks.length > 0 ? (
                  tanks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.product}) - Cap: {t.capacity.toLocaleString('en-IN')}L
                    </option>
                  ))
                ) : (
                  <>
                    <option value={1}>MS Tank 1 (Petrol) - Cap: 20000L</option>
                    <option value={2}>HSD Tank 1 (Diesel) - Cap: 20000L</option>
                  </>
                )}
              </select>
            </div>
            <div className="win-form-row">
              <span className="win-label">Opening Dip (cm)</span>
              <input
                type="number"
                step="0.1"
                className="win-input"
                style={{ width: '80px', fontWeight: 700 }}
                value={dipOpenCm}
                onChange={(e) => setDipOpenCm(parseFloat(e.target.value) || 0)}
              />
              <button
                type="button"
                className="win-btn-classic"
                style={{ fontSize: '10px', height: '22px', padding: '0 4px', background: '#e8f5e9', borderColor: '#81c784', fontWeight: 600 }}
                onClick={handleCalcOpen}
                title="Auto-calculate liters using cylindrical strapping table"
              >
                ⚡ Strapping Calc
              </button>
              <span className="win-label" style={{ minWidth: '60px', marginLeft: '6px' }}>Stock (L)</span>
              <input
                type="number"
                className="win-input"
                style={{ flex: 1, fontWeight: 700 }}
                value={dipOpenStock}
                onChange={(e) => setDipOpenStock(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="win-form-row">
              <span className="win-label">Inward Receipt (L)</span>
              <input
                type="number"
                className="win-input"
                style={{ width: '120px' }}
                value={dipReceipt}
                onChange={(e) => setDipReceipt(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="win-form-row">
              <span className="win-label">Closing Dip (cm)</span>
              <input
                type="number"
                step="0.1"
                className="win-input"
                style={{ width: '80px', fontWeight: 700 }}
                value={dipCloseCm}
                onChange={(e) => setDipCloseCm(parseFloat(e.target.value) || 0)}
              />
              <button
                type="button"
                className="win-btn-classic"
                style={{ fontSize: '10px', height: '22px', padding: '0 4px', background: '#e8f5e9', borderColor: '#81c784', fontWeight: 600 }}
                onClick={handleCalcClose}
                title="Auto-calculate liters using cylindrical strapping table"
              >
                ⚡ Strapping Calc
              </button>
              <span className="win-label" style={{ minWidth: '60px', marginLeft: '6px' }}>Stock (L)</span>
              <input
                type="number"
                className="win-input"
                style={{ flex: 1, fontWeight: 700 }}
                value={dipCloseStock}
                onChange={(e) => setDipCloseStock(parseFloat(e.target.value) || 0)}
              />
            </div>

            {/* Morning Hydrometer Density & Temperature Audit (ASTM Table 53B) */}
            <div style={{
              marginTop: '8px',
              padding: '8px 10px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '3px',
            }}>
              <div style={{ fontWeight: 700, fontSize: '11px', color: '#1e3a8a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🌡</span>
                <span>Morning Hydrometer Density & Temperature (ASTM Table 53B Reduction)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="win-form-row" style={{ margin: 0 }}>
                  <span className="win-label" style={{ minWidth: '95px', fontSize: '11px' }}>Obs. Density</span>
                  <input
                    type="number"
                    step="0.1"
                    className="win-input"
                    style={{ flex: 1, fontWeight: 700 }}
                    placeholder={isMS ? 'e.g. 745.2 kg/m³' : 'e.g. 828.5 kg/m³'}
                    value={dipObservedDensity ?? ''}
                    onChange={(e) => setDipObservedDensity?.(e.target.value ? parseFloat(e.target.value) : undefined)}
                  />
                </div>
                <div className="win-form-row" style={{ margin: 0 }}>
                  <span className="win-label" style={{ minWidth: '85px', fontSize: '11px' }}>Obs. Temp (°C)</span>
                  <input
                    type="number"
                    step="0.1"
                    className="win-input"
                    style={{ flex: 1, fontWeight: 700 }}
                    placeholder="e.g. 29.5"
                    value={dipObservedTemp ?? ''}
                    onChange={(e) => setDipObservedTemp?.(e.target.value ? parseFloat(e.target.value) : undefined)}
                  />
                </div>
              </div>
              {densityCalc && (
                <div style={{
                  marginTop: '6px',
                  padding: '4px 8px',
                  background: isDensityCompliant ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${isDensityCompliant ? '#86efac' : '#fde68a'}`,
                  borderRadius: '2px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '10.5px'
                }}>
                  <span>
                    Converted 15°C Density: <strong style={{ color: '#0f172a' }}>{densityCalc.density15C} kg/m³</strong> (ASTM 53B)
                  </span>
                  <span style={{ fontWeight: 700, color: isDensityCompliant ? '#166534' : '#b45309' }}>
                    {isDensityCompliant ? '✔ Compliant (Statutory Range)' : '⚠ Variance Warning'}
                  </span>
                </div>
              )}
            </div>

            {/* Live Variance Analysis Box: Book vs Dip */}
            <div style={{
              marginTop: '10px',
              padding: '8px 10px',
              background: isAbnormalShrinkage ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${isAbnormalShrinkage ? '#ef4444' : '#86efac'}`,
              borderRadius: '3px',
              fontSize: '11px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontWeight: 700, color: isAbnormalShrinkage ? '#b91c1c' : '#166534' }}>
                  {isAbnormalShrinkage ? '⚠ ABNORMAL VOLUMETRIC SHRINKAGE DETECTED' : '✔ Physical Dip vs Book Stock Variance Analysis'}
                </span>
                <span style={{
                  padding: '1px 6px',
                  borderRadius: '3px',
                  fontWeight: 700,
                  fontSize: '10px',
                  background: isAbnormalShrinkage ? '#fee2e2' : '#dcfce7',
                  color: isAbnormalShrinkage ? '#991b1b' : '#15803d',
                }}>
                  {varianceResult.status} ({varianceResult.diffPercent > 0 ? `+${varianceResult.diffPercent}` : varianceResult.diffPercent}%)
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '10.5px' }}>
                <div>Open: <strong>{dipOpenStock.toLocaleString('en-IN')} L</strong></div>
                <div>Receipts: <strong>+{dipReceipt.toLocaleString('en-IN')} L</strong></div>
                <div>Meter Sales: <strong style={{ color: '#2563eb' }}>-{effectiveMeterSales.toLocaleString('en-IN')} L</strong></div>
                <div>Book Stock: <strong>{expectedBookStock.toLocaleString('en-IN')} L</strong></div>
                <div>Physical Dip: <strong>{dipCloseStock.toLocaleString('en-IN')} L</strong></div>
                <div>Variation: <strong style={{ color: varianceResult.diffLitres < 0 ? '#dc2626' : '#16a34a' }}>
                  {varianceResult.diffLitres > 0 ? `+${varianceResult.diffLitres}` : varianceResult.diffLitres} L
                </strong></div>
              </div>
              {isAbnormalShrinkage && (
                <div style={{ marginTop: '4px', fontSize: '10px', color: '#b91c1c', fontWeight: 600 }}>
                  🚨 Critical shortage exceeds OMC ±0.5% statutory handling limit! Check for tank bottom water, pipeline leaks, or meter calibration drifts.
                </div>
              )}
            </div>

            <div className="win-actions-row" style={{ marginTop: '10px' }}>
              <button type="submit" className="win-btn-classic win-btn-primary">
                <span>💾</span>
                <span>Record Dip (F2)</span>
              </button>
            </div>
          </form>

          {/* Recent Underground Tank Dip Entries */}
          {dipsList && dipsList.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontWeight: 700, fontSize: '11px', marginBottom: '4px', color: '#1e3a8a' }}>
                📋 Underground Tank Dip Physical Audit Log
              </div>
              <div className="table-container" style={{ maxHeight: '130px', overflowY: 'auto', border: '1px solid #cbd5e1' }}>
                <table className="win-table" style={{ fontSize: '10px' }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Tank</th>
                      <th className="text-right">Open Dip</th>
                      <th className="text-right">Close Dip</th>
                      <th>Density @ 15°C</th>
                      <th className="text-right">Meter Sales</th>
                      <th className="text-right">Variation</th>
                      <th style={{ width: '36px', textAlign: 'center' }}>Del</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dipsList.map((d: any, idx: number) => {
                      const dipId = d.id ?? idx;
                      const varL = Number(d.variation ?? d.variation_liters ?? 0);
                      return (
                        <tr key={dipId}>
                          <td>{d.date || 'Today'}</td>
                          <td>{d.tank_name || `Tank #${d.tank_id || dipTankId}`}</td>
                          <td className="text-right">{d.opening_dip ?? 0} cm ({d.opening_stock ?? 0} L)</td>
                          <td className="text-right">{d.closing_dip ?? 0} cm ({d.closing_stock ?? 0} L)</td>
                          <td style={{ fontSize: '9.5px', whiteSpace: 'nowrap' }}>
                            {d.observed_density ? (
                              <span>
                                {d.observed_density} @ {d.observed_temp ?? 15}°C{' '}
                                <span style={{ fontWeight: 700, color: '#1e3a8a' }}>
                                  ({d.density_15c ? `${d.density_15c}` : '-'})
                                </span>
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            )}
                          </td>
                          <td className="text-right">{Number(d.meter_sale ?? d.meter_wise_sale ?? 0).toLocaleString('en-IN')} L</td>
                          <td className="text-right" style={{ fontWeight: 700, color: varL < 0 ? '#dc2626' : '#16a34a' }}>
                            {varL > 0 ? `+${varL}` : varL} L
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {d.id && onDeleteDip && (
                              <button
                                type="button"
                                className="win-btn-classic"
                                style={{ height: '18px', padding: '0 4px', fontSize: '10px', color: '#c0392b', fontWeight: 700 }}
                                onClick={() => onDeleteDip(d.id)}
                                title="Delete inaccurate dip reading"
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
          )}
        </div>
        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit | F2=Save</span>
          <div className="win-actions-row">
            <button
              type="button"
              className="win-btn-classic"
              style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
              onClick={() => exportToCsv(
                `NSAIPETROSOFT_TankDips_${new Date().toISOString().split('T')[0]}`,
                ['Date', 'Tank Name', 'Open Dip (cm)', 'Open Stock (L)', 'Close Dip (cm)', 'Close Stock (L)', 'Dip Sales (L)', 'Meter Sales (L)', 'Variation (L)'],
                dipsList.length > 0
                  ? dipsList.map((d: any) => [
                      d.date,
                      d.tank_name || d.tank_id || `Tank ${d.tank_id || ''}`,
                      d.opening_dip,
                      d.opening_stock,
                      d.closing_dip,
                      d.closing_stock,
                      d.dip_sale ?? d.dip_wise_sale ?? 0,
                      d.meter_sale ?? d.meter_wise_sale ?? 0,
                      d.variation ?? d.variation_liters ?? 0,
                    ])
                  : [[new Date().toISOString().split('T')[0], dipTankId, dipOpenCm, dipOpenStock, dipCloseCm, dipCloseStock, (dipOpenStock + dipReceipt - dipCloseStock), (dipOpenStock + dipReceipt - dipCloseStock), 0]]
              )}
              title="Export underground tank dip audit to Microsoft Excel or CSV"
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
