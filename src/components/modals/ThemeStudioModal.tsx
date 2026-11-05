import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Check,
  Layers,
  Palette,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { ThemeId, ThemePreferences } from '../../types/calendar';
import {
  THEME_DEFINITIONS,
  THEME_GROUPS,
  THEME_LIST,
} from '../../constants/themes';
import { getMonthWeeks } from '../../utils/calendarMath';
import {
  getMonthKey,
  getWeekKey,
  resolveWeekTheme,
} from '../../utils/themeResolver';
import { ThemeOrnament } from '../calendar/ThemeOrnament';
import { AnimatePresence, motion } from 'framer-motion';
import {
  modalBackdropVariants,
  modalPanelVariants,
} from '../../motion/presets';

interface ThemeStudioModalProps {
  isOpen: boolean;
  currentDate: Date;
  themePrefs: ThemePreferences;
  onClose: () => void;
  onSetGlobalTheme: (theme: ThemeId) => void;
  onSetMonthTheme: (monthKey: string, theme: ThemeId | null) => void;
  onSetWeekTheme: (weekKey: string, theme: ThemeId | null) => void;
  onApplySplitWeekDemo: (monthDate: Date) => void;
  onClearAllOverrides: () => void;
}

export const ThemeStudioModal: React.FC<ThemeStudioModalProps> = ({
  isOpen,
  currentDate,
  themePrefs,
  onClose,
  onSetGlobalTheme,
  onSetMonthTheme,
  onSetWeekTheme,
  onApplySplitWeekDemo,
  onClearAllOverrides,
}) => {
  const [activeTab, setActiveTab] = useState<'global' | 'month' | 'weeks'>(
    'weeks'
  );

  const monthKey = getMonthKey(currentDate);
  const weeks = useMemo(() => getMonthWeeks(currentDate), [currentDate]);
  const assignedMonthTheme = themePrefs.monthThemes[monthKey];

  const overrideCount =
    Object.keys(themePrefs.monthThemes).length +
    Object.keys(themePrefs.weekThemes).length;

  return (
    <AnimatePresence>
      {isOpen && (
    <motion.div
      key="theme-studio-backdrop"
      variants={modalBackdropVariants}
      initial="enter"
      animate="center"
      exit="exit"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        variants={modalPanelVariants}
        initial="enter"
        animate="center"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg overflow-hidden gpu-layer"
      >
        {/* Header */}
        <div
          style={{ backgroundImage: 'var(--t-header-gradient)' }}
          className="px-5 py-4 border-b border-theme-border flex items-center justify-between gap-3 shrink-0"
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                backgroundColor: 'var(--t-accent)',
                color: 'var(--t-accent-contrast)',
              }}
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
            >
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-theme-text">
                Dynamic Multi-Theme Studio
              </h2>
              <p className="text-xs text-theme-text-secondary">
                Assign palettes globally, per-month, or per-week with isolated{' '}
                <code className="font-mono text-[11px]">data-theme</code>{' '}
                scoping
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-theme-text-secondary hover:bg-theme-cell-hover"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preset Showcase Banner */}
        <div className="px-5 py-3 bg-theme-elevated border-b border-theme-border flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs text-theme-text-secondary">
            <Sparkles className="w-4 h-4 text-theme-accent shrink-0" />
            <span>
              Want to preview multiple themes simultaneously across{' '}
              <strong className="text-theme-text">
                {format(currentDate, 'MMMM yyyy')}
              </strong>
              ?
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onApplySplitWeekDemo(currentDate);
                setActiveTab('weeks');
              }}
              style={{
                backgroundColor: 'var(--t-accent)',
                color: 'var(--t-accent-contrast)',
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold shadow-sm hover:opacity-95 transition-opacity"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Apply Split-Week Showcase
            </button>

            {overrideCount > 0 && (
              <button
                type="button"
                onClick={onClearAllOverrides}
                className="inline-flex items-center gap-1 rounded-lg border border-theme-border bg-theme-surface px-2.5 py-1.5 text-xs font-semibold text-theme-text-secondary hover:bg-theme-cell-hover"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Overrides ({overrideCount})
              </button>
            )}
          </div>
        </div>

        {/* Scope Tabs */}
        <div className="px-5 pt-3 border-b border-theme-border bg-theme-surface flex gap-2 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('weeks')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'weeks'
                ? 'border-theme-accent text-theme-accent bg-theme-accent-soft/45'
                : 'border-transparent text-theme-text-secondary hover:text-theme-text'
            }`}
          >
            Per-Week Themes ({format(currentDate, 'MMM yyyy')})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('month')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'month'
                ? 'border-theme-accent text-theme-accent bg-theme-accent-soft/45'
                : 'border-transparent text-theme-text-secondary hover:text-theme-text'
            }`}
          >
            Per-Month Theme ({format(currentDate, 'MMMM')})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('global')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'global'
                ? 'border-theme-accent text-theme-accent bg-theme-accent-soft/45'
                : 'border-transparent text-theme-text-secondary hover:text-theme-text'
            }`}
          >
            Global Default Theme
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto themed-scroll p-5 space-y-5">
          {activeTab === 'weeks' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-theme-text-secondary">
                  Assign distinct themes to individual week rows in{' '}
                  <strong className="text-theme-text">
                    {format(currentDate, 'MMMM yyyy')}
                  </strong>
                  . For example, set Week 1 to <em>Light Mode</em> and Week 2 to{' '}
                  <em>Wednesday</em>!
                </p>
              </div>

              <div className="space-y-2.5">
                {weeks.map((weekDays, idx) => {
                  const wKey = getWeekKey(weekDays[0]);
                  const resolved = resolveWeekTheme(
                    weekDays[0],
                    currentDate,
                    themePrefs
                  );
                  const explicitTheme = themePrefs.weekThemes[wKey];

                  return (
                    <div
                      key={wKey}
                      className="rounded-xl border border-theme-border bg-theme-elevated/75 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="min-w-[185px]">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-theme-text">
                            Week {idx + 1}
                          </span>
                          <span className="text-[11px] font-medium text-theme-text-muted tabular-nums">
                            {format(weekDays[0], 'MMM d')} –{' '}
                            {format(weekDays[6], 'MMM d')}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                          <ThemeOrnament theme={resolved.theme} size={13} />
                          <span className="font-semibold text-theme-text-secondary">
                            {THEME_DEFINITIONS[resolved.theme].name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-theme-surface border border-theme-border text-theme-text-muted capitalize">
                            {resolved.source}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {THEME_LIST.map((t) => {
                          const isSelected = explicitTheme === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() =>
                                onSetWeekTheme(
                                  wKey,
                                  isSelected ? null : t.id
                                )
                              }
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all ${
                                isSelected
                                  ? 'border-theme-accent bg-theme-accent text-theme-accent-contrast shadow-sm scale-[1.02]'
                                  : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-cell-hover'
                              }`}
                              title={t.description}
                            >
                              <ThemeOrnament theme={t.id} size={13} />
                              <span>{t.shortName}</span>
                            </button>
                          );
                        })}

                        {explicitTheme && (
                          <button
                            type="button"
                            onClick={() => onSetWeekTheme(wKey, null)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                            title="Reset week override"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'month' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-theme-text">
                    Theme for {format(currentDate, 'MMMM yyyy')}
                  </h3>
                  <p className="text-xs text-theme-text-secondary">
                    Applies to all weeks in {format(currentDate, 'MMMM')} unless
                    overridden by a Per-Week assignment.
                  </p>
                </div>

                {assignedMonthTheme && (
                  <button
                    type="button"
                    onClick={() => onSetMonthTheme(monthKey, null)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-600"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Inherit Global ({THEME_DEFINITIONS[themePrefs.globalTheme].shortName})
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {THEME_LIST.map((t) => {
                  const selected = assignedMonthTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        onSetMonthTheme(monthKey, selected ? null : t.id)
                      }
                      className={`relative rounded-xl border p-4 text-left transition-all ${
                        selected
                          ? 'border-theme-accent ring-2 ring-theme-accent/35 bg-theme-accent-soft/45'
                          : 'border-theme-border bg-theme-elevated hover:bg-theme-cell-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ThemeOrnament theme={t.id} size={18} />
                          <div>
                            <div className="text-sm font-extrabold text-theme-text">
                              {t.name}
                            </div>
                            <div className="text-[11px] font-medium text-theme-text-muted">
                              {t.group}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {t.swatches.map((hex, i) => (
                            <span
                              key={i}
                              style={{ backgroundColor: hex }}
                              className="w-3.5 h-3.5 rounded-full border border-black/15"
                            />
                          ))}
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-theme-text-secondary">
                        {t.description}
                      </p>
                      {selected && (
                        <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-theme-accent">
                          <Check className="w-3.5 h-3.5" /> Assigned to{' '}
                          {format(currentDate, 'MMMM yyyy')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'global' && (
            <div className="space-y-5">
              {THEME_GROUPS.map((grp) => (
                <div key={grp.group} className="space-y-2.5">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-theme-accent flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      {grp.group}
                    </h3>
                    <p className="text-xs text-theme-text-muted">
                      {grp.subtitle}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {grp.themes.map((t) => {
                      const selected = themePrefs.globalTheme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onSetGlobalTheme(t.id)}
                          className={`rounded-xl border p-4 text-left transition-all ${
                            selected
                              ? 'border-theme-accent ring-2 ring-theme-accent/35 bg-theme-accent-soft/45'
                              : 'border-theme-border bg-theme-elevated hover:bg-theme-cell-hover'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <ThemeOrnament theme={t.id} size={18} />
                              <span className="text-sm font-extrabold text-theme-text">
                                {t.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              {t.swatches.map((hex, i) => (
                                <span
                                  key={i}
                                  style={{ backgroundColor: hex }}
                                  className="w-3.5 h-3.5 rounded-full border border-black/15"
                                />
                              ))}
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-theme-text-secondary">
                            {t.description}
                          </p>
                          {selected && (
                            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-theme-accent">
                              <Check className="w-3.5 h-3.5" /> Active Global
                              Default
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-theme-border bg-theme-elevated flex items-center justify-between text-xs text-theme-text-muted shrink-0">
          <span>
            Precedence: <strong>Per-Week</strong> &gt; <strong>Per-Month</strong>{' '}
            &gt; <strong>Global Default</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: 'var(--t-accent)',
              color: 'var(--t-accent-contrast)',
            }}
            className="rounded-xl px-4 py-2 text-xs font-bold shadow-sm"
          >
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
};
