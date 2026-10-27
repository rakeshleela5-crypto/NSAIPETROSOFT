import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateFolderCategory,
  validateMimeType,
  uploadFileToR2,
  getPresignedViewUrl,
  deleteR2Object,
  isOfflineMediaKey,
} from './r2Uploader';
import {
  substituteOfflineKeysInPayload,
  getPendingOfflineMedia,
  offlineMediaDb,
} from './offlineMediaQueue';

describe('R2 Uploader & Storage Client Suite', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });
    await offlineMediaDb.offline_media.clear();
  });

  describe('Validation Rules', () => {
    it('validates allowed folder categories strictly', () => {
      expect(validateFolderCategory('shift-handovers')).toBe(true);
      expect(validateFolderCategory('tank-dips')).toBe(true);
      expect(validateFolderCategory('fleet-kyc')).toBe(true);
      expect(validateFolderCategory('invoices')).toBe(true);
      expect(validateFolderCategory('expense-vouchers')).toBe(true);

      expect(validateFolderCategory('system-root')).toBe(false);
      expect(validateFolderCategory('../secrets')).toBe(false);
      expect(validateFolderCategory('')).toBe(false);
    });

    it('validates permitted MIME types for forecourt documents', () => {
      expect(validateMimeType('image/jpeg')).toBe(true);
      expect(validateMimeType('image/png')).toBe(true);
      expect(validateMimeType('image/webp')).toBe(true);
      expect(validateMimeType('application/pdf')).toBe(true);

      expect(validateMimeType('application/x-msdownload')).toBe(false);
      expect(validateMimeType('text/x-shellscript')).toBe(false);
      expect(validateMimeType('application/javascript')).toBe(false);
    });

    it('identifies offline media keys accurately', () => {
      expect(isOfflineMediaKey('offline://media_123456')).toBe(true);
      expect(isOfflineMediaKey('shift-handovers/2026-10-27/img.jpg')).toBe(false);
      expect(isOfflineMediaKey(null)).toBe(false);
      expect(isOfflineMediaKey(undefined)).toBe(false);
    });
  });

  describe('Direct Browser-to-R2 Upload', () => {
    it('rejects disallowed folder category before network call', async () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      await expect(
        uploadFileToR2(file, 'unauthorized-folder' as any)
      ).rejects.toThrow(/Invalid storage folder/);
    });

    it('rejects disallowed MIME type before network call', async () => {
      const file = new File(['binary'], 'virus.exe', { type: 'application/x-msdownload' });
      await expect(
        uploadFileToR2(file, 'shift-handovers')
      ).rejects.toThrow(/File format 'application\/x-msdownload' is not allowed/);
    });

    it('requests presigned PUT URL and uploads raw bytes via XHR', async () => {
      const mockKey = 'shift-handovers/2026-10-27/abc_meter.jpg';
      const mockUploadUrl = 'https://nsaipetrosoft-storage.r2.cloudflarestorage.com/mock-upload';

      // Mock fetch for presigned URL endpoint
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          upload_url: mockUploadUrl,
          object_key: mockKey,
          expires_in: 600,
          folder: 'shift-handovers',
          content_type: 'image/jpeg',
        }),
      } as any);

      let lastXHRInstance: any = null;

      class MockXHR {
        open = vi.fn();
        setRequestHeader = vi.fn();
        upload = { onprogress: null as any };
        status = 200;
        statusText = 'OK';
        onload: any = null;
        onerror: any = null;
        send = vi.fn(() => {
          setTimeout(() => {
            if (this.upload.onprogress) {
              this.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
            }
            if (this.onload) this.onload();
          }, 0);
        });

        constructor() {
          lastXHRInstance = this;
        }
      }

      vi.stubGlobal('XMLHttpRequest', MockXHR);

      const progressValues: number[] = [];
      const file = new File(['image-bytes'], 'meter.jpg', { type: 'image/jpeg' });

      const result = await uploadFileToR2(file, 'shift-handovers', (p) => progressValues.push(p));

      expect(result.object_key).toBe(mockKey);
      expect(result.upload_url).toBe(mockUploadUrl);
      expect(String(result)).toBe(mockKey);
      expect(lastXHRInstance.open).toHaveBeenCalledWith('PUT', mockUploadUrl, true);
      expect(lastXHRInstance.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(progressValues).toContain(100);
    });

    it('automatically queues file into Dexie IndexedDB when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });

      const file = new File(['offline-photo-bytes'], 'closing_nozzle_1.jpg', { type: 'image/jpeg' });
      const result = await uploadFileToR2(file, 'shift-handovers');

      expect(result.object_key).toMatch(/^offline:\/\/media_/);
      expect(isOfflineMediaKey(result.object_key)).toBe(true);

      const pending = await getPendingOfflineMedia();
      expect(pending.length).toBe(1);
      expect(pending[0].folder).toBe('shift-handovers');
      expect(pending[0].filename).toBe('closing_nozzle_1.jpg');
    });
  });

  describe('Secure Private Viewing & Deletion', () => {
    it('requests presigned GET URL for viewing', async () => {
      const mockViewUrl = 'https://storage.nsaipetrosoft.com/view-signed';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          view_url: mockViewUrl,
          object_key: 'invoices/2026-10-27/inv.pdf',
          expires_in: 3600,
        }),
      } as any);

      const url = await getPresignedViewUrl('invoices/2026-10-27/inv.pdf');
      expect(url).toBe(mockViewUrl);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/storage/presigned-view?object_key=invoices%2F2026-10-27%2Finv.pdf')
      );
    });

    it('calls delete endpoint on object deletion', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as any);

      const success = await deleteR2Object('tank-dips/2026-10-27/receipt.jpg');
      expect(success).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/storage/delete?object_key=tank-dips%2F2026-10-27%2Freceipt.jpg'),
        { method: 'DELETE' }
      );
    });

    it('substitutes offline keys in nested payloads', () => {
      const keyMap = {
        'offline://media_1': 'shift-handovers/2026-10-27/photo1.jpg',
        'offline://media_2': 'tank-dips/2026-10-27/dip2.jpg',
      };

      const payload = {
        shift_id: 101,
        closing_photo_key: 'offline://media_1',
        meters: [
          { nozzle_id: 1, photo: 'offline://media_1' },
          { nozzle_id: 2, photo: 'offline://media_2' },
        ],
        notes: 'Handover complete',
      };

      const substituted = substituteOfflineKeysInPayload(payload, keyMap);
      expect(substituted.closing_photo_key).toBe('shift-handovers/2026-10-27/photo1.jpg');
      expect(substituted.meters[0].photo).toBe('shift-handovers/2026-10-27/photo1.jpg');
      expect(substituted.meters[1].photo).toBe('tank-dips/2026-10-27/dip2.jpg');
      expect(substituted.notes).toBe('Handover complete');
    });
  });
});
