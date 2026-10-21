// An AreaScene is anywhere you can walk that isn't your home: the town, a shop, a workplace.
// It shares the home's renderer (so switching is instant), owns its own three.js scene, walks
// you and your partner around a tile map, and turns taps into walking or into "go in".

import * as THREE from 'three';
import { key, type Tile } from '../core/grid';
import type { FloorPlan } from '../core/layout';
import { findPath, nearestFree } from '../core/pathfinding';
import { Actor } from './actor';
import type { AvatarLook } from './art/avatar';
import { daylight, type Daylight } from './daylight';
import { Effects } from './fx';
import type { Renderer } from './renderer';
import type { ThemeKey } from '../data/themes';
import { THEMES, type Theme } from '../data/themes';

export interface ScreenPoint { x: number; y: number }

/** A place you can walk up to and use: a door, a counter, a shelf, a bench. */
export interface Hotspot {
  id: string;
  kind: string;
  label: string;
  /** The tile you stand on to use it. */
  approach: Tile;
  /** Where the bubble anchors (world position above it). */
  at: THREE.Vector3;
}

export interface AreaEvents {
  /** You reached a hotspot (after walking up to it). */
  hotspot(h: Hotspot, at: ScreenPoint): void;
  /** You tapped a hotspot that can't be used right now; the area still walks you toward it. */
  tapPartner(at: ScreenPoint): void;
  tapNpc(id: string, at: ScreenPoint): void;
  walked(from: Tile, path: Tile[]): void;
  tapEmpty(): void;
  /** You walked into a named part of the map (the town's districts). */
  district?(d: { name: string; blurb: string }): void;
}

export interface Npc {
  id: string;
  actor: Actor;
  /** Waypoints this person wanders between. */
  route: Tile[];
  seed: number;
  epoch: number;
  at: Tile;
  name: string;
  line: string;
}

const SPEED = 3.2;
/** Long trips across town turn into a jog, on both phones (the speed follows the path length). */
const JOG = 5.6;
export const paceFor = (steps: number) => (steps > 22 ? JOG : SPEED);

export abstract class AreaScene {
  readonly scene = new THREE.Scene();
  readonly fx = new Effects();
  readonly me: Actor;
  readonly partner: Actor;
  protected npcs: Npc[] = [];
  protected hotspots = new Map<string, Hotspot>();
  protected pickables: THREE.Object3D[] = [];
  protected blocked = new Set<string>();
  protected theme: Theme;
  protected day: Daylight | null = null;
  protected hemi: THREE.HemisphereLight;
  protected sun: THREE.DirectionalLight;
  protected clock = 0;
  protected active = false;
  private timers: { at: number; fn: () => void }[] = [];
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private dragging = false;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private dayTimer = 0;
  private camGoal = new THREE.Vector3();
  partnerHere = false;
  get themeKey() { return this.theme.key; }
  /** A fixed camera target (interiors); null follows me around. */
  protected camFixed: THREE.Vector3 | null = null;
  /** Keep the camera over the map so the view never drifts out onto empty lawn (world units). */
  protected camBounds: { x: [number, number]; z: [number, number] } | null = null;

  constructor(
    protected readonly r: Renderer,
    themeKey: ThemeKey,
    protected readonly L: FloorPlan,
    looks: { me: AvatarLook; partner: AvatarLook },
    protected readonly events: AreaEvents,
    protected readonly view: { pitch: number; fitW: number; yaw?: number },
    spawn: Tile,
  ) {
    this.theme = THEMES[themeKey];
    this.scene.add(this.fx.group);
    this.hemi = new THREE.HemisphereLight('#FFFFFF', '#6A5A7A', 1);
    this.sun = new THREE.DirectionalLight('#FFFFFF', 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    Object.assign(this.sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.me = new Actor(looks.me, spawn, true);
    this.partner = new Actor(looks.partner, spawn, false);
    this.partner.group.visible = false;
    this.scene.add(this.me.group, this.partner.group);
    this.bindInput(r.canvas);
  }

  // ---------- Subclass hooks ----------

  /** Colors, light and any night glow for the time of day. */
  protected abstract applyDay(d: Daylight): void;
  /** Called every frame after the actors moved. */
  protected tickArea(_dt: number, _t: number): void { /* optional */ }
  /** The light that casts shadows (an interior brings its own). */
  protected shadowSun(): THREE.DirectionalLight { return this.sun; }

  // ---------- Setup helpers for subclasses ----------

  protected addHotspot(h: Hotspot, meshes: THREE.Object3D[] = []) {
    this.hotspots.set(h.id, h);
    for (const m of meshes) { m.userData.hotspot = h.id; m.traverse((o) => { o.userData.hotspot = h.id; }); this.pickables.push(m); }
  }

  protected addNpc(n: Omit<Npc, 'epoch' | 'at'>) {
    const npc: Npc = { ...n, epoch: -1, at: n.route[0] };
    npc.actor.speed = 1.7;
    npc.actor.sprite.userData.npc = n.id;
    this.scene.add(npc.actor.group);
    this.npcs.push(npc);
  }

  protected removeNpc(id: string) {
    const i = this.npcs.findIndex((n) => n.id === id);
    if (i < 0) return;
    const [n] = this.npcs.splice(i, 1);
    this.scene.remove(n.actor.group);
    n.actor.dispose();
  }

  // ---------- Lifecycle ----------

  /** Make this the scene on screen. */
  start() {
    this.active = true;
    this.r.attach(this.scene, this.view);
    this.r.zoom = 1;
    this.r.pan.set(0, 0);
    this.r.setShadowLight(this.shadowSun());
    if (this.camFixed) this.r.target.copy(this.camFixed); else { this.r.target.set(this.me.pos.x, 1.05, this.me.pos.z); this.clampCam(this.r.target); }
    this.applyDaylight(true);
    this.r.start((dt, t) => this.frame(dt, t));
  }

  /** Stop reacting to taps (another scene took over). */
  pause() {
    this.active = false;
    this.pointers.clear();
  }

  private frame(dt: number, t: number) {
    this.clock += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].at <= this.clock) { const tm = this.timers[i]; this.timers.splice(i, 1); tm.fn(); }
    this.me.update(dt);
    this.partner.update(dt);
    for (const n of this.npcs) { this.stepNpc(n); n.actor.update(dt); }
    this.fx.update(dt);
    this.dayTimer += dt;
    if (this.dayTimer > 20) { this.dayTimer = 0; this.applyDaylight(); }
    this.follow(dt);
    this.tickArea(dt, t);
  }

