import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { Logo } from '../components/Logo.tsx';
import type { Trade } from '../lib/engine.ts';
import { fmtDate, fmtDateTime, fmtDuration, fmtMoney, fmtPct, fmtPips, fmtPrice, fmtR } from '../lib/format.ts';
import { getInstrument, pairLabel } from '../lib/instruments.ts';
import { byExit, bySession, bySide, byWeekday, computeStats, equityCurve, rDistribution, type Breakdown } from '../lib/stats.ts';
import { MIN, zoneShort } from '../lib/time.ts';
import { useSessions, zonePreference, type Session } from '../store/sessions.ts';

function EquityChart({ session }: { session: Session }) {
  const points = equityCurve(session.account.trades, session.initialBalance, session.startTime);
  const width = 720;
  const height = 220;
  const pad = { top: 12, right: 12, bottom: 22, left: 64 };
  const values = points.map((p) => p.equity);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || Math.max(1, high * 0.01);
  const min = low - span * 0.08;
  const max = high + span * 0.08;
  const x = (i: number): number => pad.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * (width - pad.left - pad.right));
  const y = (v: number): number => pad.top + (1 - (v - min) / (max - min)) * (height - pad.top - pad.bottom);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ');
  const baseline = y(session.initialBalance);
  const ticks = high === low ? [high] : [high, (high + low) / 2, low];

  return (
    <svg className="equity" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Balance after each trade, from ${fmtMoney(session.initialBalance)} to ${fmtMoney(values[values.length - 1])}`}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="equity-grid" />
          <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="equity-label">
            {fmtMoney(Math.round(tick)).replace(/\.00$/, '')}
          </text>
        </g>
      ))}
      <line x1={pad.left} x2={width - pad.right} y1={baseline} y2={baseline} className="equity-base" />
      <path d={`${line} L${x(points.length - 1).toFixed(1)},${height - pad.bottom} L${pad.left},${height - pad.bottom} Z`} className="equity-area" />
      <path d={line} className="equity-line" />
      <text x={pad.left} y={height - 5} className="equity-label">Start</text>
      <text x={width - pad.right} y={height - 5} textAnchor="end" className="equity-label">
        Trade {points.length - 1}
      </text>
    </svg>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: Breakdown[] }) {
  const peak = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  return (
    <section className="panel">
      <h2>{title}</h2>
      <table className="breakdown">
        <thead>
          <tr><th>Group</th><th>Trades</th><th>Win rate</th><th colSpan={2}>Net P&amp;L</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.trades}</td>
              <td>{row.trades ? `${Math.round((row.wins / row.trades) * 100)}%` : '—'}</td>
              <td className={row.pnl > 0 ? 'up' : row.pnl < 0 ? 'down' : ''}>{row.trades ? fmtMoney(row.pnl, true) : '—'}</td>
              <td className="bar-cell">
                {row.trades > 0 && <i className={row.pnl >= 0 ? 'bar-up' : 'bar-down'} style={{ width: `${(Math.abs(row.pnl) / peak) * 100}%` }} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function exportCsv(session: Session): void {
  const digits = getInstrument(session.symbol).digits;
  const quote = (text: string): string => `"${text.replace(/"/g, '""')}"`;
  const header = 'symbol,side,type,lots,open_time_utc,close_time_utc,entry,exit,stop,target,pips,pnl_usd,r,exit_reason,tags,note';
  const rows = session.account.trades.map((t: Trade) =>
    [
      t.symbol, t.side, t.type, t.lots.toFixed(2), new Date(t.openTime).toISOString(), new Date(t.closeTime).toISOString(),
      fmtPrice(t.entry, digits), fmtPrice(t.exit, digits), t.sl === null ? '' : fmtPrice(t.sl, digits), t.tp === null ? '' : fmtPrice(t.tp, digits),
      t.pips.toFixed(1), t.pnl.toFixed(2), t.r === null ? '' : t.r.toFixed(2), t.reason, quote(t.tags.join('; ')), quote(t.note),
    ].join(','),
  );
  const url = URL.createObjectURL(new Blob([[header, ...rows].join('\n')], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${session.name.replace(/[^\w-]+/g, '_')}_trades.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function Analytics() {
  const { id = '' } = useParams();
  const session = useSessions((s) => s.sessions.find((x) => x.id === id));

  if (!session) {
    return (
      <div className="center-page">
        <h1>Session not found</h1>
        <Link className="btn btn-primary" to="/app">
          Back to sessions
        </Link>
      </div>
    );
  }

  const trades = session.account.trades;
  const zone = zonePreference();
  const stats = computeStats(trades, session.initialBalance);
  const digits = getInstrument(session.symbol).digits;
  const distribution = rDistribution(trades);
  const tallest = Math.max(1, ...distribution.map((d) => d.count));
  const cards: { label: string; value: string; tone?: string; sub?: string }[] = [
    { label: 'Net P&L', value: fmtMoney(stats.netPnl, true), tone: stats.netPnl > 0 ? 'up' : stats.netPnl < 0 ? 'down' : '', sub: fmtPct(stats.returnPct, true) },
    { label: 'Win rate', value: stats.trades ? `${stats.winRate.toFixed(1)}%` : '—', sub: `${stats.wins} won · ${stats.losses} lost` },
    { label: 'Profit factor', value: stats.profitFactor === null ? '—' : stats.profitFactor.toFixed(2), sub: `${fmtMoney(stats.grossProfit)} / ${fmtMoney(stats.grossLoss)}` },
    { label: 'Average R', value: fmtR(stats.avgR), sub: stats.totalR === null ? 'No trades with a stop' : `${fmtR(stats.totalR)} in total` },
    { label: 'Expectancy', value: fmtMoney(stats.expectancy, true), sub: 'per trade' },
    { label: 'Max drawdown', value: fmtMoney(-stats.maxDrawdown), sub: fmtPct(-stats.maxDrawdownPct) },
    { label: 'Average win / loss', value: `${fmtMoney(stats.avgWin)} / ${fmtMoney(stats.avgLoss)}`, sub: `Best ${fmtMoney(stats.best, true)} · worst ${fmtMoney(stats.worst, true)}` },
    { label: 'Streaks', value: `${stats.maxWinStreak}W / ${stats.maxLossStreak}L`, sub: stats.trades ? `Average hold ${fmtDuration(stats.avgHoldMs)}` : 'longest runs' },
  ];

  return (
    <div className="page">
      <header className="page-top">
        <Logo to="/app" />
        <Link className="btn btn-primary" to={`/app/session/${session.id}`}>
          <Icon name="play" size={14} /> Resume replay
        </Link>
      </header>

      <main className="page-main">
        <div className="page-title">
          <h1>{session.name}</h1>
          <p>
            {pairLabel(session.symbol)} · replayed {fmtDate(session.startTime)} → {fmtDate(session.cursorTime + MIN)} · started with {fmtMoney(session.initialBalance)}
          </p>
        </div>

        {trades.length === 0 ? (
          <div className="empty-state">
            <h2>No closed trades yet</h2>
            <p>Statistics appear once the first trade in this session has closed.</p>
            <Link className="btn btn-primary" to={`/app/session/${session.id}`}>
              Open the replay
            </Link>
          </div>
        ) : (
          <>
            <section className="stat-grid">
              {cards.map((card) => (
                <div className="stat" key={card.label}>
                  <span>{card.label}</span>
                  <b className={card.tone}>{card.value}</b>
                  {card.sub && <small>{card.sub}</small>}
                </div>
              ))}
            </section>

            <section className="panel">
              <h2>Balance after each trade</h2>
              <EquityChart session={session} />
            </section>

            <div className="panel-grid">
              <BreakdownTable title="By direction" rows={bySide(trades)} />
              <BreakdownTable title="By exit" rows={byExit(trades)} />
              <BreakdownTable title="By session at entry" rows={bySession(trades)} />
              <BreakdownTable title="By weekday (New York)" rows={byWeekday(trades)} />
            </div>

            <section className="panel">
              <h2>Result distribution in R</h2>
              {stats.avgR === null ? (
                <p className="empty">R multiples need trades opened with a stop loss.</p>
              ) : (
                <div className="histogram" role="img" aria-label="Number of trades in each R-multiple band">
                  {distribution.map((band) => (
                    <div key={band.label} className="histogram-col">
                      <span>{band.count || ''}</span>
                      <i className={band.positive ? 'bar-up' : 'bar-down'} style={{ height: `${(band.count / tallest) * 100}%` }} />
                      <small>{band.label}</small>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>Trades</h2>
                <button className="btn btn-quiet" onClick={() => exportCsv(session)}>
                  <Icon name="download" size={14} /> Export CSV
                </button>
              </div>
              <div className="table-scroll">
                <table className="trades-table">
                  <thead>
                    <tr><th>#</th><th>Side</th><th>Opened ({zoneShort(zone)})</th><th>Held</th><th>Lots</th><th>Entry</th><th>Exit</th><th>Pips</th><th>R</th><th>P&amp;L</th><th>Tags</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {trades.map((t, i) => (
                      <tr key={t.id}>
                        <td>{i + 1}</td>
                        <td><span className={`badge ${t.side}`}>{t.side === 'buy' ? 'Long' : 'Short'}</span></td>
                        <td>{fmtDateTime(t.openTime, zone)}</td>
                        <td>{fmtDuration(t.closeTime - t.openTime)}</td>
                        <td>{t.lots.toFixed(2)}</td>
                        <td>{fmtPrice(t.entry, digits)}</td>
                        <td>{fmtPrice(t.exit, digits)}</td>
                        <td>{fmtPips(t.pips)}</td>
                        <td>{fmtR(t.r)}</td>
                        <td className={t.pnl >= 0 ? 'up' : 'down'}>{fmtMoney(t.pnl, true)}</td>
                        <td className="wrap">{t.tags.join(', ')}</td>
                        <td className="wrap">{t.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
