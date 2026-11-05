import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ThemeId } from '../types/calendar';

const SNAPSHOT_FADE_MS = 420;

interface ThemeCrossFadeProps {
  theme: ThemeId;
  /** The themed application root that should be snapshotted. */
  targetRef: React.RefObject<HTMLElement>;
  /** Class list of the application root (replayed on the snapshot layer). */
  rootClassName?: string;
}

/**
 * Soft palette cross-fade for full surface theme swaps (Light ↔ Dark ↔ OOO ↔
 * Wednesday).
 *
 * CSS custom properties are not interpolable, so `transition: background-color`
 * alone would still snap every surface at once. Instead we clone the outgoing
 * themed tree into a fixed, non-interactive overlay and cross-fade that clone
 * out over the incoming palette. Only `opacity` is animated, so the whole swap
 * stays on the compositor.
 */
export const ThemeCrossFade: React.FC<ThemeCrossFadeProps> = ({
  theme,
  targetRef,
  rootClassName = '',
}) => {
  const [snapshots, setSnapshots] = useState<
    { id: number; theme: ThemeId; markup: string; className: string }[]
  >([]);
  const prevTheme = useRef<ThemeId>(theme);
  const counter = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (prevTheme.current === theme) return;
    const target = targetRef.current;
    const outgoing = prevTheme.current;
    prevTheme.current = theme;
    if (!target) return;

    const className =
      target.className || rootClassName || 'bg-theme-bg text-theme-text';
    const markup = target.innerHTML;
    const id = ++counter.current;

    setSnapshots((prev) => [
      // Keep at most two layers alive while the user hops themes rapidly.
      ...prev.slice(-1),
      { id, theme: outgoing, markup, className },
    ]);

    const timer = window.setTimeout(() => {
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
      timers.current = timers.current.filter((t) => t !== timer);
    }, SNAPSHOT_FADE_MS);
    timers.current.push(timer);
  }, [rootClassName, targetRef, theme]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    []
  );

  if (typeof document === 'undefined' || snapshots.length === 0) return null;

  return createPortal(
    <div
      aria-hidden="true"
      className="theme-crossfade-layer pointer-events-none fixed inset-0 z-[95] overflow-hidden select-none"
    >
      {snapshots.map((snap) => (
        <div
          key={snap.id}
          data-theme={snap.theme}
          className={`theme-crossfade-snapshot absolute inset-0 overflow-hidden ${snap.className}`}
          dangerouslySetInnerHTML={{ __html: snap.markup }}
        />
      ))}
    </div>,
    document.body
  );
};
