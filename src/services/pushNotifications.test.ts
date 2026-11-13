import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MAX_USER_AGENT_LENGTH,
  buildPushSubscriptionRow,
  cleanupPushSubscriptionBeforeSignOut,
  getVapidPublicKeyBytes,
  urlBase64ToUint8Array,
} from './pushNotifications';
import { formatReminderTag } from '../hooks/useReminderEngine';
import { ReminderCenterPopover } from '../components/notifications/ReminderCenterPopover';
import type { PushReminderStatus } from '../hooks/usePushNotifications';
import type { NotificationSettings } from '../types/calendar';

interface NodeFsLike {
  readFileSync(path: URL, encoding: 'utf8'): string;
}

async function getNodeFs(): Promise<NodeFsLike> {
  const specifier = ['node', 'fs'].join(':');
  return (await import(/* @vite-ignore */ specifier)) as NodeFsLike;
}

function repoFileUrl(relativePath: string): URL {
  return new URL(`../../${relativePath}`, import.meta.url);
}

describe('Web Push VAPID key conversion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converts URL-safe base64 VAPID keys (with - and _ and no padding) into Uint8Array', () => {
    // 65-byte uncompressed P-256 test key (0x04 prefix + 64 bytes) encoded as unpadded base64url
    const rawBytes = new Uint8Array(65);
    rawBytes[0] = 0x04;
    for (let i = 1; i < 65; i += 1) {
      rawBytes[i] = (i * 17 + 250) & 0xff;
    }

    let binary = '';
    for (let i = 0; i < rawBytes.length; i += 1) {
      binary += String.fromCharCode(rawBytes[i]);
    }
    const base64Url = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(base64Url).not.toContain('+');
    expect(base64Url).not.toContain('/');
    expect(base64Url).not.toContain('=');

    const decoded = urlBase64ToUint8Array(`  ${base64Url}  `);
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(decoded.length).toBe(65);
    expect(Array.from(decoded)).toEqual(Array.from(rawBytes));
  });

  it('throws on empty or malformed base64url VAPID strings', () => {
    expect(() => urlBase64ToUint8Array('')).toThrow();
    expect(() => urlBase64ToUint8Array('   ')).toThrow();
    expect(() => urlBase64ToUint8Array('invalid*key!')).toThrow();
  });

  it('logs a console.warn and returns null when VITE_VAPID_PUBLIC_KEY is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bytes = getVapidPublicKeyBytes();
    expect(bytes).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('PushSubscription to push_subscriptions row mapping', () => {
  it('maps endpoint, p256dh, auth, timezone, and truncated user_agent without user_id/timestamps', () => {
    const longAgent = `Mozilla/5.0 ${'A'.repeat(400)}`;
    const sub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        keys: {
          p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
          auth: 'tBHItJI5svbpez7KI4CCXg',
        },
      }),
    };

    const row = buildPushSubscriptionRow(sub, {
      timezone: 'Asia/Manila',
      userAgent: longAgent,
    });

    expect(row).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      p256dh:
        'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItJI5svbpez7KI4CCXg',
      timezone: 'Asia/Manila',
      user_agent: longAgent.slice(0, MAX_USER_AGENT_LENGTH),
    });
    expect(row.user_agent.length).toBe(MAX_USER_AGENT_LENGTH);

    // Never send user_id, created_at, or updated_at in upsert payloads
    expect(Object.keys(row).sort()).toEqual([
      'auth',
      'endpoint',
      'p256dh',
      'timezone',
      'user_agent',
    ]);
  });

  it('falls back to subscription.endpoint when toJSON().endpoint is omitted and validates required keys', () => {
    const row = buildPushSubscriptionRow(
      {
        endpoint: 'https://push.example/endpoint-only',
        toJSON: () => ({
          keys: {
            p256dh: 'p256dh-val',
            auth: 'auth-val',
          },
        }),
      },
      { timezone: 'UTC', userAgent: 'OmniCalTest/1.0' }
    );
    expect(row.endpoint).toBe('https://push.example/endpoint-only');

    expect(() =>
      buildPushSubscriptionRow({
        endpoint: 'https://push.example/missing-keys',
        toJSON: () => ({ keys: { p256dh: 'only-p256dh' } }),
      })
    ).toThrow(/encryption keys/i);

    expect(() =>
      buildPushSubscriptionRow({
        endpoint: '',
        toJSON: () => ({ keys: { p256dh: 'a', auth: 'b' } }),
      })
    ).toThrow(/endpoint/i);
  });
});

