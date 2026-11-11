import React, { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown } from 'lucide-react';
import {
  CustomRecurrenceConfig,
  CustomRepeatEndType,
  CustomRepeatUnit,
  DayScheduleEntry,
} from '../../types/calendar';
import {
  formatDateInput,
  makeDefaultCustomRecurrence,
  parseHhmmMinutes,
  parseLocalDateTime,
} from '../../utils/calendarMath';
import { AnimatePresence, motion } from 'framer-motion';
import {
  modalBackdropVariants,
  modalPanelVariants,
} from '../../motion/presets';

interface CustomRecurrenceModalProps {
  isOpen: boolean;
  startDateStr: string;
  /** Optional event end time ("HH:mm") used to prefill per-day end inputs. */
  endDateStr?: string;
  initialConfig?: CustomRecurrenceConfig;
  onCancel: () => void;
  onDone: (config: CustomRecurrenceConfig) => void;
}

const WEEKDAY_PILLS: { index: number; short: string; full: string }[] = [
  { index: 0, short: 'S', full: 'Sunday' },
  { index: 1, short: 'M', full: 'Monday' },
  { index: 2, short: 'T', full: 'Tuesday' },
  { index: 3, short: 'W', full: 'Wednesday' },
  { index: 4, short: 'T', full: 'Thursday' },
  { index: 5, short: 'F', full: 'Friday' },
  { index: 6, short: 'S', full: 'Saturday' },
];

const REPEAT_UNITS: CustomRepeatUnit[] = ['day', 'week', 'month', 'year'];

const UpTriangle: React.FC = () => (
  <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor" aria-hidden="true">
    <path d="M5 0.5L9.5 5.5H0.5L5 0.5Z" />
  </svg>
);

const DownTriangle: React.FC = () => (
  <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor" aria-hidden="true">
    <path d="M5 5.5L0.5 0.5H9.5L5 5.5Z" />
  </svg>
);

