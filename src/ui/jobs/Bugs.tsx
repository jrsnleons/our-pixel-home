// Bug Squad, a desk job. Bugs crawl down the code on your monitor toward the build bar at the
// bottom; tap one and the little zapper on the desk fires at it. Higher levels bring faster
// bugs, armored bugs that take two zaps, bugs that split in two, and the rubber duck, who is
// helping and must not be zapped. Together, you each guard your own screen and squash streaks
// you both keep up build a shared combo.

import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { difficulty } from '../../data/economy';
import { dither } from '../../engine/art/pixel';
import type { CafeEvent } from '../../net/types';
import { backend, partner, toast } from '../../state/store';
import { SHIFT_SECONDS, sendShift, ShiftHud, useShiftEvents, type ShiftProps } from './common';

const W = 96, H = 124;
/** The code area inside the monitor; the build bar sits just under it. */
const SCR = { x: 6, y: 6, w: 84, h: 92 };
const BUILD_Y = SCR.y + SCR.h - 6;
const GUN = { x: W / 2, y: 112 };

const P = (g: CanvasRenderingContext2D, c: string, x: number, y: number, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

type Kind = 'bug' | 'armor' | 'split' | 'mini' | 'duck';
interface Bug { id: number; kind: Kind; x: number; y: number; hp: number; speed: number; phase: number; wig: number; born: number }
interface Splat { x: number; y: number; at: number; c: string }
interface Beam { x: number; y: number; at: number; hit: boolean }

const SHELL: Record<Kind, [string, string, string]> = {
  bug: ['#1E3A1E', '#4AA84A', '#8AE07A'],
  armor: ['#4A1418', '#B83A3A', '#F07A6A'],
  split: ['#2E1A4A', '#8A5AC8', '#C8A0F0'],
  mini: ['#2E1A4A', '#8A5AC8', '#C8A0F0'],
  duck: ['#8A6010', '#F2C230', '#FFE27A'],
};

/** Lines of code on the monitor, as colored runs, generated once. */
const CODE = (() => {
  const cols = ['#7AA2F7', '#9ECE6A', '#E0AF68', '#BB9AF7', '#C0CAF5', '#F7768E', '#565F89'];
  const lines: [number, number, string][][] = [];
  let seed = 11;
  const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 40; i++) {
    const row: [number, number, string][] = [];
    let x = 2 + Math.floor(r() * 4) * 4;
    while (x < 70) { const w = 3 + Math.floor(r() * 10); row.push([x, w, cols[Math.floor(r() * cols.length)]]); x += w + 2 + Math.floor(r() * 3); if (r() < 0.2) break; }
    lines.push(row);
  }
  return lines;
})();

function drawBug(g: CanvasRenderingContext2D, b: Bug, t: number) {
  const [d, m, l] = SHELL[b.kind];
  const x = Math.round(b.x), y = Math.round(b.y), step = Math.floor((t + b.phase) * 10) % 2;
  if (b.kind === 'duck') {
    // A rubber duck waddling down the screen: it's helping, leave it be.
    P(g, d, x - 3, y - 2, 7, 5); P(g, m, x - 2, y - 2, 5, 4); P(g, l, x - 2, y - 2, 2, 1);
    P(g, d, x - 1, y - 5, 4, 3); P(g, m, x, y - 5, 2, 2); P(g, '#1E1A2A', x + 1, y - 4);
    P(g, '#F07A2A', x + 3, y - 4, 2, 1);
    P(g, '#F07A2A', x - 2 + step, y + 3, 2, 1);
    return;
  }
  const s = b.kind === 'mini' ? 0.7 : 1;
  const w = Math.round(7 * s), h = Math.round(6 * s), x0 = x - (w >> 1), y0 = y - (h >> 1);
  // Legs tick back and forth as it crawls.
  for (let i = 0; i < 3; i++) {
    const ly = y0 + 1 + i * Math.max(1, Math.round(2 * s));
    P(g, d, x0 - 1 - ((i + step) % 2), ly); P(g, d, x0 + w + ((i + step) % 2), ly);
  }
  P(g, d, x0, y0, w, h); P(g, m, x0 + 1, y0 + 1, w - 2, h - 2);
  P(g, l, x0 + 1, y0 + 1, 1, 1);
  P(g, d, x0 + (w >> 1), y0 + 1, 1, h - 2); // the line between the wing cases
  P(g, d, x0 + 1, y0 - 1, w - 2, 1); P(g, '#F2EEE4', x0 + 1, y0 - 1); P(g, '#F2EEE4', x0 + w - 2, y0 - 1);
  // Antennae.
  P(g, d, x0, y0 - 2 - step); P(g, d, x0 + w - 1, y0 - 2 - (1 - step));
  if (b.kind === 'armor') {
    P(g, '#E8E0D4', x0 + 1, y0 + h - 2, w - 2, 1);
    if (b.hp < 2) { P(g, '#1E1A2A', x0 + 2, y0 + 2); P(g, '#1E1A2A', x0 + 3, y0 + 3); P(g, '#1E1A2A', x0 + 4, y0 + 2); }
  }
}

