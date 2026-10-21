// Bike delivery down Maple Street. You ride up the screen; tap left or right to change lanes.
// Dodge puddles, cones and cats, and ride past the one mailbox with its flag up, in the lane on
// its side of the street, to drop the parcel in. Higher levels ride faster on busier streets. Together, you both ride the same street (it's drawn from the
// shift id), each in your own lane, and deliveries you both keep up build a shared combo.

import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import type { AvatarLook } from '../../engine/art/avatar';
import { dither, hash, rng } from '../../engine/art/pixel';
import type { CafeEvent } from '../../net/types';
import { backend, partner, snap } from '../../state/store';
import { difficulty } from '../../data/economy';
import { avatarSprite, SHIFT_SECONDS, sendShift, ShiftHud, useShiftEvents, type ShiftProps } from './common';

const W = 96, H = 128;
const BIKE_Y = 104; // where the rear wheel touches the road
const LANE_X = [37, 59];
const ROAD = [26, 70];

export const MAIL = [
  { name: 'red', c: '#E0484A', d: '#8A2030', l: '#F28A86' },
  { name: 'blue', c: '#4A7AD8', d: '#24407A', l: '#8AB2F2' },
  { name: 'yellow', c: '#F2C230', d: '#9A7010', l: '#FFE27A' },
  { name: 'green', c: '#4AA860', d: '#24603A', l: '#8AD49A' },
];

