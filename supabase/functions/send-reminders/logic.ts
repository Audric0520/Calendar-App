import {
  epochMsToWallDateTime,
  expandEventsInWallWindow,
  formatWallDateTime,
  sanitizeExceptionDates,
  wallDateTimeToEpochMs,
  type CustomRecurrenceConfig,
  type RecurrenceEventInput,
  type RecurrenceRule,
  type WallDateTimeParts,
  type WallOccurrence,
} from '../_shared/recurrence.ts';

export const LEAD_TIME_MS = 10 * 60 * 1000;
export const CATCHUP_WINDOW_MS = 5 * 60 * 1000;
export const SENT_REMINDER_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
export const MAX_TITLE_CHARS = 100;
export const MAX_PAYLOAD_BYTES = 2048;
export const PUSH_TTL_SECONDS = 600;
export const PUSH_URGENCY = 'high' as const;
export const SUPABASE_PAGE_SIZE = 1000;

const VALID_RECURRENCES = new Set<RecurrenceRule>([
  'none',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'custom',
]);

export interface PushSubscriptionDbRow {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  timezone: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface EventDbRow {
  id: string;
  user_id: string;
  title: string | null;
  start_local: string;
  end_local: string | null;
  all_day: boolean | null;
  location: string | null;
  recurrence: string | null;
  recurrence_until: string | null;
  custom_recurrence: CustomRecurrenceConfig | null;
  exception_dates: string[] | null;
  is_task: boolean | null;
  completed: boolean | null;
  deleted_at: string | null;
}

export interface ServerReminderEvent extends RecurrenceEventInput {
  location: string;
}

export interface UserSubscriptionGroup {
  userId: string;
  timezone: string;
  subscriptions: PushSubscriptionDbRow[];
}

export interface WebPushNotificationPayload {
  title: string;
  body: string;
  tag: string;
  url: '/';
}

export interface SendRemindersSummary {
  users: number;
  due: number;
  sent: number;
  removed: number;
}

export interface ReminderStore {
  deleteOldSentReminders(cutoffIso: string): Promise<void>;
  fetchAllPushSubscriptions(): Promise<PushSubscriptionDbRow[]>;
  fetchActiveEventsForUser(userId: string): Promise<EventDbRow[]>;
  tryInsertSentReminder(params: {
    userId: string;
    eventId: string;
    occurrenceStart: string;
    sentAtIso: string;
  }): Promise<boolean>;
  deletePushSubscription(userId: string, endpoint: string): Promise<void>;
}

export type PushSender = (
  subscription: PushSubscriptionDbRow,
  payloadJson: string,
  options: { TTL: number; urgency: typeof PUSH_URGENCY }
) => Promise<void>;

export interface LoggerLike {
  warn(message: string): void;
  error(message: string): void;
}

const defaultLogger: LoggerLike = {
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};

export function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  const maxLen = Math.max(bytesA.length, bytesB.length);
  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < maxLen; i += 1) {
    const byteA = i < bytesA.length ? bytesA[i] : 0;
    const byteB = i < bytesB.length ? bytesB[i] : 0;
    diff |= byteA ^ byteB;
  }
  return diff === 0;
}

