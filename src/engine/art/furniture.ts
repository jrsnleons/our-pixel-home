// Floor furniture, built as little dioramas of painted boxes and billboards. Each builder
// returns art for rotation 0 with the footprint spanning x 0..w and z 0..d, front facing +z.

import * as THREE from 'three';
import { mix, ramp, shade } from '../../core/color';
import type { Theme } from '../../data/themes';
import { billboard, cbox, decal, flat, panel, pbox, spriteTexture, type BoxFaces } from './kit';
import { books, fabric, glass, marble, metal, palette, solid, wood, type Pal } from './paint';
import { bevel, disc, ellipse, fabricFace, frame as frameRect, heart, line, mirrored, outline, px, rng, sprite, star, woodFace } from './pixel';

export interface ItemArt {
  group: THREE.Group;
  /** Local position of a real point light, if this item lights the room. */
  light?: { pos: THREE.Vector3; color: string };
  /** Meshes that glow when the item is lit. */
  glow?: THREE.Mesh[];
  /** Per-frame animation (globe spin, fish, flames). */
  tick?: (t: number) => void;
}

type Builder = (P: Pal, data?: Record<string, unknown> | null) => ItemArt;

function G(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  return g;
}

const B = (x: number, y: number, z: number, w: number, h: number, d: number, faces: BoxFaces, cast = true) => pbox(x, y, z, w, h, d, faces, { cast });

// ---------- Beds ----------

function pillow(P: Pal, x: number, y: number, z: number, w: number, color = P.sheet[3]) {
  return B(x, y, z, w, 0.14, 0.42, {
    top: (g, W, H) => {
      fabricFace(g, 0, 0, W, H, color, 'plain', 4);
      px(g, shade(color, -0.06), 2, (H / 2) | 0, W - 4, 1);
      bevel(g, 0, 0, W, H, shade(color, 0.06), shade(color, -0.16));
      px(g, shade(color, -0.2), 0, 0); px(g, shade(color, -0.2), W - 1, 0); px(g, shade(color, -0.2), 0, H - 1); px(g, shade(color, -0.2), W - 1, H - 1);
    },
    sides: solid(shade(color, -0.05)),
  });
}

function blanketTop(P: Pal, foldPx = 4): (g: CanvasRenderingContext2D, w: number, h: number) => void {
  const pattern = P.T.blanketPattern === 'hearts' ? 'hearts' : P.T.blanketPattern === 'stars' ? 'stars' : P.T.blanketPattern;
  return (g, w, h) => {
    fabricFace(g, 0, foldPx, w, h - foldPx, P.blanket[2], pattern, 6, pattern === 'hearts' || pattern === 'stars' ? P.blanket[4] : P.blanket[0]);
    // The sheet folded over the top edge.
    px(g, P.sheet[3], 0, 0, w, foldPx - 1);
    px(g, P.sheet[1], 0, foldPx - 1, w, 1);
    for (let x = 1; x < w; x += 3) px(g, P.sheet[4], x, 1);
    // Wrinkles
    const r = rng(12);
    for (let i = 0; i < 5; i++) { const x = (r() * (w - 6)) | 0, y = foldPx + 3 + ((r() * (h - foldPx - 6)) | 0); px(g, shade(P.blanket[2], -0.1), x, y, 4, 1); px(g, shade(P.blanket[2], 0.08), x + 1, y - 1, 3, 1); }
    bevel(g, 0, 0, w, h, P.sheet[4], P.blanket[0]);
  };
}

function mattress(P: Pal, x: number, y: number, z: number, w: number, d: number, h: number, blanketFrom: number) {
  const parts: THREE.Object3D[] = [];
  // Sheet-covered mattress head part.
  parts.push(B(x, y, z, w, h, blanketFrom, {
    top: fabric(P.sheet[2], 'plain'),
    sides: (g, W, H) => { px(g, P.sheet[2], 0, 0, W, H); px(g, P.sheet[1], 0, H - 2, W, 2); px(g, P.sheet[3], 0, 0, W, 1); },
  }));
  // Blanket draped over the rest, hanging a little over the sides.
  const bd = d - blanketFrom;
  parts.push(B(x - 0.04, y, z + blanketFrom, w + 0.08, h + 0.04, bd + 0.04, {
    top: blanketTop(P),
    sides: (g, W, H) => { fabricFace(g, 0, 0, W, H, P.blanket[1], 'plain', 2); px(g, P.blanket[0], 0, H - 1, W, 1); px(g, P.blanket[2], 0, 0, W, 1); },
  }));
  return parts;
}

