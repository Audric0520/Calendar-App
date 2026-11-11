import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import {
  AlignLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ImagePlus,
  Link2,
  MapPin,
  Paperclip,
  Pipette,
  Plus,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  CategoryTag,
  CustomRecurrenceConfig,
  EventCategory,
  CategoryScope,
  EventDraft,
  RecurrenceRule,
} from '../../types/calendar';
import {
  buildCategoryMeta,
  CategoryMeta,
  PRESET_TAG_SWATCHES,
  resolveCategoryMeta,
} from '../../constants/categories';
import { processUploadedImageFile } from '../../utils/imageHelper';
import {
  formatDateInput,
  formatRecurrenceSummary,
  parseLocalDateTime,
} from '../../utils/calendarMath';
import { CustomRecurrenceModal } from './CustomRecurrenceModal';
import { AnimatePresence, motion } from 'framer-motion';
import {
  modalBackdropVariants,
  modalPanelVariants,
  popoverVariants,
} from '../../motion/presets';
import { SkeletonImage } from '../../motion/SkeletonImage';

interface EventFormModalProps {
  isOpen: boolean;
  initialDraft: EventDraft;
  /** Tags available when composing an Event. */
  eventCategories: CategoryMeta[];
  /** Tags available when composing a Task (Academic / Personal + custom). */
  taskCategories: CategoryMeta[];
  onAddCustomCategory: (
    label: string,
    color: string,
    scope?: CategoryScope
  ) => CategoryTag;
  onDeleteCustomCategory: (id: string) => void;
  onClose: () => void;
  onSave: (draft: EventDraft) => void;
  onDelete?: (id: string) => void;
}

type ActiveSchedulePicker = 'date' | 'startTime' | 'endTime' | 'repeat' | null;

const MINI_WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getMinutesFromDate(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function minutesToHHmm(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, mins));
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mm = String(clamped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatMinutes12h(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, mins));
  const h24 = Math.floor(clamped / 60);
  const mm = clamped % 60;
  const suffix = h24 >= 12 ? 'pm' : 'am';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, '0')}${suffix}`;
}

export interface ParsedTypedTime {
  minutes: number;
  /** True when the user explicitly wrote a 2-digit minute (e.g. "8:07", "1130") */
  hasExplicitTwoDigitMinutes: boolean;
}

/**
 * Parses live or committed user input in the Start / End time chips.
 *
 * Supports:
 * - Bare hours ("8" -> 8:00am, "3" -> 3:00pm, "12" -> 12:00pm) using Google
 *   Calendar's daytime heuristic (7..11 -> AM, 12 & 1..6 -> PM)
 * - Partial colon inputs ("11:" -> 11:00, "11:3" -> 11:30, "8:1" -> 8:10)
 * - Full colon inputs ("8:15", "8:05am", "3:30pm", "15:45", "03:00")
 * - Compact 3/4-digit inputs ("830" -> 8:30am, "130" -> 1:30pm, "1130" -> 11:30am)
 * - End-time context promotion: when no explicit am/pm is typed and the daytime
 *   candidate falls at or before `startMinutes`, shifts +12h into PM when valid.
 */
export function parseTypedTimeInput(
  raw: string,
  context: { isEndTime: boolean; startMinutes: number } = {
    isEndTime: false,
    startMinutes: 0,
  }
): ParsedTypedTime | null {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;

  let rawHourStr: string;
  let minutes = 0;
  let hasExplicitTwoDigitMinutes = false;
  let meridiem: string | undefined;

  const colonMatch = cleaned.match(
    /^(\d{1,2})(?::(\d{0,2}))?\s*(a|am|p|pm)?$/
  );

  if (colonMatch) {
    rawHourStr = colonMatch[1];
    const minStr = colonMatch[2];
    meridiem = colonMatch[3];

    if (minStr !== undefined && minStr.length > 0) {
      if (minStr.length === 1) {
        const d = Number(minStr);
        minutes = d <= 5 ? d * 10 : d;
      } else {
        minutes = Number(minStr);
        hasExplicitTwoDigitMinutes = true;
      }
    }
  } else {
    const compactMatch = cleaned.match(/^(\d{3,4})\s*(a|am|p|pm)?$/);
    if (!compactMatch) return null;
    const digits = compactMatch[1];
    meridiem = compactMatch[2];
    rawHourStr = digits.slice(0, digits.length - 2);
    minutes = Number(digits.slice(-2));
    hasExplicitTwoDigitMinutes = true;
  }

  let hours = Number(rawHourStr);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    const isPm = meridiem.startsWith('p');
    if (hours === 12) {
      hours = isPm ? 12 : 0;
    } else if (isPm) {
      hours += 12;
    }
    return {
      minutes: hours * 60 + minutes,
      hasExplicitTwoDigitMinutes,
    };
  }

  if (hours < 0 || hours > 23) return null;

  // Explicit 24-hour forms: 0 ("0", "00"), leading zero ("01".."09"), or 13..23
  const hasLeadingZero = rawHourStr.length === 2 && rawHourStr.startsWith('0');
  if (hours === 0 || hasLeadingZero || hours >= 13) {
    return {
      minutes: hours * 60 + minutes,
      hasExplicitTwoDigitMinutes,
    };
  }

  // Ambiguous 1..12 without am/pm: 7..11 -> AM, 12 & 1..6 -> PM
  let h24: number;
  if (hours === 12) {
    h24 = 12;
  } else if (hours >= 7 && hours <= 11) {
    h24 = hours;
  } else {
    h24 = hours + 12;
  }

  let resolvedMins = h24 * 60 + minutes;

  if (context.isEndTime) {
    if (hours >= 1 && hours <= 6 && context.startMinutes < 7 * 60) {
      const amCandidate = hours * 60 + minutes;
      if (amCandidate > context.startMinutes) {
        resolvedMins = amCandidate;
      }
    }

    if (resolvedMins <= context.startMinutes) {
      const shiftedPm = resolvedMins + 12 * 60;
      if (shiftedPm > context.startMinutes && shiftedPm < 24 * 60) {
        resolvedMins = shiftedPm;
      }
    }
  }

  return {
    minutes: resolvedMins,
    hasExplicitTwoDigitMinutes,
  };
}

export function findClosestOptionMinutes(
  options: number[],
  targetMinutes: number
): number | null {
  if (options.length === 0) return null;
  let best = options[0];
  let bestDiff = Math.abs(best - targetMinutes);
  for (let i = 1; i < options.length; i += 1) {
    const candidate = options[i];
    const diff = Math.abs(candidate - targetMinutes);
    if (diff < bestDiff || (diff === bestDiff && candidate > best)) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best;
}

function formatDurationLabel(diffMins: number): string {
  // Start and end are independent, so a range can temporarily be inverted or
  // empty. Label it honestly rather than showing a misleading "0 mins".
  if (diffMins < 0) return 'before start';
  if (diffMins === 0) return '0 mins';
  if (diffMins < 60) return diffMins === 1 ? '1 min' : `${diffMins} mins`;
  if (diffMins === 60) return '1 hr';
  if (diffMins % 30 === 0) return `${diffMins / 60} hrs`;
  const hrs = Math.floor(diffMins / 60);
  const rem = diffMins % 60;
  return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'} ${rem} ${rem === 1 ? 'min' : 'mins'}`;
}

function buildStartTimeOptions(
  currentStartMins: number,
  extraSuggestedMins?: number | null
): number[] {
  const list: number[] = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    list.push(m);
  }
  if (!list.includes(currentStartMins)) {
    list.push(currentStartMins);
  }
  if (
    extraSuggestedMins !== null &&
    extraSuggestedMins !== undefined &&
    extraSuggestedMins >= 0 &&
    extraSuggestedMins < 24 * 60 &&
    !list.includes(extraSuggestedMins)
  ) {
    list.push(extraSuggestedMins);
  }
  list.sort((a, b) => a - b);
  return list;
}

/**
 * End-time choices for a given start.
 *
 * Only times that are strictly AFTER the start are valid, so the list always
 * begins below the start (e.g. a 1:00pm start can never offer 11:00am or 7:30am).
 * The cadence matches the start picker for the first hour (every 15 min) and
 * settles into half-hour steps after that, which keeps a 24-hour day listable
 * without thousands of rows.
 *
 * A currently stored end time is only surfaced when it is itself valid — an
 * inverted range must not smuggle an earlier time back into the list; it is left
 * to `handleSubmit` to report.
 */
