import type { Bar } from './bars.ts';
import type { Instrument } from './instruments.ts';

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type CloseReason = 'sl' | 'tp' | 'manual';

export interface Position {
  id: string;
  side: Side;
  type: OrderType;
  lots: number;
  entry: number;
  sl: number | null;
  tp: number | null;
  initialSl: number | null;
  riskUsd: number | null;
  openTime: number;
  mae: number;
  mfe: number;
  note: string;
  tags: string[];
}

export interface PendingOrder {
  id: string;
  side: Side;
  type: 'limit' | 'stop';
  price: number;
  lots: number;
  sl: number | null;
  tp: number | null;
  createdTime: number;
  note: string;
  tags: string[];
}

export interface Trade {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  lots: number;
  entry: number;
  exit: number;
  sl: number | null;
  tp: number | null;
  openTime: number;
  closeTime: number;
  pnl: number;
  pips: number;
  r: number | null;
  riskUsd: number | null;
  reason: CloseReason;
  mae: number;
  mfe: number;
  note: string;
  tags: string[];
}

export interface Account {
  balance: number;
  positions: Position[];
  orders: PendingOrder[];
  trades: Trade[];
}

export interface EngineContext {
  instrument: Instrument;
  useSpread: boolean;
  quoteToUsd(t: number, price: number): number;
}

export type EngineEvent = { kind: 'filled'; position: Position } | { kind: 'closed'; trade: Trade };

export const MIN_LOTS = 0.01;
export const MAX_LOTS = 100;