const beds: Record<string, Builder> = {
  bed_mat: (P) => {
    const g = G();
    const mat = ramp(mix(P.T.cushion, '#D8CCB8', 0.55));
    g.add(B(0.08, 0, 0.06, 0.84, 0.1, 1.86, {
      top: (c, w, h) => { fabricFace(c, 0, 0, w, h, mat[2], 'stripe', 8, mat[3]); bevel(c, 0, 0, w, h, mat[4], mat[0]); },
      sides: solid(mat[1]),
    }));
    g.add(pillow(P, 0.18, 0.1, 0.12, 0.64, P.sheet[2]));
    g.add(B(0.1, 0.1, 0.78, 0.8, 0.07, 1.08, { top: blanketTop(P, 3), sides: solid(P.blanket[1]) }));
    return { group: g };
  },
  bed_futon: (P) => {
    const g = G();
    // Low slatted base.
    g.add(B(0, 0, 0, 2, 0.16, 3, { top: wood(P.wood[2], { vertical: true, plank: 5 }), sides: wood(P.wood[1], { plank: 3 }) }));
    g.add(...mattress(P, 0.08, 0.16, 0.08, 1.84, 2.84, 0.2, 1.05));
    g.add(pillow(P, 0.3, 0.36, 0.2, 1.4));
    return { group: g };
  },
  bed_wood: (P) => {
    const g = G();
    const legs = [[0, 0], [1.84, 0], [0, 2.84], [1.84, 2.84]];
    for (const [x, z] of legs) g.add(cbox(x, 0, z, 0.16, 0.18, 0.16, P.wood[1]));
    g.add(B(0, 0.12, 0, 2, 0.22, 3, { top: wood(P.wood[2]), sides: wood(P.wood[2], { plank: 6 }) }));
    g.add(...mattress(P, 0.06, 0.34, 0.12, 1.88, 2.82, 0.22, 1.0));
    g.add(pillow(P, 0.18, 0.56, 0.22, 0.78), pillow(P, 1.04, 0.56, 0.22, 0.78));
    // Headboard with a carved heart.
    g.add(B(0, 0, -0.04, 2, 1.25, 0.18, {
      front: (c, w, h) => {
        woodFace(c, 0, 0, w, h, P.wood[2], 3, 5);
        px(c, P.outline, 0, 0, w, 1); px(c, P.wood[4], 0, 1, w, 1);
        frameRect(c, 3, 4, w - 6, h - 9, P.wood[0]);
        px(c, P.wood[3], 4, h - 6, w - 8, 1);
        const hx = (w / 2 - 3) | 0;
        sprite(c, ['.hh.hh.', 'hhhhhhh', 'hhhhhhh', '.hhhhh.', '..hhh..', '...h...'], { h: P.wood[0] }, hx, 7);
        sprite(c, ['.hh.hh.', 'h.....h'], { h: P.wood[4] }, hx, 6);
      },
      sides: wood(P.wood[1]), top: solid(P.wood[3]),
    }));
    g.add(B(0, 0, 2.86, 2, 0.6, 0.14, { front: wood(P.wood[2], { plank: 5 }), sides: wood(P.wood[1]), top: solid(P.wood[3]) }));
    return { group: g };
  },
  bed_quilted: (P) => {
    const g = G();
    const up = ramp(mix(P.T.cushion, P.T.sheet, 0.25));
    for (const [x, z] of [[0.04, 0.1], [1.82, 0.1], [0.04, 2.82], [1.82, 2.82]]) g.add(cbox(x, 0, z, 0.14, 0.14, 0.14, P.dark[1]));
    // Bed skirt.
    g.add(B(0, 0.1, 0.06, 2, 0.28, 2.94, { top: solid(up[2]), sides: (c, w, h) => { px(c, up[2], 0, 0, w, h); for (let x = 0; x < w; x += 4) px(c, up[1], x, 2, 1, h - 2); px(c, up[3], 0, 0, w, 1); px(c, up[0], 0, h - 1, w, 1); } }));
    g.add(...mattress(P, 0.02, 0.38, 0.14, 1.96, 2.86, 0.26, 1.05));
    // Quilt stitching gets a second, softer pattern.
    g.add(pillow(P, 0.14, 0.64, 0.24, 0.82), pillow(P, 1.04, 0.64, 0.24, 0.82));
    g.add(B(0.62, 0.7, 0.58, 0.76, 0.16, 0.18, { front: fabric(P.accent[2], 'hearts', P.accent[4]), top: fabric(P.accent[3]), sides: solid(P.accent[1]) }));
    // Tufted upholstered headboard.
    g.add(B(-0.04, 0, -0.06, 2.08, 1.55, 0.22, {
      front: (c, w, h) => {
        px(c, up[2], 0, 0, w, h);
        for (let y = 5; y < h - 3; y += 6) for (let x = 4 + ((y / 6) & 1) * 3; x < w - 2; x += 6) {
          px(c, up[0], x, y); px(c, up[1], x - 1, y - 1); px(c, up[3], x + 1, y + 1);
          px(c, up[1], x - 2, y - 2); px(c, up[1], x + 2, y - 2);
        }
        bevel(c, 0, 0, w, h, up[4], up[0]);
        px(c, P.dark[2], 0, 0, w, 2);
      },
      sides: solid(up[1]), top: solid(P.dark[2]),
    }));
    return { group: g };
  },
  bed_canopy: (P) => {
    const g = G();
    const w = P.dark;
    g.add(B(0, 0.1, 0, 2, 0.3, 3, { top: wood(w[2]), sides: (c, W, H) => { woodFace(c, 0, 0, W, H, w[2], 4, 5); px(c, P.gold[2], 0, 1, W, 1); bevel(c, 0, 0, W, H, w[4], w[0]); } }));
    g.add(...mattress(P, 0.05, 0.4, 0.15, 1.9, 2.8, 0.26, 1.05));
    g.add(pillow(P, 0.14, 0.66, 0.24, 0.82), pillow(P, 1.04, 0.66, 0.24, 0.82));
    g.add(pillow(P, 0.4, 0.78, 0.48, 1.2, P.accent[3]));
    const H = 2.7;
    for (const [x, z] of [[0, 0], [1.86, 0], [0, 2.86], [1.86, 2.86]]) {
      g.add(B(x, 0, z, 0.14, H, 0.14, { sides: (c, W, Hh) => { woodFace(c, 0, 0, W, Hh, w[2], 2, 3, true); for (let y = 6; y < Hh; y += 12) px(c, P.gold[3], 0, y, W, 1); }, top: solid(P.gold[3]) }));
      g.add(cbox(x - 0.02, H, z - 0.02, 0.18, 0.08, 0.18, P.gold[2]));
    }
    // Top rails.
    g.add(cbox(0, H - 0.12, 0, 2, 0.1, 0.14, w[1]), cbox(0, H - 0.12, 2.86, 2, 0.1, 0.14, w[1]));
    g.add(cbox(0, H - 0.12, 0, 0.14, 0.1, 3, w[1]), cbox(1.86, H - 0.12, 0, 0.14, 0.1, 3, w[1]));
    // Draped curtains at the head, gathered with a tie.
    const drape = (c: CanvasRenderingContext2D, W: number, Hh: number) => {
      const cc = ramp(P.T.curtain === '#FFFFFF' ? '#F6EEF0' : mix(P.T.curtain, '#FFFFFF', 0.35));
      for (let x = 0; x < W; x++) {
        const fold = x % 4;
        const col = fold === 0 ? cc[1] : fold === 1 ? cc[2] : fold === 2 ? cc[3] : cc[2];
        const pinch = Math.abs(Hh * 0.55 - 0) ;
        void pinch;
        px(c, col, x, 0, 1, Hh);
      }
      px(c, P.gold[2], 0, (Hh * 0.55) | 0, W, 2);
      for (let x = 0; x < W; x += 2) px(c, cc[4], x, Hh - 1);
    };
    for (const x of [0.14, 1.46]) {
      const p = panel(x, 0.9, 0.16, 0.4, H - 1.0, drape, { cast: true });
      g.add(p);
    }
    const back = panel(0.14, 1.1, 0.04, 1.72, H - 1.2, drape);
    g.add(back);
    // Sheer canopy top.
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 2.86), new THREE.MeshLambertMaterial({ color: mix(P.T.curtain, '#FFFFFF', 0.6), transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    top.rotation.x = -Math.PI / 2; top.position.set(1, H - 0.04, 1.5);
    g.add(top);
    return { group: g };
  },
};

// ---------- Tables ----------

const tables: Record<string, Builder> = {
  table_box: () => {
    const g = G();
    const k = ramp('#C8A070');
    g.add(B(0.14, 0, 0.14, 0.72, 0.62, 0.72, {
      top: (c, w, h) => { px(c, k[2], 0, 0, w, h); px(c, k[1], 0, (h / 2) | 0, w, 1); px(c, '#D8C8A0', (w / 2 - 2) | 0, 0, 4, h); bevel(c, 0, 0, w, h, k[3], k[0]); },
      sides: (c, w, h) => {
        px(c, k[2], 0, 0, w, h);
        for (let i = 0; i < 20; i++) px(c, k[3], (Math.sin(i * 7) * 0.5 + 0.5) * w | 0, (Math.cos(i * 3) * 0.5 + 0.5) * h | 0);
        px(c, '#D8C8A0', (w / 2 - 2) | 0, 0, 4, 3);
        px(c, k[0], 0, h - 1, w, 1); px(c, k[3], 0, 0, w, 1);
        // "This side up" arrows.
        px(c, k[0], 2, 4, 1, 3); px(c, k[0], 1, 5); px(c, k[0], 3, 5);
      },
    }));
    // A mug of tea on top.
    g.add(B(0.44, 0.62, 0.44, 0.16, 0.16, 0.16, { top: (c, w, h) => { px(c, '#8A5A3A', 0, 0, w, h); px(c, '#F2EEE4', 0, 0, w, 1); }, sides: solid('#F2EEE4') }));
    return { group: g };
  },
  table_folding: (P) => {
    const g = G();
    const m = P.metal;
    for (const x of [0.12, 1.82]) {
      g.add(cbox(x, 0, 0.12, 0.06, 0.68, 0.06, m[1]), cbox(x, 0, 0.82, 0.06, 0.68, 0.06, m[1]));
      g.add(cbox(x, 0.3, 0.14, 0.06, 0.04, 0.72, m[2]));
    }
    g.add(B(0.02, 0.68, 0.04, 1.96, 0.06, 0.92, { top: solid('#E8E2D2', { noise: 0.05 }), sides: solid('#B8B2A2') }));
    // A notebook and a pen.
    g.add(B(0.3, 0.74, 0.25, 0.42, 0.04, 0.3, { top: (c, w, h) => { px(c, '#F2EEE4', 0, 0, w, h); for (let y = 1; y < h; y += 2) px(c, '#A8B8D8', 1, y, w - 2, 1); px(c, P.accent[2], 0, 0, 1, h); }, sides: solid('#D8D2C2') }));
    return { group: g };
  },
  table_games: (P) => {
    const g = G();
    const w = P.wood;
    for (const [x, z] of [[0.08, 0.08], [1.8, 0.08], [0.08, 0.8], [1.8, 0.8]]) g.add(B(x, 0, z, 0.12, 0.66, 0.12, { sides: wood(w[1], { vertical: true }) }));
    g.add(B(0.04, 0.5, 0.06, 1.92, 0.16, 0.88, { front: (c, W, H) => { woodFace(c, 0, 0, W, H, w[2], 4, 3); px(c, w[0], (W / 2 - 4) | 0, 1, 8, H - 2); px(c, P.gold[3], (W / 2 - 1) | 0, H / 2 | 0, 2, 1); }, sides: wood(w[2]) }));
    g.add(B(0, 0.66, 0, 2, 0.1, 1, { top: (c, W, H) => { woodFace(c, 0, 0, W, H, w[2], 9, 4); bevel(c, 0, 0, W, H, w[4], w[0]); }, sides: solid(w[1]) }));
    // Standing Connect 4 board.
    const board = spriteTexture(16, 14, (c) => {
      const f = P.T.key === 'cabin' ? '#2F5D7C' : '#3D6FB0';
      px(c, f, 1, 1, 14, 10); px(c, mix(f, '#FFFFFF', 0.3), 1, 1, 14, 1);
      const r = rng(5);
      for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
        const v = r(); const cc = row < 2 && v < 0.6 ? shade(f, -0.35) : v < 0.5 ? '#E8414A' : '#F7D046';
        px(c, cc, 2 + col * 2, 2 + row * 2);
      }
      px(c, shade(f, -0.2), 1, 11, 2, 2); px(c, shade(f, -0.2), 13, 11, 2, 2);
      outline(c, 16, 14);
    });
    const bb = billboard(board, 1, 0.875); bb.position.set(0.6, 0.76, 0.5); g.add(bb);
    // Tic-tac-toe paper.
    g.add(decal(1.2, 0.765, 0.3, 0.5, 0.4, (c, W, H) => { px(c, '#F6F0E2', 0, 0, W, H); px(c, '#5A5A6A', 2, 2 + 4, W - 4, 1); px(c, '#5A5A6A', 2, 2 + 8, W - 4, 1); px(c, '#5A5A6A', 5, 1, 1, H - 2); px(c, '#5A5A6A', 9, 1, 1, H - 2); px(c, '#C83A3A', 2, 2, 2, 2); px(c, '#3A5AC8', 6, 6, 2, 2); }));
    return { group: g };
  },
  table_cafe: (P) => {
    const g = G();
    const cloth = ramp(P.T.key === 'strawberry' ? '#FFFFFF' : mix(P.T.sheet, '#FFFFFF', 0.4));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 20), [
      new THREE.MeshLambertMaterial({ color: cloth[2] }),
      new THREE.MeshLambertMaterial({ map: spriteTexture(32, 32, (c) => { fabricFace(c, 0, 0, 32, 32, cloth[3], 'gingham', 2); for (let i = 0; i < 32; i += 2) { px(c, P.accent[2], i, 0); px(c, P.accent[2], 0, i); } }) }),
      new THREE.MeshLambertMaterial({ color: cloth[1] }),
    ]);
    top.position.set(1, 0.78, 1); top.castShadow = true; top.receiveShadow = true; g.add(top);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.97, 1.0, 0.22, 20, 1, true), new THREE.MeshLambertMaterial({ map: spriteTexture(64, 4, (c) => { for (let x = 0; x < 64; x++) px(c, x % 4 < 2 ? cloth[2] : cloth[1], x, 0, 1, 4); }), side: THREE.DoubleSide }));
    skirt.position.set(1, 0.64, 1); g.add(skirt);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.66, 8), flat(P.metal[0]));
    ped.position.set(1, 0.33, 1); ped.castShadow = true; g.add(ped);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.05, 12), flat(P.metal[1]));
    foot.position.set(1, 0.025, 1); g.add(foot);
    // Flower in a bud vase.
    const vase = spriteTexture(8, 14, (c) => { px(c, '#BFE3EC', 3, 8, 2, 6); px(c, '#FFFFFF', 3, 8, 1, 4); px(c, '#4F7A3A', 4, 3, 1, 6); px(c, P.accent[2], 3, 1, 3, 3); px(c, P.accent[4], 4, 1); outline(c, 8, 14); });
    const v = billboard(vase, 0.5, 0.875); v.position.set(1, 0.83, 1); g.add(v);
    return { group: g };
  },
  table_marble: (P) => {
    const g = G();
    for (const [x, z] of [[0.12, 0.12], [1.78, 0.12], [0.12, 0.78], [1.78, 0.78]]) g.add(B(x, 0, z, 0.1, 0.7, 0.1, { sides: metal('#D9A93A'), top: solid('#F6D77A') }));
    g.add(cbox(0.14, 0.5, 0.14, 1.72, 0.04, 0.04, P.gold[2]), cbox(0.14, 0.5, 0.82, 1.72, 0.04, 0.04, P.gold[2]));
    g.add(B(0, 0.7, 0, 2, 0.1, 1, { top: marble(4), sides: marble(6) }));
    g.add(B(0.85, 0.8, 0.35, 0.3, 0.06, 0.3, { top: (c, w, h) => { disc(c, '#F2EEE4', w / 2, h / 2, 2); px(c, '#C83A4A', 2, 2, 2, 1); }, sides: solid('#E8E4DC') }));
    return { group: g };
  },
};

