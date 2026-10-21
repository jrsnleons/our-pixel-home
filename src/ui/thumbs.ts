// Store and inventory thumbnails, rendered from the same art as the room so a sofa in the
// store is exactly the sofa you get. One small offscreen renderer draws them on demand.

import * as THREE from 'three';
import { ITEM_BY_KEY } from '../data/catalog';
import { THEMES, type ThemeKey } from '../data/themes';
import { buildFloorItem } from '../engine/art/furniture';
import { dispose } from '../engine/art/kit';
import { canvas } from '../engine/art/pixel';
import { paintFloor, paintWallpaper } from '../engine/art/surfaces';
import { buildWallItem } from '../engine/art/wall';

const SIZE = 96;
const cache = new Map<string, string>();
let r: THREE.WebGLRenderer | null = null;
let failed = false;

function renderer(): THREE.WebGLRenderer | null {
  if (r || failed) return r;
  try {
    r = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(SIZE, SIZE, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
  } catch { failed = true; }
  return r;
}

function render3d(key: string, theme: ThemeKey, data?: Record<string, unknown> | null): string {
  const rr = renderer();
  const def = ITEM_BY_KEY[key];
  if (!rr || !def) return '';
  const T = THEMES[theme];
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#FFF4E0', '#6A5040', 2.2));
  const sun = new THREE.DirectionalLight('#FFFFFF', 1.6);
  sun.position.set(-2, 5, 4);
  scene.add(sun);
  const wall = def.kind === 'wall-item';
  const art = wall ? buildWallItem(key, T) : buildFloorItem(key, T, data);
  const g = art.group;
  scene.add(g);
  if ('refresh' in art && art.refresh) art.refresh({ partnerOffsetMin: 0, daysToVisit: 12, notes: [{ text: 'miss you', kind: 'note' }, { text: 'pray for exams', kind: 'prayer' }] });
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const dir = wall ? new THREE.Vector3(0.18, 0.12, 1).normalize() : new THREE.Vector3(0.62, 0.66, 0.78).normalize();
  const radius = Math.max(size.x, size.y, size.z) * 0.62 + 0.05;
  const cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, 50);
  cam.position.copy(center).addScaledVector(dir, 12);
  cam.lookAt(center);
  rr.setClearColor(0x000000, 0);
  rr.render(scene, cam);
  const url = rr.domElement.toDataURL('image/png');
  dispose(g);
  return url;
}

function styleThumb(key: string, theme: ThemeKey): string {
  const def = ITEM_BY_KEY[key];
  const T = THEMES[theme];
  if (def?.category === 'wallpaper') {
    const [c, g] = canvas(64, 64);
    const [t, tg] = canvas(32, 32);
    paintWallpaper(tg, key, T.wall.tint, T.accent);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.drawImage(t, x * 32, y * 32);
    return c.toDataURL();
  }
  if (def?.category === 'floor') {
    const [c, g] = canvas(64, 64);
    paintFloor(g, key, null);
    return c.toDataURL();
  }
  return '';
}

/** Data URL for an item's picture (cached per theme). Empty string if it can't be drawn. */
export function thumb(key: string, theme: ThemeKey, data?: Record<string, unknown> | null): string {
  const def = ITEM_BY_KEY[key];
  const stage = data && typeof data.water === 'number' ? `|w${Math.min(5, data.water as number)}` : '';
  const k = `${theme}|${key}${stage}`;
  const hit = cache.get(k);
  if (hit != null) return hit;
  let url = '';
  try {
    url = def && (def.kind === 'floor-item' || def.kind === 'wall-item') ? render3d(key, theme, data) : styleThumb(key, theme);
  } catch (e) { console.warn('thumb failed', key, e); }
  cache.set(k, url);
  return url;
}

export function clearThumbs() { cache.clear(); }

/** The thumbnail if it's already drawn, without drawing it. */
export function cachedThumb(key: string, theme: ThemeKey, data?: Record<string, unknown> | null): string | undefined {
  const stage = data && typeof data.water === 'number' ? `|w${Math.min(5, data.water as number)}` : '';
  return cache.get(`${theme}|${key}${stage}`);
}

// Drawing a thumbnail takes a few milliseconds of GPU time, so a Store full of them drew all at
// once froze the screen. They're drawn from a queue instead, a few per frame, newest request
// first (what's on screen now), while the sheet shows shimmering placeholders.
interface Job { key: string; theme: ThemeKey; data?: Record<string, unknown> | null; done: ((url: string) => void)[] }
const queue: Job[] = [];
let pumping = false;

function pump() {
  pumping = true;
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 8) {
    const j = queue.pop()!;
    const url = thumb(j.key, j.theme, j.data);
    for (const d of j.done) d(url);
  }
  if (queue.length) requestAnimationFrame(pump);
  else pumping = false;
}

/** Draw a thumbnail soon. Resolves with its data URL (empty if it can't be drawn). */
export function requestThumb(key: string, theme: ThemeKey, data?: Record<string, unknown> | null): Promise<string> {
  const hit = cachedThumb(key, theme, data);
  if (hit != null) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const same = queue.find((j) => j.key === key && j.theme === theme && JSON.stringify(j.data ?? null) === JSON.stringify(data ?? null));
    if (same) { same.done.push(resolve); queue.splice(queue.indexOf(same), 1); queue.push(same); }
    else queue.push({ key, theme, data, done: [resolve] });
    if (!pumping) requestAnimationFrame(pump);
  });
}

/** Warm the cache for items likely to be looked at, when the phone is otherwise idle. */
export function prewarmThumbs(keys: string[], theme: ThemeKey) {
  const idle = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200));
  let i = 0;
  const step = () => {
    const t0 = performance.now();
    while (i < keys.length && performance.now() - t0 < 6) { const k = keys[i++]; if (cachedThumb(k, theme) == null) thumb(k, theme); }
    if (i < keys.length) idle(step, { timeout: 2000 });
  };
  idle(step, { timeout: 2000 });
}
