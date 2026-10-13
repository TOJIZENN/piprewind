import { useEffect } from 'react';
import { CHART_PRESETS, useChartStyle, type ChartStyle } from '../store/chartStyle.ts';
import { Icon } from './Icon.tsx';

type ColourKey = { [K in keyof ChartStyle]: ChartStyle[K] extends string ? K : never }[keyof ChartStyle] & Exclude<keyof ChartStyle, 'type'>;

export function ChartSettings({ onClose }: { onClose(): void }) {
  const style = useChartStyle((s) => s.style);
  const change = useChartStyle((s) => s.change);

  useEffect(() => {
    const escape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);

  const colour = (key: ColourKey, label: string) => (
    <label className="colour" key={key}>
      <input type="color" value={style[key]} onChange={(e) => change({ [key]: e.target.value })} aria-label={label} />
      <span>{label}</span>
    </label>
  );

  const active = CHART_PRESETS.find((preset) => Object.entries(preset.colours).every(([key, value]) => style[key as keyof ChartStyle] === value));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings" role="dialog" aria-labelledby="chart-settings-title">
        <div className="modal-head">
          <h2 id="chart-settings-title">Chart settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <section>
          <h3>Themes</h3>
          <div className="preset-row">
            {CHART_PRESETS.map((preset) => (
              <button key={preset.id} className={`preset${active?.id === preset.id ? ' on' : ''}`} onClick={() => change(preset.colours)}>
                <i style={{ background: preset.colours.background, borderColor: preset.colours.grid }}>
                  <b style={{ background: preset.colours.upBody, borderColor: preset.colours.upBorder }} />
                  <b style={{ background: preset.colours.downBody, borderColor: preset.colours.downBorder }} />
                </i>
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Canvas</h3>
          <div className="colour-grid">
            {colour('background', 'Background')}
            {colour('text', 'Scales text')}
            {colour('crosshair', 'Crosshair')}
            {colour('grid', 'Grid lines')}
          </div>
          <label className="check">
            <input type="checkbox" checked={style.gridVisible} onChange={(e) => change({ gridVisible: e.target.checked })} />
            Show grid lines
          </label>
        </section>

        <section>
          <h3>Candles</h3>
          <div className="colour-grid">
            {colour('upBody', 'Body, up')}
            {colour('downBody', 'Body, down')}
            {colour('upWick', 'Wick, up')}
            {colour('downWick', 'Wick, down')}
            {colour('upBorder', 'Border, up')}
            {colour('downBorder', 'Border, down')}
          </div>
          <label className="check">
            <input type="checkbox" checked={style.borders} onChange={(e) => change({ borders: e.target.checked })} />
            Draw candle borders
          </label>
        </section>

        <div className="modal-actions">
          <button className="btn btn-quiet" onClick={() => change(CHART_PRESETS[0].colours)}>
            Reset to default
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
