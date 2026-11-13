import { supabase } from './supabase';
import { isIosDevice, isStandaloneApp } from '../utils/pwa';

export const MAX_USER_AGENT_LENGTH = 255;
const PUSH_OPT_OUT_STORAGE_KEY = 'omnical_push_opted_out_v1';
const SIGN_OUT_CLEANUP_TIMEOUT_MS = 3000;
const SW_READY_FALLBACK_TIMEOUT_MS = 4000;

let hasWarnedMissingVapid = false;
let hasWarnedInvalidVapid = false;

export interface PushSubscriptionLike {
  endpoint: string;
  toJSON(): {
    endpoint?: string;
    keys?: Record<string, string>;
  };
}

export interface PushSubscriptionRowPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
  timezone: string;
  user_agent: string;
}

export function urlBase64ToUint8Array(
  base64String: string
): Uint8Array<ArrayBuffer> {
  const trimmed = base64String.trim();
  if (!trimmed) {
    throw new Error('VAPID public key is empty.');
  }

  const padding = '='.repeat((4 - (trimmed.length % 4)) % 4);
  const base64 = (trimmed + padding).replace(/-/g, '+').replace(/_/g, '/');

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error('VAPID public key contains invalid base64 characters.');
  }

  const rawData = atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function getVapidPublicKeyBytes(
  rawKeyOverride?: string
): Uint8Array<ArrayBuffer> | null {
  const rawKey =
    rawKeyOverride !== undefined
      ? rawKeyOverride.trim()
      : import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? '';

  if (!rawKey || rawKey === 'your-vapid-public-key') {
    if (rawKeyOverride === undefined && !hasWarnedMissingVapid) {
      hasWarnedMissingVapid = true;
      console.warn(
        'VITE_VAPID_PUBLIC_KEY is missing; background Web Push reminders are disabled.'
      );
    }
    return null;
  }

  try {
    return urlBase64ToUint8Array(rawKey);
  } catch (err) {
    if (rawKeyOverride === undefined && !hasWarnedInvalidVapid) {
      hasWarnedInvalidVapid = true;
      console.warn(
        'VITE_VAPID_PUBLIC_KEY is invalid; background Web Push reminders are disabled.',
        err
      );
    }
    return null;
  }
}

export function isPushConfigured(): boolean {
  return getVapidPublicKeyBytes() !== null;
}

export function isPushEnvironmentSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  if (
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return false;
  }
  if (isIosDevice() && !isStandaloneApp()) {
    return false;
  }
  return true;
}

export function resolveDeviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && tz.trim() ? tz.trim() : 'UTC';
  } catch {
    return 'UTC';
  }
}

export function truncateUserAgent(
  rawUserAgent?: string | null,
  maxLength = MAX_USER_AGENT_LENGTH
): string {
  const source =
    typeof rawUserAgent === 'string'
      ? rawUserAgent
      : typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
      ? navigator.userAgent
      : '';
  return source.trim().slice(0, maxLength);
}

export function buildPushSubscriptionRow(
  subscription: PushSubscriptionLike,
  options?: {
    timezone?: string;
    userAgent?: string;
    maxUserAgentLength?: number;
  }
): PushSubscriptionRowPayload {
  const json = subscription.toJSON();
  const endpoint = (json.endpoint || subscription.endpoint || '').trim();
  const p256dh = json.keys?.p256dh?.trim() ?? '';
  const auth = json.keys?.auth?.trim() ?? '';

  if (!endpoint) {
    throw new Error('Push subscription is missing an endpoint.');
  }
  if (!p256dh || !auth) {
    throw new Error(
      'Push subscription is missing encryption keys (p256dh/auth).'
    );
  }

  const timezone =
    options?.timezone !== undefined
      ? options.timezone.trim() || 'UTC'
      : resolveDeviceTimezone();

  const user_agent = truncateUserAgent(
    options?.userAgent,
    options?.maxUserAgentLength ?? MAX_USER_AGENT_LENGTH
  );

  return {
    endpoint,
    p256dh,
    auth,
    timezone,
    user_agent,
  };
}

