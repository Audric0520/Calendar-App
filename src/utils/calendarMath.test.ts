import { describe, it, expect } from 'vitest';
import {
  countEventOccurrencesUpTo,
  expandEventsInRange,
  parseHhmmMinutes,
  sanitizeDaySchedule,
  sanitizeExceptionDates,
  parseLocalDateTime,
  formatLocalDateTime,
  makeDefaultCustomRecurrence,
} from './calendarMath';
import {
  buildEventUpsertPayload,
  mapRowToCalendarEvent,
} from '../services/cloudSync';
import {
  CalendarEvent,
  CustomRecurrenceConfig,
} from '../types/calendar';

const MON = 1;
const SAT = 6;

const baseStart = parseLocalDateTime('2026-11-02T09:00'); // Monday
const baseStartStr = formatLocalDateTime(baseStart);

function makeEvent(
  overrides: {
    [K in keyof CalendarEvent]?: K extends 'customRecurrence'
      ? Partial<CustomRecurrenceConfig>
      : CalendarEvent[K];
  }
): CalendarEvent {
  const custom: CustomRecurrenceConfig = {
    ...makeDefaultCustomRecurrence(baseStart),
    ...(overrides.customRecurrence ?? {}),
  };
  return {
    id: 'evt-1',
    title: 'Test series',
    start: baseStartStr,
    end: '2026-11-02T10:00',
    allDay: false,
    category: 'class-sched',
    location: '',
    description: '',
    recurrence: 'custom',
    isTask: false,
    completed: false,
    createdAt: '2026-11-02T09:00:00',
    updatedAt: '2026-11-02T09:00:00',
    ...overrides,
    customRecurrence: custom,
  };
}

const rangeStart = parseLocalDateTime('2026-11-02T00:00');
const rangeEnd = parseLocalDateTime('2026-11-30T23:59');

function startsAt(occ: { start: Date; end: Date }) {
  return {
    weekday: occ.start.getDay(),
    hhmm: `${occ.start.getHours().toString().padStart(2, '0')}:${occ.start
      .getMinutes()
      .toString()
      .padStart(2, '0')}`,
    endHhmm: `${occ.end.getHours().toString().padStart(2, '0')}:${occ.end
      .getMinutes()
      .toString()
      .padStart(2, '0')}`,
    iso: occ.start.toISOString(),
  };
}

