/**
 * NSAIPETROSOFT Forecourt Offline Resilience Engine
 * Buffers credit slips, shift readings, and sales when cellular/WiFi connectivity drops.
 * Automatically synchronizes with Railway PostgreSQL backend upon network restoration.
 */

const OFFLINE_QUEUE_KEY = 'nsai_forecourt_offline_queue_v1';

export interface QueuedOfflineRecord {
  id: string;
  type: 'CREDIT_SALE' | 'SHIFT_METERS' | 'DIP_ENTRY' | 'LUBE_SALE';
  payload: any;
  created_at: string;
  retry_count: number;
}

export function getOfflineQueue(): QueuedOfflineRecord[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getOfflineQueueCount(): number {
  return getOfflineQueue().length;
}

export function enqueueOfflineRecord(
  type: 'CREDIT_SALE' | 'SHIFT_METERS' | 'DIP_ENTRY' | 'LUBE_SALE',
  payload: any
): QueuedOfflineRecord {
  const queue = getOfflineQueue();
  const record: QueuedOfflineRecord = {
    id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
  };
  queue.push(record);
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('Failed to buffer offline record to localStorage:', err);
  }
  return record;
}

export function removeOfflineRecord(id: string): void {
  const queue = getOfflineQueue().filter((r) => r.id !== id);
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('Failed to update offline queue:', err);
  }
}

/**
 * Replays all queued transactions to Railway backend when online.
 */
export async function syncOfflineQueue(
  onSynced?: (item: QueuedOfflineRecord, res: any) => void,
  onError?: (item: QueuedOfflineRecord, err: any) => void
): Promise<{ total: number; synced: number; failed: number }> {
  if (!navigator.onLine) {
    return { total: 0, synced: 0, failed: 0 };
  }

  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { total: 0, synced: 0, failed: 0 };
  }

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
      // If we encounter a critical error on one, proceed or stop
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
      (item) => {
        console.log(`[Offline Sync] Replayed ${item.type} (${item.id}) to Railway backend.`);
      },
      (item, err) => {
        console.error(`[Offline Sync Error] Failed to replay ${item.type}:`, err);
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
