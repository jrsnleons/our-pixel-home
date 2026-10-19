// Building blocks for the diorama: boxes whose faces are painted pixel textures, flat
// billboards for sprites, and a cache so identical furniture shares GPU resources.

import * as THREE from 'three';
import { canvas, PPU, texture, type Ctx } from './pixel';

export type Painter = (g: Ctx, w: number, h: number) => void;
export type Face = string | Painter | null;

export interface BoxFaces {
  top?: Face; bottom?: Face; front?: Face; back?: Face; left?: Face; right?: Face;
  /** Default for any side face not given. */
  sides?: Face;
}

const lambertCache = new Map<string, THREE.MeshLambertMaterial>();

/** Flat-colored Lambert material, shared by color. */
export function flat(color: string, opts: { emissive?: string; transparent?: boolean; opacity?: number } = {}): THREE.MeshLambertMaterial {
  const k = `${color}|${opts.emissive ?? ''}|${opts.opacity ?? 1}`;
  let m = lambertCache.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, emissive: opts.emissive ?? '#000000', transparent: !!opts.transparent, opacity: opts.opacity ?? 1 });
    m.userData.shared = true;
    lambertCache.set(k, m);
  }
  return m;
}

export function painted(w: number, h: number, p: Painter, opts: { alpha?: boolean; emissive?: boolean; side?: THREE.Side } = {}): THREE.MeshLambertMaterial {
  const [c, g] = canvas(w, h);
  p(g, c.width, c.height);
  const map = texture(c);
  return new THREE.MeshLambertMaterial({
    map,
    alphaTest: opts.alpha ? 0.5 : 0,
    transparent: false,
    side: opts.side ?? THREE.FrontSide,
    emissive: opts.emissive ? '#ffffff' : '#000000',
    emissiveMap: opts.emissive ? map : null,
    emissiveIntensity: opts.emissive ? 0.9 : 0,
  });
}

function faceMat(face: Face | undefined, wPx: number, hPx: number): THREE.Material {
  if (face == null) return flat('#000000', { transparent: true, opacity: 0 });
  if (typeof face === 'string') return flat(face);
  return painted(Math.max(1, Math.round(wPx)), Math.max(1, Math.round(hPx)), face);
}

/**
 * A box whose min corner sits at (x, y, z). Face textures are painted in the orientation
 * you'd see standing in front of that face, at 16 px per unit.
 */
export function pbox(x: number, y: number, z: number, w: number, h: number, d: number, faces: BoxFaces, opts: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh {
  const s = faces.sides;
  const mats = [
    faceMat(faces.right ?? s, d * PPU, h * PPU), // +x
    faceMat(faces.left ?? s, d * PPU, h * PPU), // -x
    faceMat(faces.top, w * PPU, d * PPU), // +y
    faceMat(faces.bottom ?? '#000000', w * PPU, d * PPU), // -y
    faceMat(faces.front ?? s, w * PPU, h * PPU), // +z
    faceMat(faces.back ?? s, w * PPU, h * PPU), // -z
  ];
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  m.position.set(x + w / 2, y + h / 2, z + d / 2);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}

/** A solid-color box (legs, rails, posts). */
export function cbox(x: number, y: number, z: number, w: number, h: number, d: number, color: string, opts: { cast?: boolean } = {}): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color));
  m.position.set(x + w / 2, y + h / 2, z + d / 2);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = true;
  return m;
}

/** A horizontal painted quad lying on top of something (rug, tabletop decal). */
export function decal(x: number, y: number, z: number, w: number, d: number, p: Painter): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), painted(w * PPU, d * PPU, p, { alpha: true }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x + w / 2, y, z + d / 2);
  m.receiveShadow = true;
  return m;
}

/** A vertical painted quad facing +z (signs, wall art, drawer fronts). */
export function panel(x: number, y: number, z: number, w: number, h: number, p: Painter, opts: { alpha?: boolean; emissive?: boolean; cast?: boolean } = {}): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), painted(w * PPU, h * PPU, p, { alpha: opts.alpha, emissive: opts.emissive }));
  m.position.set(x + w / 2, y + h / 2, z);
  m.castShadow = opts.cast ?? false;
  m.receiveShadow = true;
  return m;
}

/** The yaw that turns a plane to face the diorama camera. Set by the renderer. */
export const view = { yaw: Math.atan2(0.62, 0.78) };

/**
 * A billboard: a vertical sprite that always faces the camera's yaw, standing with its feet at
 * (x, y, z). Casts a real shadow through alpha testing, the HD-2D trick.
 */
export function billboard(map: THREE.Texture, w: number, h: number, opts: { emissive?: boolean; cast?: boolean } = {}): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, h / 2, 0);
  const mat = new THREE.MeshLambertMaterial({
    map, alphaTest: 0.5, side: THREE.DoubleSide,
    emissive: opts.emissive ? '#ffffff' : '#000000', emissiveMap: opts.emissive ? map : null, emissiveIntensity: opts.emissive ? 0.6 : 0,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.y = view.yaw;
  m.castShadow = opts.cast ?? true;
  m.userData.billboard = true;
  return m;
}

export function spriteTexture(w: number, h: number, p: Painter): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  p(g, w, h);
  return texture(c);
}

/** Free GPU memory for everything under `obj` except shared materials. */
export function dispose(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const ms = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of ms) {
      if (m.userData.shared) continue;
      const anyM = m as THREE.MeshLambertMaterial;
      anyM.map?.dispose();
      m.dispose();
    }
  });
}