// ---------- Seating ----------

function tuft(color: string): (c: CanvasRenderingContext2D, w: number, h: number) => void {
  const r = ramp(color);
  return (c, w, h) => {
    px(c, r[2], 0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = Math.abs(x - w / 2) / (w / 2), dy = Math.abs(y - h / 2) / (h / 2);
      const d = Math.max(dx, dy);
      if (d > 0.82) px(c, r[1], x, y); else if (d < 0.3) px(c, r[3], x, y);
    }
    px(c, r[0], (w / 2) | 0, (h / 2) | 0); px(c, r[4], ((w / 2) | 0) - 1, ((h / 2) | 0) - 1);
    line(c, r[1], 1, 1, (w / 2) - 1, (h / 2) - 1); line(c, r[1], w - 2, 1, w / 2 + 1, h / 2 - 1);
    line(c, r[1], 1, h - 2, w / 2 - 1, h / 2 + 1); line(c, r[1], w - 2, h - 2, w / 2 + 1, h / 2 + 1);
    bevel(c, 0, 0, w, h, r[4], r[0]);
  };
}

const seating: Record<string, Builder> = {
  seat_cushion: (P) => ({ group: G(B(0.12, 0, 0.12, 0.76, 0.2, 0.76, { top: tuft(P.T.cushion), sides: (c, w, h) => { px(c, P.cushion[1], 0, 0, w, h); px(c, P.cushion[2], 0, 0, w, 1); px(c, P.cushion[0], 0, h - 1, w, 1); for (let x = 1; x < w; x += 3) px(c, P.cushion[3], x, 1); } })) }),
  seat_stool: (P) => {
    const g = G();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 14), [flat(P.wood[1]), new THREE.MeshLambertMaterial({ map: spriteTexture(16, 16, (c) => { disc(c, P.wood[2], 8, 8, 7); for (let r = 2; r < 7; r += 2) for (let a = 0; a < 40; a++) px(c, P.wood[1], Math.round(8 + Math.cos(a / 40 * 6.283) * r), Math.round(8 + Math.sin(a / 40 * 6.283) * r)); px(c, P.wood[4], 5, 4, 3, 1); }), transparent: false }), flat(P.wood[0])]);
    seat.position.set(0.5, 0.48, 0.5); seat.castShadow = true; seat.receiveShadow = true; g.add(seat);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const leg = cbox(0.5 + Math.cos(a) * 0.22 - 0.03, 0, 0.5 + Math.sin(a) * 0.22 - 0.03, 0.06, 0.45, 0.06, P.wood[1]);
      leg.rotation.z = Math.cos(a) * 0.12; leg.rotation.x = -Math.sin(a) * 0.12;
      g.add(leg);
    }
    return { group: g };
  },
  seat_beanbag: (P) => {
    const g = G();
    const c = ramp(P.T.key === 'cabin' ? '#3E6E8E' : P.T.accent);
    const tex = spriteTexture(32, 16, (cx) => { fabricFace(cx, 0, 0, 32, 16, c[2], 'velvet', 8); for (let x = 0; x < 32; x += 8) px(cx, c[1], x, 0, 1, 16); px(cx, c[3], 0, 0, 32, 3); });
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 7), new THREE.MeshLambertMaterial({ map: tex }));
    bag.scale.set(1, 0.68, 1); bag.position.set(0.5, 0.28, 0.5); bag.castShadow = true; bag.receiveShadow = true;
    g.add(bag);
    const dent = new THREE.Mesh(new THREE.CircleGeometry(0.22, 10), flat(c[1]));
    dent.rotation.x = -Math.PI / 2 + 0.25; dent.position.set(0.5, 0.56, 0.56); g.add(dent);
    return { group: g };
  },
  seat_loveseat: (P) => sofa(P, 2, false),
  seat_sofa: (P) => sofa(P, 3, true),
};

function sofa(P: Pal, W: number, velvet: boolean): ItemArt {
  const g = G();
  const base = velvet ? (P.T.key === 'honey' ? '#7A3A4A' : P.T.key === 'matcha' ? '#4E6A4A' : P.T.key === 'cabin' ? '#2F4A5E' : P.T.key === 'lavender' ? '#5A3E7A' : '#C85A78') : P.T.cushion;
  const c = ramp(base);
  const pattern = velvet ? 'velvet' : 'plain';
  const feet = velvet ? P.gold[2] : P.dark[1];
  for (const [x, z] of [[0.08, 0.1], [W - 0.18, 0.1], [0.08, 0.8], [W - 0.18, 0.8]]) g.add(cbox(x, 0, z, 0.1, 0.12, 0.1, feet));
  g.add(B(0.02, 0.1, 0.06, W - 0.04, 0.24, 0.9, { sides: fabric(c[1], pattern), top: fabric(c[2], pattern) }));
  // Seat cushions, one per tile.
  for (let i = 0; i < W; i++) {
    g.add(B(i + 0.18, 0.34, 0.3, 0.64, 0.12, 0.62, { top: (cx, w, h) => { fabricFace(cx, 0, 0, w, h, c[2], pattern, 3 + i); bevel(cx, 0, 0, w, h, c[4], c[0]); px(cx, c[1], 1, h - 3, w - 2, 1); }, sides: fabric(c[2], pattern), front: (cx, w, h) => { px(cx, c[2], 0, 0, w, h); px(cx, c[3], 0, 0, w, 1); px(cx, c[0], 0, h - 1, w, 1); for (let x = 2; x < w - 1; x += 3) px(cx, c[1], x, 1); } }));
  }
  // Back
  g.add(B(0.05, 0.3, 0.02, W - 0.1, 0.62, 0.3, {
    front: (cx, w, h) => {
      fabricFace(cx, 0, 0, w, h, c[2], pattern, 9);
      if (velvet) for (let y = 3; y < h - 2; y += 4) for (let x = 3 + ((y >> 2) & 1) * 2; x < w - 2; x += 5) { px(cx, c[0], x, y); px(cx, P.gold[3], x, y - 1); }
      else for (let i = 1; i < W; i++) px(cx, c[1], i * 16 - 1, 2, 1, h - 3);
      bevel(cx, 0, 0, w, h, c[4], c[0]);
    },
    top: fabric(c[3], pattern), sides: fabric(c[1], pattern),
  }));
  // Arms
  for (const x of [0, W - 0.22]) {
    if (velvet) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.86, 10), new THREE.MeshLambertMaterial({ map: spriteTexture(16, 16, (cx) => fabricFace(cx, 0, 0, 16, 16, c[2], 'velvet', 4)) }));
      arm.rotation.x = Math.PI / 2; arm.position.set(x + 0.11, 0.58, 0.48); arm.castShadow = true; g.add(arm);
      g.add(B(x, 0.12, 0.06, 0.22, 0.46, 0.86, { sides: fabric(c[1], pattern), top: fabric(c[2], pattern) }));
    } else g.add(B(x, 0.12, 0.04, 0.22, 0.52, 0.9, { sides: fabric(c[1], pattern), top: (cx, w, h) => { fabricFace(cx, 0, 0, w, h, c[3], pattern); bevel(cx, 0, 0, w, h, c[4], c[1]); } }));
  }
  // A throw pillow.
  g.add(B(0.3, 0.46, 0.34, 0.42, 0.34, 0.12, { front: fabric(P.accent[2], P.T.key === 'strawberry' ? 'hearts' : 'stripe', P.accent[4]), sides: solid(P.accent[1]), top: solid(P.accent[3]) }));
  return { group: g };
}

