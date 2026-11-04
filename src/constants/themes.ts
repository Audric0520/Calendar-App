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
  spring: {
    id: 'spring',
    name: 'Spring Blossom',
    shortName: 'Spring',
    group: '4 Seasons',
    tagline: 'Pastel greens & sakura pink',
    description:
      'Soft celadon greens, sakura blossom pinks, and delicate floral borders.',
    isDark: false,
    swatches: ['#dcfce7', '#f472b6', '#4ade80'],
    badgeBg: '#fce7f3',
    badgeText: '#9d174d',
    badgeBorder: '#f472b6',
  },
  summer: {
    id: 'summer',
    name: 'Summer Solstice',
    shortName: 'Summer',
    group: '4 Seasons',
    tagline: 'Oceanic blues & golden sun',
    description:
      'Vibrant oceanic cyan-blues, golden sunshine yellows, and bright high-contrast grid lines.',
    isDark: false,
    swatches: ['#0284c7', '#facc15', '#38bdf8'],
    badgeBg: '#fef9c3',
    badgeText: '#0369a1',
    badgeBorder: '#38bdf8',
  },
  autumn: {
    id: 'autumn',
    name: 'Autumn Harvest',
    shortName: 'Autumn',
    group: '4 Seasons',
    tagline: 'Terracotta, amber & burnt oak',
    description:
      'Warm terracotta orange, spiced golden amber, and rich burnt oak tones.',
    isDark: false,
    swatches: ['#c2410c', '#f59e0b', '#78350f'],
    badgeBg: '#ffedd5',
    badgeText: '#9a3412',
    badgeBorder: '#d97706',
  },
  winter: {
    id: 'winter',
    name: 'Winter Frost',
    shortName: 'Winter',
    group: '4 Seasons',
    tagline: 'Frost white, icy teal & silver',
    description:
      'Crystalline frost white surfaces, glacial teal accents, and muted slate silver highlights.',
    isDark: false,
    swatches: ['#f8fafc', '#14b8a6', '#94a3b8'],
    badgeBg: '#ccfbf1',
    badgeText: '#0f766e',
    badgeBorder: '#94a3b8',
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
  THEME_DEFINITIONS.spring,
  THEME_DEFINITIONS.summer,
  THEME_DEFINITIONS.autumn,
  THEME_DEFINITIONS.winter,
  THEME_DEFINITIONS.ooo,
  THEME_DEFINITIONS.wednesday,
];

export const THEME_GROUPS: { group: ThemeGroup; subtitle: string; themes: ThemeDefinition[] }[] = [
  {
    group: '4 Seasons',
    subtitle: 'Natural seasonal palettes from sakura bloom to crystalline frost',
    themes: [
      THEME_DEFINITIONS.spring,
      THEME_DEFINITIONS.summer,
      THEME_DEFINITIONS.autumn,
      THEME_DEFINITIONS.winter,
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
