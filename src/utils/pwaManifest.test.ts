import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isIosDevice, isStandaloneApp } from './pwa';
import { ReminderCenterPopover } from '../components/notifications/ReminderCenterPopover';
import { sendReminderNotification } from '../hooks/useReminderEngine';
import { NotificationSettings, ReminderAlert } from '../types/calendar';

interface NodeFsLike {
  existsSync(path: URL): boolean;
  readFileSync(path: URL, encoding: 'utf8'): string;
  statSync(path: URL): { size: number };
}

async function getNodeFs(): Promise<NodeFsLike> {
  const specifier = ['node', 'fs'].join(':');
  return (await import(/* @vite-ignore */ specifier)) as NodeFsLike;
}

function repoFileUrl(relativePath: string): URL {
  return new URL(`../../${relativePath}`, import.meta.url);
}

interface WebManifestIcon {
  src: string;
  sizes: string;
  type?: string;
  purpose?: string;
}

interface WebManifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: WebManifestIcon[];
}

describe('PWA manifest and icons', () => {
  it('defines all required manifest fields and points to existing icons in public/icons/', async () => {
    const fs = await getNodeFs();
    const manifestUrl = repoFileUrl('public/manifest.webmanifest');
    expect(fs.existsSync(manifestUrl)).toBe(true);

    const manifest = JSON.parse(
      fs.readFileSync(manifestUrl, 'utf8')
    ) as WebManifest;

    expect(manifest.name).toBe('OmniCal');
    expect(manifest.short_name).toBe('OmniCal');
    expect(manifest.id).toBe('/');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#f8fafc');
    expect(manifest.theme_color).toBe('#ffffff');

    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');

    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      expect(icon.src.startsWith('/icons/')).toBe(true);

      const relativeToPublic = icon.src.replace(/^\/+/, '');
      const fileOnDisk = repoFileUrl(`public/${relativeToPublic}`);
      expect(fs.existsSync(fileOnDisk)).toBe(true);
      expect(fs.statSync(fileOnDisk).size).toBeGreaterThan(0);
    }

    const appleTouchIconUrl = repoFileUrl('public/icons/apple-touch-icon.png');
    expect(fs.existsSync(appleTouchIconUrl)).toBe(true);
    expect(fs.statSync(appleTouchIconUrl).size).toBeGreaterThan(0);
  });

  it('configures index.html and minimal public/sw.js for standalone installability', async () => {
    const fs = await getNodeFs();
    const indexHtml = fs.readFileSync(repoFileUrl('index.html'), 'utf8');
    expect(indexHtml).toContain('viewport-fit=cover');
    expect(indexHtml).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(indexHtml).toContain('href="/icons/apple-touch-icon.png"');
    expect(indexHtml).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(indexHtml).toContain('name="mobile-web-app-capable" content="yes"');
    expect(indexHtml).toContain('name="apple-mobile-web-app-title" content="OmniCal"');
    expect(indexHtml).toContain('name="apple-mobile-web-app-status-bar-style" content="default"');
    expect(indexHtml).toContain('name="theme-color" content="#ffffff"');

    const swJs = fs.readFileSync(repoFileUrl('public/sw.js'), 'utf8');
    expect(swJs).toContain('skipWaiting');
    expect(swJs).toContain('clients.claim');
    expect(swJs).toContain("addEventListener('notificationclick'");
    expect(swJs).not.toContain("addEventListener('fetch'");
    expect(swJs).not.toContain('caches.');
  });
});