describe('expandEventsInRange with custom weekly daySchedule', () => {
  it('produces the right dates and times per weekday over a 4-week window', () => {
    const event = makeEvent({
      customRecurrence: {
        daysOfWeek: [MON, SAT],
        daySchedule: [
          { weekday: MON, start: '07:30', end: '10:00' },
          { weekday: SAT, start: '08:00', end: '09:00' },
        ],
      },
    });

    const occs = expandEventsInRange([event], rangeStart, rangeEnd);

    // Mondays: Nov 2, 9, 16, 23, 30 at 07:30 -> 10:00 (5)
    // Saturdays: Nov 7, 14, 21, 28 at 08:00 -> 09:00 (4)
    expect(occs).toHaveLength(9);

    const mondays = occs.filter((o) => o.start.getDay() === MON);
    const saturdays = occs.filter((o) => o.start.getDay() === SAT);
    expect(mondays).toHaveLength(5);
    expect(saturdays).toHaveLength(4);

    for (const o of mondays) {
      expect(startsAt(o)).toMatchObject({
        weekday: MON,
        hhmm: '07:30',
        endHhmm: '10:00',
      });
    }
    for (const o of saturdays) {
      expect(startsAt(o)).toMatchObject({
        weekday: SAT,
        hhmm: '08:00',
        endHhmm: '09:00',
      });
    }

    // Chronological order
    const dates = occs.map((o) => o.start.toISOString());
    expect(dates).toEqual([
      '2026-11-02T07:30:00.000Z',
      '2026-11-07T08:00:00.000Z',
      '2026-11-09T07:30:00.000Z',
      '2026-11-14T08:00:00.000Z',
      '2026-11-16T07:30:00.000Z',
      '2026-11-21T08:00:00.000Z',
      '2026-11-23T07:30:00.000Z',
      '2026-11-28T08:00:00.000Z',
      '2026-11-30T07:30:00.000Z',
    ]);
  });

  it('expands exactly as before when daySchedule is absent', () => {
    const event = makeEvent({
      customRecurrence: {
        daysOfWeek: [MON, SAT],
        // no daySchedule
      },
    });

    const occs = expandEventsInRange([event], rangeStart, rangeEnd);

    expect(occs).toHaveLength(9);
    for (const o of occs) {
      expect(o.start.getHours()).toBe(9);
      expect(o.start.getMinutes()).toBe(0);
      expect(o.end.getHours()).toBe(10);
      expect(o.end.getMinutes()).toBe(0);
    }
  });

  it('ignores malformed daySchedule safely and falls back to event times', () => {
    const event = makeEvent({
      customRecurrence: {
        daysOfWeek: [MON, SAT],
        daySchedule: [
          { weekday: 7, start: '07:30', end: '08:00' }, // invalid weekday (Sunday not selected anyway; out of range is invalid)
          { weekday: MON, start: 'not-a-time', end: '08:00' }, // invalid start
          { weekday: SAT, start: '09:00', end: '08:00' }, // end before start
          { weekday: MON, start: '07:30', end: '07:30' }, // end == start (invalid)
          { weekday: 2, start: '07:00', end: '08:00' }, // Tuesday not in daysOfWeek -> ignored
        ],
      },
    });

    // Must not crash or blank the page
    expect(() => expandEventsInRange([event], rangeStart, rangeEnd)).not.toThrow();

    const occs = expandEventsInRange([event], rangeStart, rangeEnd);
    expect(occs).toHaveLength(9);
    for (const o of occs) {
      // Falls back to the event's own 09:00-10:00 times
      expect(o.start.getHours()).toBe(9);
      expect(o.start.getMinutes()).toBe(0);
      expect(o.end.getHours()).toBe(10);
    }
  });
});

describe('sanitizeDaySchedule', () => {
  it('returns empty for non-array / empty input', () => {
    expect(sanitizeDaySchedule(null)).toEqual([]);
    expect(sanitizeDaySchedule(undefined)).toEqual([]);
    expect(sanitizeDaySchedule([])).toEqual([]);
  });

  it('keeps valid entries and normalizes to minutes', () => {
    expect(
      sanitizeDaySchedule([{ weekday: 1, start: '07:30', end: '10:00' }])
    ).toEqual([{ weekday: 1, startMins: 450, endMins: 600 }]);
  });

  it('drops invalid entries and dedupes by weekday', () => {
    const input = [
      { weekday: 9, start: '07:30', end: '08:00' }, // out-of-range weekday
      { weekday: 1, start: 'bad', end: '08:00' }, // invalid start
      { weekday: 1, start: '07:30', end: '07:30' }, // end not after start
      { weekday: 6, start: '08:00', end: '09:00' }, // valid
      { weekday: 6, start: '10:00', end: '11:00' }, // duplicate weekday -> ignored
      { weekday: 3, start: '23:59', end: '24:00' }, // invalid end hour
    ];
    expect(sanitizeDaySchedule(input)).toEqual([
      { weekday: 6, startMins: 480, endMins: 540 },
    ]);
  });
});

describe('parseHhmmMinutes', () => {
  it('parses valid HH:mm and rejects malformed input', () => {
    expect(parseHhmmMinutes('07:30')).toBe(450);
    expect(parseHhmmMinutes('00:00')).toBe(0);
    expect(parseHhmmMinutes('23:59')).toBe(23 * 60 + 59);
    expect(parseHhmmMinutes('9:5')).toBe(null);
    expect(parseHhmmMinutes('25:00')).toBe(null);
    expect(parseHhmmMinutes('10:60')).toBe(null);
    expect(parseHhmmMinutes(undefined)).toBe(null);
    expect(parseHhmmMinutes('')).toBe(null);
  });
});

