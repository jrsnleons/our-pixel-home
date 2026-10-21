// What every job mini-game shares: roles, the townsfolk who come to the counter, the live
// channel between the two phones, and the strip of chips above the play area.

import { useEffect, useRef } from 'preact/hooks';
import { randomWear } from '../../data/clothes';
import { SHIFT } from '../../data/economy';
import { DEFAULT_LOOK, HAIR_STYLES, paintAvatarSmall, SH, SW, type AvatarLook } from '../../engine/art/avatar';
import type { CafeEvent, LiveMsg } from '../../net/types';
import { backend } from '../../state/store';
import { Icon } from '../kit';

/** Solo, or which half of a together shift: the host opened it and runs the customers. */
export type Role = 'solo' | 'host' | 'guest';

/** Where a shift had got to, so a solo shift picks up again after the app is closed mid-way. */
export interface ShiftProgress { t: number; served: number; missed: number }

export interface ShiftProps {
  id: string;
  role: Role;
  /** The job's level: every mini-game gets harder (and pays more) as it goes up. */
  level: number;
  resume?: ShiftProgress;
  onEnd: (served: number, missed: number) => void;
  /** Called every frame with the running totals. */
  onTick?: (p: ShiftProgress) => void;
}

export const SHIFT_SECONDS = SHIFT.shiftSeconds;

/** Regulars are drawn with the same avatar painter as you, so the town feels like your world. */
export function customerLook(n: number): AvatarLook {
  return { ...DEFAULT_LOOK, body: n % 2 ? 'girl' : 'guy', hair: HAIR_STYLES[(n * 5 + 1) % HAIR_STYLES.length], hairColor: (n * 3 + 2) % 8, skin: (n * 5 + 3) % 6, wear: randomWear(n), eyes: n % 4 };
}

const spriteCache = new Map<string, HTMLCanvasElement>();
export function avatarSprite(look: AvatarLook, frame: string, view: 'front' | 'back' = 'front') {
  const k = JSON.stringify(look) + frame + view;
  let c = spriteCache.get(k);
  if (!c) {
    c = document.createElement('canvas'); c.width = SW; c.height = SH;
    paintAvatarSmall(c.getContext('2d')!, 0, 0, { look, frame, view });
    if (spriteCache.size > 120) spriteCache.clear();
    spriteCache.set(k, c);
  }
  return c;
}

let liveHandler: ((m: LiveMsg) => void) | null = null;
/** Home forwards shift messages from the partner's phone here. */
export function deliverShiftMsg(m: LiveMsg) { liveHandler?.(m); }

/** Listen to the partner's half of this shift. The latest `fn` is always the one called. */
export function useShiftEvents(id: string, fn: (ev: CafeEvent) => void) {
  const h = useRef(fn);
  h.current = fn;
  useEffect(() => {
    liveHandler = (m) => { if (m.t === 'cafe' && m.shift === id) h.current(m.ev); };
    return () => { liveHandler = null; };
  }, [id]);
}

export function sendShift(id: string, ev: CafeEvent) { backend.send({ t: 'cafe', shift: id, ev }); }

export function ShiftHud({ label, served, missed, left, children }: { label: string; served: number; missed: number; left: number; children?: preact.ComponentChildren }) {
  return (
    <div class="row">
      <span class="chip">{label}</span>
      <span class="chip"><Icon name="check" size="s" />{served}</span>
      {missed > 0 && <span class="chip">Missed {missed}</span>}
      {children}
      <div class="grow" />
      <span class="chip">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
    </div>
  );
}
