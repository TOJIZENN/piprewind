import { fromWallTime, HOUR, MIN, zoneOffset, type DisplayZone } from './time.ts';

const pad = (n: number): string => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const fmtPrice = (n: number, digits: number): string => n.toFixed(digits);

export function fmtMoney(n: number, signed = false): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? '-' : signed && n > 0 ? '+' : '';
  return `${sign}$${abs}`;
}

export const fmtPct = (n: number, signed = false): string => `${signed && n > 0 ? '+' : ''}${n.toFixed(2)}%`;

export const fmtR = (r: number | null): string => (r === null ? '—' : `${r > 0 ? '+' : ''}${r.toFixed(2)}R`);

export const fmtPips = (n: number): string => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;

export function fmtDateTime(t: number, zone: DisplayZone, withDay = false): string {
  const d = new Date(t + zoneOffset(zone, t));
  const date = `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return withDay ? `${DAYS[d.getUTCDay()]} ${date}` : date;
}

export function fmtDate(t: number): string {
  const d = new Date(t);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtDuration(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MIN))}m`;
  const hours = ms / HOUR;
  if (hours < 48) return `${Math.floor(hours)}h ${Math.round((ms % HOUR) / MIN)}m`;
  return `${(hours / 24).toFixed(1)}d`;
}

export const toInputDateTime = (t: number, zone: DisplayZone = 'utc'): string => new Date(t + zoneOffset(zone, t)).toISOString().slice(0, 16);

export function fromInputDateTime(value: string, zone: DisplayZone = 'utc'): number | null {
  const wall = Date.parse(`${value}:00Z`);
  return Number.isFinite(wall) ? fromWallTime(wall, zone) : null;
}
