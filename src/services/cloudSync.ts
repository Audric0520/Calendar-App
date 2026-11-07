import {
  CalendarEvent,
  CategoryScope,
  CategoryTag,
  CustomRecurrenceConfig,
  EventCategory,
  NotificationSettings,
  RecurrenceRule,
  ThemePreferences,
} from '../types/calendar';
import { DEFAULT_CATEGORY_TAGS } from '../constants/categories';
import {
  applyStoredEventsPatch,
  loadCustomCategories,
  loadNotificationSettings,
  loadStoredEvents,
  loadThemePreferences,
  loadVisibleCategories,
  loadVisibleScopes,
  normalizeEventsCategories,
  putStoredEvent,
  sanitizeNotificationSettings,
  sanitizeThemePreferences,
  sanitizeVisibleCategories,
  sanitizeVisibleScopes,
  saveCustomCategories,
  saveNotificationSettings,
  saveThemePreferences,
  saveVisibleCategories,
  saveVisibleScopes,
} from './storage';
import { supabase } from './supabase';

export interface SyncedUserSettings {
  themePrefs: ThemePreferences;
  notificationSettings: NotificationSettings;
  visibleCategories: EventCategory[];
  visibleScopes: CategoryScope[];
}

interface EventRow {
  id: string;
  title: string;
  start_local: string;
  end_local: string;
  all_day: boolean;
  category: string;
  location: string;
  description: string;
  recurrence: string;
  recurrence_until: string | null;
  custom_recurrence: CustomRecurrenceConfig | null;
  image_url: string | null;
  image_path?: string | null;
  image_name?: string | null;
  is_task: boolean;
  completed: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at: string | null;
}

/**
 * Payload sent to `public.events` (`onConflict: 'user_id,id'`).
 * Never includes `user_id` or `updated_at`.
 */
export interface EventUpsertPayload {
  id: string;
  title: string;
  start_local: string;
  end_local: string;
  all_day: boolean;
  category: string;
  location: string;
  description: string;
  recurrence: RecurrenceRule;
  recurrence_until: string | null;
  custom_recurrence: CustomRecurrenceConfig | null;
  image_url: string | null;
  image_path: null;
  image_name: null;
  is_task: boolean;
  completed: boolean;
  created_at?: string;
  deleted_at: string | null;
}

interface CustomCategoryRow {
  id: string;
  label: string;
  color: string;
  scope: string;
  created_at?: string;
  updated_at?: string;
  deleted_at: string | null;
}

/**
 * Payload sent to `public.custom_categories` (`onConflict: 'user_id,id'`).
 * Never includes `user_id` or `updated_at`.
 */
export interface CategoryUpsertPayload {
  id: string;
  label: string;
  color: string;
  scope: CategoryScope;
  deleted_at: string | null;
}

interface UserSettingsRow {
  theme_prefs: Partial<ThemePreferences> | null;
  notification_settings: Partial<NotificationSettings> | null;
  visible_categories: EventCategory[] | null;
  visible_scopes: CategoryScope[] | null;
  updated_at?: string;
}

/**
 * Payload sent to `public.user_settings` (`onConflict: 'user_id'`).
 * Never includes `user_id` or `updated_at`.
 */
export interface UserSettingsUpsertPayload {
  theme_prefs: ThemePreferences;
  notification_settings: NotificationSettings;
  visible_categories: EventCategory[];
  visible_scopes: CategoryScope[];
}

type QueuedMutation =
  | {
      kind: 'event';
      key: string;
      id: string;
      payload: EventUpsertPayload;
      queuedAt: string;
    }
  | {
      kind: 'category';
      key: string;
      id: string;
      payload: CategoryUpsertPayload;
      queuedAt: string;
    }
  | {
      kind: 'settings';
      key: 'settings';
      payload: UserSettingsUpsertPayload;
      queuedAt: string;
    };

interface SyncedOwnersState {
  events: Record<string, string>;
  categories: Record<string, string>;
  settingsUpdatedAtByUser: Record<string, string>;
}

const QUEUE_KEY_PREFIX = 'chronopalette_sync_queue_v1_';
const OWNERS_STORAGE_KEY = 'chronopalette_synced_owners_v1';

const VALID_RECURRENCES = new Set<RecurrenceRule>([
  'none',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'custom',
]);

const syncListeners = new Set<() => void>();

