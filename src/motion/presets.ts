import { Transition, Variants } from 'framer-motion';
import { CalendarView } from '../types/calendar';

/* ============================================================================
   MOTION DESIGN TOKENS
   Every animation in the app is expressed with GPU-friendly properties only
   (transform + opacity) so the compositor can run the whole transition at 60fps
   without triggering layout or paint on the main thread.
   ============================================================================ */

/** Direction of a calendar navigation step. `null` means "jump / no slide". */
export type NavDirection = 'next' | 'prev' | null;

/** Elastic spring used by modals, popovers and the sidebar. */
export const SPRING_ELASTIC: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 30,
  mass: 0.9,
};

/** Softer spring for large surfaces (sidebar drawer, cards). */
export const SPRING_SOFT: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 32,
  mass: 0.85,
};

/** Directional slide timing — short enough to feel instant, long enough to read. */
export const NAV_SLIDE_TRANSITION: Transition = {
  duration: 0.34,
  ease: [0.22, 1, 0.36, 1],
};

/** Cross-fade used when swapping Month ↔ Week ↔ Day. */
export const VIEW_CROSSFADE_TRANSITION: Transition = {
  duration: 0.26,
  ease: [0.33, 1, 0.68, 1],
};

/** Graceful exit durations (150ms–200ms per the micro-interaction spec). */
export const EXIT_FAST: Transition = { duration: 0.17, ease: [0.4, 0, 1, 1] };
export const EXIT_MEDIUM: Transition = { duration: 0.19, ease: [0.4, 0, 1, 1] };

/* ----------------------------------------------------------------------------
   CALENDAR GRID SLIDE (Next / Previous)
   ---------------------------------------------------------------------------- */

export const gridSlideVariants: Variants = {
  enter: (dir: NavDirection) => ({
    opacity: 0,
    x: dir === 'next' ? 64 : dir === 'prev' ? -64 : 0,
    scale: dir ? 1 : 0.985,
  }),
  center: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: NAV_SLIDE_TRANSITION,
  },
  exit: (dir: NavDirection) => ({
    opacity: 0,
    // Leaving to the left when moving forward, mirrored when moving back.
    x: dir === 'next' ? -64 : dir === 'prev' ? 64 : 0,
    scale: dir ? 1 : 0.985,
    transition: { duration: 0.26, ease: [0.4, 0, 1, 1] },
  }),
};

/* ----------------------------------------------------------------------------
   VIEW SWITCH (Month ↔ Week ↔ Day) — cross-fade + subtle scale
   ---------------------------------------------------------------------------- */

export const viewSwitchVariants: Variants = {
  enter: { opacity: 0, scale: 0.98 },
  center: {
    opacity: 1,
    scale: 1,
    transition: VIEW_CROSSFADE_TRANSITION,
  },
  exit: {
    opacity: 0,
    scale: 0.985,
    transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
  },
};

/* ----------------------------------------------------------------------------
   MODALS & OVERLAYS — elastic spring in, quick fade-out
   ---------------------------------------------------------------------------- */

export const modalBackdropVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.22, ease: 'easeOut' } },
  exit: { opacity: 0, transition: EXIT_MEDIUM },
};

export const modalPanelVariants: Variants = {
  enter: { opacity: 0, scale: 0.95, y: 10 },
  center: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: SPRING_ELASTIC,
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 4,
    transition: EXIT_FAST,
  },
};

/** Popovers anchored to the modal (date / time / repeat dropdowns). */
export const popoverVariants: Variants = {
  enter: { opacity: 0, scale: 0.96, y: -4 },
  center: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 },
  },
  exit: { opacity: 0, scale: 0.97, y: -3, transition: EXIT_FAST },
};

/** Small anchored menus (bell popover, week theme picker). */
export const menuVariants: Variants = {
  enter: { opacity: 0, scale: 0.96, y: -6 },
  center: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 460, damping: 32, mass: 0.75 },
  },
  exit: { opacity: 0, scale: 0.97, y: -4, transition: EXIT_FAST },
};

/* ----------------------------------------------------------------------------
   SIDEBAR / DRAWER
   ---------------------------------------------------------------------------- */

export const drawerBackdropVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { opacity: 0, transition: EXIT_FAST },
};

export const drawerPanelVariants: Variants = {
  enter: { x: '-100%' },
  center: { x: 0, transition: SPRING_SOFT },
  exit: { x: '-100%', transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } },
};

/* ----------------------------------------------------------------------------
   VIEW ORDER — used to orient the Month → Week → Day zoom transition
   ---------------------------------------------------------------------------- */

export const VIEW_ORDER: Record<CalendarView, number> = {
  month: 0,
  week: 1,
  day: 2,
};
