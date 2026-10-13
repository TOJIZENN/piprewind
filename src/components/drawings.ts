import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, Logical, SeriesAttachedParameter, Time } from 'lightweight-charts';
import { FIB_EXTENSION_LEVELS, FIB_LEVELS, handleAnchor, handleCount, type DrawingKind } from '../lib/drawings.ts';
import type { VolumeProfile } from '../lib/volumeProfile.ts';
import { isLight } from '../store/chartStyle.ts';

export interface Shape {
  id: string;
  kind: DrawingKind;
  points: { i: number; p: number }[];
  color: string;
  text?: string;
  selected?: boolean;
  info?: { top?: string; bottom?: string; middle?: string };
  profile?: { data: VolumeProfile; from: number; to: number };
}

export interface Hit {
  id: string;
  handle: number | null;
}

interface Px {
  x: number;
  y: number;
}

const HIT = 6;
const HANDLE = 5;
const FAR = 6000;
const UP = '#089981';
const DOWN = '#f23645';
const PROFILE_UP = '#1e88e5';
const PROFILE_DOWN = '#f5b100';
const PROFILE_POC = '#f23645';
const PROFILE_WIDTH = 0.3;
const PROFILE_MIN_WIDTH = 60;
const FIB_COLORS = ['#787b86', '#f23645', '#f59e0b', '#089981', '#0891b2', '#2563eb', '#787b86'];
const FONT = '11px "JetBrains Mono", ui-monospace, monospace';
const TEXT_FONT = '13px "Inter", system-ui, sans-serif';

const alpha = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

function distanceToSegment(p: Px, a: Px, b: Px): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const k = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy));
}

function extend(a: Px, b: Px, distance: number): Px {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x + ((b.x - a.x) / length) * distance, y: a.y + ((b.y - a.y) / length) * distance };
}

const inBox = (p: Px, a: Px, b: Px, pad = 0): boolean =>
  p.x >= Math.min(a.x, b.x) - pad && p.x <= Math.max(a.x, b.x) + pad && p.y >= Math.min(a.y, b.y) - pad && p.y <= Math.max(a.y, b.y) + pad;

