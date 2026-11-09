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
import {
  copyEventImageInStorage,
  removeEventImageFromStorage,
  uploadEventImageFromDataUrl,
} from './imageStorage';
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
  image_path: string | null;
  image_name: string | null;
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
      needsMediaUpload?: boolean;
      previousImagePath?: string;
      queuedAt: string;
    }
  | {
      kind: 'storage_delete';
      key: string;
      path: string;
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
const UPLOAD_DISMISSED_SESSION_PREFIX =
  'chronopalette_local_upload_dismissed_v1_';

const inMemoryDismissedUsers = new Set<string>();

export function isLocalUploadDismissed(userId: string): boolean {
  if (!userId) return false;
  if (inMemoryDismissedUsers.has(userId)) return true;
  try {
    return (
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(`${UPLOAD_DISMISSED_SESSION_PREFIX}${userId}`) ===
        '1'
    );
  } catch {
    return false;
  }
}

export function dismissLocalUploadForSession(userId: string): void {
  if (!userId) return;
  inMemoryDismissedUsers.add(userId);
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(
        `${UPLOAD_DISMISSED_SESSION_PREFIX}${userId}`,
        '1'
      );
    }
  } catch {
    // Ignore storage restrictions
  }
}

export function clearLocalUploadDismissals(): void {
  inMemoryDismissedUsers.clear();
  try {
    if (typeof sessionStorage !== 'undefined') {
      const toRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(UPLOAD_DISMISSED_SESSION_PREFIX)) {
          toRemove.push(key);
        }
      }
      for (const key of toRemove) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage restrictions
  }
}

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
 * Base64 (`data:`) URLs and Storage-backed attachments never populate `image_url`.
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
  const isDeleted = Boolean(options.deletedAt);
  const hasStoragePath = !isDeleted && Boolean(event.imagePath?.trim());

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
    image_url:
      isDeleted || hasStoragePath
        ? null
        : sanitizeRemoteImageUrl(event.imageUrl),
    image_path: hasStoragePath ? (event.imagePath as string) : null,
    image_name: hasStoragePath ? event.imageName ?? null : null,
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

  const hasRemoteStoragePath =
    typeof row.image_path === 'string' && row.image_path.trim().length > 0;

  // Keep un-migrated local base64 attachments intact until Storage upload succeeds
  const preserveLocalBase64 =
    !hasRemoteStoragePath &&
    !row.image_url &&
    typeof localExisting?.imageUrl === 'string' &&
    localExisting.imageUrl.startsWith('data:');

  let imagePath: string | undefined;
  let imageUrl: string | undefined;
  let imageName: string | undefined;

  if (hasRemoteStoragePath) {
    imagePath = row.image_path!.trim();
    imageName = row.image_name ?? undefined;
    imageUrl = undefined;
  } else if (row.image_url) {
    imagePath = undefined;
    imageUrl = row.image_url;
    imageName = row.image_name ?? localExisting?.imageName;
  } else if (preserveLocalBase64) {
    imagePath = undefined;
    imageUrl = localExisting?.imageUrl;
    imageName = localExisting?.imageName;
  }

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
    imagePath,
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

export async function syncDeleteEventImage(
  userId: string,
  imagePath?: string | null
): Promise<void> {
  if (!imagePath) return;
  const cleanPath = imagePath.trim();
  if (!cleanPath) return;

  const queueKey = `storage_del:${cleanPath}`;
  if (!supabase || isBrowserOffline()) {
    enqueueMutation(userId, {
      kind: 'storage_delete',
      key: queueKey,
      path: cleanPath,
      queuedAt: new Date().toISOString(),
    });
    return;
  }

  const removed = await removeEventImageFromStorage(cleanPath);
  if (removed) {
    dequeueMutationKey(userId, queueKey);
  } else {
    enqueueMutation(userId, {
      kind: 'storage_delete',
      key: queueKey,
      path: cleanPath,
      queuedAt: new Date().toISOString(),
    });
  }
}

