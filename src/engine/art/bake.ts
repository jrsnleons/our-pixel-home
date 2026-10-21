// Baking: a sofa is built from a dozen painted boxes with six little textures each, which is
// lovely to author and slow to draw (one draw call and one texture upload per face). Baking
// packs every face's pixels into one atlas and merges the boxes into a mesh or two, so a whole
// piece draws in one to three calls. Built pieces are kept per theme and handed out as cheap
// clones, so placing, moving or browsing never paints the same sofa twice.

import * as THREE from 'three';
import { ITEM_BY_KEY } from '../../data/catalog';
import type { Theme } from '../../data/themes';
import { buildFloorItem, plantStage, type ItemArt } from './furniture';
import { canvas, texture } from './pixel';
import { buildWallItem, type WallArt } from './wall';

type Img = HTMLCanvasElement | HTMLImageElement | ImageBitmap;

interface Part { mesh: THREE.Mesh; geo: THREE.BufferGeometry; start: number; count: number; mat: THREE.MeshLambertMaterial }

/** Atlas pixels kept free around each face, filled with its edge, so nearest sampling never bleeds. */
const PAD = 1;
const MAX_ATLAS = 2048;

function bakeable(m: THREE.Mesh, keep: Set<THREE.Object3D>): boolean {
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || keep.has(m) || m.userData.billboard) return false;
  const g = m.geometry;
  if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv || g.morphAttributes.position) return false;
  for (let o: THREE.Object3D | null = m; o; o = o.parent) if (!o.visible || o.userData.live) return false;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  return mats.every((x) => {
    if (!(x instanceof THREE.MeshLambertMaterial)) return false;
    if (x.transparent && x.opacity > 0) return false;
    if (x.vertexColors || x.emissiveMap || x.emissive.getHex() !== 0 && x.emissiveIntensity > 0) return false;
    const t = x.map;
    if (!t) return true;
    const img = t.image as Img | undefined;
    return !!img && img.width > 0 && t.repeat.x === 1 && t.repeat.y === 1 && t.offset.x === 0 && t.offset.y === 0 && t.rotation === 0;
  });
}

/** Lay rectangles out in rows, tallest first, PAD apart. Returns the atlas size and spots, or null if it won't fit. */
export function pack(sizes: { w: number; h: number }[]): { W: number; H: number; at: { x: number; y: number }[] } | null {
  const area = sizes.reduce((a, s) => a + (s.w + PAD * 2) * (s.h + PAD * 2), 0);
  const widest = Math.max(...sizes.map((s) => s.w + PAD * 2));
  let W = 64;
  while (W < Math.sqrt(area) * 1.15 || W < widest) W *= 2;
  if (W > MAX_ATLAS) return null;
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b].h - sizes[a].h);
  const at: { x: number; y: number }[] = [];
  let x = 0, y = 0, row = 0;
  for (const i of order) {
    const w = sizes[i].w + PAD * 2, h = sizes[i].h + PAD * 2;
    if (x + w > W) { x = 0; y += row; row = 0; }
    at[i] = { x, y };
    x += w; row = Math.max(row, h);
  }
  const H = y + row;
  return H > MAX_ATLAS ? null : { W, H, at };
}

/** Draw `img` at (x, y) with its outermost pixels repeated PAD pixels outward. */
function blit(g: CanvasRenderingContext2D, img: Img, x: number, y: number) {
  const w = img.width, h = img.height;
  g.drawImage(img, x + PAD, y + PAD);
  for (let p = 0; p < PAD; p++) {
    g.drawImage(img, 0, 0, w, 1, x + PAD, y + p, w, 1);
    g.drawImage(img, 0, h - 1, w, 1, x + PAD, y + PAD + h + p, w, 1);
    g.drawImage(img, 0, 0, 1, h, x + p, y + PAD, 1, h);
    g.drawImage(img, w - 1, 0, 1, h, x + PAD + w + p, y + PAD, 1, h);
  }
  // Corners.
  for (const [sx, sy, dx, dy] of [[0, 0, 0, 0], [w - 1, 0, PAD + w, 0], [0, h - 1, 0, PAD + h], [w - 1, h - 1, PAD + w, PAD + h]]) {
    g.drawImage(img, sx, sy, 1, 1, x + dx, y + dy, PAD, PAD);
  }
}

