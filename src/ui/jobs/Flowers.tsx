// Petal & Stem, the flower shop. Each customer's bubble shows the bouquet they want: three
// flowers, a wrap and a ribbon. Build it on the bench and tap them to hand it over. Together,
// the guest picks the flowers from the order tickets and the host wraps and hands them over.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import type { AvatarLook } from '../../engine/art/avatar';
import { dither } from '../../engine/art/pixel';
import type { CafeEvent } from '../../net/types';
import { backend, partner, toast } from '../../state/store';
import { difficulty } from '../../data/economy';
import { avatarSprite, customerLook, SHIFT_SECONDS, sendShift, ShiftHud, useShiftEvents, type ShiftProps } from './common';

// ---------- flowers, wraps and ribbons ----------

/** Outline, mid, light and center for each flower head. */
export const FLOWERS = [
  { key: 'rose', name: 'Rose', p: { d: '#7A1426', m: '#C8304A', l: '#F06070', c: '#9A1E34' }, map: ['.dmd.', 'dmlmd', 'mlclm', 'dmmmd', '.ddd.'] },
  { key: 'tulip', name: 'Tulip', p: { d: '#A0600A', m: '#E8B020', l: '#FFE27A', c: '#C88A10' }, map: ['m.l.m', 'mmlmm', 'mmlmm', 'dmmmd', '.ddd.'] },
  { key: 'daisy', name: 'Daisy', p: { d: '#A8A090', m: '#E8E4DA', l: '#FFFFFF', c: '#F2C230' }, map: ['.lml.', 'lmcml', 'mcccm', 'lmcml', '.lml.'] },
  { key: 'lavender', name: 'Lavender', p: { d: '#4A2E7A', m: '#8A6AC8', l: '#C0A8F0', c: '#6A4AA8' }, map: ['..l..', '.lm..', '..ml.', '.mc..', '..d..'] },
  { key: 'sunflower', name: 'Sunflower', p: { d: '#3A2010', m: '#E8A010', l: '#FFD040', c: '#6A3A1A' }, map: ['.mlm.', 'mcccm', 'lcdcl', 'mcccm', '.mlm.'] },
  { key: 'peony', name: 'Peony', p: { d: '#A0405E', m: '#F28AAA', l: '#FFD0DC', c: '#D8608A' }, map: ['.lml.', 'lmlml', 'mlclm', 'dmlmd', '.ddd.'] },
] as const;
type FlowerKey = typeof FLOWERS[number]['key'];
const FLOWER = Object.fromEntries(FLOWERS.map((f) => [f.key, f])) as Record<FlowerKey, typeof FLOWERS[number]>;

export const WRAPS = [
  { name: 'Kraft paper', d: '#6E4A28', m: '#C8A070', l: '#E6CA98' },
  { name: 'Blush paper', d: '#A05A70', m: '#F2B4C4', l: '#FFE0E8' },
  { name: 'Mint paper', d: '#3E7A5C', m: '#9AD4B6', l: '#D4F0E0' },
];
export const RIBBONS = [
  { name: 'Red ribbon', d: '#6A1020', m: '#D8364A' },
  { name: 'White ribbon', d: '#9A9490', m: '#FFFFFF' },
  { name: 'Gold ribbon', d: '#86600E', m: '#F2C230' },
];

/** Gift cards tucked into the wrap at higher levels: none, a heart, or a star. */
export const CARDS = [
  { name: 'No card', c: '' },
  { name: 'Heart card', c: '#E5566F' },
  { name: 'Star card', c: '#F2C230' },
];

interface Bouquet { flowers: FlowerKey[]; wrap: number | null; ribbon: number | null; card?: number }

