import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import { Filter, X } from 'lucide-react';
import {
  CalendarEvent,
  CalendarScopeFilter,
  CalendarView,
  CategoryScope,
  CategoryTag,
  DeleteScope,
  EventCategory,
  EventDraft,
  EventOccurrence,
  NotificationSettings,
  ThemeId,
  ThemePreferences,
} from './types/calendar';
import {
  applyStoredEventsPatch,
  deleteStoredEvent,
  loadCustomCategories,
  loadNotificationSettings,
  loadStoredEvents,
  loadThemePreferences,
  loadVisibleCategories,
  loadVisibleScopes,
  putStoredEvent,
  saveCustomCategories,
  saveNotificationSettings,
  saveStoredEvents,
  saveThemePreferences,
  saveVisibleCategories,
  saveVisibleScopes,
} from './services/storage';
import {
  dismissLocalUploadForSession,
  flushSyncQueue,
  getPendingSyncCount,
  isLocalUploadDismissed,
  markLocalSettingsModified,
  pullAndReconcileCloudState,
  subscribeSyncStatus,
  syncSoftDeleteCustomCategory,
  syncSoftDeleteEvent,
  syncUpsertCustomCategory,
  syncUpsertEvent,
  syncUpsertUserSettings,
  uploadLocalDataToAccount,
} from './services/cloudSync';
import {
  clearSignedUrlCache,
  ensureSignedUrlsForEvents,
  getCachedSignedUrlSnapshot,
  subscribeSignedUrls,
} from './services/imageStorage';
import { useAuth } from './contexts/AuthContext';
import { unlockAudioOnFirstInteraction } from './services/sound';
import {
  countEventOccurrencesUpTo,
  expandEventsInRange,
  formatDateInput,
  formatLocalDateTime,
  getMonthWeeks,
  parseLocalDateTime,
  sanitizeExceptionDates,
} from './utils/calendarMath';
import {
  getWeekKey,
  resolveShellTheme,
} from './utils/themeResolver';
import {
  buildCategoryMap,
  getCategoryTagsByScope,
  resolveCategoryMeta,
  resolveTagScope,
} from './constants/categories';
import { useReminderEngine } from './hooks/useReminderEngine';
import { TopNavBar } from './components/layout/TopNavBar';
import { Sidebar } from './components/layout/Sidebar';
import { MonthView } from './components/calendar/MonthView';
import { WeekView } from './components/calendar/WeekView';
import { DayView } from './components/calendar/DayView';
import { EventFormModal } from './components/modals/EventFormModal';
import { EventDetailModal } from './components/modals/EventDetailModal';
import { ThemeStudioModal } from './components/modals/ThemeStudioModal';
import { LocalDataUploadModal } from './components/modals/LocalDataUploadModal';
import { ConfirmRemoveModal } from './components/modals/ConfirmRemoveModal';
import { DeleteRecurrenceModal } from './components/modals/DeleteRecurrenceModal';
import { ReminderToastStack } from './components/notifications/ReminderToastStack';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  NavDirection,
  VIEW_ORDER,
  gridSlideVariants,
  viewSwitchVariants,
} from './motion/presets';
import { calendarGridKey } from './motion/navigation';
import { ThemeCrossFade } from './motion/ThemeTransition';

function makeDefaultDraft(
  date: Date,
  hour = 9,
  minute = 0,
  allDay = false
): EventDraft {
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    allDay ? 0 : hour,
    allDay ? 0 : minute,
    0,
    0
  );
  const end = allDay
    ? new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        23,
        59,
        0,
        0
      )
    : new Date(start.getTime() + 60 * 60 * 1000);

  return {
    title: '',
    start: formatLocalDateTime(start),
    end: formatLocalDateTime(end),
    allDay,
    category: 'class-sched',
    location: '',
    description: '',
    recurrence: 'none',
    isTask: false,
    completed: false,
  };
}

