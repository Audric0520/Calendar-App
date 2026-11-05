import { ThemeId } from '../types/calendar';

/**
 * Palette identity used by the badge morph / glow effects. Kept separate from
 * `constants/themes.ts` so the special theme definitions stay untouched.
 */
export const THEME_MOTION: Record<ThemeId, { glow: string }> = {
  light: { glow: 'rgba(37, 99, 235, 0.45)' },
  dark: { glow: 'rgba(96, 165, 250, 0.5)' },
  ooo: { glow: 'rgba(250, 204, 21, 0.55)' },
  wednesday: { glow: 'rgba(230, 225, 215, 0.42)' },
};

/** Default glow when an unknown theme id slips through. */
export const DEFAULT_THEME_GLOW = 'rgba(148, 163, 184, 0.4)';
