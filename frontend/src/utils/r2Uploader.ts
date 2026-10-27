/**
 * Cloudflare R2 Client Upload Engine for NSAiPetroSoft
 * Direct Browser-to-R2 zero-egress file uploader using S3v4 Presigned PUT URLs.
 * Saves Railway memory and RAM by avoiding proxying multipart uploads through the backend.
 */

import { API_BASE_URL } from '../api/client';
import { enqueueOfflineMedia } from './offlineMediaQueue';

export type FolderCategory =
  | 'shift-handovers'
  | 'tank-dips'
  | 'fleet-kyc'
  | 'invoices'
  | 'expense-vouchers';

export type AllowedMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'application/pdf';

export const ALLOWED_FOLDERS: readonly FolderCategory[] = [
  'shift-handovers',
  'tank-dips',
  'fleet-kyc',
  'invoices',
  'expense-vouchers',
] as const;

export const ALLOWED_MIME_TYPES: readonly AllowedMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export interface R2UploadResult {
  object_key: string;
  upload_url: string;
  toString(): string;
}

export interface PresignedUploadApiResponse {
  upload_url: string;
  object_key: string;
  expires_in: number;
  folder: string;
  content_type: string;
}

export interface PresignedViewApiResponse {
  view_url: string;
  object_key: string;
  expires_in: number;
}

/**
 * Validates that the requested folder category is recognized.
 */
export function validateFolderCategory(folder: string): folder is FolderCategory {
  return (ALLOWED_FOLDERS as readonly string[]).includes(folder);
}

/**
 * Validates that the requested file MIME type is permitted.
 */
export function validateMimeType(mime: string): mime is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}

/**
 * Uploads a file (or Blob) directly to Cloudflare R2 via an S3v4 presigned PUT URL.
 * 
 * 1. Requests a presigned PUT URL from FastAPI (/api/v1/storage/presigned-upload).
 * 2. Directly streams raw binary data from the browser to Cloudflare R2 via XMLHttpRequest with progress tracking.
 * 3. Returns the unique object_key to be attached to form submissions.
 * 
 * Offline Behavior:
 * If the device has no internet connection (navigator.onLine === false),
 * this function automatically enqueues the Blob into Dexie.js IndexedDB and returns
 * a temporary offline reference `offline://<id>`.
 */
export async function uploadFileToR2(
  file: File | Blob,
  folderCategory: FolderCategory,
  onProgress?: (percent: number) => void,
  customFilename?: string
): Promise<R2UploadResult> {
  const filename =
    customFilename ||
    (file instanceof File ? file.name : `capture_${Date.now()}.jpg`);

  const rawMime = file.type || 'image/jpeg';
  const contentType = rawMime.toLowerCase();

  // Validate inputs
  if (!validateFolderCategory(folderCategory)) {
    throw new Error(
      `Invalid storage folder '${folderCategory}'. Allowed: ${ALLOWED_FOLDERS.join(', ')}`
    );
  }

  if (!validateMimeType(contentType)) {
    throw new Error(
      `File format '${contentType}' is not allowed. Supported formats: JPEG, PNG, WebP, PDF`
    );
  }

  // Offline queue fallback
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const offlineItem = await enqueueOfflineMedia(
      file,
      filename,
      folderCategory,
      contentType
    );
    const offlineKey = `offline://${offlineItem.id}`;
    if (onProgress) onProgress(100);

    const result: R2UploadResult = {
      object_key: offlineKey,
      upload_url: '',
      toString() {
        return this.object_key;
      },
    };
    return result;
  }

  // 1. Obtain presigned PUT URL from FastAPI backend
  const presignResponse = await fetch(
    `${API_BASE_URL}/api/v1/storage/presigned-upload`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename,
        content_type: contentType,
        folder: folderCategory,
        expires_in: 600, // 10 minutes
      }),
    }
  );

  if (!presignResponse.ok) {
    const errData = await presignResponse.json().catch(() => ({}));
    throw new Error(
      errData.detail ||
        `Failed to request presigned upload URL (Status: ${presignResponse.status})`
    );
  }

  const { upload_url, object_key }: PresignedUploadApiResponse =
    await presignResponse.json();

  // 2. Upload raw binary directly to Cloudflare R2 via PUT
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', upload_url, true);
    xhr.setRequestHeader('Content-Type', contentType);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve();
      } else {
        reject(
          new Error(
            `Direct R2 upload failed with HTTP status ${xhr.status}: ${xhr.statusText}`
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during direct Cloudflare R2 upload.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Direct Cloudflare R2 upload timed out.'));
    };

    xhr.send(file);
  });

  const result: R2UploadResult = {
    object_key,
    upload_url,
    toString() {
      return this.object_key;
    },
  };

  return result;
}

/**
 * Retrieves a temporary presigned S3v4 GET URL for secure, private document viewing.
 * @param objectKey The R2 object key stored in the database (e.g. shift-handovers/2026-10-27/abc_meter.jpg)
 * @param expiresIn Expiration in seconds (default: 3600 / 1 hour)
 */
export async function getPresignedViewUrl(
  objectKey: string,
  expiresIn: number = 3600
): Promise<string> {
  if (!objectKey) throw new Error('Object key is required for presigned view.');

  // If the object is still in offline queue
  if (objectKey.startsWith('offline://')) {
    throw new Error(
      'Document is queued offline in IndexedDB and has not yet synced to Cloudflare R2.'
    );
  }

  const res = await fetch(
    `${API_BASE_URL}/api/v1/storage/presigned-view?object_key=${encodeURIComponent(
      objectKey
    )}&expires_in=${expiresIn}`
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch signed view URL (${res.status})`);
  }

  const data: PresignedViewApiResponse = await res.json();
  return data.view_url;
}

/**
 * Requests deletion of an object from Cloudflare R2.
 */
export async function deleteR2Object(objectKey: string): Promise<boolean> {
  if (!objectKey || objectKey.startsWith('offline://')) return true;

  const res = await fetch(
    `${API_BASE_URL}/api/v1/storage/delete?object_key=${encodeURIComponent(objectKey)}`,
    { method: 'DELETE' }
  );

  return res.ok;
}

/**
 * Checks whether an object_key represents an offline pending blob.
 */
export function isOfflineMediaKey(key?: string | null): boolean {
  return typeof key === 'string' && key.startsWith('offline://');
}
