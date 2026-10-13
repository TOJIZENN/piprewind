import type { Bar } from './bars.ts';

export function extendEma(values: number[], bars: Bar[], period: number, from: number): number[] {
  values.length = Math.min(values.length, Math.max(0, from));
  const k = 2 / (period + 1);
  for (let i = values.length; i < bars.length; i++) {
    if (i < period - 1) values.push(NaN);
    else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += bars[j].c;
      values.push(sum / period);
    } else values.push(bars[i].c * k + values[i - 1] * (1 - k));
  }
  return values;
}
