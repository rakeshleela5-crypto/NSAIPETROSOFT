import React, { useState } from 'react';
import { createPurchase, deletePurchase, fetchPurchases, verifyTankerDensityApi, type DensityVerificationResult } from '../api/client';
import { exportToCsv } from '../utils/exportCsv';

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
  requestManagerAuthorization: (actionDesc: string, onAuthorized: () => Promise<void> | void) => void;
}

export const PurchaseEntryModal: React.FC<PurchaseEntryModalProps> = ({
  isOpen,
  onClose,
  purPoHistory,
  showToast,
  loadAllErpData,
  requestManagerAuthorization,
}) => {
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
    } catch (err: any) {
      showToast(`Density verification failed: ${err.message}`);
    } finally {
      setIsVerifyingDensity(false);
    }
  };

  const handleAddPurchaseLine = async (e: React.FormEvent) => {
    e.preventDefault();
    const gross = purQtyKl * 1000 * (purRateKl / 1000);
    const final = gross + purFreight;
    const item = {
      code: purChargeCode,
      desc: purChargeCode === '01' ? 'High Speed Diesel (HSD BS-VI)' : 'Motor Spirit (MS Petrol BS-VI)',
      qty: purQtyKl * 1000,
      unit: 'Ltr',
      rate: purRateKl / 1000,
      amount: gross,
      gross: gross,
      final: final,
      freight: purFreight,
      basicExcise: 0.0,
      addExci: 0.0,
    };
    setPurItemsGrid([...purItemsGrid, item]);
    try {
      await createPurchase({
        invoice_no: purInvoiceNo,
        dealer_name: purDealer,
        tanker_vehicle_no: purVehicleNo,
        wooden_seals: `${purWoodenSeals.s1}, ${purWoodenSeals.s2}, ${purWoodenSeals.s3}, ${purWoodenSeals.s4}`,
        aluminum_seals: `${purAlumSeals.s1}, ${purAlumSeals.s2}, ${purAlumSeals.s3}, ${purAlumSeals.s4}`,
        sample_density: purSampleDensity,
        product_id: purChargeCode === '01' ? 1 : 2,
        tank_id: purChargeCode === '01' ? 2 : 1,
        qty_kl: purQtyKl,
        rate_per_kl: purRateKl,
        freight: purFreight,
      });
      showToast(`✔ Decanting recorded in PostgreSQL! Added ${item.qty} Ltr to Tank Stock.`);
      await loadAllErpData();
    } catch (err: any) {
      showToast(err.message || 'Error saving purchase');
    }
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createPurchase({
        invoice_no: purInvoiceNo,
        dealer_name: purDealer,
        tanker_vehicle_no: purVehicleNo,
        sample_density: purObservedDensity,
        observed_density: purObservedDensity,
        observed_temp: purObservedTemp,
        invoice_density_15c: purDensity,
        product_id: purChargeCode === '02' ? 2 : 1,
        qty_kl: purQtyKl,
        rate_per_kl: purRateKl,
      });
      showToast(`✔ Tanker Inward Decanting #${res.invoice_no} Saved! 15°C Density: ${res.density_15c || purDensity} kg/m³`);
      await loadAllErpData();
    } catch (err: any) {
      if (err.message && (err.message.includes('STATUTORY DECANTING REJECTION') || err.message.includes('exceeds OMC'))) {
        requestManagerAuthorization('Override Statutory Density Tolerance Variance (±3.0 kg/m³)', async () => {
          try {
            const res = await createPurchase({
              invoice_no: purInvoiceNo,
              dealer_name: purDealer,
              tanker_vehicle_no: purVehicleNo,
              sample_density: purObservedDensity,
              observed_density: purObservedDensity,
              observed_temp: purObservedTemp,
              invoice_density_15c: purDensity,
              product_id: purChargeCode === '02' ? 2 : 1,
              qty_kl: purQtyKl,
              rate_per_kl: purRateKl,
              manager_override_pin: '1234',
            });
            showToast(`✔ Decanting Authorized via Manager Override! (#${res.invoice_no})`);
            await loadAllErpData();
          } catch (retryErr: any) {
            showToast(retryErr.message || 'Error saving purchase');
          }
        });
      } else {
        showToast(err.message || 'Error saving purchase');
      }
    }
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
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1fr 1fr 1fr 1fr 1fr', gap: '6px', alignItems: 'flex-end' }}>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 600 }}>Charge Code</span>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <input type="text" className="win-input" value={purChargeCode} onChange={(e) => setPurChargeCode(e.target.value)} style={{ width: '45px' }} />
                    <button type="button" className="win-btn-classic" style={{ padding: '0 4px' }} title="Add New Charge Code">+</button>
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 600 }}>Product Name</span>
                  <select
                    className="win-select"
                    style={{ width: '100%' }}
                    value={purChargeCode}
                    onChange={(e) => {
                      setPurChargeCode(e.target.value);
                      setPurRateKl(e.target.value === '01' ? 72478.36 : 76890.12);
                      setPurDensity(e.target.value === '01' ? 825.4 : 742.8);
                    }}
                  >
                    <option value="01">High Speed Diesel (HSD BS-VI)</option>
                    <option value="02">Motor Spirit (MS Petrol BS-VI)</option>
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
                  <input type="text" className="win-input" readOnly value={`₹ ${(purQtyKl * purRateKl + purFreight).toFixed(2)}`} style={{ width: '100%', fontWeight: 700, color: '#1565c0' }} />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleAddPurchaseLine}
                    style={{
                      width: '100%',
                      height: '24px',
                      background: '#000000',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '11px',
                      border: '1px solid #333',
                      cursor: 'pointer',
                    }}
                  >
                    Add to list
                  </button>
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
                                requestManagerAuthorization(`Delete Purchase Inward #${p.inv || p.inv_no || p.po || p.po_no} (${p.dealer} - ₹${Number(p.amount || 0).toFixed(2)})`, async () => {
                                  try {
                                    if (p.id) {
                                      await deletePurchase(p.id);
                                    } else {
                                      const latest = await fetchPurchases();
                                      const found = latest.find((x) => x.invoice_no === (p.inv || p.inv_no));
                                      if (found && found.id) {
                                        await deletePurchase(found.id);
                                      }
                                    }
                                    showToast(`✔ Purchase decanting #${p.inv || p.inv_no || p.po || p.po_no} deleted & tank stock reversed!`);
                                    await loadAllErpData();
                                  } catch (err: any) {
                                    showToast(`⚠ Error deleting purchase: ${err.message || 'Database error'}`);
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <span style={{ fontSize: '11px', color: '#666' }}>Sample Hydrometer Density verified: {purSampleDensity} kg/m³</span>
              <div style={{ display: 'flex', gap: '6px' }}>
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
                  📥 Export to Excel (CSV)
                </button>
                <button type="submit" className="win-btn-classic win-btn-primary">Save (F2)</button>
                <button type="button" className="win-btn-classic" onClick={() => { setPurQtyKl(4.0); setPurInvoiceNo('3215' + Math.floor(100 + Math.random() * 900)); showToast('New Purchase Slip ready'); }}>Reset (F1)</button>
                <button type="button" className="win-btn-classic" onClick={onClose}>Close</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
