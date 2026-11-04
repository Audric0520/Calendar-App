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

interface EventFormModalProps {
  isOpen: boolean;
  initialDraft: EventDraft;
  categories: CategoryMeta[];
  onAddCustomCategory: (label: string, color: string) => CategoryTag;
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

function parseFlexibleTimeToMinutes(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(a|am|p|pm)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] !== undefined ? Number(match[2]) : 0;
  const meridiem = match[3];

  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) {
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
  } else {
    if (hours < 0 || hours > 23) return null;
  }

  return hours * 60 + minutes;
}

function formatDurationLabel(diffMins: number): string {
  if (diffMins <= 0) return '0 mins';
  if (diffMins < 60) return diffMins === 1 ? '1 min' : `${diffMins} mins`;
  if (diffMins === 60) return '1 hr';
  if (diffMins % 30 === 0) return `${diffMins / 60} hrs`;
  const hrs = Math.floor(diffMins / 60);
  const rem = diffMins % 60;
  return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'} ${rem} ${rem === 1 ? 'min' : 'mins'}`;
}

function buildStartTimeOptions(currentStartMins: number): number[] {
  const list: number[] = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    list.push(m);
  }
  if (!list.includes(currentStartMins)) {
    list.push(currentStartMins);
    list.sort((a, b) => a - b);
  }
  return list;
}

function buildEndTimeOptions(
  startMins: number,
  currentEndMins: number
): { mins: number; durationLabel: string }[] {
  const minsSet = new Set<number>();
  const quarterSteps = [0, 15, 30, 45, 60];
  for (const offset of quarterSteps) {
    const candidate = startMins + offset;
    if (candidate < 24 * 60) {
      minsSet.add(candidate);
    }
  }
  for (let offset = 90; startMins + offset < 24 * 60; offset += 30) {
    minsSet.add(startMins + offset);
  }
  if (currentEndMins >= startMins && currentEndMins < 24 * 60) {
    minsSet.add(currentEndMins);
  }
  if (minsSet.size <= 1 && startMins < 23 * 60 + 59) {
    minsSet.add(23 * 60 + 59);
  }

  return Array.from(minsSet)
    .sort((a, b) => a - b)
    .map((m) => ({
      mins: m,
      durationLabel: formatDurationLabel(m - startMins),
    }));
}