export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate: (() => void) | null = null;
  private shapes: Shape[] = [];
  private background = '#ffffff';
  private width = 0;
  private height = 0;
  private textBoxes = new Map<string, { a: Px; b: Px }>();
  private readonly views: IPrimitivePaneView[];

  constructor(private readonly formatPrice: (price: number) => string) {
    const renderer: IPrimitivePaneRenderer = {
      draw: (target) =>
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          this.width = mediaSize.width;
          this.height = mediaSize.height;
          this.paint(context);
        }),
    };
    this.views = [{ renderer: () => renderer, zOrder: () => 'top' }];
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

  setBackground(color: string): void {
    this.background = color;
    this.requestUpdate?.();
  }

  setShapes(shapes: Shape[]): void {
    this.shapes = shapes;
    this.requestUpdate?.();
  }

  private px(point: { i: number; p: number }): Px | null {
    if (!this.chart || !this.series) return null;
    const scale = this.chart.timeScale();
    const whole = Math.floor(point.i);
    const base = scale.logicalToCoordinate(whole as Logical);
    const y = this.series.priceToCoordinate(point.p);
    return base === null || y === null ? null : { x: base + (point.i - whole) * scale.options().barSpacing, y };
  }

  private pixels(shape: Shape): Px[] | null {
    const out: Px[] = [];
    for (const point of shape.points) {
      const px = this.px(point);
      if (!px) return null;
      out.push(px);
    }
    return out;
  }

  private handles(shape: Shape): Px[] {
    const out: Px[] = [];
    const asAnchors = { kind: shape.kind, points: shape.points.map((pt) => ({ t: pt.i, p: pt.p })) };
    for (let k = 0; k < handleCount(asAnchors); k++) {
      const anchor = handleAnchor(asAnchors, k);
      const px = this.px({ i: anchor.t, p: anchor.p });
      if (px) out.push(px);
    }
    return out;
  }

  private channelCorners(pts: Px[]): Px[] {
    const [a, b, c] = pts;
    const slope = b.x === a.x ? 0 : (b.y - a.y) / (b.x - a.x);
    const offset = c.y - (a.y + slope * (c.x - a.x));
    return [a, b, { x: b.x, y: b.y + offset }, { x: a.x, y: a.y + offset }];
  }

  private pitchforkLines(pts: Px[]): [Px, Px][] {
    const [pivot, b, c] = pts;
    const middle = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    const far = extend(pivot, middle, FAR);
    const dx = far.x - pivot.x;
    const dy = far.y - pivot.y;
    return [
      [pivot, far],
      [b, { x: b.x + dx, y: b.y + dy }],
      [c, { x: c.x + dx, y: c.y + dy }],
      [b, c],
    ];
  }

  private extensionLevels(shape: Shape, pts: Px[]): { left: number; right: number; levels: { level: number; price: number; y: number }[] } {
    const [start, end, pull] = shape.points;
    const levels: { level: number; price: number; y: number }[] = [];
    for (const level of FIB_EXTENSION_LEVELS) {
      const price = pull.p + (end.p - start.p) * level;
      const y = this.series?.priceToCoordinate(price) ?? null;
      if (y !== null) levels.push({ level, price, y });
    }
    return { left: pts[2].x, right: Math.max(pts[0].x, pts[1].x, pts[2].x) + 120, levels };
  }

  private measureBox(kind: DrawingKind, a: Px, b: Px): { a: Px; b: Px } {
    let left = Math.min(a.x, b.x);
    let right = Math.max(a.x, b.x);
    let top = Math.min(a.y, b.y);
    let bottom = Math.max(a.y, b.y);
    if (kind === 'priceRange' && right - left < 60) {
      left = (a.x + b.x) / 2 - 30;
      right = left + 60;
    }
    if (kind === 'dateRange' && bottom - top < 60) {
      top = (a.y + b.y) / 2 - 30;
      bottom = top + 60;
    }
    return { a: { x: left, y: top }, b: { x: right, y: bottom } };
  }

  private profileBox(shape: Shape, a: Px, b: Px): { a: Px; b: Px } {
    const profile = shape.profile;
    const first = profile && this.px({ i: profile.from, p: profile.data.high });
    const last = profile && this.px({ i: profile.to, p: profile.data.low });
    if (!first || !last) return this.measureBox('dateRange', a, b);
    const half = (this.chart?.timeScale().options().barSpacing ?? 6) / 2;
    return { a: { x: first.x - half, y: first.y }, b: { x: last.x + half, y: last.y } };
  }

  private paintProfile(ctx: CanvasRenderingContext2D, shape: Shape, a: Px, b: Px): void {
    const box = this.profileBox(shape, a, b);
    const width = box.b.x - box.a.x;
    ctx.fillStyle = alpha(shape.color, 0.06);
    ctx.fillRect(box.a.x, box.a.y, width, box.b.y - box.a.y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(shape.color, shape.selected ? 0.9 : 0.45);
    this.line(ctx, box.a, { x: box.a.x, y: box.b.y });
    this.line(ctx, { x: box.b.x, y: box.a.y }, box.b);
    const profile = shape.profile?.data;
    if (!profile || !this.series) return;

    const longest = Math.max(width * PROFILE_WIDTH, Math.min(width, PROFILE_MIN_WIDTH));
    const peak = Math.max(...profile.rows.map((row) => row.up + row.down));
    for (const row of profile.rows) {
      const top = this.series.priceToCoordinate(row.top);
      const bottom = this.series.priceToCoordinate(row.bottom);
      if (top === null || bottom === null || row.up + row.down <= 0) continue;
      const height = Math.max(1, bottom - top - (bottom - top > 3 ? 1 : 0));
      const up = (longest * row.up) / peak;
      const down = (longest * row.down) / peak;
      const strength = row.valueArea ? 0.8 : 0.3;
      ctx.fillStyle = alpha(PROFILE_UP, strength);
      ctx.fillRect(box.a.x, top, up, height);
      ctx.fillStyle = alpha(PROFILE_DOWN, strength);
      ctx.fillRect(box.a.x + up, top, down, height);
    }
    const poc = profile.rows[profile.poc];
    const y = this.series.priceToCoordinate((poc.top + poc.bottom) / 2);
    if (y !== null) {
      ctx.strokeStyle = PROFILE_POC;
      ctx.lineWidth = 2;
      this.line(ctx, { x: box.a.x, y }, { x: box.b.x, y });
    }
    if (shape.info?.top) this.label(ctx, shape.info.top, box.a.x, box.b.y + 6, shape.color, 'left', 'top');
    if (shape.info?.bottom) this.label(ctx, shape.info.bottom, box.a.x, box.b.y + 21, shape.color, 'left', 'top');
  }

  private paint(ctx: CanvasRenderingContext2D): void {
    this.textBoxes.clear();
    ctx.save();
    ctx.lineJoin = 'round';
    for (const shape of this.shapes) {
      const pts = this.pixels(shape);
      if (!pts || pts.length === 0) continue;
      ctx.strokeStyle = ctx.fillStyle = shape.color;
      ctx.lineWidth = shape.selected ? 2 : 1.5;
      ctx.setLineDash([]);
      this.paintShape(ctx, shape, pts);
    }
    for (const shape of this.shapes) {
      if (!shape.selected) continue;
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
      for (const h of this.handles(shape)) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, HANDLE, 0, Math.PI * 2);
        ctx.fillStyle = this.background;
        ctx.fill();
        ctx.strokeStyle = shape.color;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private line(ctx: CanvasRenderingContext2D, a: Px, b: Px): void {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: CanvasTextAlign, baseline: CanvasTextBaseline): void {
    ctx.font = FONT;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.background;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  private paintShape(ctx: CanvasRenderingContext2D, shape: Shape, pts: Px[]): void {
    const [a, b] = pts;
    const color = shape.color;
    switch (shape.kind) {
      case 'trend':
        if (b) this.line(ctx, a, b);
        break;
      case 'ray':
        if (b) this.line(ctx, a, extend(a, b, FAR));
        break;
      case 'extended':
        if (b) this.line(ctx, extend(a, b, -FAR), extend(a, b, FAR));
        break;
      case 'arrow': {
        if (!b) break;
        this.line(ctx, a, b);
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - 11 * Math.cos(angle - 0.42), b.y - 11 * Math.sin(angle - 0.42));
        ctx.lineTo(b.x - 11 * Math.cos(angle + 0.42), b.y - 11 * Math.sin(angle + 0.42));
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'hline':
        this.line(ctx, { x: 0, y: a.y }, { x: this.width, y: a.y });
        this.label(ctx, this.formatPrice(shape.points[0].p), 8, a.y - 4, color, 'left', 'bottom');
        break;
      case 'hray':
        this.line(ctx, a, { x: this.width, y: a.y });
        this.label(ctx, this.formatPrice(shape.points[0].p), Math.max(a.x, 0) + 6, a.y - 4, color, 'left', 'bottom');
        break;
      case 'vline':
        this.line(ctx, { x: a.x, y: 0 }, { x: a.x, y: this.height });
        break;
      case 'rect':
        if (!b) break;
        ctx.fillStyle = alpha(color, 0.12);
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        break;
      case 'ellipse':
        if (!b) break;
        ctx.beginPath();
        ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = alpha(color, 0.12);
        ctx.fill();
        ctx.stroke();
        break;
      case 'channel': {
        if (!b) break;
        if (pts.length < 3) {
          this.line(ctx, a, b);
          break;
        }
        const [c1, c2, c3, c4] = this.channelCorners(pts);
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y);
        ctx.lineTo(c2.x, c2.y);
        ctx.lineTo(c3.x, c3.y);
        ctx.lineTo(c4.x, c4.y);
        ctx.closePath();
        ctx.fillStyle = alpha(color, 0.1);
        ctx.fill();
        this.line(ctx, c1, c2);
        this.line(ctx, c4, c3);
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1;
        this.line(ctx, { x: c1.x, y: (c1.y + c4.y) / 2 }, { x: c2.x, y: (c2.y + c3.y) / 2 });
        break;
      }
      case 'fib': {
        if (!b) break;
        const left = Math.min(a.x, b.x);
        const right = Math.max(a.x, b.x);
        const [start, end] = shape.points;
        let previousY: number | null = null;
        FIB_LEVELS.forEach((level, k) => {
          const price = end.p + (start.p - end.p) * level;
          const y = this.series?.priceToCoordinate(price) ?? null;
          if (y === null) return;
          if (previousY !== null) {
            ctx.fillStyle = alpha(FIB_COLORS[k], 0.08);
            ctx.fillRect(left, Math.min(previousY, y), right - left, Math.abs(y - previousY));
          }
          ctx.strokeStyle = FIB_COLORS[k];
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          this.line(ctx, { x: left, y }, { x: right, y });
          this.label(ctx, `${level} (${this.formatPrice(price)})`, left - 6, y, FIB_COLORS[k], 'right', 'middle');
          previousY = y;
        });
        ctx.strokeStyle = alpha(color, 0.7);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        this.line(ctx, a, b);
        break;
      }
      case 'range': {
        if (!b) break;
        ctx.fillStyle = alpha(color, 0.14);
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.lineWidth = 1;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        this.line(ctx, { x: midX, y: a.y }, { x: midX, y: b.y });
        this.line(ctx, { x: a.x, y: midY }, { x: b.x, y: midY });
        const below = b.y >= a.y;
        const y = below ? Math.max(a.y, b.y) + 6 : Math.min(a.y, b.y) - 6;
        if (shape.info?.top) this.label(ctx, shape.info.top, midX, below ? y : y - 14, color, 'center', below ? 'top' : 'bottom');
        if (shape.info?.bottom) this.label(ctx, shape.info.bottom, midX, below ? y + 14 : y, color, 'center', below ? 'top' : 'bottom');
        break;
      }
      case 'long':
      case 'short': {
        if (pts.length < 3) break;
        const [entry, stop, target] = pts;
        const width = stop.x - entry.x;
        ctx.fillStyle = alpha(UP, 0.2);
        ctx.fillRect(entry.x, entry.y, width, target.y - entry.y);
        ctx.fillStyle = alpha(DOWN, 0.2);
        ctx.fillRect(entry.x, entry.y, width, stop.y - entry.y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = alpha(UP, 0.9);
        this.line(ctx, { x: entry.x, y: target.y }, { x: stop.x, y: target.y });
        ctx.strokeStyle = alpha(DOWN, 0.9);
        this.line(ctx, { x: entry.x, y: stop.y }, { x: stop.x, y: stop.y });
        ctx.strokeStyle = '#787b86';
        this.line(ctx, entry, { x: stop.x, y: entry.y });
        const midX = entry.x + width / 2;
        const targetAbove = target.y < entry.y;
        if (shape.info?.top) this.label(ctx, shape.info.top, midX, targetAbove ? target.y - 5 : target.y + 5, UP, 'center', targetAbove ? 'bottom' : 'top');
        if (shape.info?.bottom) this.label(ctx, shape.info.bottom, midX, targetAbove ? stop.y + 5 : stop.y - 5, DOWN, 'center', targetAbove ? 'top' : 'bottom');
        if (shape.info?.middle) this.label(ctx, shape.info.middle, midX, entry.y + (targetAbove ? -5 : 5), isLight(this.background) ? '#131722' : '#e8ebf1', 'center', targetAbove ? 'bottom' : 'top');
        break;
      }
      case 'info':
        if (!b) break;
        this.line(ctx, a, b);
        if (shape.info?.top) this.label(ctx, shape.info.top, (a.x + b.x) / 2, Math.min(a.y, b.y) - 6, color, 'center', 'bottom');
        break;
      case 'angle': {
        if (!b) break;
        this.line(ctx, a, b);
        const radians = Math.atan2(a.y - b.y, b.x - a.x);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        this.line(ctx, a, { x: a.x + 46, y: a.y });
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(a.x, a.y, 30, 0, -radians, radians > 0);
        ctx.stroke();
        this.label(ctx, `${((radians * 180) / Math.PI).toFixed(1)}°`, a.x + 52, a.y, color, 'left', 'middle');
        break;
      }
      case 'crossline':
        this.line(ctx, { x: 0, y: a.y }, { x: this.width, y: a.y });
        this.line(ctx, { x: a.x, y: 0 }, { x: a.x, y: this.height });
        this.label(ctx, this.formatPrice(shape.points[0].p), 8, a.y - 4, color, 'left', 'bottom');
        break;
      case 'pitchfork':
        if (!b) break;
        if (pts.length < 3) this.line(ctx, a, b);
        else for (const [from, to] of this.pitchforkLines(pts)) this.line(ctx, from, to);
        break;
      case 'fibext': {
        if (!b) break;
        ctx.lineWidth = 1;
        ctx.strokeStyle = alpha(color, 0.7);
        ctx.setLineDash([4, 4]);
        this.line(ctx, a, b);
        if (pts.length < 3) break;
        this.line(ctx, b, pts[2]);
        ctx.setLineDash([]);
        const { left, right, levels } = this.extensionLevels(shape, pts);
        levels.forEach(({ level, price, y }, k) => {
          const tint = FIB_COLORS[(k + 1) % FIB_COLORS.length];
          ctx.strokeStyle = tint;
          ctx.lineWidth = 1;
          this.line(ctx, { x: left, y }, { x: right, y });
          this.label(ctx, `${level} (${this.formatPrice(price)})`, right + 6, y, tint, 'left', 'middle');
        });
        break;
      }
      case 'priceRange':
      case 'dateRange': {
        if (!b) break;
        const box = this.measureBox(shape.kind, a, b);
        ctx.fillStyle = alpha(color, 0.14);
        ctx.fillRect(box.a.x, box.a.y, box.b.x - box.a.x, box.b.y - box.a.y);
        ctx.lineWidth = 1;
        const midX = (box.a.x + box.b.x) / 2;
        const midY = (box.a.y + box.b.y) / 2;
        if (shape.kind === 'priceRange') {
          this.line(ctx, { x: box.a.x, y: a.y }, { x: box.b.x, y: a.y });
          this.line(ctx, { x: box.a.x, y: b.y }, { x: box.b.x, y: b.y });
          this.line(ctx, { x: midX, y: a.y }, { x: midX, y: b.y });
          const down = b.y >= a.y;
          if (shape.info?.top) this.label(ctx, shape.info.top, midX, down ? b.y + 6 : b.y - 6, color, 'center', down ? 'top' : 'bottom');
        } else {
          this.line(ctx, { x: a.x, y: box.a.y }, { x: a.x, y: box.b.y });
          this.line(ctx, { x: b.x, y: box.a.y }, { x: b.x, y: box.b.y });
          this.line(ctx, { x: a.x, y: midY }, { x: b.x, y: midY });
          if (shape.info?.top) this.label(ctx, shape.info.top, midX, box.b.y + 6, color, 'center', 'top');
        }
        break;
      }
      case 'volumeProfile':
        if (b) this.paintProfile(ctx, shape, a, b);
        break;
      case 'brush':
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
        ctx.stroke();
        break;
      case 'arrowUp':
      case 'arrowDown': {
        const s = shape.kind === 'arrowUp' ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + 7, a.y + s * 9);
        ctx.lineTo(a.x + 2.5, a.y + s * 9);
        ctx.lineTo(a.x + 2.5, a.y + s * 20);
        ctx.lineTo(a.x - 2.5, a.y + s * 20);
        ctx.lineTo(a.x - 2.5, a.y + s * 9);
        ctx.lineTo(a.x - 7, a.y + s * 9);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'circle':
        if (!b) break;
        ctx.beginPath();
        ctx.arc(a.x, a.y, Math.hypot(b.x - a.x, b.y - a.y), 0, Math.PI * 2);
        ctx.fillStyle = alpha(color, 0.12);
        ctx.fill();
        ctx.stroke();
        break;
      case 'triangle':
        if (!b) break;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
        if (pts.length === 3) {
          ctx.closePath();
          ctx.fillStyle = alpha(color, 0.12);
          ctx.fill();
        }
        ctx.stroke();
        break;
      case 'priceLabel': {
        const text = this.formatPrice(shape.points[0].p);
        ctx.font = FONT;
        const width = ctx.measureText(text).width + 12;
        const box = { a: { x: a.x + 10, y: a.y - 28 }, b: { x: a.x + 10 + width, y: a.y - 10 } };
        ctx.lineWidth = 1;
        this.line(ctx, a, { x: box.a.x, y: box.b.y });
        ctx.fillStyle = color;
        ctx.fillRect(box.a.x, box.a.y, width, 18);
        ctx.fillStyle = this.background;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, box.a.x + 6, box.a.y + 9);
        this.textBoxes.set(shape.id, box);
        break;
      }
      case 'highlighter':
        ctx.lineCap = 'round';
        ctx.lineWidth = 16;
        ctx.strokeStyle = alpha(color, 0.35);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
        ctx.stroke();
        break;
      case 'arrowMarker': {
        if (!b) break;
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        this.line(ctx, a, { x: b.x - 12 * Math.cos(angle), y: b.y - 12 * Math.sin(angle) });
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - 18 * Math.cos(angle - 0.5), b.y - 18 * Math.sin(angle - 0.5));
        ctx.lineTo(b.x - 18 * Math.cos(angle + 0.5), b.y - 18 * Math.sin(angle + 0.5));
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'path':
      case 'polyline': {
        if (!b) break;
        const last = pts[pts.length - 1];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
        if (shape.kind === 'polyline' && pts.length > 2) {
          ctx.closePath();
          ctx.fillStyle = alpha(color, 0.12);
          ctx.fill();
          ctx.stroke();
          break;
        }
        ctx.stroke();
        if (shape.kind === 'path') {
          const before = pts[pts.length - 2];
          const angle = Math.atan2(last.y - before.y, last.x - before.x);
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(last.x - 10 * Math.cos(angle - 0.42), last.y - 10 * Math.sin(angle - 0.42));
          ctx.lineTo(last.x - 10 * Math.cos(angle + 0.42), last.y - 10 * Math.sin(angle + 0.42));
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'flag':
        ctx.lineWidth = 1.5;
        this.line(ctx, a, { x: a.x, y: a.y - 24 });
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - 24);
        ctx.lineTo(a.x + 15, a.y - 19);
        ctx.lineTo(a.x, a.y - 13);
        ctx.closePath();
        ctx.fill();
        break;
      case 'text': {
        const text = shape.text || 'Text';
        ctx.font = TEXT_FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = this.background;
        ctx.strokeText(text, a.x, a.y);
        ctx.fillStyle = shape.text ? color : alpha(color, 0.5);
        ctx.fillText(text, a.x, a.y);
        const width = ctx.measureText(text).width;
        this.textBoxes.set(shape.id, { a: { x: a.x, y: a.y - 9 }, b: { x: a.x + width, y: a.y + 9 } });
        break;
      }
    }
  }

  private overBody(shape: Shape, pts: Px[], p: Px): boolean {
    const [a, b] = pts;
    switch (shape.kind) {
      case 'trend':
      case 'arrow':
        return !!b && distanceToSegment(p, a, b) <= HIT;
      case 'ray':
        return !!b && distanceToSegment(p, a, extend(a, b, FAR)) <= HIT;
      case 'extended':
        return !!b && distanceToSegment(p, extend(a, b, -FAR), extend(a, b, FAR)) <= HIT;
      case 'hline':
        return Math.abs(p.y - a.y) <= HIT;
      case 'hray':
        return Math.abs(p.y - a.y) <= HIT && p.x >= a.x - HIT;
      case 'vline':
        return Math.abs(p.x - a.x) <= HIT;
      case 'rect':
      case 'range':
        return !!b && inBox(p, a, b, HIT);
      case 'ellipse': {
        if (!b) return false;
        const rx = Math.abs(b.x - a.x) / 2 + HIT;
        const ry = Math.abs(b.y - a.y) / 2 + HIT;
        return ((p.x - (a.x + b.x) / 2) / rx) ** 2 + ((p.y - (a.y + b.y) / 2) / ry) ** 2 <= 1;
      }
      case 'fib':
        return !!b && inBox(p, a, b, HIT);
      case 'channel': {
        if (pts.length < 3) return !!b && distanceToSegment(p, a, b) <= HIT;
        const corners = this.channelCorners(pts);
        let sign = 0;
        for (let k = 0; k < 4; k++) {
          const c = corners[k];
          const d = corners[(k + 1) % 4];
          const cross = (d.x - c.x) * (p.y - c.y) - (d.y - c.y) * (p.x - c.x);
          if (cross === 0) continue;
          if (sign === 0) sign = Math.sign(cross);
          else if (Math.sign(cross) !== sign) return distanceToSegment(p, corners[0], corners[1]) <= HIT || distanceToSegment(p, corners[3], corners[2]) <= HIT;
        }
        return true;
      }
      case 'long':
      case 'short':
        return pts.length >= 3 && inBox(p, { x: pts[0].x, y: pts[1].y }, { x: pts[1].x, y: pts[2].y }, HIT);
      case 'info':
      case 'angle':
        return !!b && distanceToSegment(p, a, b) <= HIT;
      case 'crossline':
        return Math.abs(p.y - a.y) <= HIT || Math.abs(p.x - a.x) <= HIT;
      case 'pitchfork':
        if (pts.length < 3) return !!b && distanceToSegment(p, a, b) <= HIT;
        return this.pitchforkLines(pts).some(([from, to]) => distanceToSegment(p, from, to) <= HIT);
      case 'fibext': {
        if (!b) return false;
        if (distanceToSegment(p, a, b) <= HIT) return true;
        if (pts.length < 3) return false;
        if (distanceToSegment(p, b, pts[2]) <= HIT) return true;
        const { left, right, levels } = this.extensionLevels(shape, pts);
        return p.x >= left - HIT && p.x <= right + HIT && levels.some(({ y }) => Math.abs(p.y - y) <= HIT);
      }
      case 'priceRange':
      case 'dateRange': {
        if (!b) return false;
        const box = this.measureBox(shape.kind, a, b);
        return inBox(p, box.a, box.b, HIT);
      }
      case 'volumeProfile': {
        if (!b) return false;
        const box = this.profileBox(shape, a, b);
        return inBox(p, box.a, box.b, HIT);
      }
      case 'brush':
        for (let k = 1; k < pts.length; k++) if (distanceToSegment(p, pts[k - 1], pts[k]) <= HIT) return true;
        return false;
      case 'arrowUp':
        return inBox(p, { x: a.x - 8, y: a.y }, { x: a.x + 8, y: a.y + 20 }, 3);
      case 'arrowDown':
        return inBox(p, { x: a.x - 8, y: a.y - 20 }, { x: a.x + 8, y: a.y }, 3);
      case 'circle':
        return !!b && Math.hypot(p.x - a.x, p.y - a.y) <= Math.hypot(b.x - a.x, b.y - a.y) + HIT;
      case 'triangle': {
        if (pts.length < 3) return !!b && distanceToSegment(p, a, b) <= HIT;
        const side = (u: Px, v: Px): number => Math.sign((v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x));
        const sides = [side(pts[0], pts[1]), side(pts[1], pts[2]), side(pts[2], pts[0])].filter((v) => v !== 0);
        return sides.every((v) => v === sides[0]) || pts.some((v, k) => distanceToSegment(p, v, pts[(k + 1) % 3]) <= HIT);
      }
      case 'priceLabel': {
        const box = this.textBoxes.get(shape.id);
        return !!box && inBox(p, box.a, box.b, 3);
      }
      case 'highlighter':
        for (let k = 1; k < pts.length; k++) if (distanceToSegment(p, pts[k - 1], pts[k]) <= 10) return true;
        return false;
      case 'arrowMarker':
        return !!b && distanceToSegment(p, a, b) <= HIT + 2;
      case 'path':
        for (let k = 1; k < pts.length; k++) if (distanceToSegment(p, pts[k - 1], pts[k]) <= HIT) return true;
        return false;
      case 'polyline': {
        let inside = false;
        for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) {
          if (distanceToSegment(p, pts[j], pts[k]) <= HIT) return true;
          if (pts[k].y > p.y !== pts[j].y > p.y && p.x < ((pts[j].x - pts[k].x) * (p.y - pts[k].y)) / (pts[j].y - pts[k].y) + pts[k].x) inside = !inside;
        }
        return inside;
      }
      case 'flag':
        return inBox(p, { x: a.x - 4, y: a.y - 26 }, { x: a.x + 16, y: a.y }, 2);
      case 'text': {
        const box = this.textBoxes.get(shape.id);
        return !!box && inBox(p, box.a, box.b, 3);
      }
    }
  }

  findAt(x: number, y: number): Hit | null {
    const p = { x, y };
    for (const shape of this.shapes) {
      if (!shape.selected) continue;
      const handles = this.handles(shape);
      for (let k = 0; k < handles.length; k++) if (Math.hypot(p.x - handles[k].x, p.y - handles[k].y) <= HANDLE + 4) return { id: shape.id, handle: k };
    }
    for (let k = this.shapes.length - 1; k >= 0; k--) {
      const shape = this.shapes[k];
      const pts = this.pixels(shape);
      if (pts && pts.length > 0 && this.overBody(shape, pts, p)) return { id: shape.id, handle: null };
    }
    return null;
  }
}