  protected after(seconds: number, fn: () => void) { this.timers.push({ at: this.clock + seconds, fn }); }

  private follow(dt: number) {
    // Keep the person you are in the middle of the screen, easing so walking feels smooth.
    if (this.camFixed) return;
    this.camGoal.set(this.me.pos.x, 1.05, this.me.pos.z);
    this.clampCam(this.camGoal);
    const k = Math.min(1, dt * 4);
    this.r.target.lerp(this.camGoal, k);
    // The sun and its shadow follow too, so shadows stay sharp wherever you walk.
    this.sun.target.position.set(this.r.target.x, 0, this.r.target.z);
    this.sun.position.copy(this.sun.target.position).add(this.sunOffset);
    this.sun.target.updateMatrixWorld();
  }
  private clampCam(v: THREE.Vector3) {
    const b = this.camBounds;
    if (!b) return;
    v.x = Math.max(b.x[0], Math.min(b.x[1], v.x));
    v.z = Math.max(b.z[0], Math.min(b.z[1], v.z));
  }
  protected sunOffset = new THREE.Vector3(-4, 12, 8);

  /** Pin the clock to an hour (previews); null follows real time. */
  hourOverride: number | null = null;

  applyDaylight(force = false) {
    const now = new Date();
    if (this.hourOverride != null) now.setHours(Math.floor(this.hourOverride), Math.round((this.hourOverride % 1) * 60), 0, 0);
    const d = daylight(now, this.theme);
    if (!force && this.day && Math.abs(d.hour - this.day.hour) < 0.05) return;
    this.day = d;
    this.applyDay(d);
  }

  // ---------- Walking ----------

  tileOf(world: THREE.Vector3): Tile { return { x: Math.floor(world.x + 3.5), y: Math.floor(world.z + 3.5) }; }

  walkMeTo(t: Tile) {
    const start = this.blocked.has(key(this.me.tile.x, this.me.tile.y)) ? nearestFree(this.me.tile, this.blocked, this.L) ?? this.me.tile : this.me.tile;
    const path = findPath(start, t, this.blocked, this.L);
    if (!path || !path.length) return;
    this.me.speed = paceFor(path.length);
    this.me.walk(path);
    this.events.walked(this.me.tile, path);
  }

  /** Walk to a hotspot's approach tile, then use it. */
  goTo(h: Hotspot) {
    const here = this.me.tile;
    const at = h.approach;
    const use = () => this.events.hotspot(h, this.screenOf(h.at));
    if (here.x === at.x && here.y === at.y && !this.me.walking) { use(); return; }
    const path = findPath(here, at, this.blocked, this.L);
    if (!path) return;
    this.me.speed = paceFor(path.length);
    this.me.walk(path, use);
    this.events.walked(here, path);
  }

  /** Put me somewhere right away (arriving through a door). */
  placeMe(t: Tile) {
    this.me.stand();
    this.me.place(t);
    if (!this.camFixed) { this.r.target.set(this.me.pos.x, 1.05, this.me.pos.z); this.clampCam(this.r.target); }
  }

  placePartner(t: Tile) { this.partner.stand(); this.partner.place(t); }

  setPartnerHere(here: boolean, at?: Tile) {
    this.partnerHere = here;
    this.partner.group.visible = here;
    if (here && at) this.partner.place(at);
  }

  remoteWalk(from: Tile, path: Tile[]) {
    if (Math.abs(this.partner.tile.x - from.x) + Math.abs(this.partner.tile.y - from.y) > 1) this.partner.place(from);
    this.partner.speed = paceFor(path.length);
    this.partner.walk(path);
  }

