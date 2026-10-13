import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Row } from '../src/lib/bars.ts';
import { archiveWeek, DAY, WEEK } from '../src/lib/time.ts';
import { limiter, UpstreamError } from './shared.ts';

export type Resolution = 'm1' | 'h1';

const BASE_URL = 'https://candledata.fxcorporate.com';
const CACHE_DIR = path.resolve(process.cwd(), '.cache', 'fxcm');
const MAX_PARALLEL = 6;
const TIMEOUT_MS = 30_000;

const limited = limiter(MAX_PARALLEL);

export function parseArchiveCsv(csv: string): Row[] {
  const rows: Row[] = [];
  let previous = -Infinity;
  for (const line of csv.split('\n')) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})[^,]*,(.+)$/.exec(line.trim());
    if (!m) continue;
    const v = m[7].split(',').map(Number);
    if (v.length < 8 || v.some((n) => !Number.isFinite(n))) continue;
    const t = Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]) / 1000;
    if (t <= previous) continue;
    previous = t;
    const spread = Math.max(0, (v[4] - v[0] + (v[7] - v[3])) / 2);
    rows.push([t, v[0], v[1], v[2], v[3], Number(spread.toFixed(6))]);
  }
  return rows;
}

async function download(symbol: string, resolution: Resolution, sunday: number): Promise<Row[]> {
  const { year, week } = archiveWeek(sunday);
  const url = `${BASE_URL}/${resolution === 'm1' ? 'm1' : 'H1'}/${symbol}/${year}/${week}.csv.gz`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'PipRewind/0.1 (local backtesting app)' } });
  } catch {
    throw new UpstreamError('Could not reach the FXCM candle archive. Check your internet connection.');
  }
  if (response.status === 404 || response.status === 403) return [];
  if (!response.ok) throw new UpstreamError(`The FXCM candle archive answered HTTP ${response.status}.`);
  const body = Buffer.from(await response.arrayBuffer());
  try {
    return parseArchiveCsv(gunzipSync(body).toString('utf8'));
  } catch {
    throw new UpstreamError('The FXCM candle archive returned a file that could not be read.');
  }
}

const inFlight = new Map<string, Promise<Row[]>>();

export function loadWeek(symbol: string, resolution: Resolution, sunday: number): Promise<Row[]> {
  const { year, week } = archiveWeek(sunday);
  const file = path.join(CACHE_DIR, resolution, symbol, `${year}-${String(week).padStart(2, '0')}.json`);
  const pending = inFlight.get(file);
  if (pending) return pending;

  const task = (async () => {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as Row[];
    } catch {
    }
    const rows = await limited(() => download(symbol, resolution, sunday));
    const settled = sunday + WEEK + (rows.length ? 2 : 21) * DAY < Date.now();
    if (settled) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(rows));
    }
    return rows;
  })().finally(() => inFlight.delete(file));

  inFlight.set(file, task);
  return task;
}

export async function loadHistory(symbol: string, beforeSunday: number, weeks: number): Promise<Row[]> {
  const starts = Array.from({ length: weeks }, (_, i) => beforeSunday - (weeks - i) * WEEK);
  const parts = await Promise.all(starts.map((sunday) => loadWeek(symbol, 'h1', sunday)));
  return parts.flat();
}