// ---------- Lighting ----------

function bulbMesh(x: number, y: number, z: number, r: number, color: string) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8), toneMapped: false }));
  m.position.set(x, y, z);
  return m;
}

const lighting: Record<string, Builder> = {
  light_bulb: (P) => {
    const g = G();
    g.add(B(0.3, 0, 0.3, 0.4, 0.05, 0.4, { top: solid(P.metal[1]), sides: solid(P.metal[0]) }));
    g.add(cbox(0.475, 0.05, 0.475, 0.05, 1.3, 0.05, P.metal[1]));
    g.add(cbox(0.46, 1.33, 0.46, 0.08, 0.08, 0.08, '#4A4A4A'));
    const bulb = bulbMesh(0.5, 1.48, 0.5, 0.09, '#FFE0A0');
    g.add(bulb);
    // A cord that drapes to the floor.
    g.add(cbox(0.52, 0, 0.3, 0.03, 0.02, 0.6, '#3A3A3A'));
    return { group: g, light: { pos: new THREE.Vector3(0.5, 1.48, 0.5), color: '#FFD9A0' }, glow: [bulb] };
  },
  light_desk: (P) => {
    const g = G();
    // Side table with a lamp on it.
    g.add(B(0.18, 0, 0.18, 0.64, 0.55, 0.64, { top: wood(P.wood[2]), sides: (c, w, h) => { woodFace(c, 0, 0, w, h, P.wood[2], 3, 4); frameRect(c, 2, 2, w - 4, (h / 2) | 0, P.wood[0]); px(c, P.gold[3], (w / 2) | 0, (h / 4 + 1) | 0); } }));
    g.add(B(0.4, 0.55, 0.4, 0.2, 0.04, 0.2, { sides: solid(P.metal[1]), top: solid(P.metal[2]) }));
    g.add(cbox(0.48, 0.59, 0.48, 0.04, 0.3, 0.04, P.metal[1]));
    const shadeTex = spriteTexture(16, 12, (c) => {
      const s = ramp(P.T.shade);
      for (let y = 0; y < 12; y++) { const inset = Math.floor((11 - y) / 3); px(c, s[2], inset, y, 16 - inset * 2, 1); }
      for (let x = 1; x < 15; x += 2) px(c, s[1], x, 3, 1, 9);
      px(c, s[4], 3, 0, 10, 1); px(c, s[0], 0, 11, 16, 1);
      outline(c, 16, 12);
    });
    const sh = billboard(shadeTex, 0.5, 0.375, { emissive: true, cast: false });
    sh.position.set(0.5, 0.82, 0.5); g.add(sh);
    return { group: g, light: { pos: new THREE.Vector3(0.5, 0.9, 0.5), color: '#FFC878' }, glow: [sh] };
  },
  light_floor: (P) => {
    const g = G();
    g.add(B(0.3, 0, 0.3, 0.4, 0.06, 0.4, { top: solid(P.dark[2]), sides: solid(P.dark[1]) }));
    g.add(cbox(0.47, 0.06, 0.47, 0.06, 1.5, 0.06, P.dark[1]));
    const s = ramp(P.T.shade);
    const shadeM = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.4, 14, 1, true), new THREE.MeshLambertMaterial({ map: spriteTexture(32, 8, (c) => { px(c, s[2], 0, 0, 32, 8); for (let x = 0; x < 32; x += 4) px(c, s[1], x, 1, 1, 6); px(c, s[0], 0, 0, 32, 1); px(c, s[0], 0, 7, 32, 1); }), side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.55, emissiveMap: null }));
    (shadeM.material as THREE.MeshLambertMaterial).emissiveMap = (shadeM.material as THREE.MeshLambertMaterial).map;
    shadeM.position.set(0.5, 1.6, 0.5); shadeM.castShadow = true; g.add(shadeM);
    const bulb = bulbMesh(0.5, 1.52, 0.5, 0.08, '#FFE0A0'); g.add(bulb);
    return { group: g, light: { pos: new THREE.Vector3(0.5, 1.5, 0.5), color: '#FFC070' }, glow: [shadeM, bulb] };
  },
  light_lanterns: (P) => {
    const g = G();
    g.add(B(0.2, 0, 0.42, 0.6, 0.06, 0.16, { sides: wood(P.wood[1]), top: wood(P.wood[2]) }));
    g.add(cbox(0.47, 0.06, 0.47, 0.06, 1.6, 0.06, P.wood[1]));
    g.add(cbox(0.1, 1.6, 0.47, 0.8, 0.05, 0.06, P.wood[1]));
    const glows: THREE.Mesh[] = [];
    const colors = [P.T.accent, P.T.shade === '#FFFFFF' ? '#FFD0DA' : P.T.shade, '#FFE6B0'];
    [[0.16, 1.32, 0.22], [0.5, 1.12, 0.26], [0.84, 1.36, 0.2]].forEach(([x, y, r], i) => {
      const col = ramp(colors[i % colors.length]);
      const tex = spriteTexture(16, 8, (c) => { px(c, col[3], 0, 0, 16, 8); for (let yy = 1; yy < 8; yy += 2) px(c, col[2], 0, yy, 16, 1); px(c, col[4], 0, 3, 16, 1); });
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.75 }));
      m.position.set(x, y, 0.5); m.castShadow = true; g.add(m); glows.push(m);
      g.add(cbox(x - 0.01, y + r - 0.02, 0.49, 0.02, 1.6 - y - r + 0.02, 0.02, '#3A3A3A'));
    });
    return { group: g, light: { pos: new THREE.Vector3(0.5, 1.2, 0.5), color: '#FFC890' }, glow: glows };
  },
  light_chandelier: (P) => {
    const g = G();
    const y0 = 3.15;
    g.add(cbox(0.48, y0 + 0.3, 0.48, 0.04, 0.6, 0.04, P.gold[1]));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 6, 16), flat(P.gold[2]));
    ring.rotation.x = Math.PI / 2; ring.position.set(0.5, y0, 0.5); g.add(ring);
    g.add(cbox(0.44, y0 - 0.1, 0.44, 0.12, 0.3, 0.12, P.gold[2]));
    const glows: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = 0.5 + Math.cos(a) * 0.36, z = 0.5 + Math.sin(a) * 0.36;
      g.add(cbox(x - 0.03, y0, z - 0.03, 0.06, 0.12, 0.06, '#F6F0E2'));
      const b = bulbMesh(x, y0 + 0.17, z, 0.045, '#FFE0A0'); g.add(b); glows.push(b);
      const crystal = bulbMesh(x, y0 - 0.12, z, 0.03, '#E8F4FF'); g.add(crystal);
    }
    return { group: g, light: { pos: new THREE.Vector3(0.5, y0 + 0.1, 0.5), color: '#FFE2B0' }, glow: glows };
  },
};

// ---------- Storage ----------

