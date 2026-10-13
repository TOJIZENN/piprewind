import { useState } from 'react';
import { exitPrice, pnlUsd, type Position } from '../lib/engine.ts';
import { fmtMoney, fmtPrice } from '../lib/format.ts';
import { currentBar, engineContext, useReplay } from '../replay/store.ts';

const parse = (text: string): number | null | undefined => {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function PositionCard({ position, pnl, digits }: { position: Position; pnl: number; digits: number }) {
  const { modifyPosition, closePosition } = useReplay.getState();
  const [sl, setSl] = useState(position.sl === null ? '' : fmtPrice(position.sl, digits));
  const [tp, setTp] = useState(position.tp === null ? '' : fmtPrice(position.tp, digits));
  const [error, setError] = useState<string | null>(null);

  const changed = (parse(sl) ?? null) !== position.sl || (parse(tp) ?? null) !== position.tp;
  const update = (): void => {
    const nextSl = parse(sl);
    const nextTp = parse(tp);
    if (nextSl === undefined || nextTp === undefined) return setError('Enter a valid price, or leave the field empty.');
    setError(modifyPosition(position.id, nextSl, nextTp));
  };

  return (
    <div className="card">
      <div className="card-head">
        <span className={`badge ${position.side}`}>{position.side === 'buy' ? 'Long' : 'Short'}</span>
        <span className="mono">{position.lots.toFixed(2)} lots at {fmtPrice(position.entry, digits)}</span>
        <b className={`mono ${pnl >= 0 ? 'up' : 'down'}`}>{fmtMoney(pnl, true)}</b>
      </div>
      <div className="card-levels">
        <label>
          <span>SL</span>
          <input inputMode="decimal" value={sl} placeholder="None" onChange={(e) => setSl(e.target.value)} />
        </label>
        <label>
          <span>TP</span>
          <input inputMode="decimal" value={tp} placeholder="None" onChange={(e) => setTp(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="card-actions">
        <button className="btn btn-quiet" onClick={update} disabled={!changed}>
          Update levels
        </button>
        <button className="btn btn-quiet" onClick={() => closePosition(position.id)}>
          Close at market
        </button>
      </div>
    </div>
  );
}

export function PositionsPanel() {
  const session = useReplay((s) => s.session)!;
  const cursor = useReplay((s) => s.cursor);
  const { cancelOrder, closeAll } = useReplay.getState();
  const bar = currentBar(cursor)!;
  const ctx = engineContext(session);
  const digits = ctx.instrument.digits;
  const { positions, orders } = session.account;

  if (positions.length + orders.length === 0) {
    return <p className="empty">No open positions or pending orders. Use the Sell and Buy buttons at the top left of the chart, then drag SL and TP off the position's tag.</p>;
  }

  return (
    <div className="stack">
      {positions.map((p) => (
        <PositionCard key={`${p.id}:${p.sl}:${p.tp}`} position={p} digits={digits} pnl={pnlUsd(p.side, p.lots, p.entry, exitPrice(p.side, bar, ctx), bar.t, ctx)} />
      ))}
      {orders.map((o) => (
        <div className="card" key={o.id}>
          <div className="card-head">
            <span className={`badge ${o.side}`}>{o.side === 'buy' ? 'Buy' : 'Sell'} {o.type}</span>
            <span className="mono">{o.lots.toFixed(2)} lots at {fmtPrice(o.price, digits)}</span>
          </div>
          <p className="hint mono">
            SL {o.sl === null ? '—' : fmtPrice(o.sl, digits)} · TP {o.tp === null ? '—' : fmtPrice(o.tp, digits)}
          </p>
          <div className="card-actions">
            <button className="btn btn-quiet" onClick={() => cancelOrder(o.id)}>
              Cancel order
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-quiet btn-wide" onClick={closeAll}>
        Close and cancel everything
      </button>
    </div>
  );
}
