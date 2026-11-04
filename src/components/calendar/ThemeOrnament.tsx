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
    case 'spring':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <circle cx="12" cy="6.2" r="3.6" fill="#f472b6" />
          <circle cx="17.5" cy="10.2" r="3.6" fill="#f9a8d4" />
          <circle cx="15.4" cy="16.8" r="3.6" fill="#f472b6" />
          <circle cx="8.6" cy="16.8" r="3.6" fill="#f9a8d4" />
          <circle cx="6.5" cy="10.2" r="3.6" fill="#f472b6" />
          <circle cx="12" cy="12" r="2.7" fill="#fef08a" stroke="#db2777" strokeWidth="1" />
        </svg>
      );

    case 'summer':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <circle cx="12" cy="10" r="4.8" fill="#facc15" stroke="#eab308" strokeWidth="1.2" />
          <path
            d="M12 2.5V4.3M12 15.7V17.5M4.5 10H6.3M17.7 10H19.5M6.7 4.7L8 6M16 14L17.3 15.3M17.3 4.7L16 6M8 14L6.7 15.3"
            stroke="#eab308"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M3 19.2C5.2 17.6 7.4 17.6 9.5 19.2C11.6 20.8 13.8 20.8 16 19.2C17.8 17.8 19.5 17.8 21 19.2"
            stroke="#0284c7"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'autumn':
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
            d="M12 2.5L14.3 7.4L19.5 6.5L16.8 11.2L20.5 14.3L15.3 15.6L16.2 19.2L12 17.2L7.8 19.2L8.7 15.6L3.5 14.3L7.2 11.2L4.5 6.5L9.7 7.4L12 2.5Z"
            fill="#ea580c"
            stroke="#78350f"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M12 10V21.5"
            stroke="#fef3c7"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'winter':
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
            d="M12 2.5V21.5M3.8 7.25L20.2 16.75M20.2 7.25L3.8 16.75"
            stroke="#0d9488"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="2.6" fill="#ccfbf1" stroke="#0d9488" strokeWidth="1.4" />
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