const storage: Record<string, Builder> = {
  store_crate: (P) => {
    const g = G();
    const slats = (c: CanvasRenderingContext2D, w: number, h: number) => {
      const k = ramp(mix(P.T.wood, '#C8A878', 0.5));
      px(c, k[0], 0, 0, w, h);
      for (let y = 0; y < h; y += 4) { px(c, k[2], 1, y, w - 2, 3); px(c, k[3], 1, y, w - 2, 1); }
      px(c, k[1], 0, 0, 2, h); px(c, k[1], w - 2, 0, 2, h);
      px(c, '#5A5A5A', 2, 1); px(c, '#5A5A5A', w - 3, 1); px(c, '#5A5A5A', 2, h - 2); px(c, '#5A5A5A', w - 3, h - 2);
    };
    g.add(B(0.12, 0, 0.16, 0.76, 0.6, 0.68, { sides: slats, top: slats }));
    g.add(B(0.25, 0.6, 0.3, 0.5, 0.08, 0.36, { sides: solid('#5B7DB1'), top: (c, w, h) => { px(c, '#5B7DB1', 0, 0, w, h); px(c, '#F2EEE4', 0, 0, w, 1); } }));
    g.add(B(0.28, 0.68, 0.34, 0.42, 0.06, 0.3, { sides: solid('#C8572B'), top: solid('#C8572B') }));
    return { group: g };
  },
  store_shelf: (P) => {
    const g = G();
    g.add(B(0.08, 0, 0.52, 0.84, 1.1, 0.42, {
      front: (c, w, h) => {
        woodFace(c, 0, 0, w, h, P.wood[2], 5, 4);
        px(c, P.outline, 0, 0, w, 1);
        for (const [y0, y1] of [[2, 8], [10, 16]]) { px(c, P.wood[0], 2, y0, w - 4, y1 - y0 + 1); books(c, 2, w - 2, y1, P.T.books, y0 * 7, 6); px(c, P.wood[4], 1, y1 + 1, w - 2, 1); }
        bevel(c, 0, 0, w, h, P.wood[3], P.wood[0]);
      },
      sides: wood(P.wood[1]), top: wood(P.wood[3]),
    }));
    const plant = spriteTexture(10, 10, (c) => { px(c, P.pot[2], 3, 6, 4, 4); px(c, P.pot[3], 3, 6, 1, 4); px(c, P.plant[2], 2, 2, 6, 4); px(c, P.plant[3], 3, 1, 3, 2); px(c, P.plant[1], 5, 4, 3, 2); outline(c, 10, 10); });
    const pb = billboard(plant, 0.5, 0.5); pb.position.set(0.5, 1.1, 0.72); g.add(pb);
    return { group: g };
  },
  store_bookshelf: (P) => {
    const g = G();
    g.add(B(0.04, 0, 0.5, 1.92, 2.1, 0.48, {
      front: (c, w, h) => {
        woodFace(c, 0, 0, w, h, P.wood[2], 11, 4);
        px(c, P.outline, 0, 0, w, 1);
        const rows = [[2, 9], [12, 19], [22, 26], [29, 32]];
        rows.forEach(([y0, y1], i) => {
          px(c, mix(P.wood[0], '#000000', 0.25), 2, y0, w - 4, y1 - y0 + 1);
          books(c, 2, w - 2, y1, P.T.books, 31 + i * 17, Math.min(7, y1 - y0));
          px(c, P.wood[4], 1, y1 + 1, w - 2, 1); px(c, P.wood[1], 1, y1 + 2, w - 2, 1);
        });
        // The Bible: a black spine with gold lettering on the second shelf.
        px(c, '#2A2026', 20, 13, 2, 7); px(c, '#D9A93A', 20, 14, 2, 1); px(c, '#D9A93A', 20, 18, 2, 1);
        bevel(c, 0, 0, w, h, P.wood[3], P.wood[0]);
      },
      sides: wood(P.wood[1]), top: wood(P.wood[3]),
    }));
    return { group: g };
  },
  store_wardrobe: (P) => {
    const g = G();
    const w = P.wood;
    g.add(B(0.04, 0, 0.4, 1.92, 2.3, 0.6, {
      front: (c, W, H) => {
        woodFace(c, 0, 0, W, H, w[2], 21, 6, true);
        px(c, w[0], (W / 2) | 0, 3, 1, H - 6);
        for (const x0 of [2, (W / 2 + 2) | 0]) { frameRect(c, x0, 4, (W / 2 - 4) | 0, H - 14, w[0]); frameRect(c, x0 + 2, 6, (W / 2 - 8) | 0, ((H - 18) / 2) | 0, w[1]); frameRect(c, x0 + 2, 8 + ((H - 18) / 2 | 0), (W / 2 - 8) | 0, ((H - 18) / 2) | 0, w[1]); }
        px(c, P.gold[3], (W / 2 - 2) | 0, (H / 2) | 0, 1, 3); px(c, P.gold[3], (W / 2 + 1) | 0, (H / 2) | 0, 1, 3);
        frameRect(c, 2, H - 8, W - 4, 6, w[0]); px(c, P.gold[3], (W / 2) | 0, H - 5);
        px(c, P.outline, 0, 0, W, 1); px(c, w[4], 0, 1, W, 2);
        bevel(c, 0, 0, W, H, w[3], w[0]);
      },
      sides: wood(w[1], { vertical: true, plank: 6 }), top: wood(w[3]),
    }));
    g.add(B(0, 2.3, 0.36, 2, 0.12, 0.68, { front: (c, W, H) => { px(c, w[3], 0, 0, W, H); for (let x = 1; x < W; x += 3) px(c, w[1], x, 1); px(c, w[0], 0, H - 1, W, 1); }, sides: solid(w[2]), top: solid(w[3]) }));
    return { group: g };
  },
  store_cabinet: (P) => {
    const g = G();
    const w = P.dark;
    g.add(B(0.04, 0, 0.45, 1.92, 0.5, 0.52, { front: (c, W, H) => { woodFace(c, 0, 0, W, H, w[2], 2, 4); frameRect(c, 2, 2, (W / 2 - 3) | 0, H - 4, w[0]); frameRect(c, (W / 2 + 1) | 0, 2, (W / 2 - 3) | 0, H - 4, w[0]); px(c, P.gold[3], (W / 2 - 3) | 0, H / 2 | 0); px(c, P.gold[3], (W / 2 + 2) | 0, H / 2 | 0); }, sides: wood(w[1]), top: wood(w[3]) }));
    // Glass case on top with keepsakes.
    g.add(B(0.06, 0.5, 0.47, 1.88, 1.5, 0.08, { front: null, back: (c, W, H) => { px(c, mix(w[0], '#FFE6B0', 0.15), 0, 0, W, H); for (let y = 8; y < H; y += 8) px(c, w[3], 0, y, W, 1); } }, false));
    for (const x of [0.04, 1.86]) g.add(cbox(x, 0.5, 0.45, 0.1, 1.5, 0.52, w[1]));
    g.add(cbox(0.04, 2.0, 0.45, 1.92, 0.08, 0.52, w[2]), cbox(0.14, 1.0, 0.5, 1.72, 0.03, 0.44, '#E8F4FF'), cbox(0.14, 1.5, 0.5, 1.72, 0.03, 0.44, '#E8F4FF'));
    const keepsakes = spriteTexture(28, 22, (c) => {
      px(c, '#E8D8B0', 1, 4, 6, 4); px(c, '#C8572B', 2, 5, 4, 2); // ticket stub
      disc(c, '#D9A93A', 13, 5, 2); px(c, '#FFF2B0', 12, 4); // medal
      px(c, '#F2EEE4', 19, 2, 6, 6); px(c, '#E8506A', 21, 4, 2, 2); // photo
      px(c, '#7AB0C8', 3, 14, 3, 6); px(c, '#BFE3EC', 3, 14, 1, 6); // bottle
      px(c, '#A86A3D', 10, 16, 8, 4); px(c, '#F2E6C8', 11, 15, 6, 1); // box
      ellipse(c, '#F2C8D8', 22, 17, 2, 3); px(c, '#FFFFFF', 21, 15); // shell
      outline(c, 28, 22);
    });
    const k = billboard(keepsakes, 1.6, 1.25, { cast: false }); k.position.set(1, 0.56, 0.72); g.add(k);
    const front = panel(0.08, 0.52, 0.98, 1.84, 1.46, (c, W, H) => { px(c, 'rgba(0,0,0,0)', 0, 0, W, H); for (let i = 0; i < W + H; i += 12) for (let k2 = 0; k2 < 2; k2++) for (let y = 0; y < H; y++) { const x = i - k2 - y; if (x >= 0 && x < W) px(c, 'rgba(255,255,255,0.35)', x, y); } frameRect(c, 0, 0, W, H, w[1]); px(c, w[1], (W / 2) | 0, 0, 1, H); }, { alpha: false });
    (front.material as THREE.MeshLambertMaterial).transparent = true; (front.material as THREE.MeshLambertMaterial).alphaTest = 0; (front.material as THREE.MeshLambertMaterial).depthWrite = false;
    g.add(front);
    const glowStrip = bulbMesh(1, 1.95, 0.7, 0.04, '#FFE6B0');
    g.add(glowStrip);
    return { group: g, glow: [glowStrip] };
  },
};

// ---------- Decor ----------