let counter = 0;
export const newId = (): string => `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const dir = (side: Side): number => (side === 'buy' ? 1 : -1);
const cents = (n: number): number => Math.round(n * 100) / 100;
const spreadOf = (bar: Bar, ctx: EngineContext): number => (ctx.useSpread ? bar.s : 0);
const quoted = (price: number, ctx: EngineContext): number => Number(price.toFixed(ctx.instrument.digits));

export function marketPrice(side: Side, bar: Bar, ctx: EngineContext): number {
  return side === 'buy' ? quoted(bar.c + spreadOf(bar, ctx), ctx) : bar.c;
}

export function exitPrice(side: Side, bar: Bar, ctx: EngineContext): number {
  return side === 'buy' ? bar.c : quoted(bar.c + spreadOf(bar, ctx), ctx);
}

export function validateLevels(side: Side, entry: number, sl: number | null, tp: number | null): string | null {
  if (sl !== null && !(dir(side) * (entry - sl) > 0)) return side === 'buy' ? 'Stop loss must be below the entry price.' : 'Stop loss must be above the entry price.';
  if (tp !== null && !(dir(side) * (tp - entry) > 0)) return side === 'buy' ? 'Take profit must be above the entry price.' : 'Take profit must be below the entry price.';
  return null;
}

export function validatePending(side: Side, type: 'limit' | 'stop', price: number, bar: Bar, ctx: EngineContext): string | null {
  const market = marketPrice(side, bar, ctx);
  const mustBeBelow = (side === 'buy') === (type === 'limit');
  if (mustBeBelow ? price < market : price > market) return null;
  return `A ${side} ${type} must be ${mustBeBelow ? 'below' : 'above'} the current price.`;
}

export function lotsForRisk(riskUsd: number, entry: number, sl: number, time: number, ctx: EngineContext): number {
  const perLot = Math.abs(entry - sl) * ctx.instrument.contract * ctx.quoteToUsd(time, entry);
  if (!(perLot > 0) || !(riskUsd > 0)) return MIN_LOTS;
  return Math.min(MAX_LOTS, Math.max(MIN_LOTS, Math.floor((riskUsd / perLot) * 100 + 1e-9) / 100));
}

export function pnlUsd(side: Side, lots: number, entry: number, exit: number, time: number, ctx: EngineContext): number {
  return dir(side) * (exit - entry) * lots * ctx.instrument.contract * ctx.quoteToUsd(time, exit);
}

export interface OpenParams {
  side: Side;
  type: OrderType;
  lots: number;
  entry: number;
  sl: number | null;
  tp: number | null;
  time: number;
  note?: string;
  tags?: string[];
}

export function openPosition(acc: Account, p: OpenParams, ctx: EngineContext): Position {
  const position: Position = {
    id: newId(),
    side: p.side,
    type: p.type,
    lots: p.lots,
    entry: p.entry,
    sl: p.sl,
    tp: p.tp,
    initialSl: p.sl,
    riskUsd: p.sl === null ? null : cents(Math.abs(pnlUsd(p.side, p.lots, p.entry, p.sl, p.time, ctx))),
    openTime: p.time,
    mae: 0,
    mfe: 0,
    note: p.note ?? '',
    tags: p.tags ?? [],
  };
  acc.positions = [...acc.positions, position];
  return position;
}

export function settle(acc: Account, position: Position, price: number, time: number, reason: CloseReason, ctx: EngineContext): Trade {
  const move = dir(position.side) * (price - position.entry);
  const pnl = cents(pnlUsd(position.side, position.lots, position.entry, price, time, ctx));
  const trade: Trade = {
    id: position.id,
    symbol: ctx.instrument.symbol,
    side: position.side,
    type: position.type,
    lots: position.lots,
    entry: position.entry,
    exit: price,
    sl: position.initialSl,
    tp: position.tp,
    openTime: position.openTime,
    closeTime: time,
    pnl,
    pips: move / ctx.instrument.pip,
    r: position.riskUsd ? pnl / position.riskUsd : null,
    riskUsd: position.riskUsd,
    reason,
    mae: Math.max(position.mae, -move, 0),
    mfe: Math.max(position.mfe, move, 0),
    note: position.note,
    tags: position.tags,
  };
  acc.positions = acc.positions.filter((p) => p.id !== position.id);
  acc.trades = [...acc.trades, trade];
  acc.balance = cents(acc.balance + pnl);
  return trade;
}

function exitOnBar(p: Position, bar: Bar, s: number): { price: number; reason: CloseReason } | null {
  if (p.side === 'buy') {
    if (p.sl !== null && bar.l <= p.sl) return { price: Math.min(p.sl, bar.o), reason: 'sl' };
    if (p.tp !== null && bar.h >= p.tp) return { price: Math.max(p.tp, bar.o), reason: 'tp' };
    return null;
  }
  if (p.sl !== null && bar.h + s >= p.sl) return { price: Math.max(p.sl, bar.o + s), reason: 'sl' };
  if (p.tp !== null && bar.l + s <= p.tp) return { price: Math.min(p.tp, bar.o + s), reason: 'tp' };
  return null;
}

function fillOnBar(o: PendingOrder, bar: Bar, s: number): number | null {
  if (o.side === 'buy') {
    if (o.type === 'limit') return bar.l + s <= o.price ? Math.min(o.price, bar.o + s) : null;
    return bar.h + s >= o.price ? Math.max(o.price, bar.o + s) : null;
  }
  if (o.type === 'limit') return bar.h >= o.price ? Math.max(o.price, bar.o) : null;
  return bar.l <= o.price ? Math.min(o.price, bar.o) : null;
}

export function processBar(acc: Account, bar: Bar, ctx: EngineContext): EngineEvent[] {
  if (acc.positions.length === 0 && acc.orders.length === 0) return [];
  const s = spreadOf(bar, ctx);
  const events: EngineEvent[] = [];

  for (const p of acc.positions) {
    const exit = exitOnBar(p, bar, s);
    if (exit) {
      events.push({ kind: 'closed', trade: settle(acc, p, quoted(exit.price, ctx), bar.t, exit.reason, ctx) });
      continue;
    }
    const against = p.side === 'buy' ? p.entry - bar.l : bar.h + s - p.entry;
    const inFavour = p.side === 'buy' ? bar.h - p.entry : p.entry - (bar.l + s);
    if (against > p.mae) p.mae = against;
    if (inFavour > p.mfe) p.mfe = inFavour;
  }

  for (const o of acc.orders) {
    const filled = fillOnBar(o, bar, s);
    if (filled === null) continue;
    const price = quoted(filled, ctx);
    acc.orders = acc.orders.filter((x) => x.id !== o.id);
    const sl = o.sl !== null && dir(o.side) * (price - o.sl) > 0 ? o.sl : null;
    const tp = o.tp !== null && dir(o.side) * (o.tp - price) > 0 ? o.tp : null;
    const position = openPosition(acc, { side: o.side, type: o.type, lots: o.lots, entry: price, sl, tp, time: bar.t, note: o.note, tags: o.tags }, ctx);
    events.push({ kind: 'filled', position });
  }
  return events;
}

export function floatingPnl(acc: Account, bar: Bar, ctx: EngineContext): number {
  let total = 0;
  for (const p of acc.positions) total += pnlUsd(p.side, p.lots, p.entry, exitPrice(p.side, bar, ctx), bar.t, ctx);
  return cents(total);
}
