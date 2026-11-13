import { describe, it, expect, vi } from 'vitest';
import {
  buildWebPushPayload,
  collectPagedRows,
  constantTimeEqual,
  findDueOccurrencesForUser,
  groupSubscriptionsByUser,
  MAX_PAYLOAD_BYTES,
  MAX_TITLE_CHARS,
  PUSH_TTL_SECONDS,
  PUSH_URGENCY,
  runSendReminders,
  type EventDbRow,
  type PushSubscriptionDbRow,
  type ReminderStore,
} from '../../supabase/functions/send-reminders/logic.ts';
import {
  expandEventsInRange,
  parseLocalDateTime,
} from '../utils/calendarMath';
import type { CalendarEvent } from '../types/calendar';

function makeSubscription(
  overrides: Partial<PushSubscriptionDbRow> = {}
): PushSubscriptionDbRow {
  return {
    user_id: 'user-1',
    endpoint: 'https://push.example/device-1',
    p256dh: 'test-p256dh',
    auth: 'test-auth',
    timezone: 'UTC',
    updated_at: '2026-11-11T00:00:00Z',
    created_at: '2026-11-10T00:00:00Z',
    ...overrides,
  };
}

function makeEventRow(overrides: Partial<EventDbRow> = {}): EventDbRow {
  return {
    id: 'evt-1',
    user_id: 'user-1',
    title: 'Morning Standup',
    start_local: '2026-11-11T07:30',
    end_local: '2026-11-11T08:00',
    all_day: false,
    location: 'Room 101',
    recurrence: 'none',
    recurrence_until: null,
    custom_recurrence: null,
    exception_dates: null,
    is_task: false,
    completed: false,
    deleted_at: null,
    ...overrides,
  };
}

function createInMemoryStore(params: {
  subscriptions: PushSubscriptionDbRow[];
  events: EventDbRow[];
}) {
  const sentKeys = new Set<string>();
  const deletedEndpoints: Array<{ userId: string; endpoint: string }> = [];
  const pruneCutoffs: string[] = [];
  let activeSubscriptions = [...params.subscriptions];

  const store: ReminderStore = {
    async deleteOldSentReminders(cutoffIso) {
      pruneCutoffs.push(cutoffIso);
    },
    async fetchAllPushSubscriptions() {
      return [...activeSubscriptions];
    },
    async fetchActiveEventsForUser(userId) {
      return params.events.filter(
        (e) => e.user_id === userId && e.deleted_at === null
      );
    },
    async tryInsertSentReminder({ userId, eventId, occurrenceStart }) {
      const key = `${userId}|${eventId}|${occurrenceStart}`;
      if (sentKeys.has(key)) return false;
      sentKeys.add(key);
      return true;
    },
    async deletePushSubscription(userId, endpoint) {
      deletedEndpoints.push({ userId, endpoint });
      activeSubscriptions = activeSubscriptions.filter(
        (s) => !(s.user_id === userId && s.endpoint === endpoint)
      );
    },
  };

  return { store, sentKeys, deletedEndpoints, pruneCutoffs };
}

