import { create } from 'zustand';
import { upgradeDrawing, type Drawing } from '../lib/drawings.ts';
import { newId, type Account } from '../lib/engine.ts';
import { DEFAULT_ZONE, isZone, MIN, type DisplayZone, type Timeframe } from '../lib/time.ts';

export interface IndicatorSettings {
  ema9: boolean;
  ema15: boolean;
}

export const NO_INDICATORS: IndicatorSettings = { ema9: false, ema15: false };

export interface Session {
  id: string;
  name: string;
  symbol: string;
  createdAt: number;
  updatedAt: number;
  startTime: number;
  cursorTime: number;
  lockTime: number;
  initialBalance: number;
  account: Account;
  riskPct: number;
  useSpread: boolean;
  timeframe: Timeframe;
  zone: DisplayZone;
  indicators: IndicatorSettings;
  drawings: Drawing[];
}

export interface NewSession {
  name: string;
  symbol: string;
  startTime: number;
  initialBalance: number;
  riskPct: number;
  useSpread: boolean;
  timeframe: Timeframe;
}

const STORAGE_KEY = 'piprewind.sessions.v1';
const ZONE_KEY = 'piprewind.zone';

export function zonePreference(): DisplayZone {
  try {
    const saved = localStorage.getItem(ZONE_KEY);
    return isZone(saved) ? saved : DEFAULT_ZONE;
  } catch {
    return DEFAULT_ZONE;
  }
}

export function saveZonePreference(zone: DisplayZone): void {
  try {
    localStorage.setItem(ZONE_KEY, zone);
  } catch {
  }
}
const SAVE_DELAY_MS = 800;

function read(): Session[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return (parsed as Session[]).map((session) => ({
      ...session,
      indicators: { ...NO_INDICATORS, ...session.indicators },
      drawings: (session.drawings ?? []).map(upgradeDrawing).filter((d): d is Drawing => d !== null),
    }));
  } catch {
    return [];
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function flush(): void {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(useSessions.getState().sessions));
  } catch {
  }
}

function scheduleSave(): void {
  saveTimer ??= setTimeout(flush, SAVE_DELAY_MS);
}

interface SessionsState {
  sessions: Session[];
  create(input: NewSession): Session;
  save(session: Session): void;
  remove(id: string): void;
}

export const useSessions = create<SessionsState>((set, get) => ({
  sessions: read(),
  create(input) {
    const now = Date.now();
    const latest = get().sessions.reduce<Session | null>((best, s) => (!best || s.updatedAt > best.updatedAt ? s : best), null);
    const session: Session = {
      id: newId(),
      name: input.name,
      symbol: input.symbol,
      createdAt: now,
      updatedAt: now,
      startTime: input.startTime,
      cursorTime: input.startTime - MIN,
      lockTime: input.startTime,
      initialBalance: input.initialBalance,
      account: { balance: input.initialBalance, positions: [], orders: [], trades: [] },
      riskPct: input.riskPct,
      useSpread: input.useSpread,
      timeframe: input.timeframe,
      zone: zonePreference(),
      indicators: { ...NO_INDICATORS, ...latest?.indicators },
      drawings: [],
    };
    set({ sessions: [session, ...get().sessions] });
    flush();
    return session;
  },
  save(session) {
    set({ sessions: get().sessions.map((s) => (s.id === session.id ? session : s)) });
    scheduleSave();
  },
  remove(id) {
    set({ sessions: get().sessions.filter((s) => s.id !== id) });
    flush();
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => saveTimer !== undefined && flush());
}
