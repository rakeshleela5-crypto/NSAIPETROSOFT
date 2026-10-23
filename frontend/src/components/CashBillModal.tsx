import React, { useState, useEffect } from 'react';
import type { CustomerFull, FuelProductRate, StationProfile } from '../models';
import { erpStore } from '../store/erpStore';
import {
  createCreditSale,
  createCardSettlement,
  saveCashBillApi,
  deleteCashBillApi,
  type RetailCashBillItem,
} from '../api/client';
import { getTodayErpDate } from '../utils/dateUtils';
import { printThermalReceiptHtml, generateUpiQrUrl } from '../utils/thermalPrinter';
import { calcSaleAmount, calcTaxSplit } from '../utils/mathEngine';
import { exportToCsv } from '../utils/exportCsv';

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
        if (splitCash > 0) {
          erpStore.recordCashSale(splitCash);
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
          erpStore.notify();
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
          erpStore.recordDigitalSale(totalAmount, cashMemoProduct, cashMemoLiters);
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
        } else {
          erpStore.recordCashSale(totalAmount, cashMemoProduct, cashMemoLiters);
        }
        showToast(`✔ Retail Bill #${cashMemoBillNo} Saved (Mode: ${billMode})! Printing 80mm slip...`);
      }

      // 5. Persist Immutable Retail Cash Memo in Store & PostgreSQL Database
      const cashBillPayload = {
        bill_no: cashMemoBillNo,
        date: getTodayErpDate(),
        vehicle_no: cashMemoVehicle.toUpperCase() || 'WALK-IN',
        product_name: cashMemoProduct === 'MS' ? 'Motor Spirit (Petrol)' : 'High Speed Diesel',
        product_code: cashMemoProduct,
        qty: cashMemoLiters,
        rate: cashMemoRate,
        amount: totalAmount,
        tax_amount: taxSplit.taxAmount,
        payment_mode: billMode,
        split_details: billMode === 'SPLIT' ? JSON.stringify({ cash: splitCash, upi: splitUpi, credit: splitCredit }) : undefined,
        driver_name: driverName || undefined,
      };

      erpStore.recordCashBill(cashBillPayload);
      try {
        await saveCashBillApi(cashBillPayload);
      } catch (apiErr) {
        console.warn('Backend cash bill sync deferred/offline:', apiErr);
      }

      handlePrintThermalSlip();
      await loadAllErpData();
      setCashMemoBillNo(`POS-${Date.now().toString().slice(-4)}`);
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    }
  };

  const handleReprintBill = (bill: RetailCashBillItem) => {
    const is58mm = stationProfile.printerPaperWidth === '58mm';
    const paperWidth = is58mm ? 58 : 80;
    const bodyWidth = is58mm ? '200px' : '280px';
    const fontSize = is58mm ? '10px' : '11.5px';
    const titleSize = is58mm ? '13px' : '15px';

    const qrImg = stationProfile.upiVpa && bill.payment_mode !== 'CREDIT'
      ? `<div style="text-align: center; margin: 6px 0;">
          <img src="${generateUpiQrUrl(stationProfile.upiVpa, stationProfile.stationName, bill.amount, `FUEL-${bill.bill_no}`)}" style="width: 90px; height: 90px;" alt="UPI QR"/>
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
          <div style="font-weight: bold; margin-top: 3px; font-size: 11px;">*** DUPLICATE CASH MEMO (REPRINT) ***</div>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Bill No: ${bill.bill_no}</span>
          <span>Date: ${bill.date}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Vehicle: <b>${bill.vehicle_no || 'WALK-IN'}</b></span>
          <span>Mode: ${bill.payment_mode}</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>${bill.product_name}</span>
          <span>${Number(bill.qty).toFixed(2)} L</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Rate:</span>
          <span>Rs ${Number(bill.rate).toFixed(2)}</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px;">
          <span>TOTAL PAID:</span>
          <span>Rs ${Number(bill.amount).toFixed(2)}</span>
        </div>
        ${qrImg}
        <div style="text-align: center; font-size: 9px; margin-top: 8px;">
          *** THANK YOU! DRIVE SAFELY ***
        </div>
      </div>
    `;
    printThermalReceiptHtml(html, { paperWidthMm: paperWidth });
    showToast(`🖨️ Reprinted Retail Memo #${bill.bill_no}`);
  };

  const handleVoidBill = async (billId: number, billNo: string, amount: number) => {
    const pin = window.prompt(`⚠️ Void Cash Memo #${billNo} (₹${amount.toFixed(2)})?\nEnter Manager Authorization PIN:`, '1234');
    if (!pin) return;

    try {
      erpStore.deleteCashBill(billId);
      try {
        await deleteCashBillApi(billId, pin);
      } catch (e: any) {
        console.warn('Backend cash bill void deferred/offline:', e);
      }
      showToast(`✔ Retail Cash Memo #${billNo} voided and fuel/cash rolled back!`);
      await loadAllErpData();
    } catch (err: any) {
      showToast(`❌ Void error: ${err.message || 'Authorization failed'}`);
    }
  };

  const handleExportCashBillsCsv = () => {
    const bills = erpStore.getState().cashBills || [];
    exportToCsv(
      `NSAIPETROSOFT_RetailCashBills_${getTodayErpDate()}`,
      ['Bill No', 'Date', 'Vehicle No', 'Product', 'Liters', 'Rate', 'Amount (INR)', 'Mode', 'Status'],
      bills.map((b) => [
        b.bill_no,
        b.date,
        b.vehicle_no,
        b.product_name,
        b.qty,
        b.rate,
        b.amount,
        b.payment_mode,
        b.status,
      ])
    );
    showToast('✔ Retail cash memos exported to CSV!');
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
      <div className="win-form-dialog" style={{ width: '840px', maxHeight: '92vh', overflowY: 'auto' }}>
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
            <div className="win-actions-row" style={{ marginBottom: '10px' }}>
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
                {ratesList && ratesList.length > 0 ? (
                  ratesList.map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.name} ({r.code}) - ₹{Number(r.rate).toFixed(2)}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="MS">Motor Spirit (Petrol MS) - ₹102.65</option>
                    <option value="HSD">High Speed Diesel (HSD) - ₹94.50</option>
                  </>
                )}
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

            <div className="win-actions-row" style={{ marginTop: '14px' }}>
              <button
                type="button"
                className="win-btn-classic win-btn-primary"
                onClick={handleExecuteSaveAndPrint}
                style={{ flex: 1, fontSize: '13px', fontWeight: 700 }}
              >
                <span>⚡</span>
                <span>Save & Print 80mm Slip (F2)</span>
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

        {/* Section: Recent Retail Cash Memos & POS Invoices */}
        <div style={{ padding: '0 12px 10px 12px' }}>
          <div style={{ borderTop: '1px solid #ccc', paddingTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontWeight: 700, fontSize: '11px', color: '#002b80' }}>
                📋 Recent Retail Cash Memos & POS Slips (PostgreSQL Sync)
              </div>
              <button
                type="button"
                className="win-btn-classic"
                style={{ fontSize: '10px', height: '20px', padding: '0 6px' }}
                onClick={handleExportCashBillsCsv}
              >
                📥 Export CSV
              </button>
            </div>
            <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '120px', overflowY: 'auto' }}>
              <table className="win-datagrid">
                <thead>
                  <tr>
                    <th>Bill No</th>
                    <th>Date</th>
                    <th>Vehicle</th>
                    <th>Product</th>
                    <th className="text-right">Qty (L)</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Total (₹)</th>
                    <th>Mode</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(erpStore.getState().cashBills || []).length > 0 ? (
                    (erpStore.getState().cashBills || []).slice(0, 15).map((b) => (
                      <tr key={b.id}>
                        <td style={{ fontWeight: 700 }}>{b.bill_no}</td>
                        <td>{b.date}</td>
                        <td style={{ fontWeight: 600 }}>{b.vehicle_no}</td>
                        <td>{b.product_code || b.product_name}</td>
                        <td className="text-right">{Number(b.qty).toFixed(2)}</td>
                        <td className="text-right">₹{Number(b.rate).toFixed(2)}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: '#002b80' }}>
                          ₹{Number(b.amount).toFixed(2)}
                        </td>
                        <td>
                          <span style={{
                            padding: '1px 4px',
                            borderRadius: '2px',
                            fontSize: '9px',
                            fontWeight: 700,
                            background: b.payment_mode === 'CASH' ? '#e8f8f5' : b.payment_mode === 'UPI' ? '#eaf2f8' : '#fef9e7',
                            color: b.payment_mode === 'CASH' ? '#27ae60' : b.payment_mode === 'UPI' ? '#2980b9' : '#d35400',
                          }}>
                            {b.payment_mode}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="win-btn-classic"
                              style={{ fontSize: '9.5px', height: '18px', padding: '0 4px' }}
                              onClick={() => handleReprintBill(b)}
                              title="Reprint duplicate thermal slip"
                            >
                              🖨️ Print
                            </button>
                            <button
                              type="button"
                              className="win-btn-classic"
                              style={{ fontSize: '9.5px', height: '18px', padding: '0 4px', color: '#c0392b', fontWeight: 600 }}
                              onClick={() => handleVoidBill(b.id, b.bill_no, Number(b.amount))}
                              title="Void retail memo and reverse cash & stock"
                            >
                              🗑️ Void
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', color: '#888', padding: '8px' }}>
                        No retail cash bills recorded yet today.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
