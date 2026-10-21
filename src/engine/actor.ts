// An avatar in the room: a billboard sprite that walks tile paths, faces one of four
// diagonals, and plays poses from its atlas.

import * as THREE from 'three';
import { tileToWorld, type Tile } from '../core/grid';
import { buildAvatarAtlas, FH, FRAME_INDEX, FW, PPU, type AvatarLook } from './art/avatar';
import { view } from './art/kit';
import { canvas, px, texture } from './art/pixel';

export type Facing = '+x' | '-x' | '+z' | '-z';

/** Front sprites face down-left on screen (+z), back sprites up-left (-x); the others mirror. */
const FACING_VIEW: Record<Facing, { back: boolean; flip: boolean }> = {
  '+z': { back: false, flip: false },
  '+x': { back: false, flip: true },
  '-x': { back: true, flip: false },
  '-z': { back: true, flip: true },
};

/** Seen straight on (the town's front camera), walking left or right shows a face, not a back. */
const FRONT_VIEW: Record<Facing, { back: boolean; flip: boolean }> = {
  '+z': { back: false, flip: false },
  '+x': { back: false, flip: true },
  '-x': { back: false, flip: false },
  '-z': { back: true, flip: true },
};

const facingView = () => (Math.abs(view.yaw) < 0.2 ? FRONT_VIEW : FACING_VIEW);

/**
 * Sprites are flat sheets standing in a 3D room, so a wall right beside someone can cut through
 * the sheet. Drawing them a little nearer the camera (depth only: same spot on screen, same
 * shadow) keeps whole people in front of walls they're standing next to.
 */
