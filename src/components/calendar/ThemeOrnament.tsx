import React from 'react';
import oooLogoUrl from '../../assets/OOO_LOGO.png?url';
import wednesdayLogoUrl from '../../assets/wednesday-logo.png?url';
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
      return (
        <img
          src={oooLogoUrl}
          width={size}
          height={size}
          alt=""
          aria-hidden="true"
          draggable={false}
          className={className}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            display: 'block',
            objectFit: 'contain',
            flexShrink: 0,
            userSelect: 'none',
          }}
        />
      );

    case 'wednesday':
      // Nevermore stained-glass "W" medallion — supplied artwork, rendered at the
      // exact same square footprint the previous SVG ornament occupied, so every
      // call site (top bar 15px, week badges 12–13px, theme studio 18px) keeps
      // its original dimensions and layout rhythm.
      return (
        <img
          src={wednesdayLogoUrl}
          width={size}
          height={size}
          alt=""
          aria-hidden="true"
          draggable={false}
          className={className}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            display: 'block',
            objectFit: 'contain',
            flexShrink: 0,
            userSelect: 'none',
          }}
        />
      );

    case 'gengar':
      // Grinning shadow-ghost face — violet head with pointed spikes, gold
      // mischievous eyes and the signature white crescent grin, matching the
      // Gengar mood-board ornament footprint used by every call site.
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
            d="M4.4 7.6 2.9 2.7 7.7 5.3 Z"
            fill="#7c4dbd"
            stroke="#4c2d7f"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <path
            d="M19.6 7.6 21.1 2.7 16.3 5.3 Z"
            fill="#7c4dbd"
            stroke="#4c2d7f"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="13.2" r="8.1" fill="#7c4dbd" stroke="#4c2d7f" strokeWidth="1" />
          <path d="M6.5 10.8 10.3 12.3 6.5 14 Z" fill="#fbbf24" />
          <path d="M17.5 10.8 13.7 12.3 17.5 14 Z" fill="#fbbf24" />
          <path
            d="M6.8 15.3 Q12 20.1 17.2 15.3 Q12 17.7 6.8 15.3 Z"
            fill="#ffffff"
          />
        </svg>
      );
  }
};
