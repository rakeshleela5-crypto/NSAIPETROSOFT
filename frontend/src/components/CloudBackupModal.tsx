import React from 'react';
import type { BackupItem, BackupStatusResponse } from '../models';

interface CloudBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  backupStatus: BackupStatusResponse | null;
  backupsList: BackupItem[];
  isBackingUp: boolean;
  onTriggerBackup: () => void;
  onRefreshList: () => void;
  getMasterExcelDownloadUrl: () => string;
  getBackupDownloadUrl: (filename: string) => string;
}

export const CloudBackupModal: React.FC<CloudBackupModalProps> = ({
  isOpen,
  onClose,
  backupStatus,
  backupsList,
  isBackingUp,
  onTriggerBackup,
  onRefreshList,
  getMasterExcelDownloadUrl,
  getBackupDownloadUrl,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '880px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="win-dialog-titlebar" style={{ background: 'linear-gradient(180deg, #f39c12 0%, #d35400 100%)', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>☁️</span>
            <span style={{ fontWeight: 700 }}>Cloudflare R2 — Disaster Recovery & Automated Database Backups</span>
          </div>
          <button className="win-btn" style={{ color: '#fff' }} onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Top Banner Status */}
          <div style={{ border: '1px solid #7f9db9', background: '#fdfefe', padding: '12px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '18px' }}>
                  {backupStatus?.r2_connection.connected ? '🟢' : (backupStatus?.r2_connection.configured ? '🟡' : '🔵')}
                </span>
                <strong style={{ fontSize: '13px' }}>
                  {backupStatus?.r2_connection.connected
                    ? 'Cloudflare R2 Bucket Connected & Ready'
                    : (backupStatus?.r2_connection.configured
                        ? 'Cloudflare R2 Configured (Checking Bucket)'
                        : 'Local Persistent Backup Ready (Cloud Sync Ready)')}
                </strong>
              </div>
              <div style={{ fontSize: '11px', color: '#555', lineHeight: '1.6' }}>
                <div><strong>Storage Bucket:</strong> {backupStatus?.r2_connection.bucket || 'nsaipetrosoft-backups'}</div>
                <div><strong>Zero Egress Guarantee:</strong> Cloudflare R2 charges ₹0.00 for backup downloads.</div>
                <div><strong>Total Backups Stored:</strong> {backupsList.length} database snapshot(s) available</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
              <button
                className="win-btn-classic win-btn-primary"
                style={{ minHeight: '36px', fontSize: '12px', fontWeight: 700, background: 'linear-gradient(180deg, #27ae60 0%, #1e8449 100%)', color: '#fff', border: '1px solid #145a32' }}
                onClick={onTriggerBackup}
                disabled={isBackingUp}
              >
                {isBackingUp ? '⏳ Generating Compressed Snapshot...' : '📦 Take Instant Cloud Backup (.json.gz)'}
              </button>

              <a
                href={getMasterExcelDownloadUrl()}
                target="_blank"
                rel="noreferrer"
                className="win-btn-classic"
                style={{
                  minHeight: '36px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: 'linear-gradient(180deg, #1d6f42 0%, #155724 100%)',
                  color: '#fff',
                  border: '1px solid #0e3d19',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
                title="Download complete multi-sheet Excel workbook formatted for Accountants & CAs"
              >
                📊 Download Master Excel Workbook (.xlsx)
              </a>

              <div style={{ fontSize: '10px', color: '#777', textAlign: 'center' }}>
                Multi-tab Excel for CAs & Accountants | Daily Cloudflare R2 Cloud Archive
              </div>
            </div>
          </div>

          {/* Backups List Table */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Available Database Archive Snapshots (.json.gz)</span>
              <button className="win-btn-classic" style={{ fontSize: '11px', minHeight: '24px', padding: '2px 8px' }} onClick={onRefreshList}>🔄 Refresh List</button>
            </div>
            <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '200px', overflowY: 'auto' }}>
              <table className="win-datagrid">
                <thead>
                  <tr>
                    <th>Archive Filename</th>
                    <th>Date & Time (UTC)</th>
                    <th className="text-right">Size</th>
                    <th>Storage Tier</th>
                    <th style={{ width: '100px', textAlign: 'center' }}>Download</th>
                  </tr>
                </thead>
                <tbody>
                  {backupsList.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: '#888' }}>
                        No backup archives found yet. Click "Take Instant PostgreSQL Backup" above to generate your first snapshot!
                      </td>
                    </tr>
                  ) : (
                    backupsList.map((b, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{b.filename}</td>
                        <td>{new Date(b.last_modified).toLocaleString()}</td>
                        <td className="text-right">{b.size_kb} KB</td>
                        <td>
                          <span style={{
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontSize: '10px',
                            fontWeight: 700,
                            background: b.storage === 'cloudflare_r2' ? '#e8f8f5' : '#fef9e7',
                            color: b.storage === 'cloudflare_r2' ? '#117a65' : '#b7950b',
                            border: `1px solid ${b.storage === 'cloudflare_r2' ? '#a3e4d7' : '#f9e79f'}`
                          }}>
                            {b.storage === 'cloudflare_r2' ? '☁️ Cloudflare R2' : '💾 Local Disk'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <a
                            href={getBackupDownloadUrl(b.filename)}
                            target="_blank"
                            rel="noreferrer"
                            download={b.filename}
                            className="win-btn-classic"
                            style={{
                              display: 'inline-block',
                              textDecoration: 'none',
                              lineHeight: '18px',
                              height: '18px',
                              padding: '0 6px',
                              fontSize: '10px',
                              fontWeight: 600
                            }}
                          >
                            ⬇️ Download
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cloudflare R2 Connection Details & Help Guide */}
          <div style={{ border: '1px solid #d4d0c8', background: '#ece9d8', padding: '10px', fontSize: '11px', lineHeight: '1.6' }}>
            <div style={{ fontWeight: 700, color: '#333', marginBottom: '4px' }}>
              🔑 Cloudflare R2 Setup Guide for Railway:
            </div>
            <div style={{ color: '#444' }}>
              To link your live Cloudflare R2 bucket with zero egress fees, add these 4 variables in your <strong>Railway Project Settings → Variables</strong>:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginTop: '6px', fontFamily: 'monospace', fontSize: '11px' }}>
              <div style={{ background: '#fff', padding: '4px 6px', border: '1px solid #ccc' }}>R2_ACCOUNT_ID</div>
              <div style={{ background: '#fff', padding: '4px 6px', border: '1px solid #ccc' }}>R2_BUCKET_NAME = nsaipetrosoft-backups</div>
              <div style={{ background: '#fff', padding: '4px 6px', border: '1px solid #ccc' }}>R2_ACCESS_KEY_ID</div>
              <div style={{ background: '#fff', padding: '4px 6px', border: '1px solid #ccc' }}>R2_SECRET_ACCESS_KEY</div>
            </div>
            <div style={{ marginTop: '6px', color: '#666' }}>
              <em>Note: Even without R2 credentials entered, backups are safely generated, compressed, and downloadable immediately from the server!</em>
            </div>
          </div>
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit | 100% Zero Bandwidth Fees</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
