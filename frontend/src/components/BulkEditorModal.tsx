import React, { useState, useEffect, useRef } from 'react';
import type { LubeProductItem } from '../models';
import { erpStore } from '../store/erpStore';
import { saveLubeProductApi, deleteLubeProductApi, bulkImportLubesCsvApi } from '../api/client';
import { exportToCsv } from '../utils/exportCsv';

interface BulkEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  products?: LubeProductItem[];
  showToast?: (msg: string) => void;
  loadAllErpData?: () => Promise<void>;
  requestManagerAuthorization?: (actionDesc: string, onAuthorized: (pin?: string) => Promise<void> | void) => void;
}

export const BulkEditorModal: React.FC<BulkEditorModalProps> = ({
  isOpen,
  onClose,
  products = erpStore.getState().products,
  showToast,
  loadAllErpData,
  requestManagerAuthorization,
}) => {
  const [gridData, setGridData] = useState<Array<{
    id: number;
    code: string;
    name: string;
    sale_price: number;
    cost_price: number;
    current_stock_units: number;
    reorder_level: number;
  }>>([]);

  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (products) {
      setGridData(
        products.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          sale_price: p.sale_price,
          cost_price: p.cost_price,
          current_stock_units: p.current_stock_units,
          reorder_level: p.reorder_level,
        }))
      );
      setHasChanges(false);
    }
  }, [products, isOpen]);

  if (!isOpen) return null;

  const handleCellChange = (id: number, field: string, val: number) => {
    setGridData((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
    setHasChanges(true);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'code',
      'name',
      'category',
      'package_size',
      'cost_price',
      'sale_price',
      'mrp',
      'stock_qty',
      'reorder_level',
      'barcode',
      'hsn_code',
      'gst_percent',
    ];
    const sampleRows = [
      ['SERVO-4T-1L', 'Servo 4T Super 20W-40', '4T Engine Oil', '1 Litre', 300.0, 360.0, 385.0, 48, 12, '8901030001001', '2710', 18.0],
      ['MAK-2T-500ML', 'Mak 2T Plus Two-Stroke Oil', '2T Two-Stroke Oil', '500 ml', 110.0, 135.0, 145.0, 60, 20, '8901030001002', '2710', 18.0],
      ['CLEAR-DEF-20L', 'ClearBlue DEF / AdBlue Bucket', 'Diesel Exhaust Fluid', '20 Litre', 680.0, 880.0, 950.0, 25, 10, '8901030001003', '3102', 18.0],
      ['COOLANT-PREMIX-1L', 'Golden Cruiser Radiator Coolant', 'Coolant', '1 Litre', 165.0, 210.0, 230.0, 30, 10, '8901030001004', '3820', 18.0],
      ['GREASE-CHASSIS-1KG', 'Servo Chassis Grease MP', 'Grease', '1 Kg', 220.0, 280.0, 310.0, 15, 5, '8901030001005', '2710', 18.0],
    ];
    exportToCsv('NSAIPETROSOFT_Lube_Inventory_Template', headers, sampleRows);
    if (showToast) showToast('📄 CSV Template downloaded! Open in Excel, fill your items, and click Import CSV.');
  };

  const handleCsvFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csvText = event.target?.result as string;
      if (!csvText || !csvText.trim()) {
        if (showToast) showToast('❌ Selected CSV file is empty.');
        return;
      }

      setIsImporting(true);
      try {
        const res = await bulkImportLubesCsvApi({ csv_content: csvText });
        if (res.status === 'success') {
          if (res.products && res.products.length > 0) {
            erpStore.hydrateFromBackend({ products: res.products });
            setGridData(
              res.products.map((p: any) => ({
                id: p.id,
                code: p.code,
                name: p.name,
                sale_price: p.sale_price,
                cost_price: p.cost_price,
                current_stock_units: p.current_stock_units,
                reorder_level: p.reorder_level,
              }))
            );
          }
          if (showToast) {
            showToast(`✔ ${res.message} Permanently committed to PostgreSQL!`);
          }
          if (loadAllErpData) await loadAllErpData();
        } else {
          if (showToast) showToast(`⚠ Import response: ${res.message}`);
        }
      } catch (err: any) {
        if (showToast) showToast(`❌ Bulk CSV Import Error: ${err.message || 'Server rejected file'}`);
      } finally {
        setIsImporting(false);
        if (csvFileInputRef.current) {
          csvFileInputRef.current.value = '';
        }
      }
    };
    reader.onerror = () => {
      if (showToast) showToast('❌ Error reading file from local disk.');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleCommitAll = async () => {
    try {
      erpStore.bulkUpdateProducts(gridData);
      let failedCount = 0;
      for (const item of gridData) {
        try {
          await saveLubeProductApi({
            product_code: item.code,
            product_name: item.name,
            cost_price: item.cost_price,
            sale_price: item.sale_price,
            stock_qty: item.current_stock_units,
            reorder_level: item.reorder_level,
          });
        } catch {
          failedCount++;
        }
      }
      if (failedCount === 0) {
        if (showToast) showToast(`✔ Committed updates across ${gridData.length} products directly to PostgreSQL!`);
      } else {
        if (showToast) showToast(`⚠ Committed with ${failedCount} failures out of ${gridData.length} items. Check network.`);
      }
      setHasChanges(false);
      if (loadAllErpData) await loadAllErpData();
      onClose();
    } catch (err: any) {
      if (showToast) showToast(`❌ Error: ${err.message}`);
    }
  };

  const handleDeleteProduct = (id: number, name: string) => {
    const doDelete = async (pin?: string) => {
      try {
        await deleteLubeProductApi(id, pin);
        erpStore.deleteLubeProduct(id);
        setGridData((prev) => prev.filter((p) => p.id !== id));
        if (showToast) showToast(`✔ Product "${name}" deleted.`);
        if (loadAllErpData) await loadAllErpData();
      } catch (err: any) {
        if (showToast) showToast(`❌ Cannot delete product: ${err.message || 'Operation failed'}`);
      }
    };

    if (requestManagerAuthorization) {
      requestManagerAuthorization(`Delete Product "${name}"`, doDelete);
    } else {
      if (!window.confirm(`Delete product "${name}" from inventory master?`)) return;
      doDelete();
    }
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '840px', maxHeight: '90vh' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📝</span>
            <span>Bulk Product Spreadsheet Editor — Rapid Inline Stock & Price Update</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body">
          <input
            type="file"
            ref={csvFileInputRef}
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleCsvFileSelected}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
            <div>
              <span style={{ fontSize: '11.5px', color: '#555' }}>
                Edit inline or bulk import 20, 50, 100+ items directly via CSV into PostgreSQL.
              </span>
              {hasChanges && (
                <span style={{ marginLeft: '10px', fontSize: '11px', color: '#d35400', fontWeight: 700 }}>
                  ● Uncommitted Changes Pending
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className="win-btn-classic"
                onClick={handleDownloadTemplate}
                style={{ fontSize: '11px', padding: '3px 8px', fontWeight: 600 }}
                title="Download CSV format with standard column headers for Microsoft Excel"
              >
                <span>📄</span> Download CSV Template
              </button>
              <button
                type="button"
                className="win-btn-classic"
                onClick={() => csvFileInputRef.current?.click()}
                disabled={isImporting}
                style={{ fontSize: '11px', padding: '3px 10px', fontWeight: 700, background: '#e8f5e9', borderColor: '#81c784', color: '#1b5e20' }}
                title="Select and upload a CSV file to permanently commit 20-100+ items to PostgreSQL"
              >
                <span>📥</span> {isImporting ? 'Ingesting to PostgreSQL...' : 'Import CSV'}
              </button>
            </div>
          </div>

          <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '420px', overflowY: 'auto' }}>
            <table className="win-datagrid">
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>Code</th>
                  <th style={{ width: '38%' }}>Product Description</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Cost Price (₹)</th>
                  <th style={{ width: '14%', textAlign: 'right' }}>Sale Price (₹)</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Stock Units</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Reorder Lvl</th>
                  <th style={{ width: '6%', textAlign: 'center' }}>Del</th>
                </tr>
              </thead>
              <tbody>
                {gridData.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.code}</td>
                    <td style={{ color: '#0a246a', fontWeight: 600 }}>{row.name}</td>
                    <td>
                      <input
                        type="number"
                        step="0.5"
                        value={row.cost_price}
                        onChange={(e) => handleCellChange(row.id, 'cost_price', parseFloat(e.target.value) || 0)}
                        className="win-input text-right"
                        style={{ width: '100%', height: '22px', padding: '0 4px' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.5"
                        value={row.sale_price}
                        onChange={(e) => handleCellChange(row.id, 'sale_price', parseFloat(e.target.value) || 0)}
                        className="win-input text-right"
                        style={{ width: '100%', height: '22px', padding: '0 4px', fontWeight: 700 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={row.current_stock_units}
                        onChange={(e) => handleCellChange(row.id, 'current_stock_units', parseInt(e.target.value, 10) || 0)}
                        className="win-input text-right"
                        style={{ width: '100%', height: '22px', padding: '0 4px', fontWeight: 700, color: row.current_stock_units <= row.reorder_level ? '#c0392b' : '#27ae60' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={row.reorder_level}
                        onChange={(e) => handleCellChange(row.id, 'reorder_level', parseInt(e.target.value, 10) || 0)}
                        className="win-input text-right"
                        style={{ width: '100%', height: '22px', padding: '0 4px' }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="win-btn-classic"
                        style={{ height: '18px', padding: '0 4px', fontSize: '10px', color: '#c0392b', fontWeight: 700 }}
                        onClick={() => handleDeleteProduct(row.id, row.name)}
                        title="Delete product from master list"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="win-actions-row" style={{ marginTop: '14px' }}>
            <button type="button" className="win-btn-classic" onClick={onClose}>Discard</button>
            <button
              type="button"
              className="win-btn-classic win-btn-primary"
              onClick={handleCommitAll}
              style={{ fontWeight: 700 }}
            >
              <span>💾</span>
              <span>Commit All Changes</span>
            </button>
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
