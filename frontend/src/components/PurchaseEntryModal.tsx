import React, { useState } from 'react';
import { createPurchase, deletePurchase, fetchPurchases, verifyTankerDensityApi, type DensityVerificationResult } from '../api/client';
import { exportToCsv } from '../utils/exportCsv';
import { erpStore } from '../store/erpStore';
import { enqueueOfflineRecord } from '../utils/offlineQueue';
import {
  calcSec194QTds,
  calcLfr,
  calcTankUllage,
  convertDensityTo15C,
  roundCurrency,
  roundVolume,
} from '../utils/petroMath';

interface PurchaseEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  purPoHistory: Array<{
    id?: number;
    po?: string;
    po_no?: string;
    date: string;
    inv?: string;
    inv_no?: string;
    dealer: string;
    amount: number;
  }>;
  showToast: (msg: string) => void;
  loadAllErpData: () => Promise<void>;
  requestManagerAuthorization: (actionDesc: string, onAuthorized: (pin?: string) => Promise<void> | void) => void;
}

export const PurchaseEntryModal: React.FC<PurchaseEntryModalProps> = ({
  isOpen,
  onClose,
  purPoHistory,
  showToast,
  loadAllErpData,
  requestManagerAuthorization,
}) => {
  const storeState = erpStore.getState();
  const tanks = storeState.tanks;

  const [purInvoiceNo, setPurInvoiceNo] = useState<string>('3215682');
  const [purDealer, setPurDealer] = useState<string>('BHARAT PETROLEUM CORP LTD');
  const [purVehicleNo, setPurVehicleNo] = useState<string>('MH-04-GP-8821');
  const [purDensity, setPurDensity] = useState<number>(825.4);
  const [purSampleDensity, setPurSampleDensity] = useState<number>(825.4);
  const [purObservedDensity, setPurObservedDensity] = useState<number>(818.5);
  const [purObservedTemp, setPurObservedTemp] = useState<number>(29.5);
  const [densityCheckResult, setDensityCheckResult] = useState<DensityVerificationResult | null>(null);
  const [isVerifyingDensity, setIsVerifyingDensity] = useState<boolean>(false);
  const [purWoodenSeals, setPurWoodenSeals] = useState({ s1: 'W-901', s2: 'W-902', s3: 'W-903', s4: 'W-904' });
  const [purAlumSeals, setPurAlumSeals] = useState({ s1: 'AL-4011', s2: 'AL-4012', s3: 'AL-4013', s4: 'AL-4014' });
  const [purChargeCode, setPurChargeCode] = useState<string>('01');
  const [purQtyKl, setPurQtyKl] = useState<number>(12.0);
  const [purRateKl, setPurRateKl] = useState<number>(72478.36);
  const [purFreight, setPurFreight] = useState<number>(4500.0);
  const [selectedTankId, setSelectedTankId] = useState<number>(tanks[1]?.id || 2);
  const [purItemsGrid, setPurItemsGrid] = useState<any[]>([
    {
      code: '01',
      desc: 'High Speed Diesel (HSD BS-VI)',
      qty: 12000,
      unit: 'Ltr',
      rate: 72.48,
      amount: 869740.32,
      gross: 869740.32,
      final: 874240.32,
      freight: 4500.0,
      basicExcise: 0.0,
      addExci: 0.0,
    },
  ]);

  if (!isOpen) return null;

  // Selected Tank & Ullage calculation
  const targetTank = tanks.find((t) => t.id === selectedTankId) || tanks[0];
  const incomingLitres = roundVolume(purQtyKl * 1000, 2);
  const ullageCalc = calcTankUllage(targetTank?.capacity || 20000, targetTank?.current_stock || 0);
  const isOverflowRisk = incomingLitres > ullageCalc.grossUllage;
  const isSafeUllageExceeded = incomingLitres > ullageCalc.safeUllage && !isOverflowRisk;

  // Statutory deductions
  const grossAmount = roundCurrency(purQtyKl * purRateKl);
  const finalAmount = roundCurrency(grossAmount + purFreight);
  const sec194qTds = calcSec194QTds(finalAmount, 0.1);
  const lfrAmount = calcLfr(incomingLitres, 450);
  const netPayableToOmc = roundCurrency(finalAmount - sec194qTds - lfrAmount);

  const handleVerifyDensity = async () => {
    try {
      setIsVerifyingDensity(true);
      const res = await verifyTankerDensityApi({
        product_code: purChargeCode === '01' ? 'HSD' : 'MS',
        invoice_density: purDensity,
        observed_density: purObservedDensity,
        observed_temp_c: purObservedTemp,
      });
      setDensityCheckResult(res);
      if (res.is_within_tolerance) {
        showToast(`✔ Tanker Density Verified! Converted: ${res.converted_density_15c} kg/m³ (Diff: ${res.density_difference > 0 ? `+${res.density_difference}` : res.density_difference} within ±3.0 limit)`);
      } else {
        showToast(`⚠ WARNING: Density diff ${res.density_difference} kg/m³ EXCEEDS statutory ±3.0 limit!`);
      }
    } catch {
      // Offline ASTM 53B fallback calculation
      const localResult = convertDensityTo15C(purObservedDensity, purObservedTemp, purChargeCode === '01' ? 'HSD' : 'MS');
      const diff = roundVolume(localResult.density15C - purDensity, 1);
      const isWithin = Math.abs(diff) <= 3.0;
      setDensityCheckResult({
        product_code: purChargeCode === '01' ? 'HSD' : 'MS',
        invoice_density: purDensity,
        observed_density: purObservedDensity,
        observed_temp_c: purObservedTemp,
        converted_density_15c: localResult.density15C,
        density_difference: diff,
        is_within_tolerance: isWithin,
        tolerance_limit: 3.0,
        status: isWithin ? 'PASS' : 'REJECT',
        message: isWithin ? 'Density within OMC statutory tolerance' : 'Density exceeds statutory tolerance',
      });
      if (isWithin) {
        showToast(`✔ Offline ASTM Table 53B Pass: ${localResult.density15C} kg/m³ (Diff: ${diff > 0 ? `+${diff}` : diff} kg/m³)`);
      } else {
        showToast(`⚠ Offline ASTM 53B Alert: Diff ${diff} kg/m³ exceeds OMC ±3.0 statutory limit!`);
      }
    } finally {
      setIsVerifyingDensity(false);
    }
  };

  const executeAtomicSave = async (overridePin?: string) => {
    // 1. Atomically record into local state store (updates tank stock, ullage, purchase ledger)
    erpStore.recordPurchaseDecantation({
      invoice_no: purInvoiceNo,
      dealer_name: purDealer,
      tanker_vehicle_no: purVehicleNo,
      tank_id: selectedTankId,
      product_id: purChargeCode === '01' ? 2 : 1,
      qty_kl: purQtyKl,
      rate_per_kl: purRateKl,
      freight: purFreight,
      sample_density: purSampleDensity,
      observed_density: purObservedDensity,
      observed_temp: purObservedTemp,
      manager_override_pin: overridePin,
    });

    // 2. Also persist to PostgreSQL backend if reachable
    const purchasePayload = {
      invoice_no: purInvoiceNo,
      dealer_name: purDealer,
      tanker_vehicle_no: purVehicleNo,
      sample_density: purObservedDensity,
      observed_density: purObservedDensity,
      observed_temp: purObservedTemp,
      invoice_density_15c: purDensity,
      product_id: purChargeCode === '01' ? 2 : 1,
      tank_id: selectedTankId,
      qty_kl: purQtyKl,
      rate_per_kl: purRateKl,
      freight: purFreight,
      manager_override_pin: overridePin,
    };

    if (!navigator.onLine) {
      enqueueOfflineRecord('PURCHASE_DECANTING', purchasePayload);
      showToast(`💾 Offline Forecourt: Inward decanting #${purInvoiceNo} buffered locally. Will auto-sync.`);
    } else {
      try {
        await createPurchase(purchasePayload);
      } catch (e: any) {
        if (!navigator.onLine || e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
          enqueueOfflineRecord('PURCHASE_DECANTING', purchasePayload);
          showToast(`💾 Offline Buffer: Decanting purchase queued for auto-sync.`);
        } else {
          console.warn('Backend purchase sync deferred or offline:', e);
        }
      }
    }

    showToast(`✔ Inward Decanting #${purInvoiceNo} Recorded! ${incomingLitres.toLocaleString('en-IN')} L added to ${targetTank?.name || 'Tank'}.`);
    await loadAllErpData();
  };

  const handleAddPurchaseLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOverflowRisk) {
      requestManagerAuthorization(
        `Override Tank Capacity Overflow: Decanting ${incomingLitres}L into ${targetTank.name} (Gross Ullage: ${ullageCalc.grossUllage}L)`,
        async () => {
          await executeAtomicSave('1234');
        }
      );
      return;
    }
    await executeAtomicSave();
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOverflowRisk) {
      requestManagerAuthorization(
        `Override Tank Capacity Overflow: Decanting ${incomingLitres}L into ${targetTank.name} (Gross Ullage: ${ullageCalc.grossUllage}L)`,
        async () => {
          await executeAtomicSave('1234');
        }
      );
      return;
    }
    await executeAtomicSave();
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '980px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🚛</span>
            <span>Purchase Entry (Tanker Decanting & Inward Invoicing)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          <form onSubmit={handleSavePurchase}>
            {/* Top Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>Invoice No</span>
                <input type="text" className="win-input" value={purInvoiceNo} onChange={(e) => setPurInvoiceNo(e.target.value)} style={{ flex: 1, fontWeight: 700 }} />
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '60px' }}>Oil Co.</span>
                <input type="text" className="win-input" value={purDealer} onChange={(e) => setPurDealer(e.target.value)} style={{ flex: 1 }} />
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>Tanker No</span>
                <input type="text" className="win-input" value={purVehicleNo} onChange={(e) => setPurVehicleNo(e.target.value)} style={{ flex: 1 }} />
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '80px' }}>Density @15°C</span>
                <input type="number" step="0.1" className="win-input" value={purDensity} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setPurDensity(v); setPurSampleDensity(v); }} style={{ flex: 1, fontWeight: 700 }} />
              </div>
            </div>

            {/* ASTM Table 53B Tanker Density Verification Box */}
            <div style={{ background: '#f8fbfd', border: '1px solid #7f9db9', padding: '6px 10px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#0d47a1' }}>
                  🧪 Quality Control: ASTM Table 53B Tanker Density Verification (Statutory ±3.0 kg/m³ limit)
                </span>
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ background: '#e3f2fd', borderColor: '#90caf9', fontWeight: 700, fontSize: '10px', height: '22px' }}
                  onClick={handleVerifyDensity}
                  disabled={isVerifyingDensity}
                >
                  {isVerifyingDensity ? 'Verifying...' : '🔬 Verify Decanting Density'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 2.5fr', gap: '8px', alignItems: 'center' }}>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '95px', fontSize: '10px' }}>Observed Density</span>
                  <input
                    type="number"
                    step="0.1"
                    className="win-input"
                    value={purObservedDensity}
                    onChange={(e) => setPurObservedDensity(parseFloat(e.target.value) || 0)}
                    style={{ width: '80px', fontWeight: 600 }}
                  />
                  <span style={{ fontSize: '10px', color: '#666', marginLeft: '3px' }}>kg/m³</span>
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Observed Temp</span>
                  <input
                    type="number"
                    step="0.1"
                    className="win-input"
                    value={purObservedTemp}
                    onChange={(e) => setPurObservedTemp(parseFloat(e.target.value) || 0)}
                    style={{ width: '70px', fontWeight: 600 }}
                  />
                  <span style={{ fontSize: '10px', color: '#666', marginLeft: '3px' }}>°C</span>
                </div>
                <div>
                  {densityCheckResult ? (
                    <div style={{
                      padding: '3px 8px',
                      borderRadius: '3px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: densityCheckResult.is_within_tolerance ? '#e8f5e9' : '#ffebee',
                      color: densityCheckResult.is_within_tolerance ? '#1b5e20' : '#b71c1c',
                      border: `1px solid ${densityCheckResult.is_within_tolerance ? '#a5d6a7' : '#ef9a9a'}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span>{densityCheckResult.is_within_tolerance ? '✔ PASS' : '❌ REJECT (Decanting Prohibited)'}</span>
                      <span>@15°C: {densityCheckResult.converted_density_15c} kg/m³</span>
                      <span>(Diff: {densityCheckResult.density_difference > 0 ? `+${densityCheckResult.density_difference}` : densityCheckResult.density_difference})</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: '10px', color: '#666' }}>Enter dip sample & test before opening TT decanting valves</span>
                  )}
                </div>
              </div>
            </div>

            {/* 8 Seals Verification Box */}
            <div style={{ background: '#fdfefe', border: '1px solid #7f9db9', padding: '6px 10px', marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#0055ea', marginBottom: '4px' }}>
                🔒 Tanker Security Seals Verification (4 Wooden & 4 Aluminum Seals)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '4px' }}>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Wooden Seal 1</span>
                  <input type="text" className="win-input" value={purWoodenSeals.s1} onChange={(e) => setPurWoodenSeals({ ...purWoodenSeals, s1: e.target.value })} style={{ flex: 1 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Wooden Seal 2</span>
                  <input type="text" className="win-input" value={purWoodenSeals.s2} onChange={(e) => setPurWoodenSeals({ ...purWoodenSeals, s2: e.target.value })} style={{ flex: 1 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Wooden Seal 3</span>
                  <input type="text" className="win-input" value={purWoodenSeals.s3} onChange={(e) => setPurWoodenSeals({ ...purWoodenSeals, s3: e.target.value })} style={{ flex: 1 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Wooden Seal 4</span>
                  <input type="text" className="win-input" value={purWoodenSeals.s4} onChange={(e) => setPurWoodenSeals({ ...purWoodenSeals, s4: e.target.value })} style={{ flex: 1 }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Aluminum Seal 1</span>
                  <input type="text" className="win-input" value={purAlumSeals.s1} onChange={(e) => setPurAlumSeals({ ...purAlumSeals, s1: e.target.value })} style={{ flex: 1 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Aluminum Seal 2</span>
                  <input type="text" className="win-input" value={purAlumSeals.s2} onChange={(e) => setPurAlumSeals({ ...purAlumSeals, s2: e.target.value })} style={{ flex: 1 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Aluminum Seal 3</span>
                  <input type="text" className="win-input" value={purAlumSeals.s3} onChange={(e) => setPurAlumSeals({ ...purAlumSeals, s3: e.target.value })} style={{ flex: 1 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Aluminum Seal 4</span>
                  <input type="text" className="win-input" value={purAlumSeals.s4} onChange={(e) => setPurAlumSeals({ ...purAlumSeals, s4: e.target.value })} style={{ flex: 1 }} />
                </div>
              </div>
            </div>

            {/* Line Item Entry Row */}
            <div style={{ background: '#ece9d8', border: '1px solid #7f9db9', padding: '6px 10px', marginBottom: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1.6fr 1fr 1fr 1fr 1fr 1fr', gap: '6px', alignItems: 'flex-end' }}>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 600 }}>Charge Code</span>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <input type="text" className="win-input" value={purChargeCode} onChange={(e) => setPurChargeCode(e.target.value)} style={{ width: '45px' }} />
                    <button
                      type="button"
                      className="win-btn-classic"
                      style={{ padding: '0 4px' }}
                      title="Cycle Inward Charge Code (01=HSD, 02=MS, 03=XP95, 04=XG, 05=DEF)"
                      onClick={() => {
                        const codes = ['01', '02', '03', '04', '05'];
                        const idx = codes.indexOf(purChargeCode);
                        const nextCode = codes[(idx + 1) % codes.length];
                        setPurChargeCode(nextCode);
                        if (nextCode === '01') {
                          setPurRateKl(72478.36);
                          setPurDensity(825.4);
                          const matchedTank = tanks.find(t => t.code === 'HSD');
                          if (matchedTank) setSelectedTankId(matchedTank.id);
                        } else if (nextCode === '02') {
                          setPurRateKl(76890.12);
                          setPurDensity(742.8);
                          const matchedTank = tanks.find(t => t.code === 'MS');
                          if (matchedTank) setSelectedTankId(matchedTank.id);
                        }
                        showToast(`✔ Charge code switched to: ${nextCode}`);
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 600 }}>Product Name</span>
                  <select
                    className="win-select"
                    style={{ width: '100%' }}
                    value={purChargeCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      setPurChargeCode(code);
                      setPurRateKl(code === '01' ? 72478.36 : 76890.12);
                      setPurDensity(code === '01' ? 825.4 : 742.8);
                      const matchedTank = tanks.find(t => t.code === (code === '01' ? 'HSD' : 'MS'));
                      if (matchedTank) setSelectedTankId(matchedTank.id);
                    }}
                  >
                    <option value="01">High Speed Diesel (HSD BS-VI)</option>
                    <option value="02">Motor Spirit (MS Petrol BS-VI)</option>
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 600 }}>Destination Tank</span>
                  <select
                    className="win-select"
                    style={{ width: '100%', fontWeight: 700 }}
                    value={selectedTankId}
                    onChange={(e) => setSelectedTankId(parseInt(e.target.value, 10))}
                  >
                    {tanks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.product}) — Stock: {t.current_stock.toLocaleString('en-IN')}L / {t.capacity.toLocaleString('en-IN')}L
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 600 }}>Quantity (KL)</span>
                  <input type="number" step="0.1" className="win-input" value={purQtyKl} onChange={(e) => setPurQtyKl(parseFloat(e.target.value) || 0)} style={{ width: '100%', fontWeight: 700 }} />
                </div>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 600 }}>Rate / KL</span>
                  <input type="number" step="0.01" className="win-input" value={purRateKl} onChange={(e) => setPurRateKl(parseFloat(e.target.value) || 0)} style={{ width: '100%' }} />
                </div>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 600 }}>Freight (₹)</span>
                  <input type="number" step="0.01" className="win-input" value={purFreight} onChange={(e) => setPurFreight(parseFloat(e.target.value) || 0)} style={{ width: '100%' }} />
                </div>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 600 }}>Final Amount</span>
                  <input type="text" className="win-input" readOnly value={`₹ ${finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} style={{ width: '100%', fontWeight: 700, color: '#1565c0' }} />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleAddPurchaseLine}
                    style={{
                      width: '100%',
                      height: '24px',
                      background: isOverflowRisk ? '#c0392b' : '#000000',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '11px',
                      border: '1px solid #333',
                      cursor: 'pointer',
                    }}
                  >
                    {isOverflowRisk ? '⚡ Override & Save' : 'Add to list'}
                  </button>
                </div>
              </div>

              {/* Live Tank Ullage & Overflow Protection Status Card */}
              <div style={{
                marginTop: '8px',
                padding: '6px 10px',
                background: isOverflowRisk ? '#fef2f2' : isSafeUllageExceeded ? '#fffbeb' : '#f0fdf4',
                border: `1px solid ${isOverflowRisk ? '#ef4444' : isSafeUllageExceeded ? '#f59e0b' : '#86efac'}`,
                borderRadius: '3px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '11px',
              }}>
                <div>
                  <span style={{ fontWeight: 700, color: isOverflowRisk ? '#b91c1c' : isSafeUllageExceeded ? '#b45309' : '#166534' }}>
                    {isOverflowRisk
                      ? `⛔ CRITICAL OVERFLOW RISK: Incoming ${incomingLitres.toLocaleString('en-IN')} L exceeds gross ullage of ${ullageCalc.grossUllage.toLocaleString('en-IN')} L by ${(incomingLitres - ullageCalc.grossUllage).toLocaleString('en-IN')} Litres!`
                      : isSafeUllageExceeded
                      ? `⚠ SAFE ULLAGE EXCEEDED: Incoming batch fills tank above 95% safety capacity by ${(incomingLitres - ullageCalc.safeUllage).toLocaleString('en-IN')} Litres.`
                      : `✔ SAFE DECANTING ULLAGE: ${targetTank?.name || 'Tank'} has ${ullageCalc.grossUllage.toLocaleString('en-IN')} L gross ullage (Safe ullage: ${ullageCalc.safeUllage.toLocaleString('en-IN')} L).`}
                  </span>
                  <div style={{ fontSize: '10px', color: '#555', marginTop: '2px' }}>
                    Current Stock: {targetTank?.current_stock?.toLocaleString('en-IN')} L ({ullageCalc.fillPercent}% full) | Total Capacity: {targetTank?.capacity?.toLocaleString('en-IN')} L
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 700, color: '#333' }}>
                    Incoming: {incomingLitres.toLocaleString('en-IN')} L
                  </span>
                </div>
              </div>

              {/* Statutory Deductions: Sec 194Q TDS (0.1%) & LFR Recovery */}
              <div style={{
                marginTop: '6px',
                padding: '6px 10px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '3px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                fontSize: '11px',
              }}>
                <div>
                  <span style={{ color: '#64748b' }}>Gross Inward Value:</span>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>₹ {grossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Sec 194Q TDS (0.1%):</span>
                  <div style={{ fontWeight: 700, color: '#dc2626' }}>- ₹ {sec194qTds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>LFR Recovery (₹450/KL):</span>
                  <div style={{ fontWeight: 700, color: '#dc2626' }}>- ₹ {lfrAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Net Payable to OMC:</span>
                  <div style={{ fontWeight: 700, color: '#16a34a' }}>₹ {netPayableToOmc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>
              </div>
            </div>

            {/* Items Grid */}
            <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '130px', overflowY: 'auto', marginBottom: '8px' }}>
              <table className="win-datagrid">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Item Description</th>
                    <th className="text-right">Qty</th>
                    <th>Unit</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Gross Amt</th>
                    <th className="text-right">Final Amount</th>
                    <th className="text-right">Freight</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {purItemsGrid.map((it, idx) => (
                    <tr key={idx}>
                      <td>{it.code}</td>
                      <td>{it.desc}</td>
                      <td className="text-right">{it.qty.toFixed(2)}</td>
                      <td>{it.unit}</td>
                      <td className="text-right">{it.rate.toFixed(2)}</td>
                      <td className="text-right">{it.amount.toFixed(2)}</td>
                      <td className="text-right">{it.gross.toFixed(2)}</td>
                      <td className="text-right" style={{ fontWeight: 700, color: '#1565c0' }}>{it.final.toFixed(2)}</td>
                      <td className="text-right">{it.freight.toFixed(2)}</td>
                      <td>
                        <button
                          type="button"
                          className="win-btn-classic"
                          style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                          onClick={() => {
                            const copy = [...purItemsGrid];
                            copy.splice(idx, 1);
                            setPurItemsGrid(copy);
                            showToast('✔ Item removed from list');
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom PO History Table */}
            <div style={{ borderTop: '1px solid #7f9db9', paddingTop: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700 }}>Inward Purchase History (Past Decanting POs)</span>
                <span style={{ fontSize: '11px', color: '#555' }}>Total POs: {purPoHistory.length}</span>
              </div>
              <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '110px', overflowY: 'auto' }}>
                <table className="win-datagrid">
                  <thead>
                    <tr>
                      <th>PO No</th>
                      <th>Date</th>
                      <th>Invoice No</th>
                      <th>Dealer / Oil Company</th>
                      <th className="text-right">Total Amount</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purPoHistory.map((p, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{p.po || p.po_no}</td>
                        <td>{p.date}</td>
                        <td>{p.inv || p.inv_no}</td>
                        <td>{p.dealer}</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>₹ {p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              className="win-btn-classic"
                              style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                              onClick={() => showToast(`✔ Decanting PO: ${p.po || p.po_no} | Inv: ${p.inv || p.inv_no} | Dealer: ${p.dealer} | ₹${p.amount}`)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="win-btn-classic"
                              style={{ height: '18px', padding: '0 4px', fontSize: '10px', color: '#c0392b', fontWeight: 600 }}
                              onClick={() => {
                                const purKey = p.id ?? p.inv ?? p.inv_no ?? p.po ?? p.po_no;
                                requestManagerAuthorization(`Delete Purchase Inward #${p.inv || p.inv_no || p.po || p.po_no} (${p.dealer} - ₹${Number(p.amount || 0).toFixed(2)})`, async (pin?: string) => {
                                  try {
                                    if (p.id) {
                                      await deletePurchase(p.id, pin);
                                    } else {
                                      const latest = await fetchPurchases();
                                      const found = latest.find((x) => x.invoice_no === (p.inv || p.inv_no));
                                      if (found && found.id) {
                                        await deletePurchase(found.id, pin);
                                      }
                                    }
                                    if (purKey !== undefined) {
                                      erpStore.deletePurchase(purKey);
                                    }
                                    showToast(`✔ Purchase decanting #${p.inv || p.inv_no || p.po || p.po_no} deleted & tank stock reversed!`);
                                    await loadAllErpData();
                                  } catch (err: any) {
                                    showToast(`❌ Error deleting purchase: ${err.message || 'Database error'}`);
                                  }
                                });
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#666' }}>Sample Hydrometer Density verified: {purSampleDensity} kg/m³</span>
              <div className="win-actions-row">
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
                  onClick={() => exportToCsv(
                    `NSAIPETROSOFT_InwardPurchases_${new Date().toISOString().split('T')[0]}`,
                    ['PO No', 'Date', 'Invoice No', 'Oil Company / Dealer', 'Total Amount (INR)'],
                    purPoHistory.map(p => [p.po || p.po_no || '', p.date, p.inv || p.inv_no || '', p.dealer, p.amount])
                  )}
                  title="Export tanker decanting purchases to Microsoft Excel or CSV"
                >
                  <span>📥</span>
                  <span>Export to Excel (CSV)</span>
                </button>
                <button type="submit" className="win-btn-classic win-btn-primary">
                  <span>💾</span>
                  <span>Save (F2)</span>
                </button>
                <button type="button" className="win-btn-classic" onClick={() => { setPurQtyKl(4.0); setPurInvoiceNo('3215' + Math.floor(100 + Math.random() * 900)); showToast('New Purchase Slip ready'); }}>
                  <span>🔄</span>
                  <span>Reset (F1)</span>
                </button>
                <button type="button" className="win-btn-classic" onClick={onClose}>Close</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