function buildEndTimeOptions(
  startMins: number,
  currentEndMins: number,
  extraSuggestedMins?: number | null
): { mins: number; durationLabel: string }[] {
  const END_OF_DAY = 24 * 60 - 1;
  const safeStart = Math.max(0, Math.min(END_OF_DAY, startMins));

  const minsSet = new Set<number>();
  for (const offset of [15, 30, 45, 60]) {
    const candidate = safeStart + offset;
    if (candidate <= END_OF_DAY) minsSet.add(candidate);
  }
  for (let offset = 90; safeStart + offset <= END_OF_DAY; offset += 30) {
    minsSet.add(safeStart + offset);
  }

  // Keep the draft's own end visible, but only when it obeys the same rule.
  if (currentEndMins > safeStart && currentEndMins <= END_OF_DAY) {
    minsSet.add(currentEndMins);
  }

  if (
    extraSuggestedMins !== null &&
    extraSuggestedMins !== undefined &&
    extraSuggestedMins > safeStart &&
    extraSuggestedMins <= END_OF_DAY
  ) {
    minsSet.add(extraSuggestedMins);
  }

  // Edge case: a start at 23:45+ leaves no room for a later end on this day.
  if (minsSet.size === 0 && safeStart < END_OF_DAY) {
    minsSet.add(END_OF_DAY);
  }

  return Array.from(minsSet)
    .sort((a, b) => a - b)
    .map((m) => ({ mins: m, durationLabel: formatDurationLabel(m - safeStart) }));
}

