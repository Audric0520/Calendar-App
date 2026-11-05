import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type ShimmerProps = {
  className?: string;
  /** Rounded shape of the skeleton container. */
  rounded?: string;
  /** Hide the skeleton once the media has loaded. */
  active?: boolean;
};

/**
 * GPU-friendly shimmering skeleton. The moving highlight is a pseudo-element
 * driven by a single `translate3d` keyframe so nothing repaints per frame.
 */
export const Shimmer: React.FC<ShimmerProps> = ({
  className = '',
  rounded = 'rounded-md',
  active = true,
}) => (
  <div
    aria-hidden="true"
    className={`media-shimmer ${rounded} ${className}`}
    style={{ display: active ? undefined : 'none' }}
  />
);

type NativeImgProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  // framer-motion overrides the drag handlers, so they cannot be forwarded.
  'onLoad' | 'onError' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd'
>;

interface SkeletonImageProps extends NativeImgProps {
  src?: string;
  alt?: string;
  /** Extra classes for the <img>. */
  imgClassName?: string;
  /** Extra classes for the wrapper. */
  className?: string;
  /** Skeleton shape. */
  rounded?: string;
  /** Called when the browser fails to decode the image. */
  onErrorImage?: () => void;
  /** Rendered instead of the <img> when loading fails. */
  fallback?: React.ReactNode;
}

/**
 * Image attachment thumbnail with:
 *  • a shimmering skeleton while decoding,
 *  • a smooth opacity cross-fade once the bitmap is ready (cached images fade in
 *    immediately thanks to the synchronous `img.complete` check),
 *  • transform-only zoom on hover for the parent `.group/thumb` containers.
 */
export const SkeletonImage: React.FC<SkeletonImageProps> = ({
  src,
  alt = '',
  className = '',
  imgClassName = '',
  rounded = 'rounded-md',
  onErrorImage,
  fallback = null,
  ...rest
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    src ? 'loading' : 'error'
  );

  useEffect(() => {
    setStatus(src ? 'loading' : 'error');
  }, [src]);

  if (!src || status === 'error') {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <div className={`relative overflow-hidden ${rounded} ${className}`}>
      {status !== 'loaded' && (
        <Shimmer rounded={rounded} className="absolute inset-0" active />
      )}

      <motion.img
        {...rest}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        initial={false}
        animate={{ opacity: status === 'loaded' ? 1 : 0 }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { duration: 0.42, ease: [0.22, 1, 0.36, 1] }
        }
        onLoad={() => setStatus('loaded')}
        onError={() => {
          setStatus('error');
          onErrorImage?.();
        }}
        ref={(node) => {
          // Cached images may already be decoded before onLoad can attach.
          if (node?.complete && node.naturalWidth > 0) setStatus('loaded');
        }}
        className={imgClassName}
      />
    </div>
  );
};
