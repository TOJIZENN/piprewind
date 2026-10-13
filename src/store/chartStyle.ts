import { create } from 'zustand';

export interface ChartStyle {
  type: 'candles' | 'footprint';
  background: string;
  text: string;
  grid: string;
  gridVisible: boolean;
  crosshair: string;
  upBody: string;
  downBody: string;
  upWick: string;
  downWick: string;
  upBorder: string;
  downBorder: string;
  borders: boolean;
}

type Colours = Omit<ChartStyle, 'type'>;

export const CHART_PRESETS: { id: string; label: string; colours: Colours }[] = [
  {
    id: 'piprewind',
    label: 'PipRewind',
    colours: {
      background: '#ffffff', text: '#5b6678', grid: '#eef2f7', gridVisible: true, crosshair: '#8a94a6',
      upBody: '#089981', downBody: '#f23645', upWick: '#089981', downWick: '#f23645', upBorder: '#089981', downBorder: '#f23645', borders: false,
    },
  },
  {
    id: 'blue',
    label: 'Blue candles',
    colours: {
      background: '#ffffff', text: '#5b6678', grid: '#eef2f7', gridVisible: true, crosshair: '#8a94a6',
      upBody: '#2563eb', downBody: '#ffffff', upWick: '#2563eb', downWick: '#64748b', upBorder: '#2563eb', downBorder: '#64748b', borders: true,
    },
  },
  {
    id: 'night',
    label: 'Night',
    colours: {
      background: '#0b0e13', text: '#8b93a3', grid: '#14181f', gridVisible: true, crosshair: '#758696',
      upBody: '#21c59a', downBody: '#f0506e', upWick: '#21c59a', downWick: '#f0506e', upBorder: '#21c59a', downBorder: '#f0506e', borders: false,
    },
  },
  {
    id: 'tv-dark',
    label: 'Dark',
    colours: {
      background: '#131722', text: '#b2b5be', grid: '#1e222d', gridVisible: true, crosshair: '#9598a1',
      upBody: '#089981', downBody: '#f23645', upWick: '#089981', downWick: '#f23645', upBorder: '#089981', downBorder: '#f23645', borders: true,
    },
  },
  {
    id: 'black',
    label: 'Black',
    colours: {
      background: '#000000', text: '#9aa1ae', grid: '#111111', gridVisible: false, crosshair: '#6b7280',
      upBody: '#ffffff', downBody: '#000000', upWick: '#c8ccd4', downWick: '#c8ccd4', upBorder: '#c8ccd4', downBorder: '#c8ccd4', borders: true,
    },
  },
];

export const DEFAULT_CHART_STYLE: ChartStyle = { type: 'candles', ...CHART_PRESETS[0].colours };

const STORAGE_KEY = 'piprewind.chartStyle';

function read(): ChartStyle {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return saved && typeof saved === 'object' ? { ...DEFAULT_CHART_STYLE, ...(saved as Partial<ChartStyle>) } : DEFAULT_CHART_STYLE;
  } catch {
    return DEFAULT_CHART_STYLE;
  }
}

interface ChartStyleState {
  style: ChartStyle;
  change(patch: Partial<ChartStyle>): void;
}

export const useChartStyle = create<ChartStyleState>((set, get) => ({
  style: read(),
  change(patch) {
    const style = { ...get().style, ...patch };
    set({ style });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
    } catch {
    }
  },
}));

export function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  if (hex.length !== 7 || Number.isNaN(n)) return false;
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150;
}
