// Small shared UI pieces: pixel icons, sheets, tabs, the coin label.

import type { ComponentChildren, JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { THEMES } from '../data/themes';
import { prefs, sceneCovers } from '../state/store';
import { iconUrl } from './icons';

export function Icon({ name, size = '', alt = '' }: { name: string; size?: '' | 's' | 'l'; alt?: string }) {
  const T = THEMES[prefs.value.theme];
  return <img class={`ico ${size}`} src={iconUrl(name, { o: T.outline, a: T.ui.accent, b: T.ui.ink })} alt={alt} draggable={false} />;
}

export function Coin({ n, size = 's' }: { n: number | string; size?: '' | 's' }) {
  return <span class="row" style={{ gap: '3px', display: 'inline-flex' }}><Icon name="coin" size={size} />{n}</span>;
}

export function Sheet(props: { title: ComponentChildren; onClose: () => void; children: ComponentChildren; size?: '' | 'tall' | 'full'; dim?: boolean; head?: ComponentChildren }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [props.onClose]);
  // Nothing of the room shows behind a full-screen sheet, so stop drawing it meanwhile.
  useEffect(() => {
    if (props.size !== 'full') return;
    sceneCovers.value++;
    return () => { sceneCovers.value--; };
  }, [props.size]);
  return (
    <div class={`sheet-wrap ${props.dim === false ? '' : 'dim'}`} onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <section class={`sheet ${props.size ?? ''}`} role="dialog" aria-label={typeof props.title === 'string' ? props.title : undefined}>
        <header class="sheet-head">
          <h2>{props.title}</h2>
          {props.head}
          <button class="btn ghost icon small" onClick={props.onClose} aria-label="Close"><Icon name="close" size="s" /></button>
        </header>
        <div class="sheet-body">{props.children}</div>
      </section>
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string; badge?: number }[]; onChange: (k: T) => void }) {
  return (
    <div class="tabs" role="tablist">
      {options.map((o) => (
        <button class="tab" role="tab" aria-selected={o.key === value} onClick={() => onChange(o.key)} style={{ position: 'relative' }}>
          {o.label}{o.badge ? <span class="badge">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return <label class="field"><span>{label}</span>{children}</label>;
}

export type Click = JSX.TargetedMouseEvent<HTMLElement>;
