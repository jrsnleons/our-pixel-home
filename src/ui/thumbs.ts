// Store and inventory thumbnails, rendered from the same art as the room so a sofa in the
// store is exactly the sofa you get. One small offscreen renderer draws them on demand.

import * as THREE from 'three';
import { ITEM_BY_KEY } from '../data/catalog';
import { THEMES, type ThemeKey } from '../data/themes';
import { avatarPreview, DEFAULT_LOOK, type AvatarLook } from '../engine/art/avatar';
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
  if (def?.category === 'outfit' || def?.category === 'accessory') {
    const look: AvatarLook = { ...DEFAULT_LOOK, hair: def.category === 'accessory' ? 'bob' : 'short', hairColor: 2, outfit: def.category === 'outfit' ? key : 'fit_tee', accessory: def.category === 'accessory' ? key : 'acc_none' };
    return avatarPreview(look, 'idle', 'front', 3).toDataURL();
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
