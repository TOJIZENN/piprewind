export type DrawingKind =
  | 'trend'
  | 'ray'
  | 'info'
  | 'extended'
  | 'angle'
  | 'hline'
  | 'hray'
  | 'vline'
  | 'crossline'
  | 'channel'
  | 'pitchfork'
  | 'fib'
  | 'fibext'
  | 'long'
  | 'short'
  | 'priceRange'
  | 'dateRange'
  | 'range'
  | 'volumeProfile'
  | 'brush'
  | 'highlighter'
  | 'arrowMarker'
  | 'arrow'
  | 'arrowUp'
  | 'arrowDown'
  | 'rect'
  | 'path'
  | 'circle'
  | 'ellipse'
  | 'polyline'
  | 'triangle'
  | 'text'
  | 'priceLabel'
  | 'flag';

export interface Anchor {
  t: number;
  p: number;
}

export interface Drawing {
  id: string;
  kind: DrawingKind;
  points: Anchor[];
  color?: string;
  text?: string;
}

export type ToolId = 'cross' | 'dot' | 'pointer' | 'erase' | 'measure' | 'zoom' | DrawingKind;

export type CursorTool = 'cross' | 'dot' | 'pointer';

export interface ToolDef {
  id: ToolId;
  label: string;
  clicks: number;
  drag?: boolean;
  multi?: boolean;
  hint?: string;
  shortcut?: string;
}

export const TOOLS: Record<ToolId, ToolDef> = {
  cross: { id: 'cross', label: 'Cross', clicks: 0 },
  dot: { id: 'dot', label: 'Dot', clicks: 0 },
  pointer: { id: 'pointer', label: 'Arrow', clicks: 0 },
  erase: { id: 'erase', label: 'Eraser', clicks: 0, hint: 'Click a drawing to remove it.' },
  measure: { id: 'measure', label: 'Measure', clicks: 2, hint: 'Click two points to measure between them.' },
  zoom: { id: 'zoom', label: 'Zoom in', clicks: 2, hint: 'Click the start and the end of the stretch to zoom into.' },
  trend: { id: 'trend', label: 'Trendline', clicks: 2, hint: 'Click two points to draw a trend line.', shortcut: 'Alt+T' },
  ray: { id: 'ray', label: 'Ray', clicks: 2, hint: 'Click the start, then a second point the ray passes through.' },
  info: { id: 'info', label: 'Info line', clicks: 2, hint: 'Click two points; the line reports the move between them.' },
  extended: { id: 'extended', label: 'Extended line', clicks: 2, hint: 'Click two points; the line runs on in both directions.' },
  angle: { id: 'angle', label: 'Trend angle', clicks: 2, hint: 'Click two points; the line shows its angle.' },
  hline: { id: 'hline', label: 'Horizontal line', clicks: 1, hint: 'Click to place a horizontal line.', shortcut: 'Alt+H' },
  hray: { id: 'hray', label: 'Horizontal ray', clicks: 1, hint: 'Click where the horizontal ray starts.', shortcut: 'Alt+J' },
  vline: { id: 'vline', label: 'Vertical line', clicks: 1, hint: 'Click to place a vertical line.', shortcut: 'Alt+V' },
  crossline: { id: 'crossline', label: 'Crossline', clicks: 1, hint: 'Click to place a horizontal and a vertical line through one point.', shortcut: 'Alt+C' },
  channel: { id: 'channel', label: 'Parallel channel', clicks: 3, hint: 'Click two points for one side, then a third for the other side.' },
  pitchfork: { id: 'pitchfork', label: 'Pitchfork', clicks: 3, hint: 'Click the pivot, then the two reaction points.' },
  fib: { id: 'fib', label: 'Fib retracement', clicks: 2, hint: 'Click the start of the move, then its end.', shortcut: 'Alt+F' },
  fibext: { id: 'fibext', label: 'Trend-based fib extension', clicks: 3, hint: 'Click the start and end of the move, then the end of the pullback.' },
  long: { id: 'long', label: 'Long position', clicks: 1, hint: 'Click the entry. Then drag the target, the stop and the right edge.' },
  short: { id: 'short', label: 'Short position', clicks: 1, hint: 'Click the entry. Then drag the target, the stop and the right edge.' },
  priceRange: { id: 'priceRange', label: 'Price range', clicks: 2, hint: 'Click two prices to measure the distance between them.' },
  dateRange: { id: 'dateRange', label: 'Date range', clicks: 2, hint: 'Click two candles to measure the time between them.' },
  range: { id: 'range', label: 'Date and price range', clicks: 2, hint: 'Click two corners to measure price and time.' },
  volumeProfile: { id: 'volumeProfile', label: 'Fixed range volume profile', clicks: 2, hint: 'Click the first candle of the range, then the last.' },
  brush: { id: 'brush', label: 'Brush', clicks: 0, drag: true, hint: 'Press and drag to draw freehand.' },
  highlighter: { id: 'highlighter', label: 'Highlighter', clicks: 0, drag: true, hint: 'Press and drag to highlight.' },
  arrowMarker: { id: 'arrowMarker', label: 'Arrow marker', clicks: 2, hint: 'Click the tail, then the head.' },
  arrow: { id: 'arrow', label: 'Arrow', clicks: 2, hint: 'Click the tail, then the head.' },
  arrowUp: { id: 'arrowUp', label: 'Arrow mark up', clicks: 1, hint: 'Click to place an up arrow.' },
  arrowDown: { id: 'arrowDown', label: 'Arrow mark down', clicks: 1, hint: 'Click to place a down arrow.' },
  rect: { id: 'rect', label: 'Rectangle', clicks: 2, hint: 'Click two corners to draw a rectangle.', shortcut: 'Alt+Shift+R' },
  path: { id: 'path', label: 'Path', clicks: 0, multi: true, hint: 'Click each point of the path. Double-click or press Enter to finish.' },
  circle: { id: 'circle', label: 'Circle', clicks: 2, hint: 'Click the centre, then a point on the edge.' },
  ellipse: { id: 'ellipse', label: 'Ellipse', clicks: 2, hint: 'Click two corners of the box the ellipse fills.' },
  polyline: { id: 'polyline', label: 'Polyline', clicks: 0, multi: true, hint: 'Click each corner of the shape. Double-click or press Enter to close it.' },
  triangle: { id: 'triangle', label: 'Triangle', clicks: 3, hint: 'Click the three corners.' },
  text: { id: 'text', label: 'Text', clicks: 1, hint: 'Click where the text should go.' },
  priceLabel: { id: 'priceLabel', label: 'Price label', clicks: 1, hint: 'Click a price to label it.' },
  flag: { id: 'flag', label: 'Flag mark', clicks: 1, hint: 'Click to plant a flag.' },
};

