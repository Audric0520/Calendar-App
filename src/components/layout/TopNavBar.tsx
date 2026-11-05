import React, { useMemo, useRef, useState } from 'react';
import { addMonths, format, isSameMonth } from 'date-fns';
import {
  Bell,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Menu,
  Palette,
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
import { ReminderCenterPopover } from '../notifications/ReminderCenterPopover';
import { CategoryMeta, resolveCategoryMeta } from '../../constants/categories';

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
}) => {
  const [bellOpen, setBellOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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
        const catLabel = resolveCategoryMeta(ev.category, categoryMap).label;
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
    <header className="shrink-0 border-b border-theme-border bg-theme-surface/95 backdrop-blur-md px-3 sm:px-5 py-2.5 z-30">
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
            <button
              type="button"
              onClick={onJumpToday}
              className="rounded-xl border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-bold text-theme-text hover:bg-theme-cell-hover transition-colors shadow-sm"
            >
              Today
            </button>

            <div className="inline-flex items-center rounded-xl border border-theme-border bg-theme-elevated p-0.5">
              <button
                type="button"
                onClick={onNavigatePrev}
                className="p-1.5 rounded-lg text-theme-text-secondary hover:bg-theme-cell-hover hover:text-theme-text transition-colors"
                aria-label="Previous period"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onNavigateNext}
                className="p-1.5 rounded-lg text-theme-text-secondary hover:bg-theme-cell-hover hover:text-theme-text transition-colors"
                aria-label="Next period"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Current Month / Week / Day Heading */}
          <h1
            style={{ fontFamily: 'var(--t-font-display)' }}
            className="text-sm sm:text-lg font-extrabold text-theme-text truncate tabular-nums"
          >
            {headerDateLabel}
          </h1>
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
            {searchFocused && searchQuery.trim().length > 0 && (
              <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg z-40 overflow-hidden">
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
                        categoryMap
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
              </div>
            )}
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
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--t-accent)',
                          color: 'var(--t-accent-contrast)',
                        }
                      : undefined
                  }
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                    active
                      ? 'shadow-sm'
                      : 'text-theme-text-secondary hover:text-theme-text'
                  }`}
                >
                  {v}
                </button>
              );
            })}
          </div>

          {/* Theme Studio Button */}
          <button
            type="button"
            onClick={onOpenThemeStudio}
            className="inline-flex items-center gap-1.5 rounded-xl border border-theme-border bg-theme-elevated hover:bg-theme-cell-hover px-2.5 sm:px-3 py-1.5 text-xs font-bold text-theme-text transition-colors relative"
            title={`Active Theme: ${themeMeta.name} (${activeThemeSource})`}
          >
            <ThemeOrnament theme={activeTheme} size={15} />
            <span className="hidden xl:inline">{themeMeta.shortName}</span>
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
          </button>

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
            />
          </div>
        </div>
      </div>
    </header>
  );
};
