import React, { useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  subMonths,
} from 'date-fns';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Palette,
  Pipette,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {
  CalendarScopeFilter,
  CategoryScope,
  CategoryTag,
  EventCategory,
  EventOccurrence,
  ThemeId,
  ThemePreferences,
} from '../../types/calendar';
import { getMonthWeeks, getOccurrencesForDay } from '../../utils/calendarMath';
import {
  CategoryMeta,
  PRESET_TAG_SWATCHES,
} from '../../constants/categories';
import { THEME_LIST } from '../../constants/themes';
import { ThemeOrnament } from '../calendar/ThemeOrnament';
import { AnimatePresence, motion } from 'framer-motion';
import {
  SPRING_SOFT,
  drawerBackdropVariants,
  drawerPanelVariants,
} from '../../motion/presets';

interface SidebarProps {
  isOpen: boolean;
  isMobileDrawerOpen: boolean;
  currentDate: Date;
  selectedDate: Date;
  occurrences: EventOccurrence[];
  /** Event-only tags (Class Sched / Class Events / Class Exams + custom). */
  eventCategories: CategoryMeta[];
  /** Task-only tags (Academic / Personal + custom). */
  taskCategories: CategoryMeta[];
  visibleCategories: EventCategory[];
  /** Which item types are drawn on the calendar at all. */
  visibleScopes: CategoryScope[];
  themePrefs: ThemePreferences;
  onCloseMobileDrawer: () => void;
  onCreateEvent: () => void;
  onSelectMiniDate: (date: Date) => void;
  onToggleCategory: (cat: EventCategory) => void;
  onToggleScope: (scope: CategoryScope) => void;
  onSetScopeFilter: (filter: CalendarScopeFilter) => void;
  onAddCustomCategory: (
    label: string,
    color: string,
    scope?: CategoryScope
  ) => CategoryTag;
  onDeleteCustomCategory: (id: string) => void;
  onSetGlobalTheme: (theme: ThemeId) => void;
  onOpenThemeStudio: () => void;
  onApplySplitWeekDemo: () => void;
}

const MINI_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface ScopeTagBlockProps {
  scope: CategoryScope;
  title: string;
  accent: string;
  tags: CategoryMeta[];
  /** Whether this item type is drawn on the calendar at all. */
  visible: boolean;
  /** Dim + disable tag rows when the whole type is hidden. */
  collapsed: boolean;
  visibleCategories: EventCategory[];
  addingTagFor: CategoryScope | null;
  tagName: string;
  tagColor: string;
  tagErr: string | null;
  onToggleScope: (scope: CategoryScope) => void;
  onToggleCategory: (cat: EventCategory) => void;
  onStartAddTag: (scope: CategoryScope) => void;
  onDeleteCustomCategory: (id: string) => void;
  setTagName: (v: string) => void;
  setTagColor: (v: string) => void;
  setTagErr: (v: string | null) => void;
  setAddingTagFor: (v: CategoryScope | null) => void;
  onSubmitTag: (e: React.FormEvent) => void;
}

/**
 * One item-type block (Events or Tasks) inside the sidebar filter panel.
 * The header checkbox is the master switch for that type; the rows below filter
 * individual tags of that type only.
 */