describe('iOS standalone detection and Enable reminders control', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects iOS devices and standalone display state accurately', () => {
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)' })).toBe(true);
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 0 })).toBe(false);

    expect(isStandaloneApp({ navigator: { standalone: true } })).toBe(true);
    expect(
      isStandaloneApp({
        navigator: { standalone: false },
        matchMedia: (q) => ({ matches: q === '(display-mode: standalone)' }),
      })
    ).toBe(true);
    expect(
      isStandaloneApp({
        navigator: { standalone: false },
        matchMedia: () => ({ matches: false }),
      })
    ).toBe(false);
  });

  it('renders Enable reminders control, readable states, and iOS install hint only when not installed', () => {
    const settings: NotificationSettings = {
      soundEnabled: true,
      desktopEnabled: true,
      hasRequestedPermission: false,
    };

    const renderPopover = (
      permissionStatus: 'default' | 'granted' | 'denied' | 'unsupported'
    ) =>
      renderToStaticMarkup(
        React.createElement(ReminderCenterPopover, {
          isOpen: true,
          onClose: () => {},
          permissionStatus,
          onRequestPermission: () => {},
          settings,
          onUpdateSettings: () => {},
          upcomingReminders: [],
          onTriggerPreviewAlert: () => {},
          onScheduleLiveTenMinDemo: () => {},
        })
      );

    // Desktop default -> Not enabled + Enable reminders button, no iPhone message
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
      platform: 'Linux x86_64',
      maxTouchPoints: 0,
    });
    vi.stubGlobal('window', {
      navigator: globalThis.navigator,
      matchMedia: () => ({ matches: false }),
    });

    const defaultHtml = renderPopover('default');
    expect(defaultHtml).toContain('Not enabled');
    expect(defaultHtml).toContain('Enable reminders');
    expect(defaultHtml).not.toContain('On iPhone, add this app to your Home Screen first');

    const grantedHtml = renderPopover('granted');
    expect(grantedHtml).toContain('Enabled');

    const deniedHtml = renderPopover('denied');
    expect(deniedHtml).toContain('Blocked');

    // iOS Safari (not installed) -> shows install hint
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
      standalone: false,
    });
    vi.stubGlobal('window', {
      navigator: globalThis.navigator,
      matchMedia: () => ({ matches: false }),
    });

    const iosBrowserHtml = renderPopover('unsupported');
    expect(iosBrowserHtml).toContain('Not enabled');
    expect(iosBrowserHtml).toContain(
      'On iPhone, add this app to your Home Screen first (Share, then Add to Home Screen), then open it from there to enable reminders.'
    );

    // iOS installed (standalone) -> hides install hint
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
      standalone: true,
    });
    vi.stubGlobal('window', {
      navigator: globalThis.navigator,
      matchMedia: () => ({ matches: true }),
    });

    const iosInstalledHtml = renderPopover('default');
    expect(iosInstalledHtml).toContain('Enable reminders');
    expect(iosInstalledHtml).not.toContain(
      'On iPhone, add this app to your Home Screen first'
    );
  });
});

describe('sendReminderNotification safety and service worker preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sampleAlert: ReminderAlert = {
    id: 'occ-1',
    eventId: 'evt-1',
    title: 'Algorithms Lecture',
    start: new Date('2026-11-11T10:00:00'),
    end: new Date('2026-11-11T11:00:00'),
    location: 'Room 204',
    category: 'class-sched',
    triggeredAt: new Date('2026-11-11T09:50:00'),
  };

  it('prefers registration.showNotification when an active SW registration exists', async () => {
    const showNotification = vi.fn(async () => {});
    const NotificationCtor = vi.fn();
    Object.defineProperty(NotificationCtor, 'permission', {
      value: 'granted',
      configurable: true,
    });

    vi.stubGlobal('window', {
      Notification: NotificationCtor,
      focus: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn(async () => ({
          active: {},
          showNotification,
        })),
      },
    });

    const ok = await sendReminderNotification(sampleAlert);
    expect(ok).toBe(true);
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(
      'Upcoming Event: Algorithms Lecture',
      expect.objectContaining({
        tag: 'evt-1|2026-11-11T10:00',
        data: { eventId: 'evt-1', url: '/' },
      })
    );
    expect(NotificationCtor).not.toHaveBeenCalled();
  });

  it('skips system notification when this device has an active push subscription', async () => {
    const showNotification = vi.fn(async () => {});
    const NotificationCtor = vi.fn();
    Object.defineProperty(NotificationCtor, 'permission', {
      value: 'granted',
      configurable: true,
    });

    vi.stubGlobal('window', {
      Notification: NotificationCtor,
      focus: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn(async () => ({
          active: {},
          showNotification,
          pushManager: {
            getSubscription: vi.fn(async () => ({
              endpoint: 'https://push.example/sub/123',
            })),
          },
        })),
      },
    });

    const ok = await sendReminderNotification(sampleAlert);
    expect(ok).toBe(false);
    expect(showNotification).not.toHaveBeenCalled();
    expect(NotificationCtor).not.toHaveBeenCalled();
  });

  it('falls back to window.Notification without throwing if SW is absent or Notification throws', async () => {
    const throwingNotif = vi.fn(() => {
      throw new TypeError('Illegal constructor');
    });
    Object.defineProperty(throwingNotif, 'permission', {
      value: 'granted',
      configurable: true,
    });

    vi.stubGlobal('window', {
      Notification: throwingNotif,
      focus: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn(async () => undefined),
      },
    });

    await expect(sendReminderNotification(sampleAlert)).resolves.toBe(false);
    expect(throwingNotif).toHaveBeenCalledTimes(1);
  });
});