function notifySyncListeners(): void {
  for (const listener of syncListeners) {
    try {
      listener();
    } catch {
      // Ignore listener errors
    }
  }
}

export function subscribeSyncStatus(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

function loadOwnersState(): SyncedOwnersState {
  try {
    const raw = localStorage.getItem(OWNERS_STORAGE_KEY);
    if (!raw) {
      return { events: {}, categories: {}, settingsUpdatedAtByUser: {} };
    }
    const parsed = JSON.parse(raw) as Partial<SyncedOwnersState>;
    return {
      events:
        parsed.events && typeof parsed.events === 'object' ? parsed.events : {},
      categories:
        parsed.categories && typeof parsed.categories === 'object'
          ? parsed.categories
          : {},
      settingsUpdatedAtByUser:
        parsed.settingsUpdatedAtByUser &&
        typeof parsed.settingsUpdatedAtByUser === 'object'
          ? parsed.settingsUpdatedAtByUser
          : {},
    };
  } catch {
    return { events: {}, categories: {}, settingsUpdatedAtByUser: {} };
  }
}

function saveOwnersState(state: SyncedOwnersState): void {
  try {
    localStorage.setItem(OWNERS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function markLocalSettingsModified(userId: string): void {
  const owners = loadOwnersState();
  owners.settingsUpdatedAtByUser[userId] = new Date().toISOString();
  saveOwnersState(owners);
}

function getQueueStorageKey(userId: string): string {
  return `${QUEUE_KEY_PREFIX}${userId}`;
}

function loadQueue(userId: string): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(getQueueStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(userId: string, queue: QueuedMutation[]): void {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(getQueueStorageKey(userId));
    } else {
      localStorage.setItem(getQueueStorageKey(userId), JSON.stringify(queue));
    }
  } catch {
    // Ignore storage errors
  }
  notifySyncListeners();
}

function enqueueMutation(userId: string, item: QueuedMutation): void {
  const queue = loadQueue(userId);
  const idx = queue.findIndex((q) => q.key === item.key);
  if (idx >= 0) {
    queue[idx] = item;
  } else {
    queue.push(item);
  }
  saveQueue(userId, queue);
}

function dequeueMutationKey(userId: string, key: string): void {
  const queue = loadQueue(userId);
  const filtered = queue.filter((q) => q.key !== key);
  if (filtered.length !== queue.length) {
    saveQueue(userId, filtered);
  }
}

export function getPendingSyncCount(userId: string | null | undefined): number {
  if (!userId) return 0;
  return loadQueue(userId).length;
}

/**
 * Only external `https://` image URLs are synced to `events.image_url`.
 * Base64 (`data:`) URLs are intentionally excluded from database rows.
 */
export function sanitizeRemoteImageUrl(url?: string): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return /^https:\/\//i.test(trimmed) ? trimmed : null;
}

export function buildEventUpsertPayload(
  event: CalendarEvent,
  options: { includeCreatedAt: boolean; deletedAt?: string | null }
): EventUpsertPayload {
  const payload: EventUpsertPayload = {
    id: event.id,
    title: event.title,
    start_local: event.start,
    end_local: event.end,
    all_day: Boolean(event.allDay),
    category: event.category,
    location: event.location ?? '',
    description: event.description ?? '',
    recurrence: event.recurrence,
    recurrence_until: event.recurrenceUntil ?? null,
    custom_recurrence: event.customRecurrence ?? null,
    image_url: sanitizeRemoteImageUrl(event.imageUrl),
    image_path: null,
    image_name: null,
    is_task: Boolean(event.isTask),
    completed: Boolean(event.completed),
    deleted_at: options.deletedAt ?? null,
  };

  if (options.includeCreatedAt && event.createdAt) {
    payload.created_at = event.createdAt;
  }

  return payload;
}

export function mapRowToCalendarEvent(
  row: EventRow,
  localExisting?: CalendarEvent
): CalendarEvent {
  const recurrence: RecurrenceRule = VALID_RECURRENCES.has(
    row.recurrence as RecurrenceRule
  )
    ? (row.recurrence as RecurrenceRule)
    : 'none';

  // Keep local-only base64 attachments intact while server image_url/image_path are empty
  const preserveLocalBase64 =
    !row.image_url &&
    !row.image_path &&
    typeof localExisting?.imageUrl === 'string' &&
    localExisting.imageUrl.startsWith('data:');

  const imageUrl = preserveLocalBase64
    ? localExisting?.imageUrl
    : row.image_url ?? undefined;

  const imageName = preserveLocalBase64
    ? localExisting?.imageName
    : row.image_name ?? undefined;

  const nowIso = new Date().toISOString();

  return {
    id: row.id,
    title: row.title ?? '',
    start: row.start_local,
    end: row.end_local,
    allDay: Boolean(row.all_day),
    category: row.category || (row.is_task ? 'academic' : 'class-sched'),
    location: row.location ?? '',
    description: row.description ?? '',
    recurrence,
    recurrenceUntil: row.recurrence_until ?? undefined,
    customRecurrence: row.custom_recurrence ?? undefined,
    imageUrl,
    imageName,
    isTask: Boolean(row.is_task),
    completed: Boolean(row.completed),
    createdAt: row.created_at || localExisting?.createdAt || nowIso,
    updatedAt: row.updated_at || localExisting?.updatedAt || nowIso,
  };
}

export function buildCategoryUpsertPayload(
  tag: CategoryTag,
  deletedAt: string | null = null
): CategoryUpsertPayload {
  return {
    id: tag.id,
    label: tag.label,
    color: tag.color,
    scope: tag.scope === 'task' ? 'task' : 'event',
    deleted_at: deletedAt,
  };
}

export function buildUserSettingsUpsertPayload(
  settings: SyncedUserSettings
): UserSettingsUpsertPayload {
  return {
    theme_prefs: settings.themePrefs,
    notification_settings: settings.notificationSettings,
    visible_categories: settings.visibleCategories,
    visible_scopes: settings.visibleScopes,
  };
}

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export async function syncUpsertEvent(
  userId: string,
  event: CalendarEvent,
  options: { includeCreatedAt: boolean }
): Promise<CalendarEvent> {
  const payload = buildEventUpsertPayload(event, {
    includeCreatedAt: options.includeCreatedAt,
    deletedAt: null,
  });
  const queueKey = `event:${event.id}`;

  if (!supabase || isBrowserOffline()) {
    enqueueMutation(userId, {
      kind: 'event',
      key: queueKey,
      id: event.id,
      payload,
      queuedAt: new Date().toISOString(),
    });
    return event;
  }

  try {
    const { data, error } = await supabase
      .from('events')
      .upsert(payload, { onConflict: 'user_id,id' })
      .select('id, created_at, updated_at')
      .maybeSingle();

    if (error) {
      throw error;
    }

    dequeueMutationKey(userId, queueKey);

    const owners = loadOwnersState();
    owners.events[event.id] = userId;
    saveOwnersState(owners);

    if (data?.updated_at) {
      const stamped: CalendarEvent = {
        ...event,
        createdAt: data.created_at || event.createdAt,
        updatedAt: data.updated_at,
      };
      await putStoredEvent(stamped);
      return stamped;
    }

    return event;
  } catch (err) {
    console.warn('Event upsert queued for retry:', err);
    enqueueMutation(userId, {
      kind: 'event',
      key: queueKey,
      id: event.id,
      payload,
      queuedAt: new Date().toISOString(),
    });
    return event;
  }
}

export async function syncSoftDeleteEvent(
  userId: string,
  event: CalendarEvent
): Promise<void> {
  const deletedAt = new Date().toISOString();
  const payload = buildEventUpsertPayload(event, {
    includeCreatedAt: true,
    deletedAt,
  });
  const queueKey = `event:${event.id}`;

  if (!supabase || isBrowserOffline()) {
    enqueueMutation(userId, {
      kind: 'event',
      key: queueKey,
      id: event.id,
      payload,
      queuedAt: deletedAt,
    });
    return;
  }

  try {
    const { error } = await supabase
      .from('events')
      .upsert(payload, { onConflict: 'user_id,id' });

    if (error) {
      throw error;
    }

    dequeueMutationKey(userId, queueKey);

    const owners = loadOwnersState();
    delete owners.events[event.id];
    saveOwnersState(owners);
  } catch (err) {
    console.warn('Event soft-delete queued for retry:', err);
    enqueueMutation(userId, {
      kind: 'event',
      key: queueKey,
      id: event.id,
      payload,
      queuedAt: deletedAt,
    });
  }
}

export async function syncUpsertCustomCategory(
  userId: string,
  tag: CategoryTag
): Promise<void> {
  const payload = buildCategoryUpsertPayload(tag, null);
  const queueKey = `category:${tag.id}`;

  if (!supabase || isBrowserOffline()) {
    enqueueMutation(userId, {
      kind: 'category',
      key: queueKey,
      id: tag.id,
      payload,
      queuedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    const { error } = await supabase
      .from('custom_categories')
      .upsert(payload, { onConflict: 'user_id,id' });

    if (error) {
      throw error;
    }

    dequeueMutationKey(userId, queueKey);

    const owners = loadOwnersState();
    owners.categories[tag.id] = userId;
    saveOwnersState(owners);
  } catch (err) {
    console.warn('Custom category upsert queued for retry:', err);
    enqueueMutation(userId, {
      kind: 'category',
      key: queueKey,
      id: tag.id,
      payload,
      queuedAt: new Date().toISOString(),
    });
  }
}

export async function syncSoftDeleteCustomCategory(
  userId: string,
  tag: CategoryTag
): Promise<void> {
  const deletedAt = new Date().toISOString();
  const payload = buildCategoryUpsertPayload(tag, deletedAt);
  const queueKey = `category:${tag.id}`;

  if (!supabase || isBrowserOffline()) {
    enqueueMutation(userId, {
      kind: 'category',
      key: queueKey,
      id: tag.id,
      payload,
      queuedAt: deletedAt,
    });
    return;
  }

  try {
    const { error } = await supabase
      .from('custom_categories')
      .upsert(payload, { onConflict: 'user_id,id' });

    if (error) {
      throw error;
    }

    dequeueMutationKey(userId, queueKey);

    const owners = loadOwnersState();
    delete owners.categories[tag.id];
    saveOwnersState(owners);
  } catch (err) {
    console.warn('Custom category soft-delete queued for retry:', err);
    enqueueMutation(userId, {
      kind: 'category',
      key: queueKey,
      id: tag.id,
      payload,
      queuedAt: deletedAt,
    });
  }
}

export async function syncUpsertUserSettings(
  userId: string,
  settings: SyncedUserSettings
): Promise<void> {
  const payload = buildUserSettingsUpsertPayload(settings);
  const queueKey = 'settings';

  if (!supabase || isBrowserOffline()) {
    enqueueMutation(userId, {
      kind: 'settings',
      key: queueKey,
      payload,
      queuedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id' })
      .select('updated_at')
      .maybeSingle();

    if (error) {
      throw error;
    }

    dequeueMutationKey(userId, queueKey);

    if (data?.updated_at) {
      const owners = loadOwnersState();
      owners.settingsUpdatedAtByUser[userId] = data.updated_at;
      saveOwnersState(owners);
    }
  } catch (err) {
    console.warn('User settings upsert queued for retry:', err);
    enqueueMutation(userId, {
      kind: 'settings',
      key: queueKey,
      payload,
      queuedAt: new Date().toISOString(),
    });
  }
}

let activeFlushPromise: Promise<boolean> | null = null;

export async function flushSyncQueue(userId: string): Promise<boolean> {
  if (!supabase || isBrowserOffline()) {
    return loadQueue(userId).length === 0;
  }

  if (activeFlushPromise) {
    return activeFlushPromise;
  }

  activeFlushPromise = (async () => {
    const queue = loadQueue(userId);
    if (queue.length === 0) return true;

    const remaining: QueuedMutation[] = [];
    const owners = loadOwnersState();
    let ownersChanged = false;

    for (const item of queue) {
      try {
        if (item.kind === 'event') {
          const { data, error } = await supabase
            .from('events')
            .upsert(item.payload, { onConflict: 'user_id,id' })
            .select('id, created_at, updated_at')
            .maybeSingle();

          if (error) throw error;

          if (item.payload.deleted_at) {
            if (owners.events[item.id]) {
              delete owners.events[item.id];
              ownersChanged = true;
            }
          } else {
            owners.events[item.id] = userId;
            ownersChanged = true;

            if (data?.updated_at) {
              const cached = await loadStoredEvents(loadCustomCategories());
              const match = cached.find((e) => e.id === item.id);
              if (match) {
                await putStoredEvent({
                  ...match,
                  createdAt: data.created_at || match.createdAt,
                  updatedAt: data.updated_at,
                });
              }
            }
          }
        } else if (item.kind === 'category') {
          const { error } = await supabase
            .from('custom_categories')
            .upsert(item.payload, { onConflict: 'user_id,id' });

          if (error) throw error;

          if (item.payload.deleted_at) {
            if (owners.categories[item.id]) {
              delete owners.categories[item.id];
              ownersChanged = true;
            }
          } else {
            owners.categories[item.id] = userId;
            ownersChanged = true;
          }
        } else if (item.kind === 'settings') {
          const { data, error } = await supabase
            .from('user_settings')
            .upsert(item.payload, { onConflict: 'user_id' })
            .select('updated_at')
            .maybeSingle();

          if (error) throw error;

          if (data?.updated_at) {
            owners.settingsUpdatedAtByUser[userId] = data.updated_at;
            ownersChanged = true;
          }
        }
      } catch (err) {
        console.warn(`Retry failed for ${item.key}:`, err);
        remaining.push(item);
      }
    }

    if (ownersChanged) {
      saveOwnersState(owners);
    }

    // Preserve any newer mutations enqueued while flush was in-flight
    const latestQueue = loadQueue(userId);
    const failedByKey = new Map(remaining.map((r) => [r.key, r]));
    const flushedTimestamps = new Map(queue.map((q) => [q.key, q.queuedAt]));
    const nextQueue: QueuedMutation[] = [];

    for (const current of latestQueue) {
      const flushedAt = flushedTimestamps.get(current.key);
      if (!flushedAt) {
        // Added during flush
        nextQueue.push(current);
      } else if (current.queuedAt !== flushedAt) {
        // Updated during flush — keep newer mutation
        nextQueue.push(current);
      } else if (failedByKey.has(current.key)) {
        // Failed during flush — keep for retry
        nextQueue.push(current);
      }
    }

    saveQueue(userId, nextQueue);
    return nextQueue.length === 0;
  })();

  try {
    return await activeFlushPromise;
  } finally {
    activeFlushPromise = null;
  }
}

export interface CloudPullResult {
  ok: boolean;
  events?: CalendarEvent[];
  customCategories?: CategoryTag[];
  settings?: SyncedUserSettings;
}

let activePullPromise: Promise<CloudPullResult> | null = null;

/**
 * Flushes queued writes, pulls `events`, `custom_categories`, and `user_settings`,
 * removes soft-deleted rows locally, reconciles active rows via `updated_at`,
 * and updates IndexedDB incrementally without clearing the store.
 */
export async function pullAndReconcileCloudState(
  userId: string
): Promise<CloudPullResult> {
  if (!supabase || isBrowserOffline()) {
    return { ok: false };
  }

  if (activePullPromise) {
    return activePullPromise;
  }

  activePullPromise = (async (): Promise<CloudPullResult> => {
    await flushSyncQueue(userId);

    const [eventsRes, catsRes, settingsRes] = await Promise.all([
      supabase.from('events').select('*'),
      supabase.from('custom_categories').select('*'),
      supabase.from('user_settings').select('*').maybeSingle(),
    ]);

    if (eventsRes.error || catsRes.error || settingsRes.error) {
      console.warn(
        'Cloud pull failed:',
        eventsRes.error ?? catsRes.error ?? settingsRes.error
      );
      return { ok: false };
    }

    const remainingQueue = loadQueue(userId);
    const pendingByKey = new Map(remainingQueue.map((q) => [q.key, q]));
    const owners = loadOwnersState();

    // -------------------------------------------------------------------------
    // 1. Reconcile custom_categories (including soft deletes)
    // -------------------------------------------------------------------------
    const localCustomCategories = loadCustomCategories();
    const localCatById = new Map(localCustomCategories.map((c) => [c.id, c]));
    const serverCatRows = (catsRes.data ?? []) as CustomCategoryRow[];
    const seenCatIds = new Set<string>();
    const mergedCustomMap = new Map<string, CategoryTag>();
    const newlyUploadedLocalCatIds: string[] = [];
    const categoriesToUpload: CategoryTag[] = [];

    for (const row of serverCatRows) {
      seenCatIds.add(row.id);
      const pending = pendingByKey.get(`category:${row.id}`);
      if (pending && pending.kind === 'category') {
        if (!pending.payload.deleted_at) {
          const localTag = localCatById.get(row.id);
          mergedCustomMap.set(
            row.id,
            localTag ?? {
              id: pending.payload.id,
              label: pending.payload.label,
              color: pending.payload.color,
              isCustom: true,
              scope: pending.payload.scope,
            }
          );
        }
        continue;
      }

      if (row.deleted_at) {
        delete owners.categories[row.id];
        continue;
      }

      owners.categories[row.id] = userId;
      mergedCustomMap.set(row.id, {
        id: row.id,
        label: row.label,
        color: row.color,
        isCustom: true,
        scope: row.scope === 'task' ? 'task' : 'event',
      });
    }

    for (const localTag of localCustomCategories) {
      if (seenCatIds.has(localTag.id)) continue;
      const pending = pendingByKey.get(`category:${localTag.id}`);
      if (pending && pending.kind === 'category') {
        if (!pending.payload.deleted_at) {
          mergedCustomMap.set(localTag.id, localTag);
        }
        continue;
      }

      if (!owners.categories[localTag.id]) {
        // Pre-existing local custom tag -> keep & upload to cloud
        mergedCustomMap.set(localTag.id, localTag);
        categoriesToUpload.push(localTag);
        newlyUploadedLocalCatIds.push(localTag.id);
      } else {
        delete owners.categories[localTag.id];
      }
    }

    const mergedCustomCategories = Array.from(mergedCustomMap.values());
    saveCustomCategories(mergedCustomCategories);

    // -------------------------------------------------------------------------
    // 2. Reconcile events (including soft deletes & updated_at comparison)
    // -------------------------------------------------------------------------
    const localEvents = await loadStoredEvents(mergedCustomCategories);
    const localEventById = new Map(localEvents.map((e) => [e.id, e]));
    const serverEventRows = (eventsRes.data ?? []) as EventRow[];
    const seenEventIds = new Set<string>();

    const mergedEventsList: CalendarEvent[] = [];
    const putMap = new Map<string, CalendarEvent>();
    const deleteIdSet = new Set<string>();
    const eventsToUpload: Array<{
      event: CalendarEvent;
      includeCreatedAt: boolean;
    }> = [];

    for (const row of serverEventRows) {
      seenEventIds.add(row.id);
      const localEv = localEventById.get(row.id);
      const pending = pendingByKey.get(`event:${row.id}`);

      if (pending && pending.kind === 'event') {
        if (pending.payload.deleted_at) {
          if (localEv) deleteIdSet.add(row.id);
        } else if (localEv) {
          mergedEventsList.push(localEv);
        }
        continue;
      }

      if (row.deleted_at) {
        if (localEv) {
          deleteIdSet.add(row.id);
        }
        delete owners.events[row.id];
        continue;
      }

      const serverMapped = mapRowToCalendarEvent(row, localEv);

      if (!localEv) {
        mergedEventsList.push(serverMapped);
        putMap.set(row.id, serverMapped);
        owners.events[row.id] = userId;
        continue;
      }

      const serverMs = Date.parse(row.updated_at ?? '');
      const localMs = Date.parse(localEv.updatedAt ?? '');

      if (
        Number.isFinite(localMs) &&
        Number.isFinite(serverMs) &&
        localMs > serverMs + 1000
      ) {
        // Local copy is strictly newer than server row
        mergedEventsList.push(localEv);
        eventsToUpload.push({ event: localEv, includeCreatedAt: true });
      } else {
        mergedEventsList.push(serverMapped);
        if (JSON.stringify(serverMapped) !== JSON.stringify(localEv)) {
          putMap.set(row.id, serverMapped);
        }
        owners.events[row.id] = userId;
      }
    }

    for (const localEv of localEvents) {
      if (seenEventIds.has(localEv.id)) continue;
      const pending = pendingByKey.get(`event:${localEv.id}`);
      if (pending && pending.kind === 'event') {
        if (!pending.payload.deleted_at) {
          mergedEventsList.push(localEv);
        }
        continue;
      }

      if (!owners.events[localEv.id]) {
        // Pre-existing local event -> keep & upload keeping original created_at
        mergedEventsList.push(localEv);
        eventsToUpload.push({ event: localEv, includeCreatedAt: true });
      } else {
        deleteIdSet.add(localEv.id);
        delete owners.events[localEv.id];
      }
    }

    const knownTags: CategoryTag[] = [
      ...DEFAULT_CATEGORY_TAGS,
      ...mergedCustomCategories,
    ];
    const {
      normalized: finalEvents,
      changed: categoriesAdjusted,
      changedEvents,
    } = normalizeEventsCategories(mergedEventsList, knownTags);

    if (categoriesAdjusted) {
      for (const adj of changedEvents) {
        putMap.set(adj.id, adj);
        if (!eventsToUpload.some((u) => u.event.id === adj.id)) {
          eventsToUpload.push({ event: adj, includeCreatedAt: true });
        }
      }
    }

    await applyStoredEventsPatch(
      Array.from(putMap.values()),
      Array.from(deleteIdSet)
    );

    // -------------------------------------------------------------------------
    // 3. Reconcile user_settings
    // -------------------------------------------------------------------------
    const localSettingsSnapshot: SyncedUserSettings = {
      themePrefs: loadThemePreferences(),
      notificationSettings: loadNotificationSettings(),
      visibleCategories: loadVisibleCategories(mergedCustomCategories),
      visibleScopes: loadVisibleScopes(),
    };

    let resolvedSettings: SyncedUserSettings = localSettingsSnapshot;
    let shouldPushLocalSettings = false;

    if (!pendingByKey.has('settings')) {
      const sRow = (settingsRes.data ?? null) as UserSettingsRow | null;
      if (sRow) {
        const hasThemeData =
          sRow.theme_prefs && Object.keys(sRow.theme_prefs).length > 0;
        const hasNotifData =
          sRow.notification_settings &&
          Object.keys(sRow.notification_settings).length > 0;
        const hasAnyServerSettings = Boolean(
          hasThemeData ||
            hasNotifData ||
            sRow.visible_categories !== null ||
            sRow.visible_scopes !== null
        );

        const serverSettingsMs = Date.parse(sRow.updated_at ?? '');
        const localSettingsMs = Date.parse(
          owners.settingsUpdatedAtByUser[userId] ?? ''
        );

        if (
          hasAnyServerSettings &&
          (!Number.isFinite(localSettingsMs) ||
            !Number.isFinite(serverSettingsMs) ||
            serverSettingsMs >= localSettingsMs - 500)
        ) {
          let nextVisibleCats = sanitizeVisibleCategories(
            sRow.visible_categories,
            mergedCustomCategories
          );
          if (newlyUploadedLocalCatIds.length > 0) {
            for (const newId of newlyUploadedLocalCatIds) {
              if (!nextVisibleCats.includes(newId)) {
                nextVisibleCats = [...nextVisibleCats, newId];
              }
            }
            shouldPushLocalSettings = true;
          }

          resolvedSettings = {
            themePrefs: hasThemeData
              ? sanitizeThemePreferences(sRow.theme_prefs)
              : localSettingsSnapshot.themePrefs,
            notificationSettings: hasNotifData
              ? sanitizeNotificationSettings(sRow.notification_settings)
              : localSettingsSnapshot.notificationSettings,
            visibleCategories: nextVisibleCats,
            visibleScopes: sanitizeVisibleScopes(sRow.visible_scopes),
          };

          saveThemePreferences(resolvedSettings.themePrefs);
          saveNotificationSettings(resolvedSettings.notificationSettings);
          saveVisibleCategories(resolvedSettings.visibleCategories);
          saveVisibleScopes(resolvedSettings.visibleScopes);

          if (sRow.updated_at) {
            owners.settingsUpdatedAtByUser[userId] = sRow.updated_at;
          }
        } else {
          shouldPushLocalSettings = true;
        }
      } else {
        // No user_settings row on server yet -> seed from local settings
        shouldPushLocalSettings = true;
      }
    }

    saveOwnersState(owners);

    // Upload any local-only categories, events, or settings discovered during reconciliation
    await Promise.all([
      ...categoriesToUpload.map((tag) => syncUpsertCustomCategory(userId, tag)),
      ...eventsToUpload.map(({ event, includeCreatedAt }) =>
        syncUpsertEvent(userId, event, { includeCreatedAt })
      ),
      ...(shouldPushLocalSettings
        ? [syncUpsertUserSettings(userId, resolvedSettings)]
        : []),
    ]);

    // Refresh final events from memory if server timestamps updated during upload
    const latestStoredEvents =
      eventsToUpload.length > 0
        ? await loadStoredEvents(mergedCustomCategories)
        : finalEvents;

    return {
      ok: true,
      events: latestStoredEvents,
      customCategories: mergedCustomCategories,
      settings: resolvedSettings,
    };
  })();

  try {
    return await activePullPromise;
  } finally {
    activePullPromise = null;
  }
}