export const EventFormModal: React.FC<EventFormModalProps> = ({
  isOpen,
  initialDraft,
  eventCategories,
  taskCategories,
  onAddCustomCategory,
  onDeleteCustomCategory,
  onClose,
  onSave,
  onDelete,
}) => {
  const [draft, setDraft] = useState<EventDraft>(initialDraft);
  // Kept in sync while open so the close animation can still render the form.
  const [retainedDraft, setRetainedDraft] = useState<EventDraft>(initialDraft);
  const [imageMode, setImageMode] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState<string>('');
  const [imageError, setImageError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Expandable Google Calendar–style row states
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [activePicker, setActivePicker] = useState<ActiveSchedulePicker>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() =>
    startOfMonth(parseLocalDateTime(initialDraft.start))
  );
  const [startTimeText, setStartTimeText] = useState<string>('');
  const [endTimeText, setEndTimeText] = useState<string>('');
  const [highlightedTimeOverride, setHighlightedTimeOverride] = useState<
    number | null
  >(null);
  const [popoverCoords, setPopoverCoords] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [showAttachmentBox, setShowAttachmentBox] = useState(false);
  const [categoryExpanded, setCategoryExpanded] = useState(false);

  // Custom Recurrence dialog state
  const [customModalOpen, setCustomModalOpen] = useState(false);

  // New Custom Tag inline creator state
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState('#f43f5e');
  const [tagError, setTagError] = useState<string | null>(null);

  // Remember non-all-day times when toggling All day on/off
  const lastTimedRangeRef = useRef<{ startMins: number; endMins: number }>({
    startMins: 9 * 60,
    endMins: 10 * 60,
  });

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const formScrollRef = useRef<HTMLFormElement | null>(null);
  const dateChipRef = useRef<HTMLButtonElement | null>(null);
  const startTimeWrapRef = useRef<HTMLDivElement | null>(null);
  const endTimeWrapRef = useRef<HTMLDivElement | null>(null);
  const startTimeInputRef = useRef<HTMLInputElement | null>(null);
  const endTimeInputRef = useRef<HTMLInputElement | null>(null);
  const repeatChipRef = useRef<HTMLButtonElement | null>(null);
  const floatingPopoverRef = useRef<HTMLDivElement | null>(null);
  const timeListboxRef = useRef<HTMLDivElement | null>(null);
  const activeOptionRef = useRef<HTMLButtonElement | null>(null);
  /**
   * Set while a time value is being written programmatically (dropdown pick or
   * start/end sync). The chips call `input.blur()`, which fires `onBlur` while
   * `startTimeText`/`endTimeText` still hold the *previous* string — committing
   * that stale text would immediately overwrite the value that was just set.
   */
  const suppressTimeBlurCommitRef = useRef(false);

  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const newTagInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize modal state on open
  useEffect(() => {
    if (isOpen) {
      const sParsed = parseLocalDateTime(initialDraft.start);
      const eParsed = parseLocalDateTime(initialDraft.end);
      const dateStr = formatDateInput(sParsed);
      const sMins = getMinutesFromDate(sParsed);
      const rawEndMins = getMinutesFromDate(eParsed);
      const eMins = initialDraft.allDay
        ? 23 * 60 + 59
        : rawEndMins >= sMins
          ? rawEndMins
          : Math.min(23 * 60 + 59, sMins + 60);

      if (!initialDraft.allDay) {
        lastTimedRangeRef.current = { startMins: sMins, endMins: eMins };
      } else {
        lastTimedRangeRef.current = { startMins: 9 * 60, endMins: 10 * 60 };
      }

      // Normalize start & end onto the single selected date
      const normalizedDraft: EventDraft = {
        ...initialDraft,
        start: initialDraft.allDay
          ? `${dateStr}T00:00`
          : `${dateStr}T${minutesToHHmm(sMins)}`,
        end: initialDraft.allDay
          ? `${dateStr}T23:59`
          : `${dateStr}T${minutesToHHmm(eMins)}`,
      };

      setDraft(normalizedDraft);
      setRetainedDraft(normalizedDraft);
      setCalendarMonth(startOfMonth(sParsed));
      setStartTimeText(formatMinutes12h(sMins));
      setEndTimeText(formatMinutes12h(eMins));

      const existingUrl = initialDraft.imageUrl || '';
      const isExternal =
        !initialDraft.imagePath && /^https?:\/\//i.test(existingUrl);
      setImageMode(isExternal ? 'url' : 'upload');
      setUrlInput(isExternal ? existingUrl : '');
      setImageError(null);
      setValidationError(null);

      const hasDescOrMedia = Boolean(
        initialDraft.description?.trim() ||
          initialDraft.imageUrl ||
          initialDraft.imagePath
      );
      setScheduleExpanded(false);
      setActivePicker(null);
      setHighlightedTimeOverride(null);
      setPopoverCoords(null);
      setDetailsExpanded(hasDescOrMedia);
      setShowAttachmentBox(
        Boolean(initialDraft.imageUrl || initialDraft.imagePath)
      );
      setCategoryExpanded(false);

      setCustomModalOpen(false);
      setIsAddingTag(false);
      setNewTagLabel('');
      setNewTagColor('#f43f5e');
      setTagError(null);

      window.setTimeout(() => {
        titleInputRef.current?.focus();
      }, 40);
    }
  }, [initialDraft, isOpen]);

  // Mirror the live draft so the exit animation has content to render.
  useEffect(() => {
    if (isOpen) setRetainedDraft(draft);
  }, [draft, isOpen]);

  // Drop any open schedule/date/time popover the moment the modal closes so it
  // never lingers above the fade-out.
  useEffect(() => {
    if (!isOpen) {
      setActivePicker(null);
      setHighlightedTimeOverride(null);
      setPopoverCoords(null);
    }
  }, [isOpen]);

  useEffect(() => {
    setHighlightedTimeOverride(null);
  }, [activePicker]);

  // Switching between Event and Task swaps the tag set, so any half-finished
  // "create tag" form is closed to avoid filing a tag under the wrong type.
  useEffect(() => {
    setIsAddingTag(false);
    setNewTagLabel('');
    setTagError(null);
  }, [draft.isTask]);

  // Keep editable time text inputs synchronized with draft.start / draft.end
  useEffect(() => {
    if (!draft.allDay) {
      const sMins = getMinutesFromDate(parseLocalDateTime(draft.start));
      const eMins = getMinutesFromDate(parseLocalDateTime(draft.end));
      setStartTimeText(formatMinutes12h(sMins));
      setEndTimeText(formatMinutes12h(eMins));
    }
  }, [draft.allDay, draft.end, draft.start]);

  const getActiveTriggerElement = useCallback((): HTMLElement | null => {
    if (activePicker === 'date') return dateChipRef.current;
    if (activePicker === 'startTime') return startTimeWrapRef.current;
    if (activePicker === 'endTime') return endTimeWrapRef.current;
    if (activePicker === 'repeat') return repeatChipRef.current;
    return null;
  }, [activePicker]);

  const updatePopoverPosition = useCallback(() => {
    if (!activePicker) {
      setPopoverCoords(null);
      return;
    }
    const triggerEl = getActiveTriggerElement();
    if (!triggerEl) return;

    const rect = triggerEl.getBoundingClientRect();
    const width =
      activePicker === 'date'
        ? 268
        : activePicker === 'startTime'
          ? 176
          : activePicker === 'endTime'
            ? 208
            : Math.max(216, Math.round(rect.width));

    const expectedHeight =
      activePicker === 'date'
        ? 292
        : activePicker === 'repeat'
          ? 248
          : 215;

    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - width - 12)
    );
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const top =
      spaceBelow >= expectedHeight || rect.top < expectedHeight
        ? rect.bottom + 6
        : Math.max(12, rect.top - expectedHeight - 6);

    setPopoverCoords({ top, left, width });
  }, [activePicker, getActiveTriggerElement]);

  useLayoutEffect(() => {
    if (!isOpen || !activePicker) {
      setPopoverCoords(null);
      return;
    }
    updatePopoverPosition();

    const scrollEl = formScrollRef.current;
    window.addEventListener('resize', updatePopoverPosition);
    scrollEl?.addEventListener('scroll', updatePopoverPosition, { passive: true });
    return () => {
      window.removeEventListener('resize', updatePopoverPosition);
      scrollEl?.removeEventListener('scroll', updatePopoverPosition);
    };
  }, [activePicker, draft.allDay, isOpen, scheduleExpanded, updatePopoverPosition]);

  const parsedStartDate = useMemo(
    () => parseLocalDateTime(draft.start),
    [draft.start]
  );
  const parsedEndDate = useMemo(
    () => parseLocalDateTime(draft.end),
    [draft.end]
  );

  const startMinutes = getMinutesFromDate(parsedStartDate);
  const endMinutes = getMinutesFromDate(parsedEndDate);

  const parsedStartSuggestion = useMemo(
    () =>
      parseTypedTimeInput(startTimeText, {
        isEndTime: false,
        startMinutes,
      }),
    [startMinutes, startTimeText]
  );

  const parsedEndSuggestion = useMemo(
    () =>
      parseTypedTimeInput(endTimeText, {
        isEndTime: true,
        startMinutes,
      }),
    [endTimeText, startMinutes]
  );

  const startTimeOptions = useMemo(
    () =>
      buildStartTimeOptions(
        startMinutes,
        parsedStartSuggestion?.hasExplicitTwoDigitMinutes
          ? parsedStartSuggestion.minutes
          : null
      ),
    [parsedStartSuggestion, startMinutes]
  );

  const endTimeOptions = useMemo(
    () =>
      buildEndTimeOptions(
        startMinutes,
        endMinutes,
        parsedEndSuggestion?.hasExplicitTwoDigitMinutes
          ? parsedEndSuggestion.minutes
          : null
      ),
    [endMinutes, parsedEndSuggestion, startMinutes]
  );

  const highlightedStartMinutes = useMemo(() => {
    if (
      highlightedTimeOverride !== null &&
      startTimeOptions.includes(highlightedTimeOverride)
    ) {
      return highlightedTimeOverride;
    }
    if (parsedStartSuggestion !== null) {
      return findClosestOptionMinutes(
        startTimeOptions,
        parsedStartSuggestion.minutes
      );
    }
    return startMinutes;
  }, [
    highlightedTimeOverride,
    parsedStartSuggestion,
    startMinutes,
    startTimeOptions,
  ]);

  const highlightedEndMinutes = useMemo(() => {
    const endOptionMins = endTimeOptions.map((o) => o.mins);
    if (
      highlightedTimeOverride !== null &&
      endOptionMins.includes(highlightedTimeOverride)
    ) {
      return highlightedTimeOverride;
    }
    if (parsedEndSuggestion !== null) {
      return findClosestOptionMinutes(
        endOptionMins,
        parsedEndSuggestion.minutes
      );
    }
    return endOptionMins.includes(endMinutes)
      ? endMinutes
      : endOptionMins[0] ?? null;
  }, [
    endMinutes,
    endTimeOptions,
    highlightedTimeOverride,
    parsedEndSuggestion,
  ]);

  const activeHighlightedMinutes =
    activePicker === 'startTime'
      ? highlightedStartMinutes
      : activePicker === 'endTime'
        ? highlightedEndMinutes
        : null;

  // Auto-scroll highlighted time suggestion to center when dropdown opens or user types
  useEffect(() => {
    if (activePicker === 'startTime' || activePicker === 'endTime') {
      const raf = window.requestAnimationFrame(() => {
        const listEl = timeListboxRef.current;
        const optEl = activeOptionRef.current;
        if (listEl && optEl) {
          const targetScrollTop =
            optEl.offsetTop - listEl.clientHeight / 2 + optEl.offsetHeight / 2;
          listEl.scrollTop = Math.max(0, targetScrollTop);
        }
      });
      return () => window.cancelAnimationFrame(raf);
    }
  }, [activeHighlightedMinutes, activePicker, popoverCoords]);

  // Close floating picker on outside click
  useEffect(() => {
    if (!activePicker) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (floatingPopoverRef.current?.contains(target)) return;
      const trigger = getActiveTriggerElement();
      if (trigger?.contains(target)) return;
      setActivePicker(null);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [activePicker, getActiveTriggerElement]);

  // Escape key closes open popover first, then modal
  useEffect(() => {
    if (!isOpen || customModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activePicker) {
          e.stopPropagation();
          setActivePicker(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePicker, customModalOpen, isOpen, onClose]);

  const miniCalendarDays = useMemo(() => {
    const firstOfMonth = startOfMonth(calendarMonth);
    const gridStart = startOfWeek(firstOfMonth, { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, idx) => addDays(gridStart, idx));
  }, [calendarMonth]);

  const isEditing = Boolean(draft.id);
  const dateStr = formatDateInput(parsedStartDate);

  // Draft shown by the render pass. When the modal is closing we keep showing a
  // snapshot so the panel can animate out instead of vanishing instantly.
  const view: EventDraft = isOpen ? draft : retainedDraft;

  // Event vs Task expose completely separate tag sets.
  const activeScope: CategoryScope = view.isTask ? 'task' : 'event';
  const scopeCategories =
    activeScope === 'task' ? taskCategories : eventCategories;
  const categoryMapObj: Record<string, CategoryMeta> = {};
  for (const c of [...eventCategories, ...taskCategories]) {
    categoryMapObj[c.id] = c;
  }
  const selectedCategoryMeta = resolveCategoryMeta(
    view.category,
    categoryMapObj,
    activeScope
  );

  const presetOptions: {
    value: Exclude<RecurrenceRule, 'custom'>;
    label: string;
  }[] = [
    { value: 'none', label: 'Does not repeat' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: `Weekly on ${format(parsedStartDate, 'EEEE')}` },
    { value: 'monthly', label: `Monthly on day ${parsedStartDate.getDate()}` },
    { value: 'yearly', label: `Annually on ${format(parsedStartDate, 'MMM d')}` },
  ];

  const activeRepeatLabel = formatRecurrenceSummary({
    recurrence: view.recurrence,
    recurrenceUntil: view.recurrenceUntil,
    customRecurrence: view.customRecurrence,
    start: view.start,
  });

  // Single-date label (shown once, with start & end times beside it)
  const formattedSingleDate =
    parsedStartDate.getFullYear() === new Date().getFullYear()
      ? format(parsedStartDate, 'EEEE, MMMM d')
      : format(parsedStartDate, 'EEEE, MMMM d, yyyy');

  const handleSelectSingleDate = (selectedDay: Date) => {
    setValidationError(null);
    const nextDateStr = formatDateInput(selectedDay);
    setCalendarMonth(startOfMonth(selectedDay));
    setDraft((prev) => {
      if (prev.allDay) {
        return {
          ...prev,
          start: `${nextDateStr}T00:00`,
          end: `${nextDateStr}T23:59`,
        };
      }
      const sTime = prev.start.split('T')[1]?.slice(0, 5) || '09:00';
      const eTime = prev.end.split('T')[1]?.slice(0, 5) || '10:00';
      return {
        ...prev,
        start: `${nextDateStr}T${sTime}`,
        end: `${nextDateStr}T${eTime}`,
      };
    });
    setActivePicker(null);
  };

  const applyStartMinutes = (newStartMins: number) => {
    setValidationError(null);
    const safeStart = Math.max(0, Math.min(23 * 60 + 59, newStartMins));

    // Start and end are edited independently: changing the start must never
    // move the end (and vice versa). An inverted range is surfaced on Save by
    // `handleSubmit` ("End time must be after start time") instead of being
    // silently repaired here, because silently repairing it is exactly what
    // made picking a start time overwrite the user's chosen end time.
    lastTimedRangeRef.current = { startMins: safeStart, endMins: endMinutes };

    // Guard the end chip: the start text is written programmatically below, so
    // a blur on the end input while this is in flight must not commit stale text.
    suppressTimeBlurCommitRef.current = true;

    setDraft((prev) => ({
      ...prev,
      start: `${dateStr}T${minutesToHHmm(safeStart)}`,
    }));
    setStartTimeText(formatMinutes12h(safeStart));
    window.setTimeout(() => {
      suppressTimeBlurCommitRef.current = false;
    }, 0);
  };

  const applyEndMinutes = (newEndMins: number) => {
    setValidationError(null);
    const safeEnd = Math.max(0, Math.min(23 * 60 + 59, newEndMins));

    // Independent of the start time — see `applyStartMinutes`.
    lastTimedRangeRef.current = {
      startMins: Math.min(startMinutes, 23 * 60 + 59),
      endMins: safeEnd,
    };

    suppressTimeBlurCommitRef.current = true;

    setDraft((prev) => ({
      ...prev,
      end: `${dateStr}T${minutesToHHmm(safeEnd)}`,
    }));
    setEndTimeText(formatMinutes12h(safeEnd));
    window.setTimeout(() => {
      suppressTimeBlurCommitRef.current = false;
    }, 0);
  };

  const commitTypedStartTime = () => {
    if (suppressTimeBlurCommitRef.current) return;
    if (
      activePicker === 'startTime' &&
      highlightedTimeOverride !== null &&
      startTimeOptions.includes(highlightedTimeOverride)
    ) {
      setHighlightedTimeOverride(null);
      applyStartMinutes(highlightedTimeOverride);
      return;
    }
    const parsed = parseTypedTimeInput(startTimeText, {
      isEndTime: false,
      startMinutes,
    });
    if (parsed === null) {
      setStartTimeText(formatMinutes12h(startMinutes));
      return;
    }
    const targetMins = parsed.hasExplicitTwoDigitMinutes
      ? parsed.minutes
      : highlightedStartMinutes ?? parsed.minutes;
    applyStartMinutes(targetMins);
  };

  const commitTypedEndTime = () => {
    if (suppressTimeBlurCommitRef.current) return;
    const endOptionMins = endTimeOptions.map((o) => o.mins);
    if (
      activePicker === 'endTime' &&
      highlightedTimeOverride !== null &&
      endOptionMins.includes(highlightedTimeOverride)
    ) {
      setHighlightedTimeOverride(null);
      applyEndMinutes(highlightedTimeOverride);
      return;
    }
    const parsed = parseTypedTimeInput(endTimeText, {
      isEndTime: true,
      startMinutes,
    });
    if (parsed === null) {
      setEndTimeText(formatMinutes12h(endMinutes));
      return;
    }
    const targetMins =
      parsed.minutes <= startMinutes || parsed.hasExplicitTwoDigitMinutes
        ? parsed.minutes
        : highlightedEndMinutes ?? parsed.minutes;
    applyEndMinutes(targetMins);
  };

  const handleToggleAllDay = (checked: boolean) => {
    setValidationError(null);
    setActivePicker(null);
    if (checked) {
      // Remember the range verbatim so toggling All day off restores exactly the
      // times the user had chosen — no silent reordering of start/end.
      lastTimedRangeRef.current = { startMins: startMinutes, endMins: endMinutes };
      setDraft((prev) => ({
        ...prev,
        allDay: true,
        start: `${dateStr}T00:00`,
        end: `${dateStr}T23:59`,
      }));
    } else {
      const { startMins, endMins } = lastTimedRangeRef.current;
      setDraft((prev) => ({
        ...prev,
        allDay: false,
        start: `${dateStr}T${minutesToHHmm(startMins)}`,
        end: `${dateStr}T${minutesToHHmm(endMins)}`,
      }));
    }
  };

  /**
   * Applies a time chosen from somewhere other than the text input itself.
   *
   * The commit must not be undone by the input's own `onBlur`: `apply()` calls
   * `setStartTimeText`/`setEndTimeText`, but `onBlur` reads whatever string is
   * still captured in this render's closure — the *old* time — and would write
   * that straight back into the draft. So the blur guard stays raised for the
   * synchronous blur below and is released on the next tick, leaving normal
   * typing-then-clicking-away commits untouched.
   */
  const pickTime = (
    minutes: number,
    apply: (mins: number) => void,
    inputRef: React.RefObject<HTMLInputElement>
  ) => {
    if (suppressTimeBlurCommitRef.current) return; // already handled this gesture
    suppressTimeBlurCommitRef.current = true;
    apply(minutes);
    setActivePicker(null);
    inputRef.current?.blur();
    window.setTimeout(() => {
      suppressTimeBlurCommitRef.current = false;
    }, 0);
  };

  const handlePickStartTime = (minutes: number) =>
    pickTime(minutes, applyStartMinutes, startTimeInputRef);

  const handlePickEndTime = (minutes: number) =>
    pickTime(minutes, applyEndMinutes, endTimeInputRef);

  const openScheduleWithPicker = (picker: ActiveSchedulePicker) => {
    setScheduleExpanded(true);
    if (picker === 'date') {
      setCalendarMonth(startOfMonth(parsedStartDate));
    }
    setActivePicker(picker);
    if (picker === 'startTime') {
      window.requestAnimationFrame(() => {
        startTimeInputRef.current?.focus();
        startTimeInputRef.current?.select();
      });
    } else if (picker === 'endTime') {
      window.requestAnimationFrame(() => {
        endTimeInputRef.current?.focus();
        endTimeInputRef.current?.select();
      });
    }
  };

  const handleCustomRecurrenceDone = (config: CustomRecurrenceConfig) => {
    setDraft((prev) => ({
      ...prev,
      recurrence: 'custom',
      customRecurrence: config,
      recurrenceUntil: undefined,
    }));
    setCustomModalOpen(false);
  };

  /**
   * Switch the draft between Event and Task. A tag that does not exist in the
   * destination type's set is replaced by that type's default tag, so a task can
   * never keep an event-only tag (and vice versa).
   */
  const handleSwitchScope = (scope: CategoryScope) => {
    setDraft((prev) => {
      const nextTags = scope === 'task' ? taskCategories : eventCategories;
      const keep = nextTags.some((c) => c.id === prev.category);
      return {
        ...prev,
        isTask: scope === 'task',
        category: keep
          ? prev.category
          : scope === 'task'
            ? 'academic'
            : 'class-sched',
      };
    });
  };

  const handleCreateCustomTag = () => {
    const cleanLabel = newTagLabel.trim();
    if (!cleanLabel) {
      setTagError('Please enter a tag name.');
      newTagInputRef.current?.focus();
      return;
    }
    // Duplicates only matter inside the item type being edited
    const duplicate = scopeCategories.some(
      (c) => c.label.toLowerCase() === cleanLabel.toLowerCase()
    );
    if (duplicate) {
      setTagError(
        `A ${activeScope === 'task' ? 'task' : 'event'} tag with that name already exists.`
      );
      return;
    }

    const created = onAddCustomCategory(cleanLabel, newTagColor, activeScope);
    setDraft((prev) => ({ ...prev, category: created.id }));
    setNewTagLabel('');
    setTagError(null);
    setIsAddingTag(false);
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    try {
      const result = await processUploadedImageFile(file);
      setDraft((prev) => ({
        ...prev,
        imageUrl: result.dataUrl,
        imagePath: undefined,
        imageName: result.fileName,
      }));
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setImageError(
        err instanceof Error ? err.message : 'Could not process image file.'
      );
    }
  };

  const handleApplyUrl = (val: string) => {
    setUrlInput(val);
    setImageError(null);
    const trimmed = val.trim();
    if (!trimmed) {
      setDraft((prev) => ({
        ...prev,
        imageUrl: undefined,
        imagePath: undefined,
        imageName: undefined,
      }));
      return;
    }
    setDraft((prev) => ({
      ...prev,
      imageUrl: trimmed,
      imagePath: undefined,
      imageName: 'External Image URL',
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = view.title.trim();
    if (!cleanTitle) {
      setValidationError(
        `Please enter a title for your ${view.isTask ? 'task' : 'event'}.`
      );
      titleInputRef.current?.focus();
      return;
    }

    let nextStart = draft.start;
    let nextEnd = draft.end;

    if (!view.allDay) {
      let resolvedStartMins = startMinutes;
      if (startTimeText !== formatMinutes12h(startMinutes)) {
        const pStart = parseTypedTimeInput(startTimeText, {
          isEndTime: false,
          startMinutes,
        });
        if (pStart !== null) {
          resolvedStartMins = pStart.hasExplicitTwoDigitMinutes
            ? pStart.minutes
            : highlightedStartMinutes ?? pStart.minutes;
          nextStart = `${dateStr}T${minutesToHHmm(resolvedStartMins)}`;
        }
      }

      if (endTimeText !== formatMinutes12h(endMinutes)) {
        const pEnd = parseTypedTimeInput(endTimeText, {
          isEndTime: true,
          startMinutes: resolvedStartMins,
        });
        if (pEnd !== null) {
          const endCandidates = buildEndTimeOptions(
            resolvedStartMins,
            endMinutes,
            pEnd.hasExplicitTwoDigitMinutes ? pEnd.minutes : null
          ).map((o) => o.mins);
          const resolvedEndMins =
            pEnd.minutes <= resolvedStartMins ||
            pEnd.hasExplicitTwoDigitMinutes
              ? pEnd.minutes
              : findClosestOptionMinutes(endCandidates, pEnd.minutes) ??
                pEnd.minutes;
          nextEnd = `${dateStr}T${minutesToHHmm(resolvedEndMins)}`;
        }
      }
    }

    const sDate = parseLocalDateTime(nextStart);
    const eDate = parseLocalDateTime(nextEnd);
    if (eDate < sDate) {
      setValidationError('End time must be after start time.');
      setScheduleExpanded(true);
      return;
    }

    onSave({
      ...draft,
      start: nextStart,
      end: nextEnd,
      title: cleanTitle,
      location: draft.location.trim(),
      description: draft.description.trim(),
    });
  };

  const previewMeta = buildCategoryMeta({
    id: 'preview',
    label: newTagLabel.trim() || 'New Tag Preview',
    color: newTagColor,
  });

  const today = new Date();

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="event-form-backdrop"
            variants={modalBackdropVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/55 backdrop-blur-md"
            onClick={onClose}
          >
            <motion.div
              variants={modalPanelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[540px] max-h-[92vh] flex flex-col rounded-[28px] border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg overflow-hidden gpu-layer"
            >
          {/* Minimalist Google Calendar Top Bar */}
          <div className="px-5 pt-3.5 pb-1 flex items-center justify-between shrink-0">
            <span
              className="p-1.5 text-theme-text-muted opacity-75"
              aria-hidden="true"
            >
              <svg width="16" height="8" viewBox="0 0 16 8" fill="none">
                <rect width="16" height="2" rx="1" fill="currentColor" />
                <rect y="6" width="16" height="2" rx="1" fill="currentColor" />
              </svg>
            </span>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full text-theme-text-secondary hover:bg-theme-cell-hover hover:text-theme-text transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Body */}
          <form
            ref={formScrollRef}
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto themed-scroll px-5 sm:px-6 pb-6 pt-1 space-y-3"
          >
            {validationError && (
              <div className="ml-11 rounded-xl bg-rose-500/15 border border-rose-500/40 px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-300">
                {validationError}
              </div>
            )}

            {/* Indented Title Input + Event/Task Type Pills */}
            <div className="pl-11 space-y-3.5 pb-1">
              <input
                ref={titleInputRef}
                type="text"
                value={view.title}
                onChange={(e) => {
                  setValidationError(null);
                  setDraft((p) => ({ ...p, title: e.target.value }));
                }}
                placeholder="Add title"
                className="w-full bg-transparent text-[22px] sm:text-2xl font-normal text-theme-text placeholder:text-theme-text-muted pb-1.5 border-b-2 border-theme-border focus:border-theme-accent focus:outline-none transition-colors"
              />

              {/* Event | Task Switcher — switching type also swaps the tag set,
                  so the selected tag is moved onto that type's default tag */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSwitchScope('event')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm transition-all ${
                    !view.isTask
                      ? 'bg-theme-accent-soft text-theme-accent font-semibold ring-1 ring-theme-accent/35'
                      : 'text-theme-text-secondary hover:bg-theme-cell-hover hover:text-theme-text font-medium'
                  }`}
                >
                  Event
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchScope('task')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm transition-all ${
                    view.isTask
                      ? 'bg-theme-accent-soft text-theme-accent font-semibold ring-1 ring-theme-accent/35'
                      : 'text-theme-text-secondary hover:bg-theme-cell-hover hover:text-theme-text font-medium'
                  }`}
                >
                  Task
                </button>
              </div>
            </div>

            {/* Row 1: Schedule & Repeat (Clock Icon) */}
            <div className="flex items-start">
              <div className="w-11 shrink-0 pt-2.5 flex justify-start">
                <Clock className="w-5 h-5 text-theme-text-secondary" />
              </div>

              {!scheduleExpanded ? (
                /* Collapsed Google Calendar Two-Line Summary (Date shown once + Start–End times beside it) */
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openScheduleWithPicker('date')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openScheduleWithPicker('date');
                    }
                  }}
                  className="flex-1 min-w-0 rounded-xl hover:bg-theme-elevated/70 px-3.5 py-2 text-left cursor-pointer transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm font-medium text-theme-text tabular-nums">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        openScheduleWithPicker('date');
                      }}
                      className="hover:underline"
                    >
                      {formattedSingleDate}
                    </span>

                    {!view.allDay && (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            openScheduleWithPicker('startTime');
                          }}
                          className="hover:underline"
                        >
                          {formatMinutes12h(startMinutes)}
                        </span>
                        <span>–</span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            openScheduleWithPicker('endTime');
                          }}
                          className="hover:underline"
                        >
                          {formatMinutes12h(endMinutes)}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-theme-text-secondary mt-0.5 truncate">
                    <span>{view.allDay ? 'All day' : 'Scheduled time'}</span>
                    <span> · </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        openScheduleWithPicker('repeat');
                      }}
                      className="hover:text-theme-accent hover:underline"
                    >
                      {activeRepeatLabel}
                    </span>
                  </div>
                </div>
              ) : (
                /* Expanded Google Calendar Inline Date & Time Chips + All day + Repeat */
                <div className="flex-1 min-w-0 space-y-3 pl-0.5">
                  {/* Line 1: [ Wednesday, November 4 ]   [ 12:30pm ] – [ 1:30pm ] */}
                  <div className="flex flex-wrap items-center gap-2 tabular-nums">
                    {/* Single Date Chip */}
                    <button
                      ref={dateChipRef}
                      type="button"
                      onClick={() => {
                        setCalendarMonth(startOfMonth(parsedStartDate));
                        setActivePicker((prev) =>
                          prev === 'date' ? null : 'date'
                        );
                      }}
                      style={
                        activePicker === 'date'
                          ? { borderBottomColor: 'var(--t-accent)' }
                          : undefined
                      }
                      className={`px-3.5 py-2 text-sm font-medium text-theme-text bg-theme-elevated hover:bg-theme-cell-hover transition-colors border-b-2 ${
                        activePicker === 'date'
                          ? 'rounded-t-lg rounded-b-none'
                          : 'rounded-lg border-transparent'
                      }`}
                    >
                      <span
                        className={
                          activePicker === 'date'
                            ? 'px-1 py-0.5 rounded bg-theme-accent/20'
                            : ''
                        }
                      >
                        {formattedSingleDate}
                      </span>
                    </button>

                    {/* Start & End Time Chips beside the single Date */}
                    {!view.allDay && (
                      <>
                        <div
                          ref={startTimeWrapRef}
                          style={
                            activePicker === 'startTime'
                              ? { borderBottomColor: 'var(--t-accent)' }
                              : undefined
                          }
                          className={`bg-theme-elevated hover:bg-theme-cell-hover transition-colors border-b-2 ${
                            activePicker === 'startTime'
                              ? 'rounded-t-lg rounded-b-none'
                              : 'rounded-lg border-transparent'
                          }`}
                        >
                          <input
                            ref={startTimeInputRef}
                            type="text"
                            value={startTimeText}
                            aria-label="Start time"
                            onFocus={(e) => {
                              setActivePicker('startTime');
                              e.currentTarget.select();
                            }}
                            onClick={() => setActivePicker('startTime')}
                            onChange={(e) => {
                              setStartTimeText(e.target.value);
                              setHighlightedTimeOverride(null);
                              if (activePicker !== 'startTime') {
                                setActivePicker('startTime');
                              }
                            }}
                            onBlur={commitTypedStartTime}
                            onKeyDown={(e) => {
                              if (
                                e.key === 'ArrowDown' ||
                                e.key === 'ArrowUp'
                              ) {
                                e.preventDefault();
                                if (activePicker !== 'startTime') {
                                  setActivePicker('startTime');
                                  return;
                                }
                                if (startTimeOptions.length === 0) return;
                                const curIdx =
                                  highlightedStartMinutes !== null
                                    ? startTimeOptions.indexOf(
                                        highlightedStartMinutes
                                      )
                                    : -1;
                                const delta = e.key === 'ArrowDown' ? 1 : -1;
                                const nextIdx =
                                  curIdx === -1
                                    ? 0
                                    : Math.max(
                                        0,
                                        Math.min(
                                          startTimeOptions.length - 1,
                                          curIdx + delta
                                        )
                                      );
                                setHighlightedTimeOverride(
                                  startTimeOptions[nextIdx]
                                );
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                commitTypedStartTime();
                                setActivePicker(null);
                                e.currentTarget.blur();
                              }
                            }}
                            className="w-[92px] bg-transparent px-2.5 py-2 text-center text-sm font-medium text-theme-text focus:outline-none"
                          />
                        </div>

                        <span className="text-theme-text-secondary font-medium select-none px-0.5">
                          –
                        </span>

                        <div
                          ref={endTimeWrapRef}
                          style={
                            activePicker === 'endTime'
                              ? { borderBottomColor: 'var(--t-accent)' }
                              : undefined
                          }
                          className={`bg-theme-elevated hover:bg-theme-cell-hover transition-colors border-b-2 ${
                            activePicker === 'endTime'
                              ? 'rounded-t-lg rounded-b-none'
                              : 'rounded-lg border-transparent'
                          }`}
                        >
                          <input
                            ref={endTimeInputRef}
                            type="text"
                            value={endTimeText}
                            aria-label="End time"
                            onFocus={(e) => {
                              setActivePicker('endTime');
                              e.currentTarget.select();
                            }}
                            onClick={() => setActivePicker('endTime')}
                            onChange={(e) => {
                              setEndTimeText(e.target.value);
                              setHighlightedTimeOverride(null);
                              if (activePicker !== 'endTime') {
                                setActivePicker('endTime');
                              }
                            }}
                            onBlur={commitTypedEndTime}
                            onKeyDown={(e) => {
                              if (
                                e.key === 'ArrowDown' ||
                                e.key === 'ArrowUp'
                              ) {
                                e.preventDefault();
                                if (activePicker !== 'endTime') {
                                  setActivePicker('endTime');
                                  return;
                                }
                                if (endTimeOptions.length === 0) return;
                                const endOptionMins = endTimeOptions.map(
                                  (o) => o.mins
                                );
                                const curIdx =
                                  highlightedEndMinutes !== null
                                    ? endOptionMins.indexOf(
                                        highlightedEndMinutes
                                      )
                                    : -1;
                                const delta = e.key === 'ArrowDown' ? 1 : -1;
                                const nextIdx =
                                  curIdx === -1
                                    ? 0
                                    : Math.max(
                                        0,
                                        Math.min(
                                          endOptionMins.length - 1,
                                          curIdx + delta
                                        )
                                      );
                                setHighlightedTimeOverride(
                                  endOptionMins[nextIdx]
                                );
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                commitTypedEndTime();
                                setActivePicker(null);
                                e.currentTarget.blur();
                              }
                            }}
                            className="w-[92px] bg-transparent px-2.5 py-2 text-center text-sm font-medium text-theme-text focus:outline-none"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Line 2: All day Checkbox */}
                  <div className="flex items-center pt-0.5">
                    <div
                      role="checkbox"
                      aria-checked={view.allDay}
                      tabIndex={0}
                      onClick={() => handleToggleAllDay(!view.allDay)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleToggleAllDay(!view.allDay);
                        }
                      }}
                      className="inline-flex items-center gap-3.5 cursor-pointer select-none group py-0.5"
                    >
                      <span
                        style={
                          view.allDay
                            ? {
                                backgroundColor: 'var(--t-accent)',
                                borderColor: 'var(--t-accent)',
                                color: 'var(--t-accent-contrast)',
                              }
                            : undefined
                        }
                        className={`w-[18px] h-[18px] rounded-[4px] flex items-center justify-center transition-colors ${
                          view.allDay
                            ? ''
                            : 'border-2 border-theme-text-secondary group-hover:border-theme-text bg-transparent'
                        }`}
                      >
                        {view.allDay && (
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        )}
                      </span>
                      <span className="text-sm font-medium text-theme-text">
                        All day
                      </span>
                    </div>
                  </div>

                  {/* Line 3: Repeat Dropdown Chip */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      ref={repeatChipRef}
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={activePicker === 'repeat'}
                      onClick={() =>
                        setActivePicker((prev) =>
                          prev === 'repeat' ? null : 'repeat'
                        )
                      }
                      style={
                        activePicker === 'repeat'
                          ? { borderBottomColor: 'var(--t-accent)' }
                          : undefined
                      }
                      className={`inline-flex items-center justify-between gap-3 bg-theme-elevated hover:bg-theme-cell-hover px-3.5 py-2 text-sm font-medium text-theme-text transition-colors min-w-[172px] max-w-full border-b-2 ${
                        activePicker === 'repeat'
                          ? 'rounded-t-lg rounded-b-none'
                          : 'rounded-lg border-transparent'
                      }`}
                    >
                      <span className="truncate">{activeRepeatLabel}</span>
                      <ChevronDown
                        className={`w-4 h-4 shrink-0 text-theme-text-secondary transition-transform ${
                          activePicker === 'repeat' ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {view.recurrence === 'custom' && (
                      <button
                        type="button"
                        onClick={() => setCustomModalOpen(true)}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-theme-accent hover:bg-theme-accent-soft transition-colors"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Edit custom
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Row 2: Add location (MapPin Icon) */}
            <div className="flex items-center">
              <div className="w-11 shrink-0 flex justify-start">
                <MapPin className="w-5 h-5 text-theme-text-secondary" />
              </div>

              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={view.location}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, location: e.target.value }))
                  }
                  placeholder="Add location"
                  className="w-full rounded-xl bg-transparent hover:bg-theme-elevated/70 focus:bg-theme-elevated border border-transparent focus:border-theme-border-strong px-3.5 py-2.5 text-sm text-theme-text placeholder:text-theme-text-secondary focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Row 3: Add description or attachments (AlignLeft Icon) */}
            <div className="flex items-start">
              <div className="w-11 shrink-0 pt-2.5 flex justify-start">
                <AlignLeft className="w-5 h-5 text-theme-text-secondary" />
              </div>

              <div className="flex-1 min-w-0">
                {!detailsExpanded ? (
                  <div className="w-full rounded-xl hover:bg-theme-elevated/70 px-3.5 py-2.5 flex items-center justify-between gap-2 transition-colors">
                    <button
                      type="button"
                      onClick={() => {
                        setDetailsExpanded(true);
                        window.setTimeout(
                          () => descriptionRef.current?.focus(),
                          30
                        );
                      }}
                      className="flex-1 text-left text-sm text-theme-text-secondary hover:text-theme-text transition-colors"
                    >
                      Add description or attachments
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDetailsExpanded(true);
                        setShowAttachmentBox(true);
                      }}
                      className="p-1 rounded-lg text-theme-text-muted hover:text-theme-accent hover:bg-theme-cell-hover transition-colors"
                      title="Attach image"
                      aria-label="Attach image"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl bg-theme-elevated/65 p-3 space-y-3 border border-theme-border/60">
                    <textarea
                      ref={descriptionRef}
                      rows={3}
                      value={view.description}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, description: e.target.value }))
                      }
                      placeholder="Add description"
                      className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text placeholder:text-theme-text-muted focus:outline-none focus:border-theme-border-strong resize-y"
                    />

                    {/* Attachment Toggle or Panel */}
                    {!showAttachmentBox && !view.imageUrl && !view.imagePath ? (
                      <button
                        type="button"
                        onClick={() => setShowAttachmentBox(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-surface hover:bg-theme-cell-hover px-3 py-1.5 text-xs font-semibold text-theme-text-secondary hover:text-theme-text transition-colors"
                      >
                        <ImagePlus className="w-3.5 h-3.5 text-theme-accent" />
                        Add image attachment
                      </button>
                    ) : (
                      <div className="space-y-2.5 pt-1 border-t border-theme-border/60">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-theme-text-secondary">
                            <ImagePlus className="w-3.5 h-3.5 text-theme-accent" />
                            Image Attachment
                          </span>

                          <div className="inline-flex rounded-lg border border-theme-border bg-theme-surface p-0.5 text-[11px] font-semibold">
                            <button
                              type="button"
                              onClick={() => setImageMode('upload')}
                              style={
                                imageMode === 'upload'
                                  ? {
                                      backgroundColor: 'var(--t-accent)',
                                      color: 'var(--t-accent-contrast)',
                                    }
                                  : undefined
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                                imageMode === 'upload'
                                  ? ''
                                  : 'text-theme-text-secondary'
                              }`}
                            >
                              <Upload className="w-3 h-3" />
                              Upload File
                            </button>
                            <button
                              type="button"
                              onClick={() => setImageMode('url')}
                              style={
                                imageMode === 'url'
                                  ? {
                                      backgroundColor: 'var(--t-accent)',
                                      color: 'var(--t-accent-contrast)',
                                    }
                                  : undefined
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                                imageMode === 'url'
                                  ? ''
                                  : 'text-theme-text-secondary'
                              }`}
                            >
                              <Link2 className="w-3 h-3" />
                              Paste URL
                            </button>
                          </div>
                        </div>

                        {imageMode === 'upload' ? (
                          <div
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIsDragging(true);
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setIsDragging(false);
                              const file = e.dataTransfer.files?.[0];
                              handleFileSelected(file);
                            }}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-3.5 text-center cursor-pointer transition-colors ${
                              isDragging
                                ? 'border-theme-accent bg-theme-accent-soft'
                                : 'border-theme-border hover:border-theme-border-strong bg-theme-surface/80'
                            }`}
                          >
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                              onChange={(e) =>
                                handleFileSelected(e.target.files?.[0])
                              }
                              className="hidden"
                            />
                            <Upload className="w-4 h-4 mx-auto text-theme-accent mb-1" />
                            <p className="text-xs font-semibold text-theme-text">
                              Click to choose or drag &amp; drop an image
                            </p>
                            <p className="text-[11px] text-theme-text-muted mt-0.5">
                              PNG, JPG, or WebP
                            </p>
                          </div>
                        ) : (
                          <input
                            type="url"
                            value={urlInput}
                            onChange={(e) => handleApplyUrl(e.target.value)}
                            placeholder="https://example.com/event-banner.webp"
                            className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-xs text-theme-text placeholder:text-theme-text-muted/65 focus:outline-none focus:border-theme-border-strong"
                          />
                        )}

                        {imageError && (
                          <p className="text-xs font-semibold text-rose-500">
                            {imageError}
                          </p>
                        )}

                        {(view.imageUrl || view.imagePath) && (
                          <div className="relative rounded-xl overflow-hidden border border-theme-border bg-black/10">
                            {view.imageUrl && (
                              <SkeletonImage
                                src={view.imageUrl}
                                alt="Attachment preview"
                                rounded="rounded-none"
                                className="w-full h-40 bg-black/20"
                                imgClassName="w-full max-h-40 object-cover"
                                onErrorImage={() => {
                                  if (!view.imagePath) {
                                    setImageError(
                                      'Unable to load preview from that URL. Check the image address.'
                                    );
                                  }
                                }}
                              />
                            )}
                            <div
                              className={`flex items-center justify-between gap-2 px-3 py-2 bg-theme-surface/95 ${
                                view.imageUrl
                                  ? 'border-t border-theme-border'
                                  : ''
                              }`}
                            >
                              <span className="text-[11px] font-medium text-theme-text-secondary truncate">
                                {view.imageName || 'Attached image'}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setUrlInput('');
                                  setImageError(null);
                                  setDraft((p) => ({
                                    ...p,
                                    imageUrl: undefined,
                                    imagePath: undefined,
                                    imageName: undefined,
                                  }));
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Remove
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Row 4: Category & Color Tag + 10-Min Reminder Subtitle (Calendar Icon) */}
            <div className="flex items-start">
              <div className="w-11 shrink-0 pt-2.5 flex justify-start">
                <Calendar className="w-5 h-5 text-theme-text-secondary" />
              </div>

              <div className="flex-1 min-w-0 rounded-xl hover:bg-theme-elevated/70 transition-colors">
                <button
                  type="button"
                  onClick={() => setCategoryExpanded((o) => !o)}
                  className="w-full px-3.5 py-2 text-left flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-theme-text truncate">
                        {selectedCategoryMeta.label}
                      </span>
                      <span
                        className="shrink-0 rounded-full border border-theme-border bg-theme-elevated px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-theme-text-secondary"
                        title={`${view.isTask ? 'Task' : 'Event'} tag`}
                      >
                        {view.isTask ? 'Task' : 'Event'}
                      </span>
                      <span
                        style={{ backgroundColor: selectedCategoryMeta.color }}
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm ring-1 ring-black/10"
                      />
                    </div>
                    <div className="text-xs text-theme-text-secondary mt-0.5">
                      {view.isTask ? 'Task tag' : 'Event tag'} · Notify 10
                      minutes before
                    </div>
                  </div>

                  <ChevronDown
                    className={`w-4 h-4 shrink-0 text-theme-text-muted transition-transform ${
                      categoryExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Expandable Category Tag Selector & Custom Tag Creator */}
                {categoryExpanded && (
                  <div className="px-3.5 pb-3.5 pt-2 border-t border-theme-border/60 space-y-2.5 bg-theme-elevated/65 rounded-b-xl">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-theme-text-muted">
                        Choose {view.isTask ? 'task' : 'event'} tag
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingTag((open) => !open);
                          setTagError(null);
                          window.setTimeout(
                            () => newTagInputRef.current?.focus(),
                            30
                          );
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-theme-border bg-theme-surface hover:bg-theme-cell-hover px-2.5 py-1 text-[11px] font-bold text-theme-accent transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {isAddingTag
                          ? 'Cancel New Tag'
                          : `Add ${view.isTask ? 'Task' : 'Event'} Tag`}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {scopeCategories.map((cat) => {
                        const selected = view.category === cat.id;
                        return (
                          <div
                            key={cat.id}
                            className={`group/tag relative flex items-center rounded-xl border transition-all ${
                              selected
                                ? 'border-theme-border-strong bg-theme-accent-soft text-theme-text ring-2 ring-theme-accent/35'
                                : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-cell-hover'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((p) => ({
                                  ...p,
                                  category: cat.id as EventCategory,
                                }))
                              }
                              className="flex-1 flex items-center gap-2 px-3 py-2 text-xs font-semibold text-left min-w-0"
                            >
                              <span
                                style={{ backgroundColor: cat.color }}
                                className="w-3 h-3 rounded-full shrink-0 shadow-sm ring-1 ring-black/10"
                              />
                              <span className="truncate">{cat.label}</span>
                            </button>

                            {cat.isCustom && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (view.category === cat.id) {
                                    setDraft((p) => ({
                                      ...p,
                                      category: p.isTask
                                        ? 'academic'
                                        : 'class-sched',
                                    }));
                                  }
                                  onDeleteCustomCategory(cat.id);
                                }}
                                className="opacity-0 group-hover/tag:opacity-100 focus:opacity-100 mr-1.5 p-1 rounded-md text-theme-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-opacity"
                                title={`Remove custom tag "${cat.label}"`}
                                aria-label={`Remove custom tag ${cat.label}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {isAddingTag && (
                      <div className="rounded-xl border border-theme-border-strong/60 bg-theme-surface p-3 space-y-2.5 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-extrabold text-theme-text">
                            Create {activeScope === 'task' ? 'Task' : 'Event'}{' '}
                            Tag
                          </span>
                          <span
                            style={{
                              backgroundColor: previewMeta.softBg,
                              color: previewMeta.textOnLight,
                              borderColor: previewMeta.color,
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold"
                          >
                            <span
                              style={{ backgroundColor: previewMeta.color }}
                              className="w-2 h-2 rounded-full"
                            />
                            {previewMeta.label}
                          </span>
                        </div>

                        <input
                          ref={newTagInputRef}
                          type="text"
                          value={newTagLabel}
                          onChange={(e) => {
                            setTagError(null);
                            setNewTagLabel(e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCreateCustomTag();
                            }
                          }}
                          placeholder="Tag name (e.g., Lab Group, Thesis...)"
                          maxLength={28}
                          className="w-full rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-semibold text-theme-text placeholder:text-theme-text-muted/65 focus:outline-none focus:border-theme-border-strong"
                        />

                        <div className="flex flex-wrap items-center gap-2">
                          {PRESET_TAG_SWATCHES.map((hex) => {
                            const active =
                              newTagColor.toLowerCase() === hex.toLowerCase();
                            return (
                              <button
                                key={hex}
                                type="button"
                                onClick={() => setNewTagColor(hex)}
                                style={{ backgroundColor: hex }}
                                className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform shadow-sm ${
                                  active
                                    ? 'scale-110 ring-2 ring-offset-2 ring-theme-text'
                                    : 'hover:scale-105 opacity-90 hover:opacity-100'
                                }`}
                                title={hex}
                              >
                                {active && (
                                  <Check className="w-3 h-3 text-white stroke-[3]" />
                                )}
                              </button>
                            );
                          })}

                          <label
                            className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-elevated hover:bg-theme-cell-hover px-2 py-1 text-[11px] font-bold text-theme-text cursor-pointer ml-auto"
                            title="Pick any custom color"
                          >
                            <Pipette className="w-3 h-3 text-theme-accent" />
                            <span>Custom</span>
                            <input
                              type="color"
                              value={newTagColor}
                              onChange={(e) => setNewTagColor(e.target.value)}
                              className="w-4 h-4 rounded cursor-pointer border-0 bg-transparent p-0"
                            />
                          </label>
                        </div>

                        {tagError && (
                          <p className="text-[11px] font-semibold text-rose-500">
                            {tagError}
                          </p>
                        )}

                        <div className="flex justify-end gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingTag(false);
                              setTagError(null);
                            }}
                            className="rounded-lg border border-theme-border px-2.5 py-1 text-xs font-semibold text-theme-text-secondary hover:bg-theme-cell-hover"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateCustomTag}
                            style={{
                              backgroundColor: 'var(--t-accent)',
                              color: 'var(--t-accent-contrast)',
                            }}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-bold shadow-sm hover:opacity-95"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Save &amp; Select
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Footer Row: Remove (when editing) & Save Pill Button */}
            <div className="pt-4 flex items-center justify-between gap-3">
              {isEditing && view.id && onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(view.id!)}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              ) : (
                <div />
              )}

              <button
                type="submit"
                style={{
                  backgroundColor: 'var(--t-accent)',
                  color: 'var(--t-accent-contrast)',
                }}
                className="rounded-full px-7 py-2.5 text-sm font-bold shadow-sm hover:opacity-95 active:scale-[0.98] transition-all"
              >
                Save
              </button>
            </div>
          </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====================================================================
          FLOATING GOOGLE CALENDAR–STYLE POPOVERS (Date, Start Time, End Time, Repeat)
          Rendered at fixed viewport coordinates inside the themed tree so they
          never clip or force scrollbars inside the modal card.
         ==================================================================== */}
      <AnimatePresence>
      {activePicker && popoverCoords && (
        <motion.div
          ref={floatingPopoverRef}
          variants={popoverVariants}
          initial="enter"
          animate="center"
          exit="exit"
          onClick={(e) => e.stopPropagation()}
          style={{
            top: popoverCoords.top,
            left: popoverCoords.left,
            width: popoverCoords.width,
            transformOrigin: 'top center',
          }}
          className="fixed z-[60] rounded-xl border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg overflow-hidden gpu-layer"
        >
          {/* 1. MINI MONTH CALENDAR POPOVER (Screenshot 1) */}
          {activePicker === 'date' && (
            <div className="p-4 select-none">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-theme-text pl-1">
                  {format(calendarMonth, 'MMMM yyyy')}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((m) => addMonths(m, -1))}
                    className="p-1.5 rounded-full text-theme-text-secondary hover:bg-theme-cell-hover hover:text-theme-text transition-colors"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
                    className="p-1.5 rounded-full text-theme-text-secondary hover:bg-theme-cell-hover hover:text-theme-text transition-colors"
                    aria-label="Next month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* S M T W T F S Header */}
              <div className="grid grid-cols-7 mb-1">
                {MINI_WEEKDAY_HEADERS.map((letter, idx) => (
                  <div
                    key={idx}
                    className="h-7 flex items-center justify-center text-[11px] font-semibold text-theme-text-muted"
                  >
                    {letter}
                  </div>
                ))}
              </div>

              {/* 6-Week Day Grid */}
              <div className="grid grid-cols-7 gap-y-0.5">
                {miniCalendarDays.map((day) => {
                  const inMonth = day.getMonth() === calendarMonth.getMonth();
                  const selected = isSameDay(day, parsedStartDate);
                  const isTodayDay = isSameDay(day, today);

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        handleSelectSingleDate(day);
                      }}
                      onClick={(e) => {
                        if (e.button !== 0) return;
                        handleSelectSingleDate(day);
                      }}
                      style={
                        selected
                          ? {
                              backgroundColor: 'var(--t-accent)',
                              color: 'var(--t-accent-contrast)',
                            }
                          : undefined
                      }
                      className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs tabular-nums transition-colors ${
                        selected
                          ? 'font-bold shadow-sm'
                          : isTodayDay
                            ? 'bg-theme-accent-soft text-theme-accent font-bold'
                            : inMonth
                              ? 'text-theme-text font-medium hover:bg-theme-cell-hover'
                              : 'text-theme-text-muted hover:bg-theme-cell-hover'
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. START TIME DROPDOWN (Screenshot 2: 15-min slots) */}
          {activePicker === 'startTime' && (
            <div
              ref={timeListboxRef}
              role="listbox"
              aria-label="Start time options"
              className="relative max-h-[210px] overflow-y-auto themed-scroll py-1.5"
            >
              {startTimeOptions.map((mins) => {
                const isHighlighted = mins === highlightedStartMinutes;
                return (
                  <button
                    key={mins}
                    ref={isHighlighted ? activeOptionRef : null}
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    // Left-click is applied on `onPointerDown` (covers mouse, pen
                    // and touch) so the choice lands before the input can blur.
                    // `preventDefault` keeps focus inside the input so the picker
                    // does not close underneath the click. Keyboard activation is
                    // handled by `onClick`, which also fires for synthetic clicks
                    // (assistive tech) and for left-button clicks if a pointerdown
                    // was swallowed by a browser gesture.
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      handlePickStartTime(mins);
                    }}
                    onClick={(e) => {
                      if (e.button !== 0) return;
                      handlePickStartTime(mins);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm tabular-nums transition-colors ${
                      isHighlighted
                        ? 'bg-theme-elevated text-theme-text font-semibold'
                        : 'text-theme-text hover:bg-theme-cell-hover'
                    }`}
                  >
                    {formatMinutes12h(mins)}
                  </button>
                );
              })}
            </div>
          )}

          {/* 3. END TIME DROPDOWN WITH DURATION LABELS (Screenshot 3) */}
          {activePicker === 'endTime' && (
            <div
              ref={timeListboxRef}
              role="listbox"
              aria-label="End time options"
              className="relative max-h-[210px] overflow-y-auto themed-scroll py-1.5"
            >
              {endTimeOptions.map(({ mins, durationLabel }) => {
                const isHighlighted = mins === highlightedEndMinutes;
                return (
                  <button
                    key={mins}
                    ref={isHighlighted ? activeOptionRef : null}
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      handlePickEndTime(mins);
                    }}
                    onClick={(e) => {
                      if (e.button !== 0) return;
                      handlePickEndTime(mins);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm tabular-nums transition-colors ${
                      isHighlighted
                        ? 'bg-theme-elevated text-theme-text font-semibold'
                        : 'text-theme-text hover:bg-theme-cell-hover'
                    }`}
                  >
                    {formatMinutes12h(mins)} ({durationLabel})
                  </button>
                );
              })}
            </div>
          )}

          {/* 4. REPEAT DROPDOWN */}
          {activePicker === 'repeat' && (
            <div role="listbox" aria-label="Repeat options" className="py-1.5">
              {presetOptions.map((opt) => {
                const isSelected = view.recurrence === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      setDraft((p) => ({
                        ...p,
                        recurrence: opt.value,
                      }));
                      setActivePicker(null);
                    }}
                    onClick={(e) => {
                      if (e.button !== 0) return;
                      setDraft((p) => ({
                        ...p,
                        recurrence: opt.value,
                      }));
                      setActivePicker(null);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between gap-2 transition-colors ${
                      isSelected
                        ? 'bg-theme-elevated text-theme-text font-semibold'
                        : 'text-theme-text hover:bg-theme-cell-hover'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}

              <div className="my-1 border-t border-theme-border/70" />

              <button
                type="button"
                role="option"
                aria-selected={view.recurrence === 'custom'}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  setActivePicker(null);
                  setCustomModalOpen(true);
                }}
                className={`w-full px-4 py-2 text-left text-sm font-semibold flex items-center justify-between gap-2 transition-colors ${
                  view.recurrence === 'custom'
                    ? 'bg-theme-elevated text-theme-accent'
                    : 'text-theme-accent hover:bg-theme-cell-hover'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Custom...
                </span>
                {view.recurrence === 'custom' && (
                  <Check className="w-4 h-4 shrink-0" />
                )}
              </button>
            </div>
          )}
        </motion.div>
      )}
      </AnimatePresence>

      {/* Nested Themed Custom Recurrence Dialog */}
      <CustomRecurrenceModal
        isOpen={customModalOpen}
        startDateStr={view.start}
        endDateStr={view.end}
        initialConfig={view.customRecurrence}
        onCancel={() => setCustomModalOpen(false)}
        onDone={handleCustomRecurrenceDone}
      />
    </>
  );
};
