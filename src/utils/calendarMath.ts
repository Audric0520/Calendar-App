import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  differenceInCalendarYears,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import {
  CalendarEvent,
  CustomRecurrenceConfig,
  EventOccurrence,
  RecurrenceRule,
} from '../types/calendar';

export const SHORT_WEEKDAY_NAMES = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

export function parseLocalDateTime(value: string): Date {
  // Expected format: "YYYY-MM-DDTHH:mm", "YYYY-MM-DDTHH:mm:ss", or "YYYY-MM-DD"
  if (!value) return new Date();
  const [datePart, timePart = '00:00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(':').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hour, minute, second, 0);
}

export function formatLocalDateTime(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function formatDateInput(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function makeDefaultCustomRecurrence(
  startDate: Date
): CustomRecurrenceConfig {
  return {
    interval: 1,
    unit: 'week',
    daysOfWeek: [startDate.getDay()],
    endType: 'never',
    endDate: formatDateInput(addMonths(startDate, 3)),
    occurrences: 13,
  };
}

/**
 * Parse a local "HH:mm" string into total minutes since midnight.
 * Returns null for anything malformed (wrong format, out-of-range hours/min).
 */
export function parseHhmmMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export interface SanitizedDaySchedule {
  weekday: number; // 0 = Sunday .. 6 = Saturday
  startMins: number;
  endMins: number;
}

/**
 * Validate and normalize a `daySchedule` array coming from local storage or
 * Supabase. Malformed entries are silently dropped; duplicate weekdays keep
 * the first valid entry. Returns an empty array when nothing is usable, so
 * callers fall back to the event's own start/end times.
 */
export function sanitizeDaySchedule(
  daySchedule: unknown
): SanitizedDaySchedule[] {
  if (!Array.isArray(daySchedule)) return [];
  const seen = new Set<number>();
  const out: SanitizedDaySchedule[] = [];
  for (const entry of daySchedule) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const weekday = e.weekday;
    if (
      typeof weekday !== 'number' ||
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 6
    )
      continue;
    if (seen.has(weekday)) continue;
    const startMins = parseHhmmMinutes(e.start);
    const endMins = parseHhmmMinutes(e.end);
    if (startMins === null || endMins === null) continue;
    // End must be after start on the same day (no overnight events).
    if (endMins <= startMins) continue;
    seen.add(weekday);
    out.push({ weekday, startMins, endMins });
  }
  return out;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate and normalize an `exceptionDates` array coming from local storage
 * or Supabase. Anything that isn't a string array of valid "YYYY-MM-DD" dates
 * is silently dropped; missing or null input yields an empty array. Never
 * throws.
 */
export function sanitizeExceptionDates(
  exceptionDates: unknown
): string[] {
  if (!Array.isArray(exceptionDates)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of exceptionDates) {
    if (typeof raw !== 'string' || !ISO_DATE.test(raw)) continue;
    const parsed = parse(raw, 'yyyy-MM-dd', new Date());
    if (!isValid(parsed)) continue;
    const iso = formatDateInput(parsed);
    if (!seen.has(iso)) {
      seen.add(iso);
      out.push(iso);
    }
  }
  return out;
}

export function formatRecurrenceSummary(params: {
  recurrence: RecurrenceRule;
  recurrenceUntil?: string;
  customRecurrence?: CustomRecurrenceConfig;
  start: string;
}): string {
  const { recurrence, recurrenceUntil, customRecurrence, start } = params;
  const startDate = parseLocalDateTime(start);

  if (!recurrence || recurrence === 'none') {
    return 'Does not repeat';
  }

  if (recurrence === 'daily') {
    return recurrenceUntil
      ? `Daily • until ${format(parseLocalDateTime(recurrenceUntil), 'MMM d, yyyy')}`
      : 'Daily';
  }

  if (recurrence === 'weekly') {
    const dayLabel = format(startDate, 'EEEE');
    return recurrenceUntil
      ? `Weekly on ${dayLabel} • until ${format(parseLocalDateTime(recurrenceUntil), 'MMM d, yyyy')}`
      : `Weekly on ${dayLabel}`;
  }

  if (recurrence === 'monthly') {
    const dayNum = startDate.getDate();
    return recurrenceUntil
      ? `Monthly on day ${dayNum} • until ${format(parseLocalDateTime(recurrenceUntil), 'MMM d, yyyy')}`
      : `Monthly on day ${dayNum}`;
  }

  if (recurrence === 'yearly') {
    const monthDay = format(startDate, 'MMM d');
    return recurrenceUntil
      ? `Annually on ${monthDay} • until ${format(parseLocalDateTime(recurrenceUntil), 'MMM d, yyyy')}`
      : `Annually on ${monthDay}`;
  }

  // Custom recurrence
  const cfg = customRecurrence ?? makeDefaultCustomRecurrence(startDate);
  const interval = Math.max(1, cfg.interval || 1);
  const unitLabel =
    interval === 1 ? cfg.unit : `${cfg.unit}s`;

  let base =
    interval === 1 ? `Every ${cfg.unit}` : `Every ${interval} ${unitLabel}`;

  if (cfg.unit === 'week') {
    const days =
      cfg.daysOfWeek && cfg.daysOfWeek.length > 0
        ? [...new Set(cfg.daysOfWeek)].sort((a, b) => a - b)
        : [startDate.getDay()];
    if (days.length === 7) {
      base = interval === 1 ? 'Every week on all days' : `${base} on all days`;
    } else {
      const names = days.map((d) => SHORT_WEEKDAY_NAMES[d]).join(', ');
      base = `${base} on ${names}`;
    }
  }

  if (cfg.endType === 'on' && cfg.endDate) {
    const endFormatted = format(
      parseLocalDateTime(cfg.endDate),
      'MMM d, yyyy'
    );
    return `${base} • until ${endFormatted}`;
  }

  if (cfg.endType === 'after') {
    const count = Math.max(1, cfg.occurrences ?? 1);
    return `${base} • ${count} ${count === 1 ? 'time' : 'times'}`;
  }

  return base;
}

export function getMonthWeeks(monthDate: Date): Date[][] {
  const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 0 });
  const allDays = eachDayOfInterval({ start, end });

  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }
  return weeks;
}

