import { create } from 'zustand';
import { DataError, fetchFootprintWeek, fetchHistory, fetchWeek } from '../lib/api.ts';
import type { FootprintRow } from '../lib/footprint.ts';
import { aggregate, lastIndexAtOrBefore, mergeBar, type Bar } from '../lib/bars.ts';
import {
  exitPrice,
  marketPrice,
  MAX_LOTS,
  MIN_LOTS,
  newId,
  openPosition,
  pnlUsd,
  processBar,
  settle,
  validateLevels,
  validatePending,
  type Account,
  type EngineContext,
  type EngineEvent,
  type Side,
} from '../lib/engine.ts';
import { isSelectTool, type CursorTool, type Drawing, type ToolId } from '../lib/drawings.ts';
import { fmtMoney, fmtPrice } from '../lib/format.ts';
import { conversionPair, getInstrument } from '../lib/instruments.ts';
import { bucketStart, HOUR, MIN, tfMs, WEEK, weekStart, type DisplayZone, type Timeframe } from '../lib/time.ts';
import { NO_INDICATORS, saveZonePreference, useSessions, zonePreference, type IndicatorSettings, type Session } from '../store/sessions.ts';

const HISTORY_WEEKS = 78;
const SLOW_HISTORY_WEEKS = 26;
const SLOW_HISTORY_CHUNK = 4;
const LOOKBACK_WEEKS = 2;
const PRELOAD_BARS = 2500;
const MAX_EMPTY_WEEKS = 30;

export const replayData = {
  m1: [] as Bar[],
  hist: [] as Bar[],
  conv: [] as Bar[],
  chart: [] as Bar[],
  firstWeek: 0,
  nextWeek: 0,
  footprint: new Map<number, FootprintRow>(),
  footprintWeeks: new Set<number>(),
};
const data = replayData;

export interface Toast {
  id: number;
  kind: 'info' | 'win' | 'loss' | 'error';
  text: string;
}

export type SideTab = 'positions' | 'history';

const LOTS_KEY = 'piprewind.lots';
const DEFAULT_LOTS = '0.10';

function savedLots(): string {
  try {
    return localStorage.getItem(LOTS_KEY) || DEFAULT_LOTS;
  } catch {
    return DEFAULT_LOTS;
  }
}

const MAX_UNDO = 50;
let undoStack: Drawing[][] = [];

export interface OrderInput {
  side: Side;
  type: 'market' | 'limit' | 'stop';
  lots: number;
  price: number | null;
  sl: number | null;
  tp: number | null;
}

interface ReplayState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  session: Session | null;
  cursor: number;
  playing: boolean;
  speed: number;
  step: Timeframe | 'chart';
  loadingMore: boolean;
  backfilling: boolean;
  footprintRev: number;
  footprintLoading: boolean;
  endOfData: boolean;
  rev: number;
  tick: number;
  appended: number;
  toasts: Toast[];
  lots: string;
  sideTab: SideTab;
  tool: ToolId;
  cursorTool: CursorTool;
  stayInTool: boolean;
  magnet: boolean;
  magnetMode: 'weak' | 'strong';
  lockDrawings: boolean;
  hideDrawings: boolean;
  hideIndicators: boolean;
  hidePositions: boolean;
  selected: string | null;

  open(id: string): Promise<void>;
  close(): void;
  ensureFootprint(): Promise<void>;
  stepForward(): Promise<boolean>;
  stepBack(): void;
  play(): void;
  pause(): void;
  setSpeed(speed: number): void;
  setStep(step: Timeframe | 'chart'): void;
  setTimeframe(tf: Timeframe): void;
  goTo(time: number): Promise<void>;
  place(order: OrderInput): string | null;
  closePosition(id: string): void;
  closeAll(): void;
  modifyPosition(id: string, sl: number | null, tp: number | null): string | null;
  cancelOrder(id: string): void;
  modifyOrder(id: string, change: { price?: number; sl?: number | null; tp?: number | null }): string | null;
  annotate(id: string, note: string, tags: string[]): void;
  addDrawing(drawing: Omit<Drawing, 'id'>): string;
  updateDrawing(id: string, patch: Partial<Omit<Drawing, 'id'>>): void;
  removeDrawing(id: string): void;
  clearDrawings(): void;
  undoDrawing(): void;
  setTool(tool: ToolId): void;
  finishTool(): void;
  toggle(flag: 'stayInTool' | 'magnet' | 'lockDrawings' | 'hideDrawings' | 'hideIndicators' | 'hidePositions'): void;
  setMagnet(mode: 'weak' | 'strong'): void;
  hideAll(hidden: boolean): void;
  removeIndicators(): void;
  select(id: string | null): void;
  setLots(lots: string): void;
  setSideTab(tab: SideTab): void;
  patchSettings(patch: Partial<Pick<Session, 'name' | 'riskPct' | 'useSpread' | 'zone'>> & { indicators?: IndicatorSettings; zone?: DisplayZone }): void;
  toast(kind: Toast['kind'], text: string): void;
  dismissToast(id: number): void;
}

