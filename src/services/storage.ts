import {
  CalendarEvent,
  CategoryTag,
  EventCategory,
  NotificationSettings,
  ThemeId,
  ThemePreferences,
} from '../types/calendar';
import { DEFAULT_CATEGORY_TAGS } from '../constants/categories';

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
  CUSTOM_CATEGORIES: 'chronopalette_custom_categories_v1',
  VISIBLE_CATEGORIES: 'chronopalette_visible_categories_v2',
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

function normalizeEventsCategories(
  events: CalendarEvent[],
  validCategoryIds: Set<string>
): { normalized: CalendarEvent[]; changed: boolean } {
  let changed = false;
  const normalized = events.map((ev) => {
    if (validCategoryIds.has(ev.category)) {
      return ev;
    }
    changed = true;
    return { ...ev, category: 'class-sched' };
  });
  return { normalized, changed };
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

  const validIds = new Set<string>([
    ...DEFAULT_CATEGORY_TAGS.map((t) => t.id),
    ...customTags.map((t) => t.id),
  ]);

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

    const { normalized, changed } = normalizeEventsCategories(events, validIds);
    if (changed) {
      await saveStoredEvents(normalized);
    }
    return normalized;
  } catch {
    try {
      const raw = localStorage.getItem(LS_KEYS.EVENTS_FALLBACK);
      if (raw) {
        const parsed = JSON.parse(raw) as CalendarEvent[];
        const { normalized, changed } = normalizeEventsCategories(
          parsed,
          validIds
        );
        if (changed) {
          localStorage.setItem(
            LS_KEYS.EVENTS_FALLBACK,
            JSON.stringify(normalized)
          );
        }
        return normalized;
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  }
}

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
    try {
      localStorage.setItem(LS_KEYS.EVENTS_FALLBACK, JSON.stringify(events));
    } catch {
      // Quota or privacy mode
    }
  }
}

export function loadThemePreferences(): ThemePreferences {
  try {
    const raw = localStorage.getItem(LS_KEYS.THEME_PREFS);
    if (!raw) return DEFAULT_THEME_PREFS;
    const parsed = JSON.parse(raw) as Partial<ThemePreferences>;

    const globalTheme =
      parsed.globalTheme && VALID_THEMES.has(parsed.globalTheme)
        ? parsed.globalTheme
        : DEFAULT_THEME_PREFS.globalTheme;

    const monthThemes: Record<string, ThemeId> = {};
    if (parsed.monthThemes) {
      for (const [k, v] of Object.entries(parsed.monthThemes)) {
        if (VALID_THEMES.has(v)) monthThemes[k] = v;
      }
    }

    const weekThemes: Record<string, ThemeId> = {};
    if (parsed.weekThemes) {
      for (const [k, v] of Object.entries(parsed.weekThemes)) {
        if (VALID_THEMES.has(v)) weekThemes[k] = v;
      }
    }

    return {
      globalTheme,
      monthThemes,
      weekThemes,
    };
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

export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(LS_KEYS.NOTIFICATION_SETTINGS);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(JSON.parse(raw) as Partial<NotificationSettings>),
    };
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

export function loadVisibleCategories(
  customTags: CategoryTag[] = []
): EventCategory[] {
  const defaultAll = [
    ...DEFAULT_CATEGORY_TAGS.map((c) => c.id),
    ...customTags.map((c) => c.id),
  ];
  try {
    const raw = localStorage.getItem(LS_KEYS.VISIBLE_CATEGORIES);
    if (!raw) return defaultAll;
    const saved = JSON.parse(raw) as EventCategory[];
    const validSet = new Set<string>(defaultAll);
    const filtered = saved.filter((id) => validSet.has(id));
    return filtered.length > 0 || saved.length === 0 ? filtered : defaultAll;
  } catch {
    return defaultAll;
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
