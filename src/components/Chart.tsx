import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Logical,
  type MouseEventParams,
  type SeriesMarkerBar,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { lastIndexAtOrBefore, type Bar } from '../lib/bars.ts';
import {
  DEFAULT_COLOR,
  DRAWING_COLORS,
  isPosition,
  isSelectTool,
  isStroke,
  moveAll,
  moveHandle,
  newPosition,
  TOOLS,
  type Anchor,
  type Drawing,
  type DrawingKind,
} from '../lib/drawings.ts';
import { marketPrice, pnlUsd } from '../lib/engine.ts';
import { addMinute, emptyProfile, type Profile } from '../lib/footprint.ts';
import { fmtDuration, fmtMoney, fmtPrice } from '../lib/format.ts';
import { extendEma } from '../lib/indicators.ts';
import { getInstrument } from '../lib/instruments.ts';
import { MIN, tfMs, WEEK, weekStart, zoneOffset, type DisplayZone } from '../lib/time.ts';
import { extent, fmtVolume, ProfileBuilder } from '../lib/volumeProfile.ts';
import { currentBar, engineContext, replayData, useReplay } from '../replay/store.ts';
import { isLight, useChartStyle } from '../store/chartStyle.ts';
import { NO_INDICATORS, type IndicatorSettings, type Session } from '../store/sessions.ts';
import { DrawingsPrimitive, type Shape } from './drawings.ts';
import { FOOTPRINT_SPACING, FootprintPrimitive } from './footprint.ts';
import { Icon } from './Icon.tsx';
import { FramePrimitive } from './frame.ts';
import { parseLots, TradeButtons } from './TradeButtons.tsx';
import { TradeLines, type ChartBridge } from './TradeLines.tsx';

export const UP = '#089981';
export const DOWN = '#f23645';
const MUTED = '#5b6678';
const MEASURE_COLOR = '#2563eb';
const MAGNET_PX = 30;
const POSITION_BARS = 24;
const RIGHT_OFFSET = 10;
const MAX_STROKE_POINTS = 1500;
const MAX_INCREMENTAL = 80;

export const EMAS = [
  { key: 'ema9', period: 9, color: '#e91e63' },
  { key: 'ema15', period: 15, color: '#0891b2' },
] as const;

interface Handles {
  chart: IChartApi;
  candles: ISeriesApi<'Candlestick'>;
  markers: ISeriesMarkersPluginApi<Time>;
  drawings: DrawingsPrimitive;
  paintHook: FramePrimitive;
  ema: Record<string, { series: ISeriesApi<'Line'> | null; values: number[] }>;
  times: number[];
  viewKey: string;
  footprint: FootprintPrimitive;
  profiles: Map<number, Profile | null>;
  profilesKey: string;
  spacingBefore: number | null;
}

function chartTime(bar: Bar, zone: DisplayZone, previous: number): number {
  const time = Math.floor((bar.t + zoneOffset(zone, bar.t)) / 1000);
  return time <= previous ? previous + 1 : time;
}

const candle = (bar: Bar, time: number) => ({ time: time as UTCTimestamp, open: bar.o, high: bar.h, low: bar.l, close: bar.c });

function linePoints(values: number[], times: number[], from = 0) {
  const points: { time: UTCTimestamp; value: number }[] = [];
  for (let i = from; i < values.length; i++) if (!Number.isNaN(values[i])) points.push({ time: times[i] as UTCTimestamp, value: values[i] });
  return points;
}

