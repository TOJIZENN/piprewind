import { describe, expect, it } from 'vitest';
import { handleAnchor, handleCount, moveAll, moveHandle, newPosition, TOOL_GROUPS, TOOL_SHORTCUTS, TOOLS, upgradeDrawing } from './drawings.ts';

const STEP = 0.01;

describe('tool catalogue', () => {
  it('lists every grouped tool once, and every tool has a definition', () => {
    const grouped = TOOL_GROUPS.flatMap((g) => g.sections.flatMap((section) => section.tools));
    expect(new Set(grouped).size).toBe(grouped.length);
    for (const id of grouped) expect(TOOLS[id].id).toBe(id);
    expect(new Set([...grouped, 'measure', 'zoom'])).toEqual(new Set(Object.keys(TOOLS)));
    for (const { tool } of TOOL_SHORTCUTS) expect(TOOLS[tool].shortcut).toBeDefined();
  });
});

describe('position tools', () => {
  const long = { kind: 'long' as const, points: newPosition('long', { t: 1000, p: 100 }, 5, 1600) };
  const short = { kind: 'short' as const, points: newPosition('short', { t: 1000, p: 100 }, 5, 1600) };

  it('start with the stop one distance away and the target two, on the right sides', () => {
    expect(long.points).toEqual([{ t: 1000, p: 100 }, { t: 1600, p: 95 }, { t: 1600, p: 110 }]);
    expect(short.points).toEqual([{ t: 1000, p: 100 }, { t: 1600, p: 105 }, { t: 1600, p: 90 }]);
  });

  it('show four handles: entry, stop, target and the right edge', () => {
    expect(handleCount(long)).toBe(4);
    expect([0, 1, 2, 3].map((k) => handleAnchor(long, k))).toEqual([{ t: 1000, p: 100 }, { t: 1000, p: 95 }, { t: 1000, p: 110 }, { t: 1600, p: 100 }]);
  });

  it('move the stop and target in price only', () => {
    expect(moveHandle(long, 1, { t: 5000, p: 97 }, STEP)[1]).toEqual({ t: 1600, p: 97 });
    expect(moveHandle(long, 2, { t: 5000, p: 120 }, STEP)[2]).toEqual({ t: 1600, p: 120 });
  });

  it('never let the stop or target cross the entry', () => {
    expect(moveHandle(long, 1, { t: 0, p: 101 }, STEP)[1].p).toBe(95);
    expect(moveHandle(long, 2, { t: 0, p: 99 }, STEP)[2].p).toBe(110);
    expect(moveHandle(short, 1, { t: 0, p: 99 }, STEP)[1].p).toBe(105);
    expect(moveHandle(short, 2, { t: 0, p: 101 }, STEP)[2].p).toBe(90);
    expect(moveHandle(long, 0, { t: 1000, p: 94 }, STEP)[0].p).toBe(100);
  });

  it('widen from the right edge without changing any price', () => {
    const moved = moveHandle(long, 3, { t: 2400, p: 123 }, STEP);
    expect(moved.map((a) => a.p)).toEqual([100, 95, 110]);
    expect([moved[1].t, moved[2].t]).toEqual([2400, 2400]);
    expect(moveHandle(long, 3, { t: 200, p: 0 }, STEP)[1].t).toBe(1000);
  });
});

describe('moving anchors', () => {
  it('moves box corners, including the two that were not clicked', () => {
    const rect = { kind: 'rect' as const, points: [{ t: 10, p: 1 }, { t: 20, p: 2 }] };
    expect(handleAnchor(rect, 2)).toEqual({ t: 10, p: 2 });
    expect(moveHandle(rect, 2, { t: 5, p: 3 }, STEP)).toEqual([{ t: 5, p: 1 }, { t: 20, p: 3 }]);
    expect(moveHandle(rect, 3, { t: 25, p: 0 }, STEP)).toEqual([{ t: 10, p: 0 }, { t: 25, p: 2 }]);
  });

  it('keeps a horizontal line horizontal and a vertical line vertical', () => {
    expect(moveHandle({ kind: 'hline', points: [{ t: 10, p: 1 }] }, 0, { t: 99, p: 5 }, STEP)).toEqual([{ t: 10, p: 5 }]);
    expect(moveHandle({ kind: 'vline', points: [{ t: 10, p: 1 }] }, 0, { t: 99, p: 5 }, STEP)).toEqual([{ t: 99, p: 1 }]);
  });

  it('gives a freehand stroke no handles, so it only moves whole', () => {
    expect(handleCount({ kind: 'brush', points: [{ t: 1, p: 1 }, { t: 2, p: 2 }, { t: 3, p: 1 }] })).toBe(0);
    expect(handleCount({ kind: 'highlighter', points: [{ t: 1, p: 1 }, { t: 2, p: 2 }] })).toBe(0);
    expect(handleCount({ kind: 'path', points: [{ t: 1, p: 1 }, { t: 2, p: 2 }, { t: 3, p: 1 }] })).toBe(3);
  });

  it('shifts a whole drawing by price and by the time mapping it is given', () => {
    const trend = { kind: 'trend' as const, points: [{ t: 10, p: 1 }, { t: 20, p: 2 }] };
    expect(moveAll(trend, 0.5, (t) => t + 100)).toEqual([{ t: 110, p: 1.5 }, { t: 120, p: 2.5 }]);
  });
});

describe('upgradeDrawing', () => {
  it('converts drawings saved with two fixed anchors', () => {
    expect(upgradeDrawing({ id: 'a', kind: 'hline', t1: 5, p1: 1.2, t2: 5, p2: 1.2 })).toEqual({ id: 'a', kind: 'hline', points: [{ t: 5, p: 1.2 }] });
    expect(upgradeDrawing({ id: 'b', kind: 'rect', t1: 5, p1: 1, t2: 9, p2: 2 })).toEqual({ id: 'b', kind: 'rect', points: [{ t: 5, p: 1 }, { t: 9, p: 2 }] });
  });

  it('keeps current drawings and drops anything it cannot read', () => {
    const current = { id: 'c', kind: 'fib', points: [{ t: 1, p: 1 }, { t: 2, p: 2 }], color: '#fff' };
    expect(upgradeDrawing(current)).toBe(current);
    expect(upgradeDrawing({ id: 'd', kind: 'spiral', points: [] })).toBeNull();
    expect(upgradeDrawing(null)).toBeNull();
  });
});
