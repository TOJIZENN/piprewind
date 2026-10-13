import { useEffect, useRef, useState } from 'react';
import { fmtDateTime, fromInputDateTime, toInputDateTime } from '../lib/format.ts';
import { getInstrument } from '../lib/instruments.ts';
import { MIN, TIMEFRAMES, ZONES, zoneShort, type DisplayZone, type Timeframe } from '../lib/time.ts';
import { currentBar, useReplay } from '../replay/store.ts';
import { Icon } from './Icon.tsx';

const SPEEDS = [1, 2, 5, 10, 25];
const STEP_SIZES: Timeframe[] = ['m1', 'm5', 'm15', 'h1'];

export function ReplayBar() {
  const session = useReplay((s) => s.session)!;
  const cursor = useReplay((s) => s.cursor);
  const playing = useReplay((s) => s.playing);
  const speed = useReplay((s) => s.speed);
  const step = useReplay((s) => s.step);
  const loadingMore = useReplay((s) => s.loadingMore);
  const backfilling = useReplay((s) => s.backfilling);
  const endOfData = useReplay((s) => s.endOfData);
  const { play, pause, stepForward, stepBack, setSpeed, setStep, goTo, patchSettings } = useReplay.getState();

  const bar = currentBar(cursor);
  const now = bar ? bar.t + MIN : session.cursorTime + MIN;
  const zone = session.zone;
  const short = zoneShort(zone);
  const [target, setTarget] = useState<string | null>(null);
  const clock = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (target === null) return;
    const outside = (e: PointerEvent): void => {
      if (!clock.current?.contains(e.target as Node)) setTarget(null);
    };
    const escape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setTarget(null);
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape);
    };
  }, [target === null]);

  const jump = (e: React.FormEvent): void => {
    e.preventDefault();
    const t = target ? fromInputDateTime(target, zone) : null;
    if (t === null) return;
    void goTo(t);
    setTarget(null);
  };

  return (
    <footer className="replay">
      <div className="replay-transport">
        <button className="icon-btn" onClick={stepBack} title="Step back (←)" aria-label="Step back">
          <Icon name="prev" />
        </button>
        <button className="icon-btn play-btn" onClick={playing ? pause : play} title="Play / pause (Space)" aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <button className="icon-btn" onClick={() => void stepForward()} title="Step forward (→)" aria-label="Step forward">
          <Icon name="next" />
        </button>
      </div>

      <div className="replay-group">
        <span className="replay-label">Speed</span>
        <div className="seg">
          {SPEEDS.map((value) => (
            <button key={value} className={speed === value ? 'on' : ''} onClick={() => setSpeed(value)}>
              {value}x
            </button>
          ))}
        </div>
      </div>

      <label className="replay-group">
        <span className="replay-label">Step</span>
        <select value={step} onChange={(e) => setStep(e.target.value as Timeframe | 'chart')}>
          <option value="chart">Chart candle</option>
          {STEP_SIZES.map((id) => (
            <option key={id} value={id}>
              {TIMEFRAMES.find((t) => t.id === id)!.label}
            </option>
          ))}
        </select>
      </label>

      <div className="replay-clock-wrap" ref={clock}>
        <button className="replay-clock" onClick={() => setTarget(target === null ? toInputDateTime(now, zone) : null)} title="Jump to a date and time" aria-expanded={target !== null}>
          <b>{fmtDateTime(now, zone, true)}</b>
          <span>{endOfData ? 'End of data' : loadingMore ? 'Loading next week…' : backfilling ? 'Loading older history…' : `${short} · click to jump to a date`}</span>
        </button>
        {target !== null && (
          <form className="replay-jump" onSubmit={jump}>
            <label htmlFor="replay-jump-input">Go to date and time ({short})</label>
            <div className="field-row">
              <input
                id="replay-jump-input"
                type="datetime-local"
                autoFocus
                value={target}
                min={`${getInstrument(session.symbol).from}T00:00`}
                max={toInputDateTime(Date.now(), zone)}
                onChange={(e) => setTarget(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={!target}>
                Go
              </button>
            </div>
          </form>
        )}
      </div>

      <label className="replay-group replay-zone">
        <span className="replay-label">Time zone</span>
        <select value={zone} onChange={(e) => patchSettings({ zone: e.target.value as DisplayZone })}>
          {ZONES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </footer>
  );
}
