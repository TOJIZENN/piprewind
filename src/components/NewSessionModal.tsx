import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataError, fetchWeek } from '../lib/api.ts';
import { fmtDate, fromInputDateTime, toInputDateTime } from '../lib/format.ts';
import { CROSSES, getInstrument, MAJORS, METALS, pairLabel } from '../lib/instruments.ts';
import { DAY, HOUR, isoDate, MIN, TIMEFRAMES, weekStart, zoneShort, type DisplayZone, type Timeframe } from '../lib/time.ts';
import { useSessions, zonePreference } from '../store/sessions.ts';
import { Icon } from './Icon.tsx';

const GROUPS = [
  { label: 'Majors', symbols: MAJORS },
  { label: 'Metals', symbols: METALS },
  { label: 'Crosses', symbols: CROSSES },
];

const LONDON_OPEN = 7 * HOUR;

function randomStart(earliest: string): number {
  const from = Math.max(Date.UTC(2015, 0, 5), Date.parse(earliest));
  const to = Date.now() - 30 * DAY;
  let t = from + Math.floor(Math.random() * ((to - from) / DAY)) * DAY;
  const weekday = new Date(t).getUTCDay();
  if (weekday === 0) t += DAY;
  if (weekday === 6) t += 2 * DAY;
  return t + LONDON_OPEN;
}

function toFields(t: number, zone: DisplayZone): { date: string; time: string } {
  const [date, time] = toInputDateTime(t, zone).split('T');
  return { date, time };
}

export function NewSessionModal({ onClose }: { onClose(): void }) {
  const navigate = useNavigate();
  const count = useSessions((s) => s.sessions.length);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('EURUSD');
  const zone = zonePreference();
  const [initial] = useState(() => toFields(Date.UTC(2024, 1, 5) + LONDON_OPEN, zone));
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [balance, setBalance] = useState('10000');
  const [timeframe, setTimeframe] = useState<Timeframe>('m15');
  const [useSpread, setUseSpread] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const instrument = getInstrument(symbol);
  const earliest = instrument.from;
  const latest = isoDate(Date.now() - 7 * DAY);
  const heavy = instrument.source === 'exness';

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const startTime = fromInputDateTime(`${date}T${time || '00:00'}`, zone);
    const initialBalance = Number(balance);
    if (startTime === null || date < earliest || date > latest) return setError(`${pairLabel(symbol)} can be replayed from ${fmtDate(Date.parse(earliest))} to ${fmtDate(Date.parse(latest))}. Pick a start date in that range.`);
    if (!(initialBalance >= 100)) return setError('The starting balance must be at least $100.');

    setBusy(true);
    setError(null);
    try {
      const week = weekStart(startTime - MIN);
      const bars = await fetchWeek(symbol, week);
      if (bars.length === 0) {
        setBusy(false);
        return setError(`The archive has no ${pairLabel(symbol)} candles for the week of ${fmtDate(week + DAY)}. Pick another date.`);
      }
      const session = useSessions.getState().create({
        name: name.trim() || `${pairLabel(symbol)} session ${count + 1}`,
        symbol,
        startTime,
        initialBalance,
        riskPct: 1,
        useSpread,
        timeframe,
      });
      navigate(`/app/session/${session.id}`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof DataError ? err.message : 'The session could not be created.');
    }
  };

  const random = (): void => {
    const start = toFields(randomStart(earliest), zone);
    setDate(start.date);
    setTime(start.time);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={(e) => void submit(e)} aria-labelledby="new-session-title">
        <div className="modal-head">
          <h2 id="new-session-title">New session</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <label className="field">
          <span>Name</span>
          <input value={name} placeholder={`${pairLabel(symbol)} session ${count + 1}`} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </label>

        <div className="field-grid">
          <label className="field">
            <span>Pair</span>
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.symbols.map((s) => (
                    <option key={s} value={s}>
                      {pairLabel(s)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Chart timeframe</span>
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>
              {TIMEFRAMES.map((tf) => (
                <option key={tf.id} value={tf.id}>
                  {tf.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          <div className="field-head">
            <span>Replay starts at ({zoneShort(zone)})</span>
            <button type="button" className="link-btn" onClick={random}>
              <Icon name="dice" size={14} /> Random date
            </button>
          </div>
          <div className="field-grid">
            <input type="date" value={date} min={earliest} max={latest} onChange={(e) => setDate(e.target.value)} aria-label="Start date" required />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={`Start time, ${zoneShort(zone)}`} required />
          </div>
        </div>

        <label className="field">
          <span>Starting balance (USD)</span>
          <input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </label>

        <label className="check">
          <input type="checkbox" checked={useSpread} onChange={(e) => setUseSpread(e.target.checked)} />
          Apply the historical bid/ask spread to fills
        </label>

        {heavy && <p className="hint">{pairLabel(symbol)} candles are built from tick files. The first time you open a month it can take up to a minute; after that it is instant.</p>}
        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? (heavy ? 'Downloading data…' : 'Checking data…') : 'Start replay'}
          </button>
        </div>
      </form>
    </div>
  );
}
