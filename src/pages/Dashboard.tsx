import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { Logo } from '../components/Logo.tsx';
import { NewSessionModal } from '../components/NewSessionModal.tsx';
import { fmtDate, fmtDateTime, fmtMoney, fmtPct } from '../lib/format.ts';
import { pairLabel } from '../lib/instruments.ts';
import { computeStats } from '../lib/stats.ts';
import { MIN, zoneShort } from '../lib/time.ts';
import { useSessions, zonePreference, type Session } from '../store/sessions.ts';

const STARTERS = [
  { symbol: 'EURUSD', start: Date.UTC(2024, 1, 5, 7) },
  { symbol: 'XAUUSD', start: Date.UTC(2024, 2, 4, 7) },
  { symbol: 'GBPUSD', start: Date.UTC(2023, 5, 12, 7) },
];

function QuickStart() {
  const navigate = useNavigate();
  const zone = zonePreference();
  const when = (start: number): string => `${fmtDateTime(start, zone, true)} ${zoneShort(zone)}`;
  const open = (symbol: string, start: number): void => {
    const session = useSessions.getState().create({
      name: `${pairLabel(symbol)} quick start`,
      symbol,
      startTime: start,
      initialBalance: 10_000,
      riskPct: 1,
      useSpread: true,
      timeframe: 'm15',
    });
    navigate(`/app/session/${session.id}`);
  };
  return (
    <section className="starters" aria-labelledby="starters-title">
      <h2 id="starters-title">Quick start</h2>
      <p>One click creates the session and opens the chart. Each starts with $10,000 on the 15-minute chart at the London open.</p>
      <div className="starter-row">
        {STARTERS.map((starter) => (
          <button key={starter.symbol} className="starter" aria-label={`Open a ${pairLabel(starter.symbol)} session starting ${when(starter.start)}`} onClick={() => open(starter.symbol, starter.start)}>
            <b>{pairLabel(starter.symbol)}</b>
            <span>{when(starter.start)}</span>
            <i>
              <Icon name="play" size={12} /> Open
            </i>
          </button>
        ))}
      </div>
    </section>
  );
}

function SessionCard({ session }: { session: Session }) {
  const stats = computeStats(session.account.trades, session.initialBalance);
  const remove = (): void => {
    if (window.confirm(`Delete "${session.name}" and its ${stats.trades} trades? This cannot be undone.`)) useSessions.getState().remove(session.id);
  };
  return (
    <article className="session-card">
      <header>
        <div>
          <h3>{session.name}</h3>
          <p>
            {pairLabel(session.symbol)} · {fmtDate(session.startTime)} → {fmtDate(session.cursorTime + MIN)}
          </p>
        </div>
        <button className="icon-btn" onClick={remove} title="Delete session" aria-label={`Delete ${session.name}`}>
          <Icon name="trash" />
        </button>
      </header>
      <dl className="session-stats">
        <div><dt>Balance</dt><dd>{fmtMoney(session.account.balance)}</dd></div>
        <div><dt>Return</dt><dd className={stats.netPnl > 0 ? 'up' : stats.netPnl < 0 ? 'down' : ''}>{fmtPct(stats.returnPct, true)}</dd></div>
        <div><dt>Trades</dt><dd>{stats.trades}</dd></div>
        <div><dt>Win rate</dt><dd>{stats.trades ? `${stats.winRate.toFixed(0)}%` : '—'}</dd></div>
      </dl>
      <footer>
        <Link className="btn btn-primary" to={`/app/session/${session.id}`}>
          <Icon name="play" size={14} /> Resume
        </Link>
        <Link className="btn btn-quiet" to={`/app/session/${session.id}/analytics`}>
          <Icon name="stats" size={14} /> Analytics
        </Link>
      </footer>
    </article>
  );
}

export function Dashboard() {
  const sessions = useSessions((s) => s.sessions);
  const [creating, setCreating] = useState(false);
  const trades = sessions.reduce((sum, s) => sum + s.account.trades.length, 0);

  return (
    <div className="page">
      <header className="page-top">
        <Logo />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={15} /> New session
        </button>
      </header>

      <main className="page-main">
        <div className="page-title">
          <h1>Sessions</h1>
          <p>{sessions.length ? `${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${trades} trade${trades === 1 ? '' : 's'} journalled. Everything is saved in this browser.` : 'Each session is one backtest: a pair, a start date and a simulated account.'}</p>
        </div>

        <QuickStart />

        {sessions.length === 0 ? (
          <div className="empty-state">
            <h2>Or set up your own</h2>
            <p>You have no saved sessions yet. Pick any pair and date: the chart opens at that moment in history, and you step the market forward from there.</p>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={15} /> New session
            </button>
          </div>
        ) : (
          <div className="session-grid">
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </main>

      {creating && <NewSessionModal onClose={() => setCreating(false)} />}
    </div>
  );
}
