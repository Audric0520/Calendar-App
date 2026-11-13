export type RecurrenceRule =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'custom';

export type CustomRepeatUnit = 'day' | 'week' | 'month' | 'year';

export type CustomRepeatEndType = 'never' | 'on' | 'after';

export interface DayScheduleEntry {
  weekday: number;
  start: string;
  end: string;
}

export interface CustomRecurrenceConfig {
  interval: number;
  unit: CustomRepeatUnit;
  daysOfWeek?: number[];
  daySchedule?: DayScheduleEntry[];
  endType: CustomRepeatEndType;
  endDate?: string;
  occurrences?: number;
}

export interface RecurrenceEventInput {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  recurrence: RecurrenceRule;
  recurrenceUntil?: string;
  customRecurrence?: CustomRecurrenceConfig;
  exceptionDates?: string[];
  isTask?: boolean;
  completed?: boolean;
}

export interface SanitizedDaySchedule {
  weekday: number;
  startMins: number;
  endMins: number;
}

export interface WallDateTimeParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
  second: number; // 0..59
}

export interface WallOccurrence<
  TEvent extends RecurrenceEventInput = RecurrenceEventInput,
> {
  occurrenceId: string;
  masterId: string;
  event: TEvent;
  start: WallDateTimeParts;
  end: WallDateTimeParts;
  startLocal: string;
  endLocal: string;
  startWallMs: number;
  endWallMs: number;
  isRecurringInstance: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AFTER_OCCURRENCES = 2000;
const MAX_EXPANSION_ITERATIONS = 100_000;

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

function pad4(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(4, '0');
}

export function daysInWallMonth(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

export function isValidWallDate(
  year: number,
  month: number,
  day: number
): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInWallMonth(year, month);
}

export function parseWallDateTime(value: string): WallDateTimeParts {
  const clean = (value || '').trim().split('.')[0].replace(/Z$/i, '');
  if (!clean) {
    return {
      year: 1970,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    };
  }
  const [datePart, timePart = '00:00:00'] = clean.split('T');
  const [rawY, rawM, rawD] = datePart.split('-').map(Number);
  const [rawH = 0, rawMin = 0, rawSec = 0] = timePart.split(':').map(Number);

  const year = Number.isFinite(rawY) ? rawY : 1970;
  const month = Number.isFinite(rawM) && rawM >= 1 && rawM <= 12 ? rawM : 1;
  const maxDay = daysInWallMonth(year, month);
  const day = Number.isFinite(rawD) && rawD >= 1 ? Math.min(rawD, maxDay) : 1;
  const hour =
    Number.isFinite(rawH) && rawH >= 0 && rawH <= 23 ? rawH : 0;
  const minute =
    Number.isFinite(rawMin) && rawMin >= 0 && rawMin <= 59 ? rawMin : 0;
  const second =
    Number.isFinite(rawSec) && rawSec >= 0 && rawSec <= 59 ? rawSec : 0;

  return { year, month, day, hour, minute, second };
}

export function wallDateTimeToEpochMs(parts: WallDateTimeParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0
  );
}