export function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 0 });
  const end = endOfWeek(date, { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end });
}

export function expandEventsInRange(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date
): EventOccurrence[] {
  const occurrences: EventOccurrence[] = [];
  const winStart = startOfDay(rangeStart);
  const winEnd = endOfDay(rangeEnd);

  for (const event of events) {
    const baseStart = parseLocalDateTime(event.start);
    const rawEnd = parseLocalDateTime(event.end);
    const baseEnd = isBefore(rawEnd, baseStart)
      ? new Date(baseStart.getTime() + 60 * 60 * 1000)
      : rawEnd;
    const durationMs = Math.max(0, baseEnd.getTime() - baseStart.getTime());

    // Dates excluded from this recurring series (also applied to non-recurring
    // events defensively, where it is always empty).
    const exceptionDates = new Set(sanitizeExceptionDates(event.exceptionDates));
    const isExceptioned = (d: Date) => exceptionDates.has(formatDateInput(d));

    if (!event.recurrence || event.recurrence === 'none') {
      if (isExceptioned(baseStart)) continue;
      const effectiveEnd = event.allDay ? endOfDay(baseEnd) : baseEnd;
      if (!isAfter(baseStart, winEnd) && !isBefore(effectiveEnd, winStart)) {
        occurrences.push({
          occurrenceId: `${event.id}::${formatLocalDateTime(baseStart)}`,
          masterId: event.id,
          event,
          start: baseStart,
          end: effectiveEnd,
          isRecurringInstance: false,
        });
      }
      continue;
    }

    if (isAfter(baseStart, winEnd)) continue;

    // Normalize preset rules and custom rules into a unified recurrence descriptor
    let unit: 'day' | 'week' | 'month' | 'year' = 'day';
    let interval = 1;
    let daysOfWeek: number[] = [baseStart.getDay()];
    let endType: 'never' | 'on' | 'after' = event.recurrenceUntil
      ? 'on'
      : 'never';
    let endDateStr: string | undefined = event.recurrenceUntil;
    let maxOccurrences = Infinity;

    if (event.recurrence === 'daily') {
      unit = 'day';
    } else if (event.recurrence === 'weekly') {
      unit = 'week';
    } else if (event.recurrence === 'monthly') {
      unit = 'month';
    } else if (event.recurrence === 'yearly') {
      unit = 'year';
    } else if (event.recurrence === 'custom') {
      const cfg =
        event.customRecurrence ?? makeDefaultCustomRecurrence(baseStart);
      unit = cfg.unit;
      interval = Math.max(1, Math.floor(cfg.interval || 1));
      daysOfWeek =
        cfg.daysOfWeek && cfg.daysOfWeek.length > 0
          ? [...new Set(cfg.daysOfWeek)]
              .filter((d) => d >= 0 && d <= 6)
              .sort((a, b) => a - b)
          : [baseStart.getDay()];
      endType = cfg.endType;
      endDateStr = cfg.endDate;
      if (cfg.endType === 'after') {
        maxOccurrences = Math.max(1, Math.min(2000, Math.floor(cfg.occurrences || 1)));
      }
    }

    const untilBoundary =
      endType === 'on' && endDateStr
        ? endOfDay(parseLocalDateTime(`${endDateStr}T23:59`))
        : null;

    if (untilBoundary && isBefore(untilBoundary, winStart)) continue;

    // Weekly (single or multi-weekday) expansion
    if (unit === 'week') {
      const anchorSunday = startOfWeek(baseStart, { weekStartsOn: 0 });
      const baseStartDay = startOfDay(baseStart);

      let startCycle = 0;
      if (endType !== 'after') {
        const diffWeeks = differenceInCalendarWeeks(winStart, anchorSunday, {
          weekStartsOn: 0,
        });
        startCycle = Math.max(0, Math.floor(diffWeeks / interval) - 1);
      }

      let emittedTotal = 0;
      const maxWeekCycles = endType === 'after' ? maxOccurrences + 2 : 600;
      let stop = false;

      // Per-weekday start/end overrides (unit === 'week' only).
      // Weekdays without an entry keep the event's own start/end times.
      const dayScheduleByWeekday = new Map<number, SanitizedDaySchedule>();
      if (event.customRecurrence?.daySchedule) {
        for (const entry of sanitizeDaySchedule(
          event.customRecurrence.daySchedule
        )) {
          dayScheduleByWeekday.set(entry.weekday, entry);
        }
      }

      for (let c = 0; c < maxWeekCycles && !stop; c++) {
        const cycleIdx = startCycle + c;
        const weekSunday = addWeeks(anchorSunday, cycleIdx * interval);

        if (isAfter(startOfDay(weekSunday), winEnd)) {
          break;
        }

        for (const dow of daysOfWeek) {
          const dayCandidate = addDays(weekSunday, dow);
          const schedule = dayScheduleByWeekday.get(dow);

          let instStart: Date;
          let rawInstEnd: Date;
          if (schedule) {
            instStart = new Date(
              dayCandidate.getFullYear(),
              dayCandidate.getMonth(),
              dayCandidate.getDate(),
              Math.floor(schedule.startMins / 60),
              schedule.startMins % 60,
              0
            );
            rawInstEnd = new Date(
              dayCandidate.getFullYear(),
              dayCandidate.getMonth(),
              dayCandidate.getDate(),
              Math.floor(schedule.endMins / 60),
              schedule.endMins % 60,
              0
            );
          } else {
            instStart = new Date(
              dayCandidate.getFullYear(),
              dayCandidate.getMonth(),
              dayCandidate.getDate(),
              baseStart.getHours(),
              baseStart.getMinutes(),
              baseStart.getSeconds(),
              0
            );
            rawInstEnd = new Date(instStart.getTime() + durationMs);
          }

          // Never generate occurrences prior to the series start date
          if (isBefore(startOfDay(instStart), baseStartDay)) {
            continue;
          }

          emittedTotal += 1;

          if (endType === 'after' && emittedTotal > maxOccurrences) {
            stop = true;
            break;
          }

          if (untilBoundary && isAfter(instStart, untilBoundary)) {
            stop = true;
            break;
          }

          if (isAfter(instStart, winEnd)) {
            stop = true;
            break;
          }

          const instEnd = event.allDay ? endOfDay(rawInstEnd) : rawInstEnd;

          if (isExceptioned(instStart)) continue;
          if (!isBefore(instEnd, winStart)) {
            occurrences.push({
              occurrenceId: `${event.id}::${formatLocalDateTime(instStart)}`,
              masterId: event.id,
              event,
              start: instStart,
              end: instEnd,
              isRecurringInstance:
                startCycle > 0 || emittedTotal > 1 || instStart.getTime() !== baseStart.getTime(),
            });
          }
        }
      }
      continue;
    }

    // Day / Month / Year interval expansion
    let stepIndex = 0;
    if (unit === 'day') {
      const diff = differenceInCalendarDays(winStart, baseStart);
      stepIndex = Math.max(0, Math.floor((diff - 2) / interval));
    } else if (unit === 'month') {
      const diff = differenceInCalendarMonths(winStart, baseStart);
      stepIndex = Math.max(0, Math.floor((diff - 1) / interval));
    } else if (unit === 'year') {
      const diff = differenceInCalendarYears(winStart, baseStart);
      stepIndex = Math.max(0, Math.floor((diff - 1) / interval));
    }

    if (endType === 'after' && stepIndex >= maxOccurrences) {
      continue;
    }

    const maxIterations = 600;
    for (let i = 0; i < maxIterations; i++) {
      const idx = stepIndex + i;
      if (endType === 'after' && idx >= maxOccurrences) break;

      let instStart: Date;
      if (unit === 'day') {
        instStart = addDays(baseStart, idx * interval);
      } else if (unit === 'month') {
        instStart = addMonths(baseStart, idx * interval);
      } else {
        instStart = addYears(baseStart, idx * interval);
      }

      if (isAfter(instStart, winEnd)) break;
      if (untilBoundary && isAfter(instStart, untilBoundary)) break;

      const rawInstEnd = new Date(instStart.getTime() + durationMs);
      const instEnd = event.allDay ? endOfDay(rawInstEnd) : rawInstEnd;

      if (isExceptioned(instStart)) continue;
      if (!isBefore(instEnd, winStart)) {
        occurrences.push({
          occurrenceId: `${event.id}::${formatLocalDateTime(instStart)}`,
          masterId: event.id,
          event,
          start: instStart,
          end: instEnd,
          isRecurringInstance: idx > 0,
        });
      }
    }
  }

  return occurrences.sort((a, b) => {
    if (a.event.allDay !== b.event.allDay) {
      return a.event.allDay ? -1 : 1;
    }
    const diff = a.start.getTime() - b.start.getTime();
    if (diff !== 0) return diff;
    return a.event.title.localeCompare(b.event.title);
  });
}

