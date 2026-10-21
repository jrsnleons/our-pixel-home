// Wall decor. Builders return art in wall space: x along the wall, y up from the bottom of
// the item's cells, z pointing out into the room. Some items repaint themselves (clocks,
// calendar, corkboard, photo frames) through `refresh`.

import * as THREE from 'three';
import { ramp, shade } from '../../core/color';
import type { Theme } from '../../data/themes';
import { drawText, textWidth } from './font';
import { cbox, flat, pbox } from './kit';
import { palette, solid, wood, type Pal } from './paint';
import { bevel, canvas, disc, frame as frameRect, heart, line, px, PPU, rng, texture, type Ctx } from './pixel';

export interface WallContext {
  /** Minutes offset of the partner's time zone vs. local, for the two-time-zone clock. */
  partnerOffsetMin?: number | null;
  myLabel?: string;
  partnerLabel?: string;
  /** Days until the next visit, or null if not set. */
  daysToVisit?: number | null;
  visitDate?: string | null;
  /** Up to four short notes for the corkboard. */
  notes?: { text: string; kind: 'note' | 'prayer' }[];
  /** An image to show in a photo frame. */
  photo?: HTMLImageElement | HTMLCanvasElement | null;
  pixelate?: boolean;
  verse?: { text: string; ref: string } | null;
}

export interface WallArt {
  group: THREE.Group;
  glow?: THREE.Mesh[];
  /** Repaint dynamic faces; returns true if anything changed. */
  refresh?: (ctx: WallContext) => void;
  /** Shows the time or date, so it repaints as the clock moves, not only when its context does. */
  clock?: boolean;
  tick?: (t: number) => void;
}

