import { createWriteStream } from 'node:fs';
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw } from 'node:zlib';
import type { Row } from '../src/lib/bars.ts';
import type { FootprintRow } from '../src/lib/footprint.ts';
import { getInstrument } from '../src/lib/instruments.ts';
import { DAY, HOUR, WEEK } from '../src/lib/time.ts';
import { limiter, UpstreamError } from './shared.ts';

const BASE_URL = 'https://ticks.ex2archive.com/ticks';
const CACHE_DIR = path.resolve(process.cwd(), '.cache', 'exness');
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;
const OPEN_MONTH_TTL_MS = 12 * HOUR;

const limited = limiter(2);

async function clearStaleDownloads(): Promise<void> {
  const dir = path.join(CACHE_DIR, 'tmp');
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const file = path.join(dir, name);
    const info = await stat(file).catch(() => null);
    if (info && Date.now() - info.mtimeMs > HOUR) await rm(file, { force: true });
  }
}
void clearStaleDownloads();

export class MinuteBuilder {
  readonly rows: Row[] = [];
  readonly footprint: FootprintRow[] = [];
  private levels = new Map<number, [number, number]>();
  private previousBid = NaN;
  private direction = 0;
  private rest = '';
  private minute = '';
  private time = 0;
  private open = 0;
  private high = 0;
  private low = 0;
  private close = 0;
  private firstSpread = 0;
  private lastSpread = 0;

  constructor(private readonly step: number | null = null) {}

  push(chunk: string): void {
    const text = this.rest + chunk;
    let start = 0;
    for (let end = text.indexOf('\n'); end !== -1; end = text.indexOf('\n', start)) {
      this.line(text.slice(start, end));
      start = end + 1;
    }
    this.rest = text.slice(start);
  }

  finish(): Row[] {
    if (this.rest) this.line(this.rest);
    this.rest = '';
    this.flush();
    return this.rows;
  }

  private flush(): void {
    if (!this.minute) return;
    const spread = Math.max(0, (this.firstSpread + this.lastSpread) / 2);
    this.rows.push([this.time, this.open, this.high, this.low, this.close, Number(spread.toFixed(6))]);
    this.minute = '';
    if (this.levels.size === 0) return;
    let lowest = Infinity;
    let highest = -Infinity;
    for (const level of this.levels.keys()) {
      if (level < lowest) lowest = level;
      if (level > highest) highest = level;
    }
    const row: FootprintRow = [this.time, lowest];
    for (let level = lowest; level <= highest; level++) {
      const cell = this.levels.get(level);
      row.push(cell ? cell[0] : 0, cell ? cell[1] : 0);
    }
    this.footprint.push(row);
    this.levels = new Map();
  }

  private line(line: string): void {
    const parts = line.split(',');
    if (parts.length < 5) return;
    const bid = Number(parts[3]);
    const ask = Number(parts[4]);
    const minute = parts[2].slice(0, 17);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || minute.length < 17) return;

    if (minute !== this.minute) {
      const time = Date.UTC(+minute.slice(1, 5), +minute.slice(6, 8) - 1, +minute.slice(9, 11), +minute.slice(12, 14), +minute.slice(15, 17)) / 1000;
      if (!Number.isFinite(time) || time <= this.time) return;
      this.flush();
      this.minute = minute;
      this.time = time;
      this.open = this.high = this.low = bid;
      this.firstSpread = ask - bid;
    } else {
      if (bid > this.high) this.high = bid;
      if (bid < this.low) this.low = bid;
    }
    this.close = bid;
    this.lastSpread = ask - bid;

    if (this.step === null) return;
    if (bid > this.previousBid) this.direction = 0;
    else if (bid < this.previousBid) this.direction = 1;
    this.previousBid = bid;
    const level = Math.round(bid / this.step);
    const cell = this.levels.get(level);
    if (cell) cell[this.direction]++;
    else this.levels.set(level, this.direction === 0 ? [1, 0] : [0, 1]);
  }
}

async function firstZipEntry(file: string): Promise<Readable> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    const tail = Buffer.alloc(Math.min(size, 65_557));
    await handle.read(tail, 0, tail.length, size - tail.length);
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0) throw new Error('not a zip archive');

    const directory = Buffer.alloc(46);
    await handle.read(directory, 0, 46, tail.readUInt32LE(end + 16));
    if (directory.readUInt32LE(0) !== 0x02014b50) throw new Error('zip directory missing');
    const method = directory.readUInt16LE(10);
    const compressedSize = directory.readUInt32LE(20);
    const headerOffset = directory.readUInt32LE(42);
    if (compressedSize === 0xffffffff || headerOffset === 0xffffffff || (method !== 0 && method !== 8)) throw new Error('unsupported zip layout');

    const header = Buffer.alloc(30);
    await handle.read(header, 0, 30, headerOffset);
    const start = headerOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const raw = handle.createReadStream({ start, end: start + compressedSize - 1 });
    if (method === 0) return raw;
    const inflate = createInflateRaw();
    raw.on('error', (error) => inflate.destroy(error));
    return raw.pipe(inflate);
  } catch (error) {
    await handle.close();
    throw error;
  }
}

const monthKey = (year: number, month: number): string => `${year}-${String(month).padStart(2, '0')}`;

