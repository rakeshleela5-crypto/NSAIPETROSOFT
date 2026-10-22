import React, { useState, useEffect } from 'react';
import type { CustomerFull, FuelProductRate, StationProfile } from '../models';
import { erpStore } from '../store/erpStore';
import { createCreditSale, createCardSettlement } from '../api/client';
import { getTodayErpDate } from '../utils/dateUtils';
import { printThermalReceiptHtml, generateUpiQrUrl } from '../utils/thermalPrinter';
import { calcSaleAmount, calcTaxSplit } from '../utils/mathEngine';

interface CashBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  ratesList: FuelProductRate[];
  salesReadings: any[];
  customers: CustomerFull[];
  stationProfile: StationProfile;
  showToast: (msg: string) => void;
  loadAllErpData: () => Promise<void>;
}

export const CashBillModal: React.FC<CashBillModalProps> = ({
  isOpen,
  onClose,
  ratesList,
  customers,
  stationProfile,
  showToast,
  loadAllErpData,
}) => {
  const [billMode, setBillMode] = useState<'CASH' | 'CREDIT' | 'UPI' | 'SPLIT'>('CASH');
  const [cashMemoBillNo, setCashMemoBillNo] = useState<string>(`POS-${Date.now().toString().slice(-4)}`);
  const [cashMemoVehicle, setCashMemoVehicle] = useState<string>('GJ05AB1234');
  const [cashMemoProduct, setCashMemoProduct] = useState<string>('MS');
  const [cashMemoRate, setCashMemoRate] = useState<number>(102.65);
  const [cashMemoLiters, setCashMemoLiters] = useState<number>(20.0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(customers[0]?.id || 1);
  const [driverName, setDriverName] = useState<string>('');

  // Multi-Mode Tender Breakdown (Split Tender)
  const [splitCash, setSplitCash] = useState<number>(0);
  const [splitUpi, setSplitUpi] = useState<number>(0);
  const [splitCredit, setSplitCredit] = useState<number>(0);

  // Sync rate when product changes
  useEffect(() => {
    const r = ratesList.find((p) => p.code === cashMemoProduct);
    if (r) setCashMemoRate(r.rate);
  }, [cashMemoProduct, ratesList]);

  // Recalculate split defaults when total changes
  const totalAmount = calcSaleAmount(cashMemoLiters, cashMemoRate);
  const taxSplit = calcTaxSplit(totalAmount, 13.7);

  useEffect(() => {
    if (billMode === 'SPLIT' && splitCash === 0 && splitUpi === 0 && splitCredit === 0) {
      setSplitCash(Math.floor(totalAmount / 2));
      setSplitUpi(Math.round((totalAmount - Math.floor(totalAmount / 2)) * 100) / 100);
      setSplitCredit(0);
    }
  }, [billMode, totalAmount]);

  // Multi-mode validation
  const allocatedTender = Math.round((splitCash + splitUpi + splitCredit + Number.EPSILON) * 100) / 100;
  const tenderGap = Math.round((totalAmount - allocatedTender + Number.EPSILON) * 100) / 100;
  const isSplitValid = Math.abs(tenderGap) < 0.01;

  // Keyboard shortcuts: F2 (Quick Save & Print), F4 (Cash Mode), F8 (Credit Mode)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        handleExecuteSaveAndPrint();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setBillMode('CASH');
        showToast('💵 Switched to Cash Billing Mode');
      } else if (e.key === 'F8') {
        e.preventDefault();
        setBillMode('CREDIT');
        showToast('📋 Switched to Credit Fleet Billing Mode');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, cashMemoLiters, cashMemoRate, cashMemoVehicle, billMode, selectedCustomerId, cashMemoProduct, splitCash, splitUpi, splitCredit, totalAmount]);

  if (!isOpen) return null;

  const handleExecuteSaveAndPrint = async () => {
    try {
      const state = erpStore.getState();

      if (billMode === 'SPLIT') {
        if (!isSplitValid) {
          showToast(`❌ Multi-mode split mismatch: Allocated ₹${allocatedTender} vs Bill ₹${totalAmount}. Difference: ₹${tenderGap}`);
          return;
        }

        // 1. Post Cash portion if > 0
        if (splitCash > 0 && state.bankAccounts.length > 0) {
          state.bankAccounts[0].balance = Math.round((state.bankAccounts[0].balance + splitCash + Number.EPSILON) * 100) / 100;
        }

        // 2. Post Digital / UPI portion if > 0
        if (splitUpi > 0) {
          erpStore.recordCardSettlement({
            machine_name: 'PHONEPE / PAYTM QR',
            batch_no: `UPI-${cashMemoBillNo}`,
            slip_count: 1,
            amount: splitUpi,
          });
          try {
            await createCardSettlement({
              machine_name: 'PHONEPE / PAYTM QR',
              batch_no: `UPI-${cashMemoBillNo}`,
              slip_count: 1,
              amount: splitUpi,
            });
          } catch (e) {
            console.warn('Card settlement sync deferred:', e);
          }
        }

        // 3. Post Credit portion if > 0
        if (splitCredit > 0) {
          const splitCreditQty = Math.round(((splitCredit / cashMemoRate) + Number.EPSILON) * 100) / 100;
          erpStore.recordCreditBill({
            customer_id: selectedCustomerId,
            vehicle_no: cashMemoVehicle.toUpperCase(),
            product_name: cashMemoProduct === 'MS' ? 'Motor Spirit (Petrol)' : 'High Speed Diesel',
            qty: splitCreditQty,
            rate: cashMemoRate,
            slip_no: `SPLIT-${cashMemoBillNo}`,
            driver_name: driverName || 'Driver',
          });
          try {
            await createCreditSale({
              customer_id: selectedCustomerId,
              vehicle_no: cashMemoVehicle.toUpperCase(),
              product_id: cashMemoProduct === 'MS' ? 1 : 2,
              slip_no: `SPLIT-${cashMemoBillNo}`,
              qty: splitCreditQty,
              rate: cashMemoRate,
              driver_name: driverName || 'Driver',
            });
          } catch (e) {
            console.warn('Credit sale sync deferred:', e);
          }
        }

        // 4. Atomically deduct total fuel volume from tank stock
        const tank = state.tanks.find((t) => t.code === cashMemoProduct) || state.tanks[0];
        if (tank) {
          tank.current_stock = Math.max(0, Math.round((tank.current_stock - cashMemoLiters + Number.EPSILON) * 100) / 100);
          tank.book_stock = Math.max(0, Math.round((tank.book_stock - cashMemoLiters + Number.EPSILON) * 100) / 100);
        }

        showToast(`✔ Multi-Mode Split Bill #${cashMemoBillNo} Saved (Cash: ₹${splitCash}, UPI: ₹${splitUpi}, Credit: ₹${splitCredit})!`);
      } else if (billMode === 'CREDIT') {
        erpStore.recordCreditBill({
          customer_id: selectedCustomerId,
          vehicle_no: cashMemoVehicle.toUpperCase(),
          product_name: cashMemoProduct === 'MS' ? 'Motor Spirit (Petrol)' : 'High Speed Diesel',
          qty: cashMemoLiters,
          rate: cashMemoRate,
          slip_no: `POS-${cashMemoBillNo}`,
          driver_name: driverName || 'Driver',
        });
        try {
          await createCreditSale({
            customer_id: selectedCustomerId,
            vehicle_no: cashMemoVehicle.toUpperCase(),
            product_id: cashMemoProduct === 'MS' ? 1 : 2,
            slip_no: `POS-${cashMemoBillNo}`,
            qty: cashMemoLiters,
            rate: cashMemoRate,
            driver_name: driverName || 'Driver',
          });
        } catch (e) {
          console.warn('Credit sale sync deferred:', e);
        }
        showToast(`✔ Credit Fleet Bill #${cashMemoBillNo} Saved for ${customers.find(c => c.id === selectedCustomerId)?.name || 'Fleet'}!`);
      } else {
        if (billMode === 'UPI') {
          erpStore.recordCardSettlement({
            machine_name: 'PHONEPE / PAYTM QR',
            batch_no: `UPI-${cashMemoBillNo}`,
            slip_count: 1,
            amount: totalAmount,
          });
          try {
            await createCardSettlement({
              machine_name: 'PHONEPE / PAYTM QR',
              batch_no: `UPI-${cashMemoBillNo}`,
              slip_count: 1,
              amount: totalAmount,
            });
          } catch (e) {
            console.warn('Card settlement sync deferred:', e);
          }
        } else if (state.bankAccounts.length > 0) {
          state.bankAccounts[0].balance = Math.round((state.bankAccounts[0].balance + totalAmount + Number.EPSILON) * 100) / 100;
        }

        const tank = state.tanks.find((t) => t.code === cashMemoProduct) || state.tanks[0];
        if (tank) {
          tank.current_stock = Math.max(0, Math.round((tank.current_stock - cashMemoLiters + Number.EPSILON) * 100) / 100);
          tank.book_stock = Math.max(0, Math.round((tank.book_stock - cashMemoLiters + Number.EPSILON) * 100) / 100);
        }
        showToast(`✔ Retail Bill #${cashMemoBillNo} Saved (Mode: ${billMode})! Printing 80mm slip...`);
      }

      handlePrintThermalSlip();
      await loadAllErpData();
      setCashMemoBillNo(`POS-${Date.now().toString().slice(-4)}`);
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    }
  };

  const handlePrintThermalSlip = () => {
    const is58mm = stationProfile.printerPaperWidth === '58mm';
    const paperWidth = is58mm ? 58 : 80;
    const bodyWidth = is58mm ? '200px' : '280px';
    const fontSize = is58mm ? '10px' : '11.5px';
    const titleSize = is58mm ? '13px' : '15px';

    const customer = customers.find((c) => c.id === selectedCustomerId);

    const qrImg = stationProfile.upiVpa && billMode !== 'CREDIT'
      ? `<div style="text-align: center; margin: 6px 0;">
          <img src="${generateUpiQrUrl(stationProfile.upiVpa, stationProfile.stationName, totalAmount, `FUEL-${cashMemoBillNo}`)}" style="width: 90px; height: 90px;" alt="UPI QR"/>
          <div style="font-size: 8px;">UPI: ${stationProfile.upiVpa}</div>
         </div>`
      : '';

    const html = `
      <div style="font-family: 'Courier New', monospace; font-size: ${fontSize}; width: ${bodyWidth}; margin: 0 auto; line-height: 1.35; color: #000;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: ${titleSize}; font-weight: bold;">${stationProfile.stationName}</div>
          <div style="font-size: 10px;">${stationProfile.oilCompany} RETAIL OUTLET</div>
          ${stationProfile.dealerCode ? `<div style="font-size: 9px;">RO Code: ${stationProfile.dealerCode}</div>` : ''}
          <div style="font-size: 9px;">${stationProfile.address ? `${stationProfile.address}, ` : ''}${stationProfile.city || ''}</div>
          <div style="font-size: 9px;">GSTIN: ${stationProfile.gstin || '-'} | PH: ${stationProfile.phone || '-'}</div>
          <div style="font-weight: bold; margin-top: 3px; font-size: 11px;">*** ${billMode === 'CREDIT' ? 'FLEET CREDIT MEMO' : 'RETAIL CASH MEMO'} ***</div>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Bill No: ${cashMemoBillNo}</span>
          <span>Date: ${getTodayErpDate()}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Vehicle: <b>${cashMemoVehicle.toUpperCase() || 'WALK-IN'}</b></span>
          <span>Time: ${new Date().toLocaleTimeString()}</span>
        </div>
        ${billMode === 'CREDIT' && customer ? `<div style="font-size: 9.5px;">Account: ${customer.name}</div>` : ''}
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>${cashMemoProduct === 'MS' ? 'PETROL (MS BS-VI)' : 'DIESEL (HSD BS-VI)'}</span>
          <span>${cashMemoLiters.toFixed(2)} L</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Rate per Litre:</span>
          <span>₹ ${cashMemoRate.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 9.5px; color: #333;">
          <span>Taxable Base:</span>
          <span>₹ ${taxSplit.baseAmount.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 9.5px; color: #333;">
          <span>State VAT (13.7%):</span>
          <span>₹ ${taxSplit.taxAmount.toFixed(2)}</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13.5px;">
          <span>NET PAYABLE:</span>
          <span>₹ ${totalAmount.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 2px;">
          <span>Settlement Mode:</span>
          <span><b>${billMode}</b></span>
        </div>
        ${qrImg}
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="text-align: center; font-size: 8.5px; margin-top: 4px;">
          <div>THANK YOU! VISIT AGAIN</div>
          <div>SAVE FUEL • SAVE NATURE • DRIVE SAFE</div>
          <div>Powered by NSaiPetroSoft Cloud Forecourt</div>
        </div>
      </div>
    `;
    printThermalReceiptHtml(html, { paperWidthMm: paperWidth });
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '740px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⛽</span>
            <span>Sale POS — Fast Retail Billing & Thermal Receipt [F2=Print, F4=Cash, F8=Credit]</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
          {/* Left: Input Form */}
          <div>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
              <button
                type="button"
                className={`win-btn-classic ${billMode === 'CASH' ? 'win-btn-primary' : ''}`}
                onClick={() => setBillMode('CASH')}
                style={{ flex: 1, fontWeight: 700 }}
              >
                💵 Cash (F4)
              </button>
              <button
                type="button"
                className={`win-btn-classic ${billMode === 'CREDIT' ? 'win-btn-primary' : ''}`}
                onClick={() => setBillMode('CREDIT')}
                style={{ flex: 1, fontWeight: 700 }}
              >
                📋 Credit (F8)
              </button>
              <button
                type="button"
                className={`win-btn-classic ${billMode === 'UPI' ? 'win-btn-primary' : ''}`}
                onClick={() => setBillMode('UPI')}
                style={{ flex: 1, fontWeight: 700 }}
              >
                📱 UPI / QR
              </button>
              <button
                type="button"
                className={`win-btn-classic ${billMode === 'SPLIT' ? 'win-btn-primary' : ''}`}
                onClick={() => setBillMode('SPLIT')}
                style={{ flex: 1.2, fontWeight: 700, background: billMode === 'SPLIT' ? '#6b21a8' : undefined, color: billMode === 'SPLIT' ? '#fff' : undefined }}
                title="Multi-Mode Tender: Split across Cash + UPI + Fleet Credit"
              >
                ⚡ Multi-Split
              </button>
            </div>

            {/* Split Tender Allocation Panel */}
            {billMode === 'SPLIT' && (
              <div style={{
                background: '#f5f3ff',
                border: '1px solid #c4b5fd',
                padding: '8px',
                borderRadius: '4px',
                marginBottom: '10px',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#5b21b6', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Multi-Tender Allocation (Must equal ₹{totalAmount.toFixed(2)})</span>
                  <span style={{ color: isSplitValid ? '#15803d' : '#b91c1c' }}>
                    {isSplitValid ? '✔ Balanced' : `⚠ Gap: ₹${tenderGap.toFixed(2)}`}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#333' }}>💵 Cash Paid</span>
                    <input
                      type="number"
                      step="0.01"
                      className="win-input"
                      style={{ width: '100%', fontWeight: 700 }}
                      value={splitCash}
                      onChange={(e) => setSplitCash(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#333' }}>📱 UPI / QR</span>
                    <input
                      type="number"
                      step="0.01"
                      className="win-input"
                      style={{ width: '100%', fontWeight: 700 }}
                      value={splitUpi}
                      onChange={(e) => setSplitUpi(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#333' }}>📋 Credit Fleet</span>
                    <input
                      type="number"
                      step="0.01"
                      className="win-input"
                      style={{ width: '100%', fontWeight: 700 }}
                      value={splitCredit}
                      onChange={(e) => setSplitCredit(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>
            )}

            {(billMode === 'CREDIT' || (billMode === 'SPLIT' && splitCredit > 0)) && (
              <div className="win-form-row">
                <span className="win-label" style={{ width: '90px' }}>Customer</span>
                <select
                  className="win-select"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
                  style={{ flex: 1, fontWeight: 600 }}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} (Bal: ₹{c.current_outstanding})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="win-form-row">
              <span className="win-label" style={{ width: '90px' }}>Vehicle No *</span>
              <input
                type="text"
                className="win-input"
                placeholder="GJ05AB1234"
                value={cashMemoVehicle}
                onChange={(e) => setCashMemoVehicle(e.target.value.toUpperCase())}
                style={{ flex: 1, fontWeight: 700 }}
              />
            </div>

            <div className="win-form-row">
              <span className="win-label" style={{ width: '90px' }}>Fuel Grade</span>
              <select
                className="win-select"
                value={cashMemoProduct}
                onChange={(e) => setCashMemoProduct(e.target.value)}
                style={{ flex: 1, fontWeight: 700 }}
              >
                <option value="MS">Motor Spirit (Petrol MS) - ₹102.65</option>
                <option value="HSD">High Speed Diesel (HSD) - ₹94.50</option>
              </select>
            </div>

            <div className="win-form-row">
              <span className="win-label" style={{ width: '90px' }}>Sale Rate ₹</span>
              <input
                type="number"
                step="0.01"
                className="win-input"
                value={cashMemoRate}
                onChange={(e) => setCashMemoRate(parseFloat(e.target.value) || 0)}
                style={{ flex: 1 }}
              />
            </div>

            <div className="win-form-row">
              <span className="win-label" style={{ width: '90px' }}>Fuel Litres *</span>
              <input
                type="number"
                step="0.1"
                className="win-input"
                value={cashMemoLiters}
                onChange={(e) => setCashMemoLiters(parseFloat(e.target.value) || 0)}
                style={{ flex: 1, fontSize: '16px', fontWeight: 700, color: '#0a246a' }}
              />
            </div>

            {/* Quick volume preset chips */}
            <div style={{ display: 'flex', gap: '4px', margin: '6px 0 10px 95px' }}>
              {[5, 10, 20, 50, 100].map((lit) => (
                <button
                  key={lit}
                  type="button"
                  className="win-btn-classic"
                  onClick={() => setCashMemoLiters(lit)}
                  style={{ fontSize: '10.5px', padding: '2px 6px' }}
                >
                  {lit} L
                </button>
              ))}
            </div>

            <div className="win-form-row">
              <span className="win-label" style={{ width: '90px' }}>Driver / Note</span>
              <input
                type="text"
                className="win-input"
                placeholder="Driver name / slip note"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>

            <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="win-btn-classic win-btn-primary"
                onClick={handleExecuteSaveAndPrint}
                style={{ flex: 1, height: '34px', fontSize: '13px', fontWeight: 700 }}
              >
                ⚡ Save & Print 80mm Slip (F2)
              </button>
            </div>
          </div>

          {/* Right: Live 80mm Thermal Receipt Preview */}
          <div style={{ background: '#f8f8f0', border: '1px solid #7f9db9', padding: '12px', borderRadius: '4px', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textAlign: 'center', marginBottom: '8px', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>
              Live 80mm Thermal Receipt Preview
            </div>

            <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.4', color: '#000' }}>
              <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px' }}>{stationProfile.stationName}</div>
              <div style={{ textAlign: 'center', fontSize: '10px' }}>{stationProfile.oilCompany} RETAIL OUTLET</div>
              <div style={{ textAlign: 'center', fontSize: '9px' }}>{stationProfile.city} | GSTIN: {stationProfile.gstin}</div>
              <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Bill: {cashMemoBillNo}</span>
                <span>{getTodayErpDate()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Veh: <b>{cashMemoVehicle.toUpperCase()}</b></span>
                <span>Mode: {billMode}</span>
              </div>
              <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>{cashMemoProduct === 'MS' ? 'Petrol (MS)' : 'Diesel (HSD)'}</span>
                <span>{cashMemoLiters.toFixed(2)} L</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Rate:</span>
                <span>₹ {cashMemoRate.toFixed(2)}</span>
              </div>
              <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px', color: '#002b80' }}>
                <span>TOTAL AMOUNT:</span>
                <span>₹ {totalAmount.toFixed(2)}</span>
              </div>
              {billMode === 'SPLIT' && (
                <div style={{ fontSize: '9.5px', margin: '4px 0', borderTop: '1px dashed #555', paddingTop: '3px', color: '#222' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>• Cash:</span><span>₹ {splitCash.toFixed(2)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>• UPI / QR:</span><span>₹ {splitUpi.toFixed(2)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>• Fleet Credit:</span><span>₹ {splitCredit.toFixed(2)}</span></div>
                </div>
              )}
              <div style={{ textAlign: 'center', fontSize: '9px', marginTop: '10px', color: '#666' }}>
                *** THANK YOU! VISIT AGAIN ***
              </div>
            </div>
          </div>
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">F2=Save & Print | F4=Cash | F8=Credit | ESC=Exit</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
