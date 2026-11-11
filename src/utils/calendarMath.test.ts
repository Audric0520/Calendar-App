import { describe, it, expect } from 'vitest';
import {
  expandEventsInRange,
  parseHhmmMinutes,
  sanitizeDaySchedule,
  parseLocalDateTime,
  formatLocalDateTime,
  makeDefaultCustomRecurrence,
} from './calendarMath';
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
