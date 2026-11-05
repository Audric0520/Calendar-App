import { startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { CalendarView } from '../types/calendar';
import { NavDirection } from './presets';

/**
 * Collapses a date to the first millisecond of the period currently rendered by
 * the given view. Comparing buckets (instead of raw timestamps) lets us tell a
 * genuine forward/backward navigation apart from a "select a day inside the
 * same week" interaction, which should not slide the grid.
 */
export function viewBucket(date: Date, view: CalendarView): number {
  if (view === 'month') return startOfMonth(date).getTime();
  if (view === 'week') return startOfWeek(date, { weekStartsOn: 0 }).getTime();
  return startOfDay(date).getTime();
}

/** Returns which way the calendar moved so the slide animation can be oriented. */
export function resolveNavDirection(
  prev: Date,
  next: Date,
  view: CalendarView
): NavDirection {
  const from = viewBucket(prev, view);
  const to = viewBucket(next, view);
  if (to > from) return 'next';
  if (to < from) return 'prev';
  return null;
}

/**
 * Stable identity for the rendered grid. Used as the AnimatePresence key so a
 * new grid mounts (and animates) only when the visible period actually changes.
 */
export function calendarGridKey(date: Date, view: CalendarView): string {
  return `${view}-${viewBucket(date, view)}`;
}