describe('Unified reminder tag and sign-out cleanup safety', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('formats reminder tags as ${eventId}|${occurrenceStart}', () => {
    expect(formatReminderTag('evt-42', new Date('2026-11-11T09:30:00'))).toBe(
      'evt-42|2026-11-11T09:30'
    );
  });

  it('never throws or blocks sign-out even when serviceWorker or unsubscribe fails', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn(async () => ({
          pushManager: {
            getSubscription: vi.fn(async () => ({
              endpoint: 'https://push.example/sub-xyz',
              unsubscribe: vi.fn(async () => {
                throw new Error('Browser unsubscribe failed');
              }),
            })),
          },
        })),
      },
    });

    await expect(cleanupPushSubscriptionBeforeSignOut()).resolves.toBeUndefined();
  });
});

describe('ReminderCenterPopover Web Push states and hidden mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const baseSettings: NotificationSettings = {
    soundEnabled: true,
    desktopEnabled: true,
    hasRequestedPermission: false,
  };

  function renderPushPopover(
    isPushConfigured: boolean,
    pushStatus: PushReminderStatus,
    permissionStatus: 'default' | 'granted' | 'denied' | 'unsupported' = 'default'
  ): string {
    return renderToStaticMarkup(
      React.createElement(ReminderCenterPopover, {
        isOpen: true,
        onClose: () => {},
        permissionStatus,
        onRequestPermission: () => {},
        settings: baseSettings,
        onUpdateSettings: () => {},
        upcomingReminders: [],
        onTriggerPreviewAlert: () => {},
        onScheduleLiveTenMinDemo: () => {},
        isPushConfigured,
        pushStatus,
        onDisableBackgroundReminders: () => {},
      })
    );
  }

  it('hides push UI when VITE_VAPID_PUBLIC_KEY is missing', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
      platform: 'Linux x86_64',
      maxTouchPoints: 0,
    });
    vi.stubGlobal('window', {
      navigator: globalThis.navigator,
      matchMedia: () => ({ matches: false }),
    });

    const html = renderPushPopover(false, 'on', 'granted');
    expect(html).not.toContain('Turn off background reminders');
    expect(html).not.toContain('This device gets reminders when the app is closed');
    expect(html).not.toContain('Sign in to get reminders when the app is closed');
    expect(html).not.toContain('Needs sign-in');
  });

  it('renders off, on, needs sign-in, blocked, and unsupported (+ iOS hint) push states when configured', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
      platform: 'Linux x86_64',
      maxTouchPoints: 0,
    });
    vi.stubGlobal('window', {
      navigator: globalThis.navigator,
      matchMedia: () => ({ matches: false }),
    });

    const offHtml = renderPushPopover(true, 'off', 'default');
    expect(offHtml).toContain('Off');
    expect(offHtml).toContain('Enable reminders');

    const onHtml = renderPushPopover(true, 'on', 'granted');
    expect(onHtml).toContain('On');
    expect(onHtml).toContain(
      'This device gets reminders when the app is closed.'
    );
    expect(onHtml).toContain('Turn off background reminders');

    const needsSignInHtml = renderPushPopover(true, 'needs-sign-in', 'granted');
    expect(needsSignInHtml).toContain('Needs sign-in');
    expect(needsSignInHtml).toContain(
      'Sign in to get reminders when the app is closed'
    );

    const blockedHtml = renderPushPopover(true, 'blocked', 'denied');
    expect(blockedHtml).toContain('Blocked');

    const unsupportedDesktopHtml = renderPushPopover(
      true,
      'unsupported',
      'unsupported'
    );
    expect(unsupportedDesktopHtml).toContain('Unsupported');

    // iPhone Safari (not installed) retains the Add to Home Screen hint
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
      standalone: false,
    });
    vi.stubGlobal('window', {
      navigator: globalThis.navigator,
      matchMedia: () => ({ matches: false }),
    });

    const unsupportedIosHtml = renderPushPopover(
      true,
      'unsupported',
      'unsupported'
    );
    expect(unsupportedIosHtml).toContain('Unsupported');
    expect(unsupportedIosHtml).toContain(
      'On iPhone, add this app to your Home Screen first (Share, then Add to Home Screen), then open it from there to enable reminders.'
    );
  });
});

