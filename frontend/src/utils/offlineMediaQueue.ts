/**
 * Dexie.js Offline Media Queue for NSAiPetroSoft Forecourt Operations
 * Caches nozzle meter closing photos, tank dip receipts, and indent slips in IndexedDB
 * when attendant is offline during highway outages.
 * Replays uploads automatically when internet connectivity returns.
 */

import Dexie, { type Table } from 'dexie';

export interface OfflineMediaRecord {
  id: string;
  folder: string;
  filename: string;
  mime_type: string;
  blob: Blob;
  created_at: string;
  status: 'pending' | 'uploading' | 'synced' | 'failed';
  retry_count: number;
  object_key?: string;
  error?: string;
}

export class ForecourtOfflineDatabase extends Dexie {
  offline_media!: Table<OfflineMediaRecord, string>;

  constructor() {
    super('nsaipetrosoft_forecourt_media_vault');
    this.version(1).stores({
      offline_media: 'id, folder, status, created_at',
    });
  }
}

export const offlineMediaDb = new ForecourtOfflineDatabase();

/**
 * Enqueues a captured Blob (e.g., nozzle photo or dip receipt) into Dexie IndexedDB.
 */
export async function enqueueOfflineMedia(
  blob: Blob,
  filename: string,
  folder: string,
  mimeType: string = 'image/jpeg'
): Promise<OfflineMediaRecord> {
  const id = `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const record: OfflineMediaRecord = {
    id,
    folder,
    filename,
    mime_type: mimeType,
    blob,
    created_at: new Date().toISOString(),
    status: 'pending',
    retry_count: 0,
  };

  await offlineMediaDb.offline_media.put(record);
  return record;
}

/**
 * Retrieves all offline media items that are pending upload.
 */
export async function getPendingOfflineMedia(): Promise<OfflineMediaRecord[]> {
  try {
    return await offlineMediaDb.offline_media
      .where('status')
      .anyOf(['pending', 'failed'])
      .toArray();
  } catch (err) {
    console.warn('[DexieMedia] Error fetching pending media:', err);
    return [];
  }
}

/**
 * Retrieves a single offline media item by ID.
 */
export async function getOfflineMediaById(
  id: string
): Promise<OfflineMediaRecord | undefined> {
  const cleanId = id.replace(/^offline:\/\//, '');
  return await offlineMediaDb.offline_media.get(cleanId);
}

/**
 * Deletes an offline media record from IndexedDB once synced or voided.
 */
export async function deleteOfflineMedia(id: string): Promise<void> {
  const cleanId = id.replace(/^offline:\/\//, '');
  await offlineMediaDb.offline_media.delete(cleanId);
}

/**
 * Returns total count of pending offline photos/media.
 */
export async function getPendingMediaCount(): Promise<number> {
  try {
    return await offlineMediaDb.offline_media
      .where('status')
      .anyOf(['pending', 'failed'])
      .count();
  } catch {
    return 0;
  }
}

/**
 * Scans an arbitrary JavaScript object or array and substitutes any `offline://<id>`
 * references with the newly retrieved Cloudflare R2 object_key.
 */
export function substituteOfflineKeysInPayload<T>(
  payload: T,
  keyMap: Record<string, string>
): T {
  if (!payload || typeof payload !== 'object') {
    if (typeof payload === 'string' && keyMap[payload]) {
      return keyMap[payload] as unknown as T;
    }
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) =>
      substituteOfflineKeysInPayload(item, keyMap)
    ) as unknown as T;
  }

  const updated: any = { ...payload };
  for (const [k, v] of Object.entries(updated)) {
    if (typeof v === 'string' && keyMap[v]) {
      updated[k] = keyMap[v];
    } else if (typeof v === 'object' && v !== null) {
      updated[k] = substituteOfflineKeysInPayload(v, keyMap);
    }
  }
  return updated;
}

/**
 * Flushes all pending Dexie media files to Cloudflare R2 via presigned URLs.
 * Returns a dictionary mapping `offline://<id>` to the canonical R2 `object_key`.
 */
export async function syncPendingMediaToR2(
  onMediaSynced?: (item: OfflineMediaRecord, objectKey: string) => void
): Promise<{ keyMap: Record<string, string>; synced: number; failed: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { keyMap: {}, synced: 0, failed: 0 };
  }

  const pending = await getPendingOfflineMedia();
  const keyMap: Record<string, string> = {};
  let synced = 0;
  let failed = 0;

  if (pending.length === 0) {
    return { keyMap, synced, failed };
  }

  // Import dynamically to avoid circular references
  const { uploadFileToR2 } = await import('./r2Uploader');

  for (const item of pending) {
    try {
      await offlineMediaDb.offline_media.update(item.id, { status: 'uploading' });

      // Direct client upload via presigned URL
      const uploadRes = await uploadFileToR2(
        item.blob,
        item.folder as any,
        undefined,
        item.filename
      );

      const objectKey = uploadRes.object_key;
      keyMap[`offline://${item.id}`] = objectKey;
      keyMap[item.id] = objectKey;

      await offlineMediaDb.offline_media.update(item.id, {
        status: 'synced',
        object_key: objectKey,
      });

      synced++;
      if (onMediaSynced) onMediaSynced(item, objectKey);
    } catch (err: any) {
      failed++;
      console.error(`[DexieMedia] Failed to upload offline media ${item.id}:`, err);
      await offlineMediaDb.offline_media.update(item.id, {
        status: 'failed',
        retry_count: item.retry_count + 1,
        error: String(err?.message || err),
      });
    }
  }

  return { keyMap, synced, failed };
}
