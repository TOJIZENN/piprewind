import type { IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesPrimitive, Time } from 'lightweight-charts';

export class FramePrimitive implements ISeriesPrimitive<Time> {
  onPaint: (() => void) | null = null;
  private readonly views: IPrimitivePaneView[];

  constructor() {
    const renderer: IPrimitivePaneRenderer = { draw: () => this.onPaint?.() };
    this.views = [{ renderer: () => renderer, zOrder: () => 'top' }];
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }
}