/** A face that can be repainted later. */
function liveFace(w: number, h: number, x: number, y: number, z: number, emissive = false, density = 1) {
  const [c, g] = canvas(Math.round(w * PPU * density), Math.round(h * PPU * density));
  const map = texture(c);
  const mat = new THREE.MeshLambertMaterial({ map, emissive: emissive ? '#ffffff' : '#000000', emissiveMap: emissive ? map : null, emissiveIntensity: emissive ? 0.35 : 0 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.userData.live = true;
  m.position.set(x + w / 2, y + h / 2, z);
  m.receiveShadow = true;
  return { mesh: m, g, w: c.width, h: c.height, update: () => { map.needsUpdate = true; } };
}

function frameBox(P: Pal, w: number, h: number, depth = 0.08, color?: string) {
  const c = color ?? P.wood[2];
  return pbox(0, 0, 0, w, h, depth, { front: null, sides: wood(c), top: solid(shade(c, 0.1)) });
}

/** Draw a framed picture into a face: outer frame, mat, then `inner`. */
function framed(g: Ctx, w: number, h: number, P: Pal, inner: (g: Ctx, x: number, y: number, w: number, h: number) => void, gold = false) {
  const f = gold ? P.gold : P.wood;
  px(g, f[2], 0, 0, w, h);
  bevel(g, 0, 0, w, h, f[4], f[0]);
  bevel(g, 1, 1, w - 2, h - 2, f[3], f[1]);
  px(g, '#F6F0E2', 3, 3, w - 6, h - 6);
  inner(g, 4, 4, w - 8, h - 8);
  frameRect(g, 3, 3, w - 6, h - 6, shade('#F6F0E2', -0.12));
}

/** A placeholder picture: two little houses far apart joined by a dotted line and a heart. */
function placeholderPhoto(g: Ctx, x: number, y: number, w: number, h: number, T: Theme) {
  const sky = ramp(T.key === 'lavender' ? '#3E3A78' : '#A8D8F0');
  for (let j = 0; j < h; j++) px(g, j < h * 0.6 ? (j < h * 0.3 ? sky[3] : sky[2]) : '#8CC07A', x, y + j, w, 1);
  px(g, '#6EA860', x, y + Math.round(h * 0.6), w, 1);
  const hx1 = x + 2, hx2 = x + w - 7, hy = y + Math.round(h * 0.6) - 4;
  for (const hx of [hx1, hx2]) { px(g, '#F2EEE4', hx, hy, 5, 4); px(g, '#C8572B', hx - 1, hy - 1, 7, 1); px(g, '#C8572B', hx, hy - 2, 5, 1); px(g, '#C8572B', hx + 1, hy - 3, 3, 1); px(g, '#5A3A2A', hx + 2, hy + 2, 1, 2); }
  for (let i = hx1 + 7; i < hx2 - 1; i += 2) px(g, '#FFFFFF', i, hy - 4 + Math.round(Math.sin((i - hx1) / (hx2 - hx1) * Math.PI) * -3));
  heart(g, '#E8506A', x + ((w / 2) | 0) - 1, y + 2);
}

/** Draw an image into the frame, cropping to fill; optionally pixelate to match the room. */
function drawPhoto(g: Ctx, img: HTMLImageElement | HTMLCanvasElement, x: number, y: number, w: number, h: number, pixelate: boolean) {
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width, ih = 'naturalHeight' in img ? img.naturalHeight : img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale, sh = h / scale;
  const sx = (iw - sw) / 2, sy = (ih - sh) / 2;
  if (pixelate) {
    // Already at pixel scale: drawing into a w×h area IS the pixelation. Posterize colors.
    const [c, cg] = canvas(w, h);
    cg.imageSmoothingEnabled = true;
    cg.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    const d = cg.getImageData(0, 0, w, h);
    for (let i = 0; i < d.data.length; i += 4) for (let k = 0; k < 3; k++) d.data[i + k] = Math.round(d.data[i + k] / 32) * 32;
    cg.putImageData(d, 0, 0);
    g.drawImage(c, x, y);
  } else {
    // Higher detail: the frame face canvas is upscaled for photos (see photoFrame).
    g.imageSmoothingEnabled = true;
    g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    g.imageSmoothingEnabled = false;
  }
}

function photoFrame(P: Pal, w: number, h: number): WallArt {
  const g = new THREE.Group();
  const fw = w - 0.2, fh = h - 0.2;
  const box = frameBox(P, fw, fh, 0.06);
  box.position.set(0.1 + fw / 2, 0.1 + fh / 2, 0.03);
  g.add(box);
  // Photos get 4x the pixel density so real photos stay recognizable; the frame stays chunky.
  const S = 4;
  const [c, cg] = canvas(fw * PPU * S, fh * PPU * S);
  const map = texture(c);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshLambertMaterial({ map }));
  face.position.set(0.1 + fw / 2, 0.1 + fh / 2, 0.065);
  face.receiveShadow = true;
  face.userData.live = true;
  g.add(face);
  const W = c.width, H = c.height;
  const refresh = (ctx: WallContext) => {
    const [small, sg] = canvas(W / S, H / S);
    framed(sg, W / S, H / S, P, (gg, x, y, ww, hh) => {
      if (!ctx.photo || ctx.pixelate) {
        if (ctx.photo) drawPhoto(gg, ctx.photo, x, y, ww, hh, true);
        else placeholderPhoto(gg, x, y, ww, hh, P.T);
      }
    });
    cg.imageSmoothingEnabled = false;
    cg.clearRect(0, 0, W, H);
    cg.drawImage(small, 0, 0, W, H);
    if (ctx.photo && !ctx.pixelate) drawPhoto(cg, ctx.photo, 4 * S, 4 * S, W - 8 * S, H - 8 * S, false);
    map.needsUpdate = true;
  };
  refresh({});
  return { group: g, refresh };
}

function clockFace(g: Ctx, cx: number, cy: number, r: number, hours: number, minutes: number, P: Pal) {
  disc(g, P.outline, cx, cy, r + 1);
  disc(g, P.wood[4], cx, cy, r);
  disc(g, '#FBF6EA', cx, cy, r - 1);
  px(g, '#EDE3D0', cx - r + 2, cy + 2, 2 * r - 3, r - 3);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, q = i % 3 === 0;
    const rr = r - 2;
    px(g, q ? P.outline : '#C8BCA8', Math.round(cx + Math.sin(a) * rr), Math.round(cy - Math.cos(a) * rr));
  }
  const ha = ((hours % 12) + minutes / 60) / 12 * Math.PI * 2, ma = minutes / 60 * Math.PI * 2;
  line(g, P.outline, cx, cy, Math.round(cx + Math.sin(ma) * (r - 3)), Math.round(cy - Math.cos(ma) * (r - 3)));
  line(g, P.outline, cx, cy, Math.round(cx + Math.sin(ha) * (r - 5)), Math.round(cy - Math.cos(ha) * (r - 5)));
  line(g, P.outline, cx + 1, cy, Math.round(cx + 1 + Math.sin(ha) * (r - 5)), Math.round(cy - Math.cos(ha) * (r - 5)));
  px(g, P.T.ui.accent, cx, cy, 2, 1);
}