let frame: HTMLCanvasElement | null = null;
/** The desk: monitor bezel, a dark code editor, the build bar, and the zapper's cradle. */
export function deskBackdrop(): HTMLCanvasElement {
  if (frame) return frame;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const R = (col: string, x: number, y: number, w = 1, h = 1) => P(g, col, x, y, w, h);
  // Desk wood under everything, a wall above.
  R('#C8B49A', 0, 0, W, H);
  dither(g, '#BCA68A', '#C8B49A', 0, 0, W, 4, 0.5);
  R('#8A5A36', 0, 102, W, H - 102); R('#A06A40', 0, 102, W, 1);
  for (let x = 0; x < W; x += 16) R('#7A4E2E', x, 103, 1, H - 103);
  // Monitor bezel and stand.
  R('#24222A', 2, 2, W - 4, SCR.h + 9); R('#3A3844', 3, 3, W - 6, SCR.h + 7); R('#4A4856', 3, 3, W - 6, 1);
  R('#24222A', 42, SCR.h + 11, 12, 4); R('#3A3844', 36, SCR.h + 14, 24, 2);
  R('#7AE07A', W - 9, SCR.h + 7, 2, 1); // power light
  // Editor.
  R('#1A1B26', SCR.x, SCR.y, SCR.w, SCR.h);
  R('#24283B', SCR.x, SCR.y, 7, SCR.h);
  for (let i = 0; i < 14; i++) R('#3B4261', SCR.x + 2, SCR.y + 3 + i * 6, 3, 1);
  // A mug and a sticky note on the desk.
  R('#2E2A2A', 7, 106, 9, 10); R('#E8506A', 8, 107, 7, 8); R('#FFFFFF', 9, 109, 2, 2); R('#2E2A2A', 16, 108, 2, 5); R('#5A3622', 8, 107, 7, 1);
  R('#2E2A2A', 76, 105, 14, 12); R('#FFE27A', 77, 106, 12, 10); R('#C8A030', 79, 109, 7, 1); R('#C8A030', 79, 112, 5, 1);
  frame = c;
  return c;
}

/** The job board picture: the editor with a few bugs on it. */
export function bugsThumb(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.drawImage(deskBackdrop(), 0, 0);
  for (let i = 0; i < 15; i++) for (const [x, w, col] of CODE[i]) P(g, col, SCR.x + 7 + x, SCR.y + 3 + i * 6, w, 2);
  const bugs: [Kind, number, number][] = [['bug', 24, 18], ['armor', 60, 30], ['bug', 40, 50], ['split', 70, 66], ['duck', 30, 80]];
  bugs.forEach(([kind, x, y], i) => drawBug(g, { id: i, kind, x, y, hp: 2, speed: 0, phase: i, wig: 0, born: 0 }, 0));
  return c;
}

