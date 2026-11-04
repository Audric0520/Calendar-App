import React from 'react';
import { ThemeId } from '../../types/calendar';

interface ThemeOrnamentProps {
  theme: ThemeId;
  size?: number;
  className?: string;
}

export const ThemeOrnament: React.FC<ThemeOrnamentProps> = ({
  theme,
  size = 18,
  className = '',
}) => {
  switch (theme) {
    case 'light':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4.6" fill="#facc15" stroke="#eab308" strokeWidth="1.4" />
          <path
            d="M12 2.5V5M12 19V21.5M2.5 12H5M19 12H21.5M5.3 5.3L7.1 7.1M16.9 16.9L18.7 18.7M18.7 5.3L16.9 7.1M7.1 16.9L5.3 18.7"
            stroke="#f59e0b"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'dark':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <path
            d="M20.2 14.6A8.5 8.5 0 0 1 9.4 3.8a8.5 8.5 0 1 0 10.8 10.8Z"
            fill="#60a5fa"
            fillOpacity="0.35"
            stroke="#60a5fa"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="17.5" cy="6.5" r="1.3" fill="#93c5fd" />
        </svg>
      );

    case 'ooo':
      // Kamen Rider OOO Tatoba Core Medals (Taka Red, Tora Yellow, Batta Green) with Gold O-Scanner Rims
      return (
        <svg
          width={Math.round(size * 1.45)}
          height={size}
          viewBox="0 0 34 22"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <circle cx="7" cy="11" r="5.8" fill="#ef4444" stroke="#facc15" strokeWidth="1.8" />
          <circle cx="7" cy="11" r="2.6" fill="#991b1b" />
          <circle cx="17" cy="11" r="5.8" fill="#eab308" stroke="#fef08a" strokeWidth="1.8" />
          <circle cx="17" cy="11" r="2.6" fill="#713f12" />
          <circle cx="27" cy="11" r="5.8" fill="#22c55e" stroke="#facc15" strokeWidth="1.8" />
          <circle cx="27" cy="11" r="2.6" fill="#14532d" />
        </svg>
      );

    case 'wednesday':
      // Nevermore Stained-Glass Spiderweb Window Emblem
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9.5" fill="#14111f" stroke="#7c3aed" strokeWidth="1.7" />
          <path d="M12 2.5A9.5 9.5 0 0 1 21.5 12H12V2.5Z" fill="#6d28d9" fillOpacity="0.5" />
          <path d="M12 12H21.5A9.5 9.5 0 0 1 12 21.5V12Z" fill="#9f1239" fillOpacity="0.45" />
          <circle cx="12" cy="12" r="5.2" stroke="#ddd6fe" strokeWidth="1" strokeOpacity="0.7" />
          <path
            d="M12 2.5V21.5M2.5 12H21.5M5.3 5.3L18.7 18.7M18.7 5.3L5.3 18.7"
            stroke="#c4b5fd"
            strokeWidth="1"
            strokeOpacity="0.75"
          />
        </svg>
      );
  }
};
