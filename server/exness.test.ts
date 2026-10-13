import { describe, expect, it } from 'vitest';
import { MinuteBuilder } from './exness.ts';

const tick = (time: string, bid: number, ask: number): string => `"exness","XAUUSD","${time}Z",${bid},${ask}\n`;

describe('MinuteBuilder', () => {
  it('folds ticks into 1-minute bid candles with the average spread, across chunk boundaries', () => {
    const csv =
      '"Exness","Symbol","Timestamp","Bid","Ask"\n' +
      tick('2024-02-01 00:00:00.039', 2039.9, 2040.1) +
      tick('2024-02-01 00:00:20.000', 2041.5, 2041.6) +
      tick('2024-02-01 00:00:59.999', 2038.2, 2038.6) +
      tick('2024-02-01 00:02:00.000', 2040, 2040.3) +
      tick('2024-02-01 00:01:30.000', 1, 2) +
      tick('2024-02-01 00:02:30.000', 2040.4, 2040.5);
    const builder = new MinuteBuilder();
    for (let i = 0; i < csv.length; i += 37) builder.push(csv.slice(i, i + 37));
    expect(builder.finish()).toEqual([
      [Date.UTC(2024, 1, 1, 0, 0) / 1000, 2039.9, 2041.5, 2038.2, 2038.2, 0.3],
      [Date.UTC(2024, 1, 1, 0, 2) / 1000, 2040, 2040.4, 2040, 2040.4, 0.2],
    ]);
    expect(builder.footprint).toEqual([]);
  });

  it('counts price updates per level, as buying when the bid rose and selling when it fell', () => {
    const csv =
      tick('2024-02-01 00:00:01.000', 2040.0, 2040.2) +
      tick('2024-02-01 00:00:02.000', 2040.3, 2040.5) +
      tick('2024-02-01 00:00:03.000', 2040.3, 2040.6) +
      tick('2024-02-01 00:00:04.000', 2040.02, 2040.2) +
      tick('2024-02-01 00:00:05.000', 2040.04, 2040.2) +
      tick('2024-02-01 00:01:00.000', 2039.9, 2040.1);
    const builder = new MinuteBuilder(0.1);
    builder.push(csv);
    builder.finish();
    expect(builder.footprint).toEqual([
      [Date.UTC(2024, 1, 1, 0, 0) / 1000, 20400, 2, 1, 0, 0, 0, 0, 2, 0],
      [Date.UTC(2024, 1, 1, 0, 1) / 1000, 20399, 0, 1],
    ]);
  });
});