const ScopeTagBlock: React.FC<ScopeTagBlockProps> = ({
  scope,
  title,
  accent,
  tags,
  visible,
  collapsed,
  visibleCategories,
  addingTagFor,
  tagName,
  tagColor,
  tagErr,
  onToggleScope,
  onToggleCategory,
  onStartAddTag,
  onDeleteCustomCategory,
  setTagName,
  setTagColor,
  setTagErr,
  setAddingTagFor,
  onSubmitTag,
}) => {
  const isAdding = addingTagFor === scope;

  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface/70 overflow-hidden">
      {/* Master switch + new tag action */}
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <button
          type="button"
          onClick={() => onToggleScope(scope)}
          aria-pressed={visible}
          className="flex-1 flex items-center gap-2 px-1.5 py-1 rounded-lg text-left min-w-0 hover:bg-theme-cell-hover transition-colors"
          title={visible ? `Hide all ${title}` : `Show all ${title}`}
        >
          <span
            style={{
              backgroundColor: visible ? accent : 'transparent',
              borderColor: accent,
            }}
            className="w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors"
          >
            {visible && <Check className="w-3 h-3 text-white stroke-[3]" />}
          </span>
          <span className="text-xs font-extrabold text-theme-text truncate">
            {title}
          </span>
          <span className="ml-auto text-[10px] font-bold tabular-nums text-theme-text-muted shrink-0">
            {tags.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onStartAddTag(scope);
            setTagErr(null);
          }}
          className="inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[11px] font-bold text-theme-accent hover:bg-theme-accent-soft transition-colors shrink-0"
          title={`Create a new ${title.toLowerCase().replace(' tags', '')} tag`}
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      {/* Individual tags of this item type */}
      {!collapsed && (
        <div className="space-y-0.5 px-1.5 pb-1.5">
          {tags.map((cat) => {
            const checked = visibleCategories.includes(cat.id);
            return (
              <div
                key={cat.id}
                className="group/sidecat flex items-center gap-1 rounded-lg hover:bg-theme-cell-hover pr-1 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onToggleCategory(cat.id)}
                  className="flex-1 flex items-center gap-2.5 px-1.5 py-1 text-left text-xs font-semibold text-theme-text-secondary min-w-0"
                >
                  <span
                    style={{
                      backgroundColor: checked ? cat.color : 'transparent',
                      borderColor: cat.color,
                    }}
                    className="w-3.5 h-3.5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors"
                  >
                    {checked && (
                      <Check
                        style={{ color: cat.textOnSolid }}
                        className="w-2.5 h-2.5 stroke-[3]"
                      />
                    )}
                  </span>
                  <span
                    className={`truncate ${
                      checked ? 'text-theme-text' : 'opacity-60'
                    }`}
                  >
                    {cat.label}
                  </span>
                </button>

                {cat.isCustom && (
                  <button
                    type="button"
                    onClick={() => onDeleteCustomCategory(cat.id)}
                    className="opacity-0 group-hover/sidecat:opacity-100 focus:opacity-100 p-1 rounded-md text-theme-text-muted hover:text-rose-500 transition-opacity"
                    title={`Remove "${cat.label}"`}
                    aria-label={`Remove ${cat.label}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Inline creator — new tags are filed under this item type */}
      {isAdding && (
        <form
          onSubmit={onSubmitTag}
          className="border-t border-theme-border/70 bg-theme-elevated/70 p-2.5 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold text-theme-text">
              New {scope === 'task' ? 'Task' : 'Event'} Tag
            </span>
            <span className="text-[10px] font-semibold text-theme-text-muted">
              {title}
            </span>
          </div>

          <input
            type="text"
            value={tagName}
            onChange={(e) => {
              setTagErr(null);
              setTagName(e.target.value);
            }}
            placeholder="New tag name..."
            maxLength={28}
            autoFocus
            className="w-full rounded-lg border border-theme-border bg-theme-surface px-2.5 py-1.5 text-xs font-semibold text-theme-text placeholder:text-theme-text-muted/65 focus:outline-none focus:border-theme-border-strong"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            {PRESET_TAG_SWATCHES.slice(0, 7).map((hex) => {
              const active = tagColor.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setTagColor(hex)}
                  style={{ backgroundColor: hex }}
                  className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    active ? 'ring-2 ring-offset-1 ring-theme-text' : ''
                  }`}
                  title={hex}
                />
              );
            })}

            <label
              className="inline-flex items-center gap-1 rounded-md border border-theme-border bg-theme-surface px-1.5 py-0.5 text-[10px] font-bold text-theme-text cursor-pointer ml-auto"
              title="Custom color picker"
            >
              <Pipette className="w-3 h-3 text-theme-accent" />
              <input
                type="color"
                value={tagColor}
                onChange={(e) => setTagColor(e.target.value)}
                className="w-4 h-4 rounded cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
          </div>

          {tagErr && (
            <p className="text-[10px] font-semibold text-rose-500">{tagErr}</p>
          )}

          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setAddingTagFor(null);
                setTagErr(null);
              }}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-theme-text-muted hover:bg-theme-cell-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                backgroundColor: 'var(--t-accent)',
                color: 'var(--t-accent-contrast)',
              }}
              className="rounded-lg px-2.5 py-1 text-[11px] font-bold shadow-sm"
            >
              Add Tag
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  isMobileDrawerOpen,
  currentDate,
  selectedDate,
  occurrences,
  eventCategories,
  taskCategories,
  visibleCategories,
  visibleScopes,
  themePrefs,
  onCloseMobileDrawer,
  onCreateEvent,
  onSelectMiniDate,
  onToggleCategory,
  onToggleScope,
  onSetScopeFilter,
  onAddCustomCategory,
  onDeleteCustomCategory,
  onSetGlobalTheme,
  onOpenThemeStudio,
  onApplySplitWeekDemo,
}) => {
  const [miniMonth, setMiniMonth] = useState<Date>(currentDate);
  const [miniCalendarCollapsed, setMiniCalendarCollapsed] = useState(false);
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);

  // Sidebar quick add tag state (tags are created for one item type at a time)
  const [addingTagFor, setAddingTagFor] = useState<CategoryScope | null>(null);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#f43f5e');
  const [tagErr, setTagErr] = useState<string | null>(null);

  const scopeFilter: CalendarScopeFilter =
    visibleScopes.length === 2
      ? 'both'
      : visibleScopes.includes('task')
        ? 'tasks'
        : 'events';

  useEffect(() => {
    setMiniMonth(currentDate);
  }, [currentDate]);

  const miniWeeks = useMemo(() => getMonthWeeks(miniMonth), [miniMonth]);

  const handleSidebarCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    const scope: CategoryScope = addingTagFor ?? 'event';
    const trimmed = tagName.trim();
    if (!trimmed) {
      setTagErr('Enter a tag name');
      return;
    }
    // Duplicates only matter inside the same item type
    const scopeTags =
      scope === 'event' ? eventCategories : taskCategories;
    if (
      scopeTags.some((c) => c.label.toLowerCase() === trimmed.toLowerCase())
    ) {
      setTagErr('Tag already exists');
      return;
    }
    onAddCustomCategory(trimmed, tagColor, scope);
    setTagName('');
    setTagErr(null);
    setAddingTagFor(null);
  };

  const sidebarContent = (
    <div className="sidebar-shell flex flex-col h-full bg-theme-surface text-theme-text select-none">
      {/* Create Button + Mobile Close */}
      <div className="p-4 flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            onCreateEvent();
            onCloseMobileDrawer();
          }}
          style={{
            backgroundColor: 'var(--t-accent)',
            color: 'var(--t-accent-contrast)',
          }}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold shadow-theme hover:opacity-95 active:scale-[0.99] transition-all"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>Create Event</span>
        </button>

        <button
          type="button"
          onClick={onCloseMobileDrawer}
          className="lg:hidden p-2 rounded-xl border border-theme-border text-theme-text-secondary hover:bg-theme-cell-hover"
          aria-label="Close drawer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto themed-scroll px-4 pb-5 space-y-5">
        {/* Collapsible Mini-Month Date Picker */}
        <section className="gothic-panel rounded-2xl border border-theme-border bg-theme-elevated/60 p-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMiniCalendarCollapsed((c) => !c)}
              className="inline-flex items-center gap-1.5 text-xs font-extrabold text-theme-text hover:text-theme-accent transition-colors"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  miniCalendarCollapsed ? '-rotate-90' : ''
                }`}
              />
              <span>{format(miniMonth, 'MMMM yyyy')}</span>
            </button>

            {!miniCalendarCollapsed && (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setMiniMonth((m) => subMonths(m, 1))}
                  className="p-1 rounded-lg text-theme-text-secondary hover:bg-theme-cell-hover"
                  aria-label="Previous mini month"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setMiniMonth((m) => addMonths(m, 1))}
                  className="p-1 rounded-lg text-theme-text-secondary hover:bg-theme-cell-hover"
                  aria-label="Next mini month"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {!miniCalendarCollapsed && (
            <div className="mt-2.5">
              <div className="grid grid-cols-7 mb-1">
                {MINI_DAYS.map((d, idx) => (
                  <div
                    key={idx}
                    className="text-center text-[10px] font-bold text-theme-text-muted py-0.5"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="space-y-0.5">
                {miniWeeks.map((week, wIdx) => (
                  <div key={wIdx} className="grid grid-cols-7 gap-0.5">
                    {week.map((day) => {
                      const inMonth = isSameMonth(day, miniMonth);
                      const todayFlag = isToday(day);
                      const selectedFlag = isSameDay(day, selectedDate);
                      const hasEvents =
                        getOccurrencesForDay(occurrences, day).length > 0;

                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          onClick={() => {
                            onSelectMiniDate(day);
                            onCloseMobileDrawer();
                          }}
                          style={
                            todayFlag
                              ? {
                                  backgroundColor: 'var(--t-accent)',
                                  color: 'var(--t-accent-contrast)',
                                }
                              : undefined
                          }
                          className={`relative h-7 w-7 mx-auto rounded-full flex flex-col items-center justify-center text-[11px] font-semibold tabular-nums transition-all ${
                            todayFlag
                              ? 'font-extrabold shadow-sm'
                              : selectedFlag
                              ? 'bg-theme-accent-soft text-theme-accent font-extrabold ring-1 ring-theme-accent'
                              : inMonth
                              ? 'text-theme-text hover:bg-theme-cell-hover'
                              : 'text-theme-text-muted/55 hover:bg-theme-cell-hover'
                          }`}
                        >
                          <span>{format(day, 'd')}</span>
                          {hasEvents && !todayFlag && (
                            <span
                              style={{ backgroundColor: 'var(--t-accent)' }}
                              className="w-1 h-1 rounded-full absolute bottom-0.5"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Quick Multi-Theme Engine Controls */}
        <section className="gothic-panel rounded-2xl border border-theme-border bg-theme-elevated/60 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-theme-text">
              <Palette className="w-3.5 h-3.5 text-theme-accent" />
              Theme Palettes
            </span>
            <button
              type="button"
              onClick={() => {
                onOpenThemeStudio();
                onCloseMobileDrawer();
              }}
              className="text-[11px] font-bold text-theme-accent hover:underline"
            >
              Per-Week / Month
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {THEME_LIST.map((t) => {
              const active = themePrefs.globalTheme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSetGlobalTheme(t.id)}
                  className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-left text-[11px] font-bold transition-all ${
                    active
                      ? 'border-theme-accent bg-theme-accent-soft text-theme-text ring-1 ring-theme-accent/40'
                      : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-cell-hover'
                  }`}
                  title={t.description}
                >
                  <ThemeOrnament theme={t.id} size={13} />
                  <span className="truncate">{t.shortName}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              onApplySplitWeekDemo();
              onCloseMobileDrawer();
            }}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-theme-border-strong/50 bg-theme-surface hover:bg-theme-cell-hover px-3 py-2 text-[11px] font-bold text-theme-text transition-colors"
          >
            <Wand2 className="w-3.5 h-3.5 text-theme-accent" />
            Demo Multi-Theme Weeks
          </button>
        </section>

        {/* Calendar Filters — Events and Tasks are listed separately so the
            user can untick entire item types or individual tags */}
        <section className="gothic-panel rounded-2xl border border-theme-border bg-theme-elevated/60 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCategoriesCollapsed((c) => !c)}
              className="inline-flex items-center gap-1.5 text-xs font-extrabold text-theme-text hover:text-theme-accent transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-theme-accent" />
              <span>Category Tags</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-theme-text-muted transition-transform ${
                  categoriesCollapsed ? '-rotate-90' : ''
                }`}
              />
            </button>
          </div>

          {!categoriesCollapsed && (
            <>
              {/* Master switches: show events and/or tasks */}
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-theme-border bg-theme-surface p-0.5">
                {(
                  [
                    { id: 'both', label: 'Both' },
                    { id: 'events', label: 'Events' },
                    { id: 'tasks', label: 'Tasks' },
                  ] as { id: CalendarScopeFilter; label: string }[]
                ).map((opt) => {
                  const active = scopeFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSetScopeFilter(opt.id)}
                      aria-pressed={active}
                      style={
                        active
                          ? {
                              backgroundColor: 'var(--t-accent)',
                              color: 'var(--t-accent-contrast)',
                            }
                          : undefined
                      }
                      className={`rounded-lg px-1.5 py-1 text-[11px] font-bold transition-colors ${
                        active
                          ? 'shadow-sm'
                          : 'text-theme-text-secondary hover:text-theme-text hover:bg-theme-cell-hover'
                      }`}
                      title={
                        opt.id === 'both'
                          ? 'Show events and tasks'
                          : opt.id === 'events'
                            ? 'Show events only'
                            : 'Show tasks only'
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* EVENT tag block */}
              <ScopeTagBlock
                scope="event"
                title="Event Tags"
                accent="#8b5cf6"
                tags={eventCategories}
                visible={visibleScopes.includes('event')}
                visibleCategories={visibleCategories}
                collapsed={!visibleScopes.includes('event')}
                addingTagFor={addingTagFor}
                tagName={tagName}
                tagColor={tagColor}
                tagErr={tagErr}
                onToggleScope={onToggleScope}
                onToggleCategory={onToggleCategory}
                onStartAddTag={(scope) => {
                  setAddingTagFor((prev) => (prev === scope ? null : scope));
                  setTagErr(null);
                }}
                onDeleteCustomCategory={onDeleteCustomCategory}
                setTagName={setTagName}
                setTagColor={setTagColor}
                setTagErr={setTagErr}
                setAddingTagFor={setAddingTagFor}
                onSubmitTag={handleSidebarCreateTag}
              />

              {/* TASK tag block */}
              <ScopeTagBlock
                scope="task"
                title="Task Tags"
                accent="#2563eb"
                tags={taskCategories}
                visible={visibleScopes.includes('task')}
                visibleCategories={visibleCategories}
                collapsed={!visibleScopes.includes('task')}
                addingTagFor={addingTagFor}
                tagName={tagName}
                tagColor={tagColor}
                tagErr={tagErr}
                onToggleScope={onToggleScope}
                onToggleCategory={onToggleCategory}
                onStartAddTag={(scope) => {
                  setAddingTagFor((prev) => (prev === scope ? null : scope));
                  setTagErr(null);
                }}
                onDeleteCustomCategory={onDeleteCustomCategory}
                setTagName={setTagName}
                setTagColor={setTagColor}
                setTagErr={setTagErr}
                setAddingTagFor={setAddingTagFor}
                onSubmitTag={handleSidebarCreateTag}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Collapsible Sidebar — spring-eased width with a transform-only
          inner track so the content glides instead of reflowing */}
      <motion.aside
        initial={false}
        animate={{ width: isOpen ? 288 : 0 }}
        transition={SPRING_SOFT}
        className="hidden lg:block shrink-0 overflow-hidden border-r border-theme-border gpu-layer"
      >
        <motion.div
          initial={false}
          animate={{ x: isOpen ? 0 : -24, opacity: isOpen ? 1 : 0 }}
          transition={SPRING_SOFT}
          className="w-72 h-full"
        >
          {sidebarContent}
        </motion.div>
      </motion.aside>

      {/* Mobile / Tablet Responsive Drawer */}
      <AnimatePresence>
        {isMobileDrawerOpen && (
          <motion.div
            key="mobile-drawer"
            className="fixed inset-0 z-50 lg:hidden flex"
            initial="enter"
            animate="center"
            exit="exit"
          >
            <motion.div
              variants={drawerBackdropVariants}
              className="fixed inset-0 bg-black/55 backdrop-blur-md"
              onClick={onCloseMobileDrawer}
            />
            <motion.aside
              variants={drawerPanelVariants}
              className="relative z-10 w-72 max-w-[86vw] h-full border-r border-theme-border shadow-2xl gpu-layer"
            >
              {sidebarContent}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
