import { describe, expect, it } from 'vitest';
import { archiveWeek, bucketStart, fromWallTime, londonOffset, nyOffset, weekStart, zoneOffset, HOUR } from './time.ts';

const utc = (s: string): number => Date.parse(`${s}Z`);

describe('archiveWeek', () => {
  it.each([
    ['2024-02-04', 2024, 6],
    ['2024-01-07', 2024, 2],
    ['2023-12-31', 2023, 53],
    ['2023-01-01', 2023, 1],
    ['2022-01-02', 2022, 1],
    ['2021-01-03', 2021, 1],
    ['2020-12-27', 2020, 53],
    ['2020-01-05', 2020, 2],
    ['2019-12-29', 2019, 53],
    ['2025-07-27', 2025, 31],
    ['2025-12-28', 2025, 53],
    ['2026-01-04', 2026, 1],
    ['2012-03-04', 2012, 10],
  ])('%s is filed as %i/%i', (sunday, year, week) => {
    expect(archiveWeek(utc(`${sunday}T00:00:00`))).toEqual({ year, week });
  });
});

describe('offsets', () => {
  it('switches New York to daylight time on the second Sunday of March', () => {
    expect(nyOffset(utc('2024-03-10T06:59:00'))).toBe(-5 * HOUR);
    expect(nyOffset(utc('2024-03-10T07:00:00'))).toBe(-4 * HOUR);
    expect(nyOffset(utc('2024-11-03T05:59:00'))).toBe(-4 * HOUR);
    expect(nyOffset(utc('2024-11-03T06:00:00'))).toBe(-5 * HOUR);
  });
  it('switches London on the last Sundays of March and October', () => {
    expect(londonOffset(utc('2024-03-31T00:59:00'))).toBe(0);
    expect(londonOffset(utc('2024-03-31T01:00:00'))).toBe(HOUR);
    expect(londonOffset(utc('2024-10-27T01:00:00'))).toBe(0);
  });
});

describe('display zones', () => {
  it('keeps Kolkata five and a half hours ahead of UTC all year', () => {
    expect(zoneOffset('kolkata', utc('2024-01-15T00:00:00'))).toBe(5.5 * HOUR);
    expect(zoneOffset('kolkata', utc('2024-07-15T00:00:00'))).toBe(5.5 * HOUR);
  });

  it('turns a wall-clock time in a zone back into the moment it names', () => {
    expect(fromWallTime(utc('2024-03-04T12:30:00'), 'kolkata')).toBe(utc('2024-03-04T07:00:00'));
    expect(fromWallTime(utc('2024-01-15T09:30:00'), 'ny')).toBe(utc('2024-01-15T14:30:00'));
    expect(fromWallTime(utc('2024-07-15T09:30:00'), 'ny')).toBe(utc('2024-07-15T13:30:00'));
    expect(fromWallTime(utc('2024-07-15T09:30:00'), 'utc')).toBe(utc('2024-07-15T09:30:00'));
  });

  it('gets the hours either side of a clock change right', () => {
    expect(fromWallTime(utc('2024-03-10T01:30:00'), 'ny')).toBe(utc('2024-03-10T06:30:00'));
    expect(fromWallTime(utc('2024-03-10T03:30:00'), 'ny')).toBe(utc('2024-03-10T07:30:00'));
  });
});

describe('bucketStart', () => {
  it('floors intraday timeframes on UTC boundaries', () => {
    expect(bucketStart(utc('2024-02-05T14:37:00'), 'm15')).toBe(utc('2024-02-05T14:30:00'));
    expect(bucketStart(utc('2024-02-05T14:37:00'), 'h1')).toBe(utc('2024-02-05T14:00:00'));
  });
  it('rolls daily and 4h candles at 17:00 New York', () => {
    expect(bucketStart(utc('2024-02-05T21:59:00'), 'd1')).toBe(utc('2024-02-04T22:00:00'));
    expect(bucketStart(utc('2024-02-05T22:00:00'), 'd1')).toBe(utc('2024-02-05T22:00:00'));
    expect(bucketStart(utc('2024-02-05T03:00:00'), 'h4')).toBe(utc('2024-02-05T02:00:00'));
    expect(bucketStart(utc('2024-07-01T21:30:00'), 'd1')).toBe(utc('2024-07-01T21:00:00'));
    expect(bucketStart(utc('2024-07-01T12:00:00'), 'h4')).toBe(utc('2024-07-01T09:00:00'));
  });
});

describe('weekStart', () => {
  it('returns the Sunday at midnight UTC', () => {
    expect(weekStart(utc('2024-02-07T13:00:00'))).toBe(utc('2024-02-04T00:00:00'));
    expect(weekStart(utc('2024-02-04T22:00:00'))).toBe(utc('2024-02-04T00:00:00'));
  });
});
