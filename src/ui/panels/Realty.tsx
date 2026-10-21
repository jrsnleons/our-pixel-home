// Hearth & Home Realty: the ladder of homes. You can only move into the next one up, and
// everything you own comes along to exactly the same spot.

import { useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { HOME_ORDER, layoutOf, nextHome, type HomeLayout } from '../../core/layout';
import { act, coins, snap, toast } from '../../state/store';
import { Coin, Sheet } from '../kit';

const TILE = 9;

/** A little blueprint: rooms as outlined boxes, doorways as gaps in the shared wall. */
function Plan({ L }: { L: HomeLayout }) {
  const w = L.w * TILE, h = L.d * TILE;
  return (
    <svg viewBox={`-2 -2 ${w + 4} ${h + 4}`} width={`${Math.max(30, (L.w / 20) * 100)}%`} role="img" aria-label={`${L.name} floor plan`} style={{ maxHeight: '110px' }}>
      {L.rooms.map((r, i) => (
        <g>
          <rect x={r.x * TILE} y={r.y * TILE} width={r.w * TILE} height={r.d * TILE} fill={r.id === 'balcony' || r.id === 'porch' ? 'var(--soft)' : 'var(--paper, #fff6e4)'} stroke="var(--outline)" stroke-width="1.5" />
          {r.w * r.d > 8 && <text x={(r.x + r.w / 2) * TILE} y={(r.y + r.d / 2) * TILE + 2} text-anchor="middle" font-size="6" fill="var(--ink)" opacity={0.75}>{r.name}</text>}
          <title>{`${i + 1}. ${r.name}`}</title>
        </g>
      ))}
      {(L.openings ?? []).map((o) => o.dir === 'x'
        ? <rect x={(o.x + 1) * TILE - 2} y={o.y * TILE + 1.5} width="4" height={TILE - 3} fill="var(--paper, #fff6e4)" />
        : <rect x={o.x * TILE + 1.5} y={(o.y + 1) * TILE - 2} width={TILE - 3} height="4" fill="var(--paper, #fff6e4)" />)}
    </svg>
  );
}

export function Realty({ onClose }: { onClose: () => void }) {
  const s = snap.value!;
  const now = s.couple!.home;
  const next = nextHome(now);
  const [busy, setBusy] = useState(false);
  const move = async (id: string) => {
    if (busy) return;
    setBusy(true);
    sfx('tap');
    const ok = await act('move_home', { home: id });
    setBusy(false);
    if (ok) { sfx('coin'); toast(`Welcome to your new ${layoutOf(id).name.toLowerCase()}! Everything is right where you left it.`, 'love'); onClose(); }
    else sfx('error');
  };
  return (
    <Sheet title="Hearth & Home Realty" onClose={onClose} size="tall" head={<span class="chip"><Coin n={coins.value.toLocaleString()} /></span>}>
      <p class="tiny muted" style={{ margin: '0 0 8px' }}>Each home has the last one inside it. Your things stay exactly where they are, and you both move in together.</p>
      <div class="col" style={{ gap: '10px' }}>
        {HOME_ORDER.map((id) => {
          const L = layoutOf(id);
          const here = id === layoutOf(now).id;
          const done = HOME_ORDER.indexOf(id) < HOME_ORDER.indexOf(layoutOf(now).id);
          const isNext = next?.id === id;
          return (
            <div class={`card ${here ? 'owned' : ''}`} style={{ textAlign: 'left', display: 'grid', gap: '6px', gridTemplateColumns: '120px 1fr' }}>
              <Plan L={L} />
              <div class="col" style={{ gap: '3px' }}>
                <strong>{L.name}</strong>
                <span class="tiny muted">{L.blurb}</span>
                <span class="tiny muted">{L.rooms.length === 1 ? '1 room' : `${L.rooms.length} rooms`} · {L.w}×{L.d} tiles</span>
                {here ? <span class="chip">You live here</span>
                  : done ? <span class="tiny muted">Behind you</span>
                  : isNext ? <button class="btn small" disabled={busy || coins.value < L.price} onClick={() => void move(id)}>Move in · <Coin n={L.price.toLocaleString()} /></button>
                  : <span class="tiny muted">After the {layoutOf(HOME_ORDER[HOME_ORDER.indexOf(id) - 1]!).name.toLowerCase()} · <Coin n={L.price.toLocaleString()} /></span>}
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
