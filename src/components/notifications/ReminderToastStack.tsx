import React from 'react';
import { format } from 'date-fns';
import { BellRing, ExternalLink, MapPin, X } from 'lucide-react';
import { ReminderAlert } from '../../types/calendar';
import { CategoryMeta, resolveCategoryMeta } from '../../constants/categories';

interface ReminderToastStackProps {
  toasts: ReminderAlert[];
  categoryMap: Record<string, CategoryMeta>;
  onDismiss: (id: string) => void;
  onInspectEvent: (eventId: string, toastId: string) => void;
}

export const ReminderToastStack: React.FC<ReminderToastStackProps> = ({
  toasts,
  categoryMap,
  onDismiss,
  onInspectEvent,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[70] flex flex-col gap-3 w-[min(92vw,380px)] pointer-events-none"
    >
      {toasts.map((toast) => {
        const cat = resolveCategoryMeta(toast.category, categoryMap);
        return (
          <div
            key={toast.id}
            style={{ borderLeftColor: cat.color, borderLeftWidth: '5px' }}
            className="animate-toast-in pointer-events-auto rounded-2xl border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg overflow-hidden"
          >
            <div className="p-3.5 flex items-start gap-3">
              <div
                style={{
                  backgroundColor: 'var(--t-accent)',
                  color: 'var(--t-accent-contrast)',
                }}
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
              >
                <BellRing className="w-4 h-4 animate-bounce" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-theme-accent">
                    10-Minute Reminder
                  </span>
                  <button
                    type="button"
                    onClick={() => onDismiss(toast.id)}
                    className="p-1 rounded-lg text-theme-text-muted hover:bg-theme-cell-hover"
                    aria-label="Dismiss alert"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <h4 className="text-sm font-extrabold text-theme-text truncate mt-0.5">
                  {toast.title}
                </h4>

                <p className="text-xs font-semibold text-theme-text-secondary tabular-nums mt-0.5">
                  Starts at {format(toast.start, 'h:mm a')}
                </p>

                {toast.location && (
                  <p className="text-[11px] text-theme-text-muted flex items-center gap-1 truncate mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{toast.location}</span>
                  </p>
                )}

                {toast.imageUrl && (
                  <div className="mt-2 h-20 w-full rounded-lg overflow-hidden border border-theme-border bg-black/10">
                    <img
                      src={toast.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="mt-2.5 flex items-center gap-2">
                  {toast.eventId && (
                    <button
                      type="button"
                      onClick={() => onInspectEvent(toast.eventId, toast.id)}
                      style={{
                        backgroundColor: 'var(--t-accent)',
                        color: 'var(--t-accent-contrast)',
                      }}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold shadow-sm"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open Event
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDismiss(toast.id)}
                    className="rounded-lg border border-theme-border px-2.5 py-1 text-[11px] font-semibold text-theme-text-secondary hover:bg-theme-cell-hover"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