const decor: Record<string, Builder> = {
  easel: (P) => {
    const g = G();
    const leg = (x: number, z: number, rx: number, rz: number) => { const l = cbox(x, 0, z, 0.06, 1.55, 0.06, P.wood[1]); l.rotation.x = rx; l.rotation.z = rz; return l; };
    g.add(leg(0.2, 0.62, 0.12, -0.12), leg(0.74, 0.62, 0.12, 0.12), leg(0.47, 0.3, -0.3, 0));
    g.add(cbox(0.15, 0.58, 0.66, 0.7, 0.05, 0.12, P.wood[2]));
    g.add(B(0.18, 0.64, 0.68, 0.64, 0.8, 0.04, {
      front: (c, w, h) => {
        px(c, '#FBF6EA', 0, 0, w, h); bevel(c, 0, 0, w, h, '#FFFFFF', '#D8CCB0');
        // A little doodle of two houses and a heart between them.
        px(c, '#5A8AC8', 1, h - 3, w - 2, 2);
        sprite(c, ['..o..', '.ooo.', 'ooooo', 'o.o.o', 'ooooo'], { o: '#3A3A4A' }, 1, h - 9);
        sprite(c, ['..o..', '.ooo.', 'ooooo', 'o.o.o', 'ooooo'], { o: '#3A3A4A' }, w - 6, h - 9);
        heart(c, '#E8506A', (w / 2 - 1) | 0, 4);
        line(c, '#B8B0A0', 3, h - 10, w - 4, h - 10);
      },
      sides: solid('#F2EEE4'),
    }));
    return { group: g };
  },
  desk: (P) => {
    const g = G();
    const w = P.wood;
    g.add(B(0.04, 0, 0.1, 0.62, 0.72, 0.84, { front: (c, W, H) => { woodFace(c, 0, 0, W, H, w[2], 7, 4); for (const y of [2, 6, 10]) { frameRect(c, 1, y, W - 2, 4, w[0]); px(c, P.gold[3], (W / 2) | 0, y + 2); } }, sides: wood(w[1]) }));
    g.add(B(1.66, 0, 0.1, 0.3, 0.72, 0.84, { sides: wood(w[1]), front: wood(w[2]) }));
    g.add(B(0, 0.72, 0.04, 2, 0.08, 0.92, { top: wood(w[3], { plank: 6 }), sides: solid(w[1]) }));
    g.add(B(0.9, 0.8, 0.3, 0.5, 0.04, 0.36, { top: (c, W, H) => { px(c, '#F6F0E2', 0, 0, W, H); for (let y = 1; y < H; y += 2) px(c, '#A8B8D8', 1, y, W - 2, 1); px(c, '#3A3A4A', 2, 2, 4, 1); px(c, '#3A3A4A', 2, 4, 6, 1); px(c, P.accent[2], (W / 2) | 0, 0, 1, H); }, sides: solid('#E8E0D0') }));
    const cup = spriteTexture(8, 12, (c) => { px(c, '#7A8A9A', 2, 4, 4, 8); for (let i = 0; i < 4; i++) px(c, ['#E8414A', '#3A5AC8', '#F7D046', '#3A3A3A'][i], 2 + i, 0, 1, 5); outline(c, 8, 12); });
    const cb = billboard(cup, 0.4, 0.6); cb.position.set(1.62, 0.8, 0.4); g.add(cb);
    return { group: g };
  },
  record_player: (P) => {
    const g = G();
    const w = P.dark;
    g.add(B(0.08, 0, 0.2, 0.84, 0.62, 0.62, { front: (c, W, H) => { woodFace(c, 0, 0, W, H, w[2], 4, 5); for (const x0 of [2, (W / 2 + 1) | 0]) { px(c, '#3A2A2A', x0, 2, (W / 2 - 3) | 0, H - 4); for (let y = 3; y < H - 2; y += 2) for (let x = x0 + 1; x < x0 + (W / 2 - 4); x += 2) px(c, '#5A4A4A', x, y); } }, sides: wood(w[1]) }));
    g.add(B(0.1, 0.62, 0.22, 0.8, 0.1, 0.58, { top: (c, W, H) => { px(c, w[3], 0, 0, W, H); disc(c, '#1A1A1E', 6, 5, 4); disc(c, '#2A2A30', 6, 5, 3); px(c, P.accent[2], 5, 4, 3, 3); px(c, '#F2EEE4', 6, 5); line(c, P.metal[3], 11, 1, 9, 6); px(c, P.metal[2], 11, 1, 2, 2); }, sides: solid(w[2]) }));
    return { group: g };
  },
  globe: (P) => {
    const g = G();
    g.add(B(0.3, 0, 0.3, 0.4, 0.08, 0.4, { top: wood(P.wood[2]), sides: solid(P.wood[1]) }));
    g.add(cbox(0.47, 0.08, 0.47, 0.06, 0.45, 0.06, P.wood[1]));
    const map = spriteTexture(64, 32, (c) => {
      px(c, '#4A8AC8', 0, 0, 64, 32);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
        const n = Math.sin(x * 0.2) + Math.sin(y * 0.33 + x * 0.05) * 1.2 + Math.cos(x * 0.09 + y * 0.12);
        if (n > 1.0) px(c, n > 1.7 ? '#C8B060' : '#6EA850', x, y);
      }
      px(c, '#F2F2F2', 0, 0, 64, 2); px(c, '#F2F2F2', 0, 30, 64, 2);
      px(c, '#E8414A', 20, 12); px(c, '#E8414A', 46, 18);
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshLambertMaterial({ map }));
    ball.position.set(0.5, 0.84, 0.5); ball.rotation.z = 0.4; ball.castShadow = true; g.add(ball);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.02, 4, 18, Math.PI * 1.3), flat(P.gold[2]));
    ring.position.set(0.5, 0.84, 0.5); ring.rotation.set(0, Math.PI / 2, 0.4 - Math.PI / 2); g.add(ring);
    return { group: g, tick: (t) => { ball.rotation.y = t * 0.25; } };
  },
  aquarium: (P) => {
    const g = G();
    const w = P.dark;
    g.add(B(0.04, 0, 0.2, 1.92, 0.7, 0.66, { front: (c, W, H) => { woodFace(c, 0, 0, W, H, w[2], 6, 4); frameRect(c, 2, 2, (W / 2 - 3) | 0, H - 4, w[0]); frameRect(c, (W / 2 + 1) | 0, 2, (W / 2 - 3) | 0, H - 4, w[0]); }, sides: wood(w[1]), top: solid(w[3]) }));
    const tankMat = new THREE.MeshLambertMaterial({ color: '#7AC8E8', transparent: true, opacity: 0.35, emissive: '#2A6A8A', emissiveIntensity: 0.4, depthWrite: false });
    const tank = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.82, 0.58), tankMat);
    tank.position.set(1, 0.7 + 0.41, 0.53); g.add(tank);
    g.add(cbox(0.06, 0.7, 0.22, 1.88, 0.06, 0.62, '#D8C890'));
    g.add(cbox(0.06, 1.5, 0.22, 1.88, 0.04, 0.62, '#3A3A3A'));
    const inside = spriteTexture(30, 13, (c) => {
      px(c, '#3A7AA8', 0, 0, 30, 13);
      for (let y = 0; y < 13; y += 3) px(c, '#4A8AB8', 0, y, 30, 1);
      px(c, '#D8C890', 0, 11, 30, 2);
      sprite(c, ['.o.o.', '.ooo.', 'oo.oo', 'ooooo', 'ooooo'], { o: '#9A9AAA' }, 20, 6);
      for (const x of [3, 6, 26]) { px(c, '#3E8A4A', x, 5, 1, 6); px(c, '#5EAA5A', x + 1, 7, 1, 4); }
    });
    const back = panel(0.1, 0.76, 0.28, 1.8, 0.72, (c, W, H) => { c.imageSmoothingEnabled = false; c.drawImage(inside.image as HTMLCanvasElement, 0, 0, W, H); }, { emissive: true });
    g.add(back);
    const fishColors = ['#F2843A', '#F2D046', '#E8506A'];
    const fish = fishColors.map((col, i) => {
      const t = spriteTexture(6, 4, (c) => { px(c, col, 1, 1, 4, 2); px(c, col, 0, 0); px(c, col, 0, 3); px(c, shade(col, 0.2), 2, 1); px(c, '#1A1A1A', 4, 1); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.15), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
      m.position.set(0.5 + i * 0.5, 1.0 + i * 0.12, 0.6);
      g.add(m);
      return m;
    });
    return {
      group: g,
      glow: [back],
      tick: (t) => fish.forEach((f, i) => {
        const p = (t * (0.15 + i * 0.05) + i * 0.33) % 2;
        const dir = p < 1 ? 1 : -1;
        f.position.x = 0.25 + (p < 1 ? p : 2 - p) * 1.5;
        f.position.y = 1.0 + i * 0.13 + Math.sin(t * 2 + i) * 0.03;
        f.scale.x = dir;
      }),
    };
  },
  clothes_rack: (P) => {
    const g = G();
    const m = P.metal;
    // Two feet, two posts and a rail, with a few things hanging on it.
    for (const x of [0.12, 0.82]) {
      g.add(cbox(x - 0.04, 0, 0.3, 0.14, 0.04, 0.4, m[0]));
      g.add(cbox(x, 0.04, 0.48, 0.05, 1.5, 0.05, m[1]));
    }
    g.add(cbox(0.12, 1.5, 0.48, 0.75, 0.05, 0.05, m[2]));
    const clothes = [['#E8A0A8', 0], ['#F2EEE4', 1], ['#7A9AC8', 0], ['#C9603E', 2], ['#9DB38A', 1]] as const;
    g.add(panel(0.15, 0.62, 0.5, 0.7, 0.9, (c, W, H) => {
      const w = 4, gap = (W - clothes.length * w) / (clothes.length - 1);
      clothes.forEach(([col, kind], i) => {
        const r = ramp(col), x = Math.round(i * (w + gap));
        px(c, m[0], x + 1, 0, 2, 1); px(c, m[0], x + 2, 1); // hanger hook
        px(c, r[1], x, 2, w, 1);
        const len = kind === 1 ? H - 3 : kind === 2 ? H - 6 : H - 7;
        px(c, r[2], x, 3, w, len); px(c, r[3], x, 3, 1, len); px(c, r[0], x + w - 1, 3, 1, len);
        if (kind === 1) for (let y = 6; y < H - 1; y += 3) px(c, r[1], x + 1, y, 2, 1);
        else px(c, r[1], x, 2 + len, w, 1);
      });
    }, { alpha: true, cast: true }));
    return { group: g };
  },
  mirror: (P) => {
    const g = G();
    g.add(B(0.18, 0, 0.42, 0.64, 1.7, 0.1, {
      front: (c, w, h) => {
        px(c, P.wood[1], 0, 0, w, h);
        const [s0, s1, s2] = ['#BFD8E0', '#DCEBF0', '#F4FAFC'];
        px(c, s0, 2, 2, w - 4, h - 4);
        for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) { const d = (x - y * 0.4) % 14; if (d > 2 && d < 5) px(c, s2, x, y); else if (d >= 5 && d < 6) px(c, s1, x, y); }
        bevel(c, 0, 0, w, h, P.wood[3], P.wood[0]); px(c, P.gold[3], (w / 2) | 0, 0, 1, 1);
      },
      sides: solid(P.wood[1]),
    }));
    g.add(cbox(0.2, 0, 0.3, 0.06, 0.06, 0.4, P.wood[0]), cbox(0.74, 0, 0.3, 0.06, 0.06, 0.4, P.wood[0]));
    return { group: g };
  },
  candles: (P) => {
    const g = G();
    g.add(B(0.2, 0, 0.25, 0.6, 0.05, 0.5, { top: metal(P.T.metal), sides: solid(P.metal[1]) }));
    const flames: THREE.Mesh[] = [];
    [[0.32, 0.4, 0.35], [0.5, 0.26, 0.55], [0.68, 0.34, 0.38]].forEach(([x, h, z]) => {
      g.add(B(x - 0.06, 0.05, z - 0.06, 0.12, h, 0.12, { sides: (c, w, hh) => { px(c, '#F6EEDC', 0, 0, w, hh); px(c, '#FFFFFF', 0, 0, 1, hh); px(c, '#E2D6BE', w - 1, 0, 1, hh); px(c, '#F6EEDC', 0, 0, w, 2); }, top: solid('#FFF8E8') }));
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.14), new THREE.MeshBasicMaterial({ map: spriteTexture(3, 5, (c) => { px(c, '#FFF2B0', 1, 0); px(c, '#FFD060', 0, 1, 3, 2); px(c, '#FF9A3A', 1, 3); px(c, '#FFFFFF', 1, 2); px(c, '#3A2A1A', 1, 4); }), transparent: true, alphaTest: 0.4, toneMapped: false }));
      f.position.set(x, 0.05 + h + 0.07, z); f.rotation.y = 0.6; g.add(f); flames.push(f);
    });
    return { group: g, glow: flames, light: { pos: new THREE.Vector3(0.5, 0.6, 0.45), color: '#FFB060' }, tick: (t) => flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(t * 12 + i * 2) * 0.12; f.scale.x = 1 + Math.sin(t * 9 + i) * 0.08; }) };
  },
  plush_bear: () => plush(['....oo....oo....', '...oBBo..oBBo...', '...oBpBooBpBo...', '....oBBBBBBo....', '...oBBBBBBBBo...', '..oBBeBBBBeBBo..', '..oBBBBnnBBBBo..', '..oBBBBnnBBBBo..', '...oBBBmmBBBo...', '....ooBBBBoo....', '...oBBbbbbBBo...', '..oBBbbbbbbBBo..', '..oBBbbbbbbBBo..', '..oBBBbbbbBBBo..', '...oBBoooBBBo...', '...ooo...ooo....'], { B: '#B07A4E', b: '#D8B08A', p: '#E8A8A0', e: '#2A1A1A', n: '#5A3A2A', m: '#D8B08A', o: '' }),
  plush_bunny: () => plush(['....o......o....', '...oWo....oWo...', '...oWpo..opWo...', '...oWpo..opWo...', '...oWWo..oWWo...', '....oWWooWWo....', '...oWWWWWWWWo...', '..oWWeWWWWeWWo..', '..oWpWWnnWWpWo..', '..oWWWWWWWWWWo..', '...oWWWWWWWWo...', '...oWWbbbbWWo...', '..oWWbbbbbbWWo..', '..oWWWbbbbWWWo..', '...oWWoooWWWo...', '...ooo...ooo....'], { W: '#F2EEF0', b: '#FFFFFF', p: '#F2A7C3', e: '#2A1A1A', n: '#E8848A', o: '' }),
  book_stack: (P) => {
    const g = G();
    const cols = P.T.books;
    [[0.2, 0.0, 0.62, 0.42, 0.1], [0.24, 0.1, 0.56, 0.4, 0.09], [0.18, 0.19, 0.6, 0.44, 0.11], [0.26, 0.3, 0.5, 0.36, 0.08]].forEach(([x, y, w, d, h], i) => {
      const c = cols[(i * 3) % cols.length];
      g.add(B(x, y, 0.3 + i * 0.01, w, h, d, { top: solid(c), front: (cx, W, H) => { px(cx, '#F2E6C8', 0, 0, W, H); for (let yy = 0; yy < H; yy += 1) px(cx, '#E2D6B8', 0, yy, W, 0.5); px(cx, c, 0, 0, W, 1); px(cx, c, 0, H - 1, W, 1); }, right: (cx, W, H) => { px(cx, c, 0, 0, W, H); px(cx, shade(c, 0.2), 1, 0, 1, H); }, left: solid(c), back: solid(c) }));
    });
    return { group: g };
  },
  window_seat: (P) => {
    const g = G();
    g.add(B(0.04, 0, 0.1, 1.92, 0.3, 0.8, { sides: wood(P.wood[2]), top: solid(P.wood[3]) }));
    g.add(B(0.08, 0.3, 0.12, 1.84, 0.12, 0.76, { top: (c, w, h) => { fabricFace(c, 0, 0, w, h, P.cushion[2], 'stripe', 2, P.cushion[3]); bevel(c, 0, 0, w, h, P.cushion[4], P.cushion[0]); }, sides: fabric(P.cushion[1]) }));
    g.add(B(0.2, 0.42, 0.14, 0.5, 0.34, 0.14, { front: fabric(P.accent[2], 'knit'), sides: solid(P.accent[1]), top: solid(P.accent[3]) }));
    return { group: g };
  },
};

