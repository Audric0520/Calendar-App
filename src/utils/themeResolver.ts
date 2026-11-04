import { format, startOfWeek } from 'date-fns';
import { CalendarView, ThemeId, ThemePreferences } from '../types/calendar';

export type ThemeSource = 'week' | 'month' | 'global';

export interface ResolvedTheme {
  theme: ThemeId;
  source: ThemeSource;
}

export function getMonthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

export function getWeekKey(date: Date): string {
  const sunday = startOfWeek(date, { weekStartsOn: 0 });
  return format(sunday, 'yyyy-MM-dd');
}

export function resolveWeekTheme(
  weekStartDate: Date,
  activeMonthDate: Date,
  prefs: ThemePreferences
): ResolvedTheme {
  const wKey = getWeekKey(weekStartDate);
  if (prefs.weekThemes[wKey]) {
    return { theme: prefs.weekThemes[wKey], source: 'week' };
  }

  const mKey = getMonthKey(activeMonthDate);
  if (prefs.monthThemes[mKey]) {
    return { theme: prefs.monthThemes[mKey], source: 'month' };
  }

  return { theme: prefs.globalTheme, source: 'global' };
}

export function resolveShellTheme(
  view: CalendarView,
  currentDate: Date,
  prefs: ThemePreferences
): ResolvedTheme {
  if (view === 'week' || view === 'day') {
    const wKey = getWeekKey(currentDate);
    if (prefs.weekThemes[wKey]) {
      return { theme: prefs.weekThemes[wKey], source: 'week' };
    }
  }

  const mKey = getMonthKey(currentDate);
  if (prefs.monthThemes[mKey]) {
    return { theme: prefs.monthThemes[mKey], source: 'month' };
  }

  return { theme: prefs.globalTheme, source: 'global' };
}
