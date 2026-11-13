import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BrowserPermissionState } from './useReminderEngine';
import {
  disablePushSubscriptionForDevice,
  getExistingBrowserPushSubscription,
  isPushConfigured,
  isPushEnvironmentSupported,
  isPushOptedOut,
  setPushOptedOut,
  syncPushSubscriptionForUser,
} from '../services/pushNotifications';

export type PushReminderStatus =
  | 'off'
  | 'on'
  | 'needs-sign-in'
  | 'blocked'
  | 'unsupported';

interface UsePushNotificationsOptions {
  userId: string | null;
  permissionStatus: BrowserPermissionState;
  requestBrowserPermission: () => Promise<BrowserPermissionState>;
}

export function usePushNotifications({
  userId,
  permissionStatus,
  requestBrowserPermission,
}: UsePushNotificationsOptions) {
  const pushConfigured = useMemo(() => isPushConfigured(), []);
  const environmentSupported = useMemo(() => isPushEnvironmentSupported(), []);

  const [hasActivePushSubscription, setHasActivePushSubscription] =
    useState<boolean>(false);
  const [isPushBusy, setIsPushBusy] = useState<boolean>(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const syncRunIdRef = useRef(0);

  const refreshSubscription = useCallback(async () => {
    if (!pushConfigured || !environmentSupported) {
      setHasActivePushSubscription(false);
      return;
    }

    if (!userId || permissionStatus !== 'granted') {
      setHasActivePushSubscription(false);
      setPushError(null);
      return;
    }

    const runId = ++syncRunIdRef.current;

    if (isPushOptedOut()) {
      const existing = await getExistingBrowserPushSubscription();
      if (syncRunIdRef.current !== runId) return;
      setHasActivePushSubscription(Boolean(existing));
      return;
    }

    setIsPushBusy(true);
    setPushError(null);

    try {
      const sub = await syncPushSubscriptionForUser();
      if (syncRunIdRef.current !== runId) return;
      setHasActivePushSubscription(Boolean(sub));
    } catch (err) {
      if (syncRunIdRef.current !== runId) return;
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to register background push notifications.';
      setPushError(message);
      const existing = await getExistingBrowserPushSubscription();
      if (syncRunIdRef.current === runId) {
        setHasActivePushSubscription(Boolean(existing));
      }
    } finally {
      if (syncRunIdRef.current === runId) {
        setIsPushBusy(false);
      }
    }
  }, [environmentSupported, permissionStatus, pushConfigured, userId]);

  // Refresh/create subscription on app load and automatically after sign-in
  // whenever permission is granted and the user hasn't turned push off.
  useEffect(() => {
    void refreshSubscription();
  }, [refreshSubscription]);

  // Keep Supabase synced if the service worker reports pushsubscriptionchange
  useEffect(() => {
    if (
      !pushConfigured ||
      !environmentSupported ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator) ||
      typeof navigator.serviceWorker.addEventListener !== 'function'
    ) {
      return;
    }

    const handleSwMessage = (event: MessageEvent) => {
      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'OMNICAL_PUSH_SUBSCRIPTION_CHANGED'
      ) {
        void refreshSubscription();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, [environmentSupported, pushConfigured, refreshSubscription]);

  const enableReminders = useCallback(async () => {
    setPushError(null);
    setPushOptedOut(false);

    let effectivePermission = permissionStatus;
    if (effectivePermission !== 'granted') {
      effectivePermission = await requestBrowserPermission();
    }

    if (effectivePermission !== 'granted') {
      setHasActivePushSubscription(false);
      return;
    }

    if (!pushConfigured || !environmentSupported || !userId) {
      return;
    }

    const runId = ++syncRunIdRef.current;
    setIsPushBusy(true);
    try {
      const sub = await syncPushSubscriptionForUser();
      if (syncRunIdRef.current !== runId) return;
      setHasActivePushSubscription(Boolean(sub));
    } catch (err) {
      if (syncRunIdRef.current !== runId) return;
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to enable background reminders on this device.';
      setPushError(message);
    } finally {
      if (syncRunIdRef.current === runId) {
        setIsPushBusy(false);
      }
    }
  }, [
    environmentSupported,
    permissionStatus,
    pushConfigured,
    requestBrowserPermission,
    userId,
  ]);

  const disableBackgroundReminders = useCallback(async () => {
    if (!pushConfigured) return;
    const runId = ++syncRunIdRef.current;
    setIsPushBusy(true);
    setPushError(null);
    try {
      await disablePushSubscriptionForDevice();
      if (syncRunIdRef.current === runId) {
        setHasActivePushSubscription(false);
      }
    } catch (err) {
      if (syncRunIdRef.current === runId) {
        setHasActivePushSubscription(false);
        const message =
          err instanceof Error
            ? err.message
            : 'Turned off locally, but failed to remove subscription from server.';
        setPushError(message);
      }
    } finally {
      if (syncRunIdRef.current === runId) {
        setIsPushBusy(false);
      }
    }
  }, [pushConfigured]);

  const pushStatus: PushReminderStatus = useMemo(() => {
    if (!pushConfigured) return 'off';
    if (permissionStatus === 'unsupported' || !environmentSupported) {
      return 'unsupported';
    }
    if (permissionStatus === 'denied') {
      return 'blocked';
    }
    if (permissionStatus === 'default') {
      return 'off';
    }
    if (!userId) {
      return 'needs-sign-in';
    }
    return hasActivePushSubscription ? 'on' : 'off';
  }, [
    environmentSupported,
    hasActivePushSubscription,
    permissionStatus,
    pushConfigured,
    userId,
  ]);

  return {
    isPushConfigured: pushConfigured,
    pushStatus,
    hasActivePushSubscription,
    isPushBusy,
    pushError,
    enableReminders,
    disableBackgroundReminders,
  };
}
