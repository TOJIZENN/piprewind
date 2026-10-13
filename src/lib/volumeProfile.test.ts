import { describe, expect, it } from 'vitest';
import type { Bar } from './bars.ts';
import { extent, fmtVolume, ProfileBuilder } from './volumeProfile.ts';

const bar = (o: number, h: number, l: number, c: number): Bar => ({ t: 0, o, h, l, c, s: 0 });

describe('volume profile', () => {
  it('finds the lowest low and highest high of a stretch of candles', () => {
    const bars = [bar(1, 5, 0, 2), bar(2, 9, 1, 3), bar(3, 4, -2, 1)];
    expect(extent(bars, 0, 2)).toEqual({ low: 0, high: 9 });
    expect(extent(bars, 1, 3)).toEqual({ low: -2, high: 9 });
    expect(extent(bars, 1, 1)).toBeNull();
    expect(extent(bars, 2, 3, { low: 0, high: 1 })).toEqual({ low: -2, high: 4 });
  });

  it('spreads a candle evenly over the rows its range covers', () => {
    const builder = new ProfileBuilder(100, 110, 10);
    builder.addBar(bar(102, 106, 102, 105), 8);
    const profile = builder.build()!;
    expect(profile.rows.map((row) => row.up)).toEqual([0, 0, 2, 2, 2, 2, 0, 0, 0, 0]);
    expect(profile.up).toBe(8);
    expect(profile.down).toBe(0);
  });

  it('gives a candle the share of each row it only partly covers', () => {
    const builder = new ProfileBuilder(100, 110, 10);
    builder.addBar(bar(103, 103, 101.5, 102), 3);
    expect(builder.build()!.rows.map((row) => row.down)).toEqual([0, 1, 2, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('counts a falling candle as selling and a flat one at its close', () => {
    const builder = new ProfileBuilder(100, 110, 10);
    builder.addBar(bar(105, 105, 105, 105), 4);
    builder.addBar(bar(109.5, 109.5, 109.5, 109.5), 1);
    const rows = builder.build()!.rows;
    expect(rows[5].up).toBe(4);
    expect(rows[9].up).toBe(1);
  });

  it('puts the highest price in the top row', () => {
    const builder = new ProfileBuilder(100, 110, 10);
    builder.addBar(bar(110, 110, 110, 110), 1);
    expect(builder.build()!.rows[9].up).toBe(1);
  });

  it('counts ticks at the price they printed at', () => {
    const builder = new ProfileBuilder(2000, 2010, 10);
    builder.addTicks([0, 20005, 3, 1, 2, 2], 0.1);
    builder.addTicks([60, 20095, 0, 7], 0.1);
    const profile = builder.build()!;
    expect([profile.rows[0].up, profile.rows[0].down]).toEqual([5, 3]);
    expect([profile.rows[9].up, profile.rows[9].down]).toEqual([0, 7]);
    expect(profile.poc).toBe(0);
    expect([profile.up, profile.down]).toEqual([5, 10]);
  });

  it('marks the point of control and a value area holding 70% around it', () => {
    const builder = new ProfileBuilder(0, 10, 10);
    [1, 2, 4, 8, 20, 30, 15, 10, 6, 4].forEach((weight, k) => builder.addBar(bar(k + 0.5, k + 0.5, k + 0.5, k + 0.5), weight));
    const profile = builder.build()!;
    expect(profile.poc).toBe(5);
    expect(profile.rows.map((row) => row.valueArea)).toEqual([false, false, false, true, true, true, true, true, false, false]);
  });

  it('stops the value area at the edge of the range', () => {
    const builder = new ProfileBuilder(0, 4, 4);
    [10, 1, 1, 1].forEach((weight, k) => builder.addBar(bar(k + 0.5, k + 0.5, k + 0.5, k + 0.5), weight));
    expect(builder.build()!.rows.map((row) => row.valueArea)).toEqual([true, false, false, false]);
  });

  it('has no profile when nothing was added', () => {
    expect(new ProfileBuilder(0, 10).build()).toBeNull();
  });

  it('handles a range with no height', () => {
    const builder = new ProfileBuilder(5, 5, 4);
    builder.addBar(bar(5, 5, 5, 5), 2);
    expect(builder.build()!.poc).toBe(0);
  });

  it('writes volumes compactly', () => {
    expect(fmtVolume(1240)).toBe('1,240');
    expect(fmtVolume(12_400)).toBe('12.4K');
    expect(fmtVolume(3_210_000)).toBe('3.21M');
  });
});
