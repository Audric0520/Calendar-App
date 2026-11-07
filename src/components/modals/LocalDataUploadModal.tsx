import React, { useEffect } from 'react';
import { CloudUpload, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  modalBackdropVariants,
  modalPanelVariants,
} from '../../motion/presets';

interface LocalDataUploadModalProps {
  isOpen: boolean;
  eventCount: number;
  categoryCount: number;
  isUploading: boolean;
  errorMessage?: string | null;
  onUpload: () => void;
  onNotNow: () => void;
}

export const LocalDataUploadModal: React.FC<LocalDataUploadModalProps> = ({
  isOpen,
  eventCount,
  categoryCount,
  isUploading,
  errorMessage,
  onUpload,
  onNotNow,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isUploading) {
        onNotNow();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isUploading, onNotNow]);

  const primaryPrompt =
    eventCount > 0
      ? `Upload the ${eventCount} ${eventCount === 1 ? 'event' : 'events'} saved in this browser to your account?`
      : `Upload the ${categoryCount} custom ${categoryCount === 1 ? 'tag' : 'tags'} saved in this browser to your account?`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="local-upload-backdrop"
          variants={modalBackdropVariants}
          initial="enter"
          animate="center"
          exit="exit"
          onClick={() => {
            if (!isUploading) onNotNow();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            key="local-upload-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="local-upload-title"
            variants={modalPanelVariants}
            initial="enter"
            animate="center"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="gothic-frame w-full max-w-md rounded-2xl border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg overflow-hidden gpu-layer"
          >
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-3.5">
                <div
                  style={{
                    backgroundColor: 'var(--t-accent)',
                    color: 'var(--t-accent-contrast)',
                  }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                >
                  <CloudUpload className="w-5 h-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <h2
                    id="local-upload-title"
                    className="text-sm sm:text-base font-extrabold text-theme-text leading-snug"
                  >
                    {primaryPrompt}
                  </h2>

                  {eventCount > 0 && categoryCount > 0 && (
                    <p className="mt-1.5 text-xs font-medium text-theme-text-secondary">
                      Also includes {categoryCount} custom{' '}
                      {categoryCount === 1 ? 'tag' : 'tags'} saved in this
                      browser.
                    </p>
                  )}

                  <p className="mt-1.5 text-xs text-theme-text-muted leading-relaxed">
                    Your local items stay safe in this browser and won&rsquo;t be
                    duplicated.
                  </p>

                  {errorMessage && (
                    <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-theme-text">
                      {errorMessage}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onNotNow}
                  disabled={isUploading}
                  className="rounded-xl border border-theme-border bg-theme-elevated hover:bg-theme-cell-hover disabled:opacity-60 px-4 py-2 text-xs font-bold text-theme-text transition-colors"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={onUpload}
                  disabled={isUploading}
                  style={{
                    backgroundColor: 'var(--t-accent)',
                    color: 'var(--t-accent-contrast)',
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold shadow-sm hover:opacity-95 disabled:opacity-65 transition-opacity"
                >
                  {isUploading && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  )}
                  <span>Upload</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
