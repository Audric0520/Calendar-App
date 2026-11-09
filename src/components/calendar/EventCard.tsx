import React, { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Circle, Image as ImageIcon, MapPin, Repeat } from 'lucide-react';
import { EventOccurrence, ThemeId } from '../../types/calendar';
import { CategoryMeta, resolveCategoryMeta } from '../../constants/categories';
import { THEME_DEFINITIONS } from '../../constants/themes';
import { SkeletonImage } from '../../motion/SkeletonImage';
import { getOrCreateSignedUrl } from '../../services/imageStorage';

interface EventCardProps {
  occurrence: EventOccurrence;
  activeTheme: ThemeId;
  categoryMap: Record<string, CategoryMeta>;
  variant: 'month' | 'allday' | 'timed';
  compact?: boolean;
  durationMinutes?: number;
  onSelect: (occ: EventOccurrence, e: React.MouseEvent) => void;
  onToggleTaskComplete?: (eventId: string, e: React.MouseEvent) => void;
}

export const EventCard: React.FC<EventCardProps> = ({
  occurrence,
  activeTheme,
  categoryMap,
  variant,
  compact = false,
  durationMinutes = 60,
  onSelect,
  onToggleTaskComplete,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const retriedUrlRef = useRef<string | null>(null);
  const { event, start, end } = occurrence;

  useEffect(() => {
    setImgFailed(false);
  }, [event.imageUrl]);

  const handleImageError = () => {
    setImgFailed(true);
    if (
      event.imagePath &&
      event.imageUrl &&
      !event.imageUrl.startsWith('data:') &&
      retriedUrlRef.current !== event.imageUrl
    ) {
      retriedUrlRef.current = event.imageUrl;
      void getOrCreateSignedUrl(event.imagePath, { forceRefresh: true });
    }
  };
  const cat = resolveCategoryMeta(
    event.category,
    categoryMap,
    event.isTask ? 'task' : 'event'
  );
  const isDark = THEME_DEFINITIONS[activeTheme]?.isDark ?? false;

  const hasValidImage = Boolean(event.imageUrl && !imgFailed);
  const bgStyle = isDark ? cat.darkSoftBg : cat.softBg;
  const textStyle = isDark ? cat.textOnDark : cat.textOnLight;

  if (variant === 'month' || variant === 'allday') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(occurrence, e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onSelect(occurrence, e as unknown as React.MouseEvent);
          }
        }}
        style={{
          backgroundColor: event.allDay ? cat.color : bgStyle,
          color: event.allDay ? cat.textOnSolid : textStyle,
          borderLeft: event.allDay ? undefined : `3px solid ${cat.color}`,
        }}
        className={`group/ev event-card-lift relative flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight font-medium cursor-pointer hover:brightness-95 dark:hover:brightness-110 shadow-sm select-none overflow-hidden ${
          event.completed ? 'opacity-55 line-through' : ''
        }`}
        title={`${event.title} • ${cat.label}${
          !event.allDay ? ` (${format(start, 'h:mm a')})` : ' (All day)'
        }`}
      >
        {event.isTask && onToggleTaskComplete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleTaskComplete(event.id, e);
            }}
            className="shrink-0 opacity-85 hover:opacity-100"
            aria-label={event.completed ? 'Mark incomplete' : 'Mark complete'}
          >
            {event.completed ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <Circle className="w-3 h-3" />
            )}
          </button>
        )}

        {hasValidImage && (
          <SkeletonImage
            src={event.imageUrl}
            alt=""
            rounded="rounded"
            className="shrink-0 w-4 h-4 ring-1 ring-black/10 bg-black/10"
            imgClassName="w-full h-full object-cover"
            onErrorImage={handleImageError}
          />
        )}

        {!event.allDay && !compact && (
          <span className="shrink-0 opacity-80 font-semibold tabular-nums text-[10px]">
            {format(start, 'h:mma').toLowerCase()}
          </span>
        )}

        <span className="truncate font-semibold flex-1">{event.title}</span>

        {event.recurrence !== 'none' && (
          <Repeat className="w-2.5 h-2.5 shrink-0 opacity-75" />
        )}
      </div>
    );
  }

  // Timed block inside WeekView / DayView
  const showRichMedia = hasValidImage && durationMinutes >= 55;
  const showCompactThumb = hasValidImage && !showRichMedia;
  const showMeta = durationMinutes >= 45;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(occurrence, e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onSelect(occurrence, e as unknown as React.MouseEvent);
        }
      }}
      style={{
        backgroundColor: isDark ? '#191d28' : '#ffffff',
        borderColor: cat.border,
        borderLeftWidth: '4px',
        borderLeftColor: cat.color,
      }}
      className={`event-card-lift h-full w-full rounded-lg border shadow-sm hover:shadow-md cursor-pointer overflow-hidden flex flex-col justify-between p-1.5 select-none ${
        event.completed ? 'opacity-60' : ''
      }`}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-90"
        style={{ backgroundColor: bgStyle }}
      />

      <div className="relative z-10 flex flex-col h-full min-h-0 gap-1" style={{ color: textStyle }}>
        <div className="flex items-start justify-between gap-1.5 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 min-w-0">
              {event.isTask && onToggleTaskComplete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleTaskComplete(event.id, e);
                  }}
                  className="shrink-0"
                >
                  {event.completed ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Circle className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
              <span
                className={`text-xs font-bold leading-snug truncate ${
                  event.completed ? 'line-through' : ''
                }`}
              >
                {event.title}
              </span>
            </div>

            {showMeta && (
              <div className="flex items-center gap-1.5 text-[10px] opacity-85 font-medium tabular-nums mt-0.5 truncate">
                <span>
                  {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
                </span>
                {event.recurrence !== 'none' && (
                  <Repeat className="w-2.5 h-2.5 shrink-0" />
                )}
              </div>
            )}
          </div>

          {showCompactThumb && (
            <SkeletonImage
              src={event.imageUrl}
              alt=""
              className="shrink-0 w-7 h-7 ring-1 ring-black/15 shadow-sm bg-black/10"
              imgClassName="w-full h-full object-cover"
              onErrorImage={handleImageError}
            />
          )}
        </div>

        {showRichMedia && (
          <div className="relative mt-0.5 flex-1 min-h-[34px] rounded-md overflow-hidden ring-1 ring-black/10 bg-black/10">
            <SkeletonImage
              src={event.imageUrl}
              alt={event.title}
              className="absolute inset-0"
              imgClassName="w-full h-full object-cover"
              onErrorImage={handleImageError}
            />
            <span className="absolute bottom-1 right-1 bg-black/55 text-white rounded px-1 py-0.5 text-[9px] flex items-center gap-0.5 backdrop-blur-sm">
              <ImageIcon className="w-2.5 h-2.5" />
            </span>
          </div>
        )}

        {durationMinutes >= 75 && event.location && !showRichMedia && (
          <div className="flex items-center gap-1 text-[10px] opacity-80 truncate mt-auto">
            <MapPin className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        )}
      </div>
    </div>
  );
};
