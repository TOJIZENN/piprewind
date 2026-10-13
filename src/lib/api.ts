import { rowsToBars, type Bar, type Row } from './bars.ts';
import type { FootprintRow } from './footprint.ts';
import { isoDate } from './time.ts';

export class DataError extends Error {}

async function get(path: string): Promise<Bar[]> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch {
    throw new DataError('The PipRewind server is not responding. Is it still running?');
  }
  const body = (await response.json().catch(() => null)) as { bars?: Row[]; error?: string } | null;
  if (!response.ok || !body?.bars) throw new DataError(body?.error ?? `Loading candles failed (HTTP ${response.status}).`);
  return rowsToBars(body.bars);
}

const weeks = new Map<string, Promise<Bar[]>>();

export function fetchWeek(symbol: string, sunday: number): Promise<Bar[]> {
  const key = `${symbol}:${sunday}`;
  let pending = weeks.get(key);
  if (!pending) {
    pending = get(`/api/week?symbol=${symbol}&week=${isoDate(sunday)}`);
    weeks.set(key, pending);
    pending.catch(() => weeks.delete(key));
  }
  return pending;
}

const footprints = new Map<string, Promise<FootprintRow[]>>();

export function fetchFootprintWeek(symbol: string, sunday: number): Promise<FootprintRow[]> {
  const key = `${symbol}:${sunday}`;
  let pending = footprints.get(key);
  if (!pending) {
    pending = (async () => {
      let response: Response;
      try {
        response = await fetch(`/api/footprint?symbol=${symbol}&week=${isoDate(sunday)}`);
      } catch {
        throw new DataError('The PipRewind server is not responding. Is it still running?');
      }
      const body = (await response.json().catch(() => null)) as { rows?: FootprintRow[]; error?: string } | null;
      if (!response.ok || !body?.rows) throw new DataError(body?.error ?? `Loading the footprint failed (HTTP ${response.status}).`);
      return body.rows;
    })();
    footprints.set(key, pending);
    pending.catch(() => footprints.delete(key));
  }
  return pending;
}

export function fetchHistory(symbol: string, beforeSunday: number, count: number): Promise<Bar[]> {
  return get(`/api/history?symbol=${symbol}&before=${isoDate(beforeSunday)}&weeks=${count}`);
}
