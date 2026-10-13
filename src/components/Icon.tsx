const dot = (x: number, y: number): string => `M${x - 1.4} ${y}a1.4 1.4 0 102.8 0 1.4 1.4 0 10-2.8 0`;

const PATHS = {
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  next: 'M5 5l9 7-9 7zM16 5h3v14h-3z',
  prev: 'M19 5l-9 7 9 7zM5 5h3v14H5z',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
  target: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 100 8 4 4 0 000-8z',
  back: 'M14 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  stats: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
  dice: 'M5 5h14v14H5zM9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  caret: 'M9 6l6 6-6 6',
  edit: 'M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3',
  ticket: 'M4 7h16v4a2 2 0 000 4v4H4v-4a2 2 0 000-4zM10 7v12',
  undo: 'M9 7L4 12l5 5M4 12h10a5 5 0 010 10h-2',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12a7 7 0 00-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 00-2.2-1.3L14 3h-4l-.4 2.5a7 7 0 00-2.2 1.3l-2.3-1-2 3.4 2 1.5a7 7 0 000 2.6l-2 1.5 2 3.4 2.3-1a7 7 0 002.2 1.3L10 21h4l.4-2.5a7 7 0 002.2-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z',

  cross: 'M12 3v7M12 14v7M3 12h7M14 12h7',
  pointer: 'M5 3l14 8-6 2-2 6z',
  erase: 'M4 16l8-9 7 6-5 6H8zM9 19h11',
  measure: 'M3 16L16 3l5 5L8 21zM7 12l2 2M10 9l2 2M13 6l2 2',
  trend: `M6.5 17.5l11-11${dot(5, 19)}${dot(19, 5)}`,
  ray: `M7.5 16.5L21 3${dot(6, 18)}${dot(13.5, 10.5)}`,
  extended: `M3 21l4.5-4.5M10.5 13.5l3-3M16.5 7.5L21 3${dot(9, 15)}${dot(15, 9)}`,
  hline: `M3 12h7M14 12h7${dot(12, 12)}`,
  hray: `M8 12h13${dot(6, 12)}`,
  vline: `M12 3v7M12 14v7${dot(12, 12)}`,
  channel: `M4 14L16 4M8 20L20 10M6 17l12-10`,
  fib: 'M4 5h16M4 10h16M4 14h16M4 19h16',
  long: 'M4 4h16v16H4zM4 13h16M9.5 9L12 6.5 14.5 9M12 6.5V11',
  short: 'M4 4h16v16H4zM4 11h16M9.5 15l2.5 2.5 2.5-2.5M12 17.5V13',
  range: 'M4 4h16v16H4zM8 16l8-8M12 8h4v4',
  rect: 'M4 7h16v10H4z',
  ellipse: 'M12 6c5 0 9 2.7 9 6s-4 6-9 6-9-2.7-9-6 4-6 9-6z',
  arrow: 'M5 19L19 5M11 5h8v8',
  text: 'M5 6h14M12 6v13M9 19h6',
  info: `M6.5 17.5l11-11${dot(5, 19)}${dot(19, 5)}M14 15h7M14 19h5`,
  angle: 'M4 19h16M4 19L17 6M12 19a8 8 0 00-2.4-5.6',
  crossline: `M3 12h7M14 12h7M12 3v7M12 14v7${dot(12, 12)}`,
  pitchfork: 'M4 20l7-7M11 13l9-9M7 9l8-6M15 17l6-4.5M7 9l8 8',
  fibext: 'M4 19l5-10 4 5M13 6h8M13 11h8M13 16h8',
  priceRange: 'M5 5h14M5 19h14M12 7v10M9.5 9.5L12 7l2.5 2.5M9.5 14.5L12 17l2.5-2.5',
  dateRange: 'M5 5v14M19 5v14M7 12h10M9.5 9.5L7 12l2.5 2.5M14.5 9.5L17 12l-2.5 2.5',
  volumeProfile: 'M5 4v16M5 6h6M5 9.5h10M5 13h14M5 16.5h8M19 4v16',
  brush: 'M4 18c2.5 0 3-2 3-3.5 0-1.4 1.1-2.5 2.5-2.5S12 13.1 12 14.5c0 3-2.5 5.5-8 3.5zM11 12l8.5-8.5 1.5 1.5L12.5 13.5',
  arrowUp: 'M12 20V5M6 11l6-6 6 6',
  arrowDown: 'M12 4v15M6 13l6 6 6-6',
  circle: 'M12 4a8 8 0 100 16 8 8 0 000-16z',
  triangle: 'M12 5l8 14H4z',
  priceLabel: 'M4 8h10l5 4-5 4H4zM7.5 12h3',
  zoom: 'M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM15.5 15.5L20 20M10.5 8v5M8 10.5h5',
  dot: `M12 3v4M12 17v4M3 12h4M17 12h4${dot(12, 12)}`,
  highlighter: 'M5 19h5l9-9-4-4-9 9zM13 8l4 4M4 21h9',
  arrowMarker: 'M4 20L15 9M10 6h9v9l-3-3-9 9-3-3 9-9z',
  path: `M5 18l5-9 4 6 5-10${dot(5, 18)}${dot(10, 9)}${dot(14, 15)}M16 5h3v3`,
  polyline: `M5 17l3-10 8-2 4 8-7 6z${dot(5, 17)}${dot(8, 7)}${dot(16, 5)}${dot(20, 13)}${dot(13, 19)}`,
  flag: 'M6 21V4M6 5h11l-2.5 3.5L17 12H6',
  magnet: 'M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4zM6 8h4M14 8h4',
  stay: 'M4 20l3-.7L16 10l-2.3-2.3L4.7 17zM14 6l2-2 4 4-2 2M14 20h6',
  lock: 'M8 11V8a4 4 0 018 0v3M6 11h12v9H6z',
  unlock: 'M8 11V8a4 4 0 017.5-2M6 11h12v9H6z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  eyeOff: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6zM4 4l16 16',
} as const;

const FILLED = new Set<keyof typeof PATHS>(['play', 'pause', 'next', 'prev', 'pointer']);

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const filled = FILLED.has(name);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
