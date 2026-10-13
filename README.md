# PipRewind

A forex market-replay and manual backtesting site. Pick a pair and a moment in history, step the market
forward candle by candle, place simulated trades, journal them and read the statistics.

**Simulation only.** PipRewind never connects to a broker or places real orders. Results come from past
prices with simplified fills and do not predict future performance.

## Run it

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5187. To serve a production build instead:

```bash
npm run build
npm start
```

`npm start` listens on port 4173, or on `PORT` if set. `npm test` runs the unit tests.

## What it does

- **Replay** real 1-minute candles for 25 forex pairs (2012 onward) and gold, XAU/USD (2015 onward), up to last week. Play, pause, step forward and
  back, five speeds. Click the replay clock to jump to any date and time. Keyboard: Space, ← and →.
- **Seven timeframes** (1m to 1D) built from the same minute data. Switch mid-replay, or step in a smaller
  size than the chart to watch a candle form. 4h and daily candles roll at 17:00 New York.
- **Trading**: Sell and Buy buttons at the chart's top left, each showing the price it would get.
  Pressing one asks for the lot size and nothing else, and remembers it for the next trade.
- **Stops and targets on the chart**: every position and pending order shows its entry, stop and target
  as lines with a tag carrying the profit or loss at that level. Drag the SL or TP button off an entry
  tag to create a level, drag a line to move it, press × to remove it or to close the position. A move
  the market does not allow is refused.
- **Realistic fills**: buys fill on the ask using the spread recorded in the data; stops and targets are
  resolved on 1-minute candles whatever timeframe is on screen. If one minute touches both, the stop wins.
- **Cross pairs** convert profit to dollars with the matching dollar pair's price at that minute.
- **Drawing tools** on a left bar built to the measured layout of TradingView's drawing toolbar (52px
  wide, 38px buttons, 28px icons, a narrow arrow on each group opening a sectioned menu), with the same
  group order, section names, tool names and shortcuts. The code and the icons are this project's own.
  - Cursors: cross, dot, arrow, eraser
  - Trend tools: trendline, ray, info line, extended line, trend angle, horizontal line, horizontal ray,
    vertical line, crossline; parallel channel; pitchfork
  - Fibonacci: retracement, trend-based extension
  - Forecasting and measuring: long position, short position; fixed range volume profile; price range,
    date range, date and price range
  - Shapes: brush, highlighter; arrow marker, arrow, arrow mark up, arrow mark down; rectangle, path,
    circle, ellipse, polyline, triangle
  - Annotation: text, price label, flag mark
  - Below the groups: measure, zoom in; magnet (weak or strong), keep drawing, lock, hide (drawings,
    indicators, positions and orders, or all); remove (drawings, indicators, or both)

  Click a drawing to select it, drag it to move it, drag its handles to reshape it, recolour or delete it
  from the bar that appears, or press Delete. Shortcuts: Alt+T trendline, Alt+H horizontal line, Alt+J
  horizontal ray, Alt+V vertical line, Alt+C crossline, Alt+F fib retracement, Alt+Shift+R rectangle,
  Ctrl/Cmd+Z undo, Esc cancel.

  Not built, though TradingView has them: the patterns and icons groups, Gann tools, the other channel,
  pitchfork and Fibonacci variants, position forecast, anchored VWAP and anchored volume profile, rotated rectangle, arc and
  curves, and notes, pins, tables, callouts and comments.
- **Long and short position tools** show target, stop and risk/reward, with amounts for the current lot
  size, and can place the order they describe (market, limit or stop, by where the entry sits).
- **Fixed range volume profile**: click the first and the last candle of a range. The range is cut into
  24 price rows, each drawn as a bar of buying (blue) then selling (yellow) from the left edge, with the
  point of control as a red line and the value area (70% of the activity around it) in stronger colour.
  It only ever counts candles the replay has revealed, so a range that reaches past the replay point
  fills in as you play. On XAU/USD the bars are tick volume from the tick archive, counted at the price
  each update printed at. The forex pairs have no volume data, so there the profile is time at price:
  each 1-minute candle is spread evenly over the rows its range covers and counts as buying when it
  closed up. The text under the profile says which of the two it is showing.
- **Indicators**: EMA 9 and EMA 15.
- **Chart settings** (the gear in the top bar): canvas background, grid, scale text and crosshair
  colours; candle body, wick and border colours for rising and falling candles; five ready-made themes
  (PipRewind, Blue candles, Night, Dark, Black). Saved in the browser and used by every session. The app
  itself is white and blue; the chart starts on a white canvas and can be made dark here.
- **Volume footprint** (chart type menu, XAU/USD only): each candle becomes a column of price rows
  showing sells × buys, with the busiest row outlined and the candle's delta and total underneath. The
  chart zooms in to make the numbers readable and returns to its old zoom when you switch back.
  Spot gold has no exchange volume, so the numbers are tick volume: price updates in the Exness tick
  archive, counted as a buy when the bid ticked up and a sell when it ticked down. They will not match
  a futures footprint. The forex pairs have no tick archive here and stay on candles. Months downloaded
  before this feature are fetched once more the first time the footprint needs them.
- **Time zone**: chosen in the replay bar and remembered across sessions. Kolkata (IST) by default; also
  UTC, London, New York, Dubai, Singapore, Tokyo and the computer's own zone. The chart, the clock, the
  jump-to-date box, the new-session form and the trade times all follow it.
- **Journal and analytics**: notes and tags per trade, win rate, profit factor, expectancy, drawdown,
  R multiples, breakdowns by direction, exit, session and weekday, and CSV export.
- **Sessions** are saved in the browser (localStorage). Rewinding stops at your latest order or trade, so
  a result cannot be undone by going back.

## Data

Forex candles come from FXCM's public market-data archive (`candledata.fxcorporate.com`): one gzipped CSV
per pair and trading week, with bid and ask prices. The archive has no file for a handful of weeks; the
replay skips them.

Gold comes from Exness's public tick archive (`ticks.ex2archive.com`): one zipped CSV of bid/ask ticks per
month, 15 to 110 MB each. The server folds a month into 1-minute candles the first time it is needed, which
takes from a few seconds to about a minute depending on the month and your connection. Because each month
is a large download, gold opens with two weeks of context and loads up to six months of older hourly
history in the background.

Everything downloaded is kept in `.cache/`, so later visits are instant and work offline.

There is no index or crypto data.

## Layout

```
server/        candle API: fxcm.ts and exness.ts (download, parse, cache), api.ts (routes), index.ts (production server)
src/lib/       time and timeframe maths, candle aggregation, trade engine, statistics, indicators
src/replay/    the replay store: data loading, cursor, playback, order actions
src/store/     saved sessions
src/components chart, toolbar, drawing layer, order lines, positions, history, replay bar
src/pages/     landing, sessions dashboard, workspace, analytics
```

Charts are drawn with TradingView Lightweight Charts (Apache 2.0).