describe('customRecurrence JSON round-trip with daySchedule', () => {
  it('survives serialize/deserialize unchanged', () => {
    const config: CustomRecurrenceConfig = {
      interval: 1,
      unit: 'week',
      daysOfWeek: [1, 6],
      daySchedule: [
        { weekday: 1, start: '07:30', end: '10:00' },
        { weekday: 6, start: '08:00', end: '09:00' },
      ],
      endType: 'never',
      occurrences: 13,
    };

    const roundTripped = JSON.parse(JSON.stringify(config)) as CustomRecurrenceConfig;
    expect(roundTripped).toEqual(config);
    expect(roundTripped.daySchedule).toHaveLength(2);
    expect(roundTripped.daySchedule?.[0]).toEqual({
      weekday: 1,
      start: '07:30',
      end: '10:00',
    });
  });
});

describe('exceptionDates validation', () => {
  it('treats missing / null as empty and ignores malformed entries', () => {
    expect(sanitizeExceptionDates(null)).toEqual([]);
    expect(sanitizeExceptionDates(undefined)).toEqual([]);
    expect(sanitizeExceptionDates([])).toEqual([]);
    expect(
      sanitizeExceptionDates([
        null,
        'not-a-date',
        '2026-13-99',
        123,
        { foo: 'bar' },
        '2026-11-09',
        '2026-11-09', // duplicate
        '2026-02-30', // invalid calendar date
      ])
    ).toEqual(['2026-11-09']);
  });

  it('normalizes valid dates to YYYY-MM-DD', () => {
    expect(sanitizeExceptionDates(['2026-11-09'])).toEqual(['2026-11-09']);
  });
});

describe('delete scope logic', () => {
  it('single event and single-occurrence series delete directly (no modal)', () => {
    // Non-recurring event -> count is 0 -> immediate delete.
    expect(countEventOccurrencesUpTo(makeEvent({ recurrence: 'none' }), 2)).toBe(
      0
    );

    // Recurring series limited to exactly one occurrence -> count is 1.
    const oneOff = makeEvent({
      customRecurrence: {
        ...makeDefaultCustomRecurrence(baseStart),
        daysOfWeek: [1],
        endType: 'after',
        occurrences: 1,
      },
    });
    expect(countEventOccurrencesUpTo(oneOff, 2)).toBe(1);
  });

  it('expansion skips dates in exceptionDates', () => {
    const event = makeEvent({
      customRecurrence: {
        ...makeDefaultCustomRecurrence(baseStart),
        daysOfWeek: [1, 6],
      },
      exceptionDates: ['2026-11-09'], // a Monday (top-level field)
    });

    const occs = expandEventsInRange([event], rangeStart, rangeEnd);
    // Nov 2, 7, 9(skip), 14, 16, 21, 23, 28, 30 -> 8 occurrences
    expect(occs).toHaveLength(8);
    for (const o of occs) {
      expect(formatLocalDateTime(o.start)).not.toBe('2026-11-09T09:00');
    }
  });

  it('recurrenceUntil truncates expansion at the day before', () => {
    const event = makeEvent({
      recurrenceUntil: '2026-11-15',
      customRecurrence: {
        ...makeDefaultCustomRecurrence(baseStart),
        daysOfWeek: [1, 6],
        endType: 'on',
        endDate: '2026-11-15',
      },
    });

    const occs = expandEventsInRange([event], rangeStart, rangeEnd);
    const dates = occs.map((o) => formatLocalDateTime(o.start).slice(0, 10));
    expect(dates).toEqual(['2026-11-02', '2026-11-07', '2026-11-09', '2026-11-14']);
  });

  it('daySchedule: "This event" skips only that date, other weekday per-day times unchanged', () => {
    const event = makeEvent({
      customRecurrence: {
        ...makeDefaultCustomRecurrence(baseStart),
        daysOfWeek: [1, 6],
        daySchedule: [
          { weekday: 1, start: '07:30', end: '10:00' },
          { weekday: 6, start: '08:00', end: '09:00' },
        ],
      },
      exceptionDates: ['2026-11-09'], // skip the Monday Nov 9 (top-level field)
    });

    const occs = expandEventsInRange([event], rangeStart, rangeEnd);
    // Nov 2 Mon 07:30, Nov 7 Sat 08:00, Nov 9 Mon SKIPPED,
    // Nov 14 Sat 08:00, Nov 16 Mon 07:30, Nov 21 Sat 08:00, ...
    const mondays = occs.filter((o) => o.start.getDay() === 1);
    const saturdays = occs.filter((o) => o.start.getDay() === 6);
    expect(mondays).toHaveLength(4); // Nov 2, 16, 23, 30 (Nov 9 skipped)
    expect(saturdays).toHaveLength(4); // Nov 7, 14, 21, 28
    for (const o of mondays) {
      expect(`${o.start.getHours().toString().padStart(2, '0')}:${o.start
        .getMinutes()
        .toString()
        .padStart(2, '0')}`).toBe('07:30');
      expect(`${o.end.getHours().toString().padStart(2, '0')}:${o.end
        .getMinutes()
        .toString()
        .padStart(2, '0')}`).toBe('10:00');
    }
    for (const o of saturdays) {
      expect(`${o.start.getHours().toString().padStart(2, '0')}:${o.start
        .getMinutes()
        .toString()
        .padStart(2, '0')}`).toBe('08:00');
      expect(`${o.end.getHours().toString().padStart(2, '0')}:${o.end
        .getMinutes()
        .toString()
        .padStart(2, '0')}`).toBe('09:00');
    }
    // daySchedule itself is untouched on the series
    expect(event.customRecurrence?.daySchedule).toEqual([
      { weekday: 1, start: '07:30', end: '10:00' },
      { weekday: 6, start: '08:00', end: '09:00' },
    ]);
  });
});

