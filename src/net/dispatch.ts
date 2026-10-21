// One action in, one rule applied. Both backends call this: the preview runs it in the
// browser, the Supabase edge function runs the very same code on the server (bundled into
// supabase/functions/api/handler.js), so the rules can't drift between them.

import { DAILY_LIMITS, daysTogether } from '../data/economy';
import { isJob, JOB_KEYS, type JobKey } from '../data/jobs';
import type { RpcName, Rpcs } from './backend';
import * as R from './rules';
import type { Snapshot } from './types';

export interface DispatchOpts {
  /** Whether the partner is here right now (the server decides this from heartbeats). */
  partnerOnline: boolean;
  /** Whether a code unlocks test mode. The server checks it against its secret; the preview allows any. */
  godCheck?: (code: string) => boolean;
}

export interface Outcome { result?: unknown; coins: number }

export function dispatch<K extends RpcName>(c: R.Ctx, name: K, args: Rpcs[K], opts: DispatchOpts): Outcome {
  const a = (args ?? {}) as Rpcs[K];
  if (c.w.couple.archivedAt && name !== 'restore') throw new R.RuleError('This home is archived. Restore it first.');
  switch (name) {
    case 'buy': return { result: R.buy(c, str((a as Rpcs['buy']).item)), coins: 0 };
    case 'place': { const p = a as Rpcs['place']; return { result: R.place(c, str(p.invId), spot(p)), coins: 0 }; }
    case 'move': { const p = a as Rpcs['move']; R.move(c, str(p.pid), spot(p)); return { coins: 0 }; }
    case 'store': R.store(c, str((a as Rpcs['store']).pid)); return { coins: 0 };
    case 'set_style': R.setStyle(c, obj((a as Rpcs['set_style']).style)); return { coins: 0 };
    case 'move_home': R.moveHome(c, str((a as Rpcs['move_home']).home)); return { coins: 0 };
    case 'set_look': R.setLook(c, obj((a as Rpcs['set_look']).look)); return { coins: 0 };
    case 'buy_clothes': { const p = a as Rpcs['buy_clothes']; R.buyClothes(c, str(p.key), int(p.color)); return { coins: 0 }; }
    case 'save_look': { const p = a as Rpcs['save_look']; R.saveLook(c, int(p.index), p.wear == null ? null : obj(p.wear)); return { coins: 0 }; }
    case 'gift_look': R.giftLook(c, obj((a as Rpcs['gift_look']).wear)); return { coins: 0 };
    case 'answer_gift': R.answerGift(c, (a as Rpcs['answer_gift']).accept === true); return { coins: 0 };
    case 'set_profile': R.setProfile(c, a as Rpcs['set_profile']); return { coins: 0 };
    case 'set_couple': R.setCouple(c, a as Rpcs['set_couple']); return { coins: 0 };
    case 'placement_data': { const p = a as Rpcs['placement_data']; R.setPlacementData(c, str(p.pid), obj(p.patch)); return { coins: 0 }; }
    case 'water': return { result: R.water(c, str((a as Rpcs['water']).pid)), coins: 0 };
    case 'claim_daily': { const r = R.claimDaily(c, opts.partnerOnline && !!c.w.couple.b); return { result: r, coins: r.coins }; }
    case 'together_tick': return { coins: R.togetherTick(c, opts.partnerOnline) };
    case 'heart': return { coins: R.heart(c) };
    case 'interaction': R.interaction(c, str((a as Rpcs['interaction']).id), { day: daysTogether(c.w.couple.since, c.now), theme: '' }); return { coins: 0 };
    case 'nudge': { const p = a as Rpcs['nudge']; R.nudge(c, p.kind === 'verse' ? 'verse' : 'encourage', str(p.text), p.ref == null ? undefined : str(p.ref)); return { coins: 0 }; }
    case 'notebook_create': { const p = a as Rpcs['notebook_create']; return { result: R.notebookCreate(c, str(p.title), color(p.color)), coins: 0 }; }
    case 'page_write': { const p = a as Rpcs['page_write']; const r = R.pageWrite(c, str(p.notebookId), str(p.title ?? ''), str(p.body)); return { result: r.id, coins: r.coins }; }
    case 'page_edit': { const p = a as Rpcs['page_edit']; R.pageEdit(c, str(p.pageId), str(p.title ?? ''), str(p.body)); return { coins: 0 }; }
    case 'page_delete': R.pageDelete(c, str((a as Rpcs['page_delete']).pageId)); return { coins: 0 };
    case 'prayer_add': return { result: R.prayerAdd(c, str((a as Rpcs['prayer_add']).text)), coins: 0 };
    case 'prayer_pray': R.prayerPray(c, str((a as Rpcs['prayer_pray']).id)); return { coins: 0 };
    case 'prayer_answer': { const p = a as Rpcs['prayer_answer']; R.prayerAnswer(c, str(p.id), str(p.note ?? '')); return { coins: 0 }; }
    case 'prayer_delete': R.prayerDelete(c, str((a as Rpcs['prayer_delete']).id)); return { coins: 0 };
    case 'devotion': { const p = a as Rpcs['devotion']; const r = R.devotion(c, str(p.passage), str(p.reflection ?? ''), !!p.shared); return { result: r, coins: r.coins }; }
    case 'quest_claim': return { coins: R.questClaim(c, (a as Rpcs['quest_claim']).key) };
    case 'game_start': {
      const kind = (a as Rpcs['game_start']).kind;
      if (kind !== 'connect4' && kind !== 'tictactoe' && kind !== 'draw') throw new R.RuleError('Unknown game.');
      return { result: R.gameStart(c, kind).id, coins: 0 };
    }
    case 'game_move': { const p = a as Rpcs['game_move']; const r = R.gameMove(c, str(p.gameId), int(p.move)); return { coins: r.coins }; }
    case 'game_resign': R.gameResign(c, str((a as Rpcs['game_resign']).gameId)); return { coins: 0 };
    case 'draw_word': return { result: R.drawWord(c, str((a as Rpcs['draw_word']).gameId)), coins: 0 };
    case 'draw_guess': { const p = a as Rpcs['draw_guess']; const r = R.drawGuess(c, str(p.gameId), str(p.guess).slice(0, 40)); return { result: { right: r.right, word: r.word }, coins: r.coins }; }
    case 'draw_skip': { const r = R.drawSkip(c, str((a as Rpcs['draw_skip']).gameId)); return { result: { word: r.word }, coins: r.coins }; }
    case 'shift_start': { const p = a as Rpcs['shift_start']; return { result: R.shiftStart(c, !!p.together, job(p.job)), coins: 0 }; }
    case 'shift_finish': { const p = a as Rpcs['shift_finish']; const r = R.shiftFinish(c, str(p.shiftId), int(p.served), int(p.missed)); return { result: r, coins: r.pay }; }
    case 'god_mode': {
      if (!opts.godCheck?.(str((a as Rpcs['god_mode']).code))) throw new R.RuleError('That code isn’t right.');
      return { result: R.godMode(c), coins: 0 };
    }
    case 'unpair': R.unpair(c); return { coins: 0 };
    case 'restore': R.restore(c); return { coins: 0 };
    default: throw new R.RuleError('Unknown action.');
  }
}

