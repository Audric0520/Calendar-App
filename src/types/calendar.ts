export type CalendarView = 'month' | 'week' | 'day';

export type ThemeId =
  | 'light'
  | 'dark'
  | 'ooo'
  | 'wednesday';

export type ThemeGroup = 'Standard Modes' | 'Kamen Rider OOO' | 'Wednesday';

export type RecurrenceRule =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'custom';

export type CustomRepeatUnit = 'day' | 'week' | 'month' | 'year';

export type CustomRepeatEndType = 'never' | 'on' | 'after';

export interface CustomRecurrenceConfig {
  /** Repeat every N units (>= 1) */
  interval: number;
  /** Unit of repetition */
  unit: CustomRepeatUnit;
  /** Selected weekdays when unit === 'week' (0 = Sunday .. 6 = Saturday) */
  daysOfWeek?: number[];
  /** Termination mode */
  endType: CustomRepeatEndType;
  /** Inclusive end date "YYYY-MM-DD" when endType === 'on' */
  endDate?: string;
  /** Total occurrences (>= 1) when endType === 'after' */
  occurrences?: number;
}

export type DefaultCategoryId =
  | 'class-sched'
  | 'class-events'
  | 'class-exams'
  | 'academic'
  | 'personal';

export type EventCategory = DefaultCategoryId | (string & {});

/**
 * Which item type a tag belongs to. Event tags and Task tags are two separate
 * sets: events use the class-oriented tags, tasks only use Academic / Personal
 * plus any tags the user creates for tasks.
 */
export type CategoryScope = 'event' | 'task';

/** Quick filter presets for which item types the calendar draws. */
export type CalendarScopeFilter = 'both' | 'events' | 'tasks';

export interface CategoryTag {
  id: EventCategory;
  label: string;
  color: string;
  isCustom?: boolean;
  /** Item type this tag belongs to. Missing on legacy tags -> resolved by id. */
  scope?: CategoryScope;
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** Local ISO string: "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss" */
  start: string;
  /** Local ISO string: "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss" */
  end: string;
  allDay: boolean;
  category: EventCategory;
  location: string;
  description: string;
  recurrence: RecurrenceRule;
  /** Optional YYYY-MM-DD end date for preset recurring series */
  recurrenceUntil?: string;
  /** Optional granular configuration when recurrence === 'custom' */
  customRecurrence?: CustomRecurrenceConfig;
  /** Base64 Data URL (local/pending upload), resolved signed URL, or external https image URL */
  imageUrl?: string;
  /** Private Supabase Storage object path (`<user_id>/<event_id>.<ext>`) when stored in cloud */
  imagePath?: string;
  imageName?: string;
  isTask?: boolean;
  completed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EventOccurrence {
  occurrenceId: string;
  masterId: string;
  event: CalendarEvent;
  start: Date;
  end: Date;
  isRecurringInstance: boolean;
}

export interface ThemePreferences {
  globalTheme: ThemeId;
  /** Keyed by "YYYY-MM", e.g. "2026-11" */
  monthThemes: Record<string, ThemeId>;
  /** Keyed by Sunday week-start "YYYY-MM-DD", e.g. "2026-11-01" */
  weekThemes: Record<string, ThemeId>;
}

export interface NotificationSettings {
  soundEnabled: boolean;
  desktopEnabled: boolean;
  hasRequestedPermission: boolean;
}

export interface ReminderAlert {
  id: string;
  eventId: string;
  title: string;
  start: Date;
  end: Date;
  location: string;
  category: EventCategory;
  /** Task alerts use the task tag palette. */
  isTask?: boolean;
  imageUrl?: string;
  triggeredAt: Date;
}

export interface EventDraft {
  id?: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  category: EventCategory;
  location: string;
  description: string;
  recurrence: RecurrenceRule;
  recurrenceUntil?: string;
  customRecurrence?: CustomRecurrenceConfig;
  imageUrl?: string;
  imagePath?: string;
  imageName?: string;
  isTask?: boolean;
  completed?: boolean;
}
