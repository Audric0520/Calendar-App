import { ThemeGroup, ThemeId } from '../types/calendar';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  shortName: string;
  group: ThemeGroup;
  tagline: string;
  description: string;
  isDark: boolean;
  swatches: [string, string, string];
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

export const THEME_DEFINITIONS: Record<ThemeId, ThemeDefinition> = {
  light: {
    id: 'light',
    name: 'Light Mode',
    shortName: 'Light Mode',
    group: 'Standard Modes',
    tagline: 'Clean daylight white & cobalt blue',
    description:
      'Crisp daylight white surfaces, subtle slate grid lines, and modern cobalt blue accents.',
    isDark: false,
    swatches: ['#ffffff', '#2563eb', '#e2e8f0'],
    badgeBg: '#dbeafe',
    badgeText: '#1d4ed8',
    badgeBorder: '#93c5fd',
  },
  dark: {
    id: 'dark',
    name: 'Dark Mode',
    shortName: 'Dark Mode',
    group: 'Standard Modes',
    tagline: 'Midnight slate & soft sky blue',
    description:
      'Sleek low-glare midnight slate surfaces with refined contrast and soft sky-blue highlights.',
    isDark: true,
    swatches: ['#0b0f19', '#1e2638', '#60a5fa'],
    badgeBg: '#1e293b',
    badgeText: '#93c5fd',
    badgeBorder: '#3b82f6',
  },
  ooo: {
    id: 'ooo',
    name: 'Kamen Rider OOO',
    shortName: 'OOO Tatoba',
    group: 'Kamen Rider OOO',
    tagline: 'Tatoba Medals & dark chrome',
    description:
      'Bold metallic Greeed dark chrome borders, O-Scanner gold rims, and Taka/Tora/Batta tri-color Core Medal emblems.',
    isDark: true,
    swatches: ['#ef4444', '#facc15', '#22c55e'],
    badgeBg: '#1e2430',
    badgeText: '#facc15',
    badgeBorder: '#eab308',
  },
  wednesday: {
    id: 'wednesday',
    name: 'Wednesday (Nevermore)',
    shortName: 'Wednesday',
    group: 'Wednesday',
    tagline: 'Obsidian gothic & stained glass',
    description:
      'Monochromatic obsidian & charcoal dark mode with Nevermore dark violet, burgundy accents, and stained-glass framing.',
    isDark: true,
    swatches: ['#0f0e17', '#7c3aed', '#9f1239'],
    badgeBg: '#1e1630',
    badgeText: '#ddd6fe',
    badgeBorder: '#7c3aed',
  },
};

export const THEME_LIST: ThemeDefinition[] = [
  THEME_DEFINITIONS.light,
  THEME_DEFINITIONS.dark,
  THEME_DEFINITIONS.ooo,
  THEME_DEFINITIONS.wednesday,
];

export const THEME_GROUPS: { group: ThemeGroup; subtitle: string; themes: ThemeDefinition[] }[] = [
  {
    group: 'Standard Modes',
    subtitle: 'Classic clean Light Mode and sleek low-glare Dark Mode',
    themes: [
      THEME_DEFINITIONS.light,
      THEME_DEFINITIONS.dark,
    ],
  },
  {
    group: 'Kamen Rider OOO',
    subtitle: 'Taka! Tora! Batta! Metallic Greeed chrome & tri-color Core Medals',
    themes: [THEME_DEFINITIONS.ooo],
  },
  {
    group: 'Wednesday',
    subtitle: 'Addams / Nevermore gothic obsidian & stained-glass architecture',
    themes: [THEME_DEFINITIONS.wednesday],
  },
];