export function isPushOptedOut(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    return window.localStorage.getItem(PUSH_OPT_OUT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setPushOptedOut(optedOut: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    if (optedOut) {
      window.localStorage.setItem(PUSH_OPT_OUT_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(PUSH_OPT_OUT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures
  }
}

function arrayBuffersEqual(a: ArrayBuffer, b: Uint8Array): boolean {
  const viewA = new Uint8Array(a);
  if (viewA.byteLength !== b.byteLength) return false;
  for (let i = 0; i < viewA.byteLength; i += 1) {
    if (viewA[i] !== b[i]) return false;
  }
  return true;
}

export async function getReadyPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator) ||
      typeof navigator.serviceWorker.getRegistration !== 'function'
    ) {
      return null;
    }

    let existing = await navigator.serviceWorker.getRegistration();
    if (
      !existing &&
      typeof navigator.serviceWorker.register === 'function'
    ) {
      try {
        existing = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });
      } catch {
        return null;
      }
    }

    if (!existing) {
      return null;
    }

    const ready = await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration | null>((resolve) =>
        setTimeout(() => resolve(existing ?? null), SW_READY_FALLBACK_TIMEOUT_MS)
      ),
    ]);

    const candidate = ready ?? existing;
    return candidate && 'pushManager' in candidate ? candidate : null;
  } catch {
    return null;
  }
}

export async function getExistingBrowserPushSubscription(): Promise<PushSubscription | null> {
  try {
    if (
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator) ||
      typeof navigator.serviceWorker.getRegistration !== 'function'
    ) {
      return null;
    }
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration || !('pushManager' in registration)) {
      return null;
    }
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function syncPushSubscriptionForUser(): Promise<PushSubscription | null> {
  if (!supabase) {
    return null;
  }

  const applicationServerKey = getVapidPublicKeyBytes();
  if (!applicationServerKey) {
    return null;
  }

  const registration = await getReadyPushRegistration();
  if (!registration) {
    return null;
  }

  let subscription = await registration.pushManager.getSubscription();

  if (
    subscription?.options?.applicationServerKey &&
    !arrayBuffersEqual(
      subscription.options.applicationServerKey,
      applicationServerKey
    )
  ) {
    try {
      await subscription.unsubscribe();
    } catch {
      // Ignore old key unsubscribe failure before creating new subscription
    }
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  const row = buildPushSubscriptionRow(subscription);
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(row, { onConflict: 'user_id,endpoint' });

  if (error) {
    throw new Error(error.message);
  }

  return subscription;
}

export async function disablePushSubscriptionForDevice(): Promise<void> {
  setPushOptedOut(true);

  const subscription = await getExistingBrowserPushSubscription();
  if (!subscription) {
    return;
  }

  const endpoint = subscription.endpoint;
  let dbError: string | null = null;

  if (supabase && endpoint) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);
    if (error) {
      dbError = error.message;
    }
  }

  await subscription.unsubscribe();

  if (dbError) {
    throw new Error(dbError);
  }
}

export async function cleanupPushSubscriptionBeforeSignOut(): Promise<void> {
  try {
    setPushOptedOut(false);
    const subscription = await getExistingBrowserPushSubscription();
    if (!subscription) {
      return;
    }

    const endpoint = subscription.endpoint;
    if (supabase && endpoint) {
      try {
        await Promise.race([
          supabase.from('push_subscriptions').delete().eq('endpoint', endpoint),
          new Promise<void>((resolve) =>
            setTimeout(resolve, SIGN_OUT_CLEANUP_TIMEOUT_MS)
          ),
        ]);
      } catch {
        // Never block sign-out on DB cleanup errors
      }
    }

    try {
      await subscription.unsubscribe();
    } catch {
      // Never block sign-out if browser unsubscribe fails
    }
  } catch {
    // Never block sign-out
  }
}

export async function unsubscribeBrowserPushOnly(): Promise<void> {
  try {
    setPushOptedOut(false);
    const subscription = await getExistingBrowserPushSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }
  } catch {
    // Non-fatal cleanup
  }
}
