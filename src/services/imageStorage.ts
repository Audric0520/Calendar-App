import { CalendarEvent } from '../types/calendar';
import {
  dataUrlToImageBlob,
  extractExtensionFromStoragePath,
} from '../utils/imageHelper';
import { supabase } from './supabase';

export const EVENT_IMAGES_BUCKET = 'event-images';

/** Signed URL lifetime requested from Supabase Storage (~1 hour). */
export const SIGNED_URL_TTL_SECONDS = 3600;

/** Proactively refresh signed URLs 5 minutes before they expire. */
export const SIGNED_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface CachedSignedUrl {
  signedUrl: string;
  expiresAt: number;
}

const signedUrlCache = new Map<string, CachedSignedUrl>();
const inFlightSignedUrls = new Map<string, Promise<string | null>>();
const signedUrlListeners = new Set<() => void>();

function notifySignedUrlListeners(): void {
  for (const listener of signedUrlListeners) {
    try {
      listener();
    } catch {
      // Ignore listener errors
    }
  }
}

export function subscribeSignedUrls(listener: () => void): () => void {
  signedUrlListeners.add(listener);
  return () => {
    signedUrlListeners.delete(listener);
  };
}

export function getCachedSignedUrlSnapshot(): Record<string, string> {
  const now = Date.now();
  const out: Record<string, string> = {};
  for (const [path, entry] of signedUrlCache.entries()) {
    if (entry.expiresAt > now) {
      out[path] = entry.signedUrl;
    }
  }
  return out;
}

export function invalidateCachedSignedUrl(imagePath?: string | null): void {
  if (!imagePath) return;
  if (signedUrlCache.delete(imagePath)) {
    notifySignedUrlListeners();
  }
}

export function clearSignedUrlCache(): void {
  if (signedUrlCache.size === 0) return;
  signedUrlCache.clear();
  inFlightSignedUrls.clear();
  notifySignedUrlListeners();
}

export function buildEventImageStoragePath(
  userId: string,
  eventId: string,
  ext: string
): string {
  const cleanExt = ext.replace(/^\./, '').toLowerCase() || 'webp';
  return `${userId}/${eventId}.${cleanExt}`;
}

/**
 * Fetches or returns a cached ~1-hour signed URL for `<user_id>/<event_id>.<ext>`.
 * Automatically refreshes cached entries that have expired or are nearing expiry.
 */
export async function getOrCreateSignedUrl(
  imagePath: string,
  options?: { forceRefresh?: boolean }
): Promise<string | null> {
  if (!supabase || !imagePath) return null;

  const now = Date.now();
  if (!options?.forceRefresh) {
    const cached = signedUrlCache.get(imagePath);
    if (cached && cached.expiresAt - now > SIGNED_URL_REFRESH_BUFFER_MS) {
      return cached.signedUrl;
    }
  }

  const existingInFlight = inFlightSignedUrls.get(imagePath);
  if (existingInFlight && !options?.forceRefresh) {
    return existingInFlight;
  }

  const promise = (async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from(EVENT_IMAGES_BUCKET)
        .createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS);

      if (error || !data?.signedUrl) {
        if (error) {
          console.warn(`Failed to create signed URL for ${imagePath}:`, error.message);
        }
        return null;
      }

      signedUrlCache.set(imagePath, {
        signedUrl: data.signedUrl,
        expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
      });
      notifySignedUrlListeners();
      return data.signedUrl;
    } catch (err) {
      console.warn(`Failed to create signed URL for ${imagePath}:`, err);
      return null;
    } finally {
      inFlightSignedUrls.delete(imagePath);
    }
  })();

  inFlightSignedUrls.set(imagePath, promise);
  return promise;
}

/**
 * Ensures valid signed URLs exist for all Storage-backed events and returns
 * the delay (in ms) until the soonest signed URL needs to be refreshed.
 */
export async function ensureSignedUrlsForEvents(
  events: CalendarEvent[]
): Promise<{
  urlsByPath: Record<string, string>;
  nextRefreshInMs: number | null;
}> {
  const uniquePaths = Array.from(
    new Set(
      events
        .filter((ev) => Boolean(ev.imagePath) && !ev.imageUrl?.startsWith('data:'))
        .map((ev) => ev.imagePath as string)
    )
  );

  if (!supabase || uniquePaths.length === 0) {
    return { urlsByPath: getCachedSignedUrlSnapshot(), nextRefreshInMs: null };
  }

  await Promise.all(uniquePaths.map((p) => getOrCreateSignedUrl(p)));

  const now = Date.now();
  let earliestRefreshDelay: number | null = null;
  for (const path of uniquePaths) {
    const entry = signedUrlCache.get(path);
    if (!entry) continue;
    const delay = Math.max(
      10_000,
      entry.expiresAt - SIGNED_URL_REFRESH_BUFFER_MS - now
    );
    if (earliestRefreshDelay === null || delay < earliestRefreshDelay) {
      earliestRefreshDelay = delay;
    }
  }

  return {
    urlsByPath: getCachedSignedUrlSnapshot(),
    nextRefreshInMs: earliestRefreshDelay,
  };
}

