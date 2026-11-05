import {
  CategoryScope,
  CategoryTag,
  EventCategory,
} from '../types/calendar';

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
  /** Item type this tag belongs to (`event` | `task`). */
  scope: CategoryScope;
}

/** Labels used wherever an active scope has to be named in the UI. */
export const CATEGORY_SCOPE_LABEL: Record<CategoryScope, string> = {
  event: 'Event',
  task: 'Task',
};

/**
 * Built-in EVENT categories:
 * 1. Class Sched (Purple)
 * 2. Class Events (Light Blue)
 * 3. Class Exams (Green)
 */
export const EVENT_CATEGORY_TAGS: CategoryTag[] = [
  {
    id: 'class-sched',
    label: 'Class Sched',
    color: '#8b5cf6', // Purple
    isCustom: false,
    scope: 'event',
  },
  {
    id: 'class-events',
    label: 'Class Events',
    color: '#38bdf8', // Light Blue
    isCustom: false,
    scope: 'event',
  },
  {
    id: 'class-exams',
    label: 'Class Exams',
    color: '#22c55e', // Green
    isCustom: false,
    scope: 'event',
  },
];

/**
 * Built-in TASK categories — deliberately separate from the event set so a
 * task can never be filed under "Class Exams" and vice versa:
 * 1. Academic (Blue)
 * 2. Personal (Green)
 */
export const TASK_CATEGORY_TAGS: CategoryTag[] = [
  {
    id: 'academic',
    label: 'Academic',
    color: '#2563eb', // Blue
    isCustom: false,
    scope: 'task',
  },
  {
    id: 'personal',
    label: 'Personal',
    color: '#15803d', // Deep forest green (deliberately darker than Class Exams)
    isCustom: false,
    scope: 'task',
  },
];

/** Every built-in tag across both item types. */
export const DEFAULT_CATEGORY_TAGS: CategoryTag[] = [
  ...EVENT_CATEGORY_TAGS,
  ...TASK_CATEGORY_TAGS,
];

const BUILT_IN_TAG_BY_ID: Record<string, CategoryTag> = Object.fromEntries(
  DEFAULT_CATEGORY_TAGS.map((tag) => [tag.id, tag])
);

/** Tag used when a custom tag for a scope is deleted, keyed by scope. */
export const SCOPE_FALLBACK_TAG_ID: Record<CategoryScope, EventCategory> = {
  event: 'class-sched',
  task: 'academic',
};

/**
 * Resolves which item type a tag belongs to. Custom tags carry an explicit
 * scope; legacy tags without one are inferred from the built-in id, and any
 * unknown id falls back to the Event set.
 */
export function resolveTagScope(
  tagId: EventCategory,
  tags: CategoryTag[] = []
): CategoryScope {
  const found = tags.find((t) => t.id === tagId);
  if (found?.scope) return found.scope;
  const builtIn = BUILT_IN_TAG_BY_ID[tagId];
  if (builtIn?.scope) return builtIn.scope;
  return 'event';
}

/** The tag an item of this scope should fall back to. */
export function getFallbackTagId(scope: CategoryScope): EventCategory {
  return SCOPE_FALLBACK_TAG_ID[scope];
}

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
    scope: tag.scope ?? resolveTagScope(tag.id),
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

/** Tags of a single item type, in display order (built-ins first). */
export function getCategoryTagsByScope(
  scope: CategoryScope,
  customTags: CategoryTag[] = []
): CategoryTag[] {
  const builtIns = scope === 'task' ? TASK_CATEGORY_TAGS : EVENT_CATEGORY_TAGS;
  return [
    ...builtIns,
    ...customTags.filter((t) => (t.scope ?? resolveTagScope(t.id)) === scope),
  ];
}

/**
 * Resolves display metadata for a tag. If the tag exists but belongs to the
 * other item type (e.g. an event tag left on a task), the type's own fallback
 * tag is used so a task never renders with an event palette.
 */
export function resolveCategoryMeta(
  categoryId: EventCategory,
  categoryMap: Record<string, CategoryMeta>,
  scope: CategoryScope = 'event'
): CategoryMeta {
  const found = categoryMap[categoryId];
  if (found && found.scope === scope) return found;
  return (
    categoryMap[getFallbackTagId(scope)] ||
    buildCategoryMeta(
      scope === 'task' ? TASK_CATEGORY_TAGS[0] : EVENT_CATEGORY_TAGS[0]
    )
  );
}
