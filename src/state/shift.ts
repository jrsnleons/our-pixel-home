// The solo shift in progress, saved as it runs so closing the app doesn't lose it. Kept apart
// from the Work panel so the home can check for one without loading the job games.

import { SHIFT } from '../data/economy';
import { JOBS, type JobKey } from '../data/jobs';
import type { ShiftProgress } from '../ui/jobs/common';

export const LIVE_KEY = 'oph.liveShift';
export interface LiveShift extends ShiftProgress { id: string; job: JobKey; savedAt: number }

export function savedShift(): LiveShift | null {
  try {
    const v = JSON.parse(localStorage.getItem(LIVE_KEY) ?? 'null') as LiveShift | null;
    // The server only pays a shift for a while after it started; older ones are gone.
    if (!v || !JOBS[v.job] || Date.now() - v.savedAt > 30 * 60_000 || v.t >= SHIFT.shiftSeconds - 1) return null;
    return v;
  } catch { return null; }
}

export const clearSaved = () => { try { localStorage.removeItem(LIVE_KEY); } catch { /* private mode */ } };
