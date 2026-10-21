// The last home this phone saw. With it the installed app opens straight into the room instead
// of waiting on the server, and still opens with no signal at all; the server's fresh copy
// replaces it a moment later. Kept on this phone only, and wiped on signing out.

import type { Snapshot } from '../net/types';

const KEY = 'oph.home';

export function keepHome(uid: string, s: Snapshot) {
  try { localStorage.setItem(KEY, JSON.stringify({ uid, s })); } catch { /* storage full or private mode: just start slower */ }
}

/** The kept home, for this account (or, with no account to check against while offline, any). */
export function keptHome(uid: string | null): Snapshot | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { uid: string; s: Snapshot } | null;
    return v && (uid == null || v.uid === uid) ? v.s : null;
  } catch { return null; }
}

export function forgetHome() {
  try { localStorage.removeItem(KEY); } catch { /* nothing kept */ }
}