  setLooks(me: AvatarLook, partner: AvatarLook) {
    if (JSON.stringify(me) !== JSON.stringify(this.me.look)) this.me.setLook(me);
    if (JSON.stringify(partner) !== JSON.stringify(this.partner.look)) this.partner.setLook(partner);
  }

  // ---------- Townsfolk ----------

  /**
   * Everyone wanders on a shared timetable computed from the clock, so both phones see the same
   * people in the same places without sending a single message.
   */
  private stepNpc(n: Npc) {
    const slot = 11000;
    const now = Date.now() + n.seed * 3700;
    const epoch = Math.floor(now / slot);
    if (epoch === n.epoch) return;
    const first = n.epoch < 0;
    n.epoch = epoch;
    const pick = (e: number) => n.route[Math.floor(rngAt(n.seed, e) * n.route.length)];
    // Start from where they actually are: if the last stroll ran long, a route from their last
    // stop would have them cut straight across buildings to catch up.
    const from = first ? pick(epoch - 1) : n.actor.walking ? n.actor.nextTile ?? n.actor.tile : n.actor.tile;
    const to = pick(epoch);
    n.at = to;
    const path = findPath(from, to, this.blocked, this.L);
    if (first) {
      n.actor.place(from);
      const into = (now % slot) / 1000;
      if (path && path.length) {
        const done = Math.min(path.length, Math.floor(into * n.actor.speed));
        if (done > 0) n.actor.place(path[done - 1]);
        const rest = path.slice(done);
        if (rest.length) n.actor.walk(rest);
      }
      return;
    }
    if (path && path.length) n.actor.walk(n.actor.walking && n.actor.nextTile ? [n.actor.nextTile, ...path] : path);
  }

  /** Where someone (or something) you can talk to is, for the speech bubble; null if they're not here. */
  protected talkAt(id: string): THREE.Vector3 | null {
    const n = this.npcs.find((q) => q.id === id);
    return n && n.actor.group.visible ? n.actor.head() : null;
  }

  // ---------- Input ----------

  protected setRay(sx: number, sy: number) {
    const rect = this.r.canvas.getBoundingClientRect();
    this.ndc.set(((sx - rect.left) / rect.width) * 2 - 1, -((sy - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.r.camera);
  }

  protected screenOf(v: THREE.Vector3): ScreenPoint {
    const rect = this.r.canvas.getBoundingClientRect();
    const p = this.r.project(v);
    return { x: p.x + rect.left, y: p.y + rect.top };
  }

  private bindInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      this.dragging = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) this.dragging = true;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.active) return;
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (!p) return;
      if (!this.dragging && performance.now() - p.t < 600 && this.pointers.size === 0) this.tap(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
  }

  protected tap(sx: number, sy: number) {
    this.setRay(sx, sy);
    const actors: THREE.Object3D[] = [this.partner.sprite, ...this.npcs.filter((n) => n.actor.group.visible).map((n) => n.actor.sprite)];
    const hits = this.ray.intersectObjects([...actors, ...this.pickables], true);
    for (const h of hits) {
      if (h.object === this.partner.sprite) { if (this.partnerHere) { this.events.tapPartner(this.screenOf(this.partner.head())); return; } continue; }
      const npc = h.object.userData.npc as string | undefined;
      const head = npc ? this.talkAt(npc) : null;
      if (npc && head) { this.events.tapNpc(npc, this.screenOf(head)); return; }
      const id = h.object.userData.hotspot as string | undefined;
      const hs = id ? this.hotspots.get(id) : undefined;
      if (hs) { this.goTo(hs); return; }
    }
    const hit = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
      const t = this.tileOf(hit);
      if (this.L && t.x >= 0 && t.y >= 0 && t.x < this.L.w && t.y < this.L.d && !this.blocked.has(key(t.x, t.y))) {
        this.events.tapEmpty();
        this.walkMeTo(t);
        this.fx.spawn('sparkle', new THREE.Vector3(hit.x, 0.1, hit.z), { life: 0.5, rise: 0.4, size: 0.25, spread: 0 });
        return;
      }
    }
    this.events.tapEmpty();
  }

  project(v: THREE.Vector3): ScreenPoint & { visible: boolean } {
    const rect = this.r.canvas.getBoundingClientRect();
    const p = this.r.project(v);
    return { x: p.x + rect.left, y: p.y + rect.top, visible: p.visible };
  }

  destroy() {
    this.pause();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mm of mats) { if (!mm.userData.shared) { (mm as THREE.MeshLambertMaterial).map?.dispose(); (mm as THREE.MeshLambertMaterial).emissiveMap?.dispose(); mm.dispose(); } }
    });
    this.me.dispose();
    this.partner.dispose();
    for (const n of this.npcs) n.actor.dispose();
  }
}

/** A repeatable pseudo-random number in [0, 1) for (seed, n). */
export function rngAt(seed: number, n: number): number {
  let h = (seed * 374761393 + n * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