function plush(rows: string[], pal: Record<string, string>): ItemArt {
  const tex = spriteTexture(16, 16, (c) => { sprite(c, rows, pal); outline(c, 16, 16); });
  const b = billboard(tex, 0.75, 0.75);
  b.position.set(0.5, 0, 0.5);
  return { group: G(b) };
}

// ---------- Plants (three growth stages) ----------

export function plantStage(data?: Record<string, unknown> | null): 1 | 2 | 3 {
  const water = Number(data?.water ?? 0);
  return water >= 5 ? 3 : water >= 2 ? 2 : 1;
}

function potSprite(P: Pal, c: CanvasRenderingContext2D, w: number, h: number, potW: number, potH: number) {
  const x0 = ((w - potW) / 2) | 0, y0 = h - potH;
  px(c, P.pot[2], x0, y0, potW, potH);
  px(c, P.pot[3], x0, y0, 1, potH); px(c, P.pot[1], x0 + potW - 2, y0, 2, potH);
  px(c, P.pot[4], x0 - 1, y0, potW + 2, 2); px(c, P.pot[1], x0 - 1, y0 + 1, potW + 2, 1);
  px(c, mix(P.pot[0], '#3A2A1A', 0.5), x0, y0 - 1, potW, 1);
}

/** A split monstera leaf at (cx, cy) pointing along `ang`, lit from the top left. */
function leaf(c: CanvasRenderingContext2D, L: string[], cx: number, cy: number, r: number, ang: number, back: boolean) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
    const u = x * ca + y * sa, v = -x * sa + y * ca;
    const d = (u / r) ** 2 + (v / (r * 0.86)) ** 2;
    if (d > 1) continue;
    if (u < -r * 0.55 && Math.abs(v) < r * 0.22) continue; // heart notch at the stem
    const phi = Math.atan2(v, u);
    if (d > 0.3 && ((phi * 2.6 + 10) % 1) < 0.16) continue; // the splits
    const lit = -x * 0.6 - y * 0.8 > r * 0.25;
    let col = back ? (lit ? L[2] : L[1]) : lit ? L[3] : L[2];
    if (d > 0.72) col = back ? L[0] : L[1];
    if (Math.abs(v) < 0.6 && u > -r * 0.5) col = back ? L[2] : L[4];
    px(c, col, cx + x, cy + y);
  }
}

