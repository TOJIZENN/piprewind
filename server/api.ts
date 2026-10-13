import type { IncomingMessage, ServerResponse } from 'node:http';
import { getInstrument, isSymbol } from '../src/lib/instruments.ts';
import { parseIsoDate, weekStart } from '../src/lib/time.ts';
import * as exness from './exness.ts';
import * as fxcm from './fxcm.ts';
import { UpstreamError } from './shared.ts';

const MAX_HISTORY_WEEKS = 120;

function send(res: ServerResponse, status: number, body: unknown, cacheable = false): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheable ? 'private, max-age=3600' : 'no-store');
  res.end(JSON.stringify(body));
}

function readSunday(value: string | null): number | null {
  const t = value ? parseIsoDate(value) : null;
  return t !== null && weekStart(t) === t ? t : null;
}

export function apiMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return next();
  if (req.method !== 'GET') return send(res, 405, { error: 'Only GET is supported.' });

  const symbol = url.searchParams.get('symbol') ?? '';
  if (!isSymbol(symbol)) return send(res, 400, { error: 'Unknown symbol.' });

  const instrument = getInstrument(symbol);
  const tickArchive = instrument.source === 'exness';
  let work: Promise<object>;
  if (url.pathname === '/api/week') {
    const sunday = readSunday(url.searchParams.get('week'));
    if (sunday === null) return send(res, 400, { error: '`week` must be the Sunday a trading week starts on (YYYY-MM-DD).' });
    work = (tickArchive ? exness.loadWeek(symbol, sunday) : fxcm.loadWeek(symbol, 'm1', sunday)).then((bars) => ({ bars }));
  } else if (url.pathname === '/api/footprint') {
    const sunday = readSunday(url.searchParams.get('week'));
    if (sunday === null) return send(res, 400, { error: '`week` must be the Sunday a trading week starts on (YYYY-MM-DD).' });
    if (!tickArchive) return send(res, 400, { error: 'A footprint needs tick data, which this instrument does not have.' });
    work = exness.loadFootprintWeek(symbol, sunday).then((rows) => ({ rows, step: instrument.pip }));
  } else if (url.pathname === '/api/history') {
    const before = readSunday(url.searchParams.get('before'));
    const weeks = Number(url.searchParams.get('weeks'));
    if (before === null) return send(res, 400, { error: '`before` must be a Sunday (YYYY-MM-DD).' });
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_HISTORY_WEEKS) {
      return send(res, 400, { error: `\`weeks\` must be between 1 and ${MAX_HISTORY_WEEKS}.` });
    }
    work = (tickArchive ? exness.loadHistory(symbol, before, weeks) : fxcm.loadHistory(symbol, before, weeks)).then((bars) => ({ bars }));
  } else {
    return send(res, 404, { error: 'Not found.' });
  }

  work.then(
    (body) => send(res, 200, body, true),
    (error: unknown) => {
      if (error instanceof UpstreamError) return send(res, 502, { error: error.message });
      console.error(error);
      send(res, 500, { error: 'Unexpected server error.' });
    },
  );
}
