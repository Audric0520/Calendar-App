import {
  CalendarEvent,
  CategoryScope,
  CategoryTag,
  EventCategory,
  NotificationSettings,
  ThemeId,
  ThemePreferences,
} from '../types/calendar';
import {
  DEFAULT_CATEGORY_TAGS,
  EVENT_CATEGORY_TAGS,
  TASK_CATEGORY_TAGS,
  resolveTagScope,
} from '../constants/categories';

const LEGACY_DB_NAME = 'ChronoPaletteCalendarDB';
const DB_NAME = 'ChronoPaletteEventsDB';
const DB_VERSION = 1;
const EVENTS_STORE = 'events';

const LS_KEYS = {
  CLEAN_SLATE_APPLIED: 'chronopalette_clean_slate_v1',
  EVENTS_FALLBACK: 'chronopalette_events_fallback_v2',
  THEME_PREFS: 'chronopalette_theme_prefs_v1',
  NOTIFICATION_SETTINGS: 'chronopalette_notification_settings_v1',
  FIRED_REMINDERS: 'chronopalette_fired_reminders_v2',
  CUSTOM_CATEGORIES: 'chronopalette_custom_categories_v2',
  VISIBLE_CATEGORIES: 'chronopalette_visible_categories_v3',
  /** Which item types are rendered on the calendar (events / tasks). */
  VISIBLE_SCOPES: 'chronopalette_visible_scopes_v3',
};

const VALID_THEMES = new Set<ThemeId>(['light', 'dark', 'ooo', 'wednesday']);

const DEFAULT_THEME_PREFS: ThemePreferences = {
  globalTheme: 'light',
  monthThemes: {},
  weekThemes: {},
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  soundEnabled: true,
  desktopEnabled: true,
  hasRequestedPermission: false,
};

function ensureCleanBrandNewSlate(): void {
  try {
    if (localStorage.getItem(LS_KEYS.CLEAN_SLATE_APPLIED) === 'true') {
      return;
    }
    // Remove any legacy pre-seeded demo storage so the app starts completely empty
    localStorage.removeItem('chronopalette_initialized_v1');
    localStorage.removeItem('chronopalette_events_fallback_v1');
    localStorage.removeItem('chronopalette_fired_reminders_v1');
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      try {
        window.indexedDB.deleteDatabase(LEGACY_DB_NAME);
      } catch {
        // Ignore
      }
    }
    localStorage.setItem(LS_KEYS.CLEAN_SLATE_APPLIED, 'true');
  } catch {
    // Ignore storage restrictions
  }
}

/**
 * Keeps every item on a tag that exists *and* belongs to its own item type.
 * A task that somehow points at an event tag (or a deleted tag) is moved to the
 * task fallback, and vice versa.
 */
export function normalizeEventsCategories(
  events: CalendarEvent[],
  tags: CategoryTag[]
): {
  normalized: CalendarEvent[];
  changed: boolean;
  changedEvents: CalendarEvent[];
} {
  let changed = false;
  const changedEvents: CalendarEvent[] = [];
  const normalized = events.map((ev) => {
    const scope: CategoryScope = ev.isTask ? 'task' : 'event';
    const tag = tags.find((t) => t.id === ev.category);
    if (tag && (tag.scope ?? resolveTagScope(tag.id, tags)) === scope) {
      return ev;
    }
    changed = true;
    const updated: CalendarEvent = {
      ...ev,
      category: scope === 'task' ? 'academic' : 'class-sched',
    };
    changedEvents.push(updated);
    return updated;
  });
  return { normalized, changed, changedEvents };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        db.createObjectStore(EVENTS_STORE, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

function readFallbackEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(LS_KEYS.EVENTS_FALLBACK);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CalendarEvent[]) : [];
  } catch {
    return [];
  }
}

function writeFallbackEvents(events: CalendarEvent[]): void {
  try {
    localStorage.setItem(LS_KEYS.EVENTS_FALLBACK, JSON.stringify(events));
  } catch {
    // Quota or privacy mode
  }
}