const DEPTH_NUDGE = 0.25;
function nudgeDepth(mat: THREE.Material) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include project_vertex', `#include project_vertex
      gl_Position = projectionMatrix * (mvPosition + vec4(0.0, 0.0, ${DEPTH_NUDGE.toFixed(2)}, 0.0));`);
  };
  mat.customProgramCacheKey = () => 'sprite-depth-nudge';
}

export function facingTowards(from: { x: number; z: number }, to: { x: number; z: number }): Facing {
  const dx = to.x - from.x, dz = to.z - from.z;
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? '+x' : '-x';
  return dz > 0 ? '+z' : '-z';
}

export type Anim = { frames: string[]; fps: number; loop?: boolean };

const WALK: Anim = { frames: ['walk1', 'walk2', 'walk3', 'walk2'], fps: 9 };
const IDLE: Anim = { frames: ['idle', 'idle', 'idle', 'idle2', 'idle', 'idle', 'blink', 'idle', 'idle2', 'idle'], fps: 3 };

export class Actor {
  readonly group = new THREE.Group();
  readonly sprite: THREE.Mesh;
  private mat: THREE.MeshLambertMaterial;
  private atlas: THREE.CanvasTexture;
  private cols: number;
  private blob: THREE.Mesh;
  private cover: THREE.Mesh | null = null;
  tile: Tile;
  pos = new THREE.Vector3();
  facing: Facing = '+z';
  /** Keep facing where they were put (someone fishing off the pier), even with their back to us. */
  holdFacing = false;
  private path: Tile[] = [];
  private onArrive: (() => void) | null = null;
  speed = 2.4; // tiles per second
  private anim: Anim = IDLE;
  private animT = 0;
  private override: Anim | null = null;
  /** Height above the floor (sitting on a sofa, lying in bed). */
  elevation = 0;
  private elevTarget = 0;
  lying = false;
  /** Quarter turns of a lying body around the vertical axis (matches the bed's rotation). */
  lieRot = 0;
  /** Screen-plane tilt in radians (being carried). */
  tilt = 0;
  /** Visual offset for paired poses (hug lean, piggyback), in world units. */
  offset = new THREE.Vector3();
  private offsetTarget = new THREE.Vector3();
  hop = 0;
  private idleFor = 0;
  look: AvatarLook;

  constructor(look: AvatarLook, tile: Tile, readonly isMe: boolean) {
    this.look = look;
    this.tile = { ...tile };
    const w = tileToWorld(tile);
    this.pos.set(w.x, 0, w.z);
    const { texture: t, cols } = buildAvatarAtlas(look);
    this.atlas = t; this.cols = cols;
    // Frames are drawn at the room's 16 px per unit, so avatar pixels and furniture pixels are
    // the same size on screen. The bottom row is only outline, so the shoes sit on the floor.
    const geo = new THREE.PlaneGeometry(FW / PPU, FH / PPU);
    geo.translate(0, FH / (2 * PPU) - 1 / PPU, 0);
    // A little self-light keeps faces readable when the lamp is behind them at night.
    this.mat = new THREE.MeshLambertMaterial({ map: this.atlas, emissiveMap: this.atlas, emissive: '#FFFFFF', emissiveIntensity: 0.32, alphaTest: 0.5, side: THREE.DoubleSide });
    nudgeDepth(this.mat);
    this.sprite = new THREE.Mesh(geo, this.mat);
    this.sprite.castShadow = true;
    this.sprite.userData.actor = this;
    this.group.add(this.sprite);
    // A soft contact shadow keeps feet grounded even when the sun is low.
    const [bc, bg] = canvas(16, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
      const d = ((x - 7.5) / 8) ** 2 + ((y - 3.5) / 4) ** 2;
      if (d < 1) { bg.fillStyle = `rgba(20,10,20,${(0.42 * (1 - d)).toFixed(2)})`; bg.fillRect(x, y, 1, 1); }
    }
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ map: texture(bc), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.015;
    this.group.add(this.blob);
    this.group.position.copy(this.pos);
    this.setFrame('idle');
  }

  setLook(look: AvatarLook) {
    this.look = look;
    const { texture: t, cols } = buildAvatarAtlas(look);
    this.atlas.dispose();
    this.atlas = t; this.cols = cols;
    this.mat.map = t;
    this.mat.emissiveMap = t;
    this.mat.needsUpdate = true;
    this.setFrame(this.anim.frames[0]);
  }

  get walking() { return this.path.length > 0; }

  /** The tile this person is stepping onto, if they're walking. */
  get nextTile(): Tile | null { return this.path[0] ?? null; }

  walk(path: Tile[], onArrive?: () => void) {
    this.stand();
    this.path = this.fromHere(path);
    this.onArrive = onArrive ?? null;
    if (!path.length) this.onArrive?.();
    if (!path.length) this.onArrive = null;
  }

  /**
   * A new path starts at a tile next to the one we last stood on. If we're between two tiles,
   * cutting straight to that first step would go diagonally (through a wall corner), so finish
   * the step we're on, or step back, and only then follow the path along the grid.
   */
  private fromHere(path: Tile[]): Tile[] {
    const out = path.slice();
    const heading = this.path[0];
    const w = tileToWorld(this.tile);
    const between = Math.hypot(this.pos.x - w.x, this.pos.z - w.z) > 0.02;
    if (!between || !heading) return out;
    const at = out.findIndex((t) => t.x === heading.x && t.y === heading.y);
    if (at === 0) return out;
    if (at > 0) return out.slice(at);
    return [{ ...this.tile }, ...out];
  }

  /** Stand on something this high (a display plinth) without walking anywhere. */
  perch(height: number) { this.elevation = height; this.elevTarget = height; }

  stopWalking() { this.path = []; this.onArrive = null; }

  /** Teleport (used when furniture moves under someone, or on first load). */
  place(tile: Tile) {
    this.tile = { ...tile };
    const w = tileToWorld(tile);
    this.pos.set(w.x, 0, w.z);
  }

  play(anim: Anim | null) {
    this.override = anim;
    this.animT = 0;
  }

  /** Sit or lie at a world position (furniture spot). */
  settle(at: THREE.Vector3, facing: Facing, opts: { lying?: boolean; height: number; pose?: Anim; cover?: string | null }) {
    this.stopWalking();
    this.pos.set(at.x, 0, at.z);
    this.facing = facing;
    this.elevTarget = opts.height;
    this.lying = !!opts.lying;
    this.override = opts.pose ?? null;
    this.setCover(opts.lying ? opts.cover ?? null : null);
  }

  stand() {
    this.elevTarget = 0;
    this.lying = false;
    this.override = null;
    this.offsetTarget.set(0, 0, 0);
    this.setCover(null);
  }

  nudge(v: THREE.Vector3) { this.offsetTarget.copy(v); }

  private setCover(color: string | null) {
    if (this.cover) { this.group.remove(this.cover); this.cover.geometry.dispose(); for (const m of this.cover.material as THREE.MeshLambertMaterial[]) { m.map?.dispose(); m.dispose(); } this.cover = null; }
    if (!color) return;
    // A puffy blanket: folded sheet edge at the shoulders, soft quilting lines.
    const [c, g] = canvas(14, 18);
    px(g, color, 0, 0, 14, 18);
    for (let y = 5; y < 18; y += 4) px(g, 'rgba(0,0,0,0.10)', 0, y, 14, 1);
    for (let x = 3; x < 14; x += 4) px(g, 'rgba(0,0,0,0.08)', x, 3, 1, 15);
    px(g, '#F6F0E4', 0, 0, 14, 3);
    px(g, 'rgba(0,0,0,0.15)', 0, 3, 14, 1);
    px(g, 'rgba(255,255,255,0.25)', 0, 4, 1, 14);
    const side = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.8) });
    const top = new THREE.MeshLambertMaterial({ map: texture(c) });
    this.cover = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.17, 1.3), [side, side, top, side, side, side]);
    this.cover.castShadow = true;
    this.group.add(this.cover);
  }

  private setFrame(name: string) {
    const i = FRAME_INDEX[name] ?? 0;
    const v = facingView()[this.lying ? '+z' : this.facing];
    this.atlas.offset.set(i / this.cols, v.back ? 0 : 0.5);
    this.sprite.scale.x = v.flip ? -1 : 1;
  }

  update(dt: number) {
    // Walk along the path.
    if (this.path.length) {
      const next = this.path[0];
      const w = tileToWorld(next);
      const target = new THREE.Vector3(w.x, 0, w.z);
      const d = target.clone().sub(this.pos);
      d.y = 0;
      const dist = d.length();
      if (dist > 0.001) this.facing = facingTowards(this.pos, target);
      const step = this.speed * dt;
      if (dist <= step) {
        this.pos.copy(target);
        this.tile = { ...next };
        this.path.shift();
        if (!this.path.length) { const cb = this.onArrive; this.onArrive = null; cb?.(); }
      } else this.pos.addScaledVector(d.normalize(), step);
    }
    this.elevation += (this.elevTarget - this.elevation) * Math.min(1, dt * 10);
    this.offset.lerp(this.offsetTarget, Math.min(1, dt * 8));

    // Standing around with your back to the camera reads as a faceless blob, so after a few
    // idle seconds people turn to face the room (the front view of the same diagonal).
    if (!this.path.length && !this.override && this.elevTarget === 0 && !this.lying) {
      this.idleFor += dt;
      if (this.idleFor > 3.5 && !this.holdFacing && facingView()[this.facing].back) this.facing = this.facing === '-x' ? '+z' : '+x';
    } else this.idleFor = 0;

    const anim = this.override ?? (this.path.length ? WALK : IDLE);
    if (anim !== this.anim) { this.anim = anim; this.animT = 0; }
    this.animT += dt;
    const n = anim.frames.length;
    let idx = Math.floor(this.animT * anim.fps);
    idx = anim.loop === false ? Math.min(idx, n - 1) : idx % n;
    this.setFrame(anim.frames[idx]);

    if (this.hop > 0) this.hop = Math.max(0, this.hop - dt * 3);
    const hopY = Math.sin(this.hop * Math.PI) * 0.25;
    this.group.position.set(this.pos.x + this.offset.x, 0, this.pos.z + this.offset.z);
    if (this.lying) {
      // In bed only the head shows: the upright sprite sinks into the mattress (which hides the
      // body) with the face on the pillow, tipped a little, and the blanket pulled up to the chin.
      const th = this.lieRot * Math.PI / 2;
      const fx = Math.sin(th), fz = Math.cos(th);
      this.sprite.rotation.set(0, view.yaw, 0.2, 'YXZ');
      this.sprite.position.set(-fx * 0.86, this.elevation - 0.81 + this.offset.y, -fz * 0.86);
      this.sprite.castShadow = false;
      if (this.cover) { this.cover.position.set(0, this.elevation + 0.095, 0); this.cover.rotation.set(0, th, 0); }
      this.blob.visible = false;
    } else {
      this.sprite.rotation.set(0, view.yaw, this.tilt, 'YXZ');
      this.sprite.castShadow = true;
      this.sprite.position.set(0, this.elevation + this.offset.y + hopY, 0);
      this.blob.visible = this.elevation < 0.05;
    }
  }

  /** World point above the head, for bubbles and name tags. */
  head(): THREE.Vector3 {
    if (this.lying) {
      const th = this.lieRot * Math.PI / 2;
      return this.group.position.clone().add(new THREE.Vector3(-Math.sin(th) * 0.86, this.elevation + 0.75, -Math.cos(th) * 0.86));
    }
    return this.group.position.clone().add(new THREE.Vector3(0, this.elevation + 2 + this.offset.y, 0));
  }

  dispose() {
    this.atlas.dispose();
    this.mat.dispose();
    this.sprite.geometry.dispose();
    this.setCover(null);
  }
}
