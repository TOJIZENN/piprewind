import type { Bar } from './bars.ts';
import type { FootprintRow } from './footprint.ts';

export interface ProfileRow {
  bottom: number;
  top: number;
  up: number;
  down: number;
  valueArea: boolean;
}

export interface VolumeProfile {
  rows: ProfileRow[];
  poc: number;
  low: number;
  high: number;
  up: number;
  down: number;
}

export const PROFILE_ROWS = 24;
export const VALUE_AREA = 0.7;

export function extent(bars: Bar[], from: number, to: number, into: { low: number; high: number } | null = null): { low: number; high: number } | null {
  let out = into;
  for (let i = from; i < to; i++) {
    if (!out) out = { low: bars[i].l, high: bars[i].h };
    else {
      if (bars[i].l < out.low) out.low = bars[i].l;
      if (bars[i].h > out.high) out.high = bars[i].h;
    }
  }
  return out;
}

export class ProfileBuilder {
  private readonly up: number[];
  private readonly down: number[];
  private readonly size: number;

  constructor(
    private readonly low: number,
    private readonly high: number,
    private readonly count = PROFILE_ROWS,
  ) {
    this.up = new Array<number>(count).fill(0);
    this.down = new Array<number>(count).fill(0);
    this.size = (high - low) / count;
  }

  private row(price: number): number {
    if (this.size <= 0) return 0;
    return Math.max(0, Math.min(this.count - 1, Math.floor((price - this.low) / this.size)));
  }

  addBar(bar: Bar, weight: number): void {
    const side = bar.c >= bar.o ? this.up : this.down;
    const low = Math.max(bar.l, this.low);
    const high = Math.min(bar.h, this.high);
    if (high <= low || this.size <= 0) {
      side[this.row(bar.c)] += weight;
      return;
    }
    const last = this.row(high);
    for (let k = this.row(low); k <= last; k++) {
      const bottom = this.low + k * this.size;
      const overlap = Math.min(high, bottom + this.size) - Math.max(low, bottom);
      if (overlap > 0) side[k] += (weight * overlap) / (high - low);
    }
  }

  addTicks(row: FootprintRow, step: number): void {
    const lowest = row[1];
    for (let k = 2; k + 1 < row.length; k += 2) {
      const index = this.row((lowest + (k - 2) / 2) * step);
      this.up[index] += row[k];
      this.down[index] += row[k + 1];
    }
  }

  build(share = VALUE_AREA): VolumeProfile | null {
    const totals = this.up.map((up, k) => up + this.down[k]);
    const total = totals.reduce((sum, x) => sum + x, 0);
    if (total <= 0) return null;
    let poc = 0;
    totals.forEach((x, k) => {
      if (x > totals[poc]) poc = k;
    });

    let below = poc;
    let above = poc;
    let held = totals[poc];
    const pair = (from: number, step: number): number => (totals[from + step] ?? 0) + (totals[from + 2 * step] ?? 0);
    while (held < share * total && (below > 0 || above < this.count - 1)) {
      const up = above < this.count - 1 ? pair(above, 1) : -1;
      const down = below > 0 ? pair(below, -1) : -1;
      if (up >= down) {
        above = Math.min(this.count - 1, above + 2);
        held += up;
      } else {
        below = Math.max(0, below - 2);
        held += down;
      }
    }

    const rows = totals.map((_, k) => ({ bottom: this.low + k * this.size, top: this.low + (k + 1) * this.size, up: this.up[k], down: this.down[k], valueArea: k >= below && k <= above }));
    return { rows, poc, low: this.low, high: this.high, up: this.up.reduce((sum, x) => sum + x, 0), down: this.down.reduce((sum, x) => sum + x, 0) };
  }
}

export function fmtVolume(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString('en-US');
}
