// Coin rules from mvp-features.md. The server enforces these in SQL (supabase/migrations);
// the client only uses them to explain rewards ("+10, 2 left today").

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

export const CAFE = {
  /** Base pay per shift before level bonus and diminishing returns. */
  soloPay: 30,
  togetherPayEach: 50,
  /** A shift is 3 minutes; the server refuses payouts for shifts shorter than this. */
  shiftSeconds: 180,
  minSeconds: 100,
  /** Pay drops after this many shifts in a day (soft diminishing returns). */
  softCap: 10,
  /** XP per served order; level = floor(sqrt(xp / 40)) + 1, capped at 10. */
  xpPerOrder: 1,
  maxLevel: 10,
  /** Each level adds 6% pay. */
  levelBonus: 0.06,
} as const;

export function cafeLevel(xp: number): number {
  return Math.min(CAFE.maxLevel, Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1);
}

export function cafeXpForLevel(level: number): number {
  return (level - 1) ** 2 * 40;
}

/**
 * Coins for one shift. `quality` is served orders / orders that could have been served (0..1).
 * Mirrors public.cafe_payout() in SQL.
 */
export function cafePayout(opts: { together: boolean; quality: number; level: number; shiftsToday: number }): number {
  const base = opts.together ? CAFE.togetherPayEach : CAFE.soloPay;
  const q = Math.max(0, Math.min(1, opts.quality));
  const performance = 0.4 + 0.6 * q;
  const levelMult = 1 + CAFE.levelBonus * (opts.level - 1);
  const n = opts.shiftsToday; // shifts already paid today, before this one
  const diminish = n < CAFE.softCap ? 1 : n < CAFE.softCap * 2 ? 0.5 : 0.25;
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
