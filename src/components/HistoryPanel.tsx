import { useState } from 'react';
import type { Trade } from '../lib/engine.ts';
import { fmtDateTime, fmtDuration, fmtMoney, fmtPips, fmtPrice, fmtR } from '../lib/format.ts';
import { getInstrument } from '../lib/instruments.ts';
import type { DisplayZone } from '../lib/time.ts';
import { useReplay } from '../replay/store.ts';

const REASONS = { tp: 'Take profit', sl: 'Stop loss', manual: 'Closed manually' } as const;

export const parseTags = (text: string): string[] => [...new Set(text.split(',').map((tag) => tag.trim()).filter(Boolean))];

function TradeRow({ trade, zone }: { trade: Trade; zone: DisplayZone }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(trade.note);
  const [tags, setTags] = useState(trade.tags.join(', '));
  const digits = getInstrument(trade.symbol).digits;
  const save = (): void => useReplay.getState().annotate(trade.id, note.trim(), parseTags(tags));

  return (
    <div className={`trade${open ? ' open' : ''}`}>
      <button className="trade-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`badge ${trade.side}`}>{trade.side === 'buy' ? 'Long' : 'Short'}</span>
        <span className="trade-when">{fmtDateTime(trade.closeTime, zone)}</span>
        <span className="mono trade-r">{fmtR(trade.r)}</span>
        <b className={`mono ${trade.pnl >= 0 ? 'up' : 'down'}`}>{fmtMoney(trade.pnl, true)}</b>
      </button>
      {open && (
        <div className="trade-body">
          <dl className="facts">
            <div><dt>Entry</dt><dd>{fmtPrice(trade.entry, digits)}</dd></div>
            <div><dt>Exit</dt><dd>{fmtPrice(trade.exit, digits)}</dd></div>
            <div><dt>Lots</dt><dd>{trade.lots.toFixed(2)}</dd></div>
            <div><dt>Pips</dt><dd>{fmtPips(trade.pips)}</dd></div>
            <div><dt>Held</dt><dd>{fmtDuration(trade.closeTime - trade.openTime)}</dd></div>
            <div><dt>Exit by</dt><dd>{REASONS[trade.reason]}</dd></div>
          </dl>
          <label className="field">
            <span>Notes</span>
            <textarea rows={3} value={note} placeholder="What did you see? What would you repeat or avoid?" onChange={(e) => setNote(e.target.value)} onBlur={save} />
          </label>
          <label className="field">
            <span>Tags, comma separated</span>
            <input value={tags} placeholder="breakout, london open" onChange={(e) => setTags(e.target.value)} onBlur={save} />
          </label>
        </div>
      )}
    </div>
  );
}

export function HistoryPanel() {
  const session = useReplay((s) => s.session)!;
  const trades = session.account.trades;
  if (trades.length === 0) return <p className="empty">Closed trades appear here, ready for notes and tags.</p>;
  return (
    <div className="stack">
      {[...trades].reverse().map((trade) => (
        <TradeRow key={trade.id} trade={trade} zone={session.zone} />
      ))}
    </div>
  );
}
