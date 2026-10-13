import type { Trade } from './engine.ts';
import { nyOffset } from './time.ts';

export interface Stats {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  returnPct: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  avgR: number | null;
  totalR: number | null;
  best: number;
  worst: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  maxWinStreak: number;
  maxLossStreak: number;
  avgHoldMs: number;
}

const byClose = (trades: Trade[]): Trade[] => [...trades].sort((a, b) => a.closeTime - b.closeTime);

export function equityCurve(trades: Trade[], initialBalance: number, startTime: number): { t: number; equity: number }[] {
  const points = [{ t: startTime, equity: initialBalance }];
  let equity = initialBalance;
  for (const trade of byClose(trades)) {
    equity += trade.pnl;
    points.push({ t: trade.closeTime, equity });
  }
  return points;
}

export function computeStats(trades: Trade[], initialBalance: number): Stats {
  const ordered = byClose(trades);
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let best = 0;
  let worst = 0;
  let equity = initialBalance;
  let peak = initialBalance;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let streak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let hold = 0;
  let rSum = 0;
  let rCount = 0;

  for (const trade of ordered) {
    if (trade.pnl > 0) {
      wins++;
      grossProfit += trade.pnl;
      streak = streak > 0 ? streak + 1 : 1;
    } else if (trade.pnl < 0) {
      losses++;
      grossLoss -= trade.pnl;
      streak = streak < 0 ? streak - 1 : -1;
    } else streak = 0;
    maxWinStreak = Math.max(maxWinStreak, streak);
    maxLossStreak = Math.max(maxLossStreak, -streak);
    best = Math.max(best, trade.pnl);
    worst = Math.min(worst, trade.pnl);
    hold += trade.closeTime - trade.openTime;
    if (trade.r !== null) {
      rSum += trade.r;
      rCount++;
    }
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    if (peak - equity > maxDrawdown) {
      maxDrawdown = peak - equity;
      maxDrawdownPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    }
  }

  const n = ordered.length;
  const netPnl = grossProfit - grossLoss;
  return {
    trades: n,
    wins,
    losses,
    winRate: n ? (wins / n) * 100 : 0,
    netPnl,
    returnPct: initialBalance > 0 ? (netPnl / initialBalance) * 100 : 0,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    avgWin: wins ? grossProfit / wins : 0,
    avgLoss: losses ? grossLoss / losses : 0,
    expectancy: n ? netPnl / n : 0,
    avgR: rCount ? rSum / rCount : null,
    totalR: rCount ? rSum : null,
    best,
    worst,
    maxDrawdown,
    maxDrawdownPct,
    maxWinStreak,
    maxLossStreak,
    avgHoldMs: n ? hold / n : 0,
  };
}

export interface Breakdown {
  label: string;
  trades: number;
  wins: number;
  pnl: number;
}

function group(trades: Trade[], labels: string[], pick: (trade: Trade) => number): Breakdown[] {
  const rows = labels.map((label) => ({ label, trades: 0, wins: 0, pnl: 0 }));
  for (const trade of trades) {
    const row = rows[pick(trade)];
    if (!row) continue;
    row.trades++;
    if (trade.pnl > 0) row.wins++;
    row.pnl += trade.pnl;
  }
  return rows;
}

export function byWeekday(trades: Trade[]): Breakdown[] {
  return group(trades, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], (t) => new Date(t.openTime + nyOffset(t.openTime)).getUTCDay() - 1);
}

export function bySession(trades: Trade[]): Breakdown[] {
  return group(trades, ['Asia', 'London', 'New York'], (t) => {
    const hour = new Date(t.openTime).getUTCHours();
    if (hour >= 22 || hour < 7) return 0;
    return hour < 12 ? 1 : 2;
  });
}

export function bySide(trades: Trade[]): Breakdown[] {
  return group(trades, ['Long', 'Short'], (t) => (t.side === 'buy' ? 0 : 1));
}

export function byExit(trades: Trade[]): Breakdown[] {
  return group(trades, ['Take profit', 'Stop loss', 'Manual'], (t) => (t.reason === 'tp' ? 0 : t.reason === 'sl' ? 1 : 2));
}

export function rDistribution(trades: Trade[]): { label: string; count: number; positive: boolean }[] {
  const edges = [-1, -0.5, 0, 0.5, 1, 2, 3];
  const labels = ['≤ -1R', '-1 to -0.5', '-0.5 to 0', '0 to 0.5', '0.5 to 1', '1 to 2', '2 to 3', '> 3R'];
  const counts = labels.map(() => 0);
  for (const trade of trades) {
    if (trade.r === null) continue;
    let band = edges.findIndex((edge) => trade.r! <= edge + 1e-9);
    if (band === -1) band = edges.length;
    counts[band]++;
  }
  return labels.map((label, i) => ({ label, count: counts[i], positive: i >= 3 }));
}
