// The jobs on the Work board. Shared with the server: which jobs are open to whom, how fast a
// real shift can go (the anti-cheat cap) and how levels add up. The mini-games live in src/ui/jobs.

import type { Couple, Profile } from '../net/types';

export type JobKey = 'cafe' | 'flowers' | 'delivery' | 'bugs' | 'inbox';

export interface Job {
  key: JobKey;
  name: string;
  /** The place, as it reads on the board ("Pixel Café"). */
  place: string;
  blurb: string;
  /** Shifts of another job this person must finish first. Together shifts count for both. */
  unlock?: { after: JobKey; shifts: number };
  /** Solo pay for a perfect level 1 shift; harder jobs further along pay more. */
  pay: number;
  /** The fastest a real player can finish one order; more than this per shift isn't paid. */
  orderSeconds: number;
  xpPerOrder: number;
  /** What one order is called in the results ("12 drinks served"). */
  unit: [string, string];
  /** The two jobs when working together, host first. */
  roles: [string, string];
}

export const JOBS: Record<JobKey, Job> = {
  cafe: {
    key: 'cafe', name: 'Café', place: 'Pixel Café', blurb: 'Read each order, make the drink and hand it over before they get tired of waiting.',
    pay: 20, orderSeconds: 4, xpPerOrder: 2, unit: ['drink', 'drinks'], roles: ['counter', 'barista'],
  },
  flowers: {
    key: 'flowers', name: 'Flower shop', place: 'Petal & Stem', blurb: 'Build each bouquet from the order card: three flowers, a wrap and a ribbon.',
    unlock: { after: 'cafe', shifts: 3 }, pay: 26, orderSeconds: 6, xpPerOrder: 3, unit: ['bouquet', 'bouquets'], roles: ['wrapping', 'flowers'],
  },
  delivery: {
    key: 'delivery', name: 'Delivery', place: 'Bike delivery', blurb: 'Ride down Maple Street, dodge puddles and cats, and drop each parcel at the right mailbox.',
    unlock: { after: 'flowers', shifts: 3 }, pay: 30, orderSeconds: 2.5, xpPerOrder: 2, unit: ['parcel', 'parcels'], roles: ['left lane', 'right lane'],
  },
  bugs: {
    key: 'bugs', name: 'Bug squashing', place: 'Desk: Bug Squad', blurb: 'Bugs crawl down the code on your monitor. Aim the little zapper and squash them before they reach the build.',
    unlock: { after: 'cafe', shifts: 3 }, pay: 24, orderSeconds: 0.7, xpPerOrder: 1, unit: ['bug', 'bugs'], roles: ['left screen', 'right screen'],
  },
  inbox: {
    key: 'inbox', name: 'Inbox sorting', place: 'Desk: Inbox Zero', blurb: 'Emails pile into the inbox. Read each one and file it in the right folder before the pile overflows.',
    unlock: { after: 'bugs', shifts: 3 }, pay: 30, orderSeconds: 1.2, xpPerOrder: 1, unit: ['email', 'emails'], roles: ['top pile', 'bottom pile'],
  },
};

export const JOB_KEYS = Object.keys(JOBS) as JobKey[];

export const isJob = (k: unknown): k is JobKey => typeof k === 'string' && k in JOBS;

/** Shifts this person has finished at a job. */
export function shiftsWorked(p: Pick<Profile, 'jobs'> | null | undefined, job: JobKey): number {
  return p?.jobs?.[job] ?? 0;
}

/** Null when open, otherwise how many more shifts of which job it needs. */
export function jobLock(p: Pick<Profile, 'jobs'> | null | undefined, job: JobKey): { after: JobKey; left: number } | null {
  const u = JOBS[job].unlock;
  if (!u) return null;
  const left = u.shifts - shiftsWorked(p, u.after);
  return left > 0 ? { after: u.after, left } : null;
}

/** Each job levels on its own; the café keeps its original counter. */
export function jobXp(c: Pick<Couple, 'cafeXp' | 'jobXp'> | null | undefined, job: JobKey): number {
  if (!c) return 0;
  return job === 'cafe' ? c.cafeXp : c.jobXp?.[job] ?? 0;
}
