import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
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
import {
  expandEventsInWallWindow,
  parseHhmmMinutes,
  sanitizeDaySchedule,
  sanitizeExceptionDates,
  type SanitizedDaySchedule,
  type WallDateTimeParts,
} from '../../supabase/functions/_shared/recurrence.ts';

export {
  parseHhmmMinutes,
  sanitizeDaySchedule,
  sanitizeExceptionDates,
  type SanitizedDaySchedule,
};

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

function localDateToWallParts(date: Date): WallDateTimeParts {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

function wallPartsToLocalDate(parts: WallDateTimeParts): Date {
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0
  );
}

export function expandEventsInRange(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date
): EventOccurrence[] {
  const winStart = localDateToWallParts(startOfDay(rangeStart));
  const winEnd = localDateToWallParts(endOfDay(rangeEnd));

  return expandEventsInWallWindow(events, winStart, winEnd).map((occ) => {
    const start = wallPartsToLocalDate(occ.start);
    const rawEnd = wallPartsToLocalDate(occ.end);
    return {
      occurrenceId: occ.occurrenceId,
      masterId: occ.masterId,
      event: occ.event,
      start,
      end: occ.event.allDay ? endOfDay(rawEnd) : rawEnd,
      isRecurringInstance: occ.isRecurringInstance,
    };
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