export interface ToolSection {
  title: string;
  tools: ToolId[];
}

export const TOOL_GROUPS: { id: string; label: string; sections: ToolSection[] }[] = [
  { id: 'cursors', label: 'Cursors', sections: [{ title: '', tools: ['cross', 'dot', 'pointer', 'erase'] }] },
  {
    id: 'lines',
    label: 'Trend tools',
    sections: [
      { title: 'Lines', tools: ['trend', 'ray', 'info', 'extended', 'angle', 'hline', 'hray', 'vline', 'crossline'] },
      { title: 'Channels', tools: ['channel'] },
      { title: 'Pitchforks', tools: ['pitchfork'] },
    ],
  },
  { id: 'fib', label: 'Fibonacci tools', sections: [{ title: 'Fibonacci', tools: ['fib', 'fibext'] }] },
  {
    id: 'forecast',
    label: 'Forecasting and measurement tools',
    sections: [
      { title: 'Forecasting', tools: ['long', 'short'] },
      { title: 'Volume-based', tools: ['volumeProfile'] },
      { title: 'Measurers', tools: ['priceRange', 'dateRange', 'range'] },
    ],
  },
  {
    id: 'shapes',
    label: 'Geometric shapes',
    sections: [
      { title: 'Brushes', tools: ['brush', 'highlighter'] },
      { title: 'Arrows', tools: ['arrowMarker', 'arrow', 'arrowUp', 'arrowDown'] },
      { title: 'Shapes', tools: ['rect', 'path', 'circle', 'ellipse', 'polyline', 'triangle'] },
    ],
  },
  { id: 'notes', label: 'Annotation tools', sections: [{ title: 'Text and notes', tools: ['text', 'priceLabel', 'flag'] }] },
];

export const TOOL_SHORTCUTS: { code: string; shift: boolean; tool: ToolId }[] = [
  { code: 'KeyT', shift: false, tool: 'trend' },
  { code: 'KeyH', shift: false, tool: 'hline' },
  { code: 'KeyJ', shift: false, tool: 'hray' },
  { code: 'KeyV', shift: false, tool: 'vline' },
  { code: 'KeyC', shift: false, tool: 'crossline' },
  { code: 'KeyF', shift: false, tool: 'fib' },
  { code: 'KeyR', shift: true, tool: 'rect' },
];

