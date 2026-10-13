import { describe, expect, it } from 'vitest';
import type { Bar } from './bars.ts';
import { aggregate } from './bars.ts';
import { floatingPnl, lotsForRisk, openPosition, processBar, settle, validateLevels, validatePending, type Account, type EngineContext } from './engine.ts';
import { getInstrument } from './instruments.ts';
import { computeStats, rDistribution } from './stats.ts';

const ctx = (symbol = 'EURUSD', useSpread = false, rate = 1): EngineContext => ({
  instrument: getInstrument(symbol),
  useSpread,
  quoteToUsd: () => rate,
});
const bar = (t: number, o: number, h: number, l: number, c: number, s = 0): Bar => ({ t: t * 60_000, o, h, l, c, s });
const account = (): Account => ({ balance: 10_000, positions: [], orders: [], trades: [] });

describe('positions', () => {
  it('closes a long at the stop and books -1R', () => {
    const acc = account();
    openPosition(acc, { side: 'buy', type: 'market', lots: 1, entry: 1.1, sl: 1.099, tp: 1.102, time: 0 }, ctx());
    expect(acc.positions[0].riskUsd).toBe(100);
    const events = processBar(acc, bar(1, 1.1, 1.1005, 1.0985, 1.0988), ctx());
    expect(events).toHaveLength(1);
    expect(acc.positions).toHaveLength(0);
    expect(acc.trades[0]).toMatchObject({ reason: 'sl', exit: 1.099, pnl: -100, r: -1 });
    expect(acc.balance).toBe(9_900);
  });

  it('takes the stop when one candle spans both the stop and the target', () => {
    const acc = account();
    openPosition(acc, { side: 'buy', type: 'market', lots: 1, entry: 1.1, sl: 1.099, tp: 1.102, time: 0 }, ctx());
    processBar(acc, bar(1, 1.1, 1.103, 1.098, 1.1), ctx());
    expect(acc.trades[0].reason).toBe('sl');
  });

  it('closes a long at the target for +2R and tracks excursions', () => {
    const acc = account();
    openPosition(acc, { side: 'buy', type: 'market', lots: 1, entry: 1.1, sl: 1.099, tp: 1.102, time: 0 }, ctx());
    processBar(acc, bar(1, 1.1, 1.101, 1.0995, 1.1008), ctx());
    expect(acc.positions[0].mae).toBeCloseTo(0.0005);
    processBar(acc, bar(2, 1.1008, 1.1025, 1.1005, 1.102), ctx());
    expect(acc.trades[0]).toMatchObject({ reason: 'tp', exit: 1.102, pnl: 200, r: 2 });
    expect(acc.trades[0].mfe).toBeCloseTo(0.002);
    expect(acc.trades[0].pips).toBeCloseTo(20);
  });

  it('fills a gap through the stop at the open, not at the stop', () => {
    const acc = account();
    openPosition(acc, { side: 'buy', type: 'market', lots: 1, entry: 1.1, sl: 1.099, tp: null, time: 0 }, ctx());
    processBar(acc, bar(1, 1.097, 1.0975, 1.0965, 1.097), ctx());
    expect(acc.trades[0].exit).toBe(1.097);
    expect(acc.trades[0].pnl).toBe(-300);
  });

  it('exits shorts on the ask when the spread is on', () => {
    const acc = account();
    const c = ctx('EURUSD', true);
    openPosition(acc, { side: 'sell', type: 'market', lots: 1, entry: 1.1, sl: 1.101, tp: 1.098, time: 0 }, c);
    processBar(acc, bar(1, 1.1, 1.1009, 1.0995, 1.1, 0.0002), c);
    expect(acc.trades[0]).toMatchObject({ reason: 'sl', exit: 1.101 });
  });

  it('converts profit through the quote currency rate', () => {
    const acc = account();
    const c = ctx('USDJPY', false, 1 / 150);
    openPosition(acc, { side: 'buy', type: 'market', lots: 1, entry: 150, sl: 149.5, tp: null, time: 0 }, c);
    expect(acc.positions[0].riskUsd).toBeCloseTo(333.33, 2);
    expect(floatingPnl(acc, bar(1, 150, 150.4, 150, 150.3), c)).toBeCloseTo(200, 2);
    const trade = settle(acc, acc.positions[0], 150.3, 60_000, 'manual', c);
    expect(trade.pips).toBeCloseTo(30);
  });
});

