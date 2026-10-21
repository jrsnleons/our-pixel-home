// Where you were when you left: your spot in the room (standing, sitting or in bed), where your
// partner was last seen, and the sheet you had open. Phones often throw a backgrounded web app
// away, so this is saved whenever the app is hidden and restored when it starts again.

import type { Tile } from '../core/grid';
import type { SettleState } from '../engine/scene';
import type { Sheet } from './store';

const KEY = 'oph.last';
/** After this long, a fresh start in the middle of the room is less confusing than the old spot. */
const KEEP_MS = 3 * 86_400_000;

export interface LastState {
  /** Which couple this was for, so a different account doesn't pick it up. */
  couple: string;
  me: { tile: Tile; settle: SettleState | null };
  partner?: { tile: Tile; settle: SettleState | null };
  sheet: Sheet;
  notesTab?: string;
  music?: boolean;
  at: number;
}

export function loadLast(couple: string): LastState | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LastState | null;
    if (!v || v.couple !== couple || Date.now() - v.at > KEEP_MS) return null;
    return v;
  } catch { return null; }
}

export function saveLast(s: Omit<LastState, 'at'>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, at: Date.now() })); } catch { /* private mode */ }
}

/** True once someone has been in before: later launches skip the "tap to come in" screen. */
export function beenHere(): boolean {
  try { return localStorage.getItem('oph.entered') === '1'; } catch { return false; }
}
export function markBeenHere() {
  try { localStorage.setItem('oph.entered', '1'); } catch { /* private mode */ }
}
