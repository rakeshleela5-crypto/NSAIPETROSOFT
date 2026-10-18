import React, { useState } from 'react';
import type { CustomerFull, FuelProductRate, StationProfile } from '../models';
import { createPaymentReceipt } from '../api/client';
import { getTodayErpDate } from '../utils/dateUtils';
import { printThermalReceiptHtml, generateUpiQrUrl } from '../utils/thermalPrinter';

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
  salesReadings,
  customers,
  stationProfile,
  showToast,
  loadAllErpData,
}) => {
  const [cashMemoBillNo, setCashMemoBillNo] = useState<string>('CB-9021');
  const [cashMemoVehicle, setCashMemoVehicle] = useState<string>('GJ05AB1234');
  const [cashMemoProduct, setCashMemoProduct] = useState<string>('MS');
  const [cashMemoRate, setCashMemoRate] = useState<number>(102.65);
  const [cashMemoLiters, setCashMemoLiters] = useState<number>(20.0);

  if (!isOpen) return null;

  const handlePrintCashReceipt = () => {
    const tot = (cashMemoLiters * cashMemoRate).toFixed(2);
    const is58mm = stationProfile.printerPaperWidth === '58mm';
    const paperWidth = is58mm ? 58 : 80;
    const bodyWidth = is58mm ? '200px' : '280px';
    const fontSize = is58mm ? '10px' : '11.5px';
    const titleSize = is58mm ? '13px' : '15px';

    const qrImg = stationProfile.upiVpa
      ? `<div style="text-align: center; margin: 6px 0;">
          <img src="${generateUpiQrUrl(stationProfile.upiVpa, stationProfile.stationName, Number(tot), `FUEL-${cashMemoBillNo}`)}" style="width: 100px; height: 100px;" alt="UPI QR"/>
          <div style="font-size: 8.5px;">UPI: ${stationProfile.upiVpa}</div>
         </div>`
      : '';

    const html = `
      <div style="font-family: 'Courier New', monospace; font-size: ${fontSize}; width: ${bodyWidth}; margin: 0 auto; line-height: 1.35; color: #000;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: ${titleSize}; font-weight: bold;">${stationProfile.stationName}</div>
          <div style="font-size: 10.5px;">${stationProfile.oilCompany} RETAIL OUTLET</div>
          ${stationProfile.dealerCode ? `<div style="font-size: 9.5px;">RO Code: ${stationProfile.dealerCode}</div>` : ''}
          <div style="font-size: 9.5px;">${stationProfile.address ? `${stationProfile.address}, ` : ''}${stationProfile.city || ''}</div>
          <div style="font-size: 9.5px;">GSTIN: ${stationProfile.gstin || '-'} | PH: ${stationProfile.phone || '-'}</div>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Memo No: ${cashMemoBillNo}</span>
          <span>${getTodayErpDate()}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Vehicle: ${cashMemoVehicle || 'WALK-IN'}</span>
          <span>${new Date().toLocaleTimeString()}</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>${cashMemoProduct === 'MS' ? 'PETROL (MS)' : 'DIESEL (HSD)'}</span>
          <span>${cashMemoLiters.toFixed(2)} L</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Rate/L:</span>
          <span>Rs ${cashMemoRate.toFixed(2)}</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13.5px;">
          <span>TOTAL AMOUNT:</span>
          <span>Rs ${tot}</span>
        </div>
        ${qrImg}
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="text-align: center; font-size: 8.5px; margin-top: 6px;">
          <div>*** CASH MEMO / RETAIL INVOICE ***</div>
          <div>THANK YOU! VISIT AGAIN</div>
          <div>SAVE FUEL - SAVE ENVIRONMENT</div>
        </div>
      </div>
    `;
    printThermalReceiptHtml(html, { paperWidthMm: paperWidth });
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '680px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🧾</span>
            <span>Retail Cash Sale Memo (Thermal Receipt Generator)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>Cash Fuel Dispense Memo</div>
            <div className="win-form-row">
              <span className="win-label">Bill No</span>
              <input type="text" className="win-input" value={cashMemoBillNo} onChange={(e) => setCashMemoBillNo(e.target.value)} style={{ flex: 1, fontWeight: 700 }} />
            </div>
            <div className="win-form-row">
              <span className="win-label">Vehicle No</span>
              <input type="text" className="win-input" value={cashMemoVehicle} onChange={(e) => setCashMemoVehicle(e.target.value.toUpperCase())} style={{ flex: 1 }} />
            </div>
            <div className="win-form-row">
              <span className="win-label">Product</span>
              <select
                className="win-select"
                style={{ flex: 1, fontWeight: 600 }}
                value={cashMemoProduct}
                onChange={(e) => {
                  const prod = e.target.value;
                  setCashMemoProduct(prod);
                  const rateItem = ratesList.find(p => prod === 'MS' ? (p.code === 'MS' || p.name.includes('Petrol')) : (p.code === 'HSD' || p.name.includes('Diesel')));
                  const matched = salesReadings.find(r => prod === 'MS' ? r.item === 'Petrol' : r.item === 'Diesel');
                  setCashMemoRate(rateItem?.rate || (matched ? matched.rate : 0));
                }}
              >
                <option value="MS">Motor Spirit (Petrol / MS)</option>
                <option value="HSD">High Speed Diesel (HSD)</option>
              </select>
            </div>
            <div className="win-form-row">
              <span className="win-label">Rate / L (₹)</span>
              <input
                type="number"
                step="0.01"
                className="win-input"
                value={cashMemoRate}
                onChange={(e) => setCashMemoRate(parseFloat(e.target.value) || 0)}
                style={{ flex: 1, fontWeight: 700 }}
              />
            </div>
            <div className="win-form-row">
              <span className="win-label">Liters</span>
              <input type="number" step="0.01" className="win-input" value={cashMemoLiters} onChange={(e) => setCashMemoLiters(parseFloat(e.target.value) || 0)} style={{ flex: 1, fontWeight: 700 }} />
            </div>
            <div className="win-form-row">
              <span className="win-label">Total Amount</span>
              <input type="text" className="win-input" readOnly value={`₹ ${(cashMemoLiters * cashMemoRate).toFixed(2)}`} style={{ flex: 1, fontWeight: 800, color: '#1565c0' }} />
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
              <button
                type="button"
                className="win-btn-classic win-btn-primary"
                style={{ flex: 1, fontWeight: 700 }}
                onClick={async () => {
                  if (cashMemoLiters <= 0) {
                    showToast('⚠ Please enter valid liters for Cash Memo');
                    return;
                  }
                  try {
                    const walkInCust = customers.find(c => c.name.toLowerCase().includes('walk') || c.name.toLowerCase().includes('cash')) || customers[0];
                    if (walkInCust) {
                      await createPaymentReceipt({
                        customer_id: walkInCust.id,
                        amount: cashMemoLiters * cashMemoRate,
                        payment_mode: 'CASH',
                        bank_name: 'CASH ON HAND',
                        remarks: `Retail Cash Memo #${cashMemoBillNo} - ${cashMemoLiters}L ${cashMemoProduct} @ ${cashMemoRate} (Veh: ${cashMemoVehicle || 'WALK-IN'})`,
                      });
                    }
                    showToast(`✔ Cash Memo #${cashMemoBillNo} recorded! Cash credited to Cash On Hand.`);
                    handlePrintCashReceipt();
                    await loadAllErpData();
                  } catch (err: any) {
                    showToast(`✔ Slip printed. Note: ${err.message}`);
                    handlePrintCashReceipt();
                  }
                }}
              >
                💾 Save & Print Cash Memo
              </button>
              <button
                type="button"
                className="win-btn-classic"
                onClick={handlePrintCashReceipt}
                title="Print receipt without creating ledger entry"
              >
                🖨️ Print Slip
              </button>
            </div>
          </div>

          {/* Thermal Paper Slip Preview */}
          <div>
            <div className="thermal-slip-box">
              <div className="thermal-slip-header">
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{stationProfile.stationName}</div>
                <div style={{ fontSize: '10px', color: '#333' }}>{stationProfile.oilCompany} DEALER</div>
                <div>{stationProfile.address ? `${stationProfile.address}, ` : ''}{stationProfile.city}, {stationProfile.state} - {stationProfile.pincode}</div>
                <div>GSTIN: {stationProfile.gstin} {stationProfile.phone ? `| PH: ${stationProfile.phone}` : ''}</div>
              </div>
              <div className="thermal-slip-row"><span>Bill No: {cashMemoBillNo}</span><span>{getTodayErpDate()}</span></div>
              <div className="thermal-slip-row"><span>Vehicle: {cashMemoVehicle || 'WALK-IN'}</span><span>{new Date().toLocaleTimeString()}</span></div>
              <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />
              <div className="thermal-slip-row">
                <span>{cashMemoProduct === 'MS' ? 'PETROL (MS)' : 'DIESEL (HSD)'}</span>
                <span>{cashMemoLiters.toFixed(2)} L</span>
              </div>
              <div className="thermal-slip-row">
                <span>Rate / L:</span>
                <span>₹ {cashMemoRate.toFixed(2)}</span>
              </div>
              <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />
              <div className="thermal-slip-row" style={{ fontWeight: 'bold', fontSize: '14px' }}>
                <span>TOTAL:</span>
                <span>₹ {(cashMemoLiters * cashMemoRate).toFixed(2)}</span>
              </div>
              <div className="thermal-slip-footer">
                <div>THANK YOU! VISIT AGAIN</div>
                <div>SAVE FUEL - SAVE ENVIRONMENT</div>
              </div>
            </div>
          </div>
        </div>
        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="win-btn-classic win-btn-primary"
              onClick={handlePrintCashReceipt}
            >
              🖨️ Print Thermal Cash Slip
            </button>
            <button className="win-btn-classic" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};
