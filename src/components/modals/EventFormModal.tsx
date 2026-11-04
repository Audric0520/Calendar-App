import React, { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  AlignLeft,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  Clock,
  ImagePlus,
  Link2,
  MapPin,
  Pipette,
  Plus,
  Repeat,
  SlidersHorizontal,
  Tag,
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
} from '../../constants/categories';
import { processUploadedImageFile } from '../../utils/imageHelper';
import {
  formatDateInput,
  formatLocalDateTime,
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

  // Repeat dropdown & Custom Recurrence dialog state
  const [repeatDropdownOpen, setRepeatDropdownOpen] = useState(false);
  const [customModalOpen, setCustomModalOpen] = useState(false);

  // New Custom Tag inline creator state
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState('#f43f5e');
  const [tagError, setTagError] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const newTagInputRef = useRef<HTMLInputElement | null>(null);
  const repeatDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(initialDraft);
      const existingUrl = initialDraft.imageUrl || '';
      const isExternal = /^https?:\/\//i.test(existingUrl);
      setImageMode(isExternal ? 'url' : 'upload');
      setUrlInput(isExternal ? existingUrl : '');
      setImageError(null);
      setValidationError(null);
      setRepeatDropdownOpen(false);
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

  useEffect(() => {
    if (!isOpen || customModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (repeatDropdownOpen) setRepeatDropdownOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [customModalOpen, isOpen, onClose, repeatDropdownOpen]);

  useEffect(() => {
    if (!repeatDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        repeatDropdownRef.current &&
        !repeatDropdownRef.current.contains(e.target as Node)
      ) {
        setRepeatDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [repeatDropdownOpen]);

  if (!isOpen) return null;

  const isEditing = Boolean(draft.id);
  const parsedStartDate = parseLocalDateTime(draft.start);

  const presetOptions: { value: Exclude<RecurrenceRule, 'custom'>; label: string }[] = [
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

  const handleStartChange = (newStartValue: string) => {
    if (draft.allDay) {
      const nextStart = `${newStartValue}T00:00`;
      const currentEndDay = draft.end.split('T')[0];
      const nextEnd =
        currentEndDay < newStartValue ? `${newStartValue}T23:59` : draft.end;
      setDraft((prev) => ({ ...prev, start: nextStart, end: nextEnd }));
    } else {
      const prevStart = parseLocalDateTime(draft.start);
      const prevEnd = parseLocalDateTime(draft.end);
      const durationMs = Math.max(
        30 * 60 * 1000,
        prevEnd.getTime() - prevStart.getTime()
      );
      const nextStartDate = parseLocalDateTime(newStartValue);
      const nextEndDate = new Date(nextStartDate.getTime() + durationMs);
      setDraft((prev) => ({
        ...prev,
        start: newStartValue,
        end: formatLocalDateTime(nextEndDate),
      }));
    }
  };

  const handleEndChange = (newEndValue: string) => {
    if (draft.allDay) {
      setDraft((prev) => ({ ...prev, end: `${newEndValue}T23:59` }));
    } else {
      setDraft((prev) => ({ ...prev, end: newEndValue }));
    }
  };

  const handleToggleAllDay = (checked: boolean) => {
    const startDay = draft.start.split('T')[0];
    const endDay = draft.end.split('T')[0];
    if (checked) {
      setDraft((prev) => ({
        ...prev,
        allDay: true,
        start: `${startDay}T00:00`,
        end: `${endDay < startDay ? startDay : endDay}T23:59`,
      }));
    } else {
      setDraft((prev) => ({
        ...prev,
        allDay: false,
        start: `${startDay}T09:00`,
        end: `${startDay}T10:00`,
      }));
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
      setValidationError('End date/time must be after start date/time.');
      return;
    }

    onSave({
      ...draft,
      title: cleanTitle,
      location: draft.location.trim(),
      description: draft.description.trim(),
    });
  };

  const startDateOnly = formatDateInput(parsedStartDate);
  const endDateOnly = formatDateInput(parseLocalDateTime(draft.end));
  const previewMeta = buildCategoryMeta({
    id: 'preview',
    label: newTagLabel.trim() || 'New Tag Preview',
    color: newTagColor,
  });

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg overflow-hidden"
        >
          {/* Header */}
          <div
            style={{ backgroundImage: 'var(--t-header-gradient)' }}
            className="px-5 py-4 border-b border-theme-border flex items-center justify-between gap-3 shrink-0"
          >
            <div className="flex items-center gap-2.5">
              <span
                style={{
                  backgroundColor: 'var(--t-accent)',
                  color: 'var(--t-accent-contrast)',
                }}
                className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm"
              >
                <Calendar className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-base font-extrabold text-theme-text">
                  {isEditing
                    ? `Edit ${draft.isTask ? 'Task' : 'Event'}`
                    : `Create New ${draft.isTask ? 'Task' : 'Event'}`}
                </h2>
                <p className="text-[11px] text-theme-text-secondary">
                  10-minute automated pre-event alert enabled automatically
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-theme-text-secondary hover:bg-theme-cell-hover transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Body */}
          <form
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto themed-scroll p-5 space-y-4"
          >
            {validationError && (
              <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-3.5 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-300">
                {validationError}
              </div>
            )}

            {/* Event vs Task Segmented Control */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraft((p) => ({ ...p, isTask: false }))}
                style={
                  !draft.isTask
                    ? {
                        backgroundColor: 'var(--t-accent)',
                        color: 'var(--t-accent-contrast)',
                      }
                    : undefined
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  !draft.isTask
                    ? 'shadow-sm'
                    : 'bg-theme-elevated border border-theme-border text-theme-text-secondary'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Event
              </button>
              <button
                type="button"
                onClick={() => setDraft((p) => ({ ...p, isTask: true }))}
                style={
                  draft.isTask
                    ? {
                        backgroundColor: 'var(--t-accent)',
                        color: 'var(--t-accent-contrast)',
                      }
                    : undefined
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  draft.isTask
                    ? 'shadow-sm'
                    : 'bg-theme-elevated border border-theme-border text-theme-text-secondary'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                Task
              </button>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-theme-text-secondary mb-1.5">
                Title *
              </label>
              <input
                ref={titleInputRef}
                type="text"
                value={draft.title}
                onChange={(e) => {
                  setValidationError(null);
                  setDraft((p) => ({ ...p, title: e.target.value }));
                }}
                placeholder={
                  draft.isTask
                    ? 'e.g., Submit Operating Systems Problem Set'
                    : 'e.g., Algorithms Lecture'
                }
                className="w-full rounded-xl border border-theme-border bg-theme-elevated px-3.5 py-2.5 text-sm font-semibold text-theme-text placeholder:text-theme-text-muted/65 focus:outline-none focus:border-theme-border-strong"
              />
            </div>

            {/* Date/Time, All-Day Toggle & Repeat Schedule */}
            <div className="rounded-xl border border-theme-border bg-theme-elevated/65 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-theme-text">
                  <Clock className="w-3.5 h-3.5 text-theme-accent" />
                  Schedule &amp; Duration
                </span>

                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={draft.allDay}
                    onChange={(e) => handleToggleAllDay(e.target.checked)}
                    className="rounded accent-blue-600 w-4 h-4"
                  />
                  <span className="text-xs font-semibold text-theme-text-secondary">
                    All-day
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-theme-text-muted mb-1">
                    Starts
                  </label>
                  {draft.allDay ? (
                    <input
                      type="date"
                      value={startDateOnly}
                      onChange={(e) => handleStartChange(e.target.value)}
                      className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-xs font-semibold text-theme-text focus:outline-none focus:border-theme-border-strong"
                    />
                  ) : (
                    <input
                      type="datetime-local"
                      value={draft.start.slice(0, 16)}
                      onChange={(e) => handleStartChange(e.target.value)}
                      className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-xs font-semibold text-theme-text focus:outline-none focus:border-theme-border-strong"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-theme-text-muted mb-1">
                    Ends
                  </label>
                  {draft.allDay ? (
                    <input
                      type="date"
                      value={endDateOnly}
                      min={startDateOnly}
                      onChange={(e) => handleEndChange(e.target.value)}
                      className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-xs font-semibold text-theme-text focus:outline-none focus:border-theme-border-strong"
                    />
                  ) : (
                    <input
                      type="datetime-local"
                      value={draft.end.slice(0, 16)}
                      onChange={(e) => handleEndChange(e.target.value)}
                      className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-xs font-semibold text-theme-text focus:outline-none focus:border-theme-border-strong"
                    />
                  )}
                </div>
              </div>

              {/* Repeat Selector (Presets + Custom Recurrence Modal Trigger) */}
              <div className="pt-2.5 border-t border-theme-border/60 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-theme-text-muted">
                    <Repeat className="w-3 h-3 text-theme-accent" />
                    Repeat
                  </label>

                  {draft.recurrence === 'custom' && (
                    <button
                      type="button"
                      onClick={() => setCustomModalOpen(true)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-theme-accent hover:underline"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      Edit custom repeat
                    </button>
                  )}
                </div>

                <div ref={repeatDropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setRepeatDropdownOpen((o) => !o)}
                    aria-haspopup="listbox"
                    aria-expanded={repeatDropdownOpen}
                    className="w-full rounded-lg border border-theme-border hover:border-theme-border-strong bg-theme-surface px-3 py-2.5 flex items-center justify-between gap-2 text-xs font-semibold text-theme-text transition-colors text-left"
                  >
                    <span className="truncate">{activeRepeatLabel}</span>
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 text-theme-text-secondary transition-transform ${
                        repeatDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {repeatDropdownOpen && (
                    <div
                      role="listbox"
                      className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-xl border border-theme-border bg-theme-surface shadow-theme-lg py-1.5 overflow-hidden"
                    >
                      {presetOptions.map((opt) => {
                        const isSelected = draft.recurrence === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              setDraft((p) => ({
                                ...p,
                                recurrence: opt.value,
                              }));
                              setRepeatDropdownOpen(false);
                            }}
                            className={`w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center justify-between gap-2 transition-colors ${
                              isSelected
                                ? 'bg-theme-accent-soft text-theme-accent font-bold'
                                : 'text-theme-text hover:bg-theme-cell-hover'
                            }`}
                          >
                            <span>{opt.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                          </button>
                        );
                      })}

                      <div className="my-1 border-t border-theme-border/70" />

                      <button
                        type="button"
                        role="option"
                        aria-selected={draft.recurrence === 'custom'}
                        onClick={() => {
                          setRepeatDropdownOpen(false);
                          setCustomModalOpen(true);
                        }}
                        className={`w-full px-3.5 py-2 text-left text-xs font-bold flex items-center justify-between gap-2 transition-colors ${
                          draft.recurrence === 'custom'
                            ? 'bg-theme-accent-soft text-theme-accent'
                            : 'text-theme-accent hover:bg-theme-cell-hover'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          Custom...
                        </span>
                        {draft.recurrence === 'custom' && (
                          <Check className="w-3.5 h-3.5 shrink-0" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Category / Color Tag + Custom Tag Creator */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-theme-text-secondary">
                  <Tag className="w-3.5 h-3.5" />
                  Category &amp; Color Tag
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setIsAddingTag((open) => !open);
                    setTagError(null);
                    window.setTimeout(() => newTagInputRef.current?.focus(), 30);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-theme-border bg-theme-elevated hover:bg-theme-cell-hover px-2.5 py-1 text-[11px] font-bold text-theme-accent transition-colors"
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
                          : 'border-theme-border bg-theme-elevated text-theme-text-secondary hover:bg-theme-cell-hover'
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
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm ring-1 ring-black/10"
                        />
                        <span className="truncate">{cat.label}</span>
                      </button>

                      {cat.isCustom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (draft.category === cat.id) {
                              setDraft((p) => ({ ...p, category: 'class-sched' }));
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

              {/* Inline Custom Tag & Color Picker Panel */}
              {isAddingTag && (
                <div className="rounded-xl border border-theme-border-strong/60 bg-theme-elevated p-3.5 space-y-3 shadow-sm">
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

                  <div>
                    <label className="block text-[11px] font-semibold text-theme-text-muted mb-1">
                      Tag Name
                    </label>
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
                      placeholder="e.g., Lab Group, Study Club, Thesis..."
                      maxLength={28}
                      className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-xs font-semibold text-theme-text placeholder:text-theme-text-muted/65 focus:outline-none focus:border-theme-border-strong"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-theme-text-muted mb-1.5">
                      Choose Tag Color
                    </label>
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
                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform shadow-sm ${
                              active
                                ? 'scale-110 ring-2 ring-offset-2 ring-theme-text'
                                : 'hover:scale-105 opacity-90 hover:opacity-100'
                            }`}
                            title={hex}
                          >
                            {active && (
                              <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                            )}
                          </button>
                        );
                      })}

                      {/* Native Custom Color Spectrum Picker */}
                      <label
                        className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-surface hover:bg-theme-cell-hover px-2.5 py-1 text-[11px] font-bold text-theme-text cursor-pointer ml-auto"
                        title="Pick any custom color"
                      >
                        <Pipette className="w-3.5 h-3.5 text-theme-accent" />
                        <span>Custom</span>
                        <input
                          type="color"
                          value={newTagColor}
                          onChange={(e) => setNewTagColor(e.target.value)}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                        />
                      </label>
                    </div>
                  </div>

                  {tagError && (
                    <p className="text-[11px] font-semibold text-rose-500">
                      {tagError}
                    </p>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingTag(false);
                        setTagError(null);
                      }}
                      className="rounded-lg border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-text-secondary hover:bg-theme-cell-hover"
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
                      className="inline-flex items-center gap-1 rounded-lg px-3.5 py-1.5 text-xs font-bold shadow-sm hover:opacity-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Save &amp; Select Tag
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Location */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-theme-text-secondary mb-1.5">
                <MapPin className="w-3.5 h-3.5" />
                Location
              </label>
              <input
                type="text"
                value={draft.location}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, location: e.target.value }))
                }
                placeholder="Add room, campus hall, or video call link"
                className="w-full rounded-xl border border-theme-border bg-theme-elevated px-3.5 py-2 text-xs sm:text-sm text-theme-text placeholder:text-theme-text-muted/65 focus:outline-none focus:border-theme-border-strong"
              />
            </div>

            {/* Description */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-theme-text-secondary mb-1.5">
                <AlignLeft className="w-3.5 h-3.5" />
                Description
              </label>
              <textarea
                rows={3}
                value={draft.description}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="Add syllabus notes, preparation links, or details..."
                className="w-full rounded-xl border border-theme-border bg-theme-elevated px-3.5 py-2 text-xs sm:text-sm text-theme-text placeholder:text-theme-text-muted/65 focus:outline-none focus:border-theme-border-strong resize-y"
              />
            </div>

            {/* Multimedia Attachment: Upload PNG/JPG/WebP OR Paste Image URL */}
            <div className="rounded-xl border border-theme-border bg-theme-elevated/65 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-theme-text">
                  <ImagePlus className="w-4 h-4 text-theme-accent" />
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
                      imageMode === 'upload' ? '' : 'text-theme-text-secondary'
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
                      imageMode === 'url' ? '' : 'text-theme-text-secondary'
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
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-theme-accent bg-theme-accent-soft'
                      : 'border-theme-border hover:border-theme-border-strong bg-theme-surface/75'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => handleFileSelected(e.target.files?.[0])}
                    className="hidden"
                  />
                  <Upload className="w-5 h-5 mx-auto text-theme-accent mb-1" />
                  <p className="text-xs font-semibold text-theme-text">
                    Click to choose or drag &amp; drop an image
                  </p>
                  <p className="text-[11px] text-theme-text-muted mt-0.5">
                    Supports PNG, JPG, and WebP — stored locally in IndexedDB
                  </p>
                </div>
              ) : (
                <div>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => handleApplyUrl(e.target.value)}
                    placeholder="https://example.com/event-banner.webp"
                    className="w-full rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-xs text-theme-text placeholder:text-theme-text-muted/65 focus:outline-none focus:border-theme-border-strong"
                  />
                </div>
              )}

              {imageError && (
                <p className="text-xs font-semibold text-rose-500">{imageError}</p>
              )}

              {draft.imageUrl && (
                <div className="relative rounded-xl overflow-hidden border border-theme-border bg-black/10">
                  <img
                    src={draft.imageUrl}
                    alt="Attachment preview"
                    className="w-full max-h-44 object-cover"
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

            {/* Modal Footer Actions */}
            <div className="pt-2 flex items-center justify-between gap-3">
              {isEditing && draft.id && onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(draft.id!)}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold border border-theme-border text-theme-text-secondary hover:bg-theme-cell-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    backgroundColor: 'var(--t-accent)',
                    color: 'var(--t-accent-contrast)',
                  }}
                  className="rounded-xl px-5 py-2.5 text-xs font-bold shadow-sm hover:opacity-95 transition-opacity"
                >
                  {isEditing
                    ? 'Save Changes'
                    : `Save ${draft.isTask ? 'Task' : 'Event'}`}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

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
