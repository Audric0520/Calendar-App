import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Tracks "pulse tokens" coming from the App. A token is a counter that only
 * ever increases when the user jumps back to today; we replay the animation on
 * each new (non-zero) value.
 */
function usePulsePlayback(token: number) {
  const [state, setState] = useState<{ token: number; play: boolean }>({
    token: 0,
    play: false,
  });

  useEffect(() => {
    if (!token || token === state.token) return;
    setState({ token, play: true });
    const id = window.setTimeout(() => {
      setState((prev) => (prev.token === token ? { ...prev, play: false } : prev));
    }, 650);
    return () => window.clearTimeout(id);
  }, [state.token, token]);

  return state.play;
}

interface TodayPulseProps {
  /** Incrementing token. Every change replays the soft scale pulse. */
  token: number;
  className?: string;
  children: React.ReactNode;
  /** Peak scale of the pulse (1.12 by default). */
  scale?: number;
}

/**
 * A soft "landing" pulse used when the user jumps back to today.
 * Only `transform` is animated, keeping everything on the compositor.
 * Wrap a shrink-0 target (day pill / badge) so no layout shift occurs.
 */
export const TodayPulse: React.FC<TodayPulseProps> = ({
  token,
  className = '',
  children,
  scale = 1.12,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const play = usePulsePlayback(token);

  if (prefersReducedMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={`gpu-layer ${className}`}
      animate={
        play
          ? { scale: [1, scale, 0.99, 1] }
          : { scale: 1 }
      }
      transition={
        play
          ? { duration: 0.55, times: [0, 0.3, 0.68, 1], ease: 'easeOut' }
          : { duration: 0.2 }
      }
    >
      {children}
    </motion.div>
  );
};
