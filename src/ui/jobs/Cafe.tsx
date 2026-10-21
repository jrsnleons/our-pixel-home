// The café: read each customer's order, make the drink and hand it over. Together, the host
// takes orders at the counter and the guest makes drinks; the tickets travel between phones.

import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { dither } from '../../engine/art/pixel';
import type { AvatarLook } from '../../engine/art/avatar';
import type { CafeEvent } from '../../net/types';
import { backend, partner, toast } from '../../state/store';
import { difficulty } from '../../data/economy';
import { avatarSprite, customerLook, SHIFT_SECONDS, sendShift, ShiftHud, useShiftEvents, type ShiftProps } from './common';

// ---------- drinks ----------

export const DRINKS = [
  { key: 'coffee', name: 'Coffee', cup: '#F2EEE4', top: '#5A3622' },
  { key: 'latte', name: 'Latte', cup: '#F2EEE4', top: '#D8B08A', art: true },
  { key: 'tea', name: 'Tea', cup: '#C8E0D0', top: '#C88A3A', tag: true },
  { key: 'cocoa', name: 'Cocoa', cup: '#E8506A', top: '#6A3A2A', mallow: true },
  { key: 'matcha', name: 'Matcha', cup: '#F2EEE4', top: '#8AB060' },
  { key: 'berry', name: 'Strawberry milk', cup: '#FFFFFF', top: '#F2A7C3', straw: true },
] as const;
type DrinkKey = typeof DRINKS[number]['key'];

/** Extras the café adds from level 3: ice, then whipped cream, then caramel. */
export const MODS = [
  { key: 'ice', name: 'Iced', from: 0.2 },
  { key: 'whip', name: 'Whipped cream', from: 0.45 },
  { key: 'caramel', name: 'Caramel', from: 0.65 },
] as const;
type ModKey = typeof MODS[number]['key'];

const sameMods = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

function drawCup(g: CanvasRenderingContext2D, x: number, y: number, d: typeof DRINKS[number], s = 1, mods: readonly string[] = []) {
  const o = '#3A2418';
  const P = (c: string, px: number, py: number, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x + px * s, y + py * s, w * s, h * s); };
  P(o, 1, 2, 8, 1); P(o, 1, 3, 1, 6); P(o, 8, 3, 1, 6); P(o, 2, 9, 6, 1);
  P(d.cup, 2, 3, 6, 6); P('rgba(0,0,0,.12)', 6, 3, 2, 6);
  P(d.top, 2, 3, 6, 2);
  if ('art' in d) P('#FFF6E8', 4, 3, 2, 1);
  if ('mallow' in d) { P('#FFFFFF', 3, 2, 2, 1); P('#FFFFFF', 5, 2, 1, 1); }
  if ('tag' in d) { P('#E8E0D0', 8, 5, 1, 1); P('#E8E0D0', 9, 6, 1, 2); }
  if ('straw' in d) { P('#E8414A', 6, 0, 1, 3); }
  P(o, 9, 4, 1, 3); P(o, 10, 5, 0.5, 1);
  if (mods.includes('ice')) { P('#DDF2FA', 2, 3, 2, 2); P('#FFFFFF', 2, 3); P('#DDF2FA', 5, 4, 2, 1); P('rgba(120,190,230,.45)', 2, 5, 6, 4); }
  if (mods.includes('whip')) { P(o, 2, 0, 6, 1); P(o, 1, 1, 1, 2); P(o, 8, 1, 1, 2); P('#FFFDF6', 2, 1, 6, 2); P('#FFFDF6', 3, 0, 4, 1); P('#E8E0D0', 6, 2, 2, 1); }
  if (mods.includes('caramel')) { P('#C8782A', 3, mods.includes('whip') ? 1 : 3, 1, 1); P('#E89A3A', 4, mods.includes('whip') ? 0 : 3, 2, 1); P('#C8782A', 6, mods.includes('whip') ? 1 : 4, 1, 1); P('#C8782A', 7, 6, 1, 2); }
}