const P = (g: CanvasRenderingContext2D, c: string, x: number, y: number, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

// ---------- the street, generated from a seed ----------

interface Lot { side: 0 | 1; at: number; len: number; roof: string; wall: string; tree: boolean; art?: HTMLCanvasElement }
interface Mailbox { id: number; side: 0 | 1; at: number; color: number; done?: boolean }
interface Obstacle { id: number; kind: 'puddle' | 'cone' | 'cat'; lane: 0 | 1; at: number; fur?: string; hit?: number; x?: number; dir?: 1 | -1 }

const ROOFS = ['#C85A4A', '#5A7AA8', '#7A9A5A', '#A8784A', '#8A5A8A', '#C88A3A'];
const WALLS = ['#F2E6CC', '#E8D6B8', '#DCE6EA', '#F2DCD8'];
const FURS = ['#E8963A', '#5A5A62', '#2E2A2A', '#E8E0D4'];

class Street {
  lots: Lot[] = []; mail: Mailbox[] = []; obs: Obstacle[] = [];
  private r: () => number;
  private end = [0, 0];
  private nextObs = 150;
  private lastLane: 0 | 1 = 0;
  private n = 1;
  /** 0..1 from the job level: more obstacles, closer together. */
  constructor(seed: number, private hard = 0) { this.r = rng(seed); }
  /** Lay down street up to `upTo` pixels from the start. */
  grow(upTo: number) {
    const r = this.r;
    for (const side of [0, 1] as const) {
      while (this.end[side] < upTo) {
        const at = this.end[side], len = 36 + Math.floor(r() * 14);
        this.lots.push({ side, at, len, roof: ROOFS[Math.floor(r() * ROOFS.length)], wall: WALLS[Math.floor(r() * WALLS.length)], tree: r() < 0.35 });
        // Most houses have a mailbox; never two of one color side by side across the street.
        if (at > 60 && r() < 0.62) {
          let color = Math.floor(r() * MAIL.length);
          const clash = this.mail.find((m) => m.side !== side && Math.abs(m.at - (at + 18)) < 20 && m.color === color);
          if (clash) color = (color + 1) % MAIL.length;
          this.mail.push({ id: this.n++, side, at: at + 18, color });
        }
        this.end[side] = at + len;
      }
    }
    while (this.nextObs < upTo) {
      // Mostly alternate lanes, and keep enough room between them to switch.
      const lane: 0 | 1 = r() < 0.7 ? (this.lastLane ? 0 : 1) : this.lastLane;
      const roll = r();
      const kind = roll < 0.45 ? 'puddle' : roll < 0.75 ? 'cone' : 'cat';
      this.obs.push({ id: this.n++, kind, lane, at: this.nextObs, fur: FURS[Math.floor(r() * FURS.length)], dir: lane ? -1 : 1 });
      const gap = (lane === this.lastLane ? 46 : 60) + Math.floor(r() * 50) + Math.max(0, 40 - this.nextObs / 120);
      this.nextObs += Math.round(gap * (1.15 - 0.4 * this.hard));
      this.lastLane = lane;
    }
  }
  trim(dist: number) {
    const keep = (at: number) => at > dist - 60;
    this.lots = this.lots.filter((l) => keep(l.at + l.len));
    this.mail = this.mail.filter((m) => keep(m.at));
    this.obs = this.obs.filter((o) => keep(o.at));
  }
}

function lotArt(l: Lot): HTMLCanvasElement {
  if (l.art) return l.art;
  const c = document.createElement('canvas'); c.width = 18; c.height = l.len;
  const g = c.getContext('2d')!;
  const R = (col: string, x: number, y: number, w = 1, h = 1) => P(g, col, x, y, w, h);
  R('#86B860', 0, 0, 18, l.len);
  dither(g, '#86B860', '#78A856', 0, 0, 18, l.len, 0.25);
  // The house sits at the far edge: roof seen from above, its front wall facing down the street.
  const hx = l.side === 0 ? 0 : 6, hw = 12, hl = l.len - 16;
  const roofD = l.roof, wall = l.wall;
  R('#2E2A2A', hx, 3, hw, hl + 6);
  R(roofD, hx + (l.side ? 1 : 0), 4, hw - 1, hl);
  for (let y = 5; y < 4 + hl; y += 3) R('rgba(0,0,0,.14)', hx + (l.side ? 1 : 0), y, hw - 1, 1);
  R('rgba(255,255,255,.22)', l.side ? hx + 1 : hx + hw - 3, 4, 2, hl);
  R(wall, hx + (l.side ? 1 : 0), 4 + hl, hw - 1, 5);
  R('#6A4A30', l.side ? hx + 7 : hx + 2, 5 + hl, 3, 4); R('#E8C860', l.side ? hx + 9 : hx + 4, 7 + hl, 1, 1);
  R('#7AB0D8', l.side ? hx + 2 : hx + 7, 5 + hl, 3, 2); R('#FFFFFF', l.side ? hx + 2 : hx + 7, 5 + hl, 1, 1);
  // A hedge along the sidewalk, and sometimes a tree.
  const ex = l.side === 0 ? 15 : 0;
  for (let y = 1; y < l.len - 1; y += 4) { R('#4E8A3A', ex, y, 3, 3); R('#6EA850', ex, y, 2, 2); }
  if (l.tree) {
    const tx = l.side === 0 ? 7 : 3, ty = l.len - 12;
    R('rgba(0,0,0,.2)', tx + 1, ty + 4, 9, 7);
    R('#2E5A2A', tx, ty, 9, 9); R('#4E8A3A', tx + 1, ty, 7, 8); R('#6EA850', tx + 2, ty + 1, 4, 4); R('#8CC468', tx + 2, ty + 1, 2, 2);
  }
  l.art = c;
  return c;
}

// ---------- sprites ----------

function drawMailbox(g: CanvasRenderingContext2D, x: number, y: number, m: Mailbox, wave: number, target: boolean) {
  const M = MAIL[m.color];
  P(g, 'rgba(0,0,0,.2)', x, y + 1, 6, 2);
  P(g, '#5E4630', x + 2, y - 5, 2, 6);
  P(g, M.d, x, y - 10, 6, 6); P(g, M.c, x, y - 10, 6, 4); P(g, M.l, x + 1, y - 10, 2, 1);
  P(g, '#2E2A2A', x + 1, y - 7, 4, 1);
  if (m.done) { P(g, '#C8A070', x + 1, y - 12, 4, 2); P(g, '#8A6A40', x + 2, y - 12, 1, 2); }
  // The flag is up on the mailboxes your parcel is for.
  if (target && !m.done) { const s = m.side ? -1 : 1; P(g, '#5E4630', x + (s > 0 ? 6 : -1), y - 14, 1, 6); P(g, '#FFFFFF', x + (s > 0 ? 7 : -3 - wave), y - 14, 3 + wave, 2); }
}

function drawObstacle(g: CanvasRenderingContext2D, o: Obstacle, y: number, t: number) {
  const x = o.x ?? LANE_X[o.lane];
  if (o.kind === 'puddle') {
    const sp = o.hit ? Math.min(1, (t - o.hit) * 3) : 0;
    // A puddle with a darker rim and the sky caught in it.
    P(g, '#4A6E9A', x - 4, y - 3, 8, 1); P(g, '#4A6E9A', x - 6, y - 2, 12, 1); P(g, '#4A6E9A', x - 7, y - 1, 14, 2); P(g, '#4A6E9A', x - 5, y + 1, 10, 1);
    P(g, '#6E9AD0', x - 3, y - 2, 6, 1); P(g, '#6E9AD0', x - 6, y - 1, 12, 2); P(g, '#6E9AD0', x - 4, y + 1, 7, 1);
    P(g, '#B8DAF4', x - 3, y - 1, 3, 1); P(g, '#B8DAF4', x + 2, y, 2, 1);
    if (sp > 0 && sp < 1) for (let i = 0; i < 4; i++) P(g, '#A8D0F0', x - 6 + i * 4, y - 3 - sp * 8 + (i % 2) * 2, 1, 2);
  } else if (o.kind === 'cone') {
    if (o.hit) { P(g, '#2E2A2A', x - 4, y - 1, 8, 3); P(g, '#F07A2A', x - 3, y - 1, 7, 2); P(g, '#FFFFFF', x, y - 1, 2, 2); return; }
    P(g, 'rgba(0,0,0,.25)', x - 3, y, 7, 2);
    P(g, '#2E2A2A', x - 4, y - 1, 8, 2);
    P(g, '#F07A2A', x - 2, y - 8, 4, 7); P(g, '#F07A2A', x - 1, y - 10, 2, 2);
    P(g, '#FFFFFF', x - 2, y - 6, 4, 2); P(g, '#FFB070', x - 2, y - 8, 1, 7);
  } else {
    const fur = o.fur ?? FURS[0], step = Math.floor(t * 8) % 2;
    const dark = '#2E2A2A', f = o.dir ?? 1;
    P(g, 'rgba(0,0,0,.2)', x - 4, y, 9, 2);
    P(g, dark, x - 4, y - 5, 8, 4); P(g, fur, x - 3, y - 5, 6, 3);
    P(g, dark, x + (f > 0 ? 3 : -6), y - 8, 4, 4); P(g, fur, x + (f > 0 ? 3 : -5), y - 7, 3, 3);
    P(g, dark, x + (f > 0 ? 3 : -5), y - 9, 1, 1); P(g, dark, x + (f > 0 ? 5 : -3), y - 9, 1, 1);
    P(g, dark, x + (f > 0 ? -5 : 4), y - 7 + step, 1, 3);
    P(g, dark, x - 3 + step, y - 1, 1, 2); P(g, dark, x + 2 - step, y - 1, 1, 2);
    if (o.hit) { P(g, '#FFFFFF', x - 1, y - 12, 1, 2); P(g, '#FFFFFF', x + 1, y - 13, 1, 3); }
  }
}

/** The rider from behind: their back-view sprite cropped at the hips, over panniers and a wheel. */
function drawBike(g: CanvasRenderingContext2D, look: AvatarLook, cx: number, wob: number, pedal: number, carrying: number | null, ghost: boolean) {
  const x = Math.round(cx + wob), top = BIKE_Y - 25;
  if (ghost) g.globalAlpha = 0.85;
  P(g, 'rgba(0,0,0,.22)', x - 6, BIKE_Y - 1, 13, 3);
  // Rear wheel and mudguard.
  P(g, '#2A2A30', x - 1, BIKE_Y - 8, 3, 9); P(g, '#55555E', x, BIKE_Y - 8 + pedal, 1, 3);
  P(g, '#C8483A', x - 1, BIKE_Y - 9, 3, 2);
  // Rider, then the seat post peeking out under them.
  g.drawImage(avatarSprite(look, 'idle', 'back'), 0, 0, 20, 21, x - 10, top, 20, 21);
  P(g, '#2A2A30', x - 2, top + 20, 5, 1);
  // Handlebar grips past the shoulders.
  P(g, '#2A2A30', x - 9, top + 15, 2, 2); P(g, '#2A2A30', x + 8, top + 15, 2, 2);
  // Panniers either side of the wheel.
  for (const px of [x - 8, x + 3]) {
    P(g, '#5E4630', px, BIKE_Y - 7, 6, 6); P(g, '#A8784A', px + 1, BIKE_Y - 7, 4, 5); P(g, '#C89A64', px + 1, BIKE_Y - 7, 4, 1);
  }
  // The parcel strapped on the rack, with its mailbox color on the label.
  if (carrying != null) { P(g, '#2E2A2A', x - 3, BIKE_Y - 10, 7, 4); P(g, '#D8B482', x - 2, BIKE_Y - 10, 5, 3); P(g, MAIL[carrying].c, x - 1, BIKE_Y - 9, 3, 1); }
  g.globalAlpha = 1;
}

let thumb: HTMLCanvasElement | null = null;
/** Maple Street for the job board. */
export function streetThumb(): HTMLCanvasElement {
  if (thumb) return thumb;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const st = new Street(7); st.grow(260);
  drawStreet(c.getContext('2d')!, st, 40, 0, null);
  thumb = c;
  return c;
}

function drawStreet(g: CanvasRenderingContext2D, st: Street, dist: number, t: number, target: number | null) {
  g.imageSmoothingEnabled = false;
  const sy = (at: number) => BIKE_Y - (at - dist);
  // Asphalt, center dashes and curbs.
  P(g, '#6A6A74', ROAD[0], 0, ROAD[1] - ROAD[0], H);
  const off = Math.floor(dist) % 16;
  for (let y = -16 + off; y < H; y += 16) { P(g, '#62626C', ROAD[0] + 4, y + 3, 3, 1); P(g, '#62626C', ROAD[1] - 10, y + 11, 2, 1); P(g, '#F2EEE4', 47, y, 2, 7); }
  P(g, '#B8B4AC', ROAD[0] - 1, 0, 1, H); P(g, '#B8B4AC', ROAD[1], 0, 1, H);
  // Sidewalks with tile seams.
  P(g, '#D8D0C0', 18, 0, 7, H); P(g, '#D8D0C0', 71, 0, 7, H);
  const so = Math.floor(dist) % 8;
  for (let y = -8 + so; y < H; y += 8) { P(g, '#C4BCAC', 18, y, 7, 1); P(g, '#C4BCAC', 71, y, 7, 1); }
  // Yards and houses.
  for (const l of st.lots) {
    const y0 = sy(l.at + l.len);
    if (y0 > H || y0 + l.len < 0) continue;
    g.drawImage(lotArt(l), l.side === 0 ? 0 : 78, Math.round(y0));
  }
  const wave = Math.floor(t * 4) % 2;
  for (const m of st.mail) { const y = sy(m.at); if (y > -16 && y < H + 4) drawMailbox(g, m.side === 0 ? 19 : 71, y, m, wave, m.id === target); }
  for (const o of st.obs) { const y = sy(o.at); if (y > -16 && y < H + 12) drawObstacle(g, o, y, t); }
}

// ---------- the ride ----------

interface Toss { from: [number, number]; to: [number, number]; at: number; color: number }

export function DeliveryShift({ id, role, level, resume, onEnd, onTick }: ShiftProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const together = role !== 'solo';
  const hard = difficulty(level);
  const st = useRef({
    street: new Street(hash(id), hard), t: resume?.t ?? 0, target: null as number | null, dist: 0, lane: (role === 'guest' ? 1 : 0) as 0 | 1, x: LANE_X[role === 'guest' ? 1 : 0],
    parcel: null as number | null, reload: 0.6, served: resume?.served ?? 0, missed: resume?.missed ?? 0, streak: 0, crash: 0, safe: 0, tosses: [] as Toss[], puffs: [] as { x: number; y: number; at: number }[],
    them: { lane: (role === 'guest' ? 0 : 1) as number, x: LANE_X[role === 'guest' ? 0 : 1], crash: 0, streak: 0 }, combo: 0, best: 0, bot: 2, ended: false,
  });
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const isBot = backend.mode === 'preview';
  const me = snap.value!.me.look;
  const them = partner.value?.look ?? me;

  const send = (crash = false) => { if (together) { const s = st.current; sendShift(id, { k: 'ride', lane: s.lane, crash, streak: s.streak }); } };

  useShiftEvents(id, (ev: CafeEvent) => {
    if (ev.k !== 'ride') return;
    const s = st.current;
    s.them.lane = ev.lane === 1 ? 1 : 0; s.them.streak = ev.streak;
    if (ev.crash) s.them.crash = s.t;
    rerender();
  });

  const finish = () => {
    const s = st.current;
    if (s.ended) return;
    s.ended = true;
    onEnd(s.served, s.missed);
  };

  const steer = (lane: 0 | 1) => {
    const s = st.current;
    if (s.lane === lane || s.ended) return;
    s.lane = lane; sfx('tap'); send();
  };

  const speedAt = (t: number) => (38 + 26 * hard) + 14 * Math.min(1, t / SHIFT_SECONDS);

  /**
   * The next parcel goes to one mailbox up the street, far enough ahead to see it coming and
   * switch lanes (at least a second and a half at the current speed). Only that mailbox has its
   * flag up, and the lane on its side is cleared just before it so a delivery is never forced
   * through a cone.
   */
  const loadParcel = () => {
    const s = st.current;
    const lead = speedAt(s.t) * 1.6 + 16;
    const ahead = s.street.mail.filter((m) => !m.done && m.at > s.dist + lead && m.at < s.dist + lead + 120);
    if (!ahead.length) { s.reload = 0.3; return; }
    const m = ahead[Math.floor(Math.random() * Math.min(2, ahead.length))];
    s.target = m.id; s.parcel = m.color;
    s.street.obs = s.street.obs.filter((o) => !(o.lane === m.side && o.at > m.at - 30 && o.at < m.at + 6));
  };

  /** A crash costs time and the streak, not the parcel. */
  const bump = () => {
    const s = st.current;
    s.streak = 0;
    sfx('error');
    send(true);
  };

  useEffect(() => {
    let raf = 0, last = performance.now();
    const keys = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') steer(0); if (e.key === 'ArrowRight') steer(1); };
    window.addEventListener('keydown', keys);
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const s = st.current;
      s.t += dt;
      const speed = speedAt(s.t);
      const before = s.dist;
      s.dist += speed * dt * (s.crash && s.t - s.crash < 0.7 ? 0.45 : 1);
      s.street.grow(s.dist + 200);
      s.street.trim(s.dist);
      s.x += (LANE_X[s.lane] - s.x) * Math.min(1, dt * 16);
      s.them.x += (LANE_X[s.them.lane] - s.them.x) * Math.min(1, dt * 16);
      if (s.parcel == null && s.reload > 0) { s.reload -= dt; if (s.reload <= 0) loadParcel(); }

      // The flagged mailbox passing the bike: drop the parcel if you're in its lane. The check
      // uses the lane you're steering into, so a late switch still counts.
      for (const m of s.street.mail) {
        if (m.done || m.id !== s.target || !(m.at > before - 2 && m.at <= s.dist + 2)) continue;
        m.done = true;
        if (m.side === s.lane) {
          s.served++; s.streak++;
          s.tosses.push({ from: [s.x, BIKE_Y - 12], to: [m.side === 0 ? 22 : 74, BIKE_Y - 10], at: s.t, color: m.color });
          sfx('coin');
        } else {
          s.puffs.push({ x: m.side === 0 ? 22 : 74, y: BIKE_Y - 8, at: s.t });
          s.missed++; s.streak = 0; sfx('error');
        }
        s.parcel = null; s.target = null; s.reload = 0.5;
        send();
      }
      // Cats wander across when the bike gets close.
      for (const o of s.street.obs) {
        if (o.kind !== 'cat') continue;
        const ahead = o.at - s.dist;
        if (o.hit) { o.x = (o.x ?? LANE_X[o.lane]) + (o.dir ?? 1) * 40 * dt; continue; }
        if (ahead < 95 && ahead > -10) o.x = Math.max(ROAD[0] + 4, Math.min(ROAD[1] - 4, (o.x ?? (o.dir === 1 ? ROAD[0] + 4 : ROAD[1] - 4)) + (o.dir ?? 1) * (7 + 6 * hard) * dt));
        else if (o.x == null) o.x = o.dir === 1 ? ROAD[0] + 4 : ROAD[1] - 4;
      }
      // Bumps.
      if (s.t > s.safe) for (const o of s.street.obs) {
        if (o.hit) continue;
        const dy = o.at - s.dist, ox = o.x ?? LANE_X[o.lane];
        if (dy > -3 && dy < 4 && Math.abs(ox - s.x) < (o.kind === 'puddle' ? 7 : 5)) {
          o.hit = s.t; s.crash = s.t; s.safe = s.t + 1;
          if (o.kind === 'cat') o.dir = ox < s.x ? -1 : 1;
          bump();
        }
      }
      // Preview: the pretend partner keeps riding and delivering.
      if (together && isBot) {
        s.bot -= dt;
        if (s.bot <= 0) {
          s.bot = 1.8 + Math.random() * 2.4;
          const r = Math.random();
          if (r < 0.35) s.them.lane = s.them.lane ? 0 : 1;
          else if (r < 0.88) s.them.streak++;
          else { s.them.streak = 0; s.them.crash = s.t; }
        }
      }
      const combo = together ? Math.min(s.streak, s.them.streak) : 0;
      if (combo > s.combo && combo >= 2) sfx('heart');
      s.combo = combo; s.best = Math.max(s.best, combo);
      if (s.t >= SHIFT_SECONDS) { finish(); return; }
      onTick?.({ t: s.t, served: s.served, missed: s.missed });
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const tick = setInterval(rerender, 250);
    return () => { cancelAnimationFrame(raf); clearInterval(tick); window.removeEventListener('keydown', keys); };
  }, []);

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    const s = st.current;
    drawStreet(g, s.street, s.dist, s.t, s.target);
    const pedal = Math.floor(s.dist / 6) % 2 * 4;
    const wob = (since: number) => (since > 0 && s.t - since < 0.7 ? Math.sin((s.t - since) * 40) * 2 : 0);
    if (together) {
      const sameLane = Math.abs(s.them.x - s.x) < 8;
      g.save(); g.translate(0, sameLane ? 12 : 4);
      drawBike(g, them, s.them.x, wob(s.them.crash), pedal ? 0 : 4, null, true);
      g.restore();
    }
    drawBike(g, me, s.x, wob(s.crash), pedal, s.parcel, false);
    for (const k of s.tosses) {
      const p = (s.t - k.at) / 0.35;
      if (p > 1) continue;
      const x = k.from[0] + (k.to[0] - k.from[0]) * p, y = k.from[1] + (k.to[1] - k.from[1]) * p - Math.sin(p * Math.PI) * 10;
      P(g, '#2E2A2A', x - 2, y - 1, 5, 4); P(g, '#D8B482', x - 1, y - 1, 3, 3); P(g, MAIL[k.color].c, x - 1, y, 3, 1);
    }
    s.tosses = s.tosses.filter((k) => s.t - k.at < 0.4);
    for (const f of s.puffs) { const p = s.t - f.at; for (let i = 0; i < 3; i++) P(g, 'rgba(200,200,200,.8)', f.x - 3 + i * 3, f.y - p * 14 - i, 2, 2); }
    s.puffs = s.puffs.filter((f) => s.t - f.at < 0.5);
    if (s.combo >= 2) for (const bx of [s.x, s.them.x]) { const tw = Math.floor(s.t * 6) % 2; P(g, '#FFE27A', bx - 8 + tw * 2, BIKE_Y - 28, 1, 1); P(g, '#FFE27A', bx + 7 - tw * 2, BIKE_Y - 26, 1, 1); }
    // A little haze up the street so things fade in instead of popping.
    const fog = g.createLinearGradient(0, 0, 0, 18);
    fog.addColorStop(0, 'rgba(242,238,228,.75)'); fog.addColorStop(1, 'rgba(242,238,228,0)');
    g.fillStyle = fog; g.fillRect(0, 0, W, 18);
  };

  const tapCanvas = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    steer(e.clientX - r.left < r.width / 2 ? 0 : 1);
  };

  const s = st.current;
  const left = Math.max(0, Math.ceil(SHIFT_SECONDS - s.t));
  const M = s.parcel != null ? MAIL[s.parcel] : null;
  const tgt = s.target != null ? s.street.mail.find((m) => m.id === s.target) : undefined;
  return (
    <div class="col">
      <ShiftHud label={role === 'solo' ? 'Solo' : role === 'host' ? 'You: left lane' : 'You: right lane'} served={s.served} missed={s.missed} left={left}>
        {s.combo >= 2 && <span class="chip combo">Combo ×{s.combo}</span>}
      </ShiftHud>
      <div class="cafe pbox street" style={{ aspectRatio: `${W}/${H}` }}>
        <canvas ref={canvas} width={W} height={H} onPointerDown={tapCanvas as never} />
      </div>
      <div class="row" style={{ justifyContent: 'center' }}>
        <span class="chip parcel">{M && tgt ? <><i style={{ background: M.c }} />{tgt.side === 0 ? '◀ ' : ''}{M.name} mailbox on the {tgt.side === 0 ? 'left' : 'right'}{tgt.side === 1 ? ' ▶' : ''}</> : 'Grabbing the next parcel…'}</span>
      </div>
      <div class="row">
        <button class="btn soft grow lane-btn" aria-pressed={s.lane === 0} onPointerDown={() => steer(0)}>◀ Left</button>
        <button class="btn soft grow lane-btn" aria-pressed={s.lane === 1} onPointerDown={() => steer(1)}>Right ▶</button>
      </div>
      <p class="tiny muted center" style={{ margin: 0 }}>
        Ride in the lane next to the mailbox with its flag up to drop your parcel in. Bumping into things slows you down. Tap either side of the street to switch lanes.
        {together ? ` Keep deliveries going with ${partner.value?.name ?? 'your partner'} for a shared combo.` : ''}
      </p>
    </div>
  );
}
