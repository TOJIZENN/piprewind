export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const WEEK = 7 * DAY;

export type Timeframe = 'm1' | 'm5' | 'm15' | 'm30' | 'h1' | 'h4' | 'd1';

export const TIMEFRAMES: { id: Timeframe; label: string; ms: number }[] = [
  { id: 'm1', label: '1m', ms: MIN },
  { id: 'm5', label: '5m', ms: 5 * MIN },
  { id: 'm15', label: '15m', ms: 15 * MIN },
  { id: 'm30', label: '30m', ms: 30 * MIN },
  { id: 'h1', label: '1h', ms: HOUR },
  { id: 'h4', label: '4h', ms: 4 * HOUR },
  { id: 'd1', label: '1D', ms: DAY },
];

export const tfMs = (tf: Timeframe): number => TIMEFRAMES.find((t) => t.id === tf)!.ms;

function nthSunday(year: number, month: number, n: number): number {
  const first = Date.UTC(year, month, 1);
  return first + (((7 - new Date(first).getUTCDay()) % 7) + (n - 1) * 7) * DAY;
}

function lastSunday(year: number, month: number): number {
  const last = Date.UTC(year, month + 1, 0);
  return last - new Date(last).getUTCDay() * DAY;
}

export function nyOffset(t: number): number {
  const y = new Date(t).getUTCFullYear();
  const start = nthSunday(y, 2, 2) + 7 * HOUR;
  const end = nthSunday(y, 10, 1) + 6 * HOUR;
  return t >= start && t < end ? -4 * HOUR : -5 * HOUR;
}

export function londonOffset(t: number): number {
  const y = new Date(t).getUTCFullYear();
  const start = lastSunday(y, 2) + HOUR;
  const end = lastSunday(y, 9) + HOUR;
  return t >= start && t < end ? HOUR : 0;
}

export type DisplayZone = 'kolkata' | 'utc' | 'london' | 'ny' | 'dubai' | 'singapore' | 'tokyo' | 'local';

export const ZONES: { id: DisplayZone; label: string; short: string }[] = [
  { id: 'kolkata', label: 'Kolkata (IST)', short: 'IST' },
  { id: 'utc', label: 'UTC', short: 'UTC' },
  { id: 'london', label: 'London', short: 'London' },
  { id: 'ny', label: 'New York', short: 'New York' },
  { id: 'dubai', label: 'Dubai', short: 'Dubai' },
  { id: 'singapore', label: 'Singapore', short: 'Singapore' },
  { id: 'tokyo', label: 'Tokyo', short: 'Tokyo' },
  { id: 'local', label: 'My time', short: 'my time' },
];

export const DEFAULT_ZONE: DisplayZone = 'kolkata';

export const isZone = (value: unknown): value is DisplayZone => ZONES.some((zone) => zone.id === value);

export const zoneShort = (zone: DisplayZone): string => ZONES.find((z) => z.id === zone)!.short;

const FIXED_OFFSET_HOURS: Partial<Record<DisplayZone, number>> = { kolkata: 5.5, utc: 0, dubai: 4, singapore: 8, tokyo: 9 };

export function zoneOffset(zone: DisplayZone, t: number): number {
  if (zone === 'ny') return nyOffset(t);
  if (zone === 'london') return londonOffset(t);
  if (zone === 'local') return -new Date(t).getTimezoneOffset() * MIN;
  return (FIXED_OFFSET_HOURS[zone] ?? 0) * HOUR;
}

export function fromWallTime(wall: number, zone: DisplayZone): number {
  const guess = wall - zoneOffset(zone, wall);
  return wall - zoneOffset(zone, guess);
}

export function bucketStart(t: number, tf: Timeframe): number {
  const ms = tfMs(tf);
  if (ms <= HOUR) return Math.floor(t / ms) * ms;
  const shift = nyOffset(t) + 7 * HOUR;
  return Math.floor((t + shift) / ms) * ms - shift;
}

export function weekStart(t: number): number {
  const day = Math.floor(t / DAY) * DAY;
  return day - new Date(day).getUTCDay() * DAY;
}

export const isoDate = (t: number): string => new Date(t).toISOString().slice(0, 10);

export function parseIsoDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isoDate(t) === s ? t : null;
}

export function archiveWeek(sunday: number): { year: number; week: number } {
  const year = new Date(sunday).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const dow = new Date(jan1).getUTCDay();
  const containsJan1 = jan1 - dow * DAY;
  const week1 = dow <= 3 ? containsJan1 : containsJan1 + WEEK;
  return { year, week: Math.floor((sunday - week1) / WEEK) + 1 };
}
