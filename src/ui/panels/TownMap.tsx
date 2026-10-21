// The town map: a little pixel plan of Maple Town with you (and your partner, if they're in town)
// on it. Tap a building, or a name in the list, and you walk there; long trips turn into a jog.

import { useEffect, useRef } from 'preact/hooks';
import type { Tile } from '../../core/grid';
import { DISTRICTS, districtAt, G, groundAt, PLACES, TOWN, type Place } from '../../data/town';
import { Sheet } from '../kit';

const PX = 4;

const GROUND_COLORS: Record<G, string> = {
  [G.Grass]: '#6FA85A', [G.Yard]: '#78B062', [G.Road]: '#5A5664', [G.Walk]: '#D8CDB8', [G.Plaza]: '#CFC6B4',
  [G.Water]: '#5EAAD6', [G.Bridge]: '#A8805A', [G.Deck]: '#9A7450', [G.Path]: '#C8A878', [G.Bed]: '#B0607A', [G.Hedge]: '#3E6A3A',
};

/** Places worth walking to: everything except the "coming soon" boards. */
const DESTINATIONS = PLACES.filter((p) => p.kind !== 'soon');

function placeAt(t: Tile): Place | null {
  return PLACES.find((p) => t.x >= p.x - 1 && t.x <= p.x + p.w && t.y >= p.y - 1 && t.y <= p.door.y) ?? null;
}

export function TownMap({ me, partnerAt, partnerName, onGo, onClose }: { me: Tile; partnerAt: Tile | null; partnerName?: string; onGo: (id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    for (let y = 0; y < TOWN.d; y++) for (let x = 0; x < TOWN.w; x++) { g.fillStyle = GROUND_COLORS[groundAt(x, y)]; g.fillRect(x * PX, y * PX, PX, PX); }
    for (const p of PLACES) {
      g.fillStyle = p.palette.roof; g.fillRect(p.x * PX, p.y * PX, p.w * PX, p.d * PX);
      g.fillStyle = p.palette.wall; g.fillRect(p.x * PX, (p.y + p.d) * PX - 3, p.w * PX, 3);
      g.fillStyle = '#3A2A22'; g.fillRect(p.door.x * PX + 1, (p.y + p.d) * PX - 3, 2, 3);
    }
    const dot = (t: Tile, col: string) => { g.fillStyle = '#FFFFFF'; g.fillRect(t.x * PX - 2, t.y * PX - 2, PX + 4, PX + 4); g.fillStyle = col; g.fillRect(t.x * PX - 1, t.y * PX - 1, PX + 2, PX + 2); };
    if (partnerAt) dot(partnerAt, '#E8506A');
    dot(me, '#3E5E8A');
  }, [me.x, me.y, partnerAt?.x, partnerAt?.y]);

  const tap = (e: MouseEvent) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const t = { x: Math.floor(((e.clientX - r.left) / r.width) * TOWN.w), y: Math.floor(((e.clientY - r.top) / r.height) * TOWN.d) };
    const p = placeAt(t);
    if (p && p.kind !== 'soon') onGo(p.id);
  };

  const here = districtAt(me);
  return (
    <Sheet title="Maple Town" onClose={onClose} size="tall">
      <p class="tiny muted" style={{ margin: '0 0 8px' }}>
        You’re in {here?.name ?? 'town'}{partnerAt && partnerName ? `, ${partnerName} is in ${districtAt(partnerAt)?.name ?? 'town'}` : ''}. Tap a place to walk there.
      </p>
      <div class="townmap">
        <canvas ref={ref} width={TOWN.w * PX} height={TOWN.d * PX} onClick={tap} aria-label="Map of Maple Town" />
        <div class="col" style={{ gap: '10px', flex: 1, minWidth: 0 }}>
          {DISTRICTS.map((d) => {
            const list = DESTINATIONS.filter((p) => districtAt(p.door)?.id === d.id);
            if (!list.length) return null;
            return (
              <div class="col" style={{ gap: '4px' }}>
                <strong class="small">{d.name}</strong>
                {list.map((p) => <button class="btn small ghost" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => onGo(p.id)}>{p.name}</button>)}
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
