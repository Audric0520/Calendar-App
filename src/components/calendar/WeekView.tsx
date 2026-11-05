import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { EventOccurrence, ThemeId } from '../../types/calendar';
import {
  getOccurrencesForDay,
  getWeekDays,
  layoutDayTimedOccurrences,
} from '../../utils/calendarMath';
import { CategoryMeta } from '../../constants/categories';
import { EventCard } from './EventCard';
import { TodayPulse } from '../../motion/TodayPulse';

interface WeekViewProps {
  currentDate: Date;
  selectedDate: Date;
  occurrences: EventOccurrence[];
  categoryMap: Record<string, CategoryMeta>;
  activeTheme: ThemeId;
  /** Replays the "back to today" landing pulse when it changes. */
  todayPulseToken: number;
  onSelectDate: (date: Date) => void;
  onCreateAtSlot: (date: Date, hour: number, minute: number, allDay?: boolean) => void;
  onSelectOccurrence: (occ: EventOccurrence, e: React.MouseEvent) => void;
  onToggleTaskComplete: (eventId: string, e: React.MouseEvent) => void;
  onJumpToDayView: (date: Date) => void;
}

const HOUR_HEIGHT_PX = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  selectedDate,
  occurrences,
  categoryMap,
  activeTheme,
  todayPulseToken,
  onSelectDate,
  onCreateAtSlot,
  onSelectOccurrence,
  onToggleTaskComplete,
  onJumpToDayView,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  // Scroll to ~7:30 AM on mount and whenever a new week slides in, so the
  // incoming grid never appears scrolled to a different position.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = 7.5 * HOUR_HEIGHT_PX;
  }, [currentDate]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTopPercent = (nowMinutes / (24 * 60)) * 100;

  return (
    <div
      data-theme={activeTheme}
      className="flex flex-col h-full min-h-0 bg-theme-surface rounded-2xl border border-theme-border shadow-theme overflow-hidden"
    >
      {/* Sticky Day Column Headers */}
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] sm:grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b border-theme-border bg-theme-elevated shrink-0">
        <div className="p-2 flex items-end justify-center text-[10px] font-semibold text-theme-text-muted border-r border-theme-border">
          GMT
        </div>

        {weekDays.map((day) => {
          const todayFlag = isToday(day);
          const selectedFlag = isSameDay(day, selectedDate);
          return (
            <div
              key={day.toISOString()}
              className={`py-2 px-1 text-center border-r border-theme-border last:border-r-0 transition-colors ${
                todayFlag ? 'bg-theme-today/55' : ''
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-theme-text-secondary">
                {format(day, 'EEE')}
              </div>
              <TodayPulse
                token={todayFlag ? todayPulseToken : 0}
                className="mt-1 justify-center"
              >
                <button
                  type="button"
                  onClick={() => {
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
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold tabular-nums transition-transform hover:scale-105 active:scale-95 ${
                    todayFlag
                      ? 'shadow-sm'
                      : selectedFlag
                      ? 'ring-2 ring-theme-accent text-theme-text'
                      : 'text-theme-text hover:bg-theme-cell-hover'
                  }`}
                  title={`View ${format(day, 'EEEE, MMM d')}`}
                >
                  {format(day, 'd')}
                </button>
              </TodayPulse>
            </div>
          );
        })}
      </div>

      {/* All-Day Events Row */}
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] sm:grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b border-theme-border bg-theme-cell-muted/60 shrink-0">
        <div className="px-1.5 py-2 flex items-center justify-center text-[10px] font-semibold text-theme-text-muted border-r border-theme-border">
          All-day
        </div>

        {weekDays.map((day) => {
          const allDayEvents = getOccurrencesForDay(occurrences, day).filter(
            (o) => o.event.allDay
          );
          return (
            <div
              key={`allday-${day.toISOString()}`}
              onClick={() => onCreateAtSlot(day, 9, 0, true)}
              className="min-h-[34px] p-1 border-r border-theme-border last:border-r-0 flex flex-col gap-1 cursor-pointer hover:bg-theme-cell-hover/65 transition-colors"
              title="Click to add all-day event"
            >
              {allDayEvents.map((occ) => (
                <EventCard
                  key={occ.occurrenceId}
                  occurrence={occ}
                  activeTheme={activeTheme}
                  categoryMap={categoryMap}
                  variant="allday"
                  compact
                  onSelect={onSelectOccurrence}
                  onToggleTaskComplete={onToggleTaskComplete}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Scrollable 24-Hour Time Grid */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto themed-scroll relative"
      >
        <div
          className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] sm:grid-cols-[68px_repeat(7,minmax(0,1fr))] relative"
          style={{ height: `${24 * HOUR_HEIGHT_PX}px` }}
        >
          {/* Left Time Gutter */}
          <div className="relative border-r border-theme-border bg-theme-elevated/45 select-none">
            {HOURS.map((hour) => (
              <div
                key={hour}
                style={{ height: `${HOUR_HEIGHT_PX}px` }}
                className="relative pr-2 text-right"
              >
                {hour > 0 && (
                  <span className="inline-block -translate-y-2 text-[10px] font-semibold tabular-nums text-theme-text-muted">
                    {format(new Date(2026, 0, 1, hour, 0), 'h a')}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 7 Day Timeline Columns */}
          {weekDays.map((day) => {
            const todayFlag = isToday(day);
            const dayOccs = getOccurrencesForDay(occurrences, day);
            const positioned = layoutDayTimedOccurrences(dayOccs, day);

            const handleColumnClick = (
              e: React.MouseEvent<HTMLDivElement>
            ) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const offsetY = Math.max(0, e.clientY - rect.top);
              const totalMinutes = Math.min(
                23 * 60 + 30,
                Math.floor((offsetY / HOUR_HEIGHT_PX) * 2) * 30
              );
              const hour = Math.floor(totalMinutes / 60);
              const minute = totalMinutes % 60;
              onSelectDate(day);
              onCreateAtSlot(day, hour, minute, false);
            };

            return (
              <div
                key={`col-${day.toISOString()}`}
                onClick={handleColumnClick}
                className={`relative border-r border-theme-border last:border-r-0 cursor-pointer ${
                  todayFlag ? 'bg-theme-today/20' : 'bg-theme-cell'
                }`}
              >
                {/* Hourly & Half-Hourly Grid Lines */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: `${HOUR_HEIGHT_PX}px` }}
                    className="border-b border-theme-border/80 relative group/slot hover:bg-theme-cell-hover/45 transition-colors"
                  >
                    <div className="absolute inset-x-0 top-1/2 border-b border-dashed border-theme-border/35 pointer-events-none" />
                  </div>
                ))}

                {/* Current Time Indicator */}
                {todayFlag && (
                  <div
                    style={{ top: `${nowTopPercent}%` }}
                    className="absolute inset-x-0 z-20 pointer-events-none flex items-center"
                  >
                    <span
                      style={{ backgroundColor: 'var(--t-accent)' }}
                      className="w-2.5 h-2.5 rounded-full -ml-1.5 shadow"
                    />
                    <div
                      style={{ backgroundColor: 'var(--t-accent)' }}
                      className="h-[2px] flex-1"
                    />
                  </div>
                )}

                {/* Positioned Timed Events */}
                {positioned.map((pos) => {
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
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                      }}
                      className="absolute z-10 min-h-[24px]"
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
            );
          })}
        </div>
      </div>
    </div>
  );
};