interface MonthData {
  rows: Row[];
  footprint: FootprintRow[];
}

const NO_DATA: MonthData = { rows: [], footprint: [] };

async function download(symbol: string, year: number, month: number): Promise<MonthData> {
  const mm = String(month).padStart(2, '0');
  const url = `${BASE_URL}/${symbol}/${year}/${mm}/Exness_${symbol}_${year}_${mm}.zip`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), headers: { 'User-Agent': 'PipRewind/0.1 (local backtesting app)' } });
  } catch {
    throw new UpstreamError('Could not reach the Exness tick archive. Check your internet connection.');
  }
  if (response.status === 404 || response.status === 403) return NO_DATA;
  if (!response.ok || !response.body) throw new UpstreamError(`The Exness tick archive answered HTTP ${response.status}.`);

  const tmpDir = path.join(CACHE_DIR, 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const zip = path.join(tmpDir, `${symbol}-${monthKey(year, month)}-${process.pid}-${Date.now()}.zip`);
  try {
    await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(zip));
    const builder = new MinuteBuilder(getInstrument(symbol).pip);
    const entry = await firstZipEntry(zip);
    entry.setEncoding('latin1');
    for await (const chunk of entry) builder.push(chunk as string);
    return { rows: builder.finish(), footprint: builder.footprint };
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError(`The ${symbol} tick file for ${monthKey(year, month)} could not be downloaded or read. Try again.`);
  } finally {
    await rm(zip, { force: true });
  }
}

const inFlight = new Map<string, Promise<MonthData>>();

const cacheFile = (symbol: string, year: number, month: number, kind: 'candles' | 'footprint'): string =>
  path.join(CACHE_DIR, symbol, `${monthKey(year, month)}${kind === 'footprint' ? '.fp' : ''}.json`);

async function readCached<T>(file: string, year: number, month: number): Promise<T | null> {
  try {
    const info = await stat(file);
    const completeWhenCached = info.mtimeMs > Date.UTC(year, month, 1) + 2 * DAY;
    if (completeWhenCached || Date.now() - info.mtimeMs < OPEN_MONTH_TTL_MS) return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
  }
  return null;
}

async function writeCached(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.part`, JSON.stringify(value));
  await rename(`${file}.part`, file);
}

function fetchMonth(symbol: string, year: number, month: number): Promise<MonthData> {
  const key = `${symbol}:${monthKey(year, month)}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const task = (async () => {
    const data = await limited(() => download(symbol, year, month));
    if (data.rows.length > 0) {
      await writeCached(cacheFile(symbol, year, month, 'footprint'), data.footprint);
      await writeCached(cacheFile(symbol, year, month, 'candles'), data.rows);
    }
    return data;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}

const inFuture = (year: number, month: number): boolean => Date.UTC(year, month - 1, 1) > Date.now();

export async function loadMonth(symbol: string, year: number, month: number): Promise<Row[]> {
  if (inFuture(year, month)) return [];
  return (await readCached<Row[]>(cacheFile(symbol, year, month, 'candles'), year, month)) ?? (await fetchMonth(symbol, year, month)).rows;
}

export async function loadMonthFootprint(symbol: string, year: number, month: number): Promise<FootprintRow[]> {
  if (inFuture(year, month)) return [];
  return (await readCached<FootprintRow[]>(cacheFile(symbol, year, month, 'footprint'), year, month)) ?? (await fetchMonth(symbol, year, month)).footprint;
}

function monthsBetween(from: number, to: number): [number, number][] {
  const months: [number, number][] = [];
  const first = new Date(from);
  for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); Date.UTC(y, m, 1) < to; m === 11 ? (y++, (m = 0)) : m++) months.push([y, m + 1]);
  return months;
}

async function loadRange(symbol: string, from: number, to: number): Promise<Row[]> {
  const months = await Promise.all(monthsBetween(from, to).map(([year, month]) => loadMonth(symbol, year, month)));
  return months.flat().filter((row) => row[0] >= from / 1000 && row[0] < to / 1000);
}

export async function loadFootprintWeek(symbol: string, sunday: number): Promise<FootprintRow[]> {
  const months = await Promise.all(monthsBetween(sunday, sunday + WEEK).map(([year, month]) => loadMonthFootprint(symbol, year, month)));
  return months.flat().filter((row) => row[0] >= sunday / 1000 && row[0] < (sunday + WEEK) / 1000);
}

export function loadWeek(symbol: string, sunday: number): Promise<Row[]> {
  return loadRange(symbol, sunday, sunday + WEEK);
}

export async function loadHistory(symbol: string, beforeSunday: number, weeks: number): Promise<Row[]> {
  const minutes = await loadRange(symbol, beforeSunday - weeks * WEEK, beforeSunday);
  const hours: Row[] = [];
  for (const [t, o, h, l, c, s] of minutes) {
    const hour = t - (t % 3600);
    const last = hours[hours.length - 1];
    if (last && last[0] === hour) {
      if (h > last[2]) last[2] = h;
      if (l < last[3]) last[3] = l;
      last[4] = c;
      last[5] = s;
    } else hours.push([hour, o, h, l, c, s]);
  }
  return hours;
}
