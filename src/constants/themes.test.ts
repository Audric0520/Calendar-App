import { describe, it, expect } from 'vitest';
import {
  THEME_DEFINITIONS,
  THEME_GROUPS,
  THEME_LIST,
  ThemeDefinition,
} from './themes';
import { ThemeGroup, ThemeId } from '../types/calendar';
import { THEME_MOTION } from '../motion/themeMotion';

interface NodeFsLike {
  readFileSync(path: URL, encoding: 'utf8'): string;
}

async function getNodeFs(): Promise<NodeFsLike> {
  const specifier = ['node', 'fs'].join(':');
  return (await import(/* @vite-ignore */ specifier)) as NodeFsLike;
}

function repoFileUrl(relativePath: string): URL {
  return new URL(`../../${relativePath}`, import.meta.url);
}

const ALL_THEME_IDS: ThemeId[] = ['light', 'dark', 'ooo', 'wednesday', 'gengar'];

const REQUIRED_TOKENS = [
  '--t-is-dark',
  '--t-bg-primary',
  '--t-bg-surface',
  '--t-bg-elevated',
  '--t-bg-cell',
  '--t-bg-cell-muted',
  '--t-bg-cell-hover',
  '--t-bg-today',
  '--t-border',
  '--t-border-strong',
  '--t-text-primary',
  '--t-text-secondary',
  '--t-text-muted',
  '--t-accent',
  '--t-accent-hover',
  '--t-accent-soft',
  '--t-accent-contrast',
  '--t-accent-2',
  '--t-accent-3',
  '--t-shadow',
  '--t-shadow-lg',
  '--t-header-gradient',
  '--t-cell-overlay',
  '--t-font-display',
];

function extractThemeBlock(css: string, id: ThemeId): string {
  const start = css.indexOf(`[data-theme='${id}'] {`);
  expect(start, `themes.css must contain a [data-theme='${id}'] token block`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

describe('theme definitions', () => {
  it('covers every theme id exactly once in the theme list', () => {
    expect(THEME_LIST.map((t) => t.id).sort()).toEqual([...ALL_THEME_IDS].sort());
  });

  it('keeps every theme definition complete', () => {
    for (const id of ALL_THEME_IDS) {
      const def: ThemeDefinition = THEME_DEFINITIONS[id];
      expect(def, `missing definition for ${id}`).toBeDefined();
      expect(def.id).toBe(id);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.shortName.length).toBeGreaterThan(0);
      expect(def.tagline.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.swatches).toHaveLength(3);
      for (const swatch of def.swatches) {
        expect(swatch).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
      expect(def.badgeBg).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(def.badgeText).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(def.badgeBorder).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('groups every theme exactly once with a matching group name', () => {
    const grouped = THEME_GROUPS.flatMap((g) => g.themes.map((t) => t.id));
    expect(grouped.sort()).toEqual([...ALL_THEME_IDS].sort());
    for (const grp of THEME_GROUPS) {
      for (const theme of grp.themes) {
        expect(theme.group).toBe(grp.group as ThemeGroup);
      }
    }
  });
});

describe('gengar theme', () => {
  it('is registered as a dark Gengar theme with violet/lime swatches', () => {
    const def = THEME_DEFINITIONS.gengar;
    expect(def.name).toBe('Gengar');
    expect(def.group).toBe('Gengar');
    expect(def.isDark).toBe(true);
    expect(def.swatches).toEqual(['#160b24', '#a855f7', '#a3e635']);
  });

  it('has a motion glow and sound-safe identity', () => {
    expect(THEME_MOTION.gengar.glow).toContain('168, 85, 247');
  });
});

describe('theme css tokens', () => {
  it('defines the complete token set for every theme', async () => {
    const fs = await getNodeFs();
    const css = fs.readFileSync(repoFileUrl('src/styles/themes.css'), 'utf8');
    for (const id of ALL_THEME_IDS) {
      const block = extractThemeBlock(css, id);
      for (const token of REQUIRED_TOKENS) {
        expect(block, `[data-theme='${id}'] is missing ${token}`).toContain(token);
      }
    }
  });

  it('scopes a gengar atmosphere layer and week-row signature', async () => {
    const fs = await getNodeFs();
    const css = fs.readFileSync(repoFileUrl('src/styles/themes.css'), 'utf8');
    // Atmosphere layer
    expect(css).toContain("[data-theme='gengar'].app-shell");
    expect(css).toContain("[data-theme='gengar'] :focus-visible");
    expect(css).toContain("[data-theme='gengar'] ::selection");
    // Week-row signature with the violet→magenta→lime mischief rail
    expect(css).toContain(".week-row-scope[data-theme='gengar']::before");
    expect(css).toContain('#7c3aed 0%');
    expect(css).toContain('#f472b6 66%');
    expect(css).toContain('#a3e635 100%');
  });
});
