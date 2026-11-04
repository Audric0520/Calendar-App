import { CategoryTag, EventCategory } from '../types/calendar';

export interface CategoryMeta {
  id: EventCategory;
  label: string;
  color: string;
  softBg: string;
  darkSoftBg: string;
  textOnLight: string;
  textOnDark: string;
  textOnSolid: string;
  border: string;
  isCustom?: boolean;
}

/**
 * Built-in baseline categories:
 * 1. Class Sched (Purple)
 * 2. Class Events (Light Blue)
 * 3. Class Exams (Green)
 */
export const DEFAULT_CATEGORY_TAGS: CategoryTag[] = [
  {
    id: 'class-sched',
    label: 'Class Sched',
    color: '#8b5cf6', // Purple
    isCustom: false,
  },
  {
    id: 'class-events',
    label: 'Class Events',
    color: '#38bdf8', // Light Blue
    isCustom: false,
  },
  {
    id: 'class-exams',
    label: 'Class Exams',
    color: '#22c55e', // Green
    isCustom: false,
  },
];

export const PRESET_TAG_SWATCHES: string[] = [
  '#f43f5e', // Rose Red
  '#f97316', // Sunset Orange
  '#eab308', // Golden Amber
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#2563eb', // Royal Blue
  '#6366f1', // Indigo
  '#a855f7', // Violet
  '#ec4899', // Sakura Pink
  '#64748b', // Slate
];

function parseHexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [r, g, b];
  }
  return [139, 92, 246]; // fallback purple
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

function mixColors(
  [r1, g1, b1]: [number, number, number],
  [r2, g2, b2]: [number, number, number],
  weight1: number
): string {
  const w2 = 1 - weight1;
  return rgbToHex(r1 * weight1 + r2 * w2, g1 * weight1 + g2 * w2, b1 * weight1 + b2 * w2);
}

export function buildCategoryMeta(tag: CategoryTag): CategoryMeta {
  const rgb = parseHexToRgb(tag.color);
  const [r, g, b] = rgb;
  const normalizedHex = rgbToHex(r, g, b);

  // Perceived brightness (0..1)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return {
    id: tag.id,
    label: tag.label,
    color: normalizedHex,
    softBg: mixColors(rgb, [255, 255, 255], 0.18),
    darkSoftBg: `rgba(${r}, ${g}, ${b}, 0.25)`,
    textOnLight: mixColors(rgb, [15, 23, 42], 0.42),
    textOnDark: mixColors(rgb, [255, 255, 255], 0.35),
    textOnSolid: luminance > 0.62 ? '#082f49' : '#ffffff',
    border: mixColors(rgb, [15, 23, 42], 0.88),
    isCustom: tag.isCustom,
  };
}

export function buildCategoryMap(
  customTags: CategoryTag[] = []
): Record<string, CategoryMeta> {
  const map: Record<string, CategoryMeta> = {};
  for (const tag of [...DEFAULT_CATEGORY_TAGS, ...customTags]) {
    map[tag.id] = buildCategoryMeta(tag);
  }
  return map;
}

export function resolveCategoryMeta(
  categoryId: EventCategory,
  categoryMap: Record<string, CategoryMeta>
): CategoryMeta {
  return (
    categoryMap[categoryId] ||
    categoryMap['class-sched'] ||
    buildCategoryMeta(DEFAULT_CATEGORY_TAGS[0])
  );
}
