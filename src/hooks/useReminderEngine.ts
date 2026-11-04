import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format } from 'date-fns';
import {
  CalendarEvent,
  NotificationSettings,
  ReminderAlert,
  ThemeId,
} from '../types/calendar';
import { expandEventsInRange } from '../utils/calendarMath';
import {
  loadFiredReminders,
  saveFiredReminders,
} from '../services/storage';
import { playReminderChime } from '../services/sound';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const TRIGGER_GRACE_WINDOW_MS = 90 * 1000;

export type BrowserPermissionState =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported';

export interface UpcomingReminderItem {
  occurrenceId: string;
  eventId: string;
  title: string;
  eventStart: Date;
  reminderAt: Date;
  msUntilReminder: number;
}

interface UseReminderEngineOptions {
  events: CalendarEvent[];
  settings: NotificationSettings;
  onUpdateSettings: (next: NotificationSettings) => void;
  activeTheme: ThemeId;
  onOpenEventById?: (eventId: string) => void;
}

export function useReminderEngine({
  events,
  settings,
  onUpdateSettings,
  activeTheme,
  onOpenEventById,
}: UseReminderEngineOptions) {
  const [permissionStatus, setPermissionStatus] =
    useState<BrowserPermissionState>(() => {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        return 'unsupported';
      }
      return window.Notification.permission;
    });

  const [activeToasts, setActiveToasts] = useState<ReminderAlert[]>([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const firedRef = useRef<Record<string, number>>(loadFiredReminders());

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionStatus('unsupported');
      return 'unsupported' as const;
    }

    try {
      const result = await window.Notification.requestPermission();
      setPermissionStatus(result);
      onUpdateSettings({
        ...settings,
        hasRequestedPermission: true,
      });
      return result;
    } catch {
      const current = window.Notification.permission;
      setPermissionStatus(current);
      return current;
    }
  }, [onUpdateSettings, settings]);

  // Request browser Notification permission automatically on first visit
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionStatus('unsupported');
      return;
    }

    setPermissionStatus(window.Notification.permission);

    if (
      window.Notification.permission === 'default' &&
      !settings.hasRequestedPermission
    ) {
      window.Notification.requestPermission()
        .then((res) => {
          setPermissionStatus(res);
          onUpdateSettings({
            ...settings,
            hasRequestedPermission: true,
          });
        })
        .catch(() => {
          // Some browsers require explicit click gesture; keep button available
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dispatchAlert = useCallback(
    (alert: ReminderAlert) => {
      if (settings.soundEnabled) {
        playReminderChime(activeTheme);
      }

      let nativeDelivered = false;
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted' &&
        settings.desktopEnabled
      ) {
        try {
          const timeStr = format(alert.start, 'h:mm a');
          const bodyParts = [`Starts in 10 minutes (${timeStr})`];
          if (alert.location) bodyParts.push(`Location: ${alert.location}`);

          const nativeNotif = new window.Notification(
            `Upcoming Event: ${alert.title}`,
            {
              body: bodyParts.join(' • '),
              tag: alert.id,
            }
          );

          nativeNotif.onclick = () => {
            window.focus();
            if (onOpenEventById) {
              onOpenEventById(alert.eventId);
            }
            nativeNotif.close();
          };
          nativeDelivered = true;
        } catch {
          nativeDelivered = false;
        }
      }

      // Always surface the animated in-app toast alert when native notifications
      // are denied/unsupported/blocked, and also keep a visual banner inside the app
      // so users in embedded/sandboxed viewports always see the 10-minute alert.
      if (!nativeDelivered || true) {
        setActiveToasts((prev) => {
          const exists = prev.some((t) => t.id === alert.id);
          if (exists) return prev;
          return [alert, ...prev].slice(0, 5);
        });
      }
    },
    [activeTheme, onOpenEventById, settings.desktopEnabled, settings.soundEnabled]
  );

  // Precision 1-second timer checking exact 10-minute pre-event threshold
  useEffect(() => {
    const evaluateReminders = () => {
      const nowMs = Date.now();
      setNowTick(nowMs);
      const nowDate = new Date(nowMs);

      const candidates = expandEventsInRange(
        events,
        addDays(nowDate, -1),
        addDays(nowDate, 2)
      );

      let mutatedFired = false;

      for (const occ of candidates) {
        if (occ.event.completed) continue;

        const startMs = occ.start.getTime();
        const triggerMs = startMs - TEN_MINUTES_MS;

        // Fire when current time reaches [startMs - 10 min, startMs - 10 min + grace]
        if (
          nowMs >= triggerMs &&
          nowMs <= triggerMs + TRIGGER_GRACE_WINDOW_MS &&
          nowMs < startMs &&
          !firedRef.current[occ.occurrenceId]
        ) {
          firedRef.current[occ.occurrenceId] = nowMs;
          mutatedFired = true;

          dispatchAlert({
            id: occ.occurrenceId,
            eventId: occ.masterId,
            title: occ.event.title,
            start: occ.start,
            end: occ.end,
            location: occ.event.location,
            category: occ.event.category,
            imageUrl: occ.event.imageUrl,
            triggeredAt: new Date(nowMs),
          });
        }
      }

      if (mutatedFired) {
        saveFiredReminders(firedRef.current);
      }
    };

    evaluateReminders();
    const intervalId = window.setInterval(evaluateReminders, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        evaluateReminders();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [dispatchAlert, events]);

  const upcomingReminders = useMemo<UpcomingReminderItem[]>(() => {
    const nowDate = new Date(nowTick);
    const occurrences = expandEventsInRange(
      events,
      nowDate,
      addDays(nowDate, 2)
    );

    return occurrences
      .filter((occ) => !occ.event.completed && occ.start.getTime() > nowTick)
      .map((occ) => {
        const reminderAt = new Date(occ.start.getTime() - TEN_MINUTES_MS);
        return {
          occurrenceId: occ.occurrenceId,
          eventId: occ.masterId,
          title: occ.event.title,
          eventStart: occ.start,
          reminderAt,
          msUntilReminder: reminderAt.getTime() - nowTick,
        };
      })
      .filter((item) => item.msUntilReminder > -TRIGGER_GRACE_WINDOW_MS)
      .sort((a, b) => a.reminderAt.getTime() - b.reminderAt.getTime())
      .slice(0, 6);
  }, [events, nowTick]);

  const dismissToast = useCallback((id: string) => {
    setActiveToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const triggerTestReminder = useCallback(() => {
    const start = new Date(Date.now() + TEN_MINUTES_MS);
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    dispatchAlert({
      id: `test-reminder-${Date.now()}`,
      eventId: '',
      title: '10-Minute Reminder Preview',
      start,
      end,
      location: 'Main Calendar Studio',
      category: 'class-events',
      triggeredAt: new Date(),
    });
  }, [dispatchAlert]);

  return {
    permissionStatus,
    requestBrowserPermission,
    activeToasts,
    dismissToast,
    upcomingReminders,
    triggerTestReminder,
  };
}
