import React, { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  AlignLeft,
  BellRing,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  Edit3,
  MapPin,
  Maximize2,
  Repeat,
  Trash2,
  X,
} from 'lucide-react';
import { EventOccurrence } from '../../types/calendar';
import { CategoryMeta, resolveCategoryMeta } from '../../constants/categories';
import { formatRecurrenceSummary } from '../../utils/calendarMath';
import { AnimatePresence, motion } from 'framer-motion';
import {
  EXIT_MEDIUM,
  modalBackdropVariants,
  modalPanelVariants,
} from '../../motion/presets';
import { SkeletonImage } from '../../motion/SkeletonImage';
import { getOrCreateSignedUrl } from '../../services/imageStorage';

interface EventDetailModalProps {
  occurrence: EventOccurrence | null;
  categoryMap: Record<string, CategoryMeta>;
  onClose: () => void;
  onEdit: (occ: EventOccurrence) => void;
  onDelete: (eventId: string, occurrenceDate?: string) => void;
  onDuplicate: (occ: EventOccurrence) => void;
  onToggleTaskComplete: (eventId: string) => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  occurrence,
  categoryMap,
  onClose,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleTaskComplete,
}) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const retriedUrlRef = useRef<string | null>(null);

  // Hold the last occurrence while the close animation plays so the panel can
  // fade/scale out instead of unmounting instantly.
  const [retainedOccurrence, setRetainedOccurrence] =
    useState<EventOccurrence | null>(occurrence);

  const occurrenceId = occurrence?.occurrenceId ?? null;
  const occurrenceImageUrl = occurrence?.event.imageUrl;

  useEffect(() => {
    if (occurrence) setRetainedOccurrence(occurrence);
  }, [occurrence]);

  useEffect(() => {
    setLightboxOpen(false);
  }, [occurrenceId]);

  useEffect(() => {
    setImgError(false);
  }, [occurrenceId, occurrenceImageUrl]);

  useEffect(() => {
    if (!occurrence) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxOpen) setLightboxOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, occurrence, onClose]);

  const activeOccurrence = occurrence ?? retainedOccurrence;
  if (!activeOccurrence) return null;

  const { event, start, end } = activeOccurrence;
  const cat = resolveCategoryMeta(
    event.category,
    categoryMap,
    event.isTask ? 'task' : 'event'
  );
  const hasImage = Boolean(event.imageUrl && !imgError);

  return (
    <>
      <AnimatePresence onExitComplete={() => setRetainedOccurrence(null)}>
        {occurrence && (
        <motion.div
          key="detail-backdrop"
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
            className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg overflow-hidden gpu-layer"
          >
          {/* Full Image Preview Header (when event has attached image) */}
          {hasImage ? (
            <div className="relative bg-black/90 max-h-72 overflow-hidden group shrink-0">
              <SkeletonImage
                src={event.imageUrl}
                alt={event.title}
                rounded="rounded-none"
                className="w-full max-h-72 min-h-40 bg-black/40"
                imgClassName="w-full max-h-72 object-contain mx-auto cursor-zoom-in"
                onErrorImage={() => {
                  setImgError(true);
                  if (
                    event.imagePath &&
                    event.imageUrl &&
                    !event.imageUrl.startsWith('data:') &&
                    retriedUrlRef.current !== event.imageUrl
                  ) {
                    retriedUrlRef.current = event.imageUrl;
                    void getOrCreateSignedUrl(event.imagePath, {
                      forceRefresh: true,
                    });
                  }
                }}
                onClick={() => setLightboxOpen(true)}
              />
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="p-2 rounded-xl bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm transition-colors"
                  title="Expand full-size image"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm transition-colors"
                  aria-label="Close details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{ backgroundColor: cat.color }}
              className="h-3 w-full shrink-0"
            />
          )}

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto themed-scroll p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    style={{
                      backgroundColor: cat.softBg,
                      color: cat.textOnLight,
                      borderColor: cat.border,
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold"
                  >
                    <span
                      style={{ backgroundColor: cat.color }}
                      className="w-2 h-2 rounded-full"
                    />
                    {cat.label}
                  </span>

                  {event.isTask && (
                    <button
                      type="button"
                      onClick={() => onToggleTaskComplete(event.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-theme-border bg-theme-elevated px-2.5 py-0.5 text-[11px] font-bold text-theme-text hover:bg-theme-cell-hover"
                    >
                      {event.completed ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          Completed
                        </>
                      ) : (
                        <>
                          <Circle className="w-3.5 h-3.5" />
                          Mark Done
                        </>
                      )}
                    </button>
                  )}
                </div>

                <h2
                  className={`text-xl font-extrabold text-theme-text leading-snug ${
                    event.completed ? 'line-through opacity-65' : ''
                  }`}
                >
                  {event.title}
                </h2>
              </div>

              {!hasImage && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-xl text-theme-text-secondary hover:bg-theme-cell-hover shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Metadata List */}
            <div className="space-y-2.5 rounded-xl border border-theme-border bg-theme-elevated/70 p-3.5 text-xs sm:text-sm">
              <div className="flex items-center gap-2.5 text-theme-text">
                <Clock className="w-4 h-4 text-theme-accent shrink-0" />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-semibold tabular-nums">
                  <span>
                    {start.getFullYear() === new Date().getFullYear()
                      ? format(start, 'EEEE, MMMM d')
                      : format(start, 'EEEE, MMMM d, yyyy')}
                  </span>
                  {event.allDay ? (
                    <span className="rounded-md bg-theme-accent-soft px-2 py-0.5 text-[11px] font-bold text-theme-accent">
                      All day
                    </span>
                  ) : (
                    <span className="text-theme-text-secondary font-medium">
                      {format(start, 'h:mma').toLowerCase()} –{' '}
                      {format(end, 'h:mma').toLowerCase()}
                    </span>
                  )}
                </div>
              </div>

              {event.recurrence !== 'none' && (
                <div className="flex items-center gap-2.5 text-theme-text-secondary text-xs">
                  <Repeat className="w-4 h-4 text-theme-accent shrink-0" />
                  <span className="font-semibold">
                    {formatRecurrenceSummary({
                      recurrence: event.recurrence,
                      recurrenceUntil: event.recurrenceUntil,
                      customRecurrence: event.customRecurrence,
                      start: event.start,
                    })}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2.5 text-theme-text-secondary text-xs">
                <BellRing className="w-4 h-4 text-theme-accent shrink-0" />
                <span>Automated alert 10 minutes before start</span>
              </div>

              {event.location && (
                <div className="flex items-start gap-2.5 text-theme-text text-xs sm:text-sm pt-1 border-t border-theme-border/60">
                  <MapPin className="w-4 h-4 text-theme-accent shrink-0 mt-0.5" />
                  <span className="font-medium break-words">
                    {event.location}
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            {event.description && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-theme-text-secondary">
                  <AlignLeft className="w-3.5 h-3.5" />
                  Notes &amp; Description
                </div>
                <p className="text-xs sm:text-sm text-theme-text leading-relaxed whitespace-pre-wrap rounded-xl border border-theme-border bg-theme-elevated/40 p-3.5">
                  {event.description}
                </p>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="px-5 py-3.5 border-t border-theme-border bg-theme-elevated flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                onDelete(event.id, format(activeOccurrence.start, 'yyyy-MM-dd'))
              }
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onDuplicate(activeOccurrence)}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border border-theme-border text-theme-text-secondary hover:bg-theme-cell-hover transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Duplicate
              </button>

              <button
                type="button"
                onClick={() => onEdit(activeOccurrence)}
                style={{
                  backgroundColor: 'var(--t-accent)',
                  color: 'var(--t-accent-contrast)',
                }}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold shadow-sm hover:opacity-95 transition-opacity"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Event
              </button>
            </div>
          </div>
        </motion.div>
        </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen Image Lightbox */}
      <AnimatePresence>
        {lightboxOpen && hasImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: EXIT_MEDIUM }}
            onClick={() => setLightboxOpen(false)}
            className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <motion.img
              src={event.imageUrl}
              alt={event.title}
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