export async function syncUpsertEvent(
  userId: string,
  event: CalendarEvent,
  options: { includeCreatedAt: boolean; previousImagePath?: string }
): Promise<CalendarEvent> {
  const queueKey = `event:${event.id}`;
  const hasLocalBase64 =
    typeof event.imageUrl === 'string' && event.imageUrl.startsWith('data:');

  // If a previous storage image was removed or replaced by an external URL, delete it
  if (
    options.previousImagePath &&
    !hasLocalBase64 &&
    event.imagePath !== options.previousImagePath
  ) {
    await syncDeleteEventImage(userId, options.previousImagePath);
  }

  if (!supabase || isBrowserOffline()) {
    const payload = buildEventUpsertPayload(event, {
      includeCreatedAt: options.includeCreatedAt,
      deletedAt: null,
    });
    enqueueMutation(userId, {
      kind: 'event',
      key: queueKey,
      id: event.id,
      payload,
      needsMediaUpload: hasLocalBase64,
      previousImagePath: options.previousImagePath,
      queuedAt: new Date().toISOString(),
    });
    return event;
  }

  let workingEvent = event;

  try {
    if (hasLocalBase64 && workingEvent.imageUrl) {
      const uploaded = await uploadEventImageFromDataUrl({
        userId,
        eventId: workingEvent.id,
        dataUrl: workingEvent.imageUrl,
        originalFileName: workingEvent.imageName,
        previousImagePath: options.previousImagePath,
      });
      workingEvent = {
        ...workingEvent,
        imagePath: uploaded.imagePath,
        imageName: uploaded.imageName,
        imageUrl: undefined,
      };
    } else if (
      workingEvent.imagePath &&
      !workingEvent.imagePath.startsWith(`${userId}/${workingEvent.id}.`)
    ) {
      // Duplicated event referencing another event's storage object -> copy to its own path
      const copied = await copyEventImageInStorage({
        userId,
        newEventId: workingEvent.id,
        sourceImagePath: workingEvent.imagePath,
        sourceImageName: workingEvent.imageName,
      });
      workingEvent = {
        ...workingEvent,
        imagePath: copied.imagePath,
        imageName: copied.imageName,
        imageUrl: undefined,
      };
    }

    const payload = buildEventUpsertPayload(workingEvent, {
      includeCreatedAt: options.includeCreatedAt,
      deletedAt: null,
    });

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

    const finalEvent: CalendarEvent = {
      ...workingEvent,
      createdAt: data?.created_at || workingEvent.createdAt,
      updatedAt: data?.updated_at || workingEvent.updatedAt,
    };

    // Persist storage-backed event locally (removes local base64 now that upload succeeded)
    await putStoredEvent(finalEvent);
    return finalEvent;
  } catch (err) {
    console.warn('Event upsert queued for retry:', err);
    const stillHasBase64 =
      typeof workingEvent.imageUrl === 'string' &&
      workingEvent.imageUrl.startsWith('data:');
    const fallbackPayload = buildEventUpsertPayload(workingEvent, {
      includeCreatedAt: options.includeCreatedAt,
      deletedAt: null,
    });
    enqueueMutation(userId, {
      kind: 'event',
      key: queueKey,
      id: event.id,
      payload: fallbackPayload,
      needsMediaUpload: stillHasBase64,
      previousImagePath: stillHasBase64 ? options.previousImagePath : undefined,
      queuedAt: new Date().toISOString(),
    });
    return event;
  }
}

