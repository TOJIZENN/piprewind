import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { Logo } from '../components/Logo.tsx';
import { INSTRUMENTS } from '../lib/instruments.ts';

const FOREX_COUNT = INSTRUMENTS.filter((i) => i.source === 'fxcm').length;

const FEATURES = [
  {
    title: 'Real one-minute history',
    text: `${FOREX_COUNT} forex pairs from 2012 and gold (XAU/USD) from 2015, with bid and ask prices up to last week, from the public FXCM and Exness archives.`,
  },
  {
    title: 'No peeking ahead',
    text: 'The chart only ever holds candles that had closed at the replay point. The future is not loaded behind it.',
  },
  {
    title: 'Seven timeframes, one tape',
    text: 'Every timeframe from 1m to 1D is built from the same minute data, so you can switch mid-replay and watch a candle form.',
  },
  {
    title: 'Orders that behave',
    text: 'Market, limit and stop orders with stop loss and take profit, sized in lots and filled against the historical spread.',
  },
  {
    title: 'A journal on every trade',
    text: 'Add notes and tags while the reasoning is fresh. Entries and exits stay marked on the chart.',
  },
  {
    title: 'Numbers that judge the idea',
    text: 'Win rate, profit factor, drawdown, R multiples, and results split by session, weekday and direction.',
  },
];

const STEPS = [
  {
    title: 'Pick a moment',
    text: 'Choose a pair and a start date, or let the dice choose so you cannot remember what happened next.',
  },
  {
    title: 'Trade it forward',
    text: 'Step candle by candle or press play. Place trades exactly as you would have on the day.',
  },
  {
    title: 'Read the verdict',
    text: 'Open the analytics once you have a sample. Keep what works, drop what does not.',
  },
];

const FAQ = [
  {
    q: 'Is this real trading?',
    a: 'No. PipRewind is a simulator. It never connects to a broker and no money is involved.',
  },
  {
    q: 'Where is my data kept?',
    a: 'Sessions, trades and notes are saved in this browser. Candles are downloaded once and cached on the machine running the app.',
  },
  {
    q: 'How are stops and targets resolved?',
    a: 'On one-minute candles, whatever timeframe you are viewing. If one minute touches both your stop and your target, the stop is taken.',
  },
  {
    q: 'Does a good backtest mean the strategy will make money?',
    a: 'No. Replay results are an estimate from past prices with simplified fills. Treat them as evidence, not a promise.',
  },
];

function HeroTape() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    const count = 64;
    let seed = 7;
    const random = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const candles: { o: number; h: number; l: number; c: number }[] = [];
    let price = 100;
    for (let i = 0; i < count; i++) {
      const o = price;
      const c = o + (random() - 0.47) * 2.4 + Math.sin(i / 7) * 0.5;
      candles.push({
        o,
        c,
        h: Math.max(o, c) + random() * 1.1,
        l: Math.min(o, c) - random() * 1.1,
      });
      price = c;
    }
    const high = Math.max(...candles.map((k) => k.h));
    const low = Math.min(...candles.map((k) => k.l));
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let shown = still ? count : 22;

    const draw = (): void => {
      const ratio = window.devicePixelRatio || 1;
      const width = el.clientWidth;
      const height = el.clientHeight;
      el.width = width * ratio;
      el.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(15,23,42,0.07)';
      for (let i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (height / 5) * i);
        ctx.lineTo(width, (height / 5) * i);
        ctx.stroke();
      }
      const slot = width / count;
      const y = (v: number): number => 14 + (1 - (v - low) / (high - low)) * (height - 28);
      for (let i = 0; i < shown; i++) {
        const k = candles[i];
        const x = slot * i + slot / 2;
        ctx.strokeStyle = ctx.fillStyle = k.c >= k.o ? '#089981' : '#f23645';
        ctx.beginPath();
        ctx.moveTo(x, y(k.h));
        ctx.lineTo(x, y(k.l));
        ctx.stroke();
        ctx.fillRect(x - slot * 0.32, Math.min(y(k.o), y(k.c)), slot * 0.64, Math.max(1.5, Math.abs(y(k.o) - y(k.c))));
      }
      if (shown < count) {
        const x = slot * shown;
        ctx.fillStyle = 'rgba(37,99,235,0.07)';
        ctx.fillRect(x, 0, width - x, height);
        ctx.strokeStyle = '#2563eb';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };

    draw();
    window.addEventListener('resize', draw);
    const timer = still
      ? undefined
      : setInterval(() => {
          shown = shown >= count ? 22 : shown + 1;
          draw();
        }, 420);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', draw);
    };
  }, []);

  return (
    <div className="hero-tape" aria-hidden="true">
      <div className="hero-tape-bar">
        <span className="dot" />
        <span>Replay</span>
        <i>1x</i>
        <i>15m</i>
        <em>Illustration, not market data</em>
      </div>
      <canvas ref={canvas} />
    </div>
  );
}

export function Landing() {
  return (
    <div className="landing">
        <header className="landing-nav">
          <Logo />
          <nav>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#faq">Questions</a>
          </nav>
          <Link className="btn btn-primary" to="/app">
            Open the app
          </Link>
        </header>

        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Forex market replay and backtesting</p>
            <h1>
              Trade last year's market <span>before</span> you trade tomorrow's.
            </h1>
            <p className="lede">
              PipRewind replays real historical forex candles one bar at a time. Place simulated trades, journal them, and find out whether your strategy holds up, without risking money.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-large" to="/app">
                <Icon name="play" size={15} /> Start a session
              </Link>
              <a className="btn btn-quiet btn-large" href="#how">
                See how it works
              </a>
            </div>
            <ul className="hero-facts">
              <li>
                <b>{FOREX_COUNT}</b> forex pairs + <b>gold</b>
              </li>
              <li>
                <b>2012</b> to last week
              </li>
              <li>
                <b>1-minute</b> resolution
              </li>
            </ul>
          </div>
          <HeroTape />
        </section>

        <section id="features" className="landing-section">
          <h2>Everything a practice session needs</h2>
          <div className="feature-grid">
            {FEATURES.map((feature, i) => (
              <article key={feature.title}>
                <span className="feature-no">{String(i + 1).padStart(2, '0')}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="landing-section">
          <h2>Three steps, then repeat</h2>
          <ol className="steps">
            {STEPS.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="faq" className="landing-section">
          <h2>Questions</h2>
          <div className="faq">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="cta">
          <h2>Your next hundred trades cost nothing here.</h2>
          <Link className="btn btn-primary btn-large" to="/app">
            Start a session
          </Link>
        </section>

        <footer className="landing-foot">
          <Logo />
          <p>
            Simulation only. PipRewind does not place orders, give financial advice or predict future results. Historical prices come from the public FXCM candle archive and, for gold, the public
            Exness tick archive; charts use TradingView Lightweight Charts.
          </p>
        </footer>
    </div>
  );
}