describe('public/sw.js push and pushsubscriptionchange handlers', () => {
  async function loadServiceWorkerHarness() {
    const fs = await getNodeFs();
    const swSource = fs.readFileSync(repoFileUrl('public/sw.js'), 'utf8');

    const listeners: Record<string, (event: unknown) => void> = {};
    const showNotification = vi.fn(async () => {});
    const postMessage = vi.fn();
    const matchAll = vi.fn(async () => [{ postMessage, url: 'https://omnical.test/' }]);
    const openWindow = vi.fn(async () => undefined);
    const getSubscription = vi.fn(async () => null);
    const subscribe = vi.fn(async (opts: unknown) => ({
      endpoint: 'https://push.example/new-sub',
      options: opts,
      toJSON: () => ({
        endpoint: 'https://push.example/new-sub',
        keys: { p256dh: 'new-p256dh', auth: 'new-auth' },
      }),
    }));

    const selfMock = {
      location: { origin: 'https://omnical.test' },
      skipWaiting: vi.fn(async () => {}),
      clients: { claim: vi.fn(async () => {}), matchAll, openWindow },
      registration: {
        showNotification,
        pushManager: { getSubscription, subscribe },
      },
      addEventListener: (type: string, cb: (event: unknown) => void) => {
        listeners[type] = cb;
      },
    };

    const runner = new Function('self', swSource);
    runner(selfMock);

    return {
      listeners,
      showNotification,
      postMessage,
      subscribe,
    };
  }

  it('always shows a notification on valid, empty, and malformed push payloads', async () => {
    const { listeners, showNotification } = await loadServiceWorkerHarness();
    expect(typeof listeners.push).toBe('function');

    // 1. Valid JSON payload
    const waits1: Promise<unknown>[] = [];
    listeners.push({
      data: {
        json: () => ({
          title: 'CS 101 Lecture',
          body: 'Starts in 10 minutes (9:00 AM)',
          tag: 'evt-1|2026-11-11T09:00',
          url: '/?event=evt-1',
        }),
      },
      waitUntil: (p: Promise<unknown>) => waits1.push(p),
    });
    await Promise.all(waits1);

    expect(showNotification).toHaveBeenLastCalledWith('CS 101 Lecture', {
      body: 'Starts in 10 minutes (9:00 AM)',
      tag: 'evt-1|2026-11-11T09:00',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: '/?event=evt-1' },
    });

    // 2. Empty payload -> safe default notification still shown
    const waits2: Promise<unknown>[] = [];
    listeners.push({
      data: null,
      waitUntil: (p: Promise<unknown>) => waits2.push(p),
    });
    await Promise.all(waits2);

    expect(showNotification).toHaveBeenLastCalledWith('OmniCal Reminder', {
      body: 'You have an upcoming calendar event.',
      tag: 'omnical-reminder',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: '/' },
    });

    // 3. Invalid JSON payload -> safe default notification still shown
    const waits3: Promise<unknown>[] = [];
    listeners.push({
      data: {
        json: () => {
          throw new SyntaxError('Unexpected token');
        },
        text: () => 'not-json{{{',
      },
      waitUntil: (p: Promise<unknown>) => waits3.push(p),
    });
    await Promise.all(waits3);

    expect(showNotification).toHaveBeenCalledTimes(3);
    expect(showNotification).toHaveBeenLastCalledWith('OmniCal Reminder', {
      body: 'You have an upcoming calendar event.',
      tag: 'omnical-reminder',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: '/' },
    });
  });

  it('re-subscribes on pushsubscriptionchange and notifies open windows', async () => {
    const { listeners, subscribe, postMessage } =
      await loadServiceWorkerHarness();
    expect(typeof listeners.pushsubscriptionchange).toBe('function');

    const fakeAppServerKey = new Uint8Array([4, 1, 2, 3]).buffer;
    const waits: Promise<unknown>[] = [];
    listeners.pushsubscriptionchange({
      oldSubscription: {
        options: {
          applicationServerKey: fakeAppServerKey,
        },
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);

    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: fakeAppServerKey,
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OMNICAL_PUSH_SUBSCRIPTION_CHANGED',
      })
    );
  });
});