let openToken = 0;
let toastSeq = 0;
let playTimer: ReturnType<typeof setTimeout> | undefined;
let moreLoading: Promise<void> | null = null;

export function engineContext(session: Session): EngineContext {
  const instrument = getInstrument(session.symbol);
  const conv = conversionPair(instrument);
  return {
    instrument,
    useSpread: session.useSpread,
    quoteToUsd(t, price) {
      if (!conv) return 1;
      let rate = price;
      if (conv.symbol !== instrument.symbol) {
        const bar = data.conv[Math.max(0, lastIndexAtOrBefore(data.conv, t))];
        if (!bar) return 1;
        rate = bar.c;
      }
      return conv.invert ? 1 / rate : rate;
    },
  };
}

async function loadWeekPair(symbol: string, convSymbol: string | null, sunday: number): Promise<{ m: Bar[]; c: Bar[] }> {
  const [m, c] = await Promise.all([fetchWeek(symbol, sunday), convSymbol ? fetchWeek(convSymbol, sunday) : Promise.resolve([])]);
  return { m, c };
}

function appendAscending(target: Bar[], bars: Bar[]): void {
  let last = target.length ? target[target.length - 1].t : -Infinity;
  for (const bar of bars) {
    if (bar.t <= last) continue;
    target.push(bar);
    last = bar.t;
  }
}

function describe(event: EngineEvent, digits: number): Toast {
  if (event.kind === 'filled') {
    const p = event.position;
    return { id: ++toastSeq, kind: 'info', text: `${p.side === 'buy' ? 'Buy' : 'Sell'} ${p.type} filled at ${fmtPrice(p.entry, digits)}` };
  }
  const t = event.trade;
  const how = t.reason === 'tp' ? 'Take profit hit' : t.reason === 'sl' ? 'Stop loss hit' : 'Closed';
  return { id: ++toastSeq, kind: t.pnl >= 0 ? 'win' : 'loss', text: `${how}: ${fmtMoney(t.pnl, true)}` };
}

