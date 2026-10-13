export type FootprintRow = number[];

export interface Profile {
  levels: Map<number, [number, number]>;
  buy: number;
  sell: number;
}

export const emptyProfile = (): Profile => ({ levels: new Map(), buy: 0, sell: 0 });

export function addMinute(profile: Profile, row: FootprintRow): void {
  const lowest = row[1];
  for (let k = 2; k + 1 < row.length; k += 2) {
    const buy = row[k];
    const sell = row[k + 1];
    if (buy === 0 && sell === 0) continue;
    const level = lowest + (k - 2) / 2;
    const cell = profile.levels.get(level);
    if (cell) {
      cell[0] += buy;
      cell[1] += sell;
    } else profile.levels.set(level, [buy, sell]);
    profile.buy += buy;
    profile.sell += sell;
  }
}

export interface FootprintCell {
  level: number;
  buy: number;
  sell: number;
}

export interface FootprintView {
  rows: FootprintCell[];
  poc: number;
  peak: number;
}

export function toRows(profile: Profile, size: number): FootprintView {
  const grouped = new Map<number, FootprintCell>();
  for (const [level, [buy, sell]] of profile.levels) {
    const start = Math.floor(level / size) * size;
    const cell = grouped.get(start);
    if (cell) {
      cell.buy += buy;
      cell.sell += sell;
    } else grouped.set(start, { level: start, buy, sell });
  }
  const rows = [...grouped.values()].sort((a, b) => b.level - a.level);
  let poc = -1;
  let most = -1;
  let peak = 0;
  rows.forEach((row, k) => {
    if (row.buy + row.sell > most) {
      most = row.buy + row.sell;
      poc = k;
    }
    peak = Math.max(peak, row.buy, row.sell);
  });
  return { rows, poc, peak };
}

const ROW_SIZES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

export function rowSizeFor(pxPerLevel: number, minPx: number): number {
  const needed = pxPerLevel > 0 ? minPx / pxPerLevel : Infinity;
  return ROW_SIZES.find((size) => size >= needed) ?? ROW_SIZES[ROW_SIZES.length - 1];
}
