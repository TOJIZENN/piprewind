import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { TOOL_GROUPS, TOOLS, type ToolId } from '../lib/drawings.ts';
import { useReplay } from '../replay/store.ts';
import { Icon, type IconName } from './Icon.tsx';

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const keys = (shortcut: string): string => (MAC ? shortcut.replace('Alt', '⌥').replace('Shift', '⇧').split('+').join(' ') : shortcut.split('+').join(' + '));

export function Toolbar() {
  const tool = useReplay((s) => s.tool);
  const stayInTool = useReplay((s) => s.stayInTool);
  const magnet = useReplay((s) => s.magnet);
  const magnetMode = useReplay((s) => s.magnetMode);
  const lockDrawings = useReplay((s) => s.lockDrawings);
  const hideDrawings = useReplay((s) => s.hideDrawings);
  const hideIndicators = useReplay((s) => s.hideIndicators);
  const hidePositions = useReplay((s) => s.hidePositions);
  const drawings = useReplay((s) => s.session?.drawings.length ?? 0);
  const indicators = useReplay((s) => (s.session ? Object.values(s.session.indicators).filter(Boolean).length : 0));
  const { setTool, toggle, setMagnet, hideAll, clearDrawings, removeIndicators } = useReplay.getState();

  const [shown, setShown] = useState<Record<string, ToolId>>(() => Object.fromEntries(TOOL_GROUPS.map((g) => [g.id, g.sections[0].tools[0]])));
  const [open, setOpen] = useState<string | null>(null);
  const bar = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const group = TOOL_GROUPS.find((g) => g.sections.some((section) => section.tools.includes(tool)));
    if (group) setShown((current) => (current[group.id] === tool ? current : { ...current, [group.id]: tool }));
  }, [tool]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent): void => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    el.style.top = '0px';
    const overflow = el.getBoundingClientRect().bottom - (window.innerHeight - 8);
    if (overflow > 0) el.style.top = `${-overflow}px`;
  }, [open]);

  const choose = (group: string, id: ToolId): void => {
    setShown((current) => ({ ...current, [group]: id }));
    setTool(id);
    setOpen(null);
  };

  const more = (id: string, label: string) => (
    <button className={`tool-more${open === id ? ' on' : ''}`} onClick={() => setOpen(open === id ? null : id)} title={label} aria-label={label} aria-expanded={open === id}>
      <Icon name="caret" size={8} />
    </button>
  );

  const option = (label: string, action: () => void, checked = false, disabled = false) => (
    <button
      key={label}
      role="menuitem"
      className={`tool-option${checked ? ' on' : ''}`}
      disabled={disabled}
      onClick={() => {
        action();
        setOpen(null);
      }}
    >
      <span>{label}</span>
    </button>
  );

  const switchButton = (id: string, icon: IconName, label: string, on: boolean, press: () => void, options?: { label: string; items: ReactNode[] }) => (
    <div className="tool-group" key={id}>
      <button className={`tool-btn${on ? ' on' : ''}`} onClick={press} title={label} aria-label={label} aria-pressed={on}>
        <Icon name={icon} size={28} />
      </button>
      {options && more(id, options.label)}
      {options && open === id && (
        <div className="tool-menu" role="menu" ref={menu}>
          {options.items}
        </div>
      )}
    </div>
  );

  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
  const everythingHidden = hideDrawings && hideIndicators && hidePositions;

  return (
    <nav className="tools" ref={bar} aria-label="Drawing tools">
      {TOOL_GROUPS.map((group) => {
        const current = shown[group.id];
        const tools = group.sections.flatMap((section) => section.tools);
        const active = tools.includes(tool);
        return (
          <div className="tool-group" key={group.id}>
            <button className={`tool-btn${active ? ' on' : ''}`} onClick={() => choose(group.id, current)} title={TOOLS[current].label} aria-label={TOOLS[current].label} aria-pressed={active}>
              <Icon name={current} size={28} />
            </button>
            {more(group.id, group.label)}
            {open === group.id && (
              <div className="tool-menu" role="menu" ref={menu}>
                {group.sections.map((section) => (
                  <div className="tool-menu-section" key={section.title || group.id}>
                    {section.title && <span className="tool-menu-title">{section.title}</span>}
                    {section.tools.map((id) => (
                      <button key={id} role="menuitem" className={id === tool ? 'on' : ''} onClick={() => choose(group.id, id)}>
                        <Icon name={id} size={28} />
                        <span>{TOOLS[id].label}</span>
                        {TOOLS[id].shortcut && <kbd>{keys(TOOLS[id].shortcut)}</kbd>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <i className="tool-gap" />
      <button className={`tool-btn${tool === 'measure' ? ' on' : ''}`} onClick={() => setTool('measure')} title="Measure" aria-label="Measure" aria-pressed={tool === 'measure'}>
        <Icon name="measure" size={28} />
      </button>
      <button className={`tool-btn${tool === 'zoom' ? ' on' : ''}`} onClick={() => setTool('zoom')} title="Zoom in" aria-label="Zoom in" aria-pressed={tool === 'zoom'}>
        <Icon name="zoom" size={28} />
      </button>

      <i className="tool-gap" />
      {switchButton('magnet', 'magnet', 'Magnet mode snaps drawings placed near price bars to the closest OHLC value', magnet, () => toggle('magnet'), {
        label: 'Magnets',
        items: [option('Weak magnet', () => setMagnet('weak'), magnet && magnetMode === 'weak'), option('Strong magnet', () => setMagnet('strong'), magnet && magnetMode === 'strong')],
      })}
      {switchButton('stay', 'stay', 'Keep drawing', stayInTool, () => toggle('stayInTool'))}
      {switchButton('lock', lockDrawings ? 'lock' : 'unlock', lockDrawings ? 'Unlock drawings' : 'Lock drawings', lockDrawings, () => toggle('lockDrawings'))}
      {switchButton('hide', hideDrawings ? 'eyeOff' : 'eye', hideDrawings ? 'Show all drawings' : 'Hide all drawings', hideDrawings, () => toggle('hideDrawings'), {
        label: 'Hide options',
        items: [
          option(hideDrawings ? 'Show drawings' : 'Hide drawings', () => toggle('hideDrawings'), hideDrawings),
          option(hideIndicators ? 'Show indicators' : 'Hide indicators', () => toggle('hideIndicators'), hideIndicators),
          option(hidePositions ? 'Show positions and orders' : 'Hide positions and orders', () => toggle('hidePositions'), hidePositions),
          option(everythingHidden ? 'Show all' : 'Hide all', () => hideAll(!everythingHidden), everythingHidden),
        ],
      })}

      <i className="tool-gap" />
      {switchButton('remove', 'trash', 'Remove objects', false, clearDrawings, {
        label: 'Remove options',
        items: [
          option(`Remove ${plural(drawings, 'drawing')}`, clearDrawings, false, drawings === 0),
          option(`Remove ${plural(indicators, 'indicator')}`, removeIndicators, false, indicators === 0),
          option(
            `Remove ${plural(drawings, 'drawing')} & ${plural(indicators, 'indicator')}`,
            () => {
              clearDrawings();
              removeIndicators();
            },
            false,
            drawings + indicators === 0,
          ),
        ],
      })}
    </nav>
  );
}