describe('send-reminders Edge Function logic', () => {
  it('(1) selects occurrences inside the 10-min lead + 5-min catch-up window and ignores earlier/later times', () => {
    const rows = [makeEventRow({ start_local: '2026-11-11T07:30' })];

    // 10m01s before -> too early
    expect(
      findDueOccurrencesForUser(rows, new Date('2026-11-11T07:19:59Z'), 'UTC')
    ).toHaveLength(0);

    // Exact 10m before -> due
    const atExact = findDueOccurrencesForUser(
      rows,
      new Date('2026-11-11T07:20:00Z'),
      'UTC'
    );
    expect(atExact).toHaveLength(1);
    expect(atExact[0].startLocal).toBe('2026-11-11T07:30');

    // 2m into catch-up window -> due
    expect(
      findDueOccurrencesForUser(rows, new Date('2026-11-11T07:22:00Z'), 'UTC')
    ).toHaveLength(1);

    // Exact 5m catch-up boundary -> due
    expect(
      findDueOccurrencesForUser(rows, new Date('2026-11-11T07:25:00Z'), 'UTC')
    ).toHaveLength(1);

    // At event start -> not due
    expect(
      findDueOccurrencesForUser(rows, new Date('2026-11-11T07:30:00Z'), 'UTC')
    ).toHaveLength(0);
  });

  it('(2) finds today occurrence for a daily event that started three years ago', () => {
    const rows = [
      makeEventRow({
        id: 'daily-3yr',
        start_local: '2023-11-11T07:30',
        end_local: '2023-11-11T08:00',
        recurrence: 'daily',
      }),
    ];

    const due = findDueOccurrencesForUser(
      rows,
      new Date('2026-11-11T07:20:00Z'),
      'UTC'
    );
    expect(due).toHaveLength(1);
    expect(due[0].masterId).toBe('daily-3yr');
    expect(due[0].startLocal).toBe('2026-11-11T07:30');
  });

  it('(3) uses per-day start times from customRecurrence.daySchedule', () => {
    const rows = [
      makeEventRow({
        id: 'sched-1',
        // Base start is Monday 2026-11-02 at 09:00, overridden on Mon to 07:30 and Sat to 08:00
        start_local: '2026-11-02T09:00',
        end_local: '2026-11-02T10:00',
        recurrence: 'custom',
        custom_recurrence: {
          interval: 1,
          unit: 'week',
          daysOfWeek: [1, 6],
          daySchedule: [
            { weekday: 1, start: '07:30', end: '10:00' },
            { weekday: 6, start: '08:00', end: '09:00' },
          ],
          endType: 'never',
        },
      }),
    ];

    // First Monday at 07:20 -> triggers 07:30 even though base start_local was 09:00
    const monDue = findDueOccurrencesForUser(
      rows,
      new Date('2026-11-02T07:20:00Z'),
      'UTC'
    );
    expect(monDue).toHaveLength(1);
    expect(monDue[0].startLocal).toBe('2026-11-02T07:30');

    // Saturday Nov 7 at 07:50 -> triggers 08:00
    const satDue = findDueOccurrencesForUser(
      rows,
      new Date('2026-11-07T07:50:00Z'),
      'UTC'
    );
    expect(satDue).toHaveLength(1);
    expect(satDue[0].startLocal).toBe('2026-11-07T08:00');

    // Saturday Nov 7 at 08:50 -> must NOT trigger at base 09:00
    expect(
      findDueOccurrencesForUser(rows, new Date('2026-11-07T08:50:00Z'), 'UTC')
    ).toHaveLength(0);
  });

  it('(4) skips exceptionDates while keeping other occurrences in the series', () => {
    const rows = [
      makeEventRow({
        id: 'exc-daily',
        start_local: '2026-11-09T07:30',
        end_local: '2026-11-09T08:00',
        recurrence: 'daily',
        exception_dates: ['2026-11-11'],
      }),
    ];

    expect(
      findDueOccurrencesForUser(rows, new Date('2026-11-11T07:20:00Z'), 'UTC')
    ).toHaveLength(0);

    const nextDay = findDueOccurrencesForUser(
      rows,
      new Date('2026-11-12T07:20:00Z'),
      'UTC'
    );
    expect(nextDay).toHaveLength(1);
    expect(nextDay[0].startLocal).toBe('2026-11-12T07:30');
  });

  it('(5) respects recurrenceUntil and customRecurrence after-N end limits', () => {
    const untilRows = [
      makeEventRow({
        id: 'until-daily',
        start_local: '2026-11-08T07:30',
        end_local: '2026-11-08T08:00',
        recurrence: 'daily',
        recurrence_until: '2026-11-10',
      }),
    ];

    expect(
      findDueOccurrencesForUser(
        untilRows,
        new Date('2026-11-10T07:20:00Z'),
        'UTC'
      )
    ).toHaveLength(1);

    expect(
      findDueOccurrencesForUser(
        untilRows,
        new Date('2026-11-11T07:20:00Z'),
        'UTC'
      )
    ).toHaveLength(0);

    const afterRows = [
      makeEventRow({
        id: 'after-3',
        start_local: '2026-11-09T07:30',
        end_local: '2026-11-09T08:00',
        recurrence: 'custom',
        custom_recurrence: {
          interval: 1,
          unit: 'day',
          endType: 'after',
          occurrences: 3,
        },
      }),
    ];

    // Occurrences: Nov 9 (#1), Nov 10 (#2), Nov 11 (#3) -> Nov 12 (#4) excluded
    expect(
      findDueOccurrencesForUser(
        afterRows,
        new Date('2026-11-11T07:20:00Z'),
        'UTC'
      )
    ).toHaveLength(1);
    expect(
      findDueOccurrencesForUser(
        afterRows,
        new Date('2026-11-12T07:20:00Z'),
        'UTC'
      )
    ).toHaveLength(0);
  });

  it('(6) skips soft-deleted events', () => {
    const rows = [
      makeEventRow({
        id: 'deleted-evt',
        start_local: '2026-11-11T07:30',
        deleted_at: '2026-11-11T01:00:00Z',
      }),
    ];

    expect(
      findDueOccurrencesForUser(rows, new Date('2026-11-11T07:20:00Z'), 'UTC')
    ).toHaveLength(0);
  });

  it('(7) skips completed tasks while firing incomplete tasks', () => {
    const rows = [
      makeEventRow({
        id: 'task-done',
        title: 'Submit Essay',
        start_local: '2026-11-11T07:30',
        is_task: true,
        completed: true,
      }),
      makeEventRow({
        id: 'task-open',
        title: 'Review Notes',
        start_local: '2026-11-11T07:30',
        is_task: true,
        completed: false,
      }),
    ];

    const due = findDueOccurrencesForUser(
      rows,
      new Date('2026-11-11T07:20:00Z'),
      'UTC'
    );
    expect(due).toHaveLength(1);
    expect(due[0].masterId).toBe('task-open');
  });

  it('(8) skips all-day events', () => {
    const rows = [
      makeEventRow({
        id: 'all-day-evt',
        start_local: '2026-11-11T00:00',
        end_local: '2026-11-11T23:59',
        all_day: true,
      }),
    ];

    expect(
      findDueOccurrencesForUser(rows, new Date('2026-11-10T23:50:00Z'), 'UTC')
    ).toHaveLength(0);
  });

  it('(9) dedupes via sent_reminders so a second run for the same occurrence sends nothing', async () => {
    const { store, pruneCutoffs } = createInMemoryStore({
      subscriptions: [makeSubscription()],
      events: [makeEventRow({ start_local: '2026-11-11T07:30' })],
    });
    const sendPush = vi.fn(async () => {});

    const first = await runSendReminders({
      store,
      sendPush,
      nowUtc: new Date('2026-11-11T07:20:00Z'),
    });
    expect(first).toEqual({ users: 1, due: 1, sent: 1, removed: 0 });
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example/device-1' }),
      expect.any(String),
      { TTL: PUSH_TTL_SECONDS, urgency: PUSH_URGENCY }
    );

    // 1 minute later (still inside 5-min catch-up window): dedupe skips send
    const second = await runSendReminders({
      store,
      sendPush,
      nowUtc: new Date('2026-11-11T07:21:00Z'),
    });
    expect(second).toEqual({ users: 1, due: 1, sent: 0, removed: 0 });
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(pruneCutoffs).toEqual([
      '2026-11-09T07:20:00.000Z',
      '2026-11-09T07:21:00.000Z',
    ]);
  });

  it('(10) converts UTC time into Asia/Manila vs UTC and uses the most recently updated subscription timezone', async () => {
    const manilaUserSubs = [
      makeSubscription({
        user_id: 'user-manila',
        endpoint: 'https://push.example/old-utc',
        timezone: 'UTC',
        updated_at: '2026-11-10T00:00:00Z',
      }),
      makeSubscription({
        user_id: 'user-manila',
        endpoint: 'https://push.example/new-manila',
        timezone: 'Asia/Manila',
        updated_at: '2026-11-11T00:00:00Z',
      }),
    ];

    const grouped = groupSubscriptionsByUser(manilaUserSubs);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].timezone).toBe('Asia/Manila');

    // 2026-11-11T23:20:00Z == 2026-11-12T07:20:00 in Asia/Manila (UTC+8)
    const nowUtc = new Date('2026-11-11T23:20:00Z');
    const eventRow = [
      makeEventRow({
        user_id: 'user-manila',
        start_local: '2026-11-12T07:30',
        end_local: '2026-11-12T08:30',
      }),
    ];

    expect(
      findDueOccurrencesForUser(eventRow, nowUtc, 'Asia/Manila')
    ).toHaveLength(1);
    expect(findDueOccurrencesForUser(eventRow, nowUtc, 'UTC')).toHaveLength(0);
  });

  it('(11) does not send stale reminders older than the 5-minute catch-up window', () => {
    const rows = [makeEventRow({ start_local: '2026-11-11T07:30' })];

    // 10-min trigger is 07:20:00; 07:25:01 is 5m01s past trigger -> stale
    expect(
      findDueOccurrencesForUser(rows, new Date('2026-11-11T07:25:01Z'), 'UTC')
    ).toHaveLength(0);

    // 07:26:00 -> stale
    expect(
      findDueOccurrencesForUser(rows, new Date('2026-11-11T07:26:00Z'), 'UTC')
    ).toHaveLength(0);
  });

  it('(12) builds payload under 2 KB with truncated title, formatted body, unified tag, and root url', () => {
    const hugeTitle = 'A'.repeat(160);
    const hugeLocation = 'Room '.repeat(800);

    const [occ] = findDueOccurrencesForUser(
      [
        makeEventRow({
          id: 'evt-big',
          title: hugeTitle,
          start_local: '2026-11-11T07:30',
          location: hugeLocation,
        }),
      ],
      new Date('2026-11-11T07:20:00Z'),
      'UTC'
    );

    const json = buildWebPushPayload(occ);
    const byteLength = new TextEncoder().encode(json).length;
    expect(byteLength).toBeLessThan(MAX_PAYLOAD_BYTES);

    const parsed = JSON.parse(json) as {
      title: string;
      body: string;
      tag: string;
      url: string;
    };
    expect(parsed.title.length).toBeLessThanOrEqual(MAX_TITLE_CHARS);
    expect(parsed.tag).toBe('evt-big|2026-11-11T07:30');
    expect(parsed.url).toBe('/');
    expect(parsed.body.startsWith('Starts in 10 min · 7:30 AM · Room')).toBe(
      true
    );

    // Normal event without location
    const [noLocOcc] = findDueOccurrencesForUser(
      [
        makeEventRow({
          id: 'evt-clean',
          title: 'Evening Study',
          start_local: '2026-11-11T19:05',
          location: '   ',
        }),
      ],
      new Date('2026-11-11T18:55:00Z'),
      'UTC'
    );
    const cleanPayload = JSON.parse(buildWebPushPayload(noLocOcc)) as {
      title: string;
      body: string;
      tag: string;
      url: string;
    };
    expect(cleanPayload).toEqual({
      title: 'Evening Study',
      body: 'Starts in 10 min · 7:05 PM',
      tag: 'evt-clean|2026-11-11T19:05',
      url: '/',
    });
  });

  it('enforces constant-time cron secret checks, removes 404/410 subscriptions, and isolates failures', async () => {
    expect(constantTimeEqual('super-secret', 'super-secret')).toBe(true);
    expect(constantTimeEqual('super-secret', 'super-secreX')).toBe(false);
    expect(constantTimeEqual('short', 'longer-secret')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(false);

    const subOk = makeSubscription({ endpoint: 'https://push.example/ok' });
    const subGone = makeSubscription({ endpoint: 'https://push.example/gone' });
    const subErr = makeSubscription({ endpoint: 'https://push.example/err' });

    const { store, deletedEndpoints } = createInMemoryStore({
      subscriptions: [subGone, subErr, subOk],
      events: [makeEventRow({ start_local: '2026-11-11T07:30' })],
    });

    const logger = { warn: vi.fn(), error: vi.fn() };
    const sendPush = vi.fn(async (sub: PushSubscriptionDbRow) => {
      if (sub.endpoint === subGone.endpoint) {
        throw Object.assign(new Error('Gone'), { statusCode: 410 });
      }
      if (sub.endpoint === subErr.endpoint) {
        throw Object.assign(new Error('Upstream timeout'), { statusCode: 503 });
      }
    });

    const summary = await runSendReminders({
      store,
      sendPush,
      nowUtc: new Date('2026-11-11T07:20:00Z'),
      logger,
    });

    expect(summary).toEqual({ users: 1, due: 1, sent: 1, removed: 1 });
    expect(deletedEndpoints).toEqual([
      { userId: 'user-1', endpoint: 'https://push.example/gone' },
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).not.toContain('https://push.example');
    expect(logger.warn.mock.calls[0][0]).not.toContain('test-p256dh');
  });

  it('pages cleanly across > 1000 rows and shares identical expansion with calendarMath', async () => {
    const items = Array.from({ length: 2350 }, (_, idx) => idx);
    const collected = await collectPagedRows(async (from, to) =>
      items.slice(from, to + 1)
    );
    expect(collected).toHaveLength(2350);
    expect(collected[0]).toBe(0);
    expect(collected[2349]).toBe(2349);

    // Parity fixture: verify app expandEventsInRange and shared recurrence module agree
    const appEvent: CalendarEvent = {
      id: 'parity-1',
      title: 'Weekly Lab',
      start: '2026-11-02T09:00',
      end: '2026-11-02T10:00',
      allDay: false,
      category: 'class-sched',
      location: 'Lab A',
      description: '',
      recurrence: 'custom',
      customRecurrence: {
        interval: 1,
        unit: 'week',
        daysOfWeek: [1, 6],
        daySchedule: [
          { weekday: 1, start: '07:30', end: '09:00' },
          { weekday: 6, start: '08:00', end: '09:30' },
        ],
        endType: 'never',
      },
      exceptionDates: ['2026-11-07'],
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    };

    const appOccurrences = expandEventsInRange(
      [appEvent],
      parseLocalDateTime('2026-11-02T00:00'),
      parseLocalDateTime('2026-11-14T23:59')
    );
    // Nov 2 (Mon 07:30), Nov 7 skipped (exception), Nov 9 (Mon 07:30), Nov 14 (Sat 08:00)
    expect(appOccurrences.map((o) => o.occurrenceId)).toEqual([
      'parity-1::2026-11-02T07:30',
      'parity-1::2026-11-09T07:30',
      'parity-1::2026-11-14T08:00',
    ]);
  });
});