export interface UploadedEventImageMeta {
  imagePath: string;
  imageName: string;
  signedUrl: string | null;
}

/**
 * Uploads a `data:image/...` attachment to `event-images` at `<user_id>/<event_id>.<ext>`.
 * If replacing an existing image (`previousImagePath`), removes the old storage object.
 */
export async function uploadEventImageFromDataUrl(params: {
  userId: string;
  eventId: string;
  dataUrl: string;
  originalFileName?: string;
  previousImagePath?: string;
}): Promise<UploadedEventImageMeta> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { blob, contentType, ext } = dataUrlToImageBlob(
    params.dataUrl,
    params.originalFileName
  );
  const targetPath = buildEventImageStoragePath(
    params.userId,
    params.eventId,
    ext
  );
  const imageName =
    params.originalFileName?.trim() || `${params.eventId}.${ext}`;

  if (params.previousImagePath && params.previousImagePath === targetPath) {
    // Same path replacement: delete the old object first, then upload fresh bytes
    await supabase.storage
      .from(EVENT_IMAGES_BUCKET)
      .remove([params.previousImagePath])
      .catch(() => undefined);
    invalidateCachedSignedUrl(params.previousImagePath);
  }

  let { error: uploadError } = await supabase.storage
    .from(EVENT_IMAGES_BUCKET)
    .upload(targetPath, blob, {
      contentType,
      upsert: true,
    });

  // Fallback in case bucket RLS permits DELETE + INSERT without UPDATE
  if (uploadError) {
    await supabase.storage
      .from(EVENT_IMAGES_BUCKET)
      .remove([targetPath])
      .catch(() => undefined);

    const retry = await supabase.storage
      .from(EVENT_IMAGES_BUCKET)
      .upload(targetPath, blob, {
        contentType,
        upsert: false,
      });
    uploadError = retry.error;
  }

  if (uploadError) {
    throw uploadError;
  }

  if (params.previousImagePath && params.previousImagePath !== targetPath) {
    await supabase.storage
      .from(EVENT_IMAGES_BUCKET)
      .remove([params.previousImagePath])
      .catch((err) => {
        console.warn('Failed to delete replaced event image:', err);
      });
    invalidateCachedSignedUrl(params.previousImagePath);
  }

  invalidateCachedSignedUrl(targetPath);
  const signedUrl = await getOrCreateSignedUrl(targetPath, {
    forceRefresh: true,
  });

  return {
    imagePath: targetPath,
    imageName,
    signedUrl,
  };
}

/**
 * Copies an existing storage object to `<user_id>/<new_event_id>.<ext>` when
 * duplicating an event that already has a Storage-backed image.
 */
export async function copyEventImageInStorage(params: {
  userId: string;
  newEventId: string;
  sourceImagePath: string;
  sourceImageName?: string;
}): Promise<UploadedEventImageMeta> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const ext = extractExtensionFromStoragePath(params.sourceImagePath);
  const targetPath = buildEventImageStoragePath(
    params.userId,
    params.newEventId,
    ext
  );
  const imageName =
    params.sourceImageName?.trim() || `${params.newEventId}.${ext}`;

  const { error } = await supabase.storage
    .from(EVENT_IMAGES_BUCKET)
    .copy(params.sourceImagePath, targetPath);

  if (error) {
    throw error;
  }

  const signedUrl = await getOrCreateSignedUrl(targetPath, {
    forceRefresh: true,
  });

  return {
    imagePath: targetPath,
    imageName,
    signedUrl,
  };
}

/**
 * Deletes an object from `event-images`. Returns `true` on success.
 */
export async function removeEventImageFromStorage(
  imagePath: string
): Promise<boolean> {
  if (!imagePath) return true;
  invalidateCachedSignedUrl(imagePath);

  if (!supabase) return false;

  try {
    const { error } = await supabase.storage
      .from(EVENT_IMAGES_BUCKET)
      .remove([imagePath]);

    if (error) {
      console.warn(`Failed to delete storage image ${imagePath}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`Failed to delete storage image ${imagePath}:`, err);
    return false;
  }
}