describe('Supabase sync row mapping for delete scope', () => {
  const baseEvent: CalendarEvent = {
    id: 'evt-1',
    title: 'Weekly series',
    start: '2026-11-02T09:00',
    end: '2026-11-02T10:00',
    allDay: false,
    category: 'class-sched',
    location: '',
    description: '',
    recurrence: 'custom',
    isTask: false,
    completed: false,
    createdAt: '2026-11-02T09:00:00',
    updatedAt: '2026-11-02T09:00:00',
    customRecurrence: {
      interval: 1,
      unit: 'week',
      daysOfWeek: [1, 6],
      endType: 'never',
    },
  };

  it('(a) "This event" produces an upsert payload containing exception_dates as an array', () => {
    const event = {
      ...baseEvent,
      exceptionDates: ['2026-11-09'],
    };
    const payload = buildEventUpsertPayload(event, {
      includeCreatedAt: true,
      deletedAt: null,
    });
    expect(payload.exception_dates).toEqual(['2026-11-09']);
    expect(Array.isArray(payload.exception_dates)).toBe(true);
  });

  it('(b) "This and following" produces a payload with the new recurrence_until', () => {
    const event = {
      ...baseEvent,
      recurrenceUntil: '2026-11-15',
      exceptionDates: undefined,
    };
    const payload = buildEventUpsertPayload(event, {
      includeCreatedAt: true,
      deletedAt: null,
    });
    expect(payload.recurrence_until).toBe('2026-11-15');
    expect(payload.exception_dates).toBeNull();
  });

  it('(c) row-mapping round trip keeps exceptionDates and recurrenceUntil', () => {
    // App event -> Supabase row (payload) -> app event (mapRowToCalendarEvent)
    const event = {
      ...baseEvent,
      recurrenceUntil: '2026-11-15',
      exceptionDates: ['2026-11-09', '2026-11-16'],
    };
    const payload = buildEventUpsertPayload(event, {
      includeCreatedAt: true,
      deletedAt: null,
    });

    const row: Parameters<typeof mapRowToCalendarEvent>[0] = {
      id: payload.id,
      title: payload.title,
      start_local: payload.start_local,
      end_local: payload.end_local,
      all_day: payload.all_day,
      category: payload.category,
      location: payload.location,
      description: payload.description,
      recurrence: payload.recurrence,
      recurrence_until: payload.recurrence_until,
      custom_recurrence: payload.custom_recurrence,
      exception_dates: payload.exception_dates,
      image_url: payload.image_url,
      image_path: payload.image_path,
      image_name: payload.image_name,
      is_task: payload.is_task,
      completed: payload.completed,
      created_at: payload.created_at,
      deleted_at: payload.deleted_at,
    };

    const mapped = mapRowToCalendarEvent(row);
    expect(mapped.recurrenceUntil).toBe('2026-11-15');
    expect(mapped.exceptionDates).toEqual(['2026-11-09', '2026-11-16']);
  });

  it('(c) maps null exception_dates back to undefined (no exceptions)', () => {
    const row: Parameters<typeof mapRowToCalendarEvent>[0] = {
      id: 'evt-1',
      title: 'Series',
      start_local: '2026-11-02T09:00',
      end_local: '2026-11-02T10:00',
      all_day: false,
      category: 'class-sched',
      location: '',
      description: '',
      recurrence: 'custom',
      recurrence_until: null,
      custom_recurrence: null,
      exception_dates: null,
      image_url: null,
      image_path: null,
      image_name: null,
      is_task: false,
      completed: false,
      created_at: '2026-11-02T09:00:00',
      updated_at: '2026-11-02T09:00:00',
      deleted_at: null,
    };

    const mapped = mapRowToCalendarEvent(row);
    expect(mapped.exceptionDates).toBeUndefined();
  });

  it('(d) expansion skips exception dates after a round trip', () => {
    const event = {
      ...baseEvent,
      exceptionDates: ['2026-11-09'], // a Monday
    };
    const payload = buildEventUpsertPayload(event, {
      includeCreatedAt: true,
      deletedAt: null,
    });

    const row: Parameters<typeof mapRowToCalendarEvent>[0] = {
      id: payload.id,
      title: payload.title,
      start_local: payload.start_local,
      end_local: payload.end_local,
      all_day: payload.all_day,
      category: payload.category,
      location: payload.location,
      description: payload.description,
      recurrence: payload.recurrence,
      recurrence_until: payload.recurrence_until,
      custom_recurrence: payload.custom_recurrence,
      exception_dates: payload.exception_dates,
      image_url: payload.image_url,
      image_path: payload.image_path,
      image_name: payload.image_name,
      is_task: payload.is_task,
      completed: payload.completed,
      created_at: payload.created_at,
      deleted_at: payload.deleted_at,
    };

    const mapped = mapRowToCalendarEvent(row);
    const rangeStart = parseLocalDateTime('2026-11-02T00:00');
    const rangeEnd = parseLocalDateTime('2026-11-30T23:59');
    const occs = expandEventsInRange([mapped], rangeStart, rangeEnd);

    // Nov 2, 7, 9(skip), 14, 16, 21, 23, 28, 30 -> 8 occurrences
    expect(occs).toHaveLength(8);
    for (const o of occs) {
      expect(formatLocalDateTime(o.start)).not.toBe('2026-11-09T09:00');
    }
  });

  it('(d) malformed exception_dates from a row is ignored safely', () => {
    const row: Parameters<typeof mapRowToCalendarEvent>[0] = {
      id: 'evt-1',
      title: 'Series',
      start_local: '2026-11-02T09:00',
      end_local: '2026-11-02T10:00',
      all_day: false,
      category: 'class-sched',
      location: '',
      description: '',
      recurrence: 'custom',
      recurrence_until: null,
      custom_recurrence: null,
      exception_dates: [
        '2026-11-09',
        null,
        'not-a-date',
        123,
        '2026-13-99',
      ] as unknown as string[] | null,
      image_url: null,
      image_path: null,
      image_name: null,
      is_task: false,
      completed: false,
      created_at: '2026-11-02T09:00:00',
      updated_at: '2026-11-02T09:00:00',
      deleted_at: null,
    };

    // Must not throw
    expect(() => mapRowToCalendarEvent(row)).not.toThrow();
    const mapped = mapRowToCalendarEvent(row);
    expect(mapped.exceptionDates).toEqual(['2026-11-09']);
  });
});
