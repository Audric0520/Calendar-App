import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
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
import { CalendarEvent, EventOccurrence } from '../types/calendar';

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

    const untilBoundary = event.recurrenceUntil
      ? endOfDay(parseLocalDateTime(`${event.recurrenceUntil}T23:59`))
      : null;

    if (!event.recurrence || event.recurrence === 'none') {
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

    // Recurring event expansion
    if (isAfter(baseStart, winEnd)) continue;
    if (untilBoundary && isBefore(untilBoundary, winStart)) continue;

    let stepIndex = 0;
    if (event.recurrence === 'daily') {
      const diff = differenceInCalendarDays(winStart, baseStart);
      stepIndex = Math.max(0, diff - 2);
    } else if (event.recurrence === 'weekly') {
      const diff = differenceInCalendarWeeks(winStart, baseStart, {
        weekStartsOn: 0,
      });
      stepIndex = Math.max(0, diff - 1);
    } else if (event.recurrence === 'monthly') {
      const diff = differenceInCalendarMonths(winStart, baseStart);
      stepIndex = Math.max(0, diff - 1);
    }

    const maxIterations = 500;
    for (let i = 0; i < maxIterations; i++) {
      const idx = stepIndex + i;
      let instStart: Date;
      if (event.recurrence === 'daily') {
        instStart = addDays(baseStart, idx);
      } else if (event.recurrence === 'weekly') {
        instStart = addWeeks(baseStart, idx);
      } else {
        instStart = addMonths(baseStart, idx);
      }

      if (isAfter(instStart, winEnd)) break;
      if (untilBoundary && isAfter(instStart, untilBoundary)) break;

      const rawInstEnd = new Date(instStart.getTime() + durationMs);
      const instEnd = event.allDay ? endOfDay(rawInstEnd) : rawInstEnd;

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

export function getOccurrencesForDay(
  occurrences: EventOccurrence[],
  day: Date
): EventOccurrence[] {
  const dStart = startOfDay(day);
  const dEnd = endOfDay(day);

  return occurrences.filter((occ) => {
    // Handle zero-duration events cleanly
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
      const endMins = Math.max(startMins + 25, Math.min(totalDayMinutes, rawEndMins));

      return {
        occ,
        startMins,
        endMins,
      };
    })
    .sort((a, b) => a.startMins - b.startMins || b.endMins - a.endMins);

  if (timed.length === 0) return [];

  // Cluster overlapping intervals into connected components
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
        heightPercent: ((item.endMins - item.startMins) / totalDayMinutes) * 100,
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
