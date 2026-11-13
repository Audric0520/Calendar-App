export interface PwaNavigatorLike {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
}

export interface PwaWindowLike {
  navigator?: PwaNavigatorLike;
  matchMedia?: (query: string) => { matches: boolean };
}

/**
 * Returns true on iPhone, iPad, and iPod browsers (including iPadOS 13+, which
 * reports MacIntel with multi-touch support).
 */
export function isIosDevice(nav?: PwaNavigatorLike): boolean {
  const target =
    nav ?? (typeof navigator !== 'undefined' ? navigator : undefined);
  if (!target) return false;

  const ua = target.userAgent ?? '';
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return true;
  }

  if (target.platform === 'MacIntel' && (target.maxTouchPoints ?? 0) > 1) {
    return true;
  }

  return false;
}

/**
 * Returns true when running as an installed Home Screen / standalone web app.
 */
export function isStandaloneApp(win?: PwaWindowLike): boolean {
  const target =
    win ??
    (typeof window !== 'undefined'
      ? (window as unknown as PwaWindowLike)
      : undefined);
  if (!target) return false;

  if (target.navigator?.standalone === true) {
    return true;
  }

  try {
    if (
      typeof target.matchMedia === 'function' &&
      target.matchMedia('(display-mode: standalone)').matches
    ) {
      return true;
    }
  } catch {
    // Ignore matchMedia errors in restricted environments
  }

  return false;
}