export function loadCustomCategories(): CategoryTag[] {
  try {
    const raw = localStorage.getItem(LS_KEYS.CUSTOM_CATEGORIES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CategoryTag[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((tag) => ({
      id: tag.id,
      label: tag.label,
      color: tag.color,
      isCustom: true,
      // Legacy custom tags (saved before tags were split per item type) are
      // treated as Event tags.
      scope: tag.scope === 'task' ? 'task' : 'event',
    }));
  } catch {
    return [];
  }
}

export function saveCustomCategories(customTags: CategoryTag[]): void {
  try {
    localStorage.setItem(LS_KEYS.CUSTOM_CATEGORIES, JSON.stringify(customTags));
  } catch {
    // Ignore storage errors
  }
}

export async function loadStoredEvents(
  customTags: CategoryTag[] = []
): Promise<CalendarEvent[]> {
  ensureCleanBrandNewSlate();

  const knownTags: CategoryTag[] = [...DEFAULT_CATEGORY_TAGS, ...customTags];

  try {
    const db = await openDatabase();
    const events = await new Promise<CalendarEvent[]>((resolve, reject) => {
      const tx = db.transaction(EVENTS_STORE, 'readonly');
      const store = tx.objectStore(EVENTS_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as CalendarEvent[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();

    const { normalized, changed, changedEvents } = normalizeEventsCategories(
      events,
      knownTags
    );
    if (changed) {
      await applyStoredEventsPatch(changedEvents, []);
    }
    return normalized;
  } catch {
    try {
      const raw = localStorage.getItem(LS_KEYS.EVENTS_FALLBACK);
      if (raw) {
        const parsed = JSON.parse(raw) as CalendarEvent[];
        const { normalized, changed } = normalizeEventsCategories(
          parsed,
          knownTags
        );
        if (changed) {
          writeFallbackEvents(normalized);
        }
        return normalized;
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  }
}

/**
 * Logged-out bulk persistence helper (retains existing local-only behavior).
 */
export async function saveStoredEvents(events: CalendarEvent[]): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      store.clear();
      for (const ev of events) {
        store.put(ev);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    writeFallbackEvents(events);
  }
}

/**
 * Granular single-row IndexedDB write used on the logged-in path (no clear-and-rewrite).
 */
export async function putStoredEvent(event: CalendarEvent): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      store.put(event);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    const existing = readFallbackEvents();
    const idx = existing.findIndex((e) => e.id === event.id);
    if (idx >= 0) {
      const next = [...existing];
      next[idx] = event;
      writeFallbackEvents(next);
    } else {
      writeFallbackEvents([...existing, event]);
    }
  }
}

/**
 * Granular single-row IndexedDB delete used on the logged-in path (no clear-and-rewrite).
 */
export async function deleteStoredEvent(eventId: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      store.delete(eventId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    const existing = readFallbackEvents();
    writeFallbackEvents(existing.filter((e) => e.id !== eventId));
  }
}

/**
 * Applies targeted puts and deletes in one IndexedDB transaction without clearing the store.
 */
export async function applyStoredEventsPatch(
  eventsToPut: CalendarEvent[],
  eventIdsToDelete: string[]
): Promise<void> {
  if (eventsToPut.length === 0 && eventIdsToDelete.length === 0) {
    return;
  }
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      for (const id of eventIdsToDelete) {
        store.delete(id);
      }
      for (const ev of eventsToPut) {
        store.put(ev);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    const deleteSet = new Set(eventIdsToDelete);
    const byId = new Map<string, CalendarEvent>();
    for (const ev of readFallbackEvents()) {
      if (!deleteSet.has(ev.id)) {
        byId.set(ev.id, ev);
      }
    }
    for (const ev of eventsToPut) {
      byId.set(ev.id, ev);
    }
    writeFallbackEvents(Array.from(byId.values()));
  }
}

export function sanitizeThemePreferences(raw: unknown): ThemePreferences {
  if (!raw || typeof raw !== 'object') return DEFAULT_THEME_PREFS;
  const parsed = raw as Partial<ThemePreferences>;

  const globalTheme =
    parsed.globalTheme && VALID_THEMES.has(parsed.globalTheme)
      ? parsed.globalTheme
      : DEFAULT_THEME_PREFS.globalTheme;

  const monthThemes: Record<string, ThemeId> = {};
  if (parsed.monthThemes && typeof parsed.monthThemes === 'object') {
    for (const [k, v] of Object.entries(parsed.monthThemes)) {
      if (VALID_THEMES.has(v)) monthThemes[k] = v;
    }
  }

  const weekThemes: Record<string, ThemeId> = {};
  if (parsed.weekThemes && typeof parsed.weekThemes === 'object') {
    for (const [k, v] of Object.entries(parsed.weekThemes)) {
      if (VALID_THEMES.has(v)) weekThemes[k] = v;
    }
  }

  return {
    globalTheme,
    monthThemes,
    weekThemes,
  };
}

export function loadThemePreferences(): ThemePreferences {
  try {
    const raw = localStorage.getItem(LS_KEYS.THEME_PREFS);
    if (!raw) return DEFAULT_THEME_PREFS;
    return sanitizeThemePreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_THEME_PREFS;
  }
}

export function saveThemePreferences(prefs: ThemePreferences): void {
  try {
    localStorage.setItem(LS_KEYS.THEME_PREFS, JSON.stringify(prefs));
  } catch {
    // Ignore
  }
}

export function sanitizeNotificationSettings(
  raw: unknown
): NotificationSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_NOTIFICATION_SETTINGS;
  const parsed = raw as Partial<NotificationSettings>;
  return {
    soundEnabled:
      typeof parsed.soundEnabled === 'boolean'
        ? parsed.soundEnabled
        : DEFAULT_NOTIFICATION_SETTINGS.soundEnabled,
    desktopEnabled:
      typeof parsed.desktopEnabled === 'boolean'
        ? parsed.desktopEnabled
        : DEFAULT_NOTIFICATION_SETTINGS.desktopEnabled,
    hasRequestedPermission:
      typeof parsed.hasRequestedPermission === 'boolean'
        ? parsed.hasRequestedPermission
        : DEFAULT_NOTIFICATION_SETTINGS.hasRequestedPermission,
  };
}

export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(LS_KEYS.NOTIFICATION_SETTINGS);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return sanitizeNotificationSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  try {
    localStorage.setItem(
      LS_KEYS.NOTIFICATION_SETTINGS,
      JSON.stringify(settings)
    );
  } catch {
    // Ignore
  }
}

export function loadFiredReminders(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS_KEYS.FIRED_REMINDERS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const cleaned: Record<string, number> = {};
    for (const [key, ts] of Object.entries(parsed)) {
      if (ts >= cutoff) cleaned[key] = ts;
    }
    return cleaned;
  } catch {
    return {};
  }
}

export function saveFiredReminders(map: Record<string, number>): void {
  try {
    localStorage.setItem(LS_KEYS.FIRED_REMINDERS, JSON.stringify(map));
  } catch {
    // Ignore
  }
}

export function sanitizeVisibleCategories(
  raw: unknown,
  customTags: CategoryTag[] = []
): EventCategory[] {
  const defaultAll = [
    ...EVENT_CATEGORY_TAGS.map((c) => c.id),
    ...TASK_CATEGORY_TAGS.map((c) => c.id),
    ...customTags.map((c) => c.id),
  ];
  if (!Array.isArray(raw)) return defaultAll;
  const validSet = new Set<string>(defaultAll);
  // Unticking every tag is a legitimate state, so no silent re-enable.
  return raw.filter(
    (id): id is EventCategory => typeof id === 'string' && validSet.has(id)
  );
}

export function loadVisibleCategories(
  customTags: CategoryTag[] = []
): EventCategory[] {
  try {
    const raw = localStorage.getItem(LS_KEYS.VISIBLE_CATEGORIES);
    if (!raw) return sanitizeVisibleCategories(null, customTags);
    return sanitizeVisibleCategories(JSON.parse(raw), customTags);
  } catch {
    return sanitizeVisibleCategories(null, customTags);
  }
}

export function saveVisibleCategories(categories: EventCategory[]): void {
  try {
    localStorage.setItem(
      LS_KEYS.VISIBLE_CATEGORIES,
      JSON.stringify(categories)
    );
  } catch {
    // Ignore
  }
}

const DEFAULT_VISIBLE_SCOPES: CategoryScope[] = ['event', 'task'];

export function sanitizeVisibleScopes(raw: unknown): CategoryScope[] {
  if (!Array.isArray(raw)) return DEFAULT_VISIBLE_SCOPES;
  // An empty array is a deliberate "hide both" state.
  if (raw.length === 0) return [];
  const filtered = raw.filter(
    (s): s is CategoryScope => s === 'event' || s === 'task'
  );
  // Nothing usable survived (corrupt payload) -> show both types again.
  return filtered.length > 0 ? filtered : DEFAULT_VISIBLE_SCOPES;
}

/** Which item types the calendar currently draws (Events and/or Tasks). */
export function loadVisibleScopes(): CategoryScope[] {
  try {
    const raw = localStorage.getItem(LS_KEYS.VISIBLE_SCOPES);
    if (!raw) return DEFAULT_VISIBLE_SCOPES;
    return sanitizeVisibleScopes(JSON.parse(raw));
  } catch {
    return DEFAULT_VISIBLE_SCOPES;
  }
}

export function saveVisibleScopes(scopes: CategoryScope[]): void {
  try {
    localStorage.setItem(LS_KEYS.VISIBLE_SCOPES, JSON.stringify(scopes));
  } catch {
    // Ignore
  }
}