export const App: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [signedUrlsByPath, setSignedUrlsByPath] = useState<
    Record<string, string>
  >(() => getCachedSignedUrlSnapshot());

  const [unsyncedCount, setUnsyncedCount] = useState<number>(() =>
    getPendingSyncCount(user?.id)
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [settingsDirtyTick, setSettingsDirtyTick] = useState<number>(0);
  const lastSyncedDirtyTickRef = useRef<number>(0);
  const lastPullAtRef = useRef<number>(0);

  const [view, setView] = useState<CalendarView>('week');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  // ---------------------------------------------------------------- motion state
  /** Which way the calendar last moved, so the grid can slide directionally. */
  const [navDirection, setNavDirection] = useState<NavDirection>(null);
  /** Which way the view last zoomed (month → week → day). */
  const [viewDirection, setViewDirection] = useState<NavDirection>(null);
  /** Incrementing token that replays the "soaring back to today" pulse. */
  const [todayPulseToken, setTodayPulseToken] = useState(0);
  /** Snapshot target for the palette cross-fade overlay. */
  const appRootRef = useRef<HTMLDivElement | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [customCategories, setCustomCategories] = useState<CategoryTag[]>(() =>
    loadCustomCategories()
  );
  const [visibleCategories, setVisibleCategories] = useState<EventCategory[]>(
    () => loadVisibleCategories(loadCustomCategories())
  );
  /** Which item types the calendar draws at all (Events and/or Tasks). */
  const [visibleScopes, setVisibleScopes] = useState<CategoryScope[]>(() =>
    loadVisibleScopes()
  );

  const [themePrefs, setThemePrefs] = useState<ThemePreferences>(() =>
    loadThemePreferences()
  );
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(() => loadNotificationSettings());

  const eventsRef = useRef<CalendarEvent[]>(events);
  eventsRef.current = events;
  const customCategoriesRef = useRef<CategoryTag[]>(customCategories);
  customCategoriesRef.current = customCategories;

  // Modals state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [activeDraft, setActiveDraft] = useState<EventDraft>(() =>
    makeDefaultDraft(new Date())
  );
  const [selectedOccurrence, setSelectedOccurrence] =
    useState<EventOccurrence | null>(null);
  const [pendingRemoveEventId, setPendingRemoveEventId] = useState<
    string | null
  >(null);
  /**
   * A recurring series being deleted by scope. Holds the event id and the
   * clicked occurrence's local date ("YYYY-MM-DD").
   */
  const [pendingDeleteScope, setPendingDeleteScope] = useState<{
    eventId: string;
    date: string;
  } | null>(null);
  const [themeStudioOpen, setThemeStudioOpen] = useState(false);
  const [pendingLocalUpload, setPendingLocalUpload] = useState<{
    events: CalendarEvent[];
    categories: CategoryTag[];
  } | null>(null);
  const [isUploadingLocalData, setIsUploadingLocalData] = useState(false);
  const [localUploadError, setLocalUploadError] = useState<string | null>(null);

  // Build unified category map (event tags + task tags + custom tags)
  const categoryMap = useMemo(
    () => buildCategoryMap(customCategories),
    [customCategories]
  );
  // Tag lists are split per item type: events and tasks never share a palette.
  const eventCategories = useMemo(
    () =>
      getCategoryTagsByScope('event', customCategories).map(
        (t) => categoryMap[t.id]
      ),
    [categoryMap, customCategories]
  );
  const taskCategories = useMemo(
    () =>
      getCategoryTagsByScope('task', customCategories).map(
        (t) => categoryMap[t.id]
      ),
    [categoryMap, customCategories]
  );

  // Load persisted events from IndexedDB on mount
  useEffect(() => {
    unlockAudioOnFirstInteraction();
    let mounted = true;
    const savedCustom = loadCustomCategories();
    loadStoredEvents(savedCustom).then((loaded) => {
      if (mounted) {
        setEvents(loaded);
        setIsLoaded(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Persist events whenever updated (after initial load) — logged-out local-only path.
  // When logged in, each mutation writes/deletes only its changed row in IndexedDB.
  useEffect(() => {
    if (!isLoaded || userId) return;
    saveStoredEvents(events);
  }, [events, isLoaded, userId]);

  useEffect(() => {
    saveCustomCategories(customCategories);
  }, [customCategories]);

  useEffect(() => {
    saveThemePreferences(themePrefs);
  }, [themePrefs]);

  useEffect(() => {
    saveNotificationSettings(notificationSettings);
  }, [notificationSettings]);

  useEffect(() => {
    saveVisibleCategories(visibleCategories);
  }, [visibleCategories]);

  useEffect(() => {
    saveVisibleScopes(visibleScopes);
  }, [visibleScopes]);

  // Keep unsyncedCount synchronized with the persistent retry queue
  useEffect(() => {
    const refresh = () => {
      setUnsyncedCount(getPendingSyncCount(userId));
    };
    refresh();
    return subscribeSyncStatus(refresh);
  }, [userId]);

  // Keep signedUrlsByPath reactive whenever imageStorage caches a fresh signed URL
  useEffect(() => {
    return subscribeSignedUrls(() => {
      setSignedUrlsByPath(getCachedSignedUrlSnapshot());
    });
  }, []);

  // Resolve ~1-hour signed URLs for Storage-backed images and refresh before expiry
  useEffect(() => {
    if (!userId) {
      clearSignedUrlCache();
      setSignedUrlsByPath({});
      return;
    }

    let cancelled = false;
    let refreshTimer: number | null = null;

    const scheduleSignedUrlRefresh = async () => {
      if (cancelled) return;
      const { urlsByPath, nextRefreshInMs } = await ensureSignedUrlsForEvents(
        eventsRef.current
      );
      if (cancelled) return;
      setSignedUrlsByPath(urlsByPath);

      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      if (nextRefreshInMs !== null) {
        refreshTimer = window.setTimeout(() => {
          void scheduleSignedUrlRefresh();
        }, nextRefreshInMs);
      }
    };

    void scheduleSignedUrlRefresh();

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'hidden') return;
      void scheduleSignedUrlRefresh();
    };

    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      cancelled = true;
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [userId, events]);

  const persistAndSyncEvent = useCallback(
    async (
      event: CalendarEvent,
      includeCreatedAt: boolean,
      previousImagePath?: string
    ) => {
      const uid = userIdRef.current;
      if (!uid) return;
      await putStoredEvent(event);
      const stamped = await syncUpsertEvent(uid, event, {
        includeCreatedAt,
        previousImagePath,
      });
      if (
        (stamped.updatedAt !== event.updatedAt ||
          stamped.imagePath !== event.imagePath ||
          stamped.imageUrl !== event.imageUrl) &&
        userIdRef.current === uid
      ) {
        setEvents((prev) =>
          prev.map((ev) =>
            ev.id === stamped.id && ev.updatedAt === event.updatedAt
              ? stamped
              : ev
          )
        );
      }
    },
    []
  );

  // Reset any open upload prompt when signed out
  useEffect(() => {
    if (!userId) {
      setPendingLocalUpload(null);
      setLocalUploadError(null);
      setIsUploadingLocalData(false);
    }
  }, [userId]);

  const runCloudPull = useCallback(async (uid: string) => {
    setIsSyncing(true);
    try {
      const res = await pullAndReconcileCloudState(uid);
      if (res.ok && userIdRef.current === uid) {
        if (res.customCategories) {
          setCustomCategories(res.customCategories);
        }
        if (res.events) {
          setEvents(res.events);
          setSelectedOccurrence((curr) => {
            if (!curr) return null;
            const updatedMaster = res.events!.find(
              (e) => e.id === curr.masterId
            );
            if (!updatedMaster) return null;
            return { ...curr, event: updatedMaster };
          });
        }
        if (res.settings) {
          setThemePrefs(res.settings.themePrefs);
          setNotificationSettings(res.settings.notificationSettings);
          setVisibleCategories(res.settings.visibleCategories);
          setVisibleScopes(res.settings.visibleScopes);
        }

        const localEvs = res.unuploadedLocalEvents ?? [];
        const localCats = res.unuploadedLocalCategories ?? [];
        if (localEvs.length === 0 && localCats.length === 0) {
          setPendingLocalUpload(null);
          setLocalUploadError(null);
        } else if (!isLocalUploadDismissed(uid)) {
          setPendingLocalUpload({
            events: localEvs,
            categories: localCats,
          });
        }
      }
    } finally {
      if (userIdRef.current === uid) {
        setIsSyncing(false);
        setUnsyncedCount(getPendingSyncCount(uid));
      }
    }
  }, []);

  const handleConfirmLocalUpload = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid || !pendingLocalUpload || isUploadingLocalData) return;

    setIsUploadingLocalData(true);
    setLocalUploadError(null);

    try {
      const result = await uploadLocalDataToAccount(
        uid,
        pendingLocalUpload.events,
        pendingLocalUpload.categories
      );

      if (userIdRef.current !== uid) return;

      if (Object.keys(result.updatedEventsById).length > 0) {
        setEvents((prev) =>
          prev.map((ev) => result.updatedEventsById[ev.id] ?? ev)
        );
      }

      if (pendingLocalUpload.categories.length > 0) {
        const uploadedIds = pendingLocalUpload.categories
          .filter(
            (c) => !result.remainingCategories.some((rem) => rem.id === c.id)
          )
          .map((c) => c.id);
        if (uploadedIds.length > 0) {
          setVisibleCategories((prev) => {
            const merged = [...prev];
            for (const id of uploadedIds) {
              if (!merged.includes(id)) merged.push(id);
            }
            return merged;
          });
          setSettingsDirtyTick((t) => t + 1);
        }
      }

      if (result.ok) {
        setPendingLocalUpload(null);
        setLocalUploadError(null);
      } else {
        setPendingLocalUpload({
          events: result.remainingEvents,
          categories: result.remainingCategories,
        });
        setLocalUploadError(
          result.errorMessage ??
            'Could not finish uploading local items. Your local data is untouched — please try again.'
        );
      }
    } finally {
      if (userIdRef.current === uid) {
        setIsUploadingLocalData(false);
      }
    }
  }, [isUploadingLocalData, pendingLocalUpload]);

  const handleDismissLocalUpload = useCallback(() => {
    const uid = userIdRef.current;
    if (uid) {
      dismissLocalUploadForSession(uid);
    }
    setPendingLocalUpload(null);
    setLocalUploadError(null);
  }, []);

  // Pull on startup (when logged in) and on tab focus / reconnect
  useEffect(() => {
    if (!isLoaded || !userId) return;

    lastPullAtRef.current = Date.now();
    void runCloudPull(userId);

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastPullAtRef.current < 600) return;
      lastPullAtRef.current = now;
      void runCloudPull(userId);
    };

    const onOnline = () => {
      lastPullAtRef.current = Date.now();
      void runCloudPull(userId);
    };

    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    window.addEventListener('online', onOnline);

    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [isLoaded, userId, runCloudPull]);

  // Background retry timer whenever queued writes are pending
  useEffect(() => {
    if (!userId || unsyncedCount === 0) return;
    const timer = window.setInterval(() => {
      if (navigator.onLine !== false) {
        void flushSyncQueue(userId);
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [userId, unsyncedCount]);

  const handleRetrySync = useCallback(() => {
    if (!userId) return;
    lastPullAtRef.current = Date.now();
    void runCloudPull(userId);
  }, [userId, runCloudPull]);

  const handleUpdateNotificationSettings = useCallback(
    (next: NotificationSettings) => {
      setNotificationSettings(next);
      setSettingsDirtyTick((t) => t + 1);
    },
    []
  );

  // Save user-driven settings locally first, then upsert `user_settings` when logged in
  useEffect(() => {
    if (settingsDirtyTick === lastSyncedDirtyTickRef.current) return;
    lastSyncedDirtyTickRef.current = settingsDirtyTick;

    saveThemePreferences(themePrefs);
    saveNotificationSettings(notificationSettings);
    saveVisibleCategories(visibleCategories);
    saveVisibleScopes(visibleScopes);

    const uid = userIdRef.current;
    if (!uid) return;
    markLocalSettingsModified(uid);
    void syncUpsertUserSettings(uid, {
      themePrefs,
      notificationSettings,
      visibleCategories,
      visibleScopes,
    });
  }, [
    settingsDirtyTick,
    themePrefs,
    notificationSettings,
    visibleCategories,
    visibleScopes,
  ]);

  // Custom Category CRUD — every custom tag belongs to either Events or Tasks
  const handleAddCustomCategory = useCallback(
    (label: string, color: string, scope: CategoryScope = 'event'): CategoryTag => {
      const slug = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 18);
      const newTag: CategoryTag = {
        id: `tag-${slug || 'custom'}-${Date.now().toString(36)}`,
        label: label.trim(),
        color,
        isCustom: true,
        scope,
      };
      const nextCustom = [...customCategoriesRef.current, newTag];
      saveCustomCategories(nextCustom);
      setCustomCategories(nextCustom);
      setVisibleCategories((prev) =>
        prev.includes(newTag.id) ? prev : [...prev, newTag.id]
      );
      setSettingsDirtyTick((t) => t + 1);

      const uid = userIdRef.current;
      if (uid) {
        void syncUpsertCustomCategory(uid, newTag);
      }
      return newTag;
    },
    []
  );

  const handleDeleteCustomCategory = useCallback(
    (id: string) => {
      const currentCustom = customCategoriesRef.current;
      const targetTag = currentCustom.find((t) => t.id === id);
      const scope = resolveTagScope(id, currentCustom);
      const nextCustom = currentCustom.filter((t) => t.id !== id);

      saveCustomCategories(nextCustom);
      setCustomCategories(nextCustom);
      setVisibleCategories((prev) => prev.filter((c) => c !== id));
      setSettingsDirtyTick((t) => t + 1);

      // Reassign affected items to their own scope's fallback tag
      const nowIso = new Date().toISOString();
      const reassignedEvents: CalendarEvent[] = [];
      const nextEvents = eventsRef.current.map((ev) => {
        if (ev.category !== id) return ev;
        const updated: CalendarEvent = {
          ...ev,
          category: scope === 'task' ? 'academic' : 'class-sched',
          updatedAt: nowIso,
        };
        reassignedEvents.push(updated);
        return updated;
      });

      if (reassignedEvents.length > 0) {
        setEvents(nextEvents);
      }

      const uid = userIdRef.current;
      if (uid) {
        void (async () => {
          if (reassignedEvents.length > 0) {
            await applyStoredEventsPatch(reassignedEvents, []);
          }
          await Promise.all([
            ...(targetTag
              ? [syncSoftDeleteCustomCategory(uid, targetTag)]
              : []),
            ...reassignedEvents.map((ev) =>
              syncUpsertEvent(uid, ev, { includeCreatedAt: true })
            ),
          ]);
        })();
      }
    },
    []
  );

  // Resolve shell theme based on current view & date
  const shellResolved = useMemo(
    () => resolveShellTheme(view, currentDate, themePrefs),
    [view, currentDate, themePrefs]
  );

  const themeOverrideCount =
    Object.keys(themePrefs.monthThemes).length +
    Object.keys(themePrefs.weekThemes).length;

  // Hydrate Storage-backed events with live ~1-hour signed URLs for UI display
  const hydratedEvents = useMemo(() => {
    if (!userId) return events;
    return events.map((ev) => {
      if (!ev.imagePath || ev.imageUrl?.startsWith('data:')) {
        return ev;
      }
      const signed = signedUrlsByPath[ev.imagePath];
      return signed ? { ...ev, imageUrl: signed } : ev;
    });
  }, [events, signedUrlsByPath, userId]);

  const hydratedSelectedOccurrence = useMemo(() => {
    if (!selectedOccurrence) return null;
    const ev = selectedOccurrence.event;
    if (!userId || !ev.imagePath || ev.imageUrl?.startsWith('data:')) {
      return selectedOccurrence;
    }
    const signed = signedUrlsByPath[ev.imagePath];
    if (!signed || ev.imageUrl === signed) {
      return selectedOccurrence;
    }
    return {
      ...selectedOccurrence,
      event: { ...ev, imageUrl: signed },
    };
  }, [selectedOccurrence, signedUrlsByPath, userId]);

  // Filter master items by item type (event/task), tag visibility & search
  const filteredMasterEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return hydratedEvents.filter((ev) => {
      const scope: CategoryScope = ev.isTask ? 'task' : 'event';
      if (!visibleScopes.includes(scope)) return false;
      if (!visibleCategories.includes(ev.category)) return false;
      if (!q) return true;
      const catLabel = resolveCategoryMeta(ev.category, categoryMap, scope).label;
      return (
        ev.title.toLowerCase().includes(q) ||
        ev.description.toLowerCase().includes(q) ||
        ev.location.toLowerCase().includes(q) ||
        catLabel.toLowerCase().includes(q)
      );
    });
  }, [categoryMap, hydratedEvents, searchQuery, visibleCategories, visibleScopes]);

  // Expand occurrences across a generous window around currentDate for main view + mini-calendar
  const expandedOccurrences = useMemo(() => {
    const winStart = startOfWeek(startOfMonth(subMonths(currentDate, 1)), {
      weekStartsOn: 0,
    });
    const winEnd = endOfWeek(endOfMonth(addMonths(currentDate, 1)), {
      weekStartsOn: 0,
    });
    return expandEventsInRange(filteredMasterEvents, winStart, winEnd);
  }, [currentDate, filteredMasterEvents]);

  const handleOpenEventById = useCallback(
    (eventId: string) => {
      const target = hydratedEvents.find((e) => e.id === eventId);
      if (!target) return;
      const expanded = expandEventsInRange(
        [target],
        subDays(new Date(), 1),
        addMonths(new Date(), 3)
      );
      if (expanded[0]) {
        setCurrentDate(expanded[0].start);
        setSelectedDate(expanded[0].start);
        setSelectedOccurrence(expanded[0]);
      }
    },
    [hydratedEvents]
  );

  const {
    permissionStatus,
    requestBrowserPermission,
    activeToasts,
    dismissToast,
    upcomingReminders,
    triggerTestReminder,
  } = useReminderEngine({
    events: hydratedEvents,
    settings: notificationSettings,
    onUpdateSettings: handleUpdateNotificationSettings,
    activeTheme: shellResolved.theme,
    onOpenEventById: handleOpenEventById,
  });

  const prefersReducedMotion = useReducedMotion();
  // With reduced motion requested we keep a pure cross-fade (no directional
  // slide) so the grid change stays perceivable but static.
  const effectiveNavDirection: NavDirection = prefersReducedMotion
    ? null
    : navDirection;
  const effectiveViewDirection: NavDirection = prefersReducedMotion
    ? null
    : viewDirection;

  // Animated view switching (Month <-> Week <-> Day cross-fade + subtle scale)
  const handleChangeView = useCallback(
    (nextView: CalendarView) => {
      setView((prevView) => {
        if (prevView === nextView) return prevView;
        setViewDirection(
          VIEW_ORDER[nextView] > VIEW_ORDER[prevView] ? 'next' : 'prev'
        );
        return nextView;
      });
    },
    []
  );

  // Navigation Handlers
  const handleToggleSidebar = useCallback(() => {
    if (window.innerWidth < 1024) {
      setMobileDrawerOpen((o) => !o);
    } else {
      setSidebarOpen((o) => !o);
    }
  }, []);

  const handleNavigatePrev = useCallback(() => {
    setNavDirection('prev');
    setCurrentDate((d) => {
      if (view === 'month') return subMonths(d, 1);
      if (view === 'week') return subWeeks(d, 1);
      return subDays(d, 1);
    });
  }, [view]);

  const handleNavigateNext = useCallback(() => {
    setNavDirection('next');
    setCurrentDate((d) => {
      if (view === 'month') return addMonths(d, 1);
      if (view === 'week') return addWeeks(d, 1);
      return addDays(d, 1);
    });
  }, [view]);

  const handleJumpToday = useCallback(() => {
    const today = new Date();
    setNavDirection(null);
    setCurrentDate(today);
    setSelectedDate(today);
    // Replay the landing pulse on the today cell every time (even if already here)
    setTodayPulseToken((t) => t + 1);
  }, []);

  // Keyboard shortcuts (when not typing inside form fields)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (
        formModalOpen ||
        selectedOccurrence ||
        Boolean(pendingRemoveEventId) ||
        themeStudioOpen ||
        Boolean(pendingLocalUpload) ||
        Boolean(pendingDeleteScope)
      ) {
        return;
      }

      if (e.key === 'm' || e.key === 'M') handleChangeView('month');
      else if (e.key === 'w' || e.key === 'W') handleChangeView('week');
      else if (e.key === 'd' || e.key === 'D') handleChangeView('day');
      else if (e.key === 't' || e.key === 'T') handleJumpToday();
      else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setActiveDraft(makeDefaultDraft(selectedDate, 9, 0, false));
        setFormModalOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    formModalOpen,
    handleChangeView,
    handleJumpToday,
    pendingLocalUpload,
    pendingRemoveEventId,
    selectedDate,
    selectedOccurrence,
    themeStudioOpen,
  ]);

  // Event CRUD Handlers
  const handleSaveDraft = useCallback(
    (draft: EventDraft) => {
      const nowIso = new Date().toISOString();
      const resolvedImageUrl =
        draft.imagePath && !draft.imageUrl?.startsWith('data:')
          ? undefined
          : draft.imageUrl;

      if (draft.id) {
        const existing = eventsRef.current.find((ev) => ev.id === draft.id);
        const previousImagePath = existing?.imagePath;
        const updatedEvent: CalendarEvent = {
          ...(existing ?? { id: draft.id, createdAt: nowIso }),
          title: draft.title,
          start: draft.start,
          end: draft.end,
          allDay: draft.allDay,
          category: draft.category,
          location: draft.location,
          description: draft.description,
          recurrence: draft.recurrence,
          recurrenceUntil: draft.recurrenceUntil,
          customRecurrence: draft.customRecurrence,
          imageUrl: resolvedImageUrl,
          imagePath: draft.imagePath,
          imageName: draft.imageName,
          isTask: draft.isTask,
          completed: draft.completed ?? existing?.completed ?? false,
          updatedAt: nowIso,
        };
        setEvents((prev) =>
          prev.map((ev) => (ev.id === draft.id ? updatedEvent : ev))
        );
        if (userIdRef.current) {
          void persistAndSyncEvent(updatedEvent, true, previousImagePath);
        }
      } else {
        const newEvent: CalendarEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: draft.title,
          start: draft.start,
          end: draft.end,
          allDay: draft.allDay,
          category: draft.category,
          location: draft.location,
          description: draft.description,
          recurrence: draft.recurrence,
          recurrenceUntil: draft.recurrenceUntil,
          customRecurrence: draft.customRecurrence,
          imageUrl: resolvedImageUrl,
          imagePath: draft.imagePath,
          imageName: draft.imageName,
          isTask: draft.isTask,
          completed: draft.completed ?? false,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        setEvents((prev) => [...prev, newEvent]);
        if (userIdRef.current) {
          void persistAndSyncEvent(newEvent, false);
        }
      }
      setFormModalOpen(false);
    },
    [persistAndSyncEvent]
  );

  const pendingRemoveTarget = useMemo(
    () =>
      pendingRemoveEventId
        ? events.find((e) => e.id === pendingRemoveEventId) ?? null
        : null,
    [events, pendingRemoveEventId]
  );

  useEffect(() => {
    if (pendingRemoveEventId && !pendingRemoveTarget) {
      setPendingRemoveEventId(null);
    }
  }, [pendingRemoveEventId, pendingRemoveTarget]);

  const handleRequestRemoveEvent = useCallback(
    (eventId: string, occurrenceDate?: string) => {
      const targetEvent = eventsRef.current.find((e) => e.id === eventId);
      if (!targetEvent) return;

      const isRecurring =
        Boolean(targetEvent.recurrence) && targetEvent.recurrence !== 'none';

      // Single events / tasks, and recurring series with only one occurrence,
      // delete immediately with no modal.
      if (
        !isRecurring ||
        countEventOccurrencesUpTo(targetEvent, 2) <= 1
      ) {
        setPendingRemoveEventId(eventId);
        return;
      }

      // Recurring series with more than one occurrence: ask for scope.
      const date =
        occurrenceDate ?? targetEvent.start.split('T')[0];
      setPendingDeleteScope({ eventId, date });
    },
    []
  );

  const handleCancelRemoveEvent = useCallback(() => {
    setPendingRemoveEventId(null);
  }, []);

  const handleConfirmRemoveEvent = useCallback(() => {
    if (!pendingRemoveEventId) return;
    const eventId = pendingRemoveEventId;
    const targetEvent = eventsRef.current.find((e) => e.id === eventId);

    setPendingRemoveEventId(null);
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    setSelectedOccurrence(null);
    setFormModalOpen(false);

    const uid = userIdRef.current;
    if (uid) {
      void (async () => {
        await deleteStoredEvent(eventId);
        if (targetEvent) {
          await syncSoftDeleteEvent(uid, targetEvent);
        }
      })();
    } else {
      void deleteStoredEvent(eventId);
    }
  }, [pendingRemoveEventId]);

  const softDeleteSeries = useCallback(
    async (ev: CalendarEvent) => {
      setEvents((prev) => prev.filter((e) => e.id !== ev.id));
      const uid = userIdRef.current;
      if (uid) {
        void (async () => {
          await deleteStoredEvent(ev.id);
          await syncSoftDeleteEvent(uid, ev);
        })();
      } else {
        await deleteStoredEvent(ev.id);
      }
    },
    []
  );

  const handleConfirmDeleteScope = useCallback(
    async (scope: DeleteScope) => {
      const current = pendingDeleteScope;
      if (!current) return;
      const { eventId, date: D } = current;
      const targetEvent = eventsRef.current.find((e) => e.id === eventId);
      if (!targetEvent) {
        setPendingDeleteScope(null);
        return;
      }

      const uid = userIdRef.current;
      const nowIso = new Date().toISOString();

      setPendingDeleteScope(null);
      setSelectedOccurrence(null);
      setFormModalOpen(false);

      if (scope === 'all') {
        await softDeleteSeries(targetEvent);
        return;
      }

      if (scope === 'this') {
        const existing = sanitizeExceptionDates(targetEvent.exceptionDates);
        const next = existing.includes(D)
          ? existing
          : [...existing, D];
        const remaining = countEventOccurrencesUpTo(
          { ...targetEvent, exceptionDates: next },
          2
        );
        if (remaining <= 0) {
          await softDeleteSeries(targetEvent);
          return;
        }
        const updated: CalendarEvent = {
          ...targetEvent,
          exceptionDates: next,
          updatedAt: nowIso,
        };
        setEvents((prev) =>
          prev.map((e) => (e.id === eventId ? updated : e))
        );
        if (uid) {
          void persistAndSyncEvent(updated, true);
        } else {
          await putStoredEvent(updated);
        }
        return;
      }

      // scope === 'thisAndFollowing'
      const baseStart = parseLocalDateTime(targetEvent.start);
      const firstOcc = expandEventsInRange(
        [targetEvent],
        startOfDay(baseStart),
        addYears(baseStart, 1)
      )[0];
      const firstDate = firstOcc
        ? formatDateInput(firstOcc.start)
        : null;
      if (firstDate && D <= firstDate) {
        // D is the first occurrence: nothing to keep before it.
        await softDeleteSeries(targetEvent);
        return;
      }

      const dayBefore = formatDateInput(
        subDays(parseLocalDateTime(`${D}T00:00`), 1)
      );
      const nextUntil = dayBefore;
      const nextExceptions = sanitizeExceptionDates(
        targetEvent.exceptionDates
      ).filter((d) => d < D);
      const updated: CalendarEvent = {
        ...targetEvent,
        recurrenceUntil: nextUntil,
        exceptionDates:
          nextExceptions.length > 0 ? nextExceptions : undefined,
        updatedAt: nowIso,
      };
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? updated : e))
      );
      if (uid) {
        void persistAndSyncEvent(updated, true);
      } else {
        await putStoredEvent(updated);
      }
    },
    [
      pendingDeleteScope,
      softDeleteSeries,
      persistAndSyncEvent,
      putStoredEvent,
    ]
  );

  const handleToggleTaskComplete = useCallback(
    (eventId: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const existing = eventsRef.current.find((ev) => ev.id === eventId);
      if (!existing) return;

      const updatedEvent: CalendarEvent = {
        ...existing,
        completed: !existing.completed,
        updatedAt: new Date().toISOString(),
      };

      setEvents((prev) =>
        prev.map((ev) => (ev.id === eventId ? updatedEvent : ev))
      );
      setSelectedOccurrence((curr) =>
        curr && curr.masterId === eventId
          ? {
              ...curr,
              event: updatedEvent,
            }
          : curr
      );

      if (userIdRef.current) {
        void persistAndSyncEvent(updatedEvent, true);
      }
    },
    [persistAndSyncEvent]
  );

  const handleEditOccurrence = useCallback((occ: EventOccurrence) => {
    const ev = occ.event;
    setSelectedOccurrence(null);
    setActiveDraft({
      id: ev.id,
      title: ev.title,
      start: ev.start,
      end: ev.end,
      allDay: ev.allDay,
      category: ev.category,
      location: ev.location,
      description: ev.description,
      recurrence: ev.recurrence,
      recurrenceUntil: ev.recurrenceUntil,
      customRecurrence: ev.customRecurrence,
      imageUrl: ev.imageUrl,
      imagePath: ev.imagePath,
      imageName: ev.imageName,
      isTask: ev.isTask,
      completed: ev.completed,
    });
    setFormModalOpen(true);
  }, []);

  const handleDuplicateOccurrence = useCallback((occ: EventOccurrence) => {
    const ev = occ.event;
    setSelectedOccurrence(null);
    setActiveDraft({
      title: `${ev.title} (Copy)`,
      start: formatLocalDateTime(occ.start),
      end: formatLocalDateTime(occ.end),
      allDay: ev.allDay,
      category: ev.category,
      location: ev.location,
      description: ev.description,
      recurrence: ev.recurrence,
      recurrenceUntil: ev.recurrenceUntil,
      customRecurrence: ev.customRecurrence,
      imageUrl: ev.imageUrl,
      imagePath: ev.imagePath,
      imageName: ev.imageName,
      isTask: ev.isTask,
      completed: false,
    });
    setFormModalOpen(true);
  }, []);

  // Schedule a real event starting in +10m 05s so its 10-min pre-event reminder triggers in 5 seconds!
  const handleScheduleLiveTenMinDemo = useCallback(() => {
    const start = new Date(Date.now() + 10 * 60 * 1000 + 5 * 1000);
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    const nowIso = new Date().toISOString();

    const demoEvent: CalendarEvent = {
      id: `demo-10m-${Date.now()}`,
      title: 'Live 10-Min Reminder Demo Session',
      start: format(start, "yyyy-MM-dd'T'HH:mm:ss"),
      end: format(end, "yyyy-MM-dd'T'HH:mm:ss"),
      allDay: false,
      category: 'class-exams',
      location: 'Notification Engine Room',
      description:
        'Scheduled 10 minutes and 5 seconds ahead to demonstrate the exact 10-minute automated pre-event alert in real time.',
      recurrence: 'none',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setEvents((prev) => [...prev, demoEvent]);
    setCurrentDate(start);
    setSelectedDate(start);
    if (userIdRef.current) {
      void persistAndSyncEvent(demoEvent, false);
    }
  }, [persistAndSyncEvent]);

  // Theme Assignment Handlers
  const handleSetGlobalTheme = useCallback((theme: ThemeId) => {
    setThemePrefs((prev) => ({ ...prev, globalTheme: theme }));
    setSettingsDirtyTick((t) => t + 1);
  }, []);

  const handleSetMonthTheme = useCallback(
    (monthKey: string, theme: ThemeId | null) => {
      setThemePrefs((prev) => {
        const nextMonths = { ...prev.monthThemes };
        if (theme === null) delete nextMonths[monthKey];
        else nextMonths[monthKey] = theme;
        return { ...prev, monthThemes: nextMonths };
      });
      setSettingsDirtyTick((t) => t + 1);
    },
    []
  );

  const handleSetWeekTheme = useCallback(
    (weekKey: string, theme: ThemeId | null) => {
      setThemePrefs((prev) => {
        const nextWeeks = { ...prev.weekThemes };
        if (theme === null) delete nextWeeks[weekKey];
        else nextWeeks[weekKey] = theme;
        return { ...prev, weekThemes: nextWeeks };
      });
      setSettingsDirtyTick((t) => t + 1);
    },
    []
  );

  const handleApplySplitWeekDemo = useCallback((monthDate: Date) => {
    const weeks = getMonthWeeks(monthDate);
    const demoRotation: ThemeId[] = [
      'light',
      'wednesday',
      'ooo',
      'dark',
    ];
    setThemePrefs((prev) => {
      const nextWeeks = { ...prev.weekThemes };
      weeks.forEach((wDays, idx) => {
        const wKey = getWeekKey(wDays[0]);
        nextWeeks[wKey] = demoRotation[idx % demoRotation.length];
      });
      return {
        ...prev,
        weekThemes: nextWeeks,
      };
    });
    setSettingsDirtyTick((t) => t + 1);
    handleChangeView('month');
  }, [handleChangeView]);

  const handleClearAllOverrides = useCallback(() => {
    setThemePrefs((prev) => ({
      ...prev,
      monthThemes: {},
      weekThemes: {},
    }));
    setSettingsDirtyTick((t) => t + 1);
  }, []);

  const handleToggleCategory = useCallback((cat: EventCategory) => {
    setVisibleCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
    setSettingsDirtyTick((t) => t + 1);
  }, []);

  /**
   * Master switch for the Event / Task calendars. Hiding every tag of a type
   * also clears its tag selections so re-enabling it restores a sensible view.
   */
  const handleToggleScope = useCallback((scope: CategoryScope) => {
    setVisibleScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
    setSettingsDirtyTick((t) => t + 1);
  }, []);

  /** "Events only" / "Tasks only" / "Both" quick presets. */
  const handleSetScopeFilter = useCallback((filter: CalendarScopeFilter) => {
    if (filter === 'both') setVisibleScopes(['event', 'task']);
    else if (filter === 'events') setVisibleScopes(['event']);
    else setVisibleScopes(['task']);
    setSettingsDirtyTick((t) => t + 1);
  }, []);

  return (
    <div
      ref={appRootRef}
      data-theme={shellResolved.theme}
      className="app-shell w-screen overflow-hidden flex flex-col bg-theme-bg text-theme-text"
    >
      {/* Top Navigation Bar */}
      <TopNavBar
        view={view}
        currentDate={currentDate}
        activeTheme={shellResolved.theme}
        activeThemeSource={shellResolved.source}
        themeOverrideCount={themeOverrideCount}
        searchQuery={searchQuery}
        allEvents={hydratedEvents}
        categoryMap={categoryMap}
        permissionStatus={permissionStatus}
        notificationSettings={notificationSettings}
        upcomingReminders={upcomingReminders}
        unsyncedCount={unsyncedCount}
        isSyncing={isSyncing}
        onRetrySync={handleRetrySync}
        onToggleSidebar={handleToggleSidebar}
        onChangeView={handleChangeView}
        onNavigatePrev={handleNavigatePrev}
        onNavigateNext={handleNavigateNext}
        onJumpToday={handleJumpToday}
        onSearchChange={setSearchQuery}
        onJumpToSearchResult={(occ) => {
          setNavDirection(null);
          setCurrentDate(occ.start);
          setSelectedDate(occ.start);
          setSelectedOccurrence(occ);
        }}
        onOpenThemeStudio={() => setThemeStudioOpen(true)}
        onRequestNotificationPermission={requestBrowserPermission}
        onUpdateNotificationSettings={handleUpdateNotificationSettings}
        onTriggerPreviewAlert={triggerTestReminder}
        onScheduleLiveTenMinDemo={handleScheduleLiveTenMinDemo}
      />

      {/* Main Content Area: Sidebar + Calendar View */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          isOpen={sidebarOpen}
          isMobileDrawerOpen={mobileDrawerOpen}
          currentDate={currentDate}
          selectedDate={selectedDate}
          occurrences={expandedOccurrences}
          eventCategories={eventCategories}
          taskCategories={taskCategories}
          visibleCategories={visibleCategories}
          visibleScopes={visibleScopes}
          themePrefs={themePrefs}
          onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
          onCreateEvent={() => {
            setActiveDraft(makeDefaultDraft(selectedDate, 9, 0, false));
            setFormModalOpen(true);
          }}
          onSelectMiniDate={(date) => {
            setSelectedDate(date);
            setNavDirection(null);
            setCurrentDate(date);
          }}
          onToggleCategory={handleToggleCategory}
          onToggleScope={handleToggleScope}
          onSetScopeFilter={handleSetScopeFilter}
          onAddCustomCategory={handleAddCustomCategory}
          onDeleteCustomCategory={handleDeleteCustomCategory}
          onSetGlobalTheme={handleSetGlobalTheme}
          onOpenThemeStudio={() => setThemeStudioOpen(true)}
          onApplySplitWeekDemo={() => handleApplySplitWeekDemo(currentDate)}
        />

        <main
          data-calendar-region
          className="flex-1 flex flex-col min-w-0 min-h-0 p-2 sm:p-3.5 gap-2"
        >
          {/* Active Search Filter Pill Banner */}
          {searchQuery.trim() && (
            <div className="shrink-0 flex items-center justify-between gap-2 rounded-xl border border-theme-border bg-theme-surface px-3.5 py-2 text-xs shadow-sm">
              <div className="flex items-center gap-2 text-theme-text-secondary">
                <Filter className="w-3.5 h-3.5 text-theme-accent" />
                <span>
                  Filtering calendar grid for{' '}
                  <strong className="text-theme-text">
                    &ldquo;{searchQuery}&rdquo;
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-bold text-theme-accent hover:bg-theme-accent-soft"
              >
                <X className="w-3.5 h-3.5" />
                Clear filter
              </button>
            </div>
          )}

          {/* Active Calendar Renderer
              Layer 1 (outer): Month <-> Week <-> Day cross-fade + subtle scale.
              Layer 2 (inner): directional slide for Next / Previous / Today.
              Both layers are absolutely positioned inside a fixed-size stage so
              the surrounding layout never shifts while views recalculate. */}
          <div className="flex-1 min-h-0 relative overflow-hidden">
            <AnimatePresence initial={false} custom={effectiveViewDirection}>
              <motion.div
                key={view}
                custom={effectiveViewDirection}
                variants={viewSwitchVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="absolute inset-0 gpu-layer"
                style={{ transformOrigin: 'center center' }}
              >
                <AnimatePresence initial={false} custom={effectiveNavDirection}>
                  <motion.div
                    key={calendarGridKey(currentDate, view)}
                    custom={effectiveNavDirection}
                    variants={gridSlideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="absolute inset-0 gpu-layer"
                  >
            {view === 'month' && (
              <MonthView
                currentDate={currentDate}
                selectedDate={selectedDate}
                occurrences={expandedOccurrences}
                categoryMap={categoryMap}
                themePrefs={themePrefs}
                onSelectDate={setSelectedDate}
                onCreateAtDate={(date) => {
                  setActiveDraft(makeDefaultDraft(date, 9, 0, false));
                  setFormModalOpen(true);
                }}
                onSelectOccurrence={(occ) => setSelectedOccurrence(occ)}
                onToggleTaskComplete={handleToggleTaskComplete}
                todayPulseToken={todayPulseToken}
                onAssignWeekTheme={handleSetWeekTheme}
                onJumpToDayView={(date) => {
                  setSelectedDate(date);
                  setCurrentDate(date);
                  handleChangeView('day');
                }}
              />
            )}

            {view === 'week' && (
              <WeekView
                currentDate={currentDate}
                selectedDate={selectedDate}
                occurrences={expandedOccurrences}
                categoryMap={categoryMap}
                activeTheme={shellResolved.theme}
                todayPulseToken={todayPulseToken}
                onSelectDate={setSelectedDate}
                onCreateAtSlot={(date, hour, minute, allDay) => {
                  setActiveDraft(makeDefaultDraft(date, hour, minute, allDay));
                  setFormModalOpen(true);
                }}
                onSelectOccurrence={(occ) => setSelectedOccurrence(occ)}
                onToggleTaskComplete={handleToggleTaskComplete}
                onJumpToDayView={(date) => {
                  setSelectedDate(date);
                  setCurrentDate(date);
                  handleChangeView('day');
                }}
              />
            )}

            {view === 'day' && (
              <DayView
                currentDate={currentDate}
                occurrences={expandedOccurrences}
                categoryMap={categoryMap}
                activeTheme={shellResolved.theme}
                todayPulseToken={todayPulseToken}
                onCreateAtSlot={(date, hour, minute, allDay) => {
                  setActiveDraft(makeDefaultDraft(date, hour, minute, allDay));
                  setFormModalOpen(true);
                }}
                onSelectOccurrence={(occ) => setSelectedOccurrence(occ)}
                onToggleTaskComplete={handleToggleTaskComplete}
              />
            )}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Create / Edit Event Modal */}
      <EventFormModal
        isOpen={formModalOpen}
        initialDraft={activeDraft}
        eventCategories={eventCategories}
        taskCategories={taskCategories}
        onAddCustomCategory={handleAddCustomCategory}
        onDeleteCustomCategory={handleDeleteCustomCategory}
        onClose={() => setFormModalOpen(false)}
        onSave={handleSaveDraft}
        onDelete={handleRequestRemoveEvent}
      />

      {/* Event Detail Modal (with Full Image Preview & Lightbox) */}
      <EventDetailModal
        occurrence={hydratedSelectedOccurrence}
        categoryMap={categoryMap}
        onClose={() => setSelectedOccurrence(null)}
        onEdit={handleEditOccurrence}
        onDelete={handleRequestRemoveEvent}
        onDuplicate={handleDuplicateOccurrence}
        onToggleTaskComplete={handleToggleTaskComplete}
      />

      {/* Remove Event / Task Confirmation Modal */}
      <ConfirmRemoveModal
        target={pendingRemoveTarget}
        onCancel={handleCancelRemoveEvent}
        onConfirm={handleConfirmRemoveEvent}
      />

      {/* Delete a recurring series by scope (this / this-and-following / all) */}
      {Boolean(pendingDeleteScope) && (
        <DeleteRecurrenceModal
          target={
            events.find((e) => e.id === pendingDeleteScope!.eventId) ?? null
          }
          occurrenceDate={pendingDeleteScope!.date}
          onCancel={() => setPendingDeleteScope(null)}
          onConfirm={handleConfirmDeleteScope}
        />
      )}

      {/* Dynamic Weekly & Monthly Theme Engine Studio */}
      <ThemeStudioModal
        isOpen={themeStudioOpen}
        currentDate={currentDate}
        themePrefs={themePrefs}
        onClose={() => setThemeStudioOpen(false)}
        onSetGlobalTheme={handleSetGlobalTheme}
        onSetMonthTheme={handleSetMonthTheme}
        onSetWeekTheme={handleSetWeekTheme}
        onApplySplitWeekDemo={handleApplySplitWeekDemo}
        onClearAllOverrides={handleClearAllOverrides}
      />

      {/* First-Login Local Data Upload Prompt */}
      <LocalDataUploadModal
        isOpen={Boolean(userId && pendingLocalUpload)}
        eventCount={pendingLocalUpload?.events.length ?? 0}
        categoryCount={pendingLocalUpload?.categories.length ?? 0}
        isUploading={isUploadingLocalData}
        errorMessage={localUploadError}
        onUpload={handleConfirmLocalUpload}
        onNotNow={handleDismissLocalUpload}
      />

      {/* Animated In-App 10-Minute Reminder Toast Stack */}
      <ReminderToastStack
        toasts={activeToasts}
        categoryMap={categoryMap}
        onDismiss={dismissToast}
        onInspectEvent={(eventId, toastId) => {
          dismissToast(toastId);
          handleOpenEventById(eventId);
        }}
      />

      {/* Soft palette cross-fade between full surface themes */}
      <ThemeCrossFade theme={shellResolved.theme} targetRef={appRootRef} />
    </div>
  );
};

export default App;
