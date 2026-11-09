import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarEvent } from '../../types/calendar';
import {
  modalBackdropVariants,
  modalPanelVariants,
} from '../../motion/presets';

interface ConfirmRemoveModalProps {
  target: CalendarEvent | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmRemoveModal: React.FC<ConfirmRemoveModalProps> = ({
  target,
  onCancel,
  onConfirm,
}) => {
  const [retainedTarget, setRetainedTarget] = useState<CalendarEvent | null>(
    target
  );

  useEffect(() => {
    if (target) {
      setRetainedTarget(target);
    }
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

  return (
    <AnimatePresence onExitComplete={() => setRetainedTarget(null)}>
      {target && activeTarget && (
        <motion.div
          key="confirm-remove-backdrop"
          variants={modalBackdropVariants}
          initial="enter"
          animate="center"
          exit="exit"
          onClick={onCancel}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            key="confirm-remove-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-remove-title"
            aria-describedby="confirm-remove-description"
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
                    id="confirm-remove-title"
                    className="text-sm sm:text-base font-extrabold text-theme-text leading-snug"
                  >
                    Remove {itemKind}?
                  </h2>

                  <p
                    id="confirm-remove-description"
                    className="mt-1.5 text-xs sm:text-sm text-theme-text-secondary leading-relaxed break-words"
                  >
                    {itemTitle ? (
                      <>
                        Are you sure you want to remove{' '}
                        <span className="font-bold text-theme-text">
                          &ldquo;{itemTitle}&rdquo;
                        </span>
                        ?
                      </>
                    ) : (
                      <>Are you sure you want to remove this {itemKind}?</>
                    )}
                  </p>
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
                  onClick={onConfirm}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