const plants: Record<string, Builder> = {
  plant_sprout: (P, data) => {
    const s = plantStage(data);
    const tex = spriteTexture(16, 20, (c) => {
      const L = P.plant;
      if (s === 1) { line(c, L[1], 8, 15, 8, 11); px(c, L[3], 6, 10, 2, 2); px(c, L[2], 9, 9, 3, 2); px(c, L[4], 6, 10); }
      else if (s === 2) { line(c, L[1], 8, 15, 8, 7); for (const [x, y] of [[5, 8], [9, 6], [5, 12], [10, 10]]) { px(c, L[2], x, y, 3, 2); px(c, L[3], x, y); } }
      else { ellipse(c, L[2], 8, 9, 6, 6); for (let i = 0; i < 14; i++) px(c, i % 2 ? L[3] : L[1], 3 + ((i * 5) % 11), 4 + ((i * 7) % 10)); for (const [x, y] of [[5, 5], [11, 7], [7, 11], [10, 3]]) { px(c, P.T.accent, x, y, 2, 2); px(c, '#FFFFFF', x, y); } }
      potSprite(P, c, 16, 20, 8, 5);
      outline(c, 16, 20);
    });
    const b = billboard(tex, 1, 1.25); b.position.set(0.5, 0, 0.5);
    return { group: G(b) };
  },
  plant_monstera: (P, data) => {
    const s = plantStage(data);
    const H = s === 1 ? 20 : s === 2 ? 26 : 32;
    const tex = spriteTexture(26, H, (c) => {
      const L = P.plant;
      const base = { x: 13, y: H - 7 };
      // [x, y, radius, angle, back?] — back leaves first so the front ones overlap them.
      const leaves: [number, number, number, number, boolean][] = s === 1
        ? [[13, 8, 4, -1.6, false], [9, 11, 3, -2.4, true]]
        : s === 2
          ? [[8, 10, 5, -2.5, true], [18, 9, 5, -0.7, true], [13, 6, 5, -1.5, false]]
          : [[5, 14, 5, -2.8, true], [21, 13, 5, -0.4, true], [8, 7, 6, -2.2, false], [19, 6, 6, -0.9, false], [13, 12, 5, -1.6, false]];
      for (const [x, y] of leaves) line(c, L[1], base.x, base.y, x, y + 2);
      for (const [x, y, r, ang, back] of leaves) leaf(c, L, x, y, r, ang, back);
      potSprite(P, c, 26, H, 10, 6);
      outline(c, 26, H);
    });
    const b = billboard(tex, 26 / 16, H / 16); b.position.set(0.5, 0, 0.5);
    return { group: G(b) };
  },
  plant_cactus: (P, data) => {
    const s = plantStage(data);
    const tex = spriteTexture(12, 20, (c) => {
      const L = ramp('#5E9A5A');
      const top = s === 1 ? 10 : s === 2 ? 6 : 4;
      px(c, L[2], 4, top, 4, 15 - top); px(c, L[3], 5, top, 1, 15 - top); px(c, L[1], 7, top, 1, 15 - top);
      for (let y = top + 1; y < 15; y += 2) { px(c, '#F2EED8', 4, y); px(c, '#F2EED8', 7, y + 1); }
      if (s >= 2) { px(c, L[2], 1, 9, 3, 2); px(c, L[2], 1, 6, 2, 3); px(c, L[3], 1, 6, 1, 3); }
      if (s >= 2) { px(c, L[2], 8, 11, 3, 2); px(c, L[2], 9, 8, 2, 3); }
      if (s === 3) { px(c, '#F2A7C3', 4, top - 2, 4, 2); px(c, '#E8506A', 5, top - 1, 2, 1); px(c, '#FFFFFF', 5, top - 2); }
      potSprite(P, c, 12, 20, 6, 5);
      outline(c, 12, 20);
    });
    const b = billboard(tex, 0.75, 1.25); b.position.set(0.5, 0, 0.5);
    return { group: G(b) };
  },
  plant_fern: (P, data) => {
    const s = plantStage(data);
    const g = G();
    // A slim wooden plant stand: square top on four legs with a low shelf.
    const top = 0.78;
    g.add(B(0.22, top - 0.06, 0.22, 0.56, 0.06, 0.56, { top: wood(P.wood[3]), sides: solid(P.wood[1]) }));
    g.add(B(0.28, 0.22, 0.28, 0.44, 0.04, 0.44, { top: wood(P.wood[2]), sides: solid(P.wood[0]) }));
    for (const [x, z] of [[0.24, 0.24], [0.7, 0.24], [0.24, 0.7], [0.7, 0.7]]) g.add(cbox(x, 0, z, 0.06, top - 0.06, 0.06, P.wood[1]));
    const W = 26, Hs = 24, potTop = 5, potH = 5;
    const tex = spriteTexture(W, Hs, (c) => {
      const L = P.plant;
      const len = s === 1 ? 6 : s === 2 ? 10 : 15;
      // Fronds spill out of the pot and arc down over the stand.
      const fronds: [number, number][] = [[-1, 0.9], [1, 0.9], [-1, 0.55], [1, 0.55], [-1, 0.25], [1, 0.25], [-1, 1.25], [1, 1.25]];
      fronds.forEach(([dir, lift], i) => {
        const n = len - (i >> 1) - (i > 5 ? 3 : 0);
        let x = W / 2 + dir * 2, y = potTop + 1;
        let vx = dir * (0.9 - lift * 0.25), vy = -lift;
        for (let k = 0; k < n; k++) {
          x += vx; y += vy; vy += 0.32;
          const X = Math.round(x), Y = Math.round(y);
          px(c, L[1], X, Y);
          if (k > 0 && k % 2 === 0 && k < n - 1) { px(c, L[3], X, Y - 1); px(c, L[2], X + dir, Y + 1); px(c, L[2], X - dir, Y); }
          else px(c, L[2], X + dir, Y);
        }
        px(c, L[3], Math.round(x), Math.round(y) + 1);
      });
      // A tuft on top of the soil.
      for (let k = -3; k <= 3; k++) { px(c, L[2], W / 2 + k, potTop - 1 - (3 - Math.abs(k)) / 2); px(c, L[3], W / 2 + k, potTop - 2 - (3 - Math.abs(k)) / 2); }
      potSprite(P, c, W, potTop + potH, 9, potH);
      outline(c, W, Hs);
    });
    // Bottom of the pot sits on the stand's top.
    const b = billboard(tex, W / 16, Hs / 16); b.position.set(0.5, top - (Hs - potTop - potH) / 16, 0.5); g.add(b);
    return { group: g };
  },
};

// ---------- Rugs ----------

const rugs: Record<string, Builder> = {
  rug_round: (P) => {
    const c = ramp(P.T.key === 'matcha' ? '#C8B890' : P.T.cushion);
    return { group: G(decal(0, 0.012, 0, 2, 2, (g, w, h) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - w / 2 + 0.5, y - h / 2 + 0.5) / (w / 2);
        if (d > 0.98) continue;
        const ring = Math.floor(d * 7);
        const col = [c[3], c[2], P.accent[2], c[2], c[1], c[3], c[0]][ring];
        px(g, ((x + y + ring) % 3 === 0) ? shade(col, -0.05) : col, x, y);
      }
    })) };
  },
  rug_diamond: (P) => {
    const [a, b2, cc] = [ramp(P.T.cushion), ramp(mix(P.T.cushion, '#000000', 0.25)), ramp(P.T.accent)];
    return { group: G(decal(0, 0.012, 0, 3, 2, (g, w, h) => {
      px(g, b2[2], 0, 0, w, h); px(g, a[2], 3, 3, w - 6, h - 6);
      for (let x = 5; x < w - 5; x += 2) { px(g, cc[2], x, 5); px(g, cc[2], x, h - 6); }
      for (let y = 5; y < h - 5; y += 2) { px(g, cc[2], 5, y); px(g, cc[2], w - 6, y); }
      const cx = w / 2, cy = h / 2;
      for (let dy = -9; dy <= 9; dy++) { const ww = 9 - Math.abs(dy); px(g, cc[2], Math.round(cx - ww * 1.4), Math.round(cy + dy)); px(g, cc[2], Math.round(cx + ww * 1.4), Math.round(cy + dy)); }
      for (let dy = -4; dy <= 4; dy++) { const ww = 4 - Math.abs(dy); px(g, b2[2], Math.round(cx - ww * 1.4), Math.round(cy + dy), Math.round(ww * 2.8) + 1, 1); }
      for (let y = 1; y < h; y += 2) { px(g, '#F2EEE4', 0, y); px(g, '#F2EEE4', w - 1, y); }
      for (let i = 0; i < 60; i++) px(g, a[1], (Math.sin(i * 12.9) * 0.5 + 0.5) * w | 0, (Math.cos(i * 7.3) * 0.5 + 0.5) * h | 0);
    })) };
  },
  rug_runner: (P) => {
    const c = [P.T.cushion, P.T.accent, P.T.sheet, P.T.curtain];
    return { group: G(decal(0, 0.012, 0.1, 3, 0.8, (g, w, h) => {
      for (let y = 0; y < h; y++) px(g, ramp(c[Math.floor(y / 3) % c.length])[2], 0, y, w, 1);
      for (let x = 0; x < w; x += 2) { px(g, '#F2EEE4', x, 0); px(g, '#F2EEE4', x, h - 1); }
      for (let x = 0; x < w; x += 3) px(g, shade(c[0], -0.1), x, (h / 2) | 0);
    })) };
  },
};

// ---------- Faith ----------

const faith: Record<string, Builder> = {
  bible_stand: (P) => {
    const g = G();
    g.add(B(0.3, 0, 0.35, 0.4, 0.06, 0.3, { top: wood(P.wood[2]), sides: solid(P.wood[1]) }));
    g.add(B(0.44, 0.06, 0.44, 0.12, 0.78, 0.12, { sides: wood(P.wood[1], { vertical: true }) }));
    const top = B(0.18, 0.8, 0.3, 0.64, 0.06, 0.5, { top: wood(P.wood[2]), sides: solid(P.wood[1]) });
    top.rotation.x = 0.35; g.add(top);
    const book = decal(0, 0, 0, 0.6, 0.44, (c, w, h) => {
      px(c, '#2A2026', 0, 0, w, h);
      px(c, '#F6F0E0', 1, 1, w / 2 - 1, h - 2); px(c, '#EFE6D0', w / 2, 1, w / 2 - 1, h - 2);
      for (let y = 2; y < h - 2; y += 1) { px(c, '#B8AE98', 2, y, w / 2 - 4, 0.5); if (y % 2) { px(c, '#9A9080', 2, y, w / 2 - 4, 1); px(c, '#9A9080', w / 2 + 1, y, w / 2 - 4, 1); } }
      px(c, '#C83A3A', w / 2 - 1, 0, 1, h + 0); px(c, '#C83A3A', w / 2, h - 1, 1, 1);
      px(c, '#D9A93A', 2, 2, 2, 1);
    });
    book.position.set(0.5, 0.9, 0.55); book.rotation.x = -Math.PI / 2 + 0.35; g.add(book);
    return { group: g };
  },
};

export const BUILDERS: Record<string, Builder> = { ...beds, ...tables, ...seating, ...lighting, ...storage, ...decor, ...plants, ...rugs, ...faith };

export function buildFloorItem(key: string, T: Theme, data?: Record<string, unknown> | null): ItemArt {
  const b = BUILDERS[key];
  const P = palette(T);
  if (!b) return { group: G(cbox(0.1, 0, 0.1, 0.8, 0.5, 0.8, '#C8A0A0')) };
  return b(P, data);
}

// Re-exported for the wall-item module.
export { glass, star, mirrored };
