import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Chart, EMAS } from '../components/Chart.tsx';
import { ChartSettings } from '../components/ChartSettings.tsx';
import { HistoryPanel } from '../components/HistoryPanel.tsx';
import { Icon } from '../components/Icon.tsx';
import { PositionsPanel } from '../components/PositionsPanel.tsx';
import { ReplayBar } from '../components/ReplayBar.tsx';
import { Toolbar } from '../components/Toolbar.tsx';
import { TOOL_SHORTCUTS, TOOLS } from '../lib/drawings.ts';
import { floatingPnl } from '../lib/engine.ts';
import { fmtMoney, fmtPrice } from '../lib/format.ts';
import { getInstrument, pairLabel } from '../lib/instruments.ts';
import { TIMEFRAMES } from '../lib/time.ts';
import { currentBar, engineContext, useReplay } from '../replay/store.ts';
import { useChartStyle, type ChartStyle } from '../store/chartStyle.ts';

function Toasts() {
  const toasts = useReplay((s) => s.toasts);
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => useReplay.getState().dismissToast(toasts[0].id), 3200);
    return () => clearTimeout(timer);
  }, [toasts]);
  return (
    <div className="toasts" role="status">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}

function AccountStrip() {
  const session = useReplay((s) => s.session)!;
  const cursor = useReplay((s) => s.cursor);
  const bar = currentBar(cursor)!;
  const ctx = engineContext(session);
  const open = floatingPnl(session.account, bar, ctx);
  const { balance, trades } = session.account;
  const wins = trades.filter((t) => t.pnl > 0).length;
  return (
    <dl className="account">
      <div><dt>Balance</dt><dd>{fmtMoney(balance)}</dd></div>
      <div><dt>Equity</dt><dd>{fmtMoney(balance + open)}</dd></div>
      <div><dt>Open P&amp;L</dt><dd className={open > 0 ? 'up' : open < 0 ? 'down' : ''}>{fmtMoney(open, true)}</dd></div>
      <div><dt>Win rate</dt><dd>{trades.length ? `${Math.round((wins / trades.length) * 100)}%` : '—'}</dd></div>
    </dl>
  );
}

export function Workspace() {
  const { id = '' } = useParams();
  const status = useReplay((s) => s.status);
  const error = useReplay((s) => s.error);
  const session = useReplay((s) => s.session);
  const cursor = useReplay((s) => s.cursor);
  const tool = useReplay((s) => s.tool);
  const tab = useReplay((s) => s.sideTab);
  const chartType = useChartStyle((s) => s.style.type);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void useReplay.getState().open(id);
    return () => useReplay.getState().close();
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      const replay = useReplay.getState();
      if (e.altKey) {
        const shortcut = !e.metaKey && !e.ctrlKey && TOOL_SHORTCUTS.find((item) => item.code === e.code && item.shift === e.shiftKey);
        if (shortcut) {
          e.preventDefault();
          replay.setTool(shortcut.tool);
        }
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          replay.undoDrawing();
        }
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (replay.playing) replay.pause();
        else replay.play();
      } else if (e.key === 'ArrowRight') void replay.stepForward();
      else if (e.key === 'ArrowLeft') replay.stepBack();
      else if (e.key === 'Escape') {
        replay.setTool(replay.cursorTool);
        replay.select(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && replay.selected && !replay.lockDrawings) {
        e.preventDefault();
        replay.removeDrawing(replay.selected);
      }
    };
    const onPointer = (e: PointerEvent): void => {
      for (const menu of document.querySelectorAll<HTMLDetailsElement>('details.menu[open]')) {
        if (!menu.contains(e.target as Node)) menu.open = false;
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  if (status === 'error') {
    return (
      <div className="center-page">
        <h1>This session could not be opened</h1>
        <p>{error}</p>
        <Link className="btn btn-primary" to="/app">
          Back to sessions
        </Link>
      </div>
    );
  }
  if (status !== 'ready' || !session || session.id !== id) {
    const heavy = session && getInstrument(session.symbol).source === 'exness';
    return (
      <div className="center-page">
        <div className="spinner" />
        <p>
          {heavy
            ? `Loading ${pairLabel(session.symbol)} candles… these are built from tick files, so the first visit to a month can take up to a minute. After that it is instant.`
            : 'Loading candles… the first visit to a date downloads about a year and a half of history.'}
        </p>
      </div>
    );
  }

  const inst = getInstrument(session.symbol);
  const bar = currentBar(cursor)!;
  const { setTimeframe, patchSettings, setSideTab: setTab, undoDrawing } = useReplay.getState();
  const { positions, orders, trades } = session.account;
  const hint = TOOLS[tool].hint;

  return (
    <div className="ws">
      <header className="ws-top">
        <Link className="icon-btn" to="/app" title="Back to sessions" aria-label="Back to sessions">
          <Icon name="back" />
        </Link>
        <div className="ws-title">
          <b>{pairLabel(session.symbol)}</b>
          <span>{session.name}</span>
        </div>
        <span className="ws-price mono">{fmtPrice(bar.c, inst.digits)}</span>

        <div className="seg ws-tf">
          {TIMEFRAMES.map((tf) => (
            <button key={tf.id} className={session.timeframe === tf.id ? 'on' : ''} onClick={() => setTimeframe(tf.id)}>
              {tf.label}
            </button>
          ))}
        </div>

        <label className="ws-type">
          <span className="sr-only">Chart type</span>
          <select value={chartType} onChange={(e) => useChartStyle.getState().change({ type: e.target.value as ChartStyle['type'] })}>
            <option value="candles">Candles</option>
            <option value="footprint">Volume footprint</option>
          </select>
        </label>

        <details className="menu">
          <summary className="btn btn-quiet">Indicators</summary>
          <div className="menu-body">
            {EMAS.map((def) => (
              <label className="check" key={def.key}>
                <input type="checkbox" checked={session.indicators[def.key]} onChange={(e) => patchSettings({ indicators: { ...session.indicators, [def.key]: e.target.checked } })} />
                <i style={{ background: def.color }} /> EMA {def.period}
              </label>
            ))}
          </div>
        </details>

        <button className="icon-btn" onClick={undoDrawing} title="Undo the last drawing change (Ctrl/Cmd+Z)" aria-label="Undo the last drawing change">
          <Icon name="undo" />
        </button>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Chart settings: colours and themes" aria-label="Chart settings">
          <Icon name="gear" />
        </button>

        <Link className="btn btn-quiet ws-analytics" to={`/app/session/${session.id}/analytics`}>
          <Icon name="stats" size={15} /> Analytics
        </Link>
      </header>

      <div className="ws-body">
        <Toolbar />

        <main className="ws-chart">
          <Chart />
          {hint && <div className="chart-hint">{hint} Press Esc to cancel.</div>}
          <Toasts />
        </main>

        <aside className="ws-side">
          <AccountStrip />
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'positions'} className={tab === 'positions' ? 'on' : ''} onClick={() => setTab('positions')}>
              Open <i>{positions.length + orders.length}</i>
            </button>
            <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
              History <i>{trades.length}</i>
            </button>
          </div>
          <div className="ws-panel">
            {tab === 'positions' && <PositionsPanel />}
            {tab === 'history' && <HistoryPanel />}
          </div>
        </aside>
      </div>

      <ReplayBar />
      {settingsOpen && <ChartSettings onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