export async function syncSoftDeleteEvent(
  userId: string,
  event: CalendarEvent
): Promise<void> {
  if (event.imagePath) {
    await syncDeleteEventImage(userId, event.imagePath);
  }

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
        if (item.kind === 'storage_delete') {
          const ok = await removeEventImageFromStorage(item.path);
          if (!ok) throw new Error(`Failed to delete storage file ${item.path}`);
        } else if (item.kind === 'event') {
          let payloadToSend = item.payload;
          let uploadedImageMeta:
            | { imagePath: string; imageName: string }
            | undefined;

          if (!item.payload.deleted_at && item.needsMediaUpload) {
            const cachedList = await loadStoredEvents(loadCustomCategories());
            const cachedMatch = cachedList.find((e) => e.id === item.id);
            if (cachedMatch?.imageUrl?.startsWith('data:')) {
              const uploaded = await uploadEventImageFromDataUrl({
                userId,
                eventId: item.id,
                dataUrl: cachedMatch.imageUrl,
                originalFileName: cachedMatch.imageName,
                previousImagePath: item.previousImagePath,
              });
              uploadedImageMeta = {
                imagePath: uploaded.imagePath,
                imageName: uploaded.imageName,
              };
              payloadToSend = {
                ...item.payload,
                image_url: null,
                image_path: uploaded.imagePath,
                image_name: uploaded.imageName,
              };
            }
          }

          const { data, error } = await supabase
            .from('events')
            .upsert(payloadToSend, { onConflict: 'user_id,id' })
            .select('id, created_at, updated_at')
            .maybeSingle();

          if (error) throw error;

          if (payloadToSend.deleted_at) {
            if (owners.events[item.id]) {
              delete owners.events[item.id];
              ownersChanged = true;
            }
          } else {
            owners.events[item.id] = userId;
            ownersChanged = true;

            const cached = await loadStoredEvents(loadCustomCategories());
            const match = cached.find((e) => e.id === item.id);
            if (match && (data?.updated_at || uploadedImageMeta)) {
              await putStoredEvent({
                ...match,
                ...(uploadedImageMeta
                  ? {
                      imagePath: uploadedImageMeta.imagePath,
                      imageName: uploadedImageMeta.imageName,
                      imageUrl: undefined,
                    }
                  : {}),
                createdAt: data?.created_at || match.createdAt,
                updatedAt: data?.updated_at || match.updatedAt,
              });
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

    const latestQueue = loadQueue(userId);
    const failedByKey = new Map(remaining.map((r) => [r.key, r]));
    const flushedTimestamps = new Map(queue.map((q) => [q.key, q.queuedAt]));
    const nextQueue: QueuedMutation[] = [];

    for (const current of latestQueue) {
      const flushedAt = flushedTimestamps.get(current.key);
      if (!flushedAt) {
        nextQueue.push(current);
      } else if (current.queuedAt !== flushedAt) {
        nextQueue.push(current);
      } else if (failedByKey.has(current.key)) {
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
  unuploadedLocalEvents?: CalendarEvent[];
  unuploadedLocalCategories?: CategoryTag[];
}

export interface UploadLocalDataResult {
  ok: boolean;
  updatedEventsById: Record<string, CalendarEvent>;
  remainingEvents: CalendarEvent[];
  remainingCategories: CategoryTag[];
  errorMessage?: string;
}

/**
 * Uploads pre-existing browser-local custom tags and events to the signed-in user's account
 * using `upsert` (`onConflict: 'user_id,id'`) without creating duplicates, keeping each
 * event's original `created_at`. Migrates any local base64 images into `event-images`
 * Storage (`<user_id>/<event_id>.<ext>`), removing local base64 only after upload succeeds.
 */
export async function uploadLocalDataToAccount(
  userId: string,
  eventsToUpload: CalendarEvent[],
  categoriesToUpload: CategoryTag[]
): Promise<UploadLocalDataResult> {
  if (!supabase) {
    return {
      ok: false,
      updatedEventsById: {},
      remainingEvents: eventsToUpload,
      remainingCategories: categoriesToUpload,
      errorMessage: 'Cloud sync is not configured.',
    };
  }

  if (isBrowserOffline()) {
    return {
      ok: false,
      updatedEventsById: {},
      remainingEvents: eventsToUpload,
      remainingCategories: categoriesToUpload,
      errorMessage:
        'You appear to be offline. Your local data is safe — try again when connected.',
    };
  }

  const owners = loadOwnersState();
  const updatedEventsById: Record<string, CalendarEvent> = {};
  const remainingCategories: CategoryTag[] = [];
  const remainingEvents: CalendarEvent[] = [];
  let firstErrorMessage: string | undefined;

  for (const tag of categoriesToUpload) {
    const payload = buildCategoryUpsertPayload(tag, null);
    try {
      const { error } = await supabase
        .from('custom_categories')
        .upsert(payload, { onConflict: 'user_id,id' });

      if (error) throw error;

      dequeueMutationKey(userId, `category:${tag.id}`);
      owners.categories[tag.id] = userId;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof (err as { message?: string })?.message === 'string'
            ? (err as { message: string }).message
            : 'Failed to upload custom tags.';
      if (!firstErrorMessage) firstErrorMessage = msg;
      remainingCategories.push(tag);
    }
  }

  const stampedForIdb: CalendarEvent[] = [];

  for (const event of eventsToUpload) {
    try {
      let workingEvent = event;

      if (
        typeof workingEvent.imageUrl === 'string' &&
        workingEvent.imageUrl.startsWith('data:')
      ) {
        const uploaded = await uploadEventImageFromDataUrl({
          userId,
          eventId: workingEvent.id,
          dataUrl: workingEvent.imageUrl,
          originalFileName: workingEvent.imageName,
        });
        workingEvent = {
          ...workingEvent,
          imagePath: uploaded.imagePath,
          imageName: uploaded.imageName,
          imageUrl: undefined,
        };
      }

      const payload = buildEventUpsertPayload(workingEvent, {
        includeCreatedAt: true,
        deletedAt: null,
      });

      const { data, error } = await supabase
        .from('events')
        .upsert(payload, { onConflict: 'user_id,id' })
        .select('id, created_at, updated_at')
        .maybeSingle();

      if (error) throw error;

      dequeueMutationKey(userId, `event:${event.id}`);
      owners.events[event.id] = userId;

      const stamped: CalendarEvent = {
        ...workingEvent,
        createdAt: data?.created_at || workingEvent.createdAt,
        updatedAt: data?.updated_at || workingEvent.updatedAt,
      };
      updatedEventsById[event.id] = stamped;
      stampedForIdb.push(stamped);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof (err as { message?: string })?.message === 'string'
            ? (err as { message: string }).message
            : 'Failed to upload events.';
      if (!firstErrorMessage) firstErrorMessage = msg;
      remainingEvents.push(event);
    }
  }

  saveOwnersState(owners);

  if (stampedForIdb.length > 0) {
    await applyStoredEventsPatch(stampedForIdb, []);
  }

  const ok = remainingCategories.length === 0 && remainingEvents.length === 0;
  return {
    ok,
    updatedEventsById,
    remainingEvents,
    remainingCategories,
    errorMessage: ok ? undefined : firstErrorMessage,
  };
}

let activePullPromise: Promise<CloudPullResult> | null = null;

/**
 * Flushes queued writes, pulls `events`, `custom_categories`, and `user_settings`,
 * removes soft-deleted rows locally, reconciles active rows via `updated_at`,
 * migrates any existing synced events' local base64 attachments into Storage
 * (removing local base64 only after upload succeeds), and updates IndexedDB incrementally.
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
    const unuploadedLocalCategories: CategoryTag[] = [];

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
        mergedCustomMap.set(localTag.id, localTag);
        unuploadedLocalCategories.push(localTag);
      } else {
        delete owners.categories[localTag.id];
      }
    }

    const mergedCustomCategories = Array.from(mergedCustomMap.values());
    saveCustomCategories(mergedCustomCategories);

    // -------------------------------------------------------------------------
    // 2. Reconcile events (soft deletes, updated_at comparison, & base64 migration)
    // -------------------------------------------------------------------------
    const localEvents = await loadStoredEvents(mergedCustomCategories);
    const localEventById = new Map(localEvents.map((e) => [e.id, e]));
    const serverEventRows = (eventsRes.data ?? []) as EventRow[];
    const seenEventIds = new Set<string>();

    const mergedEventsList: CalendarEvent[] = [];
    const putMap = new Map<string, CalendarEvent>();
    const deleteIdSet = new Set<string>();
    const unuploadedLocalEventIds = new Set<string>();
    const eventsToUpload: Array<{
      event: CalendarEvent;
      includeCreatedAt: boolean;
      previousImagePath?: string;
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
        mergedEventsList.push(localEv);
        eventsToUpload.push({
          event: localEv,
          includeCreatedAt: true,
          previousImagePath: row.image_path?.trim() || undefined,
        });
      } else {
        mergedEventsList.push(serverMapped);
        if (JSON.stringify(serverMapped) !== JSON.stringify(localEv)) {
          putMap.set(row.id, serverMapped);
        }
        owners.events[row.id] = userId;

        // First-sync migration: server row has no storage image yet while local cache still holds base64
        if (
          !row.image_path &&
          !row.image_url &&
          typeof serverMapped.imageUrl === 'string' &&
          serverMapped.imageUrl.startsWith('data:')
        ) {
          eventsToUpload.push({ event: serverMapped, includeCreatedAt: true });
        }
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
        mergedEventsList.push(localEv);
        unuploadedLocalEventIds.add(localEv.id);
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
        if (
          owners.events[adj.id] === userId &&
          !eventsToUpload.some((u) => u.event.id === adj.id)
        ) {
          eventsToUpload.push({ event: adj, includeCreatedAt: true });
        }
      }
    }

    const unuploadedLocalEvents = finalEvents.filter((ev) =>
      unuploadedLocalEventIds.has(ev.id)
    );

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
          for (const localTag of unuploadedLocalCategories) {
            if (
              localSettingsSnapshot.visibleCategories.includes(localTag.id) &&
              !nextVisibleCats.includes(localTag.id)
            ) {
              nextVisibleCats = [...nextVisibleCats, localTag.id];
            }
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
        shouldPushLocalSettings = true;
      }
    }

    saveOwnersState(owners);

    // Sync any newer edits, base64 migrations, or user_settings
    await Promise.all([
      ...eventsToUpload.map(
        ({ event, includeCreatedAt, previousImagePath }) =>
          syncUpsertEvent(userId, event, {
            includeCreatedAt,
            previousImagePath,
          })
      ),
      ...(shouldPushLocalSettings
        ? [syncUpsertUserSettings(userId, resolvedSettings)]
        : []),
    ]);

    const latestStoredEvents =
      eventsToUpload.length > 0
        ? await loadStoredEvents(mergedCustomCategories)
        : finalEvents;

    return {
      ok: true,
      events: latestStoredEvents,
      customCategories: mergedCustomCategories,
      settings: resolvedSettings,
      unuploadedLocalEvents,
      unuploadedLocalCategories,
    };
  })();

  try {
    return await activePullPromise;
  } finally {
    activePullPromise = null;
  }
}
