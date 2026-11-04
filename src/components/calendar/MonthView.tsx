import React, { useMemo, useState } from 'react';
import {
  format,
  isSameDay,
  isSameMonth,
  isToday,
} from 'date-fns';
import { Palette, Plus, RotateCcw } from 'lucide-react';
import {
  EventOccurrence,
  ThemeId,
  ThemePreferences,
} from '../../types/calendar';
import {
  getMonthWeeks,
  getOccurrencesForDay,
} from '../../utils/calendarMath';
import {
  getWeekKey,
  resolveWeekTheme,
} from '../../utils/themeResolver';
import { THEME_DEFINITIONS, THEME_LIST } from '../../constants/themes';
import { CategoryMeta } from '../../constants/categories';
import { EventCard } from './EventCard';
import { ThemeOrnament } from './ThemeOrnament';

interface MonthViewProps {
  currentDate: Date;
  selectedDate: Date;
  occurrences: EventOccurrence[];
  categoryMap: Record<string, CategoryMeta>;
  themePrefs: ThemePreferences;
  onSelectDate: (date: Date) => void;
  onCreateAtDate: (date: Date) => void;
  onSelectOccurrence: (occ: EventOccurrence, e: React.MouseEvent) => void;
  onToggleTaskComplete: (eventId: string, e: React.MouseEvent) => void;
  onAssignWeekTheme: (weekKey: string, theme: ThemeId | null) => void;
  onJumpToDayView: (date: Date) => void;
}

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  selectedDate,
  occurrences,
  categoryMap,
  themePrefs,
  onSelectDate,
  onCreateAtDate,
  onSelectOccurrence,
  onToggleTaskComplete,
  onAssignWeekTheme,
  onJumpToDayView,
}) => {
  const [openWeekPickerKey, setOpenWeekPickerKey] = useState<string | null>(
    null
  );

  const weeks = useMemo(() => getMonthWeeks(currentDate), [currentDate]);

  return (
    <div
      className="flex flex-col h-full min-h-0 bg-theme-surface rounded-2xl border border-theme-border shadow-theme overflow-hidden"
      onClick={() => {
        if (openWeekPickerKey) setOpenWeekPickerKey(null);
      }}
    >
      {/* Weekday column header */}
      <div className="grid grid-cols-7 border-b border-theme-border bg-theme-elevated/85 shrink-0">
        {WEEKDAY_HEADERS.map((dayName) => (
          <div
            key={dayName}
            className="py-2.5 px-2 text-center text-[11px] font-bold uppercase tracking-wider text-theme-text-secondary border-r border-theme-border last:border-r-0"
          >
            {dayName}
          </div>
        ))}
      </div>

      {/* Scoped Week Rows — Each week row has its own isolated [data-theme] container */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto themed-scroll">
        {weeks.map((weekDays, weekIdx) => {
          const weekStart = weekDays[0];
          const weekKey = getWeekKey(weekStart);
          const resolved = resolveWeekTheme(weekStart, currentDate, themePrefs);
          const themeMeta = THEME_DEFINITIONS[resolved.theme];
          const isPickerOpen = openWeekPickerKey === weekKey;

          return (
            <div
              key={weekKey}
              data-theme={resolved.theme}
              className="week-row-scope group/week flex-1 min-h-[124px] relative flex flex-col border-b border-theme-border last:border-b-0"
            >
              {/* Subtle floating Per-Week Theme Control Badge */}
              <div
                className={`absolute left-1.5 bottom-1.5 z-20 transition-opacity ${
                  resolved.source === 'week' || isPickerOpen
                    ? 'opacity-100'
                    : 'opacity-0 group-hover/week:opacity-95 focus-within:opacity-100'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenWeekPickerKey(isPickerOpen ? null : weekKey)
                  }
                  style={{
                    backgroundColor: themeMeta.badgeBg,
                    color: themeMeta.badgeText,
                    borderColor: themeMeta.badgeBorder,
                  }}
                  className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm hover:scale-[1.03] transition-transform"
                  title={`Week ${weekIdx + 1} Theme (${format(
                    weekDays[0],
                    'MMM d'
                  )} – ${format(weekDays[6], 'MMM d')}): ${themeMeta.name}`}
                >
                  <ThemeOrnament theme={resolved.theme} size={12} />
                  <span>
                    Wk {weekIdx + 1}
                    {resolved.source === 'week'
                      ? `: ${themeMeta.shortName}`
                      : ''}
                  </span>
                  {resolved.source !== 'week' && (
                    <Palette className="w-2.5 h-2.5 opacity-75" />
                  )}
                </button>

                {isPickerOpen && (
                  <div
                    className={`absolute left-0 ${
                      weekIdx >= weeks.length - 2
                        ? 'bottom-full mb-1.5'
                        : 'top-full mt-1.5'
                    } w-60 rounded-xl border border-slate-200 dark:border-slate-700 bg-white text-slate-900 shadow-2xl p-2.5 z-40`}
                  >
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
                      <div>
                        <p className="text-[11px] font-bold text-slate-800">
                          Week {weekIdx + 1} Palette
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {format(weekDays[0], 'MMM d')} –{' '}
                          {format(weekDays[6], 'MMM d')}
                        </p>
                      </div>
                      {resolved.source === 'week' && (
                        <button
                          type="button"
                          onClick={() => {
                            onAssignWeekTheme(weekKey, null);
                            setOpenWeekPickerKey(null);
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 hover:text-rose-700 px-1.5 py-0.5 rounded bg-rose-50"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Reset
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                      {THEME_LIST.map((t) => {
                        const active =
                          resolved.theme === t.id &&
                          resolved.source === 'week';
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              onAssignWeekTheme(weekKey, t.id);
                              setOpenWeekPickerKey(null);
                            }}
                            className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium border transition-all ${
                              active
                                ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold'
                                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <ThemeOrnament theme={t.id} size={13} />
                            <span className="truncate">{t.shortName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 7 Day Cells inside this scoped Week Row */}
              <div className="week-cells-grid grid grid-cols-7 flex-1 min-h-0">
                {weekDays.map((day) => {
                  const inCurrentMonth = isSameMonth(day, currentDate);
                  const todayFlag = isToday(day);
                  const isSelected = isSameDay(day, selectedDate);
                  const dayOccurrences = getOccurrencesForDay(occurrences, day);
                  const maxVisible = 3;
                  const visibleEvents = dayOccurrences.slice(0, maxVisible);
                  const hiddenCount = dayOccurrences.length - visibleEvents.length;

                  // Feature a wider thumbnail preview if there is 1 event with an image and <= 2 total events
                  const featuredMediaEvent =
                    dayOccurrences.length <= 2
                      ? visibleEvents.find((o) => Boolean(o.event.imageUrl))
                      : undefined;

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => {
                        onSelectDate(day);
                        onCreateAtDate(day);
                      }}
                      className={`calendar-day-cell group/cell relative flex flex-col p-1.5 border-r last:border-r-0 cursor-pointer transition-colors min-w-0 ${
                        !inCurrentMonth ? 'is-outside-month' : ''
                      } ${todayFlag ? 'is-today-cell' : ''}`}
                    >
                      {/* Cell Header: Day Number + Quick Add icon */}
                      <div className="flex items-center justify-between mb-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDate(day);
                            onJumpToDayView(day);
                          }}
                          style={
                            todayFlag
                              ? {
                                  backgroundColor: 'var(--t-accent)',
                                  color: 'var(--t-accent-contrast)',
                                }
                              : undefined
                          }
                          className={`inline-flex items-center justify-center rounded-full text-xs font-bold tabular-nums transition-transform hover:scale-105 ${
                            todayFlag
                              ? 'w-6 h-6 shadow-sm'
                              : isSelected
                              ? 'w-6 h-6 ring-2 ring-theme-accent text-theme-text'
                              : inCurrentMonth
                              ? 'px-1.5 py-0.5 text-theme-text'
                              : 'px-1.5 py-0.5 text-theme-text-muted opacity-65'
                          }`}
                          title="Open Day View"
                        >
                          {day.getDate() === 1
                            ? format(day, 'MMM d')
                            : format(day, 'd')}
                        </button>

                        <span
                          className="opacity-0 group-hover/cell:opacity-80 transition-opacity rounded-full p-0.5 text-theme-text-muted hover:text-theme-accent"
                          title="Add event"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </span>
                      </div>

                      {/* Event List */}
                      <div className="flex flex-col gap-1 min-h-0 flex-1">
                        {visibleEvents.map((occ) => (
                          <EventCard
                            key={occ.occurrenceId}
                            occurrence={occ}
                            activeTheme={resolved.theme}
                            categoryMap={categoryMap}
                            variant="month"
                            onSelect={onSelectOccurrence}
                            onToggleTaskComplete={onToggleTaskComplete}
                          />
                        ))}

                        {/* Optional Featured Card Thumbnail Banner inside Month Cell when space allows */}
                        {featuredMediaEvent?.event.imageUrl && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectOccurrence(featuredMediaEvent, e);
                            }}
                            className="mt-0.5 relative h-11 w-full rounded-md overflow-hidden border border-theme-border shadow-sm group/thumb"
                          >
                            <img
                              src={featuredMediaEvent.event.imageUrl}
                              alt={featuredMediaEvent.event.title}
                              className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                              onError={(e) => {
                                (
                                  e.currentTarget.parentElement as HTMLElement
                                ).style.display = 'none';
                              }}
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-1.5 py-0.5">
                              <p className="text-[9px] font-semibold text-white truncate">
                                {featuredMediaEvent.event.title}
                              </p>
                            </div>
                          </div>
                        )}

                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onJumpToDayView(day);
                            }}
                            className="text-left px-1.5 py-0.5 rounded text-[10px] font-bold text-theme-accent hover:bg-theme-accent-soft transition-colors"
                          >
                            +{hiddenCount} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