const cupUrls = new Map<string, string>();
function cupUrl(k: DrinkKey, mods: readonly string[] = []) {
  const key = k + mods.join();
  let u = cupUrls.get(key);
  if (!u) {
    const c = document.createElement('canvas'); c.width = 11; c.height = 11;
    drawCup(c.getContext('2d')!, 0, 0, DRINKS.find((d) => d.key === k)!, 1, mods);
    u = c.toDataURL(); cupUrls.set(key, u);
  }
  return u;
}

/** Extras for one order: none at level 1-2, one at most until level 7, up to three at the top. */
function orderMods(hard: number): ModKey[] {
  const open = MODS.filter((m) => hard >= m.from).map((m) => m.key);
  if (!open.length || Math.random() < 0.45 - hard * 0.3) return [];
  const most = hard >= 0.85 ? 3 : hard >= 0.65 ? 2 : 1;
  const n = 1 + Math.floor(Math.random() * Math.min(most, open.length));
  return open.sort(() => Math.random() - 0.5).slice(0, n);
}

// ---------- shift ----------

interface Customer { id: number; seat: number; drink: DrinkKey; mods: ModKey[]; born: number; patience: number; taken: boolean; ready: boolean; leaving: number; happy: boolean; look: AvatarLook }

let backdrop: HTMLCanvasElement | null = null;
/** The café behind the counter: menu board, shelf, pendant lamps and a window onto the street. */
export function cafeBackdrop(): HTMLCanvasElement {
  if (backdrop) return backdrop;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const R = (col: string, x: number, y: number, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const o = '#3A2418';
  // Plaster wall with a soft dither toward the ceiling, wainscot below.
  R('#EAD6B4', 0, 0, W, 44);
  dither(g, '#DDC59E', '#EAD6B4', 0, 0, W, 4, 0.5);
  R('#DDC59E', 0, 0, W, 2);
  R('#8A5A36', 0, 40, W, 20); R('#A06A40', 0, 40, W, 1); R('#6E4428', 0, 43, W, 1);
  for (let x = 2; x < W; x += 14) { R('#7A4E2E', x, 45, 11, 13); R('#9A6440', x, 45, 11, 1); R('#5E3A22', x, 57, 11, 1); }
  // Menu board.
  R(o, 5, 4, 42, 27); R('#8A5A36', 6, 5, 40, 25); R('#26352E', 8, 7, 36, 21);
  dither(g, '#26352E', '#2C3E35', 8, 7, 36, 21, 0.15);
  R('#F2EEE4', 13, 9, 10, 1); R('#F2EEE4', 24, 9, 4, 1); R('#E8C860', 30, 9, 9, 1);
  const dots = ['#5A3622', '#D8B08A', '#C88A3A', '#E8506A', '#8AB060', '#F2A7C3'];
  dots.forEach((d, i) => {
    const col = i < 3 ? 0 : 1, row = i % 3;
    const x = 10 + col * 18, y = 13 + row * 5;
    R('#F2EEE4', x, y, 3, 3); R(d, x, y, 3, 1);
    R('#C8C4BA', x + 5, y + 1, 6 + ((i * 3) % 4), 1); R('#E8C860', x + 13, y + 1, 2, 1);
  });
  // Window with a striped awning and the street across the way.
  R(o, 83, 4, 38, 31); R('#8A5A36', 84, 5, 36, 29);
  R('#BFE2F2', 86, 7, 32, 25); R('#D6EEF6', 86, 7, 32, 8);
  R('#C9A0A0', 88, 18, 10, 14); R('#B08888', 88, 18, 10, 1); R('#E8D2A0', 90, 21, 2, 3); R('#E8D2A0', 94, 21, 2, 3); R('#E8D2A0', 90, 26, 2, 3);
  R('#A8B8C8', 100, 14, 16, 18); R('#90A0B0', 100, 14, 16, 1); for (let i = 0; i < 3; i++) R('#FFF2C0', 103 + i * 4, 18, 2, 3);
  R('#7A9A60', 86, 30, 32, 2);
  R('#8A5A36', 101, 7, 2, 25); R('#8A5A36', 86, 18, 32, 1);
  R('rgba(255,255,255,.35)', 88, 9, 1, 6); R('rgba(255,255,255,.35)', 89, 8, 3, 1);
  for (let i = 0; i < 9; i++) R(i % 2 ? '#F2EEE4' : '#C8483A', 82 + i * 4.5, 1, 5, 4);
  R(o, 82, 5, 40, 1);
  // Shelf with jars and a trailing plant.
  R(o, 52, 31, 26, 2); R('#A06A40', 52, 31, 26, 1);
  const jars: [number, string, number][] = [[54, '#C88A3A', 7], [59, '#8AB060', 5], [63, '#F2EEE4', 8], [68, '#5A3622', 6], [73, '#E8506A', 5]];
  for (const [x, col, h] of jars) { R(o, x - 1, 31 - h - 1, 5, h + 1); R('rgba(230,240,240,.85)', x, 31 - h, 3, h); R(col, x, 31 - Math.ceil(h * 0.6), 3, Math.ceil(h * 0.6)); R('#6E4428', x, 31 - h - 1, 3, 1); }
  R('#C8643B', 62, 33, 5, 3); R('#8AB060', 60, 36, 2, 2); R('#6E8B3D', 66, 36, 1, 4); R('#8AB060', 64, 36, 1, 6); R('#6E8B3D', 61, 38, 1, 3);
  // Pendant lamps.
  for (const x of [34, 64, 100]) {
    if (x === 100) continue;
    R('#3A2418', x, 0, 1, 8); R(o, x - 3, 8, 7, 3); R('#2F5A4A', x - 2, 8, 5, 2); R('#FFE7A0', x - 1, 11, 3, 1);
  }
  // Counter: lit top edge, planked front, shadow line.
  R('#5E3A22', 0, 58, W, 2);
  R('#C8884E', 0, 60, W, 1); R('#A86A3D', 0, 61, W, 3); R('#8A5530', 0, 64, W, 1);
  R('#7A4E2E', 0, 65, W, 19);
  for (let x = 4; x < W; x += 10) { R('#6A4228', x, 66, 1, 18); R('#8A5A36', x + 1, 66, 1, 18); }
  R('#5E3A22', 0, 80, W, 4);
  backdrop = c;
  return c;
}

const W = 128, H = 84, SEATS = 4;

export function CafeShift({ id, role, level, resume, onEnd, onTick }: ShiftProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hard = difficulty(level);
  const mods = MODS.filter((m) => hard >= m.from);
  const brewTime = 1.2 - 0.3 * hard;
  const st = useRef({ customers: [] as Customer[], nextId: 1, nextSpawn: 1.5, t: resume?.t ?? 0, served: resume?.served ?? 0, missed: resume?.missed ?? 0, brewing: null as null | { drink: DrinkKey; done: number; forId?: number }, holding: null as DrinkKey | null, holdingFor: undefined as number | undefined, extras: [] as ModKey[], tickets: [] as { id: number; drink: DrinkKey; mods: ModKey[]; seat: number; made: boolean }[], ended: false });
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const together = role !== 'solo';
  const isBot = backend.mode === 'preview';
  const duration = SHIFT_SECONDS;
  const name = partner.value?.name ?? 'Partner';

  const send = (ev: CafeEvent) => { if (together) sendShift(id, ev); };

  // The partner's half of the shift.
  useShiftEvents(id, (ev) => {
    const s = st.current;
    if (ev.k === 'order' && role === 'guest') { s.tickets.push({ id: ev.id, drink: ev.drink as DrinkKey, mods: (ev.mods ?? []) as ModKey[], seat: ev.seat, made: false }); sfx('bell'); }
    if (ev.k === 'ready' && role === 'host') { const c = s.customers.find((x) => x.id === ev.id); if (c) { c.ready = true; sfx('pop'); } }
    if (ev.k === 'served' && role === 'guest') { s.served += ev.ok ? 1 : 0; s.missed += ev.ok ? 0 : 1; s.tickets = s.tickets.filter((t) => t.id !== ev.id); }
    if (ev.k === 'end' && role === 'guest') { s.served = ev.served; s.missed = ev.missed; finish(); }
    rerender();
  });

  const finish = () => {
    const s = st.current;
    if (s.ended) return;
    s.ended = true;
    if (role === 'host') send({ k: 'end', served: s.served, missed: s.missed });
    onEnd(s.served, s.missed);
  };


  // Main loop (cashier and solo run the customers; the barista only shows tickets).
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const s = st.current;
      s.t += dt;
      if (role !== 'guest') {
        s.nextSpawn -= dt;
        const free = [...Array(SEATS).keys()].filter((k) => !s.customers.some((c) => c.seat === k && c.leaving === 0));
        if (s.nextSpawn <= 0 && free.length && s.t < duration - 8) {
          const seat = free[Math.floor(Math.random() * free.length)];
          const n = s.nextId++;
          const menu = together || hard >= 0.2 ? 6 : 4 + Math.min(2, Math.floor(s.t / 30));
          const extra = orderMods(hard);
          s.customers.push({ id: n, seat, drink: DRINKS[Math.floor(Math.random() * menu)].key, mods: extra, born: s.t, patience: (together ? 28 : 22) - 7 * hard + extra.length * 3, taken: !together, ready: false, leaving: 0, happy: false, look: customerLook(n) });
          s.nextSpawn = Math.max(2.6, 6 - s.t / 25 - 1.6 * hard) * (together ? 0.85 : 1) * (0.8 + Math.random() * 0.4);
        }
        for (const c of s.customers) {
          if (c.leaving) { c.leaving += dt; continue; }
          if (s.t - c.born > c.patience) { c.leaving = 0.01; c.happy = false; s.missed++; sfx('error'); if (together) send({ k: 'served', id: c.id, ok: false }); }
        }
        s.customers = s.customers.filter((c) => c.leaving < 1.2);
      }
      if (s.brewing && s.t >= s.brewing.done) {
        const b = s.brewing; s.brewing = null; sfx('pop');
        s.holding = b.drink; s.holdingFor = b.forId; s.extras = [];
        // With nothing extra to add, the barista's cup goes straight to the counter.
        if (role === 'guest') { const tk = s.tickets.find((x) => x.id === b.forId); if (tk && !tk.mods.length) handOver(); }
      }
      // Preview: the pretend partner makes drinks a moment after each order.
      if (role === 'host' && isBot) {
        for (const c of s.customers) if (c.taken && !c.ready && !c.leaving && s.t - c.born > 0 && !(c as Customer & { botAt?: number }).botAt) (c as Customer & { botAt?: number }).botAt = s.t + 2.5 + Math.random() * 2;
        for (const c of s.customers) { const bc = c as Customer & { botAt?: number }; if (bc.botAt && !c.ready && s.t >= bc.botAt) { c.ready = true; sfx('pop'); } }
      }
      if (s.t >= duration) { finish(); return; }
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
    g.drawImage(cafeBackdrop(), 0, 0);
    // Warm pools of light under the pendants.
    for (const x of [34, 64]) {
      const r = g.createRadialGradient(x, 12, 1, x, 12, 26);
      r.addColorStop(0, 'rgba(255,220,140,.32)'); r.addColorStop(1, 'rgba(255,220,140,0)');
      g.fillStyle = r; g.fillRect(x - 26, 0, 52, 58);
    }
    // Customers behind the counter.
    for (const cu of s.customers) {
      const x = 10 + cu.seat * 30, wait = s.t - cu.born;
      const y = 43 + (cu.leaving ? cu.leaving * 30 : Math.max(0, 6 - wait * 12));
      const frame = cu.leaving ? (cu.happy ? 'cheer' : 'idle') : Math.floor((s.t + cu.id * 0.37) * 1.6) % 2 ? 'idle2' : 'idle';
      g.save();
      g.beginPath(); g.rect(0, 0, W, 59); g.clip(); // the counter hides their legs
      g.drawImage(avatarSprite(cu.look, frame), x - 1, y - 3);
      g.restore();
      if (cu.leaving && !cu.happy) { g.fillStyle = '#6AA0E0'; g.fillRect(x + 15, y + 1, 1, 2); }
    // Order bubble and patience bar.
      if (!cu.leaving) {
        g.fillStyle = '#FFFFFF'; g.fillRect(x + 1, y - 17, 16, 13); g.fillRect(x + 7, y - 4, 3, 2);
        g.fillStyle = '#3A2418'; g.fillRect(x + 1, y - 18, 16, 1); g.fillRect(x + 1, y - 4, 16, 1); g.fillRect(x, y - 17, 1, 13); g.fillRect(x + 17, y - 17, 1, 13);
        if (cu.taken) drawCup(g, x + 4, y - 15, DRINKS.find((d) => d.key === cu.drink)!, 1, cu.mods);
        else { g.fillStyle = '#3A2418'; g.fillRect(x + 7, y - 15, 4, 1); g.fillRect(x + 10, y - 14, 1, 3); g.fillRect(x + 8, y - 12, 2, 1); g.fillRect(x + 8, y - 9, 2, 2); }
        const left = Math.max(0, 1 - wait / cu.patience);
        g.fillStyle = '#3A2418'; g.fillRect(x + 1, y - 22, 16, 3);
        g.fillStyle = left > 0.5 ? '#5CB85C' : left > 0.25 ? '#F2C230' : '#E8414A'; g.fillRect(x + 2, y - 21, Math.round(14 * left), 1);
        if (cu.ready) { g.fillStyle = '#FFF2B0'; g.fillRect(x + 15, y - 19, 3, 3); }
      }
    }
    // Ready cups waiting on the counter (together) and the cup in hand (solo).
    for (const cu of s.customers) if (cu.ready && !cu.leaving) drawCup(g, 12 + cu.seat * 30, 51, DRINKS.find((d) => d.key === cu.drink)!, 1, cu.mods);
    if (s.holding && role === 'solo') drawCup(g, W / 2 - 5, 66, DRINKS.find((d) => d.key === s.holding)!, 1, s.extras);
    if (s.brewing) { const p = 1 - (s.brewing.done - s.t) / brewTime; g.fillStyle = '#3A2418'; g.fillRect(W / 2 - 12, 78, 24, 4); g.fillStyle = '#F2C230'; g.fillRect(W / 2 - 11, 79, Math.round(22 * p), 2); }
  };

  const tapCanvas = (e: PointerEvent) => {
    if (role === 'guest') return;
    const r = canvas.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const seat = Math.floor((x - 6) / 30);
    const s = st.current;
    const c = s.customers.find((q) => q.seat === seat && !q.leaving);
    if (!c) return;
    if (!c.taken) {
      c.taken = true; sfx('tap');
      send({ k: 'order', id: c.id, drink: c.drink, mods: c.mods, seat: c.seat });
      return;
    }
    if (role === 'host') {
      if (!c.ready) { toast(`${name} is still making it.`); return; }
      serve(c, true);
      return;
    }
    if (!s.holding) { toast('Make a drink first.'); return; }
    serve(c, s.holding === c.drink && sameMods(s.extras, c.mods));
    s.holding = null; s.extras = [];
  };

  /** The barista sets the finished cup on the counter, if it matches the ticket. */
  const handOver = () => {
    const s = st.current;
    const tk = s.tickets.find((x) => x.id === s.holdingFor);
    if (!s.holding || !tk) return;
    if (tk.drink !== s.holding || !sameMods(s.extras, tk.mods)) { sfx('error'); toast('That’s not what the ticket says. Start that one again.'); }
    else { tk.made = true; send({ k: 'ready', id: tk.id }); sfx('pop'); }
    s.holding = null; s.holdingFor = undefined; s.extras = [];
    rerender();
  };

  const toggleMod = (m: ModKey) => {
    const s = st.current;
    if (!s.holding) { toast('Make the drink first, then add extras.'); return; }
    sfx('tap');
    s.extras = s.extras.includes(m) ? s.extras.filter((x) => x !== m) : [...s.extras, m];
    rerender();
  };

  const serve = (c: Customer, ok: boolean) => {
    const s = st.current;
    c.leaving = 0.01; c.happy = ok;
    if (ok) { s.served++; sfx('coin'); } else { s.missed++; sfx('error'); toast('Wrong drink…'); }
    send({ k: 'served', id: c.id, ok });
    rerender();
  };

  const brew = (d: DrinkKey, forId?: number) => {
    const s = st.current;
    if (s.brewing) return;
    if (s.holding) { toast(role === 'solo' ? 'Hand over the drink you’re holding first.' : 'Finish the cup you’re holding first.'); return; }
    s.brewing = { drink: d, done: s.t + brewTime, forId };
    sfx('tap');
  };

  const s = st.current;
  const left = Math.max(0, Math.ceil(duration - s.t));
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div class="col">
      <ShiftHud label={role === 'solo' ? 'Solo' : role === 'host' ? 'You: counter' : 'You: barista'} served={s.served} missed={s.missed} left={left} />
      {role !== 'guest' ? (
        <div class="cafe pbox" style={{ aspectRatio: `${W}/${H}` }}>
          <canvas ref={canvas} width={W} height={H} onPointerDown={tapCanvas as never} />
        </div>
      ) : (
        <div class="col">
          <span class="small muted">Orders from {name} at the counter. Tap a ticket, then make that drink.</span>
          {s.tickets.filter((t) => !t.made).length === 0 && <div class="empty">Waiting for orders…</div>}
          <div class="row wrap">
            {s.tickets.filter((t) => !t.made).map((t) => (
              <button class="card" aria-selected={pick === t.id} style={{ width: '30%' }} onClick={() => setPick(t.id)}>
                <img src={cupUrl(t.drink, t.mods)} alt="" style={{ width: '44px', imageRendering: 'pixelated' }} />
                <span class="name">{[DRINKS.find((d) => d.key === t.drink)!.name, ...t.mods.map((m) => MODS.find((x) => x.key === m)!.name.toLowerCase())].join(', ')}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p class="tiny muted center" style={{ margin: 0 }}>
        {role === 'solo' ? `Make the drink in the bubble${mods.length ? ', add any extras it shows' : ''}, then tap that customer.` : role === 'host' ? `Tap customers to take orders. When ${name} sets a drink down, tap the customer to serve it.` : ''}
      </p>
      {role !== 'host' && (
        <div class="drinks">
          {DRINKS.map((d) => (
            <button class="btn soft" disabled={!!s.brewing} onClick={() => {
              if (role === 'guest') {
                const tk = s.tickets.find((t) => t.id === pick && !t.made);
                if (!tk) { toast('Tap an order first.'); return; }
                if (tk.drink !== d.key) { sfx('error'); toast(`That ticket says ${DRINKS.find((x) => x.key === tk.drink)!.name}.`); return; }
                brew(d.key, tk.id); setPick(null);
              } else brew(d.key);
            }}>
              <img src={cupUrl(d.key)} alt="" />{d.name}
            </button>
          ))}
        </div>
      )}
      {role !== 'host' && mods.length > 0 && (
        <div class="row wrap" style={{ justifyContent: 'center', gap: '6px' }}>
          {mods.map((m) => <button class="btn soft small" aria-pressed={s.extras.includes(m.key)} disabled={!s.holding} onClick={() => toggleMod(m.key)}>+ {m.name}</button>)}
          {role === 'guest' && <button class="btn small" disabled={!s.holding} onClick={handOver}>Set it down</button>}
        </div>
      )}
    </div>
  );
}