/**
 * Merge every plain painted or flat-colored mesh under `root` into atlas-textured meshes (one
 * per shadow and alpha setting). Meshes in `keep`, billboards and anything marked
 * `userData.live` (repainted or animated later) are left alone. Positions end up in root space.
 */
export function bake(root: THREE.Object3D, keep: Set<THREE.Object3D> = new Set()) {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && bakeable(m, keep)) meshes.push(m); });
  if (meshes.length < 2) return;

  // Every face that will be drawn, and the pictures they use.
  const parts: Part[] = [];
  const images = new Map<Img, number>();
  const sizes: { w: number; h: number }[] = [];
  const addImage = (img: Img) => { if (!images.has(img)) { images.set(img, sizes.length); sizes.push({ w: img.width, h: img.height }); } };
  const WHITE = canvas(1, 1)[0];
  WHITE.getContext('2d')!.fillStyle = '#FFFFFF';
  WHITE.getContext('2d')!.fillRect(0, 0, 1, 1);
  addImage(WHITE);
  for (const m of meshes) {
    const geo = m.geometry;
    const total = geo.index ? geo.index.count : geo.attributes.position.count;
    // A single material draws the whole geometry, whatever groups it has (a cube has six).
    const groups = geo.groups.length && Array.isArray(m.material) ? geo.groups : [{ start: 0, count: total, materialIndex: 0 }];
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const gr of groups) {
      const mat = mats[gr.materialIndex ?? 0] as THREE.MeshLambertMaterial | undefined;
      // Faces left fully see-through (a frame's open front) are simply not drawn.
      if (!mat || (mat.transparent && mat.opacity === 0) || !mat.visible) continue;
      if (mat.map) addImage(mat.map.image as Img);
      parts.push({ mesh: m, geo, start: gr.start, count: Math.min(gr.count, total - gr.start), mat });
    }
  }
  const layout = pack(sizes);
  if (!layout) return;
  const { W, H, at } = layout;
  const [ac, ag] = canvas(W, H);
  for (const [img, i] of images) blit(ag, img, at[i].x, at[i].y);
  const atlas = texture(ac);

  // Sort the faces into buckets that need their own material or shadow settings.
  interface Bucket { alpha: boolean; side: THREE.Side; cast: boolean; receive: boolean; pos: number[]; nor: number[]; uv: number[]; col: number[] }
  const buckets = new Map<string, Bucket>();
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const color = new THREE.Color();
  for (const p of parts) {
    const alpha = p.mat.alphaTest > 0;
    const k = `${alpha ? 1 : 0}|${p.mat.side}|${p.mesh.castShadow ? 1 : 0}|${p.mesh.receiveShadow ? 1 : 0}`;
    let b = buckets.get(k);
    if (!b) { b = { alpha, side: p.mat.side, cast: p.mesh.castShadow, receive: p.mesh.receiveShadow, pos: [], nor: [], uv: [], col: [] }; buckets.set(k, b); }
    rel.multiplyMatrices(inv, p.mesh.matrixWorld);
    nm.getNormalMatrix(rel);
    const flip = rel.determinant() < 0;
    const P = p.geo.attributes.position, N = p.geo.attributes.normal, U = p.geo.attributes.uv;
    const idx = p.geo.index;
    const img = (p.mat.map?.image as Img | undefined) ?? WHITE;
    const r = at[images.get(img)!];
    const flipY = p.mat.map ? p.mat.map.flipY : true;
    const iw = img.width, ih = img.height;
    color.copy(p.mat.color);
    for (let t = 0; t < p.count; t += 3) {
      const tri = [t, t + 1, t + 2];
      if (flip) tri.reverse();
      for (const j of tri) {
        const vi = idx ? idx.getX(p.start + j) : p.start + j;
        v.fromBufferAttribute(P, vi).applyMatrix4(rel);
        b.pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, vi).applyMatrix3(nm).normalize();
        b.nor.push(v.x, v.y, v.z);
        let u = U.getX(vi), w = U.getY(vi);
        if (!p.mat.map) { u = 0.5; w = 0.5; }
        u = Math.min(1, Math.max(0, u)); w = Math.min(1, Math.max(0, w));
        const row = flipY ? (1 - w) * ih : w * ih;
        b.uv.push((r.x + PAD + u * iw) / W, 1 - (r.y + PAD + row) / H);
        b.col.push(color.r, color.g, color.b);
      }
    }
  }

  // Out with the boxes (keeping any texture a kept mesh still uses), in with the merged meshes.
  const inUse = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || meshes.includes(m)) return;
    for (const mm of Array.isArray(m.material) ? m.material : [m.material]) for (const t of [(mm as THREE.MeshLambertMaterial).map, (mm as THREE.MeshLambertMaterial).emissiveMap]) if (t) inUse.add(t);
  });
  for (const m of meshes) {
    m.removeFromParent();
    m.geometry.dispose();
    for (const mm of Array.isArray(m.material) ? m.material : [m.material]) {
      if (mm.userData.shared) continue;
      const map = (mm as THREE.MeshLambertMaterial).map;
      if (map && !inUse.has(map)) map.dispose();
      mm.dispose();
    }
  }
  for (const b of buckets.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    geo.computeBoundingSphere();
    const mat = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: b.alpha ? 0.5 : 0, side: b.side });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.userData.baked = true;
    root.add(mesh);
  }
}

