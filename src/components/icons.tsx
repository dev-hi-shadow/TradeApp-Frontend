/** Inline SVG icons (no icon-library dep). All 24×24, currentColor strokes. */

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

const base = ({ size = 20, ...rest }: IconProps) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...rest,
});

export const IconHome = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-6h4v6" />
  </svg>
);

export const IconBell = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export const IconLayers = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 2 2 7l10 5 10-5-10-5Z" />
    <path d="m2 17 10 5 10-5" />
    <path d="m2 12 10 5 10-5" />
  </svg>
);

export const IconShield = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" />
  </svg>
);

export const IconChart = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 3v18h18" />
    <path d="M7 14l3-3 4 4 5-7" />
  </svg>
);

export const IconTrade = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 7h14l-3-3" />
    <path d="M21 17H7l3 3" />
  </svg>
);

export const IconList = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <circle cx="4" cy="6" r="1" />
    <circle cx="4" cy="12" r="1" />
    <circle cx="4" cy="18" r="1" />
  </svg>
);

export const IconUser = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1-4 5-6 8-6s7 2 8 6" />
  </svg>
);

export const IconSun = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

export const IconMoon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconMinus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);

export const IconX = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const IconChevronDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const IconLogOut = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const IconArrowUp = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

export const IconArrowDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </svg>
);

export const IconRefresh = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 019-9 9 9 0 016.4 2.6L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 01-9 9 9 9 0 01-6.4-2.6L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

export const IconLink = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
  </svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M19 12H5" />
    <path d="M12 19l-7-7 7-7" />
  </svg>
);

/** Stylised candlestick — body with wicks. Used for "chart type" toggle. */
export const IconCandle = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 3v3M8 17v3" />
    <rect x="6" y="6" width="4" height="11" />
    <path d="M16 5v3M16 18v3" />
    <rect x="14" y="8" width="4" height="10" />
  </svg>
);

/** OHLC bar — vertical H/L line with horizontal open (left) + close (right) ticks. */
export const IconBars = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 4v16M5 8h3M8 14h3" />
    <path d="M16 6v14M13 10h3M16 16h3" />
  </svg>
);

/** Line/area chart icon — simple jagged trend line. */
export const IconLine = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 17l5-7 4 4 9-10" />
  </svg>
);

/** ƒₓ — indicators / functions. */
export const IconFx = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 21c0-3 1-7 4-7M9 14h7" />
    <path d="M13 9l5 7M18 9l-5 7" />
  </svg>
);

/** Pencil — drawing tools. */
export const IconPencil = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </svg>
);

/** Rotate / orientation flip. */
export const IconRotate = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 3v6h-6" />
  </svg>
);

/** Three vertical dots — "more" menu. */
export const IconDots = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="5"  r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

/** Compass — "Discover" / explore the market. */
export const IconCompass = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
  </svg>
);

/** Bookmark — saved / watchlists. */
export const IconBookmark = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
  </svg>
);

/** Bar-chart on an axis — analytics / performance dashboard. */
export const IconAnalytics = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 3v18h18" />
    <rect x="7"  y="12" width="3" height="6" rx="0.5" />
    <rect x="12" y="8"  width="3" height="10" rx="0.5" />
    <rect x="17" y="5"  width="3" height="13" rx="0.5" />
  </svg>
);
