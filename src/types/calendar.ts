export type CalendarView = 'month' | 'week' | 'day';

export type ThemeId =
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'winter'
  | 'ooo'
  | 'wednesday';

export type ThemeGroup = '4 Seasons' | 'Kamen Rider OOO' | 'Wednesday';

export type RecurrenceRule = 'none' | 'daily' | 'weekly' | 'monthly';

export type DefaultCategoryId =
  | 'class-sched'
  | 'class-events'
  | 'class-exams';

export type EventCategory = DefaultCategoryId | (string & {});

export interface CategoryTag {
  id: EventCategory;
  label: string;
  color: string;
  isCustom?: boolean;
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
  /** Optional YYYY-MM-DD end date for recurring series */
  recurrenceUntil?: string;
  /** Base64 Data URL (uploaded file) or external image URL */
  imageUrl?: string;
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
  imageUrl?: string;
  imageName?: string;
  isTask?: boolean;
  completed?: boolean;
}