// ---------- Shared, ready-built furniture ----------

type Art = ItemArt & WallArt;
const built = new Map<string, Art>();

/** What a piece's look depends on: the theme, the item, and for plants how grown they are. */
export function artKey(item: string, theme: string, data?: Record<string, unknown> | null): string {
  return `${theme}|${item}${item.startsWith('plant_') ? `|${plantStage(data)}` : ''}`;
}

function share(art: Art) {
  art.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.userData.shared = true;
    for (const mm of Array.isArray(m.material) ? m.material : [m.material]) {
      for (const t of [(mm as THREE.MeshLambertMaterial).map, (mm as THREE.MeshLambertMaterial).emissiveMap]) if (t) t.userData.shared = true;
    }
  });
}

/** A material of this piece's very own (a clone keeps the original's "shared" mark otherwise). */
function own(m: THREE.Material) { const c = m.clone(); c.userData = {}; return c; }

/** A copy of a built piece with its own materials (so one can fade or glow alone), sharing geometry and pixels. */
function copyOf(src: Art): Art {
  const from: THREE.Object3D[] = [];
  src.group.traverse((o) => from.push(o));
  const group = src.group.clone(true);
  const to: THREE.Object3D[] = [];
  group.traverse((o) => to.push(o));
  const twin = new Map(from.map((o, i) => [o, to[i]]));
  for (const o of to) {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(own) : own(m.material);
  }
  return { ...src, group, glow: src.glow?.map((g) => twin.get(g) as THREE.Mesh) };
}

/**
 * The art for a piece of furniture or wall decor, baked and ready. Pieces that animate or
 * repaint themselves (clocks, photo frames, fish) are built fresh each time, since those parts
 * can't be shared; everything else comes from the cache.
 */
export function itemArt(item: string, T: Theme, data?: Record<string, unknown> | null): Art {
  const k = artKey(item, T.key, data);
  const hit = built.get(k);
  if (hit) return copyOf(hit);
  const wall = ITEM_BY_KEY[item]?.kind === 'wall-item';
  const art = (wall ? buildWallItem(item, T) : buildFloorItem(item, T, data)) as Art;
  if (!art.tick) bake(art.group, new Set(art.glow ?? []));
  if (art.tick || art.refresh) {
    // Its own copy of any shared color, so fading this piece never fades another.
    art.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.material) m.material = Array.isArray(m.material) ? m.material.map((x) => x.userData.shared ? own(x) : x) : m.material.userData.shared ? own(m.material) : m.material;
    });
    return art;
  }
  share(art);
  built.set(k, art);
  return copyOf(art);
}

/** Let go of pieces built for other themes (call once nothing shows them any more). */
export function keepTheme(theme: string) {
  for (const [k, art] of [...built]) {
    if (k.startsWith(`${theme}|`)) continue;
    built.delete(k);
    art.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mm of Array.isArray(m.material) ? m.material : [m.material]) { (mm as THREE.MeshLambertMaterial).map?.dispose(); mm.dispose(); }
    });
  }
}
