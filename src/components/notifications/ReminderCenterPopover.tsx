import React from 'react';
import { format } from 'date-fns';
import {
  Bell,
  BellRing,
  CheckCircle2,
  Clock,
  Play,
  ShieldAlert,
  Timer,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { NotificationSettings } from '../../types/calendar';
import {
  BrowserPermissionState,
  UpcomingReminderItem,
} from '../../hooks/useReminderEngine';
import { AnimatePresence, motion } from 'framer-motion';
import { menuVariants } from '../../motion/presets';

interface ReminderCenterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  permissionStatus: BrowserPermissionState;
  onRequestPermission: () => void;
  settings: NotificationSettings;
  onUpdateSettings: (next: NotificationSettings) => void;
  upcomingReminders: UpcomingReminderItem[];
  onTriggerPreviewAlert: () => void;
  onScheduleLiveTenMinDemo: () => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Firing now';
  const totalSec = Math.ceil(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export const ReminderCenterPopover: React.FC<ReminderCenterPopoverProps> = ({
  isOpen,
  onClose,
  permissionStatus,
  onRequestPermission,
  settings,
  onUpdateSettings,
  upcomingReminders,
  onTriggerPreviewAlert,
  onScheduleLiveTenMinDemo,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
    <>
      <motion.div
        className="fixed inset-0 z-30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        variants={menuVariants}
        initial="enter"
        animate="center"
        exit="exit"
        style={{ transformOrigin: 'top right' }}
        className="absolute right-0 top-full mt-2 z-40 w-[min(92vw,360px)] rounded-2xl border border-theme-border bg-theme-surface text-theme-text shadow-theme-lg overflow-hidden gpu-layer">
        <div
          style={{ backgroundImage: 'var(--t-header-gradient)' }}
          className="px-4 py-3 border-b border-theme-border flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-theme-accent" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-theme-text">
              10-Min Pre-Event Reminders
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                ...settings,
                soundEnabled: !settings.soundEnabled,
              })
            }
            className="inline-flex items-center gap-1 rounded-lg border border-theme-border bg-theme-surface px-2 py-1 text-[11px] font-bold text-theme-text-secondary hover:bg-theme-cell-hover"
            title="Toggle reminder audio chime"
          >
            {settings.soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-theme-accent" />
                Sound On
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-rose-500" />
                Muted
              </>
            )}
          </button>
        </div>

        <div className="p-4 space-y-3.5">
          {/* Desktop Notification Permission Status */}
          <div className="rounded-xl border border-theme-border bg-theme-elevated p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-theme-text flex items-center gap-1.5">
                {permissionStatus === 'granted' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                )}
                Desktop Notifications
              </span>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-theme-surface border border-theme-border text-theme-text-secondary">
                {permissionStatus}
              </span>
            </div>

            <p className="text-[11px] text-theme-text-secondary mt-1.5 leading-relaxed">
              {permissionStatus === 'granted'
                ? 'Native browser desktop notifications and audio chimes are active.'
                : permissionStatus === 'default'
                ? 'Grant browser permission for OS-level alerts, or rely on automatic in-app toast alerts.'
                : 'Browser notifications are restricted here — falling back automatically to animated in-app toast + audio alerts.'}
            </p>

            {permissionStatus === 'default' && (
              <button
                type="button"
                onClick={onRequestPermission}
                style={{
                  backgroundColor: 'var(--t-accent)',
                  color: 'var(--t-accent-contrast)',
                }}
                className="mt-2.5 w-full rounded-lg py-1.5 text-xs font-bold shadow-sm hover:opacity-95"
              >
                Allow Browser Notifications
              </button>
            )}
          </div>

          {/* Upcoming Reminder Queue */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-theme-text-muted mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Next Scheduled 10-Min Alerts
            </h4>

            {upcomingReminders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-theme-border p-3 text-center text-xs text-theme-text-muted">
                No upcoming reminders in the next 48 hours.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto themed-scroll">
                {upcomingReminders.map((item) => (
                  <div
                    key={item.occurrenceId}
                    className="rounded-lg border border-theme-border bg-theme-elevated/60 px-2.5 py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-theme-text truncate">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-theme-text-muted tabular-nums">
                        Starts {format(item.eventStart, 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-theme-accent-soft px-2 py-0.5 text-[10px] font-extrabold text-theme-accent tabular-nums">
                      {formatCountdown(item.msUntilReminder)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instant Test & Live +10m Demo Controls */}
          <div className="pt-2 border-t border-theme-border grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={onScheduleLiveTenMinDemo}
              style={{
                backgroundColor: 'var(--t-accent)',
                color: 'var(--t-accent-contrast)',
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold shadow-sm hover:opacity-95 transition-opacity"
            >
              <Timer className="w-3.5 h-3.5" />
              Schedule +10m 05s Event (Fires in 5s!)
            </button>

            <button
              type="button"
              onClick={onTriggerPreviewAlert}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-bold text-theme-text hover:bg-theme-cell-hover transition-colors"
            >
              <Play className="w-3.5 h-3.5 text-theme-accent" />
              Preview Visual &amp; Audio Alert Now
            </button>
          </div>
        </div>
      </motion.div>
    </>
      )}
    </AnimatePresence>
  );
};

export { Bell };