/** What one person may see of the couple's world. */
export function snapshotOf(w: R.World, me: string, now = new Date()): Snapshot {
  const partnerId = w.couple.a === me ? w.couple.b : w.couple.a;
  const day = R.dayIn(w.profiles[me]?.tz ?? 'UTC', now);
  const today: Record<string, number> = {};
  for (const k of Object.keys(DAILY_LIMITS)) {
    const e = R.earnedToday(w, me, k, day);
    today[k] = DAILY_LIMITS[k].count != null ? e.count : e.coins;
  }
  // Coins from each job today, and shifts across all of them (pay softens after ten).
  for (const k of JOB_KEYS) today[k] = R.earnedToday(w, me, k, day).coins;
  today.shifts = R.shiftsToday(w, me, day);
  return {
    me: w.profiles[me],
    partner: partnerId ? w.profiles[partnerId] ?? null : null,
    couple: w.couple,
    placements: w.placements,
    inventory: w.inventory,
    unlocks: w.unlocks,
    notebooks: w.notebooks,
    pages: w.pages,
    prayers: w.prayers,
    // Quiet time is personal: the partner's entries only show when they chose to share.
    devotions: w.devotions.filter((d) => d.author === me || d.shared),
    events: w.events,
    quests: R.questStates(w),
    games: w.games,
    today,
  };
}

// Arguments come from the network on the server, so check their shape before the rules see them.
function str(v: unknown): string {
  if (typeof v !== 'string') throw new R.RuleError('Something was missing. Try again.');
  return v.slice(0, 5000);
}
function int(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new R.RuleError('Something was missing. Try again.');
  return Math.trunc(v);
}
function obj<T>(v: T): T {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new R.RuleError('Something was missing. Try again.');
  return v;
}
function color(v: unknown): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#E8A0A8';
}
function job(v: unknown): JobKey {
  if (v == null) return 'cafe';
  if (!isJob(v)) throw new R.RuleError('That job isn’t hiring.');
  return v;
}
function spot(p: { surface: unknown; x: unknown; y: unknown; rot: unknown }) {
  const surface = p.surface === 'back' || p.surface === 'left' ? p.surface : p.surface === 'floor' ? 'floor' : null;
  if (!surface) throw new R.RuleError('That spot isn’t in the room.');
  return { surface, x: int(p.x), y: int(p.y), rot: int(p.rot) } as const;
}