export const useReplay = create<ReplayState>((set, get) => {
  function commit(patch: Partial<Session>): Session {
    const session = { ...get().session!, ...patch, updatedAt: Date.now() };
    set({ session });
    useSessions.getState().save(session);
    return session;
  }

  function changeDrawings(change: (list: Drawing[]) => Drawing[]): void {
    const session = get().session;
    if (!session) return;
    undoStack.push(session.drawings);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    commit({ drawings: change(session.drawings) });
  }

  function pushToasts(toasts: Toast[]): void {
    if (toasts.length) set({ toasts: [...get().toasts, ...toasts].slice(-4) });
  }

  function rebuildChart(tf: Timeframe, cursor: number): void {
    const out: Bar[] = [];
    if (tfMs(tf) >= HOUR) aggregate(data.hist, tf, 0, data.hist.length, out);
    data.chart = aggregate(data.m1, tf, 0, cursor + 1, out);
  }

  function draftAccount(account: Account): Account {
    return { ...account, positions: account.positions.map((p) => ({ ...p })) };
  }

  function advance(target: number): void {
    const state = get();
    const session = state.session!;
    const ctx = engineContext(session);
    const active = session.account.positions.length + session.account.orders.length > 0;
    const account = active ? draftAccount(session.account) : session.account;
    const toasts: Toast[] = [];
    let lockTime = session.lockTime;
    let appended = 0;

    for (let i = state.cursor + 1; i <= target; i++) {
      const bar = data.m1[i];
      if (mergeBar(data.chart, bar, session.timeframe) === 'appended') appended++;
      if (!active) continue;
      const events = processBar(account, bar, ctx);
      if (events.length) lockTime = bar.t + MIN;
      for (const event of events) toasts.push(describe(event, ctx.instrument.digits));
    }

    set({ cursor: target, tick: state.tick + 1, appended });
    commit({ account, lockTime, cursorTime: data.m1[target].t });
    pushToasts(toasts);
  }

  async function loadMore(): Promise<void> {
    const state = get();
    if (state.endOfData || state.status !== 'ready' || !state.session) return;
    if (moreLoading) return moreLoading;
    const token = openToken;
    const symbol = state.session.symbol;
    const conv = conversionPair(getInstrument(symbol));
    const convSymbol = conv && conv.symbol !== symbol ? conv.symbol : null;
    set({ loadingMore: true });

    moreLoading = (async () => {
      try {
        for (let empty = 0; empty < MAX_EMPTY_WEEKS; empty++) {
          if (data.nextWeek > Date.now()) break;
          const part = await loadWeekPair(symbol, convSymbol, data.nextWeek);
          if (token !== openToken) return;
          data.nextWeek += WEEK;
          appendAscending(data.conv, part.c);
          if (part.m.length) {
            appendAscending(data.m1, part.m);
            return;
          }
        }
        set({ endOfData: true });
      } catch (error) {
        if (token !== openToken) return;
        get().pause();
        get().toast('error', error instanceof DataError ? error.message : 'Loading more candles failed.');
      } finally {
        moreLoading = null;
        if (token === openToken) set({ loadingMore: false });
      }
    })();
    return moreLoading;
  }

  async function backfillHistory(symbol: string, firstWeek: number, earliest: number): Promise<void> {
    const token = openToken;
    set({ backfilling: true });
    try {
      for (let before = firstWeek; before > firstWeek - SLOW_HISTORY_WEEKS * WEEK && before > earliest; before -= SLOW_HISTORY_CHUNK * WEEK) {
        const bars = await fetchHistory(symbol, before, SLOW_HISTORY_CHUNK);
        if (token !== openToken) return;
        if (bars.length === 0) continue;
        data.hist = bars.concat(data.hist);
        const state = get();
        if (state.status === 'ready' && state.session && tfMs(state.session.timeframe) >= HOUR) {
          rebuildChart(state.session.timeframe, state.cursor);
          set({ rev: state.rev + 1 });
        }
      }
    } catch {
    } finally {
      if (token === openToken) set({ backfilling: false });
    }
  }

  function schedulePlay(): void {
    playTimer = setTimeout(async () => {
      if (!get().playing) return;
      const moved = await get().stepForward();
      if (!moved) return get().pause();
      if (get().playing) schedulePlay();
    }, 1000 / get().speed);
  }

  function present(): { bar: Bar; now: number } {
    const bar = data.m1[get().cursor];
    return { bar, now: bar.t + MIN };
  }

  return {
    status: 'idle',
    error: null,
    session: null,
    cursor: -1,
    playing: false,
    speed: 2,
    step: 'chart',
    loadingMore: false,
    backfilling: false,
    footprintRev: 0,
    footprintLoading: false,
    endOfData: false,
    rev: 0,
    tick: 0,
    appended: 0,
    toasts: [],
    lots: savedLots(),
    sideTab: 'positions',
    tool: 'cross',
    cursorTool: 'cross',
    stayInTool: false,
    magnet: false,
    magnetMode: 'weak',
    lockDrawings: false,
    hideDrawings: false,
    hideIndicators: false,
    hidePositions: false,
    selected: null,

    async open(id) {
      const token = ++openToken;
      get().pause();
      const saved = useSessions.getState().sessions.find((s) => s.id === id);
      if (!saved) {
        set({ status: 'error', error: 'This session no longer exists.', session: null });
        return;
      }
      const session: Session = { ...saved, zone: zonePreference() };
      undoStack = [];
      set({ status: 'loading', error: null, session, cursor: -1, endOfData: false, loadingMore: false, backfilling: false, toasts: [], selected: null, tool: get().cursorTool });
      try {
        const instrument = getInstrument(session.symbol);
        const conv = conversionPair(instrument);
        const convSymbol = conv && conv.symbol !== session.symbol ? conv.symbol : null;
        const slowHistory = instrument.source === 'exness';
        const week = weekStart(session.cursorTime);
        const starts = Array.from({ length: LOOKBACK_WEEKS + 1 }, (_, i) => week - (LOOKBACK_WEEKS - i) * WEEK);
        const [parts, hist] = await Promise.all([
          Promise.all(starts.map((sunday) => loadWeekPair(session.symbol, convSymbol, sunday))),
          slowHistory ? Promise.resolve([]) : fetchHistory(session.symbol, starts[0], HISTORY_WEEKS),
        ]);
        if (token !== openToken) return;

        data.m1 = parts.flatMap((p) => p.m);
        data.conv = parts.flatMap((p) => p.c);
        data.hist = hist;
        data.firstWeek = starts[0];
        data.nextWeek = week + WEEK;
        data.footprint = new Map();
        data.footprintWeeks = new Set();
        if (data.m1.length === 0) throw new DataError('The archive has no candles around this date. Try a different week.');
        if (convSymbol && data.conv.length === 0) throw new DataError(`${convSymbol} candles are needed to convert profits to dollars, and the archive has none for this week.`);

        const cursor = Math.max(0, lastIndexAtOrBefore(data.m1, session.cursorTime));
        rebuildChart(session.timeframe, cursor);
        set({ status: 'ready', cursor, rev: get().rev + 1 });
        if (data.m1.length - cursor < PRELOAD_BARS) void loadMore();
        if (slowHistory) void backfillHistory(session.symbol, starts[0], Date.parse(instrument.from));
      } catch (error) {
        if (token !== openToken) return;
        set({ status: 'error', error: error instanceof DataError ? error.message : 'Something went wrong while loading this session.' });
      }
    },

    close() {
      openToken++;
      get().pause();
      data.m1 = [];
      data.hist = [];
      data.conv = [];
      data.chart = [];
      data.footprint = new Map();
      data.footprintWeeks = new Set();
      set({ status: 'idle', session: null, cursor: -1, backfilling: false, toasts: [], selected: null });
    },

    async ensureFootprint() {
      const state = get();
      if (state.status !== 'ready' || !state.session || state.footprintLoading) return;
      const symbol = state.session.symbol;
      if (getInstrument(symbol).source !== 'exness') return;
      const missing: number[] = [];
      for (let week = data.firstWeek; week < data.nextWeek; week += WEEK) if (!data.footprintWeeks.has(week)) missing.push(week);
      if (missing.length === 0) return;
      const token = openToken;
      set({ footprintLoading: true });
      try {
        for (const week of missing.reverse()) {
          const rows = await fetchFootprintWeek(symbol, week);
          if (token !== openToken) return;
          for (const row of rows) data.footprint.set(row[0] * 1000, row);
          data.footprintWeeks.add(week);
          set({ footprintRev: get().footprintRev + 1 });
        }
      } catch (error) {
        if (token === openToken) get().toast('error', error instanceof DataError ? error.message : 'Loading the footprint failed.');
      } finally {
        if (token === openToken) set({ footprintLoading: false });
      }
    },

    async stepForward() {
      let state = get();
      if (state.status !== 'ready' || !state.session) return false;
      if (state.cursor >= data.m1.length - 1) {
        const token = openToken;
        await loadMore();
        state = get();
        if (token !== openToken || state.status !== 'ready') return false;
        if (state.cursor >= data.m1.length - 1) {
          get().toast('info', 'You have reached the end of the available data.');
          return false;
        }
      }
      const tf = state.step === 'chart' ? state.session!.timeframe : state.step;
      let i = state.cursor + 1;
      const bucket = bucketStart(data.m1[i].t, tf);
      while (i + 1 < data.m1.length && bucketStart(data.m1[i + 1].t, tf) === bucket) i++;
      advance(i);
      if (data.m1.length - i < PRELOAD_BARS) void loadMore();
      return true;
    },

    stepBack() {
      const state = get();
      if (state.status !== 'ready' || !state.session) return;
      const tf = state.step === 'chart' ? state.session.timeframe : state.step;
      const bucket = bucketStart(data.m1[state.cursor].t, tf);
      let i = state.cursor;
      while (i > 0 && bucketStart(data.m1[i].t, tf) === bucket) i--;
      const earliest = Math.max(0, lastIndexAtOrBefore(data.m1, state.session.lockTime - MIN));
      i = Math.max(i, earliest);
      if (i >= state.cursor) {
        get().toast('info', i === 0 ? 'This is the start of the loaded candles.' : 'You cannot rewind past your latest order or trade.');
        return;
      }
      rebuildChart(state.session.timeframe, i);
      set({ cursor: i, rev: state.rev + 1 });
      commit({ cursorTime: data.m1[i].t });
    },

    play() {
      if (get().playing || get().status !== 'ready') return;
      set({ playing: true });
      schedulePlay();
    },

    pause() {
      clearTimeout(playTimer);
      if (get().playing) set({ playing: false });
    },

    setSpeed(speed) {
      set({ speed });
    },

    setStep(step) {
      set({ step });
    },

    setTimeframe(tf) {
      const state = get();
      if (state.status !== 'ready' || !state.session || state.session.timeframe === tf) return;
      rebuildChart(tf, state.cursor);
      commit({ timeframe: tf });
      set({ rev: state.rev + 1 });
    },

    async goTo(time) {
      const state = get();
      if (!state.session) return;
      if (state.session.account.positions.length + state.session.account.orders.length > 0) {
        get().toast('error', 'Close your open positions and cancel pending orders before jumping to another date.');
        return;
      }
      get().pause();
      const session = commit({ cursorTime: time - MIN, lockTime: time });
      await get().open(session.id);
    },

    place(order) {
      const state = get();
      if (state.status !== 'ready' || !state.session) return 'The session is still loading.';
      if (!(order.lots >= MIN_LOTS && order.lots <= MAX_LOTS)) return `Lot size must be between ${MIN_LOTS} and ${MAX_LOTS}.`;
      const session = state.session;
      const ctx = engineContext(session);
      const { bar, now } = present();
      const account = draftAccount(session.account);
      const digits = ctx.instrument.digits;

      if (order.type === 'market') {
        const entry = marketPrice(order.side, bar, ctx);
        const problem = validateLevels(order.side, entry, order.sl, order.tp);
        if (problem) return problem;
        openPosition(account, { side: order.side, type: 'market', lots: order.lots, entry, sl: order.sl, tp: order.tp, time: bar.t }, ctx);
        get().toast('info', `${order.side === 'buy' ? 'Bought' : 'Sold'} ${order.lots.toFixed(2)} lots at ${fmtPrice(entry, digits)}`);
      } else {
        if (order.price === null || !(order.price > 0)) return 'Enter the price for the pending order.';
        const problem = validatePending(order.side, order.type, order.price, bar, ctx) ?? validateLevels(order.side, order.price, order.sl, order.tp);
        if (problem) return problem;
        account.orders = [
          ...account.orders,
          { id: newId(), side: order.side, type: order.type, price: order.price, lots: order.lots, sl: order.sl, tp: order.tp, createdTime: bar.t, note: '', tags: [] },
        ];
        get().toast('info', `${order.side === 'buy' ? 'Buy' : 'Sell'} ${order.type} placed at ${fmtPrice(order.price, digits)}`);
      }
      commit({ account, lockTime: now });
      return null;
    },

    closePosition(id) {
      const state = get();
      if (state.status !== 'ready' || !state.session) return;
      const ctx = engineContext(state.session);
      const { bar, now } = present();
      const account = draftAccount(state.session.account);
      const position = account.positions.find((p) => p.id === id);
      if (!position) return;
      const trade = settle(account, position, exitPrice(position.side, bar, ctx), bar.t, 'manual', ctx);
      commit({ account, lockTime: now });
      pushToasts([describe({ kind: 'closed', trade }, ctx.instrument.digits)]);
    },

    closeAll() {
      const state = get();
      if (state.status !== 'ready' || !state.session) return;
      const ctx = engineContext(state.session);
      const { bar, now } = present();
      const account = draftAccount(state.session.account);
      if (account.positions.length + account.orders.length === 0) return;
      let total = 0;
      for (const position of account.positions) total += settle(account, position, exitPrice(position.side, bar, ctx), bar.t, 'manual', ctx).pnl;
      account.orders = [];
      commit({ account, lockTime: now });
      get().toast(total >= 0 ? 'win' : 'loss', `Everything closed: ${fmtMoney(total, true)}`);
    },

    modifyPosition(id, sl, tp) {
      const state = get();
      if (state.status !== 'ready' || !state.session) return 'The session is still loading.';
      const ctx = engineContext(state.session);
      const { bar, now } = present();
      const account = draftAccount(state.session.account);
      const position = account.positions.find((p) => p.id === id);
      if (!position) return 'That position is already closed.';
      const problem = validateLevels(position.side, exitPrice(position.side, bar, ctx), sl, tp);
      if (problem) return problem.replace('the entry price', 'the current price');
      position.sl = sl;
      position.tp = tp;
      if (position.riskUsd === null && sl !== null) {
        position.initialSl = sl;
        position.riskUsd = Math.abs(pnlUsd(position.side, position.lots, position.entry, sl, bar.t, ctx)) || null;
      }
      commit({ account, lockTime: now });
      return null;
    },

    cancelOrder(id) {
      const session = get().session;
      if (!session) return;
      commit({ account: { ...session.account, orders: session.account.orders.filter((o) => o.id !== id) } });
    },

    modifyOrder(id, change) {
      const state = get();
      if (state.status !== 'ready' || !state.session) return 'The session is still loading.';
      const ctx = engineContext(state.session);
      const { bar, now } = present();
      const order = state.session.account.orders.find((o) => o.id === id);
      if (!order) return 'That order is no longer pending.';
      const next = { ...order, ...change };
      const problem = validatePending(next.side, next.type, next.price, bar, ctx) ?? validateLevels(next.side, next.price, next.sl, next.tp);
      if (problem) return problem;
      commit({ account: { ...state.session.account, orders: state.session.account.orders.map((o) => (o.id === id ? next : o)) }, lockTime: now });
      return null;
    },

    annotate(id, note, tags) {
      const session = get().session;
      if (!session) return;
      const apply = <T extends { id: string }>(items: T[]): T[] => items.map((item) => (item.id === id ? { ...item, note, tags } : item));
      commit({ account: { ...session.account, positions: apply(session.account.positions), trades: apply(session.account.trades) } });
    },

    addDrawing(drawing) {
      const id = newId();
      changeDrawings((list) => [...list, { ...drawing, id }]);
      return id;
    },

    updateDrawing(id, patch) {
      changeDrawings((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    },

    removeDrawing(id) {
      changeDrawings((list) => list.filter((d) => d.id !== id));
      if (get().selected === id) set({ selected: null });
    },

    clearDrawings() {
      changeDrawings(() => []);
      set({ selected: null });
    },

    undoDrawing() {
      const previous = undoStack.pop();
      if (!previous || !get().session) return;
      commit({ drawings: previous });
      if (!previous.some((d) => d.id === get().selected)) set({ selected: null });
    },

    setTool(tool) {
      set(isSelectTool(tool) ? { tool, cursorTool: tool } : { tool, selected: null });
    },

    finishTool() {
      if (!get().stayInTool) set({ tool: get().cursorTool });
    },

    toggle(flag) {
      const next = !get()[flag];
      set(flag === 'lockDrawings' || flag === 'hideDrawings' ? { [flag]: next, selected: null } : { [flag]: next });
    },

    setMagnet(mode) {
      set({ magnet: true, magnetMode: mode });
    },

    hideAll(hidden) {
      set({ hideDrawings: hidden, hideIndicators: hidden, hidePositions: hidden, selected: null });
    },

    removeIndicators() {
      if (get().session) commit({ indicators: NO_INDICATORS });
    },

    select(id) {
      if (get().selected !== id) set({ selected: id });
    },

    setLots(lots) {
      set({ lots });
      try {
        localStorage.setItem(LOTS_KEY, lots);
      } catch {
      }
    },

    setSideTab(tab) {
      set({ sideTab: tab });
    },

    patchSettings(patch) {
      if (!get().session) return;
      if (patch.zone) saveZonePreference(patch.zone);
      commit(patch);
    },

    toast(kind, text) {
      pushToasts([{ id: ++toastSeq, kind, text }]);
    },

    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },

  };
});

export const currentBar = (cursor: number): Bar | null => data.m1[cursor] ?? null;
