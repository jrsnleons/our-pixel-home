// The preview backend: the whole home lives in this browser, and a simulated partner (Sam)
// walks around, plays games and sends the odd heart, so every feature can be tried alone.

import { applyMove, legalMoves, outcome } from '../core/boardgames';
import { blockedTiles, key, ROOM, type Tile } from '../core/grid';
import { findPath } from '../core/pathfinding';
import { DRAW_SECONDS } from '../data/words';
import { DEFAULT_LOOK, type AvatarLook } from '../engine/art/avatar';
import type { Backend, Handlers, Passage, RpcName, RpcResult, Rpcs } from './backend';
import { ActionError } from './backend';
import { fetchPassage } from './passage';
import { dispatch, snapshotOf } from './dispatch';
import * as R from './rules';
import type { Game, LiveMsg, Profile, Snapshot } from './types';

const KEY = 'oph.preview.v1';
const ME = 'me';
const SAM = 'sam';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

interface Saved { me: Profile | null; world: R.World | null; photos: Record<string, string> }

function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch { /* private mode or corrupt: start fresh */ }
  return { me: null, world: null, photos: {} };
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class LocalBackend implements Backend {
  readonly mode = 'preview' as const;
  private s: Saved = read();
  private h: Handlers | null = null;
  private partnerOnline = true;
  private simTile: Tile = { x: 4, y: 4 };
  private timers: number[] = [];
  /** How much you've drawn this round, so the pretend partner doesn't guess a blank page. */
  private inked = new Map<string, number>();
  private busy = false;

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* storage full: keep going in memory */ }
  }

  private ctx(who = ME): R.Ctx {
    return { w: this.s.world!, me: who, now: new Date(), id: uid };
  }

  private snap(): Snapshot { return clone(snapshotOf(this.s.world!, ME)); }

  async user() { return this.s.me ? { id: ME, name: this.s.me.name } : null; }
  async signIn() { /* preview has no accounts */ }
  async signOut() { this.s = { me: null, world: null, photos: {} }; this.save(); this.stopSim(); }

  async load(): Promise<Snapshot | null> {
    if (!this.s.me) return null;
    if (!this.s.world) return { me: this.s.me, partner: null, couple: null, placements: [], inventory: [], unlocks: [], notebooks: [], pages: [], prayers: [], devotions: [], events: [], quests: [], games: [], today: {} };
    if (this.s.world.profiles[ME]) this.s.world.profiles[ME].lastSeen = new Date().toISOString();
    return this.snap();
  }

  async createProfile(name: string, look: AvatarLook, tz: string): Promise<Profile> {
    this.s.me = { id: ME, name: name.trim().slice(0, 24) || 'You', look, city: null, tz, lastSeen: new Date().toISOString(), visitStreak: 0, devotionStreak: 0 };
    this.save();
    return this.s.me;
  }

  private sam(): Profile {
    return { id: SAM, name: 'Sam', look: { ...DEFAULT_LOOK, hair: 'long', hairColor: 3, skin: 2, outfit: 'fit_sweater', accessory: 'acc_flower', eyes: 1 }, city: 'London', tz: 'Europe/London', lastSeen: new Date().toISOString(), visitStreak: 3, devotionStreak: 5 };
  }

  async createCouple(): Promise<Snapshot> {
    this.s.world = R.newWorld(this.s.me!, uid(), 'PRVW-' + Math.floor(1000 + Math.random() * 9000), uid);
    this.save();
    // The simulated partner "accepts" the invite a moment later. A plain timer, because
    // subscribing (which happens as soon as the couple exists) resets the sim timers.
    window.setTimeout(() => {
      if (!this.s.world || this.s.world.couple.b) return;
      R.joinCouple(this.ctx(), this.sam());
      this.s.world!.couple.since = this.s.world!.couple.since ?? new Date(Date.now() - 41 * 86_400_000).toISOString().slice(0, 10);
      this.save();
      this.h?.patch(this.snap());
      this.h?.presence(true, new Date().toISOString());
    }, 2600);
    return this.snap();
  }

  async joinCouple(code: string): Promise<Snapshot> {
    if (!code.trim()) throw new ActionError('Type the code from your partner.');
    const sam = this.sam();
    this.s.world = R.newWorld(sam, uid(), code.trim().toUpperCase(), uid);
    R.joinCouple({ ...this.ctx(SAM), w: this.s.world }, this.s.me!);
    this.save();
    return this.snap();
  }

  async call<K extends RpcName>(name: K, args: Rpcs[K]): Promise<RpcResult> {
    if (!this.s.world) throw new ActionError('Pair up first.');
    let out: { result?: unknown; coins: number };
    try {
      out = dispatch(this.ctx(), name, args, { partnerOnline: this.partnerOnline && !!this.s.world.couple.b });
      R.compact(this.s.world, new Date());
    } catch (e) {
      if (e instanceof R.RuleError) throw new ActionError(e.message);
      throw e;
    }
    this.save();
    this.reactTo(name, args, out.result);
    return { ...this.snap(), result: out.result, coinsEarned: out.coins };
  }

  /** The pretend partner's reactions to what you just did. */
  private reactTo<K extends RpcName>(name: K, args: Rpcs[K], result: unknown) {
    switch (name) {
      case 'heart': this.maybeHeartBack(); break;
      case 'prayer_add': this.samPrays(result as string); break;
      case 'game_start': this.samGame(result as string); break;
      case 'game_move': this.samGame((args as Rpcs['game_move']).gameId); break;
      case 'draw_guess': if ((result as { right: boolean }).right) this.samGame((args as Rpcs['draw_guess']).gameId); break;
      case 'draw_skip': this.samGame((args as Rpcs['draw_skip']).gameId); break;
      case 'shift_finish': { const p = args as Rpcs['shift_finish']; this.samFinishShift(p.shiftId, p.served, p.missed); break; }
    }
  }

  // ---------- realtime & the simulated partner ----------

  subscribe(h: Handlers) {
    this.h = h;
    this.startSim();
    if (this.s.world?.couple.b) this.later(300, () => h.presence(this.partnerOnline, new Date().toISOString()));
    return () => { this.h = null; this.stopSim(); };
  }

  setPartnerOnline(online: boolean) {
    this.partnerOnline = online;
    const p = this.s.world?.profiles[SAM];
    if (p) p.lastSeen = new Date(online ? Date.now() : Date.now() - 3 * 3600_000).toISOString();
    this.save();
    this.h?.presence(online, p?.lastSeen ?? null);
    if (online) this.simTile = { x: 0, y: 5 };
  }

  send(m: LiveMsg) {
    if (!this.partnerOnline || !this.s.world?.couple.b) return;
    if (m.t === 'stroke') this.inked.set(m.game, (this.inked.get(m.game) ?? 0) + m.pts.length / 2);
    if (m.t === 'clear') this.inked.set(m.game, 0);
    if (m.t === 'interact' && Math.random() < 0.35) this.later(2800, () => this.h?.live({ t: 'heart' }));
    if (m.t === 'settle' && m.state && m.state.pose === 'sit' && Math.random() < 0.5) {
      // Sam sometimes comes and sits nearby.
      this.later(1500, () => this.wander(m.state!.tile));
    }
  }

  private later(ms: number, fn: () => void) {
    const t = window.setTimeout(() => { this.timers = this.timers.filter((x) => x !== t); fn(); }, ms);
    this.timers.push(t);
  }

  private startSim() {
    this.stopSim();
    const loop = () => {
      if (this.partnerOnline && this.s.world?.couple.b && !this.busy) this.wander();
      this.later(14000 + Math.random() * 16000, loop);
    };
    this.later(5000, loop);
  }

  private stopSim() { for (const t of this.timers) clearTimeout(t); this.timers = []; }

  private wander(near?: Tile) {
    const w = this.s.world;
    if (!w) return;
    const blocked = blockedTiles(w.placements);
    const free: Tile[] = [];
    for (let y = 0; y < ROOM.d; y++) for (let x = 0; x < ROOM.w; x++) if (!blocked.has(key(x, y))) free.push({ x, y });
    const pool = near ? free.filter((t) => Math.abs(t.x - near.x) + Math.abs(t.y - near.y) <= 2 && (t.x !== near.x || t.y !== near.y)) : free;
    const target = pool[Math.floor(Math.random() * pool.length)];
    if (!target) return;
    const path = findPath(this.simTile, target, blocked);
    if (!path || !path.length) return;
    this.h?.live({ t: 'walk', from: this.simTile, path });
    this.simTile = target;
  }

  /** Lets the scene tell the sim where Sam actually is (after interactions move them). */
  syncPartnerTile(t: Tile) { this.simTile = { ...t }; }

  private maybeHeartBack() {
    if (this.partnerOnline && Math.random() < 0.5) this.later(2200 + Math.random() * 3000, () => {
      R.heart(this.ctx(SAM));
      this.save();
      this.h?.live({ t: 'heart' });
      this.h?.patch(this.snap());
    });
  }

  private samPrays(id: string) {
    this.later(6000, () => {
      if (!this.s.world?.prayers.some((p) => p.id === id)) return;
      R.prayerPray(this.ctx(SAM), id);
      this.save();
      this.h?.patch(this.snap());
    });
  }

  private samGame(gameId: string) {
    const g = this.s.world?.games.find((x) => x.id === gameId);
    if (!g || g.status !== 'live' || !this.partnerOnline) return;
    if (g.kind === 'draw') return this.samDraw(g);
    if (g.turn !== SAM) return;
    this.later(900 + Math.random() * 900, () => {
      const cur = this.s.world?.games.find((x) => x.id === gameId);
      if (!cur || cur.status !== 'live' || cur.turn !== SAM) return;
      R.gameMove(this.ctx(SAM), gameId, pickMove(cur));
      this.save();
      this.h?.patch(this.snap());
    });
  }

  private samDraw(g: Game) {
    const round = g.round;
    if (g.drawer === SAM) {
      // Sam doodles: a few wobbly strokes, then the word's shape is up to your imagination.
      const word = this.s.world!.words[g.id];
      const seed = [...word].reduce((n, ch) => n + ch.charCodeAt(0), 0);
      let t = 800;
      for (let s = 0; s < 6; s++) {
        const pts: number[] = [];
        const cx = 0.3 + ((seed * (s + 3)) % 40) / 100, cy = 0.3 + ((seed * (s + 7)) % 40) / 100;
        const r = 0.08 + ((seed + s * 13) % 10) / 60;
        for (let a = 0; a <= 24; a++) pts.push(cx + Math.cos(a / 24 * Math.PI * 2 + s) * r * (1 + 0.2 * Math.sin(a)), cy + Math.sin(a / 24 * Math.PI * 2 + s) * r);
        this.later(t, () => this.h?.live({ t: 'stroke', game: g.id, pts, color: '#2A2A3A', size: 3 }));
        t += 900;
      }
      // The artist ends the round when time runs out.
      this.later(DRAW_SECONDS * 1000, () => {
        const cur = this.s.world?.games.find((x) => x.id === g.id);
        if (!cur || cur.status !== 'live' || cur.round !== round || cur.drawer !== SAM) return;
        const r = R.drawSkip(this.ctx(SAM), g.id);
        this.save();
        this.h?.patch({ ...this.snap(), toast: `Time! The word was “${r.word}”.` });
        this.samGame(g.id);
      });
      return;
    }
    // Sam guesses once there's enough of a drawing to go on: sometimes right, sometimes potato.
    this.inked.set(g.id, 0);
    let waited = 0;
    const tryGuess = () => {
      const cur = this.s.world?.games.find((x) => x.id === g.id);
      if (!cur || cur.status !== 'live' || cur.round !== round || cur.drawer === SAM) return;
      waited += 3;
      if ((this.inked.get(g.id) ?? 0) < 12 || waited < 6 + Math.random() * 6) { this.later(3000, tryGuess); return; }
      const word = this.s.world!.words[g.id];
      const r = R.drawGuess(this.ctx(SAM), g.id, Math.random() < 0.7 ? word : 'potato');
      this.save();
      if (r.right) { this.h?.patch({ ...this.snap(), toast: `Sam guessed “${word}”!` }); this.samGame(g.id); }
      else { this.h?.patch({ ...this.snap(), toast: 'Sam guessed “potato”…' }); this.later(5000, tryGuess); }
    };
    this.later(3000, tryGuess);
  }

  private samFinishShift(id: string, served: number, missed: number) {
    const s = this.s.world?.shifts.find((x) => x.id === id);
    if (!s?.together || s.finishedBy?.includes(SAM)) return;
    try { R.shiftFinish(this.ctx(SAM), id, served, missed); this.save(); } catch { /* already done */ }
  }

  // ---------- photos & scripture ----------

  async uploadPhoto(file: Blob): Promise<string> {
    const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
    const path = `local:${uid()}`;
    this.s.photos[path] = url;
    this.save();
    return path;
  }

  async photoUrl(path: string) { return this.s.photos[path] ?? ''; }

  passage(book: number, chapter: number, from?: number, to?: number): Promise<Passage> {
    return fetchPassage(book, chapter, from, to);
  }
}

/** A friendly opponent: wins when it can, blocks when it must, otherwise plays near the middle. */
export function pickMove(g: Game): number {
  const kind = g.kind as 'connect4' | 'tictactoe';
  const me = g.p1 === SAM ? 1 : 2, them = me === 1 ? 2 : 1;
  const moves = legalMoves(kind, g.board);
  const wins = (p: 1 | 2) => moves.find((m) => { const b = g.board.slice(); applyMove(kind, b, m, p); const o = outcome(kind, b); return !!o && o !== 'draw' && o.winner === p; });
  const w = wins(me as 1 | 2); if (w != null) return w;
  const b = wins(them as 1 | 2); if (b != null && Math.random() < 0.85) return b;
  const center = kind === 'connect4' ? 3 : 4;
  return moves.sort((x, y) => Math.abs(x - center) - Math.abs(y - center) + (Math.random() - 0.5) * 3)[0];
}
