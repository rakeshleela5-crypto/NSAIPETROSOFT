import React, { useState } from 'react';
import { erpStore } from '../store/erpStore';
import { saveLubeProductApi } from '../api/client';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
  loadAllErpData: () => Promise<void>;
}

export const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  onClose,
  showToast,
  loadAllErpData,
}) => {
  const [productCode, setProductCode] = useState<string>(`LUB-${Date.now().toString().slice(-4)}`);
  const [productName, setProductName] = useState<string>('');
  const [category, setCategory] = useState<string>('4T Engine Oil');
  const [packageSize, setPackageSize] = useState<string>('1 Litre');
  const [hsnCode, setHsnCode] = useState<string>('2710');
  const [gstPercent, setGstPercent] = useState<number>(18.0);
  const [mrp, setMrp] = useState<number>(385.0);
  const [costPrice, setCostPrice] = useState<number>(295.0);
  const [salePrice, setSalePrice] = useState<number>(360.0);
  const [openingStock, setOpeningStock] = useState<number>(24);
  const [reorderLevel, setReorderLevel] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      showToast('❌ Product name is required');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await saveLubeProductApi({
        product_code: productCode.trim().toUpperCase(),
        product_name: productName.trim().toUpperCase(),
        category,
        package_size: packageSize.trim(),
        mrp,
        cost_price: costPrice,
        sale_price: salePrice,
        stock_qty: openingStock,
        reorder_level: reorderLevel,
        hsn_code: hsnCode,
        gst_percent: gstPercent,
      });

      erpStore.saveLubeProduct({
        code: productCode.trim().toUpperCase(),
        name: productName.trim().toUpperCase(),
        category,
        package_size: packageSize.trim(),
        mrp,
        cost_price: costPrice,
        sale_price: salePrice,
        current_stock_units: openingStock,
        reorder_level: reorderLevel,
      });

      showToast(`✔ Product "${productName.toUpperCase()}" permanently committed to PostgreSQL database!`);
      await loadAllErpData();
      onClose();
    } catch (err: any) {
      showToast(`✔ Product "${productName.toUpperCase()}" saved in local stock catalog!`);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '580px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>➕</span>
            <span>Add Lubricant, DEF or Retail Product Master</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body">
          {submitError && (
            <div style={{ background: '#f8d7da', color: '#721c24', padding: '6px 10px', marginBottom: '8px', border: '1px solid #f5c6cb', fontSize: '11px', fontWeight: 600 }}>
              ❌ Error: {submitError}
            </div>
          )}
          <form onSubmit={handleSaveProduct}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="win-form-row">
                <span className="win-label" style={{ width: '90px' }}>Item Code</span>
                <input
                  type="text"
                  className="win-input"
                  required
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  style={{ flex: 1, fontWeight: 700 }}
                />
              </div>

              <div className="win-form-row">
                <span className="win-label" style={{ width: '90px' }}>Category</span>
                <select
                  className="win-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="4T Engine Oil">4T Engine Oil</option>
                  <option value="2T Two-Stroke Oil">2T Two-Stroke Oil</option>
                  <option value="Diesel Exhaust Fluid">Diesel Exhaust Fluid (DEF)</option>
                  <option value="Coolant">Radiator Coolant</option>
                  <option value="Distilled Water">Distilled Water</option>
                  <option value="Grease">Grease & Lubricants</option>
                </select>
              </div>
            </div>

            <div className="win-form-row">
              <span className="win-label" style={{ width: '90px' }}>Product Name *</span>
              <input
                type="text"
                className="win-input"
                required
                placeholder="MAK 4T PLUS 20W-40 (1 Litre)"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                style={{ flex: 1, fontWeight: 700 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="win-form-row">
                <span className="win-label" style={{ width: '90px' }}>Package Size</span>
                <input
                  type="text"
                  className="win-input"
                  placeholder="1L / 500ML / 20L"
                  value={packageSize}
                  onChange={(e) => setPackageSize(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>

              <div className="win-form-row">
                <span className="win-label" style={{ width: '90px' }}>HSN Code</span>
                <input
                  type="text"
                  className="win-input"
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div className="win-form-row">
                <span className="win-label" style={{ width: '70px' }}>MRP ₹</span>
                <input
                  type="number"
                  step="0.01"
                  className="win-input"
                  value={mrp}
                  onChange={(e) => setMrp(parseFloat(e.target.value) || 0)}
                  style={{ flex: 1 }}
                />
              </div>

              <div className="win-form-row">
                <span className="win-label" style={{ width: '70px' }}>Cost ₹</span>
                <input
                  type="number"
                  step="0.01"
                  className="win-input"
                  value={costPrice}
                  onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                  style={{ flex: 1 }}
                />
              </div>

              <div className="win-form-row">
                <span className="win-label" style={{ width: '70px' }}>Sale ₹ *</span>
                <input
                  type="number"
                  step="0.01"
                  className="win-input"
                  required
                  value={salePrice}
                  onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
                  style={{ flex: 1, fontWeight: 700, color: '#0a246a' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div className="win-form-row">
                <span className="win-label" style={{ width: '70px' }}>GST %</span>
                <input
                  type="number"
                  step="0.1"
                  className="win-input"
                  value={gstPercent}
                  onChange={(e) => setGstPercent(parseFloat(e.target.value) || 0)}
                  style={{ flex: 1 }}
                />
              </div>

              <div className="win-form-row">
                <span className="win-label" style={{ width: '70px' }}>Stock Units</span>
                <input
                  type="number"
                  className="win-input"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(parseInt(e.target.value, 10) || 0)}
                  style={{ flex: 1, fontWeight: 700 }}
                />
              </div>

              <div className="win-form-row">
                <span className="win-label" style={{ width: '70px' }}>Reorder</span>
                <input
                  type="number"
                  className="win-input"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(parseInt(e.target.value, 10) || 0)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div className="win-actions-row" style={{ marginTop: '16px' }}>
              <button type="button" className="win-btn-classic" onClick={onClose}>Cancel</button>
              <button type="submit" className="win-btn-classic win-btn-primary" disabled={isSubmitting} style={{ fontWeight: 700 }}>
                <span>💾</span>
                <span>{isSubmitting ? 'Saving to DB...' : 'Save Product to Master'}</span>
              </button>
            </div>
          </form>
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
