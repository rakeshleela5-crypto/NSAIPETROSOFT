/**
 * NSAIPETROSOFT Forecourt Cloud-Direct Engine
 * Pure in-memory session resilience: ZERO localStorage memory footprint.
 * All state and operations persist directly in Railway Cloud PostgreSQL via FastAPI.
 */

export interface QueuedOfflineRecord {
  id: string;
  type: 'CREDIT_SALE' | 'SHIFT_METERS' | 'DIP_ENTRY' | 'LUBE_SALE';
  payload: any;
  created_at: string;
  retry_count: number;
}

// In-memory runtime buffer only (ZERO localStorage usage)
let inMemoryQueue: QueuedOfflineRecord[] = [];

// Clean up any stale legacy offline storage keys from earlier versions
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('nsai_forecourt_offline_queue_v1');
    localStorage.removeItem('nsai_offline_queue');
  }
} catch {}

export function getOfflineQueue(): QueuedOfflineRecord[] {
  return inMemoryQueue;
}

export function getOfflineQueueCount(): number {
  return inMemoryQueue.length;
}

export function enqueueOfflineRecord(
  type: 'CREDIT_SALE' | 'SHIFT_METERS' | 'DIP_ENTRY' | 'LUBE_SALE',
  payload: any
): QueuedOfflineRecord {
  const record: QueuedOfflineRecord = {
    id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
  };
  inMemoryQueue.push(record);
  return record;
}

export function removeOfflineRecord(id: string): void {
  inMemoryQueue = inMemoryQueue.filter((r) => r.id !== id);
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

  // Dynamically import client functions to avoid circular deps
  const client = await import('../api/client');

  for (const record of queue) {
    try {
      let res: any;
      if (record.type === 'CREDIT_SALE') {
        res = await client.createCreditSale(record.payload);
      } else if (record.type === 'SHIFT_METERS') {
        res = await client.saveShiftMeters(record.payload);
      } else if (record.type === 'DIP_ENTRY') {
        res = await client.createTankDip(record.payload);
      } else if (record.type === 'LUBE_SALE') {
        res = await client.recordLubeSaleApi(record.payload);
      }

      removeOfflineRecord(record.id);
      synced++;
      if (onSynced) onSynced(record, res);
    } catch (err) {
      failed++;
      record.retry_count = (record.retry_count || 0) + 1;
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
