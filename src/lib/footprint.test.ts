import { describe, expect, it } from 'vitest';
import { addMinute, emptyProfile, rowSizeFor, toRows } from './footprint.ts';

describe('footprint profiles', () => {
  it('adds minutes level by level and keeps running totals', () => {
    const profile = emptyProfile();
    addMinute(profile, [0, 100, 5, 2, 0, 0, 1, 4]);
    addMinute(profile, [60, 101, 3, 3, 2, 0]);
    expect([...profile.levels].sort((a, b) => a[0] - b[0])).toEqual([
      [100, [5, 2]],
      [101, [3, 3]],
      [102, [3, 4]],
    ]);
    expect([profile.buy, profile.sell]).toEqual([11, 9]);
  });

  it('groups levels into rows from the highest price down and finds the point of control', () => {
    const profile = emptyProfile();
    addMinute(profile, [0, 100, 5, 2, 3, 3, 3, 4, 9, 1]);
    const single = toRows(profile, 1);
    expect(single.rows.map((r) => r.level)).toEqual([103, 102, 101, 100]);
    expect(single.rows[single.poc]).toEqual({ level: 103, buy: 9, sell: 1 });
    expect(single.peak).toBe(9);

    const paired = toRows(profile, 2);
    expect(paired.rows).toEqual([
      { level: 102, buy: 12, sell: 5 },
      { level: 100, buy: 8, sell: 5 },
    ]);
    expect(paired.poc).toBe(0);
  });

  it('handles an empty profile', () => {
    expect(toRows(emptyProfile(), 5)).toEqual({ rows: [], poc: -1, peak: 0 });
  });
});

describe('rowSizeFor', () => {
  it('picks the smallest round size that keeps rows readable', () => {
    expect(rowSizeFor(20, 13)).toBe(1);
    expect(rowSizeFor(5, 13)).toBe(5);
    expect(rowSizeFor(1.4, 13)).toBe(10);
    expect(rowSizeFor(0, 13)).toBe(1000);
  });
});
