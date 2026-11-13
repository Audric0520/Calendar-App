/* Minimal service worker for installability, Web Push, and notification clicks.
 * Intentionally contains no fetch listener and performs no caching so the
 * app shell, Supabase requests, and all API traffic pass straight through.
 */

const APP_ICON_URL = '/icons/icon-192.png';
const DEFAULT_TITLE = 'OmniCal Reminder';
const DEFAULT_BODY = 'You have an upcoming calendar event.';
const DEFAULT_TAG = 'omnical-reminder';
const DEFAULT_URL = '/';

function parsePushPayload(pushData) {
  if (!pushData) {
    return {};
  }

  try {
    const parsed = pushData.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    try {
      const rawText = pushData.text();
      if (!rawText) {
        return {};
      }
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      return {};
    } catch {
      return {};
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event.data);

  const title =
    typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : DEFAULT_TITLE;
  const body =
    typeof payload.body === 'string' && payload.body.trim()
      ? payload.body.trim()
      : DEFAULT_BODY;

  const fallbackTag =
    typeof payload.eventId === 'string' &&
    payload.eventId.trim() &&
    typeof payload.occurrenceStart === 'string' &&
    payload.occurrenceStart.trim()
      ? `${payload.eventId.trim()}|${payload.occurrenceStart.trim()}`
      : DEFAULT_TAG;

  const tag =
    typeof payload.tag === 'string' && payload.tag.trim()
      ? payload.tag.trim()
      : fallbackTag;

  const url =
    typeof payload.url === 'string' && payload.url.trim()
      ? payload.url.trim()
      : DEFAULT_URL;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: APP_ICON_URL,
      badge: APP_ICON_URL,
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawTargetUrl =
    (event.notification &&
      event.notification.data &&
      typeof event.notification.data.url === 'string' &&
      event.notification.data.url.trim()) ||
    DEFAULT_URL;

  let resolvedUrl = rawTargetUrl;
  try {
    resolvedUrl = new URL(rawTargetUrl, self.location.origin).href;
  } catch {
    resolvedUrl = DEFAULT_URL;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          if (client.url === resolvedUrl && 'focus' in client) {
            return client.focus();
          }
        }

        for (const client of clientList) {
          if ('focus' in client) {
            if (
              rawTargetUrl !== DEFAULT_URL &&
              'navigate' in client &&
              client.url !== resolvedUrl
            ) {
              try {
                const navigated = await client.navigate(resolvedUrl);
                if (navigated && 'focus' in navigated) {
                  return navigated.focus();
                }
              } catch {
                // Fall back to focusing existing window
              }
            }
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(resolvedUrl);
        }
        return undefined;
      })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        let subscription = event.newSubscription || null;

        if (!subscription && self.registration && self.registration.pushManager) {
          const existing = await self.registration.pushManager.getSubscription();
          if (existing) {
            subscription = existing;
          } else {
            const appServerKey =
              event.oldSubscription &&
              event.oldSubscription.options &&
              event.oldSubscription.options.applicationServerKey;

            const subscribeOptions = appServerKey
              ? { userVisibleOnly: true, applicationServerKey: appServerKey }
              : { userVisibleOnly: true };

            subscription =
              await self.registration.pushManager.subscribe(subscribeOptions);
          }
        }

        const clientList = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        for (const client of clientList) {
          client.postMessage({
            type: 'OMNICAL_PUSH_SUBSCRIPTION_CHANGED',
            subscription: subscription ? subscription.toJSON() : null,
          });
        }
      } catch {
        // App load will re-subscribe and refresh the row when opened
      }
    })()
  );
});
