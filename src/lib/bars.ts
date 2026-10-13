import { bucketStart, type Timeframe } from './time.ts';

export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  s: number;
}

export type Row = [number, number, number, number, number, number];

export const rowsToBars = (rows: Row[]): Bar[] => rows.map(([t, o, h, l, c, s]) => ({ t: t * 1000, o, h, l, c, s }));

export function mergeBar(out: Bar[], bar: Bar, tf: Timeframe): 'updated' | 'appended' {
  const t = bucketStart(bar.t, tf);
  const last = out[out.length - 1];
  if (last && last.t === t) {
    if (bar.h > last.h) last.h = bar.h;
    if (bar.l < last.l) last.l = bar.l;
    last.c = bar.c;
    last.s = bar.s;
    return 'updated';
  }
  out.push({ t, o: bar.o, h: bar.h, l: bar.l, c: bar.c, s: bar.s });
  return 'appended';
}

export function aggregate(bars: Bar[], tf: Timeframe, from = 0, to = bars.length, out: Bar[] = []): Bar[] {
  for (let i = from; i < to; i++) mergeBar(out, bars[i], tf);
  return out;
}

export function lastIndexAtOrBefore(bars: Bar[], t: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].t <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
