import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, Logical, SeriesAttachedParameter, Time } from 'lightweight-charts';
import type { Bar } from '../lib/bars.ts';
import { rowSizeFor, toRows, type Profile } from '../lib/footprint.ts';

export interface FootprintInput {
  bars: Bar[];
  profileOf(index: number): Profile | null;
  step: number;
  up: string;
  down: string;
  text: string;
  background: string;
  notice: string | null;
}

export const FOOTPRINT_MIN_SPACING = 78;
export const FOOTPRINT_SPACING = 112;
const MIN_ROW_PX = 13;
const SUMMARY_DELTA_Y = 54;
const SUMMARY_TOTAL_Y = 40;
const FONT = '10px "JetBrains Mono", ui-monospace, monospace';
const NOTE_FONT = '12px "Inter", system-ui, sans-serif';

const alpha = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return hex.length === 7 && !Number.isNaN(n) ? `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})` : hex;
};

export class FootprintPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate: (() => void) | null = null;
  private input: FootprintInput | null = null;
  private readonly views: IPrimitivePaneView[];

  constructor() {
    const renderer: IPrimitivePaneRenderer = {
      draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => this.paint(context, mediaSize.width, mediaSize.height)),
    };
    this.views = [{ renderer: () => renderer, zOrder: () => 'normal' }];
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Candlestick'>;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = this.series = this.requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }

  set(input: FootprintInput | null): void {
    this.input = input;
    this.requestUpdate?.();
  }

  private paint(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const input = this.input;
    const chart = this.chart;
    const series = this.series;
    if (!input || !chart || !series || input.bars.length === 0) return;
    const scale = chart.timeScale();
    const range = scale.getVisibleLogicalRange();
    if (!range) return;
    const spacing = scale.options().barSpacing;
    const wide = spacing >= FOOTPRINT_MIN_SPACING;
    const first = Math.max(0, Math.floor(range.from));
    const last = Math.min(input.bars.length - 1, Math.ceil(range.to));
    const y = (price: number): number => series.priceToCoordinate(price) ?? NaN;

    const reference = input.bars[last]?.c ?? 0;
    const size = rowSizeFor(Math.abs(y(reference) - y(reference + input.step)), MIN_ROW_PX);

    ctx.save();
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    for (let i = first; i <= last; i++) {
      const bar = input.bars[i];
      const x = scale.logicalToCoordinate(i as Logical);
      if (x === null) continue;
      const color = bar.c >= bar.o ? input.up : input.down;
      const top = Math.min(y(bar.o), y(bar.c));
      const body = Math.max(1, Math.abs(y(bar.o) - y(bar.c)));

      const profile = wide ? input.profileOf(i) : null;
      if (profile) {
        const half = spacing / 2 - 3;
        const view = toRows(profile, size);
        view.rows.forEach((row, k) => {
          const rowTop = y((row.level + size - 0.5) * input.step);
          const rowHeight = y((row.level - 0.5) * input.step) - rowTop;
          if (!(rowHeight > 0)) return;
          const shade = (count: number): number => (view.peak > 0 ? 0.07 + 0.5 * (count / view.peak) : 0.07);
          ctx.fillStyle = alpha(input.down, shade(row.sell));
          ctx.fillRect(x - half, rowTop, half - 4, rowHeight - 1);
          ctx.fillStyle = alpha(input.up, shade(row.buy));
          ctx.fillRect(x + 4, rowTop, half - 4, rowHeight - 1);
          if (k === view.poc) {
            ctx.strokeStyle = input.text;
            ctx.lineWidth = 1;
            ctx.strokeRect(x - half + 0.5, rowTop + 0.5, half * 2 - 1, rowHeight - 2);
          }
          if (rowHeight >= 11) {
            ctx.fillStyle = input.text;
            ctx.textAlign = 'right';
            ctx.fillText(String(row.sell), x - 8, rowTop + rowHeight / 2);
            ctx.textAlign = 'left';
            ctx.fillText(String(row.buy), x + 8, rowTop + rowHeight / 2);
          }
        });

        const delta = profile.buy - profile.sell;
        ctx.textAlign = 'center';
        ctx.fillStyle = delta >= 0 ? input.up : input.down;
        ctx.fillText(`${delta > 0 ? '+' : ''}${delta}`, x, height - SUMMARY_DELTA_Y);
        ctx.fillStyle = input.text;
        ctx.fillText(String(profile.buy + profile.sell), x, height - SUMMARY_TOTAL_Y);
      }

      const bodyWidth = wide ? 5 : Math.max(1, Math.floor(spacing * 0.7));
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x) - 0.5, y(bar.h), 1, Math.max(1, y(bar.l) - y(bar.h)));
      ctx.fillRect(Math.round(x - bodyWidth / 2), top, bodyWidth, body);
    }

    ctx.font = FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = input.text;
    if (wide) {
      ctx.globalAlpha = 0.7;
      ctx.fillText('Delta', 6, height - SUMMARY_DELTA_Y);
      ctx.fillText('Total', 6, height - SUMMARY_TOTAL_Y);
      ctx.globalAlpha = 1;
    }

    const notice = input.notice ?? (wide ? null : 'Zoom in on the time axis to read the footprint numbers.');
    if (notice) {
      ctx.font = NOTE_FONT;
      ctx.textAlign = 'center';
      const boxWidth = ctx.measureText(notice).width + 24;
      ctx.fillStyle = alpha(input.background, 0.9);
      ctx.fillRect(width / 2 - boxWidth / 2, 86, boxWidth, 26);
      ctx.strokeStyle = alpha(input.text, 0.4);
      ctx.strokeRect(width / 2 - boxWidth / 2 + 0.5, 86.5, boxWidth - 1, 25);
      ctx.fillStyle = input.text;
      ctx.fillText(notice, width / 2, 99);
    }
    ctx.restore();
  }
}