export function epochMsToWallDateTime(ms: number): WallDateTimeParts {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

export function formatWallDateTime(parts: WallDateTimeParts): string {
  return `${pad4(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(
    parts.hour
  )}:${pad2(parts.minute)}`;
}

export function formatWallDate(parts: WallDateTimeParts): string {
  return `${pad4(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function startOfWallDay(parts: WallDateTimeParts): WallDateTimeParts {
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 0,
    minute: 0,
    second: 0,
  };
}

export function endOfWallDay(parts: WallDateTimeParts): WallDateTimeParts {
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 23,
    minute: 59,
    second: 59,
  };
}

export function addWallDays(
  parts: WallDateTimeParts,
  days: number
): WallDateTimeParts {
  return epochMsToWallDateTime(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day + days,
      parts.hour,
      parts.minute,
      parts.second,
      0
    )
  );
}

export function addWallMonths(
  parts: WallDateTimeParts,
  months: number
): WallDateTimeParts {
  const totalMonths = parts.year * 12 + (parts.month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (((totalMonths % 12) + 12) % 12) + 1;
  const clampedDay = Math.min(parts.day, daysInWallMonth(targetYear, targetMonth));
  return {
    year: targetYear,
    month: targetMonth,
    day: clampedDay,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

export function addWallYears(
  parts: WallDateTimeParts,
  years: number
): WallDateTimeParts {
  const targetYear = parts.year + years;
  const clampedDay = Math.min(parts.day, daysInWallMonth(targetYear, parts.month));
  return {
    year: targetYear,
    month: parts.month,
    day: clampedDay,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

export function wallWeekday(parts: WallDateTimeParts): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function startOfWallWeek(parts: WallDateTimeParts): WallDateTimeParts {
  const dow = wallWeekday(parts);
  return addWallDays(startOfWallDay(parts), -dow);
}

export function wallDaysBetween(
  a: WallDateTimeParts,
  b: WallDateTimeParts
): number {
  const msA = Date.UTC(a.year, a.month - 1, a.day);
  const msB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((msA - msB) / MS_PER_DAY);
}

export function wallWeeksBetween(
  a: WallDateTimeParts,
  b: WallDateTimeParts
): number {
  const startA = startOfWallWeek(a);
  const startB = startOfWallWeek(b);
  return Math.round(wallDaysBetween(startA, startB) / 7);
}

export function wallMonthsBetween(
  a: WallDateTimeParts,
  b: WallDateTimeParts
): number {
  return (a.year - b.year) * 12 + (a.month - b.month);
}

export function wallYearsBetween(
  a: WallDateTimeParts,
  b: WallDateTimeParts
): number {
  return a.year - b.year;
}

export function parseHhmmMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

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
    ) {
      continue;
    }
    if (seen.has(weekday)) continue;
    const startMins = parseHhmmMinutes(e.start);
    const endMins = parseHhmmMinutes(e.end);
    if (startMins === null || endMins === null) continue;
    if (endMins <= startMins) continue;
    seen.add(weekday);
    out.push({ weekday, startMins, endMins });
  }
  return out;
}

export function sanitizeExceptionDates(exceptionDates: unknown): string[] {
  if (!Array.isArray(exceptionDates)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of exceptionDates) {
    if (typeof raw !== 'string' || !ISO_DATE_RE.test(raw)) continue;
    const [y, m, d] = raw.split('-').map(Number);
    if (!isValidWallDate(y, m, d)) continue;
    const iso = `${pad4(y)}-${pad2(m)}-${pad2(d)}`;
    if (!seen.has(iso)) {
      seen.add(iso);
      out.push(iso);
    }
  }
  return out;
}

export function makeDefaultWallCustomRecurrence(
  startDate: WallDateTimeParts
): CustomRecurrenceConfig {
  return {
    interval: 1,
    unit: 'week',
    daysOfWeek: [wallWeekday(startDate)],
    endType: 'never',
    endDate: formatWallDate(addWallMonths(startDate, 3)),
    occurrences: 13,
  };
}

export function expandEventsInWallWindow<TEvent extends RecurrenceEventInput>(
  events: readonly TEvent[],
  windowStart: WallDateTimeParts,
  windowEnd: WallDateTimeParts
): WallOccurrence<TEvent>[] {
  const occurrences: WallOccurrence<TEvent>[] = [];
  const winStartMs = wallDateTimeToEpochMs(windowStart);
  const winEndMs = wallDateTimeToEpochMs(windowEnd);

  for (const event of events) {
    if (!event.start) continue;

    const baseStart = parseWallDateTime(event.start);
    const baseStartMs = wallDateTimeToEpochMs(baseStart);
    const rawEnd = event.end
      ? parseWallDateTime(event.end)
      : epochMsToWallDateTime(baseStartMs + 60 * 60 * 1000);
    const rawEndMs = wallDateTimeToEpochMs(rawEnd);
    const baseEndMs =
      rawEndMs < baseStartMs ? baseStartMs + 60 * 60 * 1000 : rawEndMs;
    const durationMs = Math.max(0, baseEndMs - baseStartMs);

    const exceptionDates = new Set(sanitizeExceptionDates(event.exceptionDates));
    const isExceptioned = (d: WallDateTimeParts) =>
      exceptionDates.has(formatWallDate(d));

    if (!event.recurrence || event.recurrence === 'none') {
      if (isExceptioned(baseStart)) continue;
      const baseEndParts = epochMsToWallDateTime(baseEndMs);
      const effectiveEnd = event.allDay
        ? endOfWallDay(baseEndParts)
        : baseEndParts;
      const effectiveEndMs = wallDateTimeToEpochMs(effectiveEnd);

      if (baseStartMs <= winEndMs && effectiveEndMs >= winStartMs) {
        const startLocal = formatWallDateTime(baseStart);
        occurrences.push({
          occurrenceId: `${event.id}::${startLocal}`,
          masterId: event.id,
          event,
          start: baseStart,
          end: effectiveEnd,
          startLocal,
          endLocal: formatWallDateTime(effectiveEnd),
          startWallMs: baseStartMs,
          endWallMs: effectiveEndMs,
          isRecurringInstance: false,
        });
      }
      continue;
    }

    if (wallDateTimeToEpochMs(startOfWallDay(baseStart)) > winEndMs) continue;

    let unit: CustomRepeatUnit = 'day';
    let interval = 1;
    let daysOfWeek: number[] = [wallWeekday(baseStart)];
    let endType: CustomRepeatEndType = event.recurrenceUntil
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
        event.customRecurrence ?? makeDefaultWallCustomRecurrence(baseStart);
      unit = cfg.unit;
      interval = Math.max(1, Math.floor(cfg.interval || 1));
      daysOfWeek =
        cfg.daysOfWeek && cfg.daysOfWeek.length > 0
          ? [...new Set(cfg.daysOfWeek)]
              .filter((d) => d >= 0 && d <= 6)
              .sort((a, b) => a - b)
          : [wallWeekday(baseStart)];
      endType = cfg.endType;
      endDateStr = cfg.endDate;
      if (cfg.endType === 'after') {
        maxOccurrences = Math.max(
          1,
          Math.min(MAX_AFTER_OCCURRENCES, Math.floor(cfg.occurrences || 1))
        );
      }
    }

    const untilBoundaryMs =
      endType === 'on' && endDateStr
        ? wallDateTimeToEpochMs(
            endOfWallDay(parseWallDateTime(`${endDateStr}T23:59:59`))
          )
        : null;

    if (untilBoundaryMs !== null && untilBoundaryMs < winStartMs) continue;

    if (unit === 'week') {
      const anchorSunday = startOfWallWeek(baseStart);
      const baseStartDayMs = wallDateTimeToEpochMs(startOfWallDay(baseStart));

      let startCycle = 0;
      if (endType !== 'after') {
        const diffWeeks = wallWeeksBetween(windowStart, anchorSunday);
        startCycle = Math.max(0, Math.floor(diffWeeks / interval) - 1);
      }

      let emittedTotal = 0;
      const maxWeekCycles =
        endType === 'after' ? maxOccurrences + 2 : MAX_EXPANSION_ITERATIONS;
      let stop = false;

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
        const weekSunday = addWallDays(anchorSunday, cycleIdx * interval * 7);
        const weekSundayMs = wallDateTimeToEpochMs(startOfWallDay(weekSunday));

        if (weekSundayMs > winEndMs) {
          break;
        }

        for (const dow of daysOfWeek) {
          const dayCandidate = addWallDays(weekSunday, dow);
          const schedule = dayScheduleByWeekday.get(dow);

          let instStart: WallDateTimeParts;
          let rawInstEnd: WallDateTimeParts;
          let instStartMs: number;
          let rawInstEndMs: number;

          if (schedule) {
            instStart = {
              year: dayCandidate.year,
              month: dayCandidate.month,
              day: dayCandidate.day,
              hour: Math.floor(schedule.startMins / 60),
              minute: schedule.startMins % 60,
              second: 0,
            };
            rawInstEnd = {
              year: dayCandidate.year,
              month: dayCandidate.month,
              day: dayCandidate.day,
              hour: Math.floor(schedule.endMins / 60),
              minute: schedule.endMins % 60,
              second: 0,
            };
            instStartMs = wallDateTimeToEpochMs(instStart);
            rawInstEndMs = wallDateTimeToEpochMs(rawInstEnd);
          } else {
            instStart = {
              year: dayCandidate.year,
              month: dayCandidate.month,
              day: dayCandidate.day,
              hour: baseStart.hour,
              minute: baseStart.minute,
              second: baseStart.second,
            };
            instStartMs = wallDateTimeToEpochMs(instStart);
            rawInstEndMs = instStartMs + durationMs;
            rawInstEnd = epochMsToWallDateTime(rawInstEndMs);
          }

          if (
            wallDateTimeToEpochMs(startOfWallDay(instStart)) < baseStartDayMs
          ) {
            continue;
          }

          emittedTotal += 1;

          if (endType === 'after' && emittedTotal > maxOccurrences) {
            stop = true;
            break;
          }

          if (untilBoundaryMs !== null && instStartMs > untilBoundaryMs) {
            stop = true;
            break;
          }

          if (instStartMs > winEndMs) {
            stop = true;
            break;
          }

          const instEnd = event.allDay ? endOfWallDay(rawInstEnd) : rawInstEnd;
          const instEndMs = event.allDay
            ? wallDateTimeToEpochMs(instEnd)
            : rawInstEndMs;

          if (isExceptioned(instStart)) continue;
          if (instEndMs >= winStartMs) {
            const startLocal = formatWallDateTime(instStart);
            occurrences.push({
              occurrenceId: `${event.id}::${startLocal}`,
              masterId: event.id,
              event,
              start: instStart,
              end: instEnd,
              startLocal,
              endLocal: formatWallDateTime(instEnd),
              startWallMs: instStartMs,
              endWallMs: instEndMs,
              isRecurringInstance:
                startCycle > 0 ||
                emittedTotal > 1 ||
                instStartMs !== baseStartMs,
            });
          }
        }
      }
      continue;
    }

    // Day / Month / Year interval expansion jumping straight to windowStart
    let stepIndex = 0;
    if (unit === 'day') {
      const diff = wallDaysBetween(windowStart, baseStart);
      stepIndex = Math.max(0, Math.floor((diff - 2) / interval));
    } else if (unit === 'month') {
      const diff = wallMonthsBetween(windowStart, baseStart);
      stepIndex = Math.max(0, Math.floor((diff - 1) / interval));
    } else {
      const diff = wallYearsBetween(windowStart, baseStart);
      stepIndex = Math.max(0, Math.floor((diff - 1) / interval));
    }

    if (endType === 'after' && stepIndex >= maxOccurrences) {
      continue;
    }

    for (let i = 0; i < MAX_EXPANSION_ITERATIONS; i++) {
      const idx = stepIndex + i;
      if (endType === 'after' && idx >= maxOccurrences) break;

      let instStart: WallDateTimeParts;
      if (unit === 'day') {
        instStart = addWallDays(baseStart, idx * interval);
      } else if (unit === 'month') {
        instStart = addWallMonths(baseStart, idx * interval);
      } else {
        instStart = addWallYears(baseStart, idx * interval);
      }

      const instStartMs = wallDateTimeToEpochMs(instStart);
      if (instStartMs > winEndMs) break;
      if (untilBoundaryMs !== null && instStartMs > untilBoundaryMs) break;

      const rawInstEndMs = instStartMs + durationMs;
      const rawInstEnd = epochMsToWallDateTime(rawInstEndMs);
      const instEnd = event.allDay ? endOfWallDay(rawInstEnd) : rawInstEnd;
      const instEndMs = event.allDay
        ? wallDateTimeToEpochMs(instEnd)
        : rawInstEndMs;

      if (isExceptioned(instStart)) continue;
      if (instEndMs >= winStartMs) {
        const startLocal = formatWallDateTime(instStart);
        occurrences.push({
          occurrenceId: `${event.id}::${startLocal}`,
          masterId: event.id,
          event,
          start: instStart,
          end: instEnd,
          startLocal,
          endLocal: formatWallDateTime(instEnd),
          startWallMs: instStartMs,
          endWallMs: instEndMs,
          isRecurringInstance: idx > 0,
        });
      }
    }
  }

  return occurrences.sort((a, b) => {
    if (a.event.allDay !== b.event.allDay) {
      return a.event.allDay ? -1 : 1;
    }
    const diff = a.startWallMs - b.startWallMs;
    if (diff !== 0) return diff;
    return a.event.title.localeCompare(b.event.title);
  });
}