const P = (g: CanvasRenderingContext2D, c: string, x: number, y: number, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

function drawHead(g: CanvasRenderingContext2D, x: number, y: number, k: FlowerKey) {
  const f = FLOWER[k];
  f.map.forEach((row, j) => [...row].forEach((ch, i) => { const c = (f.p as Record<string, string>)[ch]; if (c) P(g, c, x + i, y + j); }));
}

/** A bouquet in a 17x20 box: heads on top, the wrap as a cone and a bow at the waist. */
export function drawBouquet(g: CanvasRenderingContext2D, x: number, y: number, b: Bouquet) {
  const leaf = '#5A9A40', leafD = '#386A28';
  if (b.flowers.length) {
    P(g, leafD, x + 1, y + 7, 2, 1); P(g, leaf, x + 2, y + 6, 2, 1); P(g, leafD, x + 14, y + 7, 2, 1); P(g, leaf, x + 13, y + 6, 2, 1);
    P(g, leaf, x + 5, y + 4, 1, 2); P(g, leaf, x + 11, y + 4, 1, 2);
  }
  if (b.wrap == null) {
    // Bare stems, as the florist hands them over.
    if (b.flowers.length) { P(g, leafD, x + 3, y + 8, 1, 3); P(g, leafD, x + 4, y + 11, 1, 3); P(g, leafD, x + 8, y + 5, 1, 9); P(g, leafD, x + 13, y + 8, 1, 3); P(g, leafD, x + 12, y + 11, 1, 3); P(g, leafD, x + 5, y + 14, 7, 1); P(g, leafD, x + 7, y + 15, 3, 3); P(g, leaf, x + 8, y + 15, 1, 3); }
  }
  const spots: [number, number][] = [[0, 3], [12, 3], [6, 0]];
  b.flowers.slice(0, 3).forEach((k, i) => drawHead(g, x + spots[i][0], y + spots[i][1], k));
  if (b.wrap != null) {
    const W = WRAPS[b.wrap];
    for (let r = 0; r < 13; r++) {
      const hw = Math.round(8 - r * 0.5), left = x + 8 - hw, w = hw * 2 + 1, yy = y + 7 + r;
      P(g, W.d, left, yy, w, 1);
      if (w > 2) P(g, W.m, left + 1, yy, w - 2, 1);
      if (w > 4) P(g, W.l, left + 1, yy, Math.max(1, Math.floor((w - 2) / 3)), 1);
    }
    // The paper's folded top edge.
    for (let i = 0; i < 17; i += 2) P(g, W.l, x + i, y + 7);
    P(g, W.d, x + 6, y + 19, 5, 1);
  }
  if (b.ribbon != null) {
    const R = RIBBONS[b.ribbon];
    P(g, R.d, x + 4, y + 13, 9, 2); P(g, R.m, x + 5, y + 13, 7, 1);
    P(g, R.m, x + 5, y + 11, 2, 2); P(g, R.m, x + 10, y + 11, 2, 2); P(g, R.d, x + 8, y + 12, 1, 3);
    P(g, R.m, x + 7, y + 15, 1, 2); P(g, R.m, x + 9, y + 15, 1, 2); P(g, R.d, x + 6, y + 17, 1, 1); P(g, R.d, x + 10, y + 17, 1, 1);
  }
  if (b.card) {
    // A little card on a string, tucked in at the side.
    const c = CARDS[b.card].c;
    P(g, '#3A2418', x + 11, y + 15, 6, 5); P(g, '#FFFDF6', x + 12, y + 16, 4, 3);
    if (b.card === 1) { P(g, c, x + 12, y + 16); P(g, c, x + 14, y + 16); P(g, c, x + 12, y + 17, 3, 1); P(g, c, x + 13, y + 18); }
    else { P(g, c, x + 13, y + 16); P(g, c, x + 12, y + 17, 3, 1); P(g, c, x + 13, y + 18); }
  }
}

const urls = new Map<string, string>();
function bouquetUrl(b: Bouquet, scale = 1): string {
  const k = JSON.stringify(b) + scale;
  let u = urls.get(k);
  if (!u) {
    const c = document.createElement('canvas'); c.width = 17 * scale; c.height = 20 * scale;
    const g = c.getContext('2d')!; g.scale(scale, scale);
    drawBouquet(g, 0, 0, b);
    u = c.toDataURL(); urls.set(k, u);
  }
  return u;
}
function headUrl(k: FlowerKey): string {
  let u = urls.get('head:' + k);
  if (!u) {
    const c = document.createElement('canvas'); c.width = 5; c.height = 5;
    drawHead(c.getContext('2d')!, 0, 0, k);
    u = c.toDataURL(); urls.set('head:' + k, u);
  }
  return u;
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ---------- the shop ----------

const W = 128, H = 88, SEATS = 3;
const seatX = (seat: number) => 8 + seat * 42;

let backdrop: HTMLCanvasElement | null = null;
/** The shop: arched window onto the street, hanging plants, buckets of stems and a sage counter. */
export function flowerBackdrop(): HTMLCanvasElement {
  if (backdrop) return backdrop;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const R = (col: string, x: number, y: number, w = 1, h = 1) => P(g, col, x, y, w, h);
  const o = '#2E3A2A';
  // Pale sage plaster, darker toward the ceiling.
  R('#E4EAD2', 0, 0, W, 64);
  dither(g, '#D2DCBC', '#E4EAD2', 0, 0, W, 6, 0.5);
  R('#D2DCBC', 0, 0, W, 2);
  // Arched window with leafy street trees outside.
  R(o, 46, 6, 36, 34); R('#F2EEE0', 47, 7, 34, 32);
  R('#BFE2F2', 49, 11, 30, 26); R('#D8EEF6', 49, 11, 30, 7);
  for (let i = 0; i < 6; i++) { R('#F2EEE0', 47 + i, 7, 1, 6 - i); R('#F2EEE0', 80 - i, 7, 1, 6 - i); }
  R('#7AA860', 49, 26, 30, 11); R('#5E8A48', 49, 30, 30, 7);
  for (let i = 0; i < 5; i++) R('#8CBC6E', 51 + i * 6, 25 - (i % 2), 4, 2);
  R('#F2EEE0', 63, 11, 2, 26); R('#F2EEE0', 49, 24, 30, 1);
  R('rgba(255,255,255,.4)', 51, 13, 1, 6); R('rgba(255,255,255,.4)', 52, 12, 3, 1);
  // Hanging planters with trailing vines.
  for (const [x, len] of [[20, 10], [104, 14]] as const) {
    R('#8A6A4A', x, 0, 1, 8); R(o, x - 4, 8, 9, 5); R('#C8784A', x - 3, 8, 7, 4); R('#E09060', x - 3, 8, 7, 1);
    for (let i = 0; i < len; i++) { R(i % 3 ? '#5E9A44' : '#7CBC5A', x - 4 + (i % 2), 12 + i, 2, 1); R(i % 2 ? '#5E9A44' : '#86C464', x + 3 - (i % 3 === 0 ? 1 : 0), 12 + Math.floor(i * 0.8), 2, 1); }
  }
  // Shelf with potted plants on the left.
  R(o, 4, 34, 34, 2); R('#B88A5A', 4, 34, 34, 1);
  const pots: [number, string, string][] = [[6, '#C8784A', '#6EA850'], [16, '#E8DCC8', '#8CBC6E'], [27, '#7090B0', '#5E9A44']];
  for (const [x, pot, leaf] of pots) { R(o, x, 27, 8, 7); R(pot, x + 1, 28, 6, 6); R('rgba(255,255,255,.3)', x + 1, 28, 1, 6); R(leaf, x, 22, 8, 5); R('#4A7A36', x + 2, 24, 4, 2); R(leaf, x + 3, 20, 2, 2); }
  // Buckets of stems on the right, in the six flower colors.
  const heads = ['#C8304A', '#E8B020', '#FFFFFF', '#8A6AC8', '#F2B020', '#F28AAA'];
  for (let i = 0; i < 6; i++) {
    const x = 88 + (i % 3) * 13, y = i < 3 ? 34 : 50;
    R('#4A7A36', x + 2, y - 6, 1, 6); R('#4A7A36', x + 6, y - 7, 1, 7); R('#4A7A36', x + 9, y - 5, 1, 5);
    for (const [hx, hy] of [[1, -9], [5, -10], [8, -8]]) { R(heads[i], x + hx, y + hy, 3, 3); R('rgba(0,0,0,.18)', x + hx, y + hy + 2, 3, 1); }
    R(o, x, y, 12, 9); R('#9AA8B4', x + 1, y + 1, 10, 7); R('#C4D0DA', x + 1, y + 1, 10, 1); R('#7A8894', x + 1, y + 6, 10, 2);
  }
  // A bucket shelf under them.
  R('#B88A5A', 84, 59, 44, 2);
  // Counter: lit edge, sage planks, shadow.
  R('#5E4630', 0, 62, W, 2);
  R('#E6C49A', 0, 64, W, 1); R('#C8A070', 0, 65, W, 3); R('#9A7650', 0, 68, W, 1);
  R('#7FA38A', 0, 69, W, 19);
  for (let x = 4; x < W; x += 10) { R('#6A8C76', x, 70, 1, 18); R('#94B89E', x + 1, 70, 1, 18); }
  R('#5E7A66', 0, 84, W, 4);
  backdrop = c;
  return c;
}

interface Customer { id: number; seat: number; want: Bouquet & { wrap: number; ribbon: number; card: number }; born: number; patience: number; taken: boolean; stems: boolean; leaving: number; happy: boolean; look: AvatarLook; botAt?: number }
interface Ticket { id: number; flowers: FlowerKey[]; seat: number }

/**
 * One customer's order. Low levels use four familiar flowers with a repeat; from level 3 any of
 * the six can show up, all different by level 6; from level 5 some ask for a gift card too.
 */
function newOrder(t: number, hard: number): Bouquet & { wrap: number; ribbon: number; card: number } {
  const r = (n: number) => Math.floor(Math.random() * n);
  const easy = hard < 0.2 && t < 45;
  const pool = easy ? FLOWERS.slice(0, 4) : FLOWERS;
  const a = pool[r(pool.length)].key, b = pool[r(pool.length)].key;
  let flowers: FlowerKey[] = easy ? [a, a, b] : [a, b, FLOWERS[r(FLOWERS.length)].key];
  if (hard >= 0.55) {
    const keys = FLOWERS.map((f) => f.key).sort(() => Math.random() - 0.5);
    flowers = keys.slice(0, 3);
  }
  const card = hard >= 0.4 && Math.random() < 0.35 + hard * 0.4 ? 1 + r(2) : 0;
  return { flowers, wrap: r(WRAPS.length), ribbon: r(RIBBONS.length), card };
}

export function FlowerShift({ id, role, level, resume, onEnd, onTick }: ShiftProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hard = difficulty(level);
  const cards = hard >= 0.4;
  const st = useRef({ customers: [] as Customer[], nextId: 1, nextSpawn: 1.5, t: resume?.t ?? 0, served: resume?.served ?? 0, missed: resume?.missed ?? 0, tickets: [] as Ticket[], ended: false });
  const [bench, setBench] = useState<Bouquet>({ flowers: [], wrap: 0, ribbon: 0, card: 0 });
  const [ticket, setTicket] = useState<number | null>(null);
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const together = role !== 'solo';
  const isBot = backend.mode === 'preview';
  const name = partner.value?.name ?? 'Partner';
  const send = (ev: CafeEvent) => { if (together) sendShift(id, ev); };

  useShiftEvents(id, (ev) => {
    const s = st.current;
    if (ev.k === 'bouquet' && role === 'guest') { s.tickets.push({ id: ev.id, flowers: ev.flowers as FlowerKey[], seat: ev.seat }); sfx('bell'); }
    if (ev.k === 'stems' && role === 'host') { const c = s.customers.find((x) => x.id === ev.id); if (c) { c.stems = true; sfx('pop'); } }
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

  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const s = st.current;
      s.t += dt;
      if (role !== 'guest') {
        s.nextSpawn -= dt;
        const free = [...Array(SEATS).keys()].filter((k) => !s.customers.some((c) => c.seat === k && c.leaving === 0));
        if (s.nextSpawn <= 0 && free.length && s.t < SHIFT_SECONDS - 10) {
          const seat = free[Math.floor(Math.random() * free.length)];
          const n = s.nextId++;
          s.customers.push({ id: n, seat, want: newOrder(s.t, hard), born: s.t, patience: (together ? 34 : 30) - 9 * hard - Math.min(6, s.t / 15), taken: !together, stems: false, leaving: 0, happy: false, look: customerLook(n + 40) });
          s.nextSpawn = Math.max(5, 9 - s.t / 25 - 2.5 * hard) * (together ? 0.85 : 1) * (0.85 + Math.random() * 0.3);
        }
        for (const c of s.customers) {
          if (c.leaving) { c.leaving += dt; continue; }
          if (s.t - c.born > c.patience) { c.leaving = 0.01; c.happy = false; s.missed++; sfx('error'); send({ k: 'served', id: c.id, ok: false }); }
          // Preview: the pretend florist sends the stems a few seconds after each order.
          if (role === 'host' && isBot && c.taken && !c.stems) {
            c.botAt ??= s.t + 3.5 + Math.random() * 2.5;
            if (s.t >= c.botAt) { c.stems = true; sfx('pop'); }
          }
        }
        s.customers = s.customers.filter((c) => c.leaving < 1.2);
      }
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
    g.drawImage(flowerBackdrop(), 0, 0);
    // Morning light through the window.
    const r = g.createRadialGradient(64, 24, 2, 64, 30, 46);
    r.addColorStop(0, 'rgba(255,240,190,.28)'); r.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = r; g.fillRect(14, 0, 100, 64);
    for (const cu of s.customers) {
      const x = seatX(cu.seat), wait = s.t - cu.born;
      const y = 45 + (cu.leaving ? cu.leaving * 30 : Math.max(0, 6 - wait * 12));
      const frame = cu.leaving ? (cu.happy ? 'cheer' : 'idle') : Math.floor((s.t + cu.id * 0.37) * 1.6) % 2 ? 'idle2' : 'idle';
      g.save();
      g.beginPath(); g.rect(0, 0, W, 63); g.clip();
      g.drawImage(avatarSprite(cu.look, frame), x, y - 3);
      if (cu.leaving && cu.happy) drawBouquet(g, x + 9, y + 6, cu.want);
      g.restore();
      if (cu.leaving && !cu.happy) P(g, '#6AA0E0', x + 16, y + 1, 1, 2);
      if (!cu.leaving) {
        // Order bubble and patience bar.
        const bx = x - 1, by = y - 29;
        P(g, '#FFFFFF', bx + 1, by + 1, 21, 23); P(g, '#FFFFFF', bx + 9, by + 24, 3, 2);
        P(g, '#3A2418', bx + 1, by, 21, 1); P(g, '#3A2418', bx + 1, by + 24, 8, 1); P(g, '#3A2418', bx + 12, by + 24, 10, 1); P(g, '#3A2418', bx, by + 1, 1, 23); P(g, '#3A2418', bx + 22, by + 1, 1, 23);
        if (cu.taken) drawBouquet(g, bx + 3, by + 3, cu.want);
        else { P(g, '#3A2418', bx + 9, by + 7, 4, 1); P(g, '#3A2418', bx + 12, by + 8, 1, 3); P(g, '#3A2418', bx + 10, by + 10, 2, 1); P(g, '#3A2418', bx + 10, by + 13, 2, 2); }
        const left = Math.max(0, 1 - wait / cu.patience);
        P(g, '#3A2418', bx + 1, by - 4, 21, 3);
        P(g, left > 0.5 ? '#5CB85C' : left > 0.25 ? '#F2C230' : '#E8414A', bx + 2, by - 3, Math.round(19 * left), 1);
        // Stems from the florist wait on the counter in front of them.
        if (cu.stems) drawBouquet(g, x + 2, 62, { flowers: cu.want.flowers, wrap: null, ribbon: null });
      }
    }
  };

  const tapCanvas = (e: PointerEvent) => {
    if (role === 'guest') return;
    const r = canvas.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const seat = Math.max(0, Math.min(SEATS - 1, Math.floor((x - 2) / 42)));
    const s = st.current;
    const c = s.customers.find((q) => q.seat === seat && !q.leaving);
    if (!c) return;
    if (!c.taken) {
      c.taken = true; sfx('tap');
      send({ k: 'bouquet', id: c.id, flowers: c.want.flowers, wrap: c.want.wrap, ribbon: c.want.ribbon, seat: c.seat });
      return;
    }
    if (role === 'host') {
      if (!c.stems) { toast(`${name} is still picking the flowers.`); return; }
      serve(c, bench.wrap === c.want.wrap && bench.ribbon === c.want.ribbon && (bench.card ?? 0) === c.want.card);
      return;
    }
    if (bench.flowers.length < 3) { toast('Pick three flowers first.'); return; }
    serve(c, same(bench.flowers, c.want.flowers) && bench.wrap === c.want.wrap && bench.ribbon === c.want.ribbon && (bench.card ?? 0) === c.want.card);
    setBench({ ...bench, flowers: [] });
  };

  const serve = (c: Customer, ok: boolean) => {
    const s = st.current;
    c.leaving = 0.01; c.happy = ok;
    if (ok) { s.served++; sfx('coin'); } else { s.missed++; sfx('error'); toast('That’s not quite what they asked for…'); }
    send({ k: 'served', id: c.id, ok });
    rerender();
  };

  const addFlower = (k: FlowerKey) => {
    if (bench.flowers.length >= 3) { toast('Three is plenty. Tap the bouquet to start over.'); return; }
    sfx('tap');
    setBench({ ...bench, flowers: [...bench.flowers, k] });
  };

  const sendStems = () => {
    const s = st.current;
    const tk = s.tickets.find((t) => t.id === ticket);
    if (!tk) { toast('Tap an order first.'); return; }
    if (!same(bench.flowers, tk.flowers)) { sfx('error'); toast(`That order is ${tk.flowers.map((f) => FLOWER[f].name.toLowerCase()).join(', ')}.`); setBench({ ...bench, flowers: [] }); return; }
    sfx('pop');
    send({ k: 'stems', id: tk.id, flowers: tk.flowers });
    s.tickets = s.tickets.filter((t) => t.id !== tk.id);
    setTicket(null); setBench({ ...bench, flowers: [] });
  };

  const s = st.current;
  const left = Math.max(0, Math.ceil(SHIFT_SECONDS - s.t));
  const preview = role === 'host' ? { flowers: ['daisy', 'daisy', 'daisy'] as FlowerKey[], wrap: bench.wrap, ribbon: bench.ribbon, card: bench.card } : role === 'guest' ? { ...bench, wrap: null, ribbon: null, card: 0 } : bench;
  return (
    <div class="col">
      <ShiftHud label={role === 'solo' ? 'Solo' : role === 'host' ? 'You: wrapping' : 'You: flowers'} served={s.served} missed={s.missed} left={left} />
      {role !== 'guest' ? (
        <div class="cafe pbox" style={{ aspectRatio: `${W}/${H}` }}>
          <canvas ref={canvas} width={W} height={H} onPointerDown={tapCanvas as never} />
        </div>
      ) : (
        <div class="col">
          <span class="small muted">Orders from {name} at the counter. Tap one, pick its three flowers and send them over.</span>
          {s.tickets.length === 0 && <div class="empty">Waiting for orders…</div>}
          <div class="row wrap">
            {s.tickets.map((t) => (
              <button class="card" aria-selected={ticket === t.id} style={{ width: '30%' }} onClick={() => { sfx('tap'); setTicket(t.id); }}>
                <img src={bouquetUrl({ flowers: t.flowers, wrap: null, ribbon: null }, 3)} alt="" style={{ width: '51px', imageRendering: 'pixelated' }} />
                <span class="name">{t.flowers.map((f) => FLOWER[f].name).join(', ')}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div class="bench">
        <button class="bench-preview pbox soft" onClick={() => { if (role !== 'host' && bench.flowers.length) { sfx('close'); setBench({ ...bench, flowers: [] }); } }} aria-label="Start this bouquet over">
          <BouquetImg b={preview} />
          <span class="tiny muted">{role === 'host' ? 'Your wrapping' : bench.flowers.length ? 'Tap to start over' : 'Your bouquet'}</span>
        </button>
        {role !== 'guest' && (
          <div class="col" style={{ gap: '6px', flex: 1 }}>
            <span class="tiny muted">Wrap</span>
            <div class="swatches">{WRAPS.map((w, i) => <button class="swatch" aria-label={w.name} aria-pressed={bench.wrap === i} style={{ background: w.m }} onClick={() => { sfx('tap'); setBench({ ...bench, wrap: i }); }} />)}</div>
            <span class="tiny muted">Ribbon</span>
            <div class="swatches">{RIBBONS.map((rb, i) => <button class="swatch" aria-label={rb.name} aria-pressed={bench.ribbon === i} style={{ background: rb.m }} onClick={() => { sfx('tap'); setBench({ ...bench, ribbon: i }); }} />)}</div>
            {cards && <>
              <span class="tiny muted">Card</span>
              <div class="swatches">{CARDS.map((cd, i) => <button class="swatch card-swatch" aria-label={cd.name} aria-pressed={(bench.card ?? 0) === i} onClick={() => { sfx('tap'); setBench({ ...bench, card: i }); }}>{i === 0 ? '–' : i === 1 ? '♥' : '★'}</button>)}</div>
            </>}
          </div>
        )}
        {role === 'guest' && <button class="btn grow" disabled={ticket == null || bench.flowers.length < 3} onClick={sendStems}>Send stems</button>}
      </div>
      {role !== 'host' && (
        <div class="drinks">
          {FLOWERS.map((f) => (
            <button class="btn soft" disabled={bench.flowers.length >= 3} onClick={() => addFlower(f.key)}>
              <img src={headUrl(f.key)} alt="" />{f.name}
            </button>
          ))}
        </div>
      )}
      <p class="tiny muted center" style={{ margin: 0 }}>
        {role === 'solo' ? `Pick three flowers, a wrap and a ribbon${cards ? ' (and a card if they want one)' : ''} to match the bubble, then tap that customer.`
          : role === 'host' ? `Tap customers to take orders. When ${name}’s stems are on the counter, pick the wrap and ribbon from the bubble and tap the customer.` : ''}
      </p>
    </div>
  );
}

function BouquetImg({ b }: { b: Bouquet }) {
  const url = useMemo(() => bouquetUrl(b, 4), [JSON.stringify(b)]);
  return <img src={url} alt="" style={{ width: '68px', height: '80px', imageRendering: 'pixelated' }} />;
}