/**
 * Count how many occurrences a recurring event has, capped at `limit`.
 * Applies `recurrenceUntil`, `maxOccurrences` ('after'), and `exceptionDates`,
 * and is not bound to a visible date window. Stops as soon as `limit`
 * occurrences are found. Returns 0 for non-recurring events.
 */
export function countEventOccurrencesUpTo(
  event: CalendarEvent,
  limit: number
): number {
  if (!event.recurrence || event.recurrence === 'none') return 0;
  if (limit <= 0) return 0;

  const baseStart = parseLocalDateTime(event.start);
  const baseStartDay = startOfDay(baseStart);
  const exceptionDates = new Set(
    sanitizeExceptionDates(event.exceptionDates)
  );
  const isExceptioned = (d: Date) => exceptionDates.has(formatDateInput(d));

  // Normalize the rule (mirrors expandEventsInRange).
  let unit: 'day' | 'week' | 'month' | 'year' = 'day';
  let interval = 1;
  let daysOfWeek: number[] = [baseStart.getDay()];
  let endType: 'never' | 'on' | 'after' = event.recurrenceUntil
    ? 'on'
    : 'never';
  let endDateStr: string | undefined = event.recurrenceUntil;
  let maxOccurrences = Infinity;

  if (event.recurrence === 'custom') {
    const cfg =
      event.customRecurrence ?? makeDefaultCustomRecurrence(baseStart);
    unit = cfg.unit;
    interval = Math.max(1, Math.floor(cfg.interval || 1));
    daysOfWeek =
      cfg.daysOfWeek && cfg.daysOfWeek.length > 0
        ? [...new Set(cfg.daysOfWeek)]
            .filter((d) => d >= 0 && d <= 6)
            .sort((a, b) => a - b)
        : [baseStart.getDay()];
    endType = cfg.endType;
    endDateStr = cfg.endDate;
    if (cfg.endType === 'after') {
      maxOccurrences = Math.max(1, Math.min(2000, Math.floor(cfg.occurrences || 1)));
    }
  } else if (event.recurrence === 'weekly') {
    unit = 'week';
  } else if (event.recurrence === 'monthly') {
    unit = 'month';
  } else if (event.recurrence === 'yearly') {
    unit = 'year';
  } else {
    unit = 'day';
  }

  const untilBoundary =
    endType === 'on' && endDateStr
      ? endOfDay(parseLocalDateTime(`${endDateStr}T23:59`))
      : null;

  let count = 0;

  if (unit === 'week') {
    const anchorSunday = startOfWeek(baseStart, { weekStartsOn: 0 });
    // Cap cycles to avoid looping forever on open-ended ('never') series.
    const maxCycles =
      endType === 'after' ? maxOccurrences + 2 : Math.min(2000, limit * 50 + 10);
    for (let c = 0; c < maxCycles; c += 1) {
      const weekSunday = addWeeks(anchorSunday, c * interval);
      if (untilBoundary && isAfter(startOfDay(weekSunday), untilBoundary)) {
        break;
      }
      for (const dow of daysOfWeek) {
        const dayCandidate = addDays(weekSunday, dow);
        if (isBefore(startOfDay(dayCandidate), baseStartDay)) continue;
        if (isExceptioned(dayCandidate)) continue;
        count += 1;
        if (count >= limit) return count;
        if (endType === 'after' && count >= maxOccurrences) return count;
      }
    }
    return count;
  }

  // Day / Month / Year interval expansion, counting from the series start.
  const maxIterations =
    endType === 'after' ? maxOccurrences : Math.min(2000, limit * 50 + 10);
  for (let i = 0; i < maxIterations; i += 1) {
    let instStart: Date;
    if (unit === 'day') {
      instStart = addDays(baseStart, i * interval);
    } else if (unit === 'month') {
      instStart = addMonths(baseStart, i * interval);
    } else {
      instStart = addYears(baseStart, i * interval);
    }
    if (untilBoundary && isAfter(instStart, untilBoundary)) break;
    if (endType === 'after' && i >= maxOccurrences) break;
    if (isExceptioned(instStart)) continue;
    count += 1;
    if (count >= limit) return count;
  }
  return count;
}