export async function collectPagedRows<T>(
  fetchPage: (from: number, to: number) => Promise<readonly T[]>,
  pageSize = SUPABASE_PAGE_SIZE
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const page = await fetchPage(offset, offset + pageSize - 1);
    if (page.length === 0) break;
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

export function isValidTimeZone(
  tz: string | null | undefined
): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

export interface NowLocalResult {
  timeZone: string;
  parts: WallDateTimeParts;
  wallMs: number;
  wallString: string;
}

export function getNowLocalInTimeZone(
  nowUtc: Date,
  timeZone: string | null | undefined
): NowLocalResult {
  const safeTz = isValidTimeZone(timeZone) ? timeZone.trim() : 'UTC';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const formattedParts = formatter.formatToParts(nowUtc);
  const lookup: Record<string, string> = {};
  for (const part of formattedParts) {
    if (part.type !== 'literal') {
      lookup[part.type] = part.value;
    }
  }

  const rawHour = Number(lookup.hour ?? '0');
  const parts: WallDateTimeParts = {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number(lookup.minute ?? '0'),
    second: Number(lookup.second ?? '0'),
  };

  return {
    timeZone: safeTz,
    parts,
    wallMs: wallDateTimeToEpochMs(parts),
    wallString: formatWallDateTime(parts),
  };
}

function parseTimestampMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function groupSubscriptionsByUser(
  rows: readonly PushSubscriptionDbRow[]
): UserSubscriptionGroup[] {
  const byUser = new Map<string, PushSubscriptionDbRow[]>();

  for (const row of rows) {
    if (!row.user_id || !row.endpoint || !row.p256dh || !row.auth) continue;
    const list = byUser.get(row.user_id);
    if (list) {
      list.push(row);
    } else {
      byUser.set(row.user_id, [row]);
    }
  }

  const groups: UserSubscriptionGroup[] = [];
  for (const [userId, subscriptions] of byUser.entries()) {
    const sorted = [...subscriptions].sort((a, b) => {
      const aTime = parseTimestampMs(a.updated_at || a.created_at);
      const bTime = parseTimestampMs(b.updated_at || b.created_at);
      return bTime - aTime;
    });

    const preferredTz =
      sorted.find((s) => isValidTimeZone(s.timezone))?.timezone?.trim() ??
      'UTC';

    groups.push({
      userId,
      timezone: preferredTz,
      subscriptions: sorted,
    });
  }

  return groups;
}

export function mapDbEventRowToReminderInput(
  row: EventDbRow
): ServerReminderEvent | null {
  if (row.deleted_at != null) return null;
  if (row.all_day) return null;
  if (row.completed) return null;
  if (typeof row.start_local !== 'string' || !row.start_local.trim()) {
    return null;
  }

  const recurrence: RecurrenceRule =
    row.recurrence && VALID_RECURRENCES.has(row.recurrence as RecurrenceRule)
      ? (row.recurrence as RecurrenceRule)
      : 'none';

  const exceptionDates = sanitizeExceptionDates(row.exception_dates);

  return {
    id: row.id,
    title: row.title ?? '',
    start: row.start_local,
    end:
      typeof row.end_local === 'string' && row.end_local.trim()
        ? row.end_local
        : row.start_local,
    allDay: false,
    location: typeof row.location === 'string' ? row.location : '',
    recurrence,
    recurrenceUntil: row.recurrence_until ?? undefined,
    customRecurrence: row.custom_recurrence ?? undefined,
    exceptionDates: exceptionDates.length > 0 ? exceptionDates : undefined,
    isTask: Boolean(row.is_task),
    completed: false,
  };
}

export function isOccurrenceDue(
  occStartWallMs: number,
  nowWallMs: number
): boolean {
  const triggerWallMs = occStartWallMs - LEAD_TIME_MS;
  return (
    nowWallMs >= triggerWallMs &&
    nowWallMs < occStartWallMs &&
    nowWallMs - triggerWallMs <= CATCHUP_WINDOW_MS
  );
}

export function findDueOccurrencesForUser(
  eventRows: readonly EventDbRow[],
  nowUtc: Date,
  timeZone: string
): WallOccurrence<ServerReminderEvent>[] {
  const mapped: ServerReminderEvent[] = [];
  for (const row of eventRows) {
    const item = mapDbEventRowToReminderInput(row);
    if (item) mapped.push(item);
  }
  if (mapped.length === 0) return [];

  const nowLocal = getNowLocalInTimeZone(nowUtc, timeZone);
  const windowEnd = epochMsToWallDateTime(nowLocal.wallMs + LEAD_TIME_MS);

  const expanded = expandEventsInWallWindow(
    mapped,
    nowLocal.parts,
    windowEnd
  );

  return expanded.filter((occ) =>
    isOccurrenceDue(occ.startWallMs, nowLocal.wallMs)
  );
}

function format12HourTime(hour24: number, minute: number): string {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minStr = String(minute).padStart(2, '0');
  return `${hour12}:${minStr} ${period}`;
}

function truncateText(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  if (maxChars <= 1) return clean.slice(0, Math.max(0, maxChars));
  return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

export function buildWebPushPayload(
  occurrence: WallOccurrence<ServerReminderEvent>
): string {
  const encoder = new TextEncoder();
  const rawTitle = occurrence.event.title.trim() || 'Upcoming Event';
  const title = truncateText(rawTitle, MAX_TITLE_CHARS);
  const tag = `${occurrence.masterId}|${occurrence.startLocal}`;
  const url = '/' as const;

  const timeLabel = format12HourTime(
    occurrence.start.hour,
    occurrence.start.minute
  );
  const baseBody = `Starts in 10 min · ${timeLabel}`;
  const location = occurrence.event.location.trim();
  let body = location ? `${baseBody} · ${location}` : baseBody;

  let payload: WebPushNotificationPayload = { title, body, tag, url };
  let serialized = JSON.stringify(payload);

  if (encoder.encode(serialized).length >= MAX_PAYLOAD_BYTES) {
    let maxBodyChars = Math.min(body.length, 1000);
    while (
      maxBodyChars > 0 &&
      encoder.encode(serialized).length >= MAX_PAYLOAD_BYTES
    ) {
      maxBodyChars = Math.floor(maxBodyChars * 0.7);
      body = maxBodyChars > 0 ? truncateText(body, maxBodyChars) : '';
      payload = { title, body, tag, url };
      serialized = JSON.stringify(payload);
    }
  }

  return serialized;
}

function extractPushStatusCode(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const record = err as Record<string, unknown>;
  if (typeof record.statusCode === 'number') return record.statusCode;
  if (typeof record.status === 'number') return record.status;
  return undefined;
}

export async function runSendReminders(deps: {
  store: ReminderStore;
  sendPush: PushSender;
  nowUtc?: Date;
  logger?: LoggerLike;
}): Promise<SendRemindersSummary> {
  const nowUtc = deps.nowUtc ?? new Date();
  const logger = deps.logger ?? defaultLogger;

  const cutoffIso = new Date(
    nowUtc.getTime() - SENT_REMINDER_RETENTION_MS
  ).toISOString();
  try {
    await deps.store.deleteOldSentReminders(cutoffIso);
  } catch {
    logger.warn('Failed to prune old sent_reminders rows.');
  }

  const allSubscriptions = await deps.store.fetchAllPushSubscriptions();
  const userGroups = groupSubscriptionsByUser(allSubscriptions);

  let due = 0;
  let sent = 0;
  let removed = 0;

  for (const group of userGroups) {
    const eventRows = await deps.store.fetchActiveEventsForUser(group.userId);
    const dueOccurrences = findDueOccurrencesForUser(
      eventRows,
      nowUtc,
      group.timezone
    );
    const removedEndpoints = new Set<string>();

    for (const occurrence of dueOccurrences) {
      due += 1;

      let claimed = false;
      try {
        claimed = await deps.store.tryInsertSentReminder({
          userId: group.userId,
          eventId: occurrence.masterId,
          occurrenceStart: occurrence.startLocal,
          sentAtIso: nowUtc.toISOString(),
        });
      } catch {
        logger.error(`Failed to record sent_reminders dedupe for user ${group.userId}.`);
        continue;
      }

      if (!claimed) {
        continue;
      }

      const payloadJson = buildWebPushPayload(occurrence);

      for (const sub of group.subscriptions) {
        if (removedEndpoints.has(sub.endpoint)) {
          continue;
        }
        try {
          await deps.sendPush(sub, payloadJson, {
            TTL: PUSH_TTL_SECONDS,
            urgency: PUSH_URGENCY,
          });
          sent += 1;
        } catch (err) {
          const statusCode = extractPushStatusCode(err);
          if (statusCode === 404 || statusCode === 410) {
            removedEndpoints.add(sub.endpoint);
            try {
              await deps.store.deletePushSubscription(sub.user_id, sub.endpoint);
              removed += 1;
            } catch {
              logger.warn(
                `Failed to delete expired push subscription (${statusCode}) for user ${sub.user_id}.`
              );
            }
          } else {
            logger.warn(
              `Push delivery failed for user ${sub.user_id} (status ${
                statusCode ?? 'unknown'
              }).`
            );
          }
        }
      }
    }
  }

  return {
    users: userGroups.length,
    due,
    sent,
    removed,
  };
}