function syncIndicators(h: Handles, settings: IndicatorSettings, from: number, full: boolean): void {
  const bars = replayData.chart;
  for (const def of EMAS) {
    const slot = h.ema[def.key];
    if (!settings[def.key]) {
      if (slot.series) h.chart.removeSeries(slot.series);
      slot.series = null;
      continue;
    }
    const fresh = !slot.series;
    slot.series ??= h.chart.addSeries(LineSeries, { color: def.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    extendEma(slot.values, bars, def.period, fresh || full ? 0 : from);
    if (fresh || full) slot.series.setData(linePoints(slot.values, h.times));
    else for (const point of linePoints(slot.values, h.times, from)) slot.series.update(point);
  }

}

const shownIndicators = (session: Session): IndicatorSettings => (useReplay.getState().hideIndicators ? NO_INDICATORS : session.indicators);

function drawAll(h: Handles, session: Session): void {
  const bars = replayData.chart;
  const times = (h.times = new Array<number>(bars.length));
  let previous = -Infinity;
  h.candles.setData(
    bars.map((bar, i) => {
      previous = times[i] = chartTime(bar, session.zone, previous);
      return candle(bar, previous);
    }),
  );
  syncIndicators(h, shownIndicators(session), 0, true);

  const viewKey = `${session.id}:${session.timeframe}:${session.zone}`;
  if (viewKey !== h.viewKey) {
    h.viewKey = viewKey;
    const scale = h.chart.timeScale();
    if (h.spacingBefore === null) scale.setVisibleLogicalRange({ from: bars.length - 130, to: bars.length + 10 });
    else {
      scale.applyOptions({ barSpacing: FOOTPRINT_SPACING, rightOffset: 1 });
      scale.scrollToPosition(1, false);
    }
  }
}

function drawAppended(h: Handles, session: Session, appended: number): void {
  const bars = replayData.chart;
  const from = Math.max(0, bars.length - appended - 1);
  if (appended > MAX_INCREMENTAL || h.times.length !== bars.length - appended) return drawAll(h, session);
  for (let i = from; i < bars.length; i++) {
    h.times[i] = chartTime(bars[i], session.zone, i > 0 ? h.times[i - 1] : -Infinity);
    h.candles.update(candle(bars[i], h.times[i]));
  }
  syncIndicators(h, shownIndicators(session), from, false);
}

function tradeMarkers(session: Session, times: number[]): SeriesMarkerBar<Time>[] {
  const bars = replayData.chart;
  const ms = tfMs(session.timeframe);
  const markers: SeriesMarkerBar<Time>[] = [];
  const add = (t: number, marker: Omit<SeriesMarkerBar<Time>, 'time'>): void => {
    const i = lastIndexAtOrBefore(bars, t);
    if (i >= 0 && t - bars[i].t < ms) markers.push({ ...marker, time: times[i] as UTCTimestamp });
  };
  const entry = (t: number, side: 'buy' | 'sell'): void =>
    add(t, side === 'buy' ? { position: 'belowBar', shape: 'arrowUp', color: UP, text: 'Buy' } : { position: 'aboveBar', shape: 'arrowDown', color: DOWN, text: 'Sell' });

  for (const trade of session.account.trades) {
    entry(trade.openTime, trade.side);
    add(trade.closeTime, { position: trade.side === 'buy' ? 'aboveBar' : 'belowBar', shape: 'circle', color: trade.pnl >= 0 ? UP : DOWN, text: fmtMoney(trade.pnl, true) });
  }
  for (const position of session.account.positions) entry(position.openTime, position.side);
  return markers.sort((a, b) => (a.time as number) - (b.time as number));
}

function indexOfTime(t: number, ms: number, within = false): number {
  const bars = replayData.chart;
  if (bars.length === 0) return 0;
  const last = bars.length - 1;
  if (t >= bars[last].t + ms) return last + (t - bars[last].t) / ms;
  const i = lastIndexAtOrBefore(bars, t);
  if (i < 0) return (t - bars[0].t) / ms;
  return within ? i + Math.min(0.999, (t - bars[i].t) / ms) : i;
}

function timeOfIndex(index: number, ms: number): number {
  const bars = replayData.chart;
  const last = bars.length - 1;
  if (index > last) return bars[last].t + (index - last) * ms;
  if (index < 0) return bars[0].t + index * ms;
  return bars[index].t;
}

function describe(d: Pick<Drawing, 'kind' | 'points'>, session: Session): Shape['info'] {
  const inst = getInstrument(session.symbol);
  const price = (x: number): string => fmtPrice(x, inst.digits);
  if (isPosition(d.kind) && d.points.length === 3) {
    const [entry, stop, target] = d.points;
    const ctx = engineContext(session);
    const side = d.kind === 'long' ? 'buy' : 'sell';
    const state = useReplay.getState();
    const now = currentBar(state.cursor)?.t ?? entry.t;
    const lots = parseLots(state.lots);
    const amount = (level: number): string => (lots === null ? '' : `, ${fmtMoney(Math.abs(pnlUsd(side, lots, entry.p, level, now, ctx)))}`);
    const away = (level: number): string => `(${((Math.abs(level - entry.p) / entry.p) * 100).toFixed(2)}%) ${(Math.abs(level - entry.p) / inst.pip).toFixed(1)} pips`;
    return {
      top: `Target ${price(target.p)} ${away(target.p)}${amount(target.p)}`,
      bottom: `Stop ${price(stop.p)} ${away(stop.p)}${amount(stop.p)}`,
      middle: `Risk/Reward ${(Math.abs(target.p - entry.p) / Math.abs(entry.p - stop.p)).toFixed(2)}${lots === null ? '' : ` · ${lots.toFixed(2)} lots`}`,
    };
  }
  if (d.points.length !== 2) return undefined;
  const [a, b] = d.points;
  const diff = b.p - a.p;
  const ms = tfMs(session.timeframe);
  const count = Math.round(Math.abs(indexOfTime(b.t, ms) - indexOfTime(a.t, ms)));
  const move = `${diff >= 0 ? '+' : ''}${price(diff)} (${((diff / a.p) * 100).toFixed(2)}%) ${(diff / inst.pip).toFixed(1)} pips`;
  const span = `${count} bar${count === 1 ? '' : 's'}, ${fmtDuration(Math.abs(b.t - a.t))}`;
  if (d.kind === 'range') return { top: move, bottom: span };
  if (d.kind === 'priceRange') return { top: move };
  if (d.kind === 'dateRange') return { top: span };
  if (d.kind === 'info') return { top: `${move} · ${span}` };
  return undefined;
}

const firstIndexFrom = (bars: Bar[], t: number): number => lastIndexAtOrBefore(bars, t - 1) + 1;

type ProfileView = Pick<Shape, 'profile' | 'info'>;
const profileCache = new Map<string, { key: string; view: ProfileView }>();

function profileView(d: Pick<Drawing, 'id' | 'points'>, session: Session): ProfileView {
  const chart = replayData.chart;
  if (d.points.length < 2 || chart.length === 0) return {};
  const ms = tfMs(session.timeframe);
  const last = chart.length - 1;
  const from = Math.max(0, Math.floor(indexOfTime(Math.min(d.points[0].t, d.points[1].t), ms)));
  const to = Math.min(last, Math.floor(indexOfTime(Math.max(d.points[0].t, d.points[1].t), ms)));
  if (from > to) return {};

  const state = useReplay.getState();
  const inst = getInstrument(session.symbol);
  const { m1, hist, footprint, footprintWeeks } = replayData;
  const start = chart[from].t;
  const end = to < last ? chart[to + 1].t : Infinity;
  const revealed = state.cursor + 1;
  const mFrom = firstIndexFrom(m1, start);
  const mTo = Math.min(revealed, end === Infinity ? revealed : firstIndexFrom(m1, end));
  const hFrom = firstIndexFrom(hist, start);
  const hTo = end === Infinity ? hist.length : firstIndexFrom(hist, end);
  const range = extent(hist, hFrom, hTo, extent(m1, mFrom, mTo));
  if (!range) return {};

  const tickPair = inst.source === 'exness';
  let ticks = tickPair && hTo <= hFrom && mTo > mFrom;
  if (ticks) for (let week = weekStart(m1[mFrom].t); week <= m1[mTo - 1].t; week += WEEK) ticks &&= footprintWeeks.has(week);

  const key = [session.timeframe, start, end, mFrom, mTo, hFrom, hTo, ticks, state.footprintLoading].join(':');
  const cached = profileCache.get(d.id);
  if (cached?.key === key) return cached.view;

  let builder = new ProfileBuilder(range.low, range.high);
  if (ticks) {
    for (let i = mFrom; i < mTo; i++) {
      const row = footprint.get(m1[i].t);
      if (row) builder.addTicks(row, inst.pip);
    }
  }
  let data = ticks ? builder.build() : null;
  if (!data) {
    ticks = false;
    builder = new ProfileBuilder(range.low, range.high);
    for (let i = hFrom; i < hTo; i++) builder.addBar(hist[i], 60);
    for (let i = mFrom; i < mTo; i++) builder.addBar(m1[i], 1);
    data = builder.build();
  }
  if (!data) return {};

  const price = (x: number): string => fmtPrice(x, inst.digits);
  const poc = data.rows[data.poc];
  const area = data.rows.filter((row) => row.valueArea);
  const levels = `POC ${price((poc.top + poc.bottom) / 2)} · VA ${price(area[0].bottom)} to ${price(area[area.length - 1].top)}`;
  const source = ticks
    ? `Tick volume ${fmtVolume(data.up + data.down)}: ${fmtVolume(data.up)} up, ${fmtVolume(data.down)} down`
    : !tickPair
      ? 'Time at price: this pair has no volume data'
      : hTo > hFrom
        ? 'Time at price: tick volume covers the 1-minute history only'
        : state.footprintLoading
          ? 'Time at price while the tick volume loads'
          : 'Time at price: no tick volume for this range';
  const view: ProfileView = { profile: { data, from, to }, info: { top: levels, bottom: source } };
  if (profileCache.size > 200) profileCache.clear();
  profileCache.set(d.id, { key, view });
  return view;
}

function toShape(d: Pick<Drawing, 'id' | 'kind' | 'points' | 'color' | 'text'>, session: Session, selected: boolean): Shape {
  const ms = tfMs(session.timeframe);
  if (d.kind === 'volumeProfile') {
    return { id: d.id, kind: d.kind, points: d.points.map((a) => ({ i: indexOfTime(a.t, ms), p: a.p })), color: d.color ?? DEFAULT_COLOR, selected, ...profileView(d, session) };
  }
  return {
    id: d.id,
    kind: d.kind,
    points: d.points.map((a) => ({ i: indexOfTime(a.t, ms, isStroke(d.kind)), p: a.p })),
    color: d.color ?? (d.kind === 'arrowUp' ? UP : d.kind === 'arrowDown' ? DOWN : DEFAULT_COLOR),
    text: d.text,
    selected,
    info: describe(d, session),
  };
}

interface Draft {
  kind: DrawingKind | 'measure' | 'zoom';
  points: Anchor[];
}

interface DragState {
  id: string;
  handle: number | null;
  startIndex: number;
  startPrice: number;
  original: Drawing;
  current: Anchor[] | null;
}

export function Chart() {
  const container = useRef<HTMLDivElement>(null);
  const legend = useRef<HTMLDivElement>(null);
  const handles = useRef<Handles | null>(null);
  const draft = useRef<Draft | null>(null);
  const pointer = useRef<Anchor | null>(null);
  const measured = useRef<Anchor[] | null>(null);
  const dragging = useRef<DragState | null>(null);
  const stroke = useRef<{ kind: 'brush' | 'highlighter'; points: Anchor[] } | null>(null);
  const hovered = useRef<number | null>(null);
  const [bridge, setBridge] = useState<ChartBridge | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; at: Anchor; x: number; y: number; value: string } | null>(null);

  const session = useReplay((s) => s.session)!;
  const rev = useReplay((s) => s.rev);
  const tick = useReplay((s) => s.tick);
  const tool = useReplay((s) => s.tool);
  const selected = useReplay((s) => s.selected);
  const hideDrawings = useReplay((s) => s.hideDrawings);
  const hideIndicators = useReplay((s) => s.hideIndicators);
  const hidePositions = useReplay((s) => s.hidePositions);
  const lots = useReplay((s) => s.lots);
  const footprintRev = useReplay((s) => s.footprintRev);
  const loadingMore = useReplay((s) => s.loadingMore);
  const footprintLoading = useReplay((s) => s.footprintLoading);
  const style = useChartStyle((s) => s.style);
  const digits = getInstrument(session.symbol).digits;
  const footprintAvailable = getInstrument(session.symbol).source === 'exness';
  const footprintOn = style.type === 'footprint' && footprintAvailable;
  const selectedDrawing = selected ? session.drawings.find((d) => d.id === selected) : undefined;

  const showLegend = (): void => {
    const bars = replayData.chart;
    const bar = (hovered.current !== null ? bars[hovered.current] : undefined) ?? bars[bars.length - 1];
    if (!legend.current || !bar) return;
    const change = ((bar.c - bar.o) / bar.o) * 100;
    legend.current.innerHTML =
      `<span>O <b>${fmtPrice(bar.o, digits)}</b></span><span>H <b>${fmtPrice(bar.h, digits)}</b></span>` +
      `<span>L <b>${fmtPrice(bar.l, digits)}</b></span><span>C <b>${fmtPrice(bar.c, digits)}</b></span>` +
      `<span class="${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span>`;
  };

  const refresh = (): void => {
    const h = handles.current;
    const state = useReplay.getState();
    if (!h || !state.session) return;
    const s = state.session;
    const shapes: Shape[] = [];
    if (!state.hideDrawings) {
      for (const d of s.drawings) {
        const drag = dragging.current;
        shapes.push(toShape(drag?.id === d.id && drag.current ? { ...d, points: drag.current } : d, s, state.selected === d.id));
      }
    }
    if (draft.current) {
      const points = pointer.current ? [...draft.current.points, pointer.current] : draft.current.points;
      const kind = draft.current.kind;
      const passing = kind === 'measure' || kind === 'zoom';
      shapes.push(toShape({ id: 'draft', kind: kind === 'measure' ? 'range' : kind === 'zoom' ? 'dateRange' : kind, points, color: passing ? MEASURE_COLOR : undefined }, s, false));
    }
    if (stroke.current && stroke.current.points.length > 1) shapes.push(toShape({ id: 'stroke', ...stroke.current }, s, false));
    if (measured.current) shapes.push(toShape({ id: 'measure', kind: 'range', points: measured.current, color: MEASURE_COLOR }, s, false));
    h.drawings.setShapes(shapes);
  };

  useEffect(() => {
    const el = container.current!;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: MUTED,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 11,
        panes: { separatorColor: '#e3e8f0', separatorHoverColor: '#c9d2df' },
        attributionLogo: true,
      },
      grid: { vertLines: { color: '#eef2f7' }, horzLines: { color: '#eef2f7' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#e3e8f0' },
      timeScale: { borderColor: '#e3e8f0', timeVisible: true, secondsVisible: false, rightOffset: RIGHT_OFFSET },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
      priceFormat: { type: 'price', precision: digits, minMove: 10 ** -digits },
    });
    const drawings = new DrawingsPrimitive((price) => fmtPrice(price, digits));
    const paintHook = new FramePrimitive();
    const footprint = new FootprintPrimitive();
    candles.attachPrimitive(paintHook);
    candles.attachPrimitive(footprint);
    candles.attachPrimitive(drawings);
    handles.current = {
      chart,
      candles,
      drawings,
      paintHook,
      footprint,
      profiles: new Map(),
      profilesKey: '',
      spacingBefore: null,
      markers: createSeriesMarkers(candles, []),
      ema: Object.fromEntries(EMAS.map((def) => [def.key, { series: null, values: [] }])),
      times: [],
      viewKey: '',
    };

    const frameListeners = new Set<() => void>();
    paintHook.onPaint = () => frameListeners.forEach((listener) => listener());
    setBridge({
      el,
      yOf: (price) => candles.priceToCoordinate(price),
      priceAt: (y) => candles.coordinateToPrice(y),
      paneHeight: () => chart.panes()[0].getHeight(),
      axisWidth: () => chart.priceScale('right').width(),
      onFrame: (callback) => {
        frameListeners.add(callback);
        return () => frameListeners.delete(callback);
      },
    });

    const frame = (): number => tfMs(useReplay.getState().session!.timeframe);

    const anchorAt = (x: number, y: number, snap: boolean): Anchor | null => {
      const bars = replayData.chart;
      if (bars.length === 0 || x < 0 || y < 0 || x > chart.timeScale().width() || y > chart.panes()[0].getHeight()) return null;
      const raw = candles.coordinateToPrice(y);
      const logical = chart.timeScale().coordinateToLogical(x);
      if (raw === null || logical === null) return null;
      const index = Math.round(logical);
      let price: number = raw;
      const bar = bars[index];
      const magnet = useReplay.getState();
      if (snap && bar && magnet.magnet) {
        let best = magnet.magnetMode === 'strong' ? Infinity : MAGNET_PX;
        for (const level of [bar.o, bar.h, bar.l, bar.c]) {
          const levelY = candles.priceToCoordinate(level);
          if (levelY !== null && Math.abs(levelY - y) < best) {
            best = Math.abs(levelY - y);
            price = level;
          }
        }
      }
      return { t: timeOfIndex(index, frame()), p: Number(price.toFixed(digits)) };
    };

    const strokeAnchorAt = (x: number, y: number): Anchor | null => {
      if (replayData.chart.length === 0 || x < 0 || y < 0 || x > chart.timeScale().width() || y > chart.panes()[0].getHeight()) return null;
      const raw = candles.coordinateToPrice(y);
      const origin = chart.timeScale().logicalToCoordinate(0 as Logical);
      if (raw === null || origin === null) return null;
      const exact = (x - origin) / chart.timeScale().options().barSpacing;
      const whole = Math.floor(exact);
      return { t: timeOfIndex(whole, frame()) + (exact - whole) * frame(), p: Number(raw.toFixed(digits)) };
    };

    const local = (e: MouseEvent): { x: number; y: number } => {
      const box = el.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };

    const onClick = (x: number, y: number): void => {
      const at = anchorAt(x, y, true);
      if (!at) return;
      const replay = useReplay.getState();
      if (measured.current) {
        measured.current = null;
        refresh();
      }
      const active = replay.tool;
      if (isSelectTool(active)) return replay.select(null);
      if (active === 'erase') {
        const hit = replay.lockDrawings ? null : drawings.findAt(x, y);
        if (hit) replay.removeDrawing(hit.id);
        return;
      }
      if (replay.hideDrawings && active !== 'measure' && active !== 'zoom') replay.toggle('hideDrawings');

      const placed = (id: string): void => {
        replay.finishTool();
        if (!replay.stayInTool) replay.select(id);
      };
      if (active === 'long' || active === 'short') {
        const inst = getInstrument(replay.session!.symbol);
        const right = timeOfIndex(Math.round(indexOfTime(at.t, frame())) + POSITION_BARS, frame());
        return placed(replay.addDrawing({ kind: active, points: newPosition(active, at, inst.stopPips[1] * inst.pip, right) }));
      }
      if (active === 'text') {
        replay.finishTool();
        return setEditing({ id: null, at, x, y, value: '' });
      }
      if (TOOLS[active].clicks === 1) return placed(replay.addDrawing({ kind: active as DrawingKind, points: [at] }));
      if (TOOLS[active].multi) {
        if (!draft.current || draft.current.kind !== active) draft.current = { kind: active as DrawingKind, points: [] };
        const last = draft.current.points[draft.current.points.length - 1];
        if (!last || last.t !== at.t || last.p !== at.p) draft.current.points.push(at);
        pointer.current = at;
        return refresh();
      }

      if (!draft.current || draft.current.kind !== active) draft.current = { kind: active as Draft['kind'], points: [] };
      draft.current.points.push(at);
      if (draft.current.points.length < TOOLS[active].clicks) {
        pointer.current = at;
        return refresh();
      }
      const points = draft.current.points;
      draft.current = null;
      pointer.current = null;
      if (active === 'measure') {
        measured.current = points;
        replay.finishTool();
        return refresh();
      }
      if (active === 'zoom') {
        const [from, to] = points.map((a) => indexOfTime(a.t, frame())).sort((a, b) => a - b);
        if (to > from) chart.timeScale().setVisibleLogicalRange({ from: from - 0.5, to: to + 0.5 });
        replay.finishTool();
        return refresh();
      }
      placed(replay.addDrawing({ kind: active as DrawingKind, points }));
    };

    const finishMulti = (): boolean => {
      const current = draft.current;
      if (!current || !TOOLS[current.kind].multi) return false;
      const replay = useReplay.getState();
      draft.current = null;
      pointer.current = null;
      if (current.points.length >= (current.kind === 'polyline' ? 3 : 2)) {
        const id = replay.addDrawing({ kind: current.kind as DrawingKind, points: current.points });
        replay.finishTool();
        if (!replay.stayInTool) replay.select(id);
      }
      refresh();
      return true;
    };

    let down: { x: number; y: number } | null = null;
    let strokeAt = { x: 0, y: 0 };

    const holdChart = (e: PointerEvent): void => {
      chart.applyOptions({ handleScroll: false, handleScale: false });
      el.setPointerCapture(e.pointerId);
    };
    const releaseChart = (): void => chart.applyOptions({ handleScroll: true, handleScale: true });

    const onPointerDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY };
      const replay = useReplay.getState();
      const { x, y } = local(e);
      if (replay.tool === 'brush' || replay.tool === 'highlighter') {
        const at = strokeAnchorAt(x, y);
        if (!at) return;
        if (replay.hideDrawings) replay.toggle('hideDrawings');
        stroke.current = { kind: replay.tool, points: [at] };
        strokeAt = { x, y };
        return holdChart(e);
      }
      if (!isSelectTool(replay.tool) || replay.lockDrawings || replay.hideDrawings) return;
      const hit = drawings.findAt(x, y);
      const drawing = hit && replay.session!.drawings.find((d) => d.id === hit.id);
      const at = anchorAt(x, y, false);
      if (!hit || !drawing || !at) return;
      replay.select(drawing.id);
      dragging.current = { id: drawing.id, handle: hit.handle, startIndex: Math.round(indexOfTime(at.t, frame())), startPrice: at.p, original: drawing, current: null };
      holdChart(e);
    };

    const onPointerMove = (e: PointerEvent): void => {
      const { x, y } = local(e);
      if (stroke.current) {
        if (Math.hypot(x - strokeAt.x, y - strokeAt.y) < 3 || stroke.current.points.length >= MAX_STROKE_POINTS) return;
        const at = strokeAnchorAt(x, y);
        if (!at) return;
        stroke.current.points.push(at);
        strokeAt = { x, y };
        return refresh();
      }
      const drag = dragging.current;
      if (drag) {
        const at = anchorAt(x, y, drag.handle !== null);
        if (!at) return;
        const ms = frame();
        if (drag.handle === null) {
          const shift = Math.round(indexOfTime(at.t, ms)) - drag.startIndex;
          const freehand = isStroke(drag.original.kind);
          drag.current = moveAll(drag.original, at.p - drag.startPrice, (t) => {
            const exact = indexOfTime(t, ms, freehand);
            const whole = freehand ? Math.floor(exact) : Math.round(exact);
            return timeOfIndex(whole + shift, ms) + (freehand ? (exact - whole) * ms : 0);
          });
        } else {
          drag.current = moveHandle(drag.original, drag.handle, at, 10 ** -digits);
        }
        return refresh();
      }
      if (draft.current) {
        pointer.current = anchorAt(x, y, true);
        refresh();
      }
      const replay = useReplay.getState();
      const selecting = isSelectTool(replay.tool) && !replay.lockDrawings && !replay.hideDrawings;
      const hit = selecting || replay.tool === 'erase' ? drawings.findAt(x, y) : null;
      el.style.cursor = hit ? (hit.handle !== null ? 'grab' : 'pointer') : '';
    };

    const onPointerUp = (e: PointerEvent): void => {
      if (stroke.current) {
        const { kind, points } = stroke.current;
        stroke.current = null;
        down = null;
        releaseChart();
        const replay = useReplay.getState();
        if (points.length > 2) {
          const id = replay.addDrawing({ kind, points });
          replay.finishTool();
          if (!replay.stayInTool) replay.select(id);
        }
        return refresh();
      }
      const drag = dragging.current;
      if (drag) {
        dragging.current = null;
        down = null;
        releaseChart();
        if (drag.current) useReplay.getState().updateDrawing(drag.id, { points: drag.current.map((a) => ({ t: a.t, p: Number(a.p.toFixed(digits)) })) });
        return refresh();
      }
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const { x, y } = local(e);
      onClick(x, y);
    };

    const onDoubleClick = (e: MouseEvent): void => {
      if (finishMulti()) return;
      const replay = useReplay.getState();
      if (replay.lockDrawings || replay.hideDrawings) return;
      const { x, y } = local(e);
      const hit = drawings.findAt(x, y);
      const drawing = hit && replay.session!.drawings.find((d) => d.id === hit.id);
      if (drawing?.kind === 'text') setEditing({ id: drawing.id, at: drawing.points[0], x, y, value: drawing.text ?? '' });
    };

    const onEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && finishMulti()) return;
      if (e.key !== 'Escape') return;
      draft.current = null;
      pointer.current = null;
      measured.current = null;
      refresh();
    };

    const onCrosshair = (param: MouseEventParams<Time>): void => {
      hovered.current = param.logical !== undefined && param.point ? Math.round(param.logical) : null;
      showLegend();
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('dblclick', onDoubleClick);
    window.addEventListener('keydown', onEscape);
    chart.subscribeCrosshairMove(onCrosshair);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('keydown', onEscape);
      setBridge(null);
      chart.remove();
      handles.current = null;
    };
  }, [digits]);

  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    const clear = 'rgba(0, 0, 0, 0)';
    h.chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: style.background }, textColor: style.text, panes: { separatorColor: style.grid } },
      grid: { vertLines: { color: style.grid, visible: style.gridVisible }, horzLines: { color: style.grid, visible: style.gridVisible } },
      crosshair: { vertLine: { color: style.crosshair }, horzLine: { color: style.crosshair } },
      rightPriceScale: { borderColor: style.grid },
      timeScale: { borderColor: style.grid },
    });
    h.candles.applyOptions({
      upColor: footprintOn ? clear : style.upBody,
      downColor: footprintOn ? clear : style.downBody,
      wickUpColor: footprintOn ? clear : style.upWick,
      wickDownColor: footprintOn ? clear : style.downWick,
      borderVisible: !footprintOn && style.borders,
      borderUpColor: style.upBorder,
      borderDownColor: style.downBorder,
    });
    h.drawings.setBackground(style.background);
  }, [style, footprintOn, digits]);

  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    const scale = h.chart.timeScale();
    if (footprintOn && h.spacingBefore === null) {
      h.spacingBefore = scale.options().barSpacing;
      scale.applyOptions({ barSpacing: FOOTPRINT_SPACING, rightOffset: 1 });
      scale.scrollToPosition(1, false);
    } else if (!footprintOn && h.spacingBefore !== null) {
      scale.applyOptions({ barSpacing: h.spacingBefore, rightOffset: RIGHT_OFFSET });
      scale.scrollToPosition(RIGHT_OFFSET, false);
      h.spacingBefore = null;
    }
  }, [footprintOn, digits]);

  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    if (!footprintOn) return h.footprint.set(null);
    void useReplay.getState().ensureFootprint();
    const key = `${session.timeframe}:${footprintRev}:${rev}`;
    if (key !== h.profilesKey) {
      h.profilesKey = key;
      h.profiles.clear();
    }
    const ms = tfMs(session.timeframe);
    const profileOf = (index: number): Profile | null => {
      const bars = replayData.chart;
      const bar = bars[index];
      const forming = index === bars.length - 1;
      if (!forming && h.profiles.has(bar.t)) return h.profiles.get(bar.t)!;
      let profile: Profile | null = null;
      const revealed = (replayData.m1[useReplay.getState().cursor]?.t ?? -Infinity) + MIN;
      const end = Math.min(forming ? revealed : bars[index + 1].t, bar.t + ms);
      if (bar.t >= replayData.firstWeek) {
        for (let t = bar.t; t < end; t += MIN) {
          const row = replayData.footprint.get(t);
          if (row) addMinute((profile ??= emptyProfile()), row);
        }
      }
      if (!forming) h.profiles.set(bar.t, profile);
      return profile;
    };
    h.footprint.set({
      bars: replayData.chart,
      profileOf,
      step: getInstrument(session.symbol).pip,
      up: style.upBody,
      down: style.downBody,
      text: style.text,
      background: style.background,
      notice: footprintLoading && replayData.footprint.size === 0 ? 'Loading tick data for the footprint. The first time for a month can take a minute.' : null,
    });
  }, [footprintOn, footprintRev, footprintLoading, rev, tick, style, session.timeframe, digits]);

  useEffect(() => {
    const h = handles.current;
    if (h) drawAll(h, useReplay.getState().session!);
    showLegend();
  }, [rev, session.zone, digits]);

  useEffect(() => {
    const h = handles.current;
    if (h && tick > 0) drawAppended(h, useReplay.getState().session!, useReplay.getState().appended);
    showLegend();
  }, [tick]);

  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    syncIndicators(h, shownIndicators(session), 0, true);
  }, [session.indicators, hideIndicators]);

  useEffect(() => {
    const h = handles.current;
    if (h) h.markers.setMarkers(tradeMarkers(session, h.times));
  }, [session.account.trades, session.account.positions, rev, session.zone, digits]);

  useEffect(refresh, [session.drawings, selected, hideDrawings, rev, tick, digits, lots, footprintRev, footprintLoading]);

  const profiling = tool === 'volumeProfile' || session.drawings.some((d) => d.kind === 'volumeProfile');
  useEffect(() => {
    if (profiling) void useReplay.getState().ensureFootprint();
  }, [profiling, rev, loadingMore]);

  useEffect(() => {
    if (draft.current && draft.current.kind !== tool) {
      draft.current = null;
      pointer.current = null;
      refresh();
    }
    const lines = tool !== 'pointer' && tool !== 'dot';
    handles.current?.chart.applyOptions({ crosshair: { vertLine: { visible: lines, labelVisible: lines }, horzLine: { visible: lines, labelVisible: lines } } });
  }, [tool, digits]);

  const { addDrawing, updateDrawing, removeDrawing, select, place, toast } = useReplay.getState();

  const finishEditing = (): void => {
    if (!editing) return;
    const text = editing.value.trim();
    if (editing.id === null) {
      if (text) select(addDrawing({ kind: 'text', points: [editing.at], text }));
    } else if (text) updateDrawing(editing.id, { text });
    else removeDrawing(editing.id);
    setEditing(null);
  };

  const placeFromTool = (d: Drawing): void => {
    const [entry, stop, target] = d.points;
    const bar = currentBar(useReplay.getState().cursor);
    const size = parseLots(lots);
    if (!bar) return;
    if (size === null) return toast('error', 'Set a lot size with the Buy or Sell button first.');
    const inst = getInstrument(session.symbol);
    const side = d.kind === 'long' ? 'buy' : 'sell';
    const market = marketPrice(side, bar, engineContext(session));
    const type = Math.abs(entry.p - market) <= 2 * inst.pip ? 'market' : (side === 'buy') === entry.p < market ? 'limit' : 'stop';
    const problem = place({ side, type, lots: size, price: type === 'market' ? null : entry.p, sl: stop.p, tp: target.p });
    if (problem) toast('error', problem);
  };

  const aiming = !isSelectTool(tool);

  return (
    <div
      className={`chart${aiming ? ' chart-aim' : ''}${tool === 'dot' ? ' chart-dot' : ''}`}
      style={{ '--chart-fg': style.text, '--chart-strong': isLight(style.background) ? '#131722' : '#e8ebf1' } as React.CSSProperties}
    >
      <div ref={container} className="chart-canvas" />
      {style.type === 'footprint' && !footprintAvailable && (
        <div className="chart-note">The volume footprint needs tick data, which this app has for XAU/USD only. Showing candles.</div>
      )}
      {bridge && !hidePositions && <TradeLines bridge={bridge} />}
      <TradeButtons />
      <div ref={legend} className="chart-legend" />

      {selectedDrawing && !editing && (
        <div className="draw-bar" role="toolbar" aria-label="Selected drawing">
          <span className="draw-bar-name">{TOOLS[selectedDrawing.kind].label}</span>
          {!isPosition(selectedDrawing.kind) &&
            DRAWING_COLORS.map((color) => (
              <button
                key={color}
                className={`swatch${selectedDrawing.color === color ? ' on' : ''}`}
                style={{ background: color }}
                onClick={() => updateDrawing(selectedDrawing.id, { color })}
                title="Change colour"
                aria-label={`Colour ${color}`}
              />
            ))}
          {isPosition(selectedDrawing.kind) && (
            <button className="btn btn-quiet" onClick={() => placeFromTool(selectedDrawing)} title="Place an order with this entry, stop and target at the chosen lot size">
              <Icon name="ticket" size={14} /> Place order
            </button>
          )}
          {selectedDrawing.kind === 'text' && (
            <button
              className="icon-btn"
              title="Edit text"
              aria-label="Edit text"
              onClick={() => {
                const h = handles.current;
                const at = selectedDrawing.points[0];
                const x = h?.chart.timeScale().logicalToCoordinate(indexOfTime(at.t, tfMs(session.timeframe)) as Logical) ?? 40;
                const y = h?.candles.priceToCoordinate(at.p) ?? 40;
                setEditing({ id: selectedDrawing.id, at, x, y, value: selectedDrawing.text ?? '' });
              }}
            >
              <Icon name="edit" size={15} />
            </button>
          )}
          <button className="icon-btn" onClick={() => removeDrawing(selectedDrawing.id)} title="Remove (Delete)" aria-label="Remove this drawing">
            <Icon name="trash" size={15} />
          </button>
        </div>
      )}

      {editing && (
        <input
          className="chart-text-input"
          style={{ left: editing.x, top: editing.y - 14 }}
          autoFocus
          value={editing.value}
          placeholder="Type, then press Enter"
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          onBlur={finishEditing}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finishEditing();
            if (e.key === 'Escape') {
              e.stopPropagation();
              finishEditing();
            }
          }}
        />
      )}
    </div>
  );
}