export function getOccurrencesForDay(
  occurrences: EventOccurrence[],
  day: Date
): EventOccurrence[] {
  const dStart = startOfDay(day);
  const dEnd = endOfDay(day);

  return occurrences.filter((occ) => {
    if (occ.start.getTime() === occ.end.getTime()) {
      return !isBefore(occ.start, dStart) && !isAfter(occ.start, dEnd);
    }
    return occ.start <= dEnd && occ.end > dStart;
  });
}

export interface PositionedOccurrence {
  occurrence: EventOccurrence;
  topPercent: number;
  heightPercent: number;
  column: number;
  totalColumns: number;
}

export function layoutDayTimedOccurrences(
  occurrences: EventOccurrence[],
  day: Date
): PositionedOccurrence[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const totalDayMinutes = 24 * 60;

  const timed = occurrences
    .filter((o) => !o.event.allDay)
    .map((occ) => {
      const clampedStart = occ.start < dayStart ? dayStart : occ.start;
      const clampedEnd = occ.end > dayEnd ? dayEnd : occ.end;

      const startMins =
        clampedStart.getHours() * 60 + clampedStart.getMinutes();
      const rawEndMins =
        clampedEnd.getHours() * 60 +
        clampedEnd.getMinutes() +
        (clampedEnd.getSeconds() > 0 ? 1 : 0);
      const endMins = Math.max(
        startMins + 25,
        Math.min(totalDayMinutes, rawEndMins)
      );

      return {
        occ,
        startMins,
        endMins,
      };
    })
    .sort((a, b) => a.startMins - b.startMins || b.endMins - a.endMins);

  if (timed.length === 0) return [];

  const results: PositionedOccurrence[] = [];
  let cluster: typeof timed = [];
  let clusterMaxEnd = -1;

  const flushCluster = (items: typeof timed) => {
    if (items.length === 0) return;
    const columnsEnd: number[] = [];
    const assignedCol: number[] = [];

    for (const item of items) {
      let placedCol = -1;
      for (let c = 0; c < columnsEnd.length; c++) {
        if (columnsEnd[c] <= item.startMins) {
          placedCol = c;
          columnsEnd[c] = item.endMins;
          break;
        }
      }
      if (placedCol === -1) {
        placedCol = columnsEnd.length;
        columnsEnd.push(item.endMins);
      }
      assignedCol.push(placedCol);
    }

    const totalColumns = columnsEnd.length;
    items.forEach((item, idx) => {
      results.push({
        occurrence: item.occ,
        topPercent: (item.startMins / totalDayMinutes) * 100,
        heightPercent:
          ((item.endMins - item.startMins) / totalDayMinutes) * 100,
        column: assignedCol[idx],
        totalColumns,
      });
    });
  };

  for (const item of timed) {
    if (cluster.length === 0 || item.startMins < clusterMaxEnd) {
      cluster.push(item);
      clusterMaxEnd = Math.max(clusterMaxEnd, item.endMins);
    } else {
      flushCluster(cluster);
      cluster = [item];
      clusterMaxEnd = item.endMins;
    }
  }
  flushCluster(cluster);

  return results;
}
