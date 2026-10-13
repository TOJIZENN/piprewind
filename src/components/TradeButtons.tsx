import { useEffect, useRef, useState } from 'react';
import { marketPrice, MAX_LOTS, MIN_LOTS, type Side } from '../lib/engine.ts';
import { fmtPrice } from '../lib/format.ts';
import { currentBar, engineContext, useReplay } from '../replay/store.ts';

export const parseLots = (text: string): number | null => {
  const n = Number(text);
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

export function TradeButtons() {
  const session = useReplay((s) => s.session)!;
  const cursor = useReplay((s) => s.cursor);
  const lots = useReplay((s) => s.lots);
  const { place, setLots } = useReplay.getState();
  const [side, setSide] = useState<Side | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!side) return;
    const outside = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setSide(null);
    };
    const escape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSide(null);
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape);
    };
  }, [side]);

  const bar = currentBar(cursor)!;
  const ctx = engineContext(session);
  const { digits, pip } = ctx.instrument;
  const bid = marketPrice('sell', bar, ctx);
  const ask = marketPrice('buy', bar, ctx);
  const size = parseLots(lots);

  const toggle = (next: Side): void => {
    setSide(side === next ? null : next);
    setError(null);
  };

  const nudge = (by: number): void => {
    const next = Math.min(MAX_LOTS, Math.max(MIN_LOTS, Math.round(((size ?? 0) + by) * 100) / 100));
    setLots(next.toFixed(2));
    setError(null);
  };

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!side) return;
    if (size === null) return setError('Enter a lot size, for example 0.10.');
    const problem = place({ side, type: 'market', lots: size, price: null, sl: null, tp: null });
    if (problem) return setError(problem);
    setSide(null);
  };

  return (
    <div className="trade-buttons" ref={root}>
      <button className={`tb sell${side === 'sell' ? ' on' : ''}`} onClick={() => toggle('sell')} aria-expanded={side === 'sell'}>
        <span>Sell</span>
        <b>{fmtPrice(bid, digits)}</b>
      </button>
      <span className="tb-spread" title="Spread in pips">
        {((ask - bid) / pip).toFixed(1)}
      </span>
      <button className={`tb buy${side === 'buy' ? ' on' : ''}`} onClick={() => toggle('buy')} aria-expanded={side === 'buy'}>
        <span>Buy</span>
        <b>{fmtPrice(ask, digits)}</b>
      </button>

      {side && (
        <form className={`tb-pop ${side}`} onSubmit={submit}>
          <label htmlFor="tb-lots">Lot size</label>
          <div className="tb-size">
            <button type="button" onClick={() => nudge(-0.01)} aria-label="Decrease lot size">
              −
            </button>
            <input id="tb-lots" inputMode="decimal" autoFocus autoComplete="off" value={lots} onFocus={(e) => e.target.select()} onChange={(e) => (setLots(e.target.value), setError(null))} />
            <button type="button" onClick={() => nudge(0.01)} aria-label="Increase lot size">
              +
            </button>
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className={`btn btn-wide ${side === 'buy' ? 'btn-buy' : 'btn-sell'}`}>
            {side === 'buy' ? 'Buy' : 'Sell'} {size !== null ? size.toFixed(2) : ''} at {fmtPrice(side === 'buy' ? ask : bid, digits)}
          </button>
          <p className="hint">Then drag SL and TP off the position's tag on the chart.</p>
        </form>
      )}
    </div>
  );
}
