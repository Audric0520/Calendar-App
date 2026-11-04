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

interface SidebarProps {
  isOpen: boolean;
  isMobileDrawerOpen: boolean;
  currentDate: Date;
  selectedDate: Date;
  occurrences: EventOccurrence[];
  categories: CategoryMeta[];
  visibleCategories: EventCategory[];
  themePrefs: ThemePreferences;
  onCloseMobileDrawer: () => void;
  onCreateEvent: () => void;
  onSelectMiniDate: (date: Date) => void;
  onToggleCategory: (cat: EventCategory) => void;
  onAddCustomCategory: (label: string, color: string) => CategoryTag;
  onDeleteCustomCategory: (id: string) => void;
  onSetGlobalTheme: (theme: ThemeId) => void;
  onOpenThemeStudio: () => void;
  onApplySplitWeekDemo: () => void;
}

const MINI_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  isMobileDrawerOpen,
  currentDate,
  selectedDate,
  occurrences,
  categories,
  visibleCategories,
  themePrefs,
  onCloseMobileDrawer,
  onCreateEvent,
  onSelectMiniDate,
  onToggleCategory,
  onAddCustomCategory,
  onDeleteCustomCategory,
  onSetGlobalTheme,
  onOpenThemeStudio,
  onApplySplitWeekDemo,
}) => {
  const [miniMonth, setMiniMonth] = useState<Date>(currentDate);
  const [miniCalendarCollapsed, setMiniCalendarCollapsed] = useState(false);
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);

  // Sidebar quick add tag state
  const [addingTag, setAddingTag] = useState(false);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#f43f5e');
  const [tagErr, setTagErr] = useState<string | null>(null);

  useEffect(() => {
    setMiniMonth(currentDate);
  }, [currentDate]);

  const miniWeeks = useMemo(() => getMonthWeeks(miniMonth), [miniMonth]);

  const handleSidebarCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tagName.trim();
    if (!trimmed) {
      setTagErr('Enter a tag name');
      return;
    }
    if (
      categories.some((c) => c.label.toLowerCase() === trimmed.toLowerCase())
    ) {
      setTagErr('Tag already exists');
      return;
    }
    onAddCustomCategory(trimmed, tagColor);
    setTagName('');
    setTagErr(null);
    setAddingTag(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-theme-surface text-theme-text select-none">
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
        <section className="rounded-2xl border border-theme-border bg-theme-elevated/60 p-3">
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
        <section className="rounded-2xl border border-theme-border bg-theme-elevated/60 p-3 space-y-2.5">
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

        {/* Category / Color Tag Filters + Add New Tag */}
        <section className="rounded-2xl border border-theme-border bg-theme-elevated/60 p-3 space-y-2.5">
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

            <button
              type="button"
              onClick={() => {
                setCategoriesCollapsed(false);
                setAddingTag((v) => !v);
                setTagErr(null);
              }}
              className="inline-flex items-center gap-0.5 rounded-lg px-2 py-0.5 text-[11px] font-bold text-theme-accent hover:bg-theme-accent-soft transition-colors"
              title="Create a new custom tag & choose its color"
            >
              <Plus className="w-3.5 h-3.5" />
              New Tag
            </button>
          </div>

          {!categoriesCollapsed && (
            <>
              <div className="space-y-1">
                {categories.map((cat) => {
                  const checked = visibleCategories.includes(cat.id);
                  return (
                    <div
                      key={cat.id}
                      className="group/sidecat flex items-center gap-1 rounded-xl hover:bg-theme-cell-hover pr-1 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleCategory(cat.id)}
                        className="flex-1 flex items-center gap-2.5 px-2 py-1.5 text-left text-xs font-semibold text-theme-text-secondary min-w-0"
                      >
                        <span
                          style={{
                            backgroundColor: checked ? cat.color : 'transparent',
                            borderColor: cat.color,
                          }}
                          className="w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors"
                        >
                          {checked && (
                            <Check
                              style={{ color: cat.textOnSolid }}
                              className="w-3 h-3 stroke-[3]"
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
                          title={`Delete "${cat.label}"`}
                          aria-label={`Delete ${cat.label}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {addingTag && (
                <form
                  onSubmit={handleSidebarCreateTag}
                  className="rounded-xl border border-theme-border bg-theme-surface p-2.5 space-y-2.5"
                >
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
                    className="w-full rounded-lg border border-theme-border bg-theme-elevated px-2.5 py-1.5 text-xs font-semibold text-theme-text placeholder:text-theme-text-muted/65 focus:outline-none focus:border-theme-border-strong"
                  />

                  <div className="flex flex-wrap items-center gap-1.5">
                    {PRESET_TAG_SWATCHES.slice(0, 7).map((hex) => {
                      const active =
                        tagColor.toLowerCase() === hex.toLowerCase();
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
                      className="inline-flex items-center gap-1 rounded-md border border-theme-border bg-theme-elevated px-1.5 py-0.5 text-[10px] font-bold text-theme-text cursor-pointer ml-auto"
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
                    <p className="text-[10px] font-semibold text-rose-500">
                      {tagErr}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAddingTag(false);
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
            </>
          )}
        </section>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 border-r border-theme-border transition-all duration-300 overflow-hidden ${
          isOpen ? 'w-72' : 'w-0 border-r-0'
        }`}
      >
        <div className="w-72 h-full">{sidebarContent}</div>
      </aside>

      {/* Mobile / Tablet Responsive Drawer */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/55 backdrop-blur-sm"
            onClick={onCloseMobileDrawer}
          />
          <aside className="relative z-10 w-72 max-w-[86vw] h-full border-r border-theme-border shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