export const CustomRecurrenceModal: React.FC<CustomRecurrenceModalProps> = ({
  isOpen,
  startDateStr,
  endDateStr,
  initialConfig,
  onCancel,
  onDone,
}) => {
  const startDate = parseLocalDateTime(startDateStr);
  const startDayIso = formatDateInput(startDate);

  const [intervalText, setIntervalText] = useState('1');
  const [unit, setUnit] = useState<CustomRepeatUnit>('week');
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([startDate.getDay()]);
  const [endType, setEndType] = useState<CustomRepeatEndType>('never');
  const [endDate, setEndDate] = useState<string>('');
  const [occurrencesText, setOccurrencesText] = useState('13');

  // Per-day time overrides (only meaningful when unit === 'week' and >= 2 days selected)
  const [perDayTimesEnabled, setPerDayTimesEnabled] = useState(false);
  const [dayTimeInputs, setDayTimeInputs] = useState<Record<
    number,
    { start: string; end: string }
  >>({});
  const [dayScheduleError, setDayScheduleError] = useState<string | null>(null);

  const unitDropdownRef = useRef<HTMLDivElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const base = initialConfig ?? makeDefaultCustomRecurrence(startDate);
    setIntervalText(String(Math.max(1, base.interval || 1)));
    setUnit(base.unit || 'week');
    setDaysOfWeek(
      base.daysOfWeek && base.daysOfWeek.length > 0
        ? [...new Set(base.daysOfWeek)].sort((a, b) => a - b)
        : [startDate.getDay()]
    );
    setEndType(base.endType || 'never');
    const fallbackEnd = makeDefaultCustomRecurrence(startDate).endDate!;
    setEndDate(
      base.endDate && base.endDate >= startDayIso ? base.endDate : fallbackEnd
    );
    setOccurrencesText(String(Math.max(1, base.occurrences ?? 13)));

    // Load per-day schedule from the config being edited, if any.
    const defaultStart = (startDateStr.split('T')[1] ?? '09:00').slice(0, 5);
    const defaultEnd = (endDateStr?.split('T')[1] ?? defaultStart).slice(0, 5);

    const loadedSchedule: Record<number, { start: string; end: string }> = {};
    if (base.daySchedule && base.daySchedule.length > 0) {
      for (const entry of base.daySchedule) {
        const w = entry.weekday;
        const s = entry.start;
        const e = entry.end;
        if (
          typeof w === 'number' &&
          w >= 0 &&
          w <= 6 &&
          typeof s === 'string' &&
          typeof e === 'string' &&
          parseHhmmMinutes(s) !== null &&
          parseHhmmMinutes(e) !== null
        ) {
          loadedSchedule[w] = { start: s, end: e };
        }
      }
    }

    const hasMultiDaySchedule = Object.keys(loadedSchedule).length >= 2;
    setDayTimeInputs(loadedSchedule);
    setPerDayTimesEnabled(hasMultiDaySchedule);

    setUnitMenuOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialConfig, startDateStr, endDateStr]);

  // Keep per-day inputs aligned with the selected weekdays: seed defaults for
  // newly selected days and drop inputs for deselected days.
  useEffect(() => {
    const defaultStart = (startDateStr.split('T')[1] ?? '09:00').slice(0, 5);
    const defaultEnd = (endDateStr?.split('T')[1] ?? defaultStart).slice(0, 5);
    setDayTimeInputs((prev) => {
      const next: Record<number, { start: string; end: string }> = {};
      for (const dow of daysOfWeek) {
        next[dow] = prev[dow] ?? { start: defaultStart, end: defaultEnd };
      }
      return next;
    });
  }, [daysOfWeek, startDateStr, endDateStr]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (unitMenuOpen) setUnitMenuOpen(false);
        else onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onCancel, unitMenuOpen]);

  useEffect(() => {
    if (!unitMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        unitDropdownRef.current &&
        !unitDropdownRef.current.contains(e.target as Node)
      ) {
        setUnitMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [unitMenuOpen]);

  const parsedInterval = Math.max(1, Math.min(999, parseInt(intervalText, 10) || 1));
  const parsedOccurrences = Math.max(
    1,
    Math.min(999, parseInt(occurrencesText, 10) || 1)
  );

  const stepInterval = (delta: number) => {
    const next = Math.max(1, Math.min(999, parsedInterval + delta));
    setIntervalText(String(next));
  };

  const stepOccurrences = (delta: number) => {
    setEndType('after');
    const next = Math.max(1, Math.min(999, parsedOccurrences + delta));
    setOccurrencesText(String(next));
  };

  const toggleDayOfWeek = (dayIndex: number) => {
    setDaysOfWeek((prev) => {
      if (prev.includes(dayIndex)) {
        if (prev.length === 1) {
          // Keep at least one day active (snap back to event start weekday if different)
          const fallback = startDate.getDay();
          return fallback !== dayIndex ? [fallback] : prev;
        }
        return prev.filter((d) => d !== dayIndex);
      }
      return [...prev, dayIndex].sort((a, b) => a - b);
    });
  };

  const handleConfirm = () => {
    setDayScheduleError(null);

    let daySchedule: DayScheduleEntry[] | undefined;
    if (
      perDayTimesEnabled &&
      unit === 'week' &&
      daysOfWeek.length >= 2
    ) {
      daySchedule = [];
      for (const dow of daysOfWeek) {
        const current = dayTimeInputs[dow];
        if (!current) continue;
        const startMins = parseHhmmMinutes(current.start);
        const endMins = parseHhmmMinutes(current.end);
        if (startMins === null || endMins === null) {
          setDayScheduleError(
            'Please enter a valid start and end time for each selected day.'
          );
          return;
        }
        if (endMins <= startMins) {
          setDayScheduleError(
            'End time must be after start time for each day.'
          );
          return;
        }
        daySchedule.push({
          weekday: dow,
          start: current.start,
          end: current.end,
        });
      }
      if (daySchedule.length === 0) daySchedule = undefined;
    }

    onDone({
      interval: parsedInterval,
      unit,
      daysOfWeek: unit === 'week' ? daysOfWeek : undefined,
      daySchedule,
      endType,
      endDate,
      occurrences: parsedOccurrences,
    });
  };

  const formattedEndDate = endDate
    ? format(parseLocalDateTime(endDate), 'MMM d, yyyy')
    : format(startDate, 'MMM d, yyyy');

  const formatUnitLabel = (u: CustomRepeatUnit) =>
    parsedInterval === 1 ? u : `${u}s`;

  const renderRadioDot = (selected: boolean) => (
    <span
      style={
        selected
          ? { borderColor: 'var(--t-accent)' }
          : undefined
      }
      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
        selected
          ? ''
          : 'border-theme-text-muted group-hover/radio:border-theme-text'
      }`}
    >
      {selected && (
        <span
          style={{ backgroundColor: 'var(--t-accent)' }}
          className="w-2.5 h-2.5 rounded-full"
        />
      )}
    </span>
  );

  return (
    <AnimatePresence>
      {isOpen && (
    <motion.div
      key="custom-recurrence-backdrop"
      variants={modalBackdropVariants}
      initial="enter"
      animate="center"
      exit="exit"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/55 backdrop-blur-md"
      onClick={onCancel}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-recurrence-title"
        variants={modalPanelVariants}
        initial="enter"
        animate="center"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="w-[min(92vw,390px)] rounded-[28px] border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg p-6 sm:p-7 select-none gpu-layer"
      >
        {/* Title */}
        <h3
          id="custom-recurrence-title"
          style={{ fontFamily: 'var(--t-font-display)' }}
          className="gothic-display text-xl sm:text-[22px] font-semibold tracking-tight text-theme-text"
        >
          Custom recurrence
        </h3>

        {/* Row 1: Repeat every [1] ▲/▼ [week ▼] */}
        <div className="mt-6 flex items-center gap-2.5">
          <span className="text-sm font-medium text-theme-text-secondary shrink-0 mr-1">
            Repeat every
          </span>

          <input
            type="text"
            inputMode="numeric"
            aria-label="Repeat interval"
            value={intervalText}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
              setIntervalText(digits);
            }}
            onBlur={() => setIntervalText(String(parsedInterval))}
            className="w-16 h-11 rounded-lg bg-theme-elevated border border-theme-border text-center text-sm font-semibold text-theme-text tabular-nums focus:outline-none focus:border-theme-border-strong transition-colors"
          />

          {/* Stepper triangles */}
          <div className="flex flex-col items-center justify-center gap-1 px-0.5">
            <button
              type="button"
              onClick={() => stepInterval(1)}
              className="p-1 rounded text-theme-text-secondary hover:text-theme-text hover:bg-theme-cell-hover transition-colors"
              aria-label="Increase repeat interval"
            >
              <UpTriangle />
            </button>
            <button
              type="button"
              onClick={() => stepInterval(-1)}
              className="p-1 rounded text-theme-text-secondary hover:text-theme-text hover:bg-theme-cell-hover transition-colors"
              aria-label="Decrease repeat interval"
            >
              <DownTriangle />
            </button>
          </div>

          {/* Themed Unit Dropdown */}
          <div ref={unitDropdownRef} className="relative flex-1 min-w-[108px]">
            <button
              type="button"
              onClick={() => setUnitMenuOpen((o) => !o)}
              className="w-full h-11 rounded-lg bg-theme-elevated border border-theme-border hover:border-theme-border-strong px-3.5 flex items-center justify-between text-sm font-medium text-theme-text transition-colors"
              aria-haspopup="listbox"
              aria-expanded={unitMenuOpen}
            >
              <span>{formatUnitLabel(unit)}</span>
              <ChevronDown
                className={`w-4 h-4 text-theme-text-secondary transition-transform ${
                  unitMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {unitMenuOpen && (
              <div
                role="listbox"
                className="absolute left-0 right-0 top-full mt-1.5 z-20 rounded-xl border border-theme-border bg-theme-surface shadow-theme-lg py-1 overflow-hidden"
              >
                {REPEAT_UNITS.map((u) => {
                  const active = unit === u;
                  return (
                    <button
                      key={u}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setUnit(u);
                        setUnitMenuOpen(false);
                      }}
                      className={`w-full px-3.5 py-2 text-left text-sm font-medium transition-colors ${
                        active
                          ? 'bg-theme-accent-soft text-theme-accent font-bold'
                          : 'text-theme-text hover:bg-theme-cell-hover'
                      }`}
                    >
                      {formatUnitLabel(u)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Repeat on (S M T W T F S) — shown when unit === 'week' */}
        {unit === 'week' && (
          <div className="mt-6">
            <div className="text-sm font-medium text-theme-text-secondary mb-3.5">
              Repeat on
            </div>

            <div className="flex items-center justify-between gap-1.5">
              {WEEKDAY_PILLS.map((d) => {
                const selected = daysOfWeek.includes(d.index);
                return (
                  <button
                    key={d.index}
                    type="button"
                    aria-label={d.full}
                    aria-pressed={selected}
                    onClick={() => toggleDayOfWeek(d.index)}
                    style={
                      selected
                        ? {
                            backgroundColor: 'var(--t-accent)',
                            color: 'var(--t-accent-contrast)',
                          }
                        : undefined
                    }
                    className={`w-9 h-9 rounded-full text-xs flex items-center justify-center transition-all ${
                      selected
                        ? 'font-bold shadow-sm scale-[1.04]'
                        : 'font-semibold bg-theme-elevated border border-theme-border text-theme-text-secondary hover:bg-theme-cell-hover hover:text-theme-text'
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>

            {/* Per-day start/end overrides when two or more weekdays are selected */}
            {daysOfWeek.length >= 2 && (
              <div className="mt-5">
                <div
                  role="checkbox"
                  aria-checked={perDayTimesEnabled}
                  tabIndex={0}
                  onClick={() => setPerDayTimesEnabled((p) => !p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setPerDayTimesEnabled((p) => !p);
                    }
                  }}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <span
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      perDayTimesEnabled
                        ? 'border-theme-accent bg-theme-accent text-theme-accent-contrast'
                        : 'border-theme-text-muted'
                    }`}
                  >
                    {perDayTimesEnabled && (
                      <span
                        style={{ backgroundColor: 'var(--t-accent-contrast)' }}
                        className="w-2.5 h-2.5 rounded-full"
                      />
                    )}
                  </span>
                  <span className="text-sm font-medium text-theme-text">
                    Set different times per day
                  </span>
                </div>

                {perDayTimesEnabled && (
                  <div className="mt-3 space-y-2">
                    {daysOfWeek.map((dow) => {
                      const day = WEEKDAY_PILLS.find((d) => d.index === dow);
                      const current =
                        dayTimeInputs[dow] ?? {
                          start: (startDateStr.split('T')[1] ?? '09:00').slice(
                            0,
                            5
                          ),
                          end: (endDateStr?.split('T')[1] ?? '09:00').slice(
                            0,
                            5
                          ),
                        };
                      return (
                        <div key={dow} className="flex items-center gap-2">
                          <span
                            className="w-20 shrink-0 text-sm text-theme-text-secondary"
                          >
                            {day?.full}
                          </span>
                          <input
                            type="time"
                            value={current.start}
                            onChange={(e) =>
                              setDayTimeInputs((prev) => ({
                                ...prev,
                                [dow]: { ...prev[dow], start: e.target.value },
                              }))
                            }
                            className="w-20 rounded-lg border border-theme-border bg-theme-surface px-2 py-1.5 text-xs text-theme-text focus:outline-none focus:border-theme-border-strong"
                          />
                          <span className="text-theme-text-muted px-1">
                            –
                          </span>
                          <input
                            type="time"
                            value={current.end}
                            onChange={(e) =>
                              setDayTimeInputs((prev) => ({
                                ...prev,
                                [dow]: { ...prev[dow], end: e.target.value },
                              }))
                            }
                            className="w-20 rounded-lg border border-theme-border bg-theme-surface px-2 py-1.5 text-xs text-theme-text focus:outline-none focus:border-theme-border-strong"
                          />
                        </div>
                      );
                    })}
                    {dayScheduleError && (
                      <p className="text-xs font-semibold text-rose-500">
                        {dayScheduleError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Section 3: Ends (Never / On [Date] / After [13 occurrences] ▲/▼) */}
        <div className="mt-6">
          <div className="text-sm font-medium text-theme-text-secondary mb-3.5">
            Ends
          </div>

          <div className="space-y-3.5">
            {/* Option 1: Never */}
            <button
              type="button"
              onClick={() => setEndType('never')}
              className="group/radio w-full flex items-center gap-3.5 py-1 text-left"
            >
              {renderRadioDot(endType === 'never')}
              <span className="text-sm font-medium text-theme-text">Never</span>
            </button>

            {/* Option 2: On [Jan 26, 2027] */}
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                onClick={() => {
                  setEndType('on');
                }}
                className="group/radio flex items-center gap-3.5 py-1 text-left w-24 shrink-0"
              >
                {renderRadioDot(endType === 'on')}
                <span className="text-sm font-medium text-theme-text">On</span>
              </button>

              <div
                onClick={() => {
                  setEndType('on');
                  try {
                    (
                      dateInputRef.current as HTMLInputElement & {
                        showPicker?: () => void;
                      }
                    )?.showPicker?.();
                  } catch {
                    // Fallback to native input click
                  }
                }}
                className={`relative h-11 min-w-[146px] px-4 rounded-lg bg-theme-elevated border flex items-center text-sm font-medium tabular-nums cursor-pointer transition-all ${
                  endType === 'on'
                    ? 'border-theme-border-strong text-theme-text opacity-100'
                    : 'border-theme-border text-theme-text-secondary opacity-55 hover:opacity-85'
                }`}
              >
                <span>{formattedEndDate}</span>
                <input
                  ref={dateInputRef}
                  type="date"
                  aria-label="End recurrence on date"
                  value={endDate}
                  min={startDayIso}
                  onFocus={() => setEndType('on')}
                  onChange={(e) => {
                    setEndType('on');
                    if (e.target.value) setEndDate(e.target.value);
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>

            {/* Option 3: After [13 occurrences] ▲/▼ */}
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                onClick={() => setEndType('after')}
                className="group/radio flex items-center gap-3.5 py-1 text-left w-24 shrink-0"
              >
                {renderRadioDot(endType === 'after')}
                <span className="text-sm font-medium text-theme-text">
                  After
                </span>
              </button>

              <div className="flex items-center gap-2">
                <div
                  onClick={() => setEndType('after')}
                  className={`h-11 px-3.5 rounded-lg bg-theme-elevated border flex items-center gap-2.5 transition-all cursor-text ${
                    endType === 'after'
                      ? 'border-theme-border-strong opacity-100'
                      : 'border-theme-border opacity-55 hover:opacity-85'
                  }`}
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Number of occurrences"
                    value={occurrencesText}
                    onFocus={() => setEndType('after')}
                    onChange={(e) => {
                      setEndType('after');
                      const digits = e.target.value
                        .replace(/[^0-9]/g, '')
                        .slice(0, 3);
                      setOccurrencesText(digits);
                    }}
                    onBlur={() =>
                      setOccurrencesText(String(parsedOccurrences))
                    }
                    className="w-9 bg-transparent text-center text-sm font-semibold text-theme-text tabular-nums focus:outline-none"
                  />
                  <span className="text-sm font-medium text-theme-text-secondary pr-0.5">
                    {parsedOccurrences === 1 ? 'occurrence' : 'occurrences'}
                  </span>
                </div>

                <div
                  className={`flex flex-col items-center justify-center gap-1 transition-opacity ${
                    endType === 'after' ? 'opacity-100' : 'opacity-55 hover:opacity-90'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => stepOccurrences(1)}
                    className="p-1 rounded text-theme-text-secondary hover:text-theme-text hover:bg-theme-cell-hover transition-colors"
                    aria-label="Increase occurrences"
                  >
                    <UpTriangle />
                  </button>
                  <button
                    type="button"
                    onClick={() => stepOccurrences(-1)}
                    className="p-1 rounded text-theme-text-secondary hover:text-theme-text hover:bg-theme-cell-hover transition-colors"
                    aria-label="Decrease occurrences"
                  >
                    <DownTriangle />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Buttons: Cancel & Done */}
        <div className="mt-8 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-full text-sm font-semibold text-theme-accent hover:bg-theme-accent-soft transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              backgroundColor: 'var(--t-accent)',
              color: 'var(--t-accent-contrast)',
            }}
            className="px-6 py-2.5 rounded-full text-sm font-bold shadow-sm hover:opacity-95 active:scale-[0.98] transition-all"
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
