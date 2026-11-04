import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import { Filter, X } from 'lucide-react';
import {
  CalendarEvent,
  CalendarView,
  CategoryTag,
  EventCategory,
  EventDraft,
  EventOccurrence,
  NotificationSettings,
  ThemeId,
  ThemePreferences,
} from './types/calendar';
import {
  loadCustomCategories,
  loadNotificationSettings,
  loadStoredEvents,
  loadThemePreferences,
  loadVisibleCategories,
  saveCustomCategories,
  saveNotificationSettings,
  saveStoredEvents,
  saveThemePreferences,
  saveVisibleCategories,
} from './services/storage';
import { unlockAudioOnFirstInteraction } from './services/sound';
import {
  expandEventsInRange,
  formatLocalDateTime,
  getMonthWeeks,
} from './utils/calendarMath';
import {
  getWeekKey,
  resolveShellTheme,
} from './utils/themeResolver';
import {
  buildCategoryMap,
  resolveCategoryMeta,
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
import { ReminderToastStack } from './components/notifications/ReminderToastStack';

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
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [view, setView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [customCategories, setCustomCategories] = useState<CategoryTag[]>(() =>
    loadCustomCategories()
  );
  const [visibleCategories, setVisibleCategories] = useState<EventCategory[]>(
    () => loadVisibleCategories(loadCustomCategories())
  );

  const [themePrefs, setThemePrefs] = useState<ThemePreferences>(() =>
    loadThemePreferences()
  );
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(() => loadNotificationSettings());

  // Modals state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [activeDraft, setActiveDraft] = useState<EventDraft>(() =>
    makeDefaultDraft(new Date())
  );
  const [selectedOccurrence, setSelectedOccurrence] =
    useState<EventOccurrence | null>(null);
  const [themeStudioOpen, setThemeStudioOpen] = useState(false);

  // Build unified category map & ordered list (3 built-in tags + user custom tags)
  const categoryMap = useMemo(
    () => buildCategoryMap(customCategories),
    [customCategories]
  );
  const categoriesList = useMemo(
    () => Object.values(categoryMap),
    [categoryMap]
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

  // Persist events whenever updated (after initial load)
  useEffect(() => {
    if (!isLoaded) return;
    saveStoredEvents(events);
  }, [events, isLoaded]);

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

  // Custom Category CRUD
  const handleAddCustomCategory = useCallback(
    (label: string, color: string): CategoryTag => {
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
      };
      setCustomCategories((prev) => [...prev, newTag]);
      setVisibleCategories((prev) =>
        prev.includes(newTag.id) ? prev : [...prev, newTag.id]
      );
      return newTag;
    },
    []
  );

  const handleDeleteCustomCategory = useCallback((id: string) => {
    setCustomCategories((prev) => prev.filter((t) => t.id !== id));
    setVisibleCategories((prev) => prev.filter((c) => c !== id));
    // Reassign any events using the deleted tag back to Class Sched
    setEvents((prev) =>
      prev.map((ev) =>
        ev.category === id ? { ...ev, category: 'class-sched' } : ev
      )
    );
  }, []);

  // Resolve shell theme based on current view & date
  const shellResolved = useMemo(
    () => resolveShellTheme(view, currentDate, themePrefs),
    [view, currentDate, themePrefs]
  );

  const themeOverrideCount =
    Object.keys(themePrefs.monthThemes).length +
    Object.keys(themePrefs.weekThemes).length;

  // Filter master events by search query & visible categories
  const filteredMasterEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((ev) => {
      if (!visibleCategories.includes(ev.category)) return false;
      if (!q) return true;
      const catLabel = resolveCategoryMeta(ev.category, categoryMap).label;
      return (
        ev.title.toLowerCase().includes(q) ||
        ev.description.toLowerCase().includes(q) ||
        ev.location.toLowerCase().includes(q) ||
        catLabel.toLowerCase().includes(q)
      );
    });
  }, [categoryMap, events, searchQuery, visibleCategories]);

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
      const target = events.find((e) => e.id === eventId);
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
    [events]
  );

  const {
    permissionStatus,
    requestBrowserPermission,
    activeToasts,
    dismissToast,
    upcomingReminders,
    triggerTestReminder,
  } = useReminderEngine({
    events,
    settings: notificationSettings,
    onUpdateSettings: setNotificationSettings,
    activeTheme: shellResolved.theme,
    onOpenEventById: handleOpenEventById,
  });

  // Navigation Handlers
  const handleToggleSidebar = useCallback(() => {
    if (window.innerWidth < 1024) {
      setMobileDrawerOpen((o) => !o);
    } else {
      setSidebarOpen((o) => !o);
    }
  }, []);

  const handleNavigatePrev = useCallback(() => {
    setCurrentDate((d) => {
      if (view === 'month') return subMonths(d, 1);
      if (view === 'week') return subWeeks(d, 1);
      return subDays(d, 1);
    });
  }, [view]);

  const handleNavigateNext = useCallback(() => {
    setCurrentDate((d) => {
      if (view === 'month') return addMonths(d, 1);
      if (view === 'week') return addWeeks(d, 1);
      return addDays(d, 1);
    });
  }, [view]);

  const handleJumpToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
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
      if (formModalOpen || selectedOccurrence || themeStudioOpen) return;

      if (e.key === 'm' || e.key === 'M') setView('month');
      else if (e.key === 'w' || e.key === 'W') setView('week');
      else if (e.key === 'd' || e.key === 'D') setView('day');
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
    handleJumpToday,
    selectedDate,
    selectedOccurrence,
    themeStudioOpen,
  ]);

  // Event CRUD Handlers
  const handleSaveDraft = useCallback((draft: EventDraft) => {
    const nowIso = new Date().toISOString();
    if (draft.id) {
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === draft.id
            ? {
                ...ev,
                title: draft.title,
                start: draft.start,
                end: draft.end,
                allDay: draft.allDay,
                category: draft.category,
                location: draft.location,
                description: draft.description,
                recurrence: draft.recurrence,
                recurrenceUntil: draft.recurrenceUntil,
                imageUrl: draft.imageUrl,
                imageName: draft.imageName,
                isTask: draft.isTask,
                completed: draft.completed,
                updatedAt: nowIso,
              }
            : ev
        )
      );
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
        imageUrl: draft.imageUrl,
        imageName: draft.imageName,
        isTask: draft.isTask,
        completed: draft.completed ?? false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setEvents((prev) => [...prev, newEvent]);
    }
    setFormModalOpen(false);
  }, []);

  const handleDeleteEvent = useCallback((eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    setSelectedOccurrence(null);
    setFormModalOpen(false);
  }, []);

  const handleToggleTaskComplete = useCallback(
    (eventId: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === eventId
            ? {
                ...ev,
                completed: !ev.completed,
                updatedAt: new Date().toISOString(),
              }
            : ev
        )
      );
      setSelectedOccurrence((curr) =>
        curr && curr.masterId === eventId
          ? {
              ...curr,
              event: { ...curr.event, completed: !curr.event.completed },
            }
          : curr
      );
    },
    []
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
      imageUrl: ev.imageUrl,
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
      imageUrl: ev.imageUrl,
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
  }, []);

  // Theme Assignment Handlers
  const handleSetGlobalTheme = useCallback((theme: ThemeId) => {
    setThemePrefs((prev) => ({ ...prev, globalTheme: theme }));
  }, []);

  const handleSetMonthTheme = useCallback(
    (monthKey: string, theme: ThemeId | null) => {
      setThemePrefs((prev) => {
        const nextMonths = { ...prev.monthThemes };
        if (theme === null) delete nextMonths[monthKey];
        else nextMonths[monthKey] = theme;
        return { ...prev, monthThemes: nextMonths };
      });
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
    },
    []
  );

  const handleApplySplitWeekDemo = useCallback((monthDate: Date) => {
    const weeks = getMonthWeeks(monthDate);
    const demoRotation: ThemeId[] = [
      'summer',
      'wednesday',
      'ooo',
      'spring',
      'autumn',
      'winter',
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
    setView('month');
  }, []);

  const handleClearAllOverrides = useCallback(() => {
    setThemePrefs((prev) => ({
      ...prev,
      monthThemes: {},
      weekThemes: {},
    }));
  }, []);

  const handleToggleCategory = useCallback((cat: EventCategory) => {
    setVisibleCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }, []);

  return (
    <div
      data-theme={shellResolved.theme}
      className="h-screen w-screen overflow-hidden flex flex-col bg-theme-bg text-theme-text transition-colors duration-200"
    >
      {/* Top Navigation Bar */}
      <TopNavBar
        view={view}
        currentDate={currentDate}
        activeTheme={shellResolved.theme}
        activeThemeSource={shellResolved.source}
        themeOverrideCount={themeOverrideCount}
        searchQuery={searchQuery}
        allEvents={events}
        categoryMap={categoryMap}
        permissionStatus={permissionStatus}
        notificationSettings={notificationSettings}
        upcomingReminders={upcomingReminders}
        onToggleSidebar={handleToggleSidebar}
        onChangeView={setView}
        onNavigatePrev={handleNavigatePrev}
        onNavigateNext={handleNavigateNext}
        onJumpToday={handleJumpToday}
        onSearchChange={setSearchQuery}
        onJumpToSearchResult={(occ) => {
          setCurrentDate(occ.start);
          setSelectedDate(occ.start);
          setSelectedOccurrence(occ);
        }}
        onOpenThemeStudio={() => setThemeStudioOpen(true)}
        onRequestNotificationPermission={requestBrowserPermission}
        onUpdateNotificationSettings={setNotificationSettings}
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
          categories={categoriesList}
          visibleCategories={visibleCategories}
          themePrefs={themePrefs}
          onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
          onCreateEvent={() => {
            setActiveDraft(makeDefaultDraft(selectedDate, 9, 0, false));
            setFormModalOpen(true);
          }}
          onSelectMiniDate={(date) => {
            setSelectedDate(date);
            setCurrentDate(date);
          }}
          onToggleCategory={handleToggleCategory}
          onAddCustomCategory={handleAddCustomCategory}
          onDeleteCustomCategory={handleDeleteCustomCategory}
          onSetGlobalTheme={handleSetGlobalTheme}
          onOpenThemeStudio={() => setThemeStudioOpen(true)}
          onApplySplitWeekDemo={() => handleApplySplitWeekDemo(currentDate)}
        />

        <main className="flex-1 flex flex-col min-w-0 min-h-0 p-2 sm:p-3.5 gap-2">
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

          {/* Active Calendar Renderer */}
          <div className="flex-1 min-h-0">
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
                onAssignWeekTheme={handleSetWeekTheme}
                onJumpToDayView={(date) => {
                  setSelectedDate(date);
                  setCurrentDate(date);
                  setView('day');
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
                  setView('day');
                }}
              />
            )}

            {view === 'day' && (
              <DayView
                currentDate={currentDate}
                occurrences={expandedOccurrences}
                categoryMap={categoryMap}
                activeTheme={shellResolved.theme}
                onCreateAtSlot={(date, hour, minute, allDay) => {
                  setActiveDraft(makeDefaultDraft(date, hour, minute, allDay));
                  setFormModalOpen(true);
                }}
                onSelectOccurrence={(occ) => setSelectedOccurrence(occ)}
                onToggleTaskComplete={handleToggleTaskComplete}
              />
            )}
          </div>
        </main>
      </div>

      {/* Create / Edit Event Modal */}
      <EventFormModal
        isOpen={formModalOpen}
        initialDraft={activeDraft}
        categories={categoriesList}
        onAddCustomCategory={handleAddCustomCategory}
        onDeleteCustomCategory={handleDeleteCustomCategory}
        onClose={() => setFormModalOpen(false)}
        onSave={handleSaveDraft}
        onDelete={handleDeleteEvent}
      />

      {/* Event Detail Modal (with Full Image Preview & Lightbox) */}
      <EventDetailModal
        occurrence={selectedOccurrence}
        categoryMap={categoryMap}
        onClose={() => setSelectedOccurrence(null)}
        onEdit={handleEditOccurrence}
        onDelete={handleDeleteEvent}
        onDuplicate={handleDuplicateOccurrence}
        onToggleTaskComplete={handleToggleTaskComplete}
      />

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
    </div>
  );
};

export default App;