export function BugShift({ id, role, level, resume, onEnd, onTick }: ShiftProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hard = difficulty(level);
  const together = role !== 'solo';
  const isBot = backend.mode === 'preview';
  const st = useRef({
    bugs: [] as Bug[], splats: [] as Splat[], beams: [] as Beam[], n: 1, t: resume?.t ?? 0, nextSpawn: 0.8, cool: 0,
    aim: 0, served: resume?.served ?? 0, missed: resume?.missed ?? 0, streak: 0, scroll: 0, shake: 0,
    them: { streak: 0 }, combo: 0, bot: 1.5, ended: false,
  });
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const name = partner.value?.name ?? 'Partner';

  const send = () => { if (together) sendShift(id, { k: 'desk', streak: st.current.streak, served: st.current.served }); };
  useShiftEvents(id, (ev: CafeEvent) => { if (ev.k === 'desk') { st.current.them.streak = ev.streak; rerender(); } });

  const finish = () => {
    const s = st.current;
    if (s.ended) return;
    s.ended = true;
    onEnd(s.served, s.missed);
  };

  const spawn = () => {
    const s = st.current;
    const r = Math.random();
    const kind: Kind = hard >= 0.35 && r < 0.05 + 0.04 * hard ? 'duck'
      : hard >= 0.25 && r < 0.3 ? 'armor'
      : hard >= 0.55 && r < 0.5 ? 'split' : 'bug';
    const speed = (9 + 11 * hard + 5 * Math.min(1, s.t / SHIFT_SECONDS)) * (kind === 'duck' ? 0.8 : kind === 'armor' ? 0.8 : 1) * (0.85 + Math.random() * 0.3);
    s.bugs.push({ id: s.n++, kind, x: SCR.x + 14 + Math.random() * (SCR.w - 22), y: SCR.y + 2, hp: kind === 'armor' ? 2 : 1, speed, phase: Math.random() * 6, wig: 3 + Math.random() * (4 + 6 * hard), born: s.t });
  };

  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
      const s = st.current;
      s.t += dt; s.cool -= dt; s.scroll += dt * 2;
      s.nextSpawn -= dt;
      if (s.nextSpawn <= 0 && s.t < SHIFT_SECONDS - 3) {
        spawn();
        s.nextSpawn = Math.max(0.55, 1.7 - 0.85 * hard - s.t / 150) * (0.75 + Math.random() * 0.5);
      }
      for (const b of s.bugs) {
        b.y += b.speed * dt;
        b.x += Math.cos((s.t + b.phase) * (1.2 + hard)) * b.wig * dt;
        b.x = Math.max(SCR.x + 9, Math.min(SCR.x + SCR.w - 4, b.x));
      }
      // Bugs that reach the build break it; the duck just waddles off.
      const through = s.bugs.filter((b) => b.y >= BUILD_Y);
      for (const b of through) {
        if (b.kind === 'duck') continue;
        s.missed++; s.streak = 0; s.shake = s.t; sfx('error'); send();
      }
      s.bugs = s.bugs.filter((b) => b.y < BUILD_Y);
      if (together && isBot) {
        s.bot -= dt;
        if (s.bot <= 0) { s.bot = 0.9 + Math.random() * 1.6; s.them.streak = Math.random() < 0.9 ? s.them.streak + 1 : 0; }
      }
      const combo = together ? Math.min(s.streak, s.them.streak) : 0;
      if (combo > s.combo && combo >= 3 && combo % 3 === 0) sfx('heart');
      s.combo = combo;
      if (s.t >= SHIFT_SECONDS) { finish(); return; }
      onTick?.({ t: s.t, served: s.served, missed: s.missed });
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const tick = setInterval(rerender, 250);
    return () => { cancelAnimationFrame(raf); clearInterval(tick); };
  }, []);

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    const s = st.current;
    g.imageSmoothingEnabled = false;
    g.drawImage(deskBackdrop(), 0, 0);
    // Scrolling code.
    g.save();
    g.beginPath(); g.rect(SCR.x + 7, SCR.y, SCR.w - 7, SCR.h); g.clip();
    const off = Math.floor(s.scroll) % 6;
    for (let i = 0; i < 17; i++) {
      const row = CODE[(i + Math.floor(s.scroll / 6)) % CODE.length];
      for (const [x, w, col] of row) P(g, col, SCR.x + 7 + x, SCR.y + 3 + i * 6 - off, w, 2);
    }
    g.restore();
    // The build bar: green while it's passing, flashing red when a bug gets through.
    const red = s.t - s.shake < 0.4 && s.shake > 0;
    P(g, '#1E1A2A', SCR.x, BUILD_Y, SCR.w, 6);
    P(g, red ? '#E8414A' : '#3A8A4A', SCR.x + 1, BUILD_Y + 1, SCR.w - 2, 4);
    P(g, red ? '#FF8A8A' : '#6AD07A', SCR.x + 1, BUILD_Y + 1, SCR.w - 2, 1);
    for (let i = 0; i < 5; i++) P(g, '#F2EEE4', SCR.x + 4 + i * 2, BUILD_Y + 2, 1, 2);
    for (const b of s.bugs) drawBug(g, b, s.t);
    for (const sp of s.splats) {
      const p = (s.t - sp.at) / 0.5;
      for (let i = 0; i < 6; i++) { const a = i * 1.05; P(g, sp.c, sp.x + Math.cos(a) * p * 6, sp.y + Math.sin(a) * p * 6, 1, 1); }
      P(g, sp.c, sp.x - 1, sp.y - 1, 3, 3);
    }
    s.splats = s.splats.filter((sp) => s.t - sp.at < 0.5);
    // The zapper: a little dish on the desk that turns toward where you tapped.
    const ax = Math.sin(s.aim), ay = -Math.cos(s.aim);
    for (const bm of s.beams) {
      const p = 1 - (s.t - bm.at) / 0.12;
      if (p <= 0) continue;
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const x = GUN.x + ax * 6 + (bm.x - GUN.x - ax * 6) * (i / steps), y = GUN.y + ay * 6 + (bm.y - GUN.y - ay * 6) * (i / steps);
        P(g, i % 2 ? '#7AF0FF' : '#FFFFFF', x, y, 1, 1);
      }
      if (!bm.hit) P(g, '#7AF0FF', bm.x - 1, bm.y - 1, 3, 3);
    }
    s.beams = s.beams.filter((bm) => s.t - bm.at < 0.12);
    P(g, '#24222A', GUN.x - 6, GUN.y + 2, 13, 6); P(g, '#5A5866', GUN.x - 5, GUN.y + 2, 11, 4); P(g, '#7A7886', GUN.x - 5, GUN.y + 2, 11, 1);
    for (let i = 0; i < 6; i++) P(g, '#24222A', GUN.x + ax * i - 1, GUN.y + ay * i - 1, 3, 3);
    for (let i = 0; i < 6; i++) P(g, i > 3 ? '#7AF0FF' : '#9A98A6', GUN.x + ax * i, GUN.y + ay * i, 1, 1);
    if (s.combo >= 3) { const tw = Math.floor(s.t * 6) % 2; P(g, '#FFE27A', 10 + tw, 10, 1, 1); P(g, '#FFE27A', W - 12 - tw, 12, 1, 1); }
  };

  const tap = (e: PointerEvent) => {
    const s = st.current;
    if (s.ended || s.cool > 0) return;
    const r = canvas.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    s.cool = 0.16;
    s.aim = Math.atan2(x - GUN.x, GUN.y - y);
    // Fingers are big: take the nearest bug within a generous radius.
    let best: Bug | null = null, bd = 10;
    for (const b of s.bugs) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } }
    s.beams.push({ x: best?.x ?? x, y: best?.y ?? y, at: s.t, hit: !!best });
    sfx('tap');
    if (!best) return;
    if (best.kind === 'duck') {
      s.bugs = s.bugs.filter((b) => b !== best);
      s.missed++; s.streak = 0; sfx('error'); toast('Not the duck! It was helping you debug.'); send();
      return;
    }
    best.hp--;
    if (best.hp > 0) { sfx('pop'); return; }
    s.bugs = s.bugs.filter((b) => b !== best);
    s.splats.push({ x: best.x, y: best.y, at: s.t, c: SHELL[best.kind][1] });
    if (best.kind === 'split') {
      for (const dx of [-5, 5]) s.bugs.push({ ...best, id: s.n++, kind: 'mini', x: best.x + dx, hp: 1, speed: best.speed * 1.25, phase: Math.random() * 6 });
    }
    s.served++; s.streak++;
    sfx('coin');
    send();
  };

  const s = st.current;
  const left = Math.max(0, Math.ceil(SHIFT_SECONDS - s.t));
  return (
    <div class="col">
      <ShiftHud label={role === 'solo' ? 'Solo' : role === 'host' ? 'You: left screen' : 'You: right screen'} served={s.served} missed={s.missed} left={left}>
        {s.combo >= 3 && <span class="chip combo">Combo ×{s.combo}</span>}
      </ShiftHud>
      <div class="cafe pbox street" style={{ aspectRatio: `${W}/${H}` }}>
        <canvas ref={canvas} width={W} height={H} onPointerDown={tap as never} />
      </div>
      <p class="tiny muted center" style={{ margin: 0 }}>
        Tap a bug to zap it before it reaches the build bar.
        {hard >= 0.25 ? ' Red bugs take two zaps.' : ''}{hard >= 0.55 ? ' Purple ones split in two.' : ''}{hard >= 0.35 ? ' Never zap the duck.' : ''}
        {together ? ` Keep squashing with ${name} for a shared combo.` : ''}
      </p>
    </div>
  );
}
