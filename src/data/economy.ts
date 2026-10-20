// Coin rules from mvp-features.md. The server enforces them by running src/net/rules.ts in the
// `api` edge function; the client also uses them to explain rewards ("+10, 2 left today").

export const REWARDS = {
  dailyVisit: { coins: 10, perDay: 1 },
  bothOnline: { coins: 20, perDay: 1 },
  together: { coins: 2, everyMinutes: 10, dailyCap: 20 },
  homeGame: { coins: 15, winnerBonus: 5, perDay: 5 },
  notebookPage: { coins: 10, perDay: 3 },
  devotion: { coins: 5, perDay: 1 },
  heart: { coins: 2, perDay: 5 },
  streaks: [
    { days: 7, coins: 100 },
    { days: 30, coins: 400 },
    { days: 100, coins: 1000 },
  ],
} as const;

/** Pay and levels for every job on the Work board (src/data/jobs.ts). */
export const SHIFT = {
  /** Base pay per shift before level bonus and diminishing returns. */
  soloPay: 30,
  togetherPayEach: 50,
  /** A shift is 3 minutes; the server refuses payouts for shifts shorter than this. */
  shiftSeconds: 180,
  minSeconds: 100,
  /** Pay drops after this many shifts in a day, all jobs together (soft diminishing returns). */
  softCap: 10,
  /** Level = floor(sqrt(xp / 40)) + 1, capped at 10. XP per order is set per job. */
  maxLevel: 10,
  /** Each level adds 6% pay. */
  levelBonus: 0.06,
} as const;

export function jobLevel(xp: number): number {
  return Math.min(SHIFT.maxLevel, Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1);
}

export function xpForLevel(level: number): number {
  return (level - 1) ** 2 * 40;
}

/**
 * Coins for one shift. `quality` is served orders / orders that could have been served (0..1).
 * Runs on the server too, as part of the shared rules.
 */
export function shiftPayout(opts: { together: boolean; quality: number; level: number; shiftsToday: number }): number {
  const base = opts.together ? SHIFT.togetherPayEach : SHIFT.soloPay;
  const q = Math.max(0, Math.min(1, opts.quality));
  const performance = 0.4 + 0.6 * q;
  const levelMult = 1 + SHIFT.levelBonus * (opts.level - 1);
  const n = opts.shiftsToday; // shifts already paid today, before this one
  const diminish = n < SHIFT.softCap ? 1 : n < SHIFT.softCap * 2 ? 0.5 : 0.25;
  return Math.max(1, Math.round(base * performance * levelMult * diminish));
}

/** Days together counter: day 1 is the start date itself. */
export function daysTogether(since: string | null, today: Date = new Date()): number {
  if (!since) return 1;
  const [y, m, d] = since.split('-').map(Number);
  const start = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(1, Math.floor((now - start) / 86_400_000) + 1);
}

const dayMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

/** The together-since date for "we've been together n days" as of `today` (day 1 is the start). */
export function sinceFromDays(n: number, today: string): string {
  return new Date(dayMs(today) - (Math.max(1, Math.floor(n)) - 1) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * What `day` celebrates, if anything: a yearly anniversary, every hundredth day, or a monthsary
 * (the same date each month, or the month's last day when it's shorter). Dates are YYYY-MM-DD.
 */
export function milestone(since: string | null, day: string): { label: string; coins: number } | null {
  if (!since || day <= since) return null;
  const n = Math.round((dayMs(day) - dayMs(since)) / 86_400_000) + 1;
  const [sy, sm, sd] = since.split('-').map(Number);
  const [y, m, d] = day.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const months = (y - sy) * 12 + (m - sm);
  const sameDate = months > 0 && d === Math.min(sd, monthEnd);
  if (sameDate && months % 12 === 0) { const yrs = months / 12; return { label: `${yrs} year${yrs === 1 ? '' : 's'} together`, coins: 300 }; }
  if (n % 100 === 0) return { label: `Day ${n} together`, coins: 100 };
  if (sameDate) return { label: `${months} month${months === 1 ? '' : 's'} together`, coins: 40 };
  return null;
}

/** "First week together" starter quests. Each pays into the shared wallet once. */
export const QUESTS = [
  { key: 'buy_bed', label: 'Buy a real bed', hint: 'Store → Furniture', coins: 60 },
  { key: 'place_table', label: 'Place a table', hint: 'Decorate → your storage box', coins: 40 },
  { key: 'first_game', label: 'Play your first game', hint: 'Tap the games table', coins: 50 },
  { key: 'first_note', label: 'Write your first note', hint: 'Notes → Notebooks', coins: 40 },
  { key: 'first_quiet', label: 'Do your first quiet time', hint: 'Notes → Quiet time', coins: 40 },
  { key: 'first_heart', label: 'Send your first heart', hint: 'Tap your partner', coins: 30 },
] as const;

/** Reasons with a daily limit, and whether the limit is per person or shared by the couple. */
export const DAILY_LIMITS: Record<string, { scope: 'user' | 'couple'; count?: number; coins?: number }> = {
  daily_visit: { scope: 'user', count: REWARDS.dailyVisit.perDay },
  both_online: { scope: 'couple', count: REWARDS.bothOnline.perDay },
  together: { scope: 'couple', coins: REWARDS.together.dailyCap },
  home_game: { scope: 'couple', count: REWARDS.homeGame.perDay },
  notebook_page: { scope: 'user', count: REWARDS.notebookPage.perDay },
  devotion: { scope: 'user', count: REWARDS.devotion.perDay },
  heart: { scope: 'user', count: REWARDS.heart.perDay },
};
