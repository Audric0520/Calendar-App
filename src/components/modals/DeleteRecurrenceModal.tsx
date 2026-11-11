import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { CalendarEvent } from '../../types/calendar';
import { formatRecurrenceSummary } from '../../utils/calendarMath';
import { AnimatePresence, motion } from 'framer-motion';
import {
  modalBackdropVariants,
  modalPanelVariants,
} from '../../motion/presets';

type DeleteScope = 'this' | 'thisAndFollowing' | 'all';

interface DeleteRecurrenceModalProps {
  target: CalendarEvent | null;
  /** Local date of the clicked occurrence ("YYYY-MM-DD"). */
  occurrenceDate: string;
  onCancel: () => void;
  onConfirm: (scope: DeleteScope) => void;
}

const SCOPE_LABELS: Record<DeleteScope, string> = {
  this: 'This event',
  thisAndFollowing: 'This and following events',
  all: 'All events',
};

export const DeleteRecurrenceModal: React.FC<DeleteRecurrenceModalProps> = ({
  target,
  occurrenceDate,
  onCancel,
  onConfirm,
}) => {
  const [scope, setScope] = useState<DeleteScope>('this');
  const [retainedTarget, setRetainedTarget] = useState<CalendarEvent | null>(
    target
  );

  useEffect(() => {
    if (target) setRetainedTarget(target);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [target, onCancel]);

  const activeTarget = target ?? retainedTarget;
  const itemKind = activeTarget?.isTask ? 'task' : 'event';
  const itemTitle = activeTarget?.title?.trim();
  const occurrenceLabel = format(
    new Date(`${occurrenceDate}T00:00`),
    'EEEE, MMMM d'
  );

  const renderRadioDot = (selected: boolean) => (
    <span
      style={
        selected
          ? { borderColor: 'var(--t-accent)' }
          : undefined
      }
      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
        selected ? '' : 'border-theme-text-muted'
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
    <AnimatePresence onExitComplete={() => setRetainedTarget(null)}>
      {target && activeTarget && (
        <motion.div
          key="delete-recurrence-backdrop"
          variants={modalBackdropVariants}
          initial="enter"
          animate="center"
          exit="exit"
          onClick={onCancel}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            key="delete-recurrence-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-recurrence-title"
            aria-describedby="delete-recurrence-description"
            variants={modalPanelVariants}
            initial="enter"
            animate="center"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="gothic-frame w-full max-w-md rounded-2xl border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg overflow-hidden gpu-layer"
          >
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-500 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <h2
                    id="delete-recurrence-title"
                    className="text-sm sm:text-base font-extrabold text-theme-text leading-snug"
                  >
                    Delete recurring {itemKind}?
                  </h2>

                  <p
                    id="delete-recurrence-description"
                    className="mt-1.5 text-xs sm:text-sm text-theme-text-secondary leading-relaxed break-words"
                  >
                    {itemTitle ? (
                      <>
                        How do you want to remove{' '}
                        <span className="font-bold text-theme-text">
                          &ldquo;{itemTitle}&rdquo;
                        </span>{' '}
                        on {occurrenceLabel}?
                      </>
                    ) : (
                      <>
                        How do you want to remove this recurring {itemKind} on{' '}
                        <span className="font-bold text-theme-text">{occurrenceLabel}</span>?
                      </>
                    )}
                  </p>

                  <p className="mt-3 text-xs text-theme-text-muted">
                    Series:{" "}
                    <span className="font-medium text-theme-text">
                      {formatRecurrenceSummary({
                        recurrence: activeTarget.recurrence,
                        recurrenceUntil: activeTarget.recurrenceUntil,
                        customRecurrence: activeTarget.customRecurrence,
                        start: activeTarget.start,
                      })}
                    </span>
                  </p>

                  {/* Scope options */}
                  <div className="mt-4 space-y-2">
                    {(['this', 'thisAndFollowing', 'all'] as DeleteScope[]).map(
                      (s) => {
                        const selected = scope === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setScope(s)}
                            className="group/radio w-full flex items-center gap-3.5 py-1.5 text-left"
                          >
                            {renderRadioDot(selected)}
                            <span className="text-sm font-medium text-theme-text">
                              {SCOPE_LABELS[s]}
                            </span>
                            {selected && (
                              <span className="ml-auto text-xs text-theme-text-secondary">
                                {s === 'this'
                                  ? 'Only this occurrence is skipped'
                                  : s === 'thisAndFollowing'
                                    ? 'This occurrence and later are removed'
                                    : 'The entire series is removed'}
                              </span>
                            )}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-xl border border-theme-border bg-theme-elevated hover:bg-theme-cell-hover px-4 py-2 text-xs font-bold text-theme-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onConfirm(scope)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>OK</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