/** Handwriting at 1px: short runs of ink with gaps, like words too small to read. */
function scribble(g: Ctx, x0: number, y: number, len: number, ink: string, r: () => number, wave = false) {
  let x = x0;
  while (x < x0 + len) {
    const word = Math.min(x0 + len - x, 2 + ((r() * 3) | 0));
    for (let i = 0; i < word; i++) px(g, ink, x + i, y + (wave && (x + i) % 3 === 1 ? -1 : 0));
    x += word + 1;
  }
}

const builders: Record<string, (P: Pal) => WallArt> = {
  frame_s: (P) => photoFrame(P, 1, 1),
  frame_m: (P) => photoFrame(P, 2, 1),
  frame_l: (P) => photoFrame(P, 2, 2),
  frame_xl: (P) => photoFrame(P, 3, 2),

  wall_cross: (P) => {
    const g = new THREE.Group();
    const w = P.wood;
    g.add(pbox(0.42, 0.08, 0, 0.16, 0.84, 0.08, { front: wood(w[2], { vertical: true, plank: 3 }), sides: solid(w[1]), top: solid(w[3]) }));
    g.add(pbox(0.2, 0.58, 0, 0.6, 0.16, 0.08, { front: wood(w[2], { plank: 3 }), sides: solid(w[1]), top: solid(w[3]) }));
    return { group: g };
  },

  wall_scripture: (P) => {
    const g = new THREE.Group();
    const box = frameBox(P, 1.8, 0.8, 0.06, P.dark[2]);
    box.position.set(0.1 + 0.9, 0.1 + 0.4, 0.03);
    g.add(box);
    const f = liveFace(1.8, 0.8, 0.1, 0.1, 0.065);
    g.add(f.mesh);
    const refresh = (ctx: WallContext) => {
      const v = ctx.verse ?? { text: 'Love is patient, love is kind', ref: '1 Cor 13:4' };
      const { g: c, w, h } = f;
      px(c, P.dark[2], 0, 0, w, h);
      bevel(c, 0, 0, w, h, P.dark[4], P.dark[0]);
      px(c, '#F4ECD8', 2, 2, w - 4, h - 4);
      // Hand-lettered look: lines of script centered like a print (the verse itself shows when tapped).
      const ink = P.T.key === 'lavender' ? '#3E3A78' : '#4A3A2E';
      const r = rng(v.text.length * 13 + 7);
      const lines = [w - 10, w - 6, w - 14];
      lines.forEach((len, i) => scribble(c, Math.round((w - len) / 2), 4 + i * 2, len, ink, r, i === 1));
      const mid = Math.round(w / 2);
      px(c, P.T.ui.accent, mid - 4, h - 3, 3, 1); px(c, P.T.ui.accent, mid + 2, h - 3, 3, 1); px(c, P.T.ui.accent, mid - 1, h - 4, 2, 2);
      f.update();
    };
    refresh({});
    return { group: g, refresh };
  },

  wall_clock: (P) => {
    const g = new THREE.Group();
    const back = pbox(0.05, 0.12, 0, 1.9, 0.76, 0.06, { front: (c, w, h) => { px(c, P.wood[2], 0, 0, w, h); bevel(c, 0, 0, w, h, P.wood[4], P.wood[0]); }, sides: solid(P.wood[1]) });
    g.add(back);
    // Faces are painted at double density so the hands read on a phone.
    const f = liveFace(1.8, 0.66, 0.1, 0.17, 0.065, false, 2);
    g.add(f.mesh);
    const refresh = (ctx: WallContext) => {
      const { g: c, w, h } = f;
      c.clearRect(0, 0, w, h);
      px(c, P.wood[2], 0, 0, w, h);
      for (let y = 3; y < h; y += 4) px(c, P.wood[1], 0, y, w, 1);
      const now = new Date();
      const mine = { h: now.getHours(), m: now.getMinutes() };
      const off = ctx.partnerOffsetMin ?? 0;
      const theirs = new Date(now.getTime() + off * 60000);
      px(c, P.wood[3], 0, 0, w, 1);
      const cy = Math.floor(h / 2);
      clockFace(c, Math.round(w * 0.24), cy, 9, mine.h, mine.m, P);
      clockFace(c, Math.round(w * 0.76), cy, 9, theirs.getHours(), theirs.getMinutes(), P);
      const hx = Math.round(w / 2) - 3;
      for (const [dx, dy, ww] of [[0, 0, 2], [4, 0, 2], [-1, 1, 7], [-1, 2, 7], [0, 3, 5], [1, 4, 3], [2, 5, 1]]) px(c, '#E8506A', hx + dx, cy - 3 + dy, ww, 1);
      px(c, '#FFB3C0', hx, cy - 2);
      f.update();
    };
    refresh({});
    return { group: g, refresh, clock: true };
  },

  wall_calendar: (P) => {
    const g = new THREE.Group();
    const f = liveFace(0.8, 0.86, 0.1, 0.06, 0.02);
    g.add(f.mesh);
    g.add(cbox(0.48, 0.9, 0.0, 0.04, 0.06, 0.04, '#5A5A5A'));
    const refresh = (ctx: WallContext) => {
      const { g: c, w, h } = f;
      px(c, '#FBF6EA', 0, 0, w, h);
      px(c, P.T.ui.accent, 0, 0, w, 4);
      for (let x = 2; x < w; x += 3) px(c, '#5A5A5A', x, 0, 1, 2);
      const d = ctx.daysToVisit;
      const big = d == null ? '?' : d <= 0 ? '♥' : String(Math.min(999, d));
      drawText(c, big, Math.round((w - textWidth(big, 1)) / 2), 6, P.outline, 1);
      const label = d == null ? 'SET' : d <= 0 ? 'TODAY' : 'DAYS';
      drawText(c, label, Math.round((w - textWidth(label)) / 2), 12, '#8A7A6A');
      bevel(c, 0, 0, w, h, '#FFFFFF', '#C8BCA8');
      f.update();
    };
    refresh({});
    return { group: g, refresh, clock: true };
  },

  wall_corkboard: (P) => {
    const g = new THREE.Group();
    const box = frameBox(P, 1.8, 1.8, 0.06);
    box.position.set(0.1 + 0.9, 0.1 + 0.9, 0.03);
    g.add(box);
    const f = liveFace(1.8, 1.8, 0.1, 0.1, 0.065);
    g.add(f.mesh);
    const refresh = (ctx: WallContext) => {
      const { g: c, w, h } = f;
      const cork = ramp('#C89A62');
      const r = rng(4);
      px(c, cork[2], 0, 0, w, h);
      for (let i = 0; i < w * h * 0.25; i++) px(c, [cork[1], cork[3], cork[0]][(r() * 3) | 0], (r() * w) | 0, (r() * h) | 0);
      bevel(c, 0, 0, w, h, P.wood[3], P.wood[0]); bevel(c, 1, 1, w - 2, h - 2, P.wood[2], P.wood[1]);
      const notes = (ctx.notes ?? []).slice(0, 4);
      const slots = [[3, 3], [15, 4], [4, 15], [16, 16]];
      const papers = ['#FFF6A8', '#FFD6E0', '#D6F0FF', '#E0FFD6'];
      if (!notes.length) notes.push({ text: 'WRITE YOUR FIRST NOTE', kind: 'note' });
      notes.forEach((n, i) => {
        const [x, y] = slots[i];
        const paper = n.kind === 'prayer' ? '#FFFFFF' : papers[i % papers.length];
        px(c, shade(paper, -0.15), x + 1, y + 1, 11, 10);
        px(c, paper, x, y, 11, 10);
        const nr = rng(n.text.length * 31 + i);
        const lines = Math.min(3, 1 + Math.floor(n.text.length / 8));
        for (let k = 0; k < lines; k++) scribble(c, x + 2, y + 3 + k * 2, k === lines - 1 ? 4 + ((nr() * 3) | 0) : 7, '#5A5468', nr);
        if (n.kind === 'prayer') { px(c, P.T.ui.accent, x + 8, y + 6, 1, 4); px(c, P.T.ui.accent, x + 7, y + 7, 3, 1); }
        else if (i === 0) heart(c, '#E8506A', x + 8, y + 7);
        disc(c, ['#E8414A', '#3A7AC8', '#F2C230', '#4AA85A'][i % 4], x + 5, y, 1);
      });
      f.update();
    };
    refresh({});
    return { group: g, refresh };
  },

  wall_shelf: (P) => {
    const g = new THREE.Group();
    g.add(pbox(0.05, 0.3, 0, 1.9, 0.08, 0.36, { top: wood(P.wood[3]), sides: solid(P.wood[1]) }));
    for (const x of [0.25, 1.65]) g.add(cbox(x, 0.1, 0, 0.06, 0.2, 0.2, P.metal[1]));
    g.add(pbox(0.3, 0.38, 0.1, 0.18, 0.2, 0.18, { sides: solid(P.T.accent), top: (c, w, h) => { px(c, P.T.accent, 0, 0, w, h); px(c, '#6A4A2A', 1, 1, w - 2, h - 2); } }));
    g.add(pbox(0.8, 0.38, 0.08, 0.1, 0.32, 0.22, { sides: solid(P.T.books[0]) }), pbox(0.9, 0.38, 0.08, 0.08, 0.28, 0.22, { sides: solid(P.T.books[1]) }), pbox(0.98, 0.38, 0.08, 0.11, 0.34, 0.22, { sides: solid(P.T.books[2]) }));
    g.add(pbox(1.35, 0.38, 0.1, 0.2, 0.14, 0.18, { sides: solid(P.pot[2]), top: solid('#5A3A2A') }));
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), flat(P.plant[2]));
    leaf.position.set(1.45, 0.62, 0.19); leaf.castShadow = true; g.add(leaf);
    return { group: g };
  },

  wall_poster: (P) => {
    const g = new THREE.Group();
    const f = liveFace(0.84, 1.8, 0.08, 0.1, 0.012);
    const { g: c, w, h } = f;
    const sky = ramp(P.T.key === 'lavender' ? '#5A4E9E' : '#F2B880');
    for (let y = 0; y < h; y++) px(c, y < h * 0.25 ? sky[4] : y < h * 0.45 ? sky[3] : sky[2], 0, y, w, 1);
    disc(c, '#FFF2C4', (w * 0.7) | 0, (h * 0.25) | 0, 2);
    for (let x = 0; x < w; x++) { const m1 = Math.round(h * 0.5 - Math.abs(Math.sin(x * 0.35)) * 6 - (x > 4 && x < 10 ? 5 : 0)); px(c, '#6A6A9A', x, m1, 1, h); }
    for (let x = 0; x < w; x++) { const m2 = Math.round(h * 0.65 - Math.abs(Math.cos(x * 0.5)) * 4); px(c, '#4A5A7A', x, m2, 1, h); }
    for (let x = 0; x < w; x++) px(c, '#3E6A4A', x, Math.round(h * 0.8 - (x % 3)), 1, h);
    px(c, '#FFFFFF', 7, (h * 0.5 - 10) | 0, 2, 1);
    px(c, '#F6F0E2', 0, h - 4, w, 4);
    drawText(c, 'GO', 2, h - 4 + 0, P.outline);
    bevel(c, 0, 0, w, h, '#FFFFFF', '#C8BCA8');
    for (const [x, y] of [[0, 0], [w - 1, 0]]) px(c, '#C8C8D0', x, y);
    f.update();
    g.add(f.mesh);
    return { group: g };
  },

  wall_lights: (P) => {
    const g = new THREE.Group();
    const pts: THREE.Vector3[] = [];
    const bulbs: THREE.Mesh[] = [];
    const geo = new THREE.SphereGeometry(0.05, 6, 4);
    for (let i = 0; i <= 14; i++) {
      const f = i / 14, x = 0.1 + f * 2.8, y = 0.7 - 0.22 * Math.abs(Math.sin(f * Math.PI * 2));
      pts.push(new THREE.Vector3(x, y + 0.04, 0.03));
      const col = new THREE.Color(P.T.bulbs[i % P.T.bulbs.length]).multiplyScalar(2);
      const b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
      b.position.set(x, y, 0.06); b.userData.base = col.clone(); b.userData.i = i;
      g.add(b); bulbs.push(b);
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: P.outline })));
    return {
      group: g, glow: bulbs,
      tick: (t) => bulbs.forEach((b) => { const k = 0.65 + 0.35 * Math.sin(t * 2.2 + b.userData.i * 1.3); (b.material as THREE.MeshBasicMaterial).color.copy(b.userData.base).multiplyScalar(k); }),
    };
  },
};

export function buildWallItem(key: string, T: Theme): WallArt {
  const P = palette(T);
  const b = builders[key];
  if (!b) { const g = new THREE.Group(); g.add(cbox(0.1, 0.1, 0, 0.8, 0.8, 0.05, '#C8A0A0')); return { group: g }; }
  return b(P);
}

