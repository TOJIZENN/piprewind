import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { exitPrice, pnlUsd, type Side } from '../lib/engine.ts';
import { fmtMoney, fmtPrice } from '../lib/format.ts';
import { currentBar, engineContext, useReplay } from '../replay/store.ts';
import { Icon } from './Icon.tsx';

export interface ChartBridge {
  el: HTMLElement;
  yOf(price: number): number | null;
  priceAt(y: number): number | null;
  paneHeight(): number;
  axisWidth(): number;
  onFrame(callback: () => void): () => void;
}

type Level = 'entry' | 'sl' | 'tp';

interface Row {
  key: string;
  price: number;
  tone: 'buy' | 'sell' | 'loss' | 'gain' | 'muted';
  line: 'solid' | 'dashed' | 'dotted';
  draggable: boolean;
  tag: ReactNode;
}

const sideName = (side: Side): string => (side === 'buy' ? 'Buy' : 'Sell');

export function TradeLines({ bridge }: { bridge: ChartBridge }) {
  const session = useReplay((s) => s.session)!;
  const cursor = useReplay((s) => s.cursor);
  const root = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ key: string; price: number } | null>(null);

  const bar = currentBar(cursor)!;
  const ctx = engineContext(session);
  const { digits, pip } = ctx.instrument;
  const { positions, orders } = session.account;
  const replay = useReplay.getState();

  useEffect(() => {
    const place = (): void => {
      const el = root.current;
      if (!el) return;
      const height = bridge.paneHeight();
      el.style.setProperty('--axis', `${bridge.axisWidth()}px`);
      el.style.height = `${height}px`;
      for (const row of el.children as HTMLCollectionOf<HTMLElement>) {
        const y = bridge.yOf(Number(row.dataset.price));
        const visible = y !== null && y >= 0 && y <= height;
        row.style.display = visible ? '' : 'none';
        if (visible) row.style.transform = `translateY(${Math.round(y)}px)`;
      }
    };
    place();
    return bridge.onFrame(place);
  });

  const priceFrom = (e: ReactPointerEvent): number | null => {
    const price = bridge.priceAt(e.clientY - bridge.el.getBoundingClientRect().top);
    return price === null ? null : Number(price.toFixed(digits));
  };

  const refuse = (problem: string | null): void => {
    if (problem) replay.toast('error', problem);
  };

  const commit = (key: string, price: number): void => {
    const [kind, id, level] = key.split(':') as [string, string, Level];
    if (kind === 'pos') {
      const p = positions.find((x) => x.id === id);
      if (p) refuse(replay.modifyPosition(id, level === 'sl' ? price : p.sl, level === 'tp' ? price : p.tp));
      return;
    }
    refuse(replay.modifyOrder(id, level === 'entry' ? { price } : { [level]: price }));
  };

  const begin = (key: string) => (e: ReactPointerEvent<HTMLElement>): void => {
    if (e.button !== 0) return;
    const price = priceFrom(e);
    if (price === null) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ key, price });
  };
  const move = (e: ReactPointerEvent): void => {
    if (!drag) return;
    const price = priceFrom(e);
    if (price !== null && price !== drag.price) setDrag({ key: drag.key, price });
  };
  const end = (): void => {
    if (!drag) return;
    commit(drag.key, drag.price);
    setDrag(null);
  };
  const dragProps = (key: string) => ({ onPointerDown: begin(key), onPointerMove: move, onPointerUp: end, onPointerCancel: () => setDrag(null) });

  const live = (key: string, price: number | null): number | null => (drag?.key === key ? drag.price : price);

  const rows: Row[] = [];

  const group = (o: {
    prefix: string;
    side: Side;
    lots: number | null;
    entry: number;
    sl: number | null;
    tp: number | null;
    entryTag: ReactNode;
    entryLine: Row['line'];
    entryDraggable: boolean;
    onRemove(level: 'sl' | 'tp'): void;
  }): void => {
    const entry = live(`${o.prefix}:entry`, o.entry)!;
    const sl = live(`${o.prefix}:sl`, o.sl);
    const tp = live(`${o.prefix}:tp`, o.tp);
    const chip = (level: 'sl' | 'tp') => (
      <button className={`tline-chip ${level}`} {...dragProps(`${o.prefix}:${level}`)} title={`Drag to set the ${level === 'sl' ? 'stop loss' : 'take profit'}`}>
        {level.toUpperCase()}
      </button>
    );
    rows.push({
      key: `${o.prefix}:entry`,
      price: entry,
      tone: o.side,
      line: o.entryLine,
      draggable: o.entryDraggable,
      tag: (
        <>
          {o.entryTag}
          {o.tp === null && chip('tp')}
          {o.sl === null && chip('sl')}
        </>
      ),
    });
    const level = (name: 'sl' | 'tp', price: number): void => {
      const amount = o.lots === null ? null : pnlUsd(o.side, o.lots, entry, price, bar.t, ctx);
      rows.push({
        key: `${o.prefix}:${name}`,
        price,
        tone: name === 'sl' ? 'loss' : 'gain',
        line: 'dashed',
        draggable: true,
        tag: (
          <>
            <b>{name.toUpperCase()}</b>
            {amount !== null && <span>{fmtMoney(amount, true)}</span>}
            <span className="tline-dim">{(Math.abs(price - entry) / pip).toFixed(1)} pips</span>
            <button className="tline-x" onPointerDown={(e) => e.stopPropagation()} onClick={() => o.onRemove(name)} title={`Remove the ${name === 'sl' ? 'stop loss' : 'take profit'}`} aria-label={`Remove the ${name === 'sl' ? 'stop loss' : 'take profit'}`}>
              <Icon name="close" size={11} />
            </button>
          </>
        ),
      });
    };
    if (sl !== null) level('sl', sl);
    if (tp !== null) level('tp', tp);
  };

  for (const p of positions) {
    const pnl = pnlUsd(p.side, p.lots, p.entry, exitPrice(p.side, bar, ctx), bar.t, ctx);
    group({
      prefix: `pos:${p.id}`,
      side: p.side,
      lots: p.lots,
      entry: p.entry,
      sl: p.sl,
      tp: p.tp,
      entryLine: 'solid',
      entryDraggable: false,
      entryTag: (
        <>
          <b>{sideName(p.side)} {p.lots.toFixed(2)}</b>
          <span className={pnl >= 0 ? 'up' : 'down'}>{fmtMoney(pnl, true)}</span>
          <button className="tline-x" onPointerDown={(e) => e.stopPropagation()} onClick={() => replay.closePosition(p.id)} title="Close at market" aria-label="Close this position at market">
            <Icon name="close" size={11} />
          </button>
        </>
      ),
      onRemove: (level) => refuse(replay.modifyPosition(p.id, level === 'sl' ? null : p.sl, level === 'tp' ? null : p.tp)),
    });
  }

  for (const o of orders) {
    group({
      prefix: `ord:${o.id}`,
      side: o.side,
      lots: o.lots,
      entry: o.price,
      sl: o.sl,
      tp: o.tp,
      entryLine: 'dotted',
      entryDraggable: true,
      entryTag: (
        <>
          <b>{sideName(o.side)} {o.type} {o.lots.toFixed(2)}</b>
          <button className="tline-x" onPointerDown={(e) => e.stopPropagation()} onClick={() => replay.cancelOrder(o.id)} title="Cancel this order" aria-label="Cancel this order">
            <Icon name="close" size={11} />
          </button>
        </>
      ),
      onRemove: (level) => refuse(replay.modifyOrder(o.id, { [level]: null })),
    });
  }

  return (
    <div className="tlines" ref={root}>
      {rows.map((row) => (
        <div key={row.key} className={`tline ${row.tone} ${row.line}${drag?.key === row.key ? ' dragging' : ''}`} data-price={row.price}>
          <div className={`tline-rule${row.draggable ? ' draggable' : ''}`} {...(row.draggable ? dragProps(row.key) : {})} />
          <div className={`tline-tag${row.draggable ? ' draggable' : ''}`} {...(row.draggable ? dragProps(row.key) : {})}>
            {row.tag}
          </div>
          <div className="tline-axis">{fmtPrice(row.price, digits)}</div>
        </div>
      ))}
    </div>
  );
}
