/**
 * NSAIPETROSOFT Forecourt Cloud-Direct Engine with Native IndexedDB Offline Durability
 * Pure IndexedDB persistence: ZERO localStorage memory footprint.
 * Survives highway power cuts, F5 reloads, and offline network router drops.
 * All state and operations persist directly in Railway Cloud PostgreSQL via FastAPI when connected.
 */

export interface QueuedOfflineRecord {
  id: string;
  type:
    | 'CREDIT_SALE'
    | 'SHIFT_METERS'
    | 'DIP_ENTRY'
    | 'LUBE_SALE'
    | 'EXPENSE'
    | 'PAYMENT_RECEIPT'
    | 'CONTRA_TRANSFER'
    | 'PURCHASE_DECANTING'
    | 'SHIFT_SETTLEMENT'
    | 'CARD_SETTLEMENT'
    | 'RETAIL_CASH_BILL';
  payload: any;
  created_at: string;
  retry_count: number;
}

const DB_NAME = 'nsaipetrosoft_offline_vault';
const STORE_NAME = 'offline_queue';
const DB_VERSION = 1;

// In-memory runtime mirror (backed by IndexedDB, ZERO localStorage usage)
let inMemoryQueue: QueuedOfflineRecord[] = [];

// Clean up any stale legacy offline storage keys from earlier versions
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('nsai_forecourt_offline_queue_v1');
    localStorage.removeItem('nsai_offline_queue');
  }
} catch {}

function getIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result as IDBDatabase;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// Hydrate in-memory queue from IndexedDB on startup
if (typeof window !== 'undefined') {
  getIDB().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        if (Array.isArray(req.result) && req.result.length > 0) {
          const existingIds = new Set(inMemoryQueue.map((r) => r.id));
          req.result.forEach((rec: QueuedOfflineRecord) => {
            if (!existingIds.has(rec.id)) {
              inMemoryQueue.push(rec);
            }
          });
        }
      };
    } catch (err) {
      console.warn('[OfflineVault] Error loading persisted offline transactions:', err);
    }
  });
}

async function persistRecordToIDB(record: QueuedOfflineRecord): Promise<void> {
  const db = await getIDB();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
  } catch (err) {
    console.warn('[OfflineVault] Failed to persist record:', err);
  }
}

async function deleteRecordFromIDB(id: string): Promise<void> {
  const db = await getIDB();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
  } catch (err) {
    console.warn('[OfflineVault] Failed to delete record:', err);
  }
}

export function getOfflineQueue(): QueuedOfflineRecord[] {
  return inMemoryQueue;
}

export function getOfflineQueueCount(): number {
  return inMemoryQueue.length;
}

export function enqueueOfflineRecord(
  type: QueuedOfflineRecord['type'],
  payload: any
): QueuedOfflineRecord {
  const record: QueuedOfflineRecord = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
  };
  inMemoryQueue.push(record);
  persistRecordToIDB(record);
  return record;
}

export function removeOfflineRecord(id: string): void {
  inMemoryQueue = inMemoryQueue.filter((r) => r.id !== id);
  deleteRecordFromIDB(id);
}

/**
 * Replays queued transactions directly to Railway PostgreSQL backend when online.
 */
export async function syncOfflineQueue(
  onSynced?: (item: QueuedOfflineRecord, res: any) => void,
  onError?: (item: QueuedOfflineRecord, err: any) => void
): Promise<{ total: number; synced: number; failed: number }> {
  if (!navigator.onLine) {
    return { total: 0, synced: 0, failed: 0 };
  }

  if (inMemoryQueue.length === 0) {
    return { total: 0, synced: 0, failed: 0 };
  }

  const queue = [...inMemoryQueue];
  let synced = 0;
  let failed = 0;

  // 1. Sync any pending offline Blobs/photos to Cloudflare R2 first
  const { syncPendingMediaToR2, substituteOfflineKeysInPayload } =
    await import('./offlineMediaQueue');
  const { keyMap } = await syncPendingMediaToR2();
  const client = await import('../api/client');

  for (const record of queue) {
    try {
      // Substitute any offline:// media keys with genuine Cloudflare R2 object_keys
      const payload = Object.keys(keyMap).length > 0
        ? substituteOfflineKeysInPayload(record.payload, keyMap)
        : record.payload;

      let res: any;
      if (record.type === 'CREDIT_SALE') {
        res = await client.createCreditSale(payload);
      } else if (record.type === 'SHIFT_METERS') {
        res = await client.saveShiftMeters(payload);
      } else if (record.type === 'DIP_ENTRY') {
        res = await client.createTankDip(payload);
      } else if (record.type === 'LUBE_SALE') {
        res = await client.recordLubeSaleApi(payload);
      } else if (record.type === 'EXPENSE') {
        res = await client.createExpense(payload);
      } else if (record.type === 'PAYMENT_RECEIPT') {
        res = await client.createPaymentReceipt(payload);
      } else if (record.type === 'CONTRA_TRANSFER') {
        res = await client.createTransfer(payload);
      } else if (record.type === 'PURCHASE_DECANTING') {
        res = await client.createPurchase(payload);
      } else if (record.type === 'SHIFT_SETTLEMENT') {
        res = await client.saveShiftSettlement(payload);
      } else if (record.type === 'CARD_SETTLEMENT') {
        res = await client.createCardSettlement(payload);
      } else if (record.type === 'RETAIL_CASH_BILL') {
        res = await client.saveCashBillApi(payload);
      }

      removeOfflineRecord(record.id);
      synced++;
      if (onSynced) onSynced(record, res);
    } catch (err) {
      failed++;
      record.retry_count = (record.retry_count || 0) + 1;
      persistRecordToIDB(record);
      if (onError) onError(record, err);
    }
  }

  return { total: queue.length, synced, failed };
}

/**
 * Subscribes to online/offline network events.
 */
export function initOfflineNetworkListener(
  onStatusChange?: (isOnline: boolean, queuedCount: number) => void
): () => void {
  const handleOnline = () => {
    syncOfflineQueue(
      (_item) => {
        // Silently replayed to cloud PostgreSQL
      },
      (item, err) => {
        console.error(`[Cloud Sync Error] Failed to replay ${item.type}:`, err);
      }
    ).then(() => {
      if (onStatusChange) onStatusChange(true, getOfflineQueueCount());
    });
  };

  const handleOffline = () => {
    if (onStatusChange) onStatusChange(false, getOfflineQueueCount());
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
