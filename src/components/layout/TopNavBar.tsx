import React, { useMemo, useRef, useState } from 'react';
import { addMonths, format, isSameMonth } from 'date-fns';
import {
  Bell,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Menu,
  Palette,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  CalendarEvent,
  CalendarView,
  EventOccurrence,
  NotificationSettings,
  ThemeId,
} from '../../types/calendar';
import { THEME_DEFINITIONS } from '../../constants/themes';
import { getWeekDays, expandEventsInRange } from '../../utils/calendarMath';
import { ThemeOrnament } from '../calendar/ThemeOrnament';
import {
  BrowserPermissionState,
  UpcomingReminderItem,
} from '../../hooks/useReminderEngine';
import type { PushReminderStatus } from '../../hooks/usePushNotifications';
import { ReminderCenterPopover } from '../notifications/ReminderCenterPopover';
import { AnimatePresence, motion } from 'framer-motion';
import { menuVariants } from '../../motion/presets';
import { CategoryMeta, resolveCategoryMeta } from '../../constants/categories';
import { useAuth } from '../../contexts/AuthContext';

interface TopNavBarProps {
  view: CalendarView;
  currentDate: Date;
  activeTheme: ThemeId;
  activeThemeSource: 'week' | 'month' | 'global';
  themeOverrideCount: number;
  searchQuery: string;
  allEvents: CalendarEvent[];
  categoryMap: Record<string, CategoryMeta>;
  permissionStatus: BrowserPermissionState;
  notificationSettings: NotificationSettings;
  upcomingReminders: UpcomingReminderItem[];
  unsyncedCount?: number;
  isSyncing?: boolean;
  onRetrySync?: () => void;
  onToggleSidebar: () => void;
  onChangeView: (view: CalendarView) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onJumpToday: () => void;
  onSearchChange: (q: string) => void;
  onJumpToSearchResult: (occ: EventOccurrence) => void;
  onOpenThemeStudio: () => void;
  onRequestNotificationPermission: () => void;
  onUpdateNotificationSettings: (next: NotificationSettings) => void;
  onTriggerPreviewAlert: () => void;
  onScheduleLiveTenMinDemo: () => void;
  isPushConfigured?: boolean;
  pushStatus?: PushReminderStatus;
  isPushBusy?: boolean;
  pushError?: string | null;
  onDisableBackgroundReminders?: () => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  view,
  currentDate,
  activeTheme,
  activeThemeSource,
  themeOverrideCount,
  searchQuery,
  allEvents,
  categoryMap,
  permissionStatus,
  notificationSettings,
  upcomingReminders,
  unsyncedCount = 0,
  isSyncing = false,
  onRetrySync,
  onToggleSidebar,
  onChangeView,
  onNavigatePrev,
  onNavigateNext,
  onJumpToday,
  onSearchChange,
  onJumpToSearchResult,
  onOpenThemeStudio,
  onRequestNotificationPermission,
  onUpdateNotificationSettings,
  onTriggerPreviewAlert,
  onScheduleLiveTenMinDemo,
  isPushConfigured = false,
  pushStatus = 'off',
  isPushBusy = false,
  pushError = null,
  onDisableBackgroundReminders,
}) => {
  const [bellOpen, setBellOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const { user } = useAuth();

  const headerDateLabel = useMemo(() => {
    if (view === 'month') {
      return format(currentDate, 'MMMM yyyy');
    }
    if (view === 'day') {
      return format(currentDate, 'MMM d, yyyy');
    }
    const days = getWeekDays(currentDate);
    const first = days[0];
    const last = days[6];
    if (isSameMonth(first, last)) {
      return `${format(first, 'MMM d')} – ${format(last, 'd, yyyy')}`;
    }
    return `${format(first, 'MMM d')} – ${format(last, 'MMM d, yyyy')}`;
  }, [currentDate, view]);

  // Search dropdown results across +/- 6 months
  const searchDropdownResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const now = new Date();
    const expanded = expandEventsInRange(
      allEvents,
      addMonths(now, -6),
      addMonths(now, 6)
    );
    return expanded
      .filter((occ) => {
        const ev = occ.event;
        const catLabel = resolveCategoryMeta(
          ev.category,
          categoryMap,
          ev.isTask ? 'task' : 'event'
        ).label;
        return (
          ev.title.toLowerCase().includes(q) ||
          ev.description.toLowerCase().includes(q) ||
          ev.location.toLowerCase().includes(q) ||
          catLabel.toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [allEvents, categoryMap, searchQuery]);

  const themeMeta = THEME_DEFINITIONS[activeTheme];

  return (
    <header className="app-topbar shrink-0 border-b border-theme-border bg-theme-surface/95 backdrop-blur-md px-3 sm:px-5 pb-2.5 z-30">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Sidebar Toggle + Brand + Navigation Controls */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-2 rounded-xl text-theme-text-secondary hover:bg-theme-cell-hover transition-colors"
            aria-label="Toggle sidebar navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden sm:flex items-center gap-2 pr-1">
            <div
              style={{
                backgroundColor: 'var(--t-accent)',
                color: 'var(--t-accent-contrast)',
              }}
              className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm"
            >
              <CalendarIcon className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-sm md:text-base tracking-tight text-theme-text">
              OmniCal
            </span>
          </div>

          {/* Today + Prev / Next */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            <motion.button
              type="button"
              onClick={onJumpToday}
              whileTap={{ scale: 0.95 }}
              whileHover={{ y: -1 }}
              transition={{ type: 'spring', stiffness: 620, damping: 26 }}
              className="rounded-xl border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-bold text-theme-text hover:bg-theme-cell-hover transition-colors shadow-sm"
            >
              Today
            </motion.button>

            <div className="inline-flex items-center rounded-xl border border-theme-border bg-theme-elevated p-0.5">
              <motion.button
                type="button"
                onClick={onNavigatePrev}
                whileTap={{ scale: 0.9, x: 1 }}
                transition={{ type: 'spring', stiffness: 620, damping: 24 }}
                className="p-1.5 rounded-lg text-theme-text-secondary hover:bg-theme-cell-hover hover:text-theme-text transition-colors"
                aria-label="Previous period"
              >
                <ChevronLeft className="w-4 h-4" />
              </motion.button>
              <motion.button
                type="button"
                onClick={onNavigateNext}
                whileTap={{ scale: 0.9, x: -1 }}
                transition={{ type: 'spring', stiffness: 620, damping: 24 }}
                className="p-1.5 rounded-lg text-theme-text-secondary hover:bg-theme-cell-hover hover:text-theme-text transition-colors"
                aria-label="Next period"
              >
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>
          </div>

          {/* Current Month / Week / Day Heading — subtle cross-fade on change */}
          <div className="relative min-w-0 flex-1">
            <AnimatePresence initial={false} mode="wait">
              <motion.h1
                key={headerDateLabel}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: [0.33, 1, 0.68, 1] }}
                style={{ fontFamily: 'var(--t-font-display)' }}
                className="gothic-display text-sm sm:text-lg font-extrabold text-theme-text truncate tabular-nums"
              >
                {headerDateLabel}
              </motion.h1>
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Search + View Switcher + Theme Studio + Reminders */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Search Input */}
          <div className="relative w-36 sm:w-52 md:w-64">
            <Search className="w-3.5 h-3.5 text-theme-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 180)}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search events..."
              className="w-full rounded-xl border border-theme-border bg-theme-elevated pl-8 pr-7 py-1.5 text-xs font-medium text-theme-text placeholder:text-theme-text-muted/75 focus:outline-none focus:border-theme-border-strong transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-theme-text-muted hover:text-theme-text"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Instant Search Results Popover */}
            <AnimatePresence>
            {searchFocused && searchQuery.trim().length > 0 && (
              <motion.div
                key="search-results"
                variants={menuVariants}
                initial="enter"
                animate="center"
                exit="exit"
                style={{ transformOrigin: 'top right' }}
                className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg z-40 overflow-hidden gpu-layer"
              >
                <div className="px-3 py-2 border-b border-theme-border bg-theme-elevated text-[11px] font-bold text-theme-text-secondary">
                  Matching Events ({searchDropdownResults.length})
                </div>
                {searchDropdownResults.length === 0 ? (
                  <div className="p-4 text-center text-xs text-theme-text-muted">
                    No scheduled events match &ldquo;{searchQuery}&rdquo;
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto themed-scroll divide-y divide-theme-border/60">
                    {searchDropdownResults.map((occ) => {
                      const cat = resolveCategoryMeta(
                        occ.event.category,
                        categoryMap,
                        occ.event.isTask ? 'task' : 'event'
                      );
                      return (
                        <button
                          key={occ.occurrenceId}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onJumpToSearchResult(occ);
                            setSearchFocused(false);
                          }}
                          className="w-full px-3.5 py-2.5 text-left hover:bg-theme-cell-hover flex items-center gap-2.5 transition-colors"
                        >
                          <span
                            style={{ backgroundColor: cat.color }}
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-theme-text truncate">
                              {occ.event.title}
                            </p>
                            <p className="text-[10px] text-theme-text-muted tabular-nums">
                              {format(occ.start, 'EEE, MMM d, yyyy • h:mm a')}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
            </AnimatePresence>
          </div>

          {/* Month / Week / Day View Switcher */}
          <div
            role="tablist"
            aria-label="Calendar view"
            className="inline-flex rounded-xl border border-theme-border bg-theme-elevated p-0.5"
          >
            {(['month', 'week', 'day'] as CalendarView[]).map((v) => {
              const active = view === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onChangeView(v)}
                  className={`relative px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
                    active
                      ? 'text-[var(--t-accent-contrast)]'
                      : 'text-theme-text-secondary hover:text-theme-text'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="view-switcher-pill"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-lg shadow-sm"
                      style={{ backgroundColor: 'var(--t-accent)' }}
                      transition={{
                        type: 'spring',
                        stiffness: 480,
                        damping: 34,
                        mass: 0.7,
                      }}
                    />
                  )}
                  <span className="relative z-10">{v}</span>
                </button>
              );
            })}
          </div>

          {/* Theme Studio Button */}
          <motion.button
            type="button"
            onClick={onOpenThemeStudio}
            whileTap={{ scale: 0.96 }}
            whileHover={{ y: -1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 26 }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-theme-border bg-theme-elevated hover:bg-theme-cell-hover px-2.5 sm:px-3 py-1.5 text-xs font-bold text-theme-text transition-colors relative"
            title={`Active Theme: ${themeMeta.name} (${activeThemeSource})`}
          >
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={`ornament-${activeTheme}`}
                initial={{ opacity: 0, scale: 0.6, rotate: -25 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.6, rotate: 25 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                className="inline-flex"
              >
                <ThemeOrnament theme={activeTheme} size={15} />
              </motion.span>
            </AnimatePresence>
            <span className="hidden xl:inline">
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={`label-${activeTheme}`}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.16, ease: [0.33, 1, 0.68, 1] }}
                  className="inline-block"
                >
                  {themeMeta.shortName}
                </motion.span>
              </AnimatePresence>
            </span>
            <Palette className="w-3.5 h-3.5 text-theme-accent xl:hidden" />
            {themeOverrideCount > 0 && (
              <span
                style={{
                  backgroundColor: 'var(--t-accent)',
                  color: 'var(--t-accent-contrast)',
                }}
                className="ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold tabular-nums"
              >
                {themeOverrideCount}
              </span>
            )}
          </motion.button>

          {/* 10-Min Reminders Center Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setBellOpen((o) => !o)}
              className="relative p-2 rounded-xl border border-theme-border bg-theme-elevated hover:bg-theme-cell-hover text-theme-text transition-colors"
              aria-label="10-minute event reminders"
              title="10-Minute Pre-Event Reminders"
            >
              <Bell className="w-4 h-4" />
              {upcomingReminders.length > 0 && (
                <span
                  style={{ backgroundColor: 'var(--t-accent)' }}
                  className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-theme-surface"
                />
              )}
            </button>

            <ReminderCenterPopover
              isOpen={bellOpen}
              onClose={() => setBellOpen(false)}
              permissionStatus={permissionStatus}
              onRequestPermission={onRequestNotificationPermission}
              settings={notificationSettings}
              onUpdateSettings={onUpdateNotificationSettings}
              upcomingReminders={upcomingReminders}
              onTriggerPreviewAlert={onTriggerPreviewAlert}
              onScheduleLiveTenMinDemo={() => {
                onScheduleLiveTenMinDemo();
              }}
              isPushConfigured={isPushConfigured}
              pushStatus={pushStatus}
              isPushBusy={isPushBusy}
              pushError={pushError}
              onDisableBackgroundReminders={onDisableBackgroundReminders}
            />
          </div>

          {/* Unsynced Queue Indicator */}
          {user && unsyncedCount > 0 && (
            <button
              type="button"
              onClick={onRetrySync}
              disabled={isSyncing}
              title={`${unsyncedCount} change${unsyncedCount === 1 ? '' : 's'} waiting to sync — click to retry`}
              aria-label="Not synced — click to retry sync"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/45 bg-theme-elevated hover:bg-theme-cell-hover disabled:opacity-65 px-2.5 py-1.5 text-[11px] font-bold text-theme-text transition-colors"
            >
              {isSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0" />
              ) : (
                <CloudOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              )}
              <span className="whitespace-nowrap">Not synced</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