describe('pending orders', () => {
  it('fills a buy limit when the ask trades down to it and checks exits from the next candle', () => {
    const acc = account();
    acc.orders = [{ id: 'o', side: 'buy', type: 'limit', price: 1.099, lots: 0.5, sl: 1.098, tp: 1.101, createdTime: 0, note: '', tags: [] }];
    const events = processBar(acc, bar(1, 1.1, 1.1002, 1.0975, 1.0985), ctx());
    expect(events.map((e) => e.kind)).toEqual(['filled']);
    expect(acc.orders).toHaveLength(0);
    expect(acc.positions[0]).toMatchObject({ entry: 1.099, lots: 0.5, type: 'limit' });
    processBar(acc, bar(2, 1.0985, 1.0986, 1.0978, 1.098), ctx());
    expect(acc.trades[0].reason).toBe('sl');
  });

  it('fills a sell stop at the open when price gaps below it', () => {
    const acc = account();
    acc.orders = [{ id: 'o', side: 'sell', type: 'stop', price: 1.099, lots: 1, sl: null, tp: null, createdTime: 0, note: '', tags: [] }];
    processBar(acc, bar(1, 1.098, 1.0985, 1.0975, 1.098), ctx());
    expect(acc.positions[0].entry).toBe(1.098);
  });

  it('leaves an order alone when price does not reach it', () => {
    const acc = account();
    acc.orders = [{ id: 'o', side: 'buy', type: 'stop', price: 1.105, lots: 1, sl: null, tp: null, createdTime: 0, note: '', tags: [] }];
    expect(processBar(acc, bar(1, 1.1, 1.104, 1.099, 1.103), ctx())).toHaveLength(0);
    expect(acc.orders).toHaveLength(1);
  });
});

describe('validation and sizing', () => {
  it('rejects levels on the wrong side of the entry', () => {
    expect(validateLevels('buy', 1.1, 1.101, null)).toMatch(/below/);
    expect(validateLevels('sell', 1.1, 1.101, 1.102)).toMatch(/Take profit/);
    expect(validateLevels('sell', 1.1, 1.101, 1.09)).toBeNull();
  });
  it('rejects pending orders on the wrong side of the market', () => {
    const last = bar(1, 1.1, 1.1, 1.1, 1.1);
    expect(validatePending('buy', 'limit', 1.101, last, ctx())).toMatch(/below/);
    expect(validatePending('buy', 'stop', 1.101, last, ctx())).toBeNull();
    expect(validatePending('sell', 'limit', 1.101, last, ctx())).toBeNull();
  });
  it('sizes a position so the stop costs the chosen risk', () => {
    expect(lotsForRisk(100, 1.1, 1.099, 0, ctx())).toBe(1);
    expect(lotsForRisk(100, 1.1, 1.0975, 0, ctx())).toBe(0.4);
    expect(lotsForRisk(100, 150, 149.5, 0, ctx('USDJPY', false, 1 / 150))).toBe(0.3);
  });
});

describe('aggregate', () => {
  it('builds 5-minute candles from 1-minute ones', () => {
    const bars = [bar(0, 1, 2, 0.5, 1.5), bar(1, 1.5, 3, 1.2, 2), bar(4, 2, 2.2, 0.4, 1), bar(5, 1, 1.1, 0.9, 1.05)];
    expect(aggregate(bars, 'm5')).toEqual([
      { t: 0, o: 1, h: 3, l: 0.4, c: 1, s: 0 },
      { t: 300_000, o: 1, h: 1.1, l: 0.9, c: 1.05, s: 0 },
    ]);
  });
});

describe('stats', () => {
  it('summarises a trade list', () => {
    const acc = account();
    const c = ctx();
    for (const [i, exit] of [1.102, 1.099, 1.099, 1.104].entries()) {
      const p = openPosition(acc, { side: 'buy', type: 'market', lots: 1, entry: 1.1, sl: 1.099, tp: null, time: i * 1000 }, c);
      settle(acc, p, exit, i * 1000 + 500, 'manual', c);
    }
    const stats = computeStats(acc.trades, 10_000);
    expect(stats).toMatchObject({ trades: 4, wins: 2, losses: 2, winRate: 50, netPnl: 400, profitFactor: 3, maxDrawdown: 200, maxLossStreak: 2 });
    expect(stats.avgR).toBeCloseTo(1);
    expect(rDistribution(acc.trades).filter((b) => b.count).map((b) => [b.label, b.count])).toEqual([['≤ -1R', 2], ['1 to 2', 1], ['> 3R', 1]]);
  });
});
