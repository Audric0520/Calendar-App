import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday } from 'date-fns';
import {
  CalendarPlus,
  Clock,
  MapPin,
  Repeat,
  Sparkles,
} from 'lucide-react';
import { EventOccurrence, ThemeId } from '../../types/calendar';
import {
  getOccurrencesForDay,
  layoutDayTimedOccurrences,
} from '../../utils/calendarMath';
import { CategoryMeta, resolveCategoryMeta } from '../../constants/categories';
import { THEME_DEFINITIONS } from '../../constants/themes';
import { EventCard } from './EventCard';
import { ThemeOrnament } from './ThemeOrnament';
import { TodayPulse } from '../../motion/TodayPulse';

interface DayViewProps {
  currentDate: Date;
  occurrences: EventOccurrence[];
  categoryMap: Record<string, CategoryMeta>;
  activeTheme: ThemeId;
  /** Replays the "back to today" landing pulse when it changes. */
  todayPulseToken: number;
  onCreateAtSlot: (
    date: Date,
    hour: number,
    minute: number,
    allDay?: boolean
  ) => void;
  onSelectOccurrence: (occ: EventOccurrence, e: React.MouseEvent) => void;
  onToggleTaskComplete: (eventId: string, e: React.MouseEvent) => void;
}

const HOUR_HEIGHT_PX = 64;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const DayView: React.FC<DayViewProps> = ({
  currentDate,
  occurrences,
  categoryMap,
  activeTheme,
  todayPulseToken,
  onCreateAtSlot,
  onSelectOccurrence,
  onToggleTaskComplete,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  const dayOccurrences = useMemo(
    () => getOccurrencesForDay(occurrences, currentDate),
    [occurrences, currentDate]
  );

  const allDayEvents = useMemo(
    () => dayOccurrences.filter((o) => o.event.allDay),
    [dayOccurrences]
  );

  const positionedTimed = useMemo(
    () => layoutDayTimedOccurrences(dayOccurrences, currentDate),
    [dayOccurrences, currentDate]
  );

  // Re-anchor the timeline whenever the day changes so the incoming grid is
  // always positioned at the same morning starting point.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7.5 * HOUR_HEIGHT_PX;
    }
  }, [currentDate]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const todayFlag = isToday(currentDate);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTopPercent = (nowMinutes / (24 * 60)) * 100;
  const themeMeta = THEME_DEFINITIONS[activeTheme];

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = Math.max(0, e.clientY - rect.top);
    const totalMinutes = Math.min(
      23 * 60 + 30,
      Math.floor((offsetY / HOUR_HEIGHT_PX) * 2) * 30
    );
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    onCreateAtSlot(currentDate, hour, minute, false);
  };

  return (
    <div
      data-theme={activeTheme}
      className="flex gap-4 h-full min-h-0"
    >
      {/* Main Interactive Day Timeline */}
      <div className="gothic-frame flex-1 flex flex-col min-w-0 bg-theme-surface rounded-2xl border border-theme-border shadow-theme overflow-hidden">
        {/* Day Banner Header */}
        <div
          style={{ backgroundImage: 'var(--t-header-gradient)' }}
          className="px-4 py-3 border-b border-theme-border flex items-center justify-between gap-3 shrink-0"
        >
          <div className="flex items-center gap-3">
            <TodayPulse
              token={todayFlag ? todayPulseToken : 0}
              scale={1.08}
              className="shrink-0"
            >
              <div
                style={
                  todayFlag
                    ? {
                        backgroundColor: 'var(--t-accent)',
                        color: 'var(--t-accent-contrast)',
                      }
                    : undefined
                }
                className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-bold tabular-nums shadow-sm ${
                  todayFlag
                    ? ''
                    : 'bg-theme-elevated border border-theme-border text-theme-text'
                }`}
              >
                <span className="text-[10px] uppercase tracking-wider opacity-85">
                  {format(currentDate, 'EEE')}
                </span>
                <span className="text-lg leading-none mt-0.5">
                  {format(currentDate, 'd')}
                </span>
              </div>
            </TodayPulse>

            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-theme-text">
                {format(currentDate, 'EEEE, MMMM d, yyyy')}
              </h2>
              <p className="text-xs text-theme-text-secondary flex items-center gap-1.5">
                <ThemeOrnament theme={activeTheme} size={13} />
                <span>
                  {dayOccurrences.length}{' '}
                  {dayOccurrences.length === 1 ? 'scheduled item' : 'scheduled items'} •{' '}
                  {themeMeta.name}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onCreateAtSlot(currentDate, 9, 0, false)}
            style={{
              backgroundColor: 'var(--t-accent)',
              color: 'var(--t-accent-contrast)',
            }}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold shadow-sm hover:opacity-95 transition-opacity"
          >
            <CalendarPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Event</span>
          </button>
        </div>

        {/* All-Day Banner */}
        <div className="calendar-header-band grid grid-cols-[68px_minmax(0,1fr)] border-b border-theme-border bg-theme-cell-muted/65 shrink-0">
          <div className="px-2 py-2 flex items-center justify-center text-[10px] font-semibold text-theme-text-muted border-r border-theme-border">
            All-day
          </div>
          <div
            onClick={() => onCreateAtSlot(currentDate, 9, 0, true)}
            className="min-h-[38px] p-1.5 flex flex-wrap gap-1.5 cursor-pointer hover:bg-theme-cell-hover/55 transition-colors"
            title="Click to schedule an all-day event"
          >
            {allDayEvents.length === 0 ? (
              <span className="text-[11px] text-theme-text-muted/75 self-center px-1">
                Click to add an all-day event
              </span>
            ) : (
              allDayEvents.map((occ) => (
                <div key={occ.occurrenceId} className="min-w-[180px] max-w-sm">
                  <EventCard
                    occurrence={occ}
                    activeTheme={activeTheme}
                    categoryMap={categoryMap}
                    variant="allday"
                    onSelect={onSelectOccurrence}
                    onToggleTaskComplete={onToggleTaskComplete}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* 24-Hour Scrollable Timeline */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto themed-scroll relative"
        >
          <div
            className="grid grid-cols-[68px_minmax(0,1fr)] relative"
            style={{ height: `${24 * HOUR_HEIGHT_PX}px` }}
          >
            <div className="relative border-r border-theme-border bg-theme-elevated/45 select-none">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT_PX}px` }}
                  className="relative pr-2.5 text-right"
                >
                  {hour > 0 && (
                    <span className="inline-block -translate-y-2 text-[11px] font-semibold tabular-nums text-theme-text-muted">
                      {format(new Date(2026, 0, 1, hour, 0), 'h a')}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div
              onClick={handleTimelineClick}
              className="relative bg-theme-cell cursor-pointer"
            >
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT_PX}px` }}
                  className="border-b border-theme-border/80 relative hover:bg-theme-cell-hover/45 transition-colors"
                >
                  <div className="absolute inset-x-0 top-1/2 border-b border-dashed border-theme-border/35 pointer-events-none" />
                </div>
              ))}

              {todayFlag && (
                <div
                  style={{ top: `${nowTopPercent}%` }}
                  className="absolute inset-x-0 z-20 pointer-events-none flex items-center"
                >
                  <span
                    style={{ backgroundColor: 'var(--t-accent)' }}
                    className="w-3 h-3 rounded-full -ml-1.5 shadow"
                  />
                  <div
                    style={{ backgroundColor: 'var(--t-accent)' }}
                    className="h-[2px] flex-1"
                  />
                </div>
              )}

              {positionedTimed.map((pos) => {
                const widthPct = 100 / pos.totalColumns;
                const leftPct = pos.column * widthPct;
                const durationMinutes = Math.round(
                  (pos.heightPercent / 100) * 24 * 60
                );

                return (
                  <div
                    key={pos.occurrence.occurrenceId}
                    style={{
                      top: `${pos.topPercent}%`,
                      height: `calc(${pos.heightPercent}% - 2px)`,
                      left: `calc(${leftPct}% + 6px)`,
                      width: `calc(${widthPct}% - 12px)`,
                    }}
                    className="absolute z-10 min-h-[28px]"
                  >
                    <EventCard
                      occurrence={pos.occurrence}
                      activeTheme={activeTheme}
                      categoryMap={categoryMap}
                      variant="timed"
                      durationMinutes={durationMinutes}
                      onSelect={onSelectOccurrence}
                      onToggleTaskComplete={onToggleTaskComplete}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Right Day Agenda & Multimedia Digest (Desktop XL) */}
      <aside className="gothic-frame hidden xl:flex w-80 shrink-0 flex-col bg-theme-surface rounded-2xl border border-theme-border shadow-theme overflow-hidden">
        <div className="p-4 border-b border-theme-border bg-theme-elevated">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-theme-accent">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Day Agenda</span>
          </div>
          <p className="text-xs text-theme-text-secondary mt-1">
            Click any card below for full details and multimedia preview.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto themed-scroll p-3 space-y-2.5">
          {dayOccurrences.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-theme-text-muted">
              <Clock className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm font-semibold text-theme-text-secondary">
                Open schedule
              </p>
              <p className="text-xs mt-1">
                Click any time slot on the timeline to schedule a new event.
              </p>
            </div>
          ) : (
            dayOccurrences.map((occ) => {
              const cat = resolveCategoryMeta(
                occ.event.category,
                categoryMap,
                occ.event.isTask ? 'task' : 'event'
              );
              return (
                <div
                  key={`agenda-${occ.occurrenceId}`}
                  onClick={(e) => onSelectOccurrence(occ, e)}
                  className="rounded-xl border border-theme-border bg-theme-elevated hover:border-theme-border-strong p-3 cursor-pointer transition-all shadow-sm"
                >
                  {occ.event.imageUrl && (
                    <div className="mb-2.5 h-28 w-full rounded-lg overflow-hidden border border-theme-border bg-black/10">
                      <img
                        src={occ.event.imageUrl}
                        alt={occ.event.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (
                            e.currentTarget.parentElement as HTMLElement
                          ).style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span
                      style={{ backgroundColor: cat.color }}
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                    />
                    <h3 className="text-sm font-bold text-theme-text truncate">
                      {occ.event.title}
                    </h3>
                  </div>

                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-theme-text-secondary tabular-nums">
                    <Clock className="w-3.5 h-3.5 shrink-0 opacity-75" />
                    <span>
                      {occ.event.allDay
                        ? 'All Day'
                        : `${format(occ.start, 'h:mm a')} – ${format(
                            occ.end,
                            'h:mm a'
                          )}`}
                    </span>
                    {occ.event.recurrence !== 'none' && (
                      <Repeat className="w-3 h-3 ml-auto opacity-75" />
                    )}
                  </div>

                  {occ.event.location && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-theme-text-muted truncate">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{occ.event.location}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};
