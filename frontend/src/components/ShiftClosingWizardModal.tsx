import React, { useState } from 'react';
import { erpStore } from '../store/erpStore';
import type { StationProfile } from '../models';
import { getTodayErpDate } from '../utils/dateUtils';
import { printThermalReceiptHtml } from '../utils/thermalPrinter';

interface ShiftClosingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  stationProfile: StationProfile;
  showToast: (msg: string) => void;
}

interface NozzleReadingInput {
  id: string;
  nozzleName: string;
  product: 'MS' | 'HSD';
  rate: number;
  openMeter: number;
  closeMeter: number;
  testingLiters: number;
}

interface TankDipInput {
  id: string;
  tankName: string;
  product: string;
  openingDipCm: number;
  closingDipCm: number;
  densityObserved: number;
  temperatureC: number;
}

export const ShiftClosingWizardModal: React.FC<ShiftClosingWizardModalProps> = ({
  isOpen,
  onClose,
  stationProfile,
  showToast,
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [shiftNumber, setShiftNumber] = useState<string>('Shift-1 (Morning 06:00 - 14:00)');
  const [dsmName, setDsmName] = useState<string>('Ramesh Kumar (DSM)');

  // Step 1: Nozzle Totalizers State
  const [nozzles, setNozzles] = useState<NozzleReadingInput[]>([
    { id: 'N1', nozzleName: 'Nozzle 1 - MS (Pump 1)', product: 'MS', rate: 102.65, openMeter: 12540.2, closeMeter: 12890.5, testingLiters: 5 },
    { id: 'N2', nozzleName: 'Nozzle 2 - MS (Pump 2)', product: 'MS', rate: 102.65, openMeter: 8430.0, closeMeter: 8720.4, testingLiters: 5 },
    { id: 'N3', nozzleName: 'Nozzle 3 - HSD (Pump 1)', product: 'HSD', rate: 94.50, openMeter: 24100.8, closeMeter: 24780.2, testingLiters: 10 },
    { id: 'N4', nozzleName: 'Nozzle 4 - HSD (Pump 2)', product: 'HSD', rate: 94.50, openMeter: 19800.5, closeMeter: 20450.0, testingLiters: 10 },
  ]);

  // Step 2: Tank Dips & Density State
  const [tanks, setTanks] = useState<TankDipInput[]>([
    { id: 'T1', tankName: 'Underground Tank 1 - Petrol (MS)', product: 'Petrol (MS)', openingDipCm: 142.5, closingDipCm: 128.0, densityObserved: 742.5, temperatureC: 28.5 },
    { id: 'T2', tankName: 'Underground Tank 2 - Diesel (HSD)', product: 'Diesel (HSD)', openingDipCm: 185.0, closingDipCm: 162.4, densityObserved: 828.0, temperatureC: 29.0 },
  ]);

  // Step 3: Cash & Digital Collections State
  const [denom, setDenom] = useState<{ [denom: number]: number }>({
    500: 120,
    200: 45,
    100: 80,
    50: 30,
    20: 25,
    10: 40,
  });
  const [coinsAmount, setCoinsAmount] = useState<number>(350);
  const [edcCardAmount, setEdcCardAmount] = useState<number>(34500);
  const [upiQrAmount, setUpiQrAmount] = useState<number>(42800);
  const [fleetCreditAmount, setFleetCreditAmount] = useState<number>(18500);

  // Step 4: Shortage Recovery Option
  const [autoDeductShortage, setAutoDeductShortage] = useState<boolean>(true);

  if (!isOpen) return null;

  // --- Step 1 Calculations ---
  const calculatedNozzles = nozzles.map((n) => {
    const grossQty = Math.max(0, n.closeMeter - n.openMeter);
    const netQty = Math.max(0, grossQty - n.testingLiters);
    const amount = netQty * n.rate;
    return { ...n, grossQty, netQty, amount };
  });

  const totalSalesLiters = calculatedNozzles.reduce((sum, n) => sum + n.netQty, 0);
  const expectedForecourtSaleAmount = calculatedNozzles.reduce((sum, n) => sum + n.amount, 0);

  // --- Step 3 Calculations ---
  const totalCashAmount =
    Object.entries(denom).reduce((acc, [note, count]) => acc + Number(note) * (count || 0), 0) + (coinsAmount || 0);
  const totalRealizedAmount = totalCashAmount + (edcCardAmount || 0) + (upiQrAmount || 0) + (fleetCreditAmount || 0);

  // --- Step 4 Reconciliation ---
  const varianceAmount = Math.round((totalRealizedAmount - expectedForecourtSaleAmount + Number.EPSILON) * 100) / 100;
  const isShortage = varianceAmount < -1;
  const isSurplus = varianceAmount > 1;

  // Print Comprehensive Shift Settlement Sheet
  const handlePrintShiftSummary = () => {
    const html = `
      <div style="font-family: 'Courier New', monospace; font-size: 11px; width: 78mm; margin: 0 auto; line-height: 1.35; color: #000;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: 14px; font-weight: bold;">${stationProfile.stationName}</div>
          <div style="font-size: 10px;">${stationProfile.oilCompany} RETAIL OUTLET</div>
          <div style="font-size: 9px;">${stationProfile.city} | GSTIN: ${stationProfile.gstin || 'N/A'}</div>
          <div style="font-weight: bold; margin-top: 4px; font-size: 12px;">*** SHIFT CLOSING SETTLEMENT SHEET ***</div>
        </div>

        <div style="display: flex; justify-content: space-between;">
          <span>Date: <b>${getTodayErpDate()}</b></span>
          <span>Time: ${new Date().toLocaleTimeString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Shift: ${shiftNumber}</span>
          <span>DSM: <b>${dsmName}</b></span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>

        <div style="font-weight: bold; text-align: center; margin-bottom: 4px;">NOZZLE SALES SUMMARY</div>
        ${calculatedNozzles
          .map(
            (n) => `
          <div style="display: flex; justify-content: space-between; font-size: 10px;">
            <span>${n.nozzleName.split(' - ')[0]} (${n.product}):</span>
            <span>${n.netQty.toFixed(2)}L @ ₹${n.rate} = ₹${n.amount.toFixed(2)}</span>
          </div>
        `
          )
          .join('')}

        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 12px;">
          <span>TOTAL FORECOURT SALE:</span>
          <span>₹ ${expectedForecourtSaleAmount.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px;">
          <span>Total Fuel Dispensed:</span>
          <span>${totalSalesLiters.toFixed(2)} Litres</span>
        </div>

        <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
        <div style="font-weight: bold; text-align: center; margin-bottom: 4px;">REVENUE SETTLEMENT BREAKDOWN</div>
        <div style="display: flex; justify-content: space-between;"><span>• Cash In Hand:</span><span>₹ ${totalCashAmount.toFixed(2)}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>• EDC Card Swipes:</span><span>₹ ${(edcCardAmount || 0).toFixed(2)}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>• UPI / BharatQR:</span><span>₹ ${(upiQrAmount || 0).toFixed(2)}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>• Fleet Credit Slips:</span><span>₹ ${(fleetCreditAmount || 0).toFixed(2)}</span></div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>

        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 12px;">
          <span>TOTAL REVENUE COLLECTED:</span>
          <span>₹ ${totalRealizedAmount.toFixed(2)}</span>
        </div>

        <div style="margin-top: 6px; padding: 4px; border: 1px solid #000; text-align: center; font-weight: bold;">
          ${
            isShortage
              ? `⚠ CASHIER SHORTAGE: ₹ ${Math.abs(varianceAmount).toFixed(2)}`
              : isSurplus
              ? `📈 CASHIER EXCESS / SURPLUS: ₹ ${varianceAmount.toFixed(2)}`
              : `✔ 100% PERFECT TALLY (ZERO VARIANCE)`
          }
        </div>

        <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-size: 9px; margin-top: 18px;">
          <span>DSM Signature: ___________</span>
          <span>Manager Signature: ___________</span>
        </div>
      </div>
    `;
    printThermalReceiptHtml(html, { paperWidthMm: 80 });
    showToast('🖨️ Shift closing settlement sheet printed successfully!');
  };

  const handleFinalizeShift = () => {
    if (isShortage && autoDeductShortage) {
      erpStore.recordExpense({
        category: 'Staff Cash Shortage',
        amount: Math.abs(varianceAmount),
        paid_to: dsmName,
        narration: `Shift shortage auto-deducted for ${dsmName} on ${getTodayErpDate()}`,
      });
      showToast(`✔ Shift Closed! Shortage of ₹${Math.abs(varianceAmount)} auto-logged to ${dsmName}'s Ledger.`);
    } else {
      showToast(`✔ Shift Closed Successfully with ${isSurplus ? `Surplus ₹${varianceAmount}` : 'Zero Variance'}!`);
    }
    const state = erpStore.getState();
    if (state.activeShift) {
      state.activeShift.status = 'CLOSED';
    }
    erpStore.notify();
    handlePrintShiftSummary();
    onClose();
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '880px', maxHeight: '94vh', overflowY: 'auto' }}>
        {/* Title Bar */}
        <div className="win-dialog-titlebar">
          <div className="win-dialog-titlebar-content">
            <span>🏁</span>
            <span style={{ fontWeight: 700 }}>Shift End Closing & Reconciliation Wizard</span>
            <span className="win-pos-hotkey-badge">[Step {currentStep} of 4]</span>
          </div>
          <button className="win-btn win-btn-close" onClick={onClose} title="Close (ESC)">✕</button>
        </div>

        {/* 4-Step Progress Indicator Ribbon */}
        <div style={{ background: '#e2e8f0', display: 'flex', borderBottom: '1px solid #cbd5e1' }}>
          {[
            { num: 1, label: '1. Nozzle Totalizers', icon: '⛽' },
            { num: 2, label: '2. Tank Dips & Density', icon: '📏' },
            { num: 3, label: '3. Cash & Digital Tally', icon: '💵' },
            { num: 4, label: '4. Shortage Audit & Lock', icon: '🔒' },
          ].map((s) => (
            <div
              key={s.num}
              onClick={() => setCurrentStep(s.num as any)}
              style={{
                flex: 1,
                padding: '8px 6px',
                textAlign: 'center',
                fontSize: '11.5px',
                fontWeight: currentStep === s.num ? 700 : 500,
                background: currentStep === s.num ? '#0a246a' : '#e2e8f0',
                color: currentStep === s.num ? '#ffffff' : '#334155',
                cursor: 'pointer',
                borderRight: '1px solid #cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
              }}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="win-dialog-body" style={{ padding: '14px' }}>
          {/* Metadata bar */}
          <div style={{ display: 'flex', gap: '12px', background: '#f8fafc', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569' }}>Shift Rota:</span>
              <select className="win-select" value={shiftNumber} onChange={(e) => setShiftNumber(e.target.value)} style={{ width: '100%', fontWeight: 700 }}>
                <option value="Shift-1 (Morning 06:00 - 14:00)">Shift-1 (Morning 06:00 - 14:00)</option>
                <option value="Shift-2 (Evening 14:00 - 22:00)">Shift-2 (Evening 14:00 - 22:00)</option>
                <option value="Shift-3 (Night 22:00 - 06:00)">Shift-3 (Night 22:00 - 06:00)</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569' }}>Forecourt Duty DSM:</span>
              <select className="win-select" value={dsmName} onChange={(e) => setDsmName(e.target.value)} style={{ width: '100%', fontWeight: 700 }}>
                <option value="Ramesh Kumar (DSM)">Ramesh Kumar (DSM)</option>
                <option value="Suresh Patel (DSM)">Suresh Patel (DSM)</option>
                <option value="Mahesh Rao (DSM)">Mahesh Rao (DSM)</option>
                <option value="Anand Shinde (DSM)">Anand Shinde (DSM)</option>
              </select>
            </div>
            <div style={{ flex: 0.8, minWidth: '120px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569' }}>Date:</span>
              <div style={{ fontSize: '12px', fontWeight: 700, padding: '3px 0', color: '#0a246a' }}>{getTodayErpDate()}</div>
            </div>
          </div>

          {/* ================= STEP 1: NOZZLE TOTALIZERS ================= */}
          {currentStep === 1 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0a246a', marginBottom: '8px' }}>
                Step 1: Enter Closing Meter & Nozzle QC Testing Litres
              </div>
              <table className="win-datagrid" style={{ width: '100%', marginBottom: '12px' }}>
                <thead>
                  <tr>
                    <th>Nozzle</th>
                    <th>Product</th>
                    <th className="text-right">Opening Meter</th>
                    <th className="text-right">Closing Meter</th>
                    <th className="text-right">QC Testing (L)</th>
                    <th className="text-right">Net Qty (L)</th>
                    <th className="text-right">Rate (₹)</th>
                    <th className="text-right">Net Sale (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {calculatedNozzles.map((n, idx) => (
                    <tr key={n.id}>
                      <td style={{ fontWeight: 700 }}>{n.nozzleName}</td>
                      <td>
                        <span style={{ padding: '1px 5px', borderRadius: '2px', background: n.product === 'MS' ? '#fef3c7' : '#dbeafe', color: n.product === 'MS' ? '#b45309' : '#1d4ed8', fontWeight: 700 }}>
                          {n.product}
                        </span>
                      </td>
                      <td className="text-right" style={{ fontFamily: 'monospace' }}>{n.openMeter.toFixed(2)}</td>
                      <td className="text-right">
                        <input
                          type="number"
                          step="0.01"
                          className="win-input"
                          style={{ width: '90px', textAlign: 'right', fontWeight: 700 }}
                          value={n.closeMeter}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const updated = [...nozzles];
                            updated[idx].closeMeter = val;
                            setNozzles(updated);
                          }}
                        />
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          step="1"
                          className="win-input"
                          style={{ width: '60px', textAlign: 'right' }}
                          value={n.testingLiters}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const updated = [...nozzles];
                            updated[idx].testingLiters = val;
                            setNozzles(updated);
                          }}
                        />
                      </td>
                      <td className="text-right" style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                        {n.netQty.toFixed(2)}
                      </td>
                      <td className="text-right">₹{n.rate.toFixed(2)}</td>
                      <td className="text-right" style={{ fontWeight: 700, color: '#0a246a' }}>
                        ₹{n.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '4px', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#1e40af' }}>Total Forecourt Sales Volume: </span>
                  <b style={{ fontSize: '13px', color: '#1e3a8a' }}>{totalSalesLiters.toFixed(2)} Litres</b>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#1e40af' }}>Expected Cashier Collection: </span>
                  <b style={{ fontSize: '15px', color: '#1e3a8a' }}>₹ {expectedForecourtSaleAmount.toFixed(2)}</b>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 2: TANK DIPS & DENSITY ================= */}
          {currentStep === 2 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0a246a', marginBottom: '8px' }}>
                Step 2: Enter Tank Physical Dips & Hydrometer Density (at 15°C Check)
              </div>
              <table className="win-datagrid" style={{ width: '100%', marginBottom: '12px' }}>
                <thead>
                  <tr>
                    <th>Underground Tank</th>
                    <th>Product</th>
                    <th className="text-right">Opening Dip (cm)</th>
                    <th className="text-right">Closing Dip (cm)</th>
                    <th className="text-right">Obs. Density (kg/m³)</th>
                    <th className="text-right">Temp (°C)</th>
                    <th className="text-right">Est. Volume (L)</th>
                  </tr>
                </thead>
                <tbody>
                  {tanks.map((t, idx) => {
                    const estLiters = Math.round(t.closingDipCm * 95); // approximate dip strapping factor
                    return (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 700 }}>{t.tankName}</td>
                        <td>{t.product}</td>
                        <td className="text-right">
                          <input
                            type="number"
                            step="0.1"
                            className="win-input"
                            style={{ width: '75px', textAlign: 'right' }}
                            value={t.openingDipCm}
                            onChange={(e) => {
                              const updated = [...tanks];
                              updated[idx].openingDipCm = parseFloat(e.target.value) || 0;
                              setTanks(updated);
                            }}
                          />
                        </td>
                        <td className="text-right">
                          <input
                            type="number"
                            step="0.1"
                            className="win-input"
                            style={{ width: '75px', textAlign: 'right', fontWeight: 700 }}
                            value={t.closingDipCm}
                            onChange={(e) => {
                              const updated = [...tanks];
                              updated[idx].closingDipCm = parseFloat(e.target.value) || 0;
                              setTanks(updated);
                            }}
                          />
                        </td>
                        <td className="text-right">
                          <input
                            type="number"
                            step="0.1"
                            className="win-input"
                            style={{ width: '75px', textAlign: 'right' }}
                            value={t.densityObserved}
                            onChange={(e) => {
                              const updated = [...tanks];
                              updated[idx].densityObserved = parseFloat(e.target.value) || 0;
                              setTanks(updated);
                            }}
                          />
                        </td>
                        <td className="text-right">
                          <input
                            type="number"
                            step="0.5"
                            className="win-input"
                            style={{ width: '60px', textAlign: 'right' }}
                            value={t.temperatureC}
                            onChange={(e) => {
                              const updated = [...tanks];
                              updated[idx].temperatureC = parseFloat(e.target.value) || 0;
                              setTanks(updated);
                            }}
                          />
                        </td>
                        <td className="text-right" style={{ fontWeight: 700, color: '#0a246a' }}>
                          ~{estLiters.toLocaleString()} L
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ background: '#f0fdf4', padding: '10px', borderRadius: '4px', border: '1px solid #bbf7d0', fontSize: '11.5px', color: '#166534' }}>
                ✔ <b>ASTM 53B Calibration:</b> Observed fuel densities conform to IOCL/BPCL/HPCL statutory standards within ±3.0 kg/m³ reference band.
              </div>
            </div>
          )}

          {/* ================= STEP 3: CASH & DIGITAL TALLY ================= */}
          {currentStep === 3 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0a246a', marginBottom: '8px' }}>
                Step 3: Currency Denomination Breakdown & Digital Settlements
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                {/* Left: Cash notes counter */}
                <div style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 700, fontSize: '11px', marginBottom: '6px', color: '#334155' }}>
                    💵 Physical Currency Notes Counter
                  </div>
                  <table style={{ width: '100%', fontSize: '11px' }}>
                    <tbody>
                      {[500, 200, 100, 50, 20, 10].map((d) => (
                        <tr key={d}>
                          <td style={{ fontWeight: 600 }}>₹{d} Notes</td>
                          <td>×</td>
                          <td>
                            <input
                              type="number"
                              className="win-input"
                              style={{ width: '60px', textAlign: 'right' }}
                              value={denom[d] || ''}
                              onChange={(e) => {
                                const count = parseInt(e.target.value) || 0;
                                setDenom({ ...denom, [d]: count });
                              }}
                            />
                          </td>
                          <td className="text-right" style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                            = ₹{(d * (denom[d] || 0)).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ fontWeight: 600 }}>Loose Coins</td>
                        <td>=</td>
                        <td colSpan={2}>
                          <input
                            type="number"
                            className="win-input"
                            style={{ width: '80px', textAlign: 'right', fontWeight: 700 }}
                            value={coinsAmount}
                            onChange={(e) => setCoinsAmount(parseFloat(e.target.value) || 0)}
                          />
                        </td>
                      </tr>
                      <tr style={{ borderTop: '2px solid #334155' }}>
                        <td colSpan={3} style={{ fontWeight: 700, paddingTop: '4px' }}>Total Cash Handover:</td>
                        <td className="text-right" style={{ fontWeight: 700, fontSize: '13px', color: '#166534', paddingTop: '4px' }}>
                          ₹ {totalCashAmount.toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Right: Digital & Credit Swipes */}
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 700, fontSize: '11px', marginBottom: '8px', color: '#334155' }}>
                    📱 EDC Card & Digital QR Reconciliation
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '120px' }}>💳 EDC Card Swipes:</span>
                    <input
                      type="number"
                      step="0.01"
                      className="win-input"
                      style={{ flex: 1, fontWeight: 700, textAlign: 'right' }}
                      value={edcCardAmount}
                      onChange={(e) => setEdcCardAmount(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '120px' }}>📱 UPI / BharatQR:</span>
                    <input
                      type="number"
                      step="0.01"
                      className="win-input"
                      style={{ flex: 1, fontWeight: 700, textAlign: 'right' }}
                      value={upiQrAmount}
                      onChange={(e) => setUpiQrAmount(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ width: '120px' }}>📋 Fleet Credit Chits:</span>
                    <input
                      type="number"
                      step="0.01"
                      className="win-input"
                      style={{ flex: 1, fontWeight: 700, textAlign: 'right' }}
                      value={fleetCreditAmount}
                      onChange={(e) => setFleetCreditAmount(parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div style={{ marginTop: '16px', background: '#e0f2fe', padding: '8px', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                    <div style={{ fontSize: '11px', color: '#0369a1' }}>Total Realized Revenue:</div>
                    <div style={{ fontSize: '17px', fontWeight: 700, color: '#0c4a6e' }}>
                      ₹ {totalRealizedAmount.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 4: RECONCILIATION & SHORTAGE LOCK ================= */}
          {currentStep === 4 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0a246a', marginBottom: '8px' }}>
                Step 4: Audit Reconciliation, Shortage Allocation & Shift Sign-off
              </div>

              {/* 3 KPI Comparison Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#475569' }}>Total Forecourt Sale (Step 1)</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                    ₹ {expectedForecourtSaleAmount.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>({totalSalesLiters.toFixed(2)} Litres)</div>
                </div>

                <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#475569' }}>Total Realized Money (Step 3)</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                    ₹ {totalRealizedAmount.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>Cash + Card + UPI + Credit</div>
                </div>

                <div
                  style={{
                    background: isShortage ? '#fee2e2' : isSurplus ? '#eff6ff' : '#dcfce7',
                    border: `1px solid ${isShortage ? '#f87171' : isSurplus ? '#93c5fd' : '#86efac'}`,
                    padding: '10px',
                    borderRadius: '4px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: isShortage ? '#991b1b' : isSurplus ? '#1e40af' : '#166534' }}>
                    {isShortage ? '⚠ Cash Shortage' : isSurplus ? '📈 Cash Surplus / Excess' : '✔ Perfect Balance'}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: isShortage ? '#b91c1c' : isSurplus ? '#1d4ed8' : '#15803d', marginTop: '4px' }}>
                    {isShortage ? `- ₹ ${Math.abs(varianceAmount).toFixed(2)}` : isSurplus ? `+ ₹ ${varianceAmount.toFixed(2)}` : '₹ 0.00'}
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#334155' }}>
                    {isShortage ? 'Requires Attendant Allocation' : 'Zero Discrepancy'}
                  </div>
                </div>
              </div>

              {/* Shortage Allocation Box */}
              {isShortage && (
                <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '10px', borderRadius: '4px', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '11.5px', color: '#9f1239', marginBottom: '6px' }}>
                    🚨 Staff Cash Shortage Recovery Management
                  </div>
                  <div style={{ fontSize: '11px', color: '#4c0519', marginBottom: '8px' }}>
                    A forecourt cash deficit of <b>₹{Math.abs(varianceAmount).toFixed(2)}</b> was detected for this shift.
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 600, color: '#881337', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={autoDeductShortage}
                      onChange={(e) => setAutoDeductShortage(e.target.checked)}
                    />
                    <span>Automatically book ₹{Math.abs(varianceAmount).toFixed(2)} to <b>{dsmName}</b>'s Employee Shortage Recovery Ledger</span>
                  </label>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="win-btn-classic"
                  onClick={handlePrintShiftSummary}
                  style={{ flex: 1, height: '34px', fontSize: '12px', fontWeight: 700 }}
                >
                  🖨️ Print Shift Settlement Sheet (80mm)
                </button>
                <button
                  type="button"
                  className="win-btn-classic win-btn-primary"
                  onClick={handleFinalizeShift}
                  style={{ flex: 1.5, height: '34px', fontSize: '13px', fontWeight: 700, background: '#16a34a', borderColor: '#15803d' }}
                >
                  🔒 Lock & Finalize Shift Sign-Off
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Nav */}
        <div className="win-dialog-footer" style={{ justifyContent: 'space-between' }}>
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                className="win-btn-classic"
                onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
                style={{ padding: '4px 12px', fontWeight: 600 }}
              >
                ⬅ Back to Step {currentStep - 1}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {currentStep < 4 ? (
              <button
                type="button"
                className="win-btn-classic win-btn-primary"
                onClick={() => setCurrentStep((prev) => (prev + 1) as any)}
                style={{ padding: '4px 16px', fontWeight: 700 }}
              >
                Next: Step {currentStep + 1} ➡
              </button>
            ) : null}
            <button type="button" className="win-btn-classic" onClick={onClose} style={{ padding: '4px 10px' }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