export const DEFAULT_COLOR = '#2563eb';
export const DRAWING_COLORS = ['#2563eb', '#f59e0b', '#089981', '#f23645', '#7c3aed', '#131722'];
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const FIB_EXTENSION_LEVELS = [0, 0.618, 1, 1.618, 2.618];

export const isSelectTool = (tool: ToolId): tool is CursorTool => tool === 'cross' || tool === 'dot' || tool === 'pointer';
export const isStroke = (kind: DrawingKind): boolean => kind === 'brush' || kind === 'highlighter';
export const isPosition = (kind: DrawingKind): kind is 'long' | 'short' => kind === 'long' || kind === 'short';
const isBox = (kind: DrawingKind): boolean => kind === 'rect' || kind === 'ellipse' || kind === 'range';

export function newPosition(kind: 'long' | 'short', entry: Anchor, distance: number, right: number): Anchor[] {
  const sign = kind === 'long' ? 1 : -1;
  return [entry, { t: right, p: entry.p - sign * distance }, { t: right, p: entry.p + sign * 2 * distance }];
}

export function handleCount(drawing: Pick<Drawing, 'kind' | 'points'>): number {
  if (isStroke(drawing.kind)) return 0;
  if (isPosition(drawing.kind) || isBox(drawing.kind)) return 4;
  return drawing.points.length;
}

export function handleAnchor(drawing: Pick<Drawing, 'kind' | 'points'>, index: number): Anchor {
  const pts = drawing.points;
  if (isPosition(drawing.kind)) {
    return index === 3 ? { t: pts[1].t, p: pts[0].p } : index === 0 ? pts[0] : { t: pts[0].t, p: pts[index].p };
  }
  if (isBox(drawing.kind)) {
    return index === 2 ? { t: pts[0].t, p: pts[1].p } : index === 3 ? { t: pts[1].t, p: pts[0].p } : pts[index];
  }
  return pts[index];
}

export function moveHandle(drawing: Pick<Drawing, 'kind' | 'points'>, index: number, to: Anchor, minMove: number): Anchor[] {
  const pts = drawing.points.map((a) => ({ ...a }));
  if (isPosition(drawing.kind)) {
    const sign = drawing.kind === 'long' ? 1 : -1;
    const beyond = (a: number, b: number): boolean => sign * (a - b) >= minMove;
    if (index === 0) {
      if (beyond(to.p, pts[1].p) && beyond(pts[2].p, to.p)) pts[0].p = to.p;
      pts[0].t = Math.min(to.t, pts[1].t);
    } else if (index === 1) {
      if (beyond(pts[0].p, to.p)) pts[1].p = to.p;
    } else if (index === 2) {
      if (beyond(to.p, pts[0].p)) pts[2].p = to.p;
    } else {
      pts[1].t = pts[2].t = Math.max(to.t, pts[0].t);
    }
    return pts;
  }
  if (isBox(drawing.kind)) {
    if (index === 0) pts[0] = to;
    else if (index === 1) pts[1] = to;
    else if (index === 2) {
      pts[0].t = to.t;
      pts[1].p = to.p;
    } else {
      pts[1].t = to.t;
      pts[0].p = to.p;
    }
    return pts;
  }
  if (drawing.kind === 'hline') pts[0].p = to.p;
  else if (drawing.kind === 'vline') pts[0].t = to.t;
  else pts[index] = to;
  return pts;
}

export function moveAll(drawing: Pick<Drawing, 'kind' | 'points'>, priceDelta: number, shiftTime: (t: number) => number): Anchor[] {
  return drawing.points.map((a) => ({ t: shiftTime(a.t), p: a.p + priceDelta }));
}

export function upgradeDrawing(raw: unknown): Drawing | null {
  const d = raw as Partial<Drawing> & { t1?: number; p1?: number; t2?: number; p2?: number };
  if (!d || typeof d.id !== 'string' || typeof d.kind !== 'string' || !(d.kind in TOOLS)) return null;
  if (Array.isArray(d.points)) return d as Drawing;
  if (typeof d.t1 !== 'number' || typeof d.p1 !== 'number') return null;
  const first = { t: d.t1, p: d.p1 };
  const points = d.kind === 'hline' ? [first] : [first, { t: d.t2 ?? d.t1, p: d.p2 ?? d.p1 }];
  return { id: d.id, kind: d.kind, points };
}