export const EventFormModal: React.FC<EventFormModalProps> = ({
  isOpen,
  initialDraft,
  categories,
  onAddCustomCategory,
  onDeleteCustomCategory,
  onClose,
  onSave,
  onDelete,
}) => {
  const [draft, setDraft] = useState<EventDraft>(initialDraft);
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
  const activeOptionRef = useRef<HTMLButtonElement | null>(null);

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
      setCalendarMonth(startOfMonth(sParsed));
      setStartTimeText(formatMinutes12h(sMins));
      setEndTimeText(formatMinutes12h(eMins));

      const existingUrl = initialDraft.imageUrl || '';
      const isExternal = /^https?:\/\//i.test(existingUrl);
      setImageMode(isExternal ? 'url' : 'upload');
      setUrlInput(isExternal ? existingUrl : '');
      setImageError(null);
      setValidationError(null);

      const hasDescOrMedia = Boolean(
        initialDraft.description?.trim() || initialDraft.imageUrl
      );
      setScheduleExpanded(false);
      setActivePicker(null);
      setPopoverCoords(null);
      setDetailsExpanded(hasDescOrMedia);
      setShowAttachmentBox(Boolean(initialDraft.imageUrl));
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

  // Auto-scroll active time option to center when Start/End time dropdown opens
  useEffect(() => {
    if (activePicker === 'startTime' || activePicker === 'endTime') {
      const raf = window.requestAnimationFrame(() => {
        activeOptionRef.current?.scrollIntoView({ block: 'center' });
      });
      return () => window.cancelAnimationFrame(raf);
    }
  }, [activePicker, popoverCoords]);

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

  const startTimeOptions = useMemo(
    () => buildStartTimeOptions(startMinutes),
    [startMinutes]
  );
  const endTimeOptions = useMemo(
    () => buildEndTimeOptions(startMinutes, endMinutes),
    [endMinutes, startMinutes]
  );

  const miniCalendarDays = useMemo(() => {
    const firstOfMonth = startOfMonth(calendarMonth);
    const gridStart = startOfWeek(firstOfMonth, { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, idx) => addDays(gridStart, idx));
  }, [calendarMonth]);

  if (!isOpen) return null;

  const isEditing = Boolean(draft.id);
  const dateStr = formatDateInput(parsedStartDate);

  const categoryMapObj: Record<string, CategoryMeta> = {};
  for (const c of categories) {
    categoryMapObj[c.id] = c;
  }
  const selectedCategoryMeta = resolveCategoryMeta(
    draft.category,
    categoryMapObj
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
    recurrence: draft.recurrence,
    recurrenceUntil: draft.recurrenceUntil,
    customRecurrence: draft.customRecurrence,
    start: draft.start,
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
    const prevDuration = Math.max(0, endMinutes - startMinutes);
    const fallbackDuration = prevDuration > 0 ? prevDuration : 60;
    const nextEndMins = Math.min(23 * 60 + 59, newStartMins + fallbackDuration);

    lastTimedRangeRef.current = {
      startMins: newStartMins,
      endMins: nextEndMins,
    };

    setDraft((prev) => ({
      ...prev,
      start: `${dateStr}T${minutesToHHmm(newStartMins)}`,
      end: `${dateStr}T${minutesToHHmm(nextEndMins)}`,
    }));
    setStartTimeText(formatMinutes12h(newStartMins));
    setEndTimeText(formatMinutes12h(nextEndMins));
  };

  const applyEndMinutes = (newEndMins: number) => {
    setValidationError(null);
    const safeEnd = Math.max(0, Math.min(23 * 60 + 59, newEndMins));
    lastTimedRangeRef.current = {
      startMins: startMinutes,
      endMins: Math.max(startMinutes, safeEnd),
    };

    setDraft((prev) => ({
      ...prev,
      end: `${dateStr}T${minutesToHHmm(safeEnd)}`,
    }));
    setEndTimeText(formatMinutes12h(safeEnd));
  };

  const commitTypedStartTime = () => {
    const parsed = parseFlexibleTimeToMinutes(startTimeText);
    if (parsed === null) {
      setStartTimeText(formatMinutes12h(startMinutes));
      return;
    }
    applyStartMinutes(parsed);
  };

  const commitTypedEndTime = () => {
    const parsed = parseFlexibleTimeToMinutes(endTimeText);
    if (parsed === null) {
      setEndTimeText(formatMinutes12h(endMinutes));
      return;
    }
    applyEndMinutes(parsed);
  };

  const handleToggleAllDay = (checked: boolean) => {
    setValidationError(null);
    setActivePicker(null);
    if (checked) {
      lastTimedRangeRef.current = {
        startMins: startMinutes,
        endMins: Math.max(startMinutes, endMinutes),
      };
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

  const handleCreateCustomTag = () => {
    const cleanLabel = newTagLabel.trim();
    if (!cleanLabel) {
      setTagError('Please enter a tag name.');
      newTagInputRef.current?.focus();
      return;
    }
    const duplicate = categories.some(
      (c) => c.label.toLowerCase() === cleanLabel.toLowerCase()
    );
    if (duplicate) {
      setTagError('A tag with that name already exists.');
      return;
    }

    const created = onAddCustomCategory(cleanLabel, newTagColor);
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
        imageName: result.fileName,
      }));
    } catch (err) {
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
        imageName: undefined,
      }));
      return;
    }
    setDraft((prev) => ({
      ...prev,
      imageUrl: trimmed,
      imageName: 'External Image URL',
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = draft.title.trim();
    if (!cleanTitle) {
      setValidationError(
        `Please enter a title for your ${draft.isTask ? 'task' : 'event'}.`
      );
      titleInputRef.current?.focus();
      return;
    }

    const sDate = parseLocalDateTime(draft.start);
    const eDate = parseLocalDateTime(draft.end);
    if (eDate < sDate) {
      setValidationError('End time must be after start time.');
      setScheduleExpanded(true);
      return;
    }

    onSave({
      ...draft,
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
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[540px] max-h-[92vh] flex flex-col rounded-[28px] border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg overflow-hidden"
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
                value={draft.title}
                onChange={(e) => {
                  setValidationError(null);
                  setDraft((p) => ({ ...p, title: e.target.value }));
                }}
                placeholder="Add title"
                className="w-full bg-transparent text-[22px] sm:text-2xl font-normal text-theme-text placeholder:text-theme-text-muted pb-1.5 border-b-2 border-theme-border focus:border-theme-accent focus:outline-none transition-colors"
              />

              {/* Event | Task Switcher (Only existing functions) */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, isTask: false }))}
                  className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm transition-all ${
                    !draft.isTask
                      ? 'bg-theme-accent-soft text-theme-accent font-semibold ring-1 ring-theme-accent/35'
                      : 'text-theme-text-secondary hover:bg-theme-cell-hover hover:text-theme-text font-medium'
                  }`}
                >
                  Event
                </button>
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, isTask: true }))}
                  className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm transition-all ${
                    draft.isTask
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

                    {!draft.allDay && (
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
                    <span>{draft.allDay ? 'All day' : 'Scheduled time'}</span>
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
                    {!draft.allDay && (
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
                            onChange={(e) => setStartTimeText(e.target.value)}
                            onBlur={commitTypedStartTime}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
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
                            onChange={(e) => setEndTimeText(e.target.value)}
                            onBlur={commitTypedEndTime}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
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
                      aria-checked={draft.allDay}
                      tabIndex={0}
                      onClick={() => handleToggleAllDay(!draft.allDay)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleToggleAllDay(!draft.allDay);
                        }
                      }}
                      className="inline-flex items-center gap-3.5 cursor-pointer select-none group py-0.5"
                    >
                      <span
                        style={
                          draft.allDay
                            ? {
                                backgroundColor: 'var(--t-accent)',
                                borderColor: 'var(--t-accent)',
                                color: 'var(--t-accent-contrast)',
                              }
                            : undefined
                        }
                        className={`w-[18px] h-[18px] rounded-[4px] flex items-center justify-center transition-colors ${
                          draft.allDay
                            ? ''
                            : 'border-2 border-theme-text-secondary group-hover:border-theme-text bg-transparent'
                        }`}
                      >
                        {draft.allDay && (
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

                    {draft.recurrence === 'custom' && (
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
                  value={draft.location}
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
                      value={draft.description}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, description: e.target.value }))
                      }
                      placeholder="Add description"
                      className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text placeholder:text-theme-text-muted focus:outline-none focus:border-theme-border-strong resize-y"
                    />

                    {/* Attachment Toggle or Panel */}
                    {!showAttachmentBox && !draft.imageUrl ? (
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

                        {draft.imageUrl && (
                          <div className="relative rounded-xl overflow-hidden border border-theme-border bg-black/10">
                            <img
                              src={draft.imageUrl}
                              alt="Attachment preview"
                              className="w-full max-h-40 object-cover"
                              onError={() =>
                                setImageError(
                                  'Unable to load preview from that URL. Check the image address.'
                                )
                              }
                            />
                            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-theme-surface/95 border-t border-theme-border">
                              <span className="text-[11px] font-medium text-theme-text-secondary truncate">
                                {draft.imageName || 'Attached image'}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setUrlInput('');
                                  setImageError(null);
                                  setDraft((p) => ({
                                    ...p,
                                    imageUrl: undefined,
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
                        style={{ backgroundColor: selectedCategoryMeta.color }}
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm ring-1 ring-black/10"
                      />
                    </div>
                    <div className="text-xs text-theme-text-secondary mt-0.5">
                      Notify 10 minutes before
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
                        Choose tag
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
                        {isAddingTag ? 'Cancel New Tag' : 'Add New Tag'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {categories.map((cat) => {
                        const selected = draft.category === cat.id;
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
                                  if (draft.category === cat.id) {
                                    setDraft((p) => ({
                                      ...p,
                                      category: 'class-sched',
                                    }));
                                  }
                                  onDeleteCustomCategory(cat.id);
                                }}
                                className="opacity-0 group-hover/tag:opacity-100 focus:opacity-100 mr-1.5 p-1 rounded-md text-theme-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-opacity"
                                title={`Delete custom tag "${cat.label}"`}
                                aria-label={`Delete custom tag ${cat.label}`}
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
                            Create Custom Tag
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

            {/* Bottom Footer Row: Delete (when editing) & Save Pill Button */}
            <div className="pt-4 flex items-center justify-between gap-3">
              {isEditing && draft.id && onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(draft.id!)}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
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
        </div>
      </div>

      {/* ====================================================================
          FLOATING GOOGLE CALENDAR–STYLE POPOVERS (Date, Start Time, End Time, Repeat)
          Rendered at fixed viewport coordinates inside the themed tree so they
          never clip or force scrollbars inside the modal card.
         ==================================================================== */}
      {activePicker && popoverCoords && (
        <div
          ref={floatingPopoverRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            top: popoverCoords.top,
            left: popoverCoords.left,
            width: popoverCoords.width,
          }}
          className="fixed z-[60] rounded-xl border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg overflow-hidden"
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
                      onMouseDown={(e) => {
                        e.preventDefault();
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
              role="listbox"
              aria-label="Start time options"
              className="max-h-[210px] overflow-y-auto themed-scroll py-1.5"
            >
              {startTimeOptions.map((mins) => {
                const isSelected = mins === startMinutes;
                return (
                  <button
                    key={mins}
                    ref={isSelected ? activeOptionRef : null}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyStartMinutes(mins);
                      setActivePicker(null);
                      startTimeInputRef.current?.blur();
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm tabular-nums transition-colors ${
                      isSelected
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
              role="listbox"
              aria-label="End time options"
              className="max-h-[210px] overflow-y-auto themed-scroll py-1.5"
            >
              {endTimeOptions.map(({ mins, durationLabel }) => {
                const isSelected = mins === endMinutes;
                return (
                  <button
                    key={mins}
                    ref={isSelected ? activeOptionRef : null}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyEndMinutes(mins);
                      setActivePicker(null);
                      endTimeInputRef.current?.blur();
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm tabular-nums transition-colors ${
                      isSelected
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
                const isSelected = draft.recurrence === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault();
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
                aria-selected={draft.recurrence === 'custom'}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setActivePicker(null);
                  setCustomModalOpen(true);
                }}
                className={`w-full px-4 py-2 text-left text-sm font-semibold flex items-center justify-between gap-2 transition-colors ${
                  draft.recurrence === 'custom'
                    ? 'bg-theme-elevated text-theme-accent'
                    : 'text-theme-accent hover:bg-theme-cell-hover'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Custom...
                </span>
                {draft.recurrence === 'custom' && (
                  <Check className="w-4 h-4 shrink-0" />
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Nested Themed Custom Recurrence Dialog */}
      <CustomRecurrenceModal
        isOpen={customModalOpen}
        startDateStr={draft.start}
        initialConfig={draft.customRecurrence}
        onCancel={() => setCustomModalOpen(false)}
        onDone={handleCustomRecurrenceDone}
      />
    </>
  );
};
