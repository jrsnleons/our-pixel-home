// An AreaScene is anywhere you can walk that isn't your home: the town, a shop, a workplace.
// It shares the home's renderer (so switching is instant), owns its own three.js scene, walks
// you and your partner around a tile map, and turns taps into walking or into "go in".

import * as THREE from 'three';
import { key, type Tile } from '../core/grid';
import type { FloorPlan } from '../core/layout';
import { rngAt } from '../core/hash';
import { findPath, nearestFree } from '../core/pathfinding';
import { Actor, type Facing } from './actor';
import type { AvatarLook } from './art/avatar';
import { daylight, type Daylight } from './daylight';
import { Effects } from './fx';
import { view } from './art/kit';
import type { SettleState } from './scene';
import type { WeatherKind } from '../data/weather';
import type { Renderer } from './renderer';
import type { ThemeKey } from '../data/themes';
import { THEMES, type Theme } from '../data/themes';

/** A spot on screen. `track` re-reads it every frame so a bubble can ride along with whoever it belongs to. */
export interface ScreenPoint { x: number; y: number; track?: () => ScreenPoint | null }

/** A place you can walk up to and use: a door, a counter, a shelf, a bench. */
export interface Hotspot {
  id: string;
  kind: string;
  label: string;
  /** The tile you stand on to use it. */
  approach: Tile;
  /** Where the bubble anchors (world position above it). */
  at: THREE.Vector3;
  /** A bench or pew: tapping it walks you over and sits you down in the first free seat. */
  seats?: Seat[];
}

/** One place to sit: the tile you walk to, then where you end up. */
export interface Seat { approach: Tile; world: { x: number; z: number }; facing: Facing; height: number }

/** Holding hands while walking: side by side (whoever walks leads) or one leading, one following. */
export type HoldMode = 'side' | 'follow';
export interface Hold { mode: HoldMode; /** Who leads: me, my partner, or whoever walked last (side by side). */ leader: 'me' | 'partner' | 'either' }

export interface AreaEvents {
  /** You reached a hotspot (after walking up to it). */
  hotspot(h: Hotspot, at: ScreenPoint): void;
  /** You tapped a hotspot that can't be used right now; the area still walks you toward it. */
  tapPartner(at: ScreenPoint): void;
  tapNpc(id: string, at: ScreenPoint): void;
  walked(from: Tile, path: Tile[], follow?: boolean): void;
  tapEmpty(): void;
  /** I sat down on (or got up from) a bench. */
  settled?(state: SettleState | null): void;
  /** Holding hands started or stopped (null). */
  hold?(h: Hold | null, send: boolean): void;
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
  private shownWeather: WeatherKind | undefined;
  private camGoal = new THREE.Vector3();
  partnerHere = false;
  /** Where I'm sitting, if I am. */
  protected seat: Seat | null = null;
  /** Holding hands right now, and who walked last (to know who follows when it's side by side). */
  protected hold: Hold | null = null;
  private myLeadAt = 0;
  private theirLeadAt = 0;
  private trail: Tile[] = [];
  private followGoal = '';
  private heartAt = 0;
  /** How far in and out the camera may go. */
  protected zoomRange: [number, number] = [1, 2.4];
  /** Where the camera has been dragged to, relative to me (world units). */
  protected look = new THREE.Vector3();
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
    protected view: { pitch: number; fitW: number; yaw?: number },
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
  /** The sky over this place, if it has one (the town does; a shop doesn't). */
  protected weatherNow(): WeatherKind | undefined { return undefined; }
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
    this.r.zoom = Math.max(this.zoomRange[0], Math.min(this.zoomRange[1], this.zoomWas));
    this.r.pan.set(0, 0);
    this.look.set(0, 0, 0);
    this.r.setShadowLight(this.shadowSun());
    if (this.camFixed) this.r.target.copy(this.camFixed); else { this.r.target.set(this.me.pos.x, 1.05, this.me.pos.z); this.clampCam(this.r.target); }
    this.applyDaylight(true);
    this.r.start((dt, t) => this.frame(dt, t));
  }

  /** Stop reacting to taps (another scene took over). */
  pause() {
    this.active = false;
    this.zoomWas = this.r.zoom;
    this.pointers.clear();
    this.pinch = null;
    this.setHold(null, false);
  }
  private zoomWas = 1;

  private frame(dt: number, t: number) {
    this.clock += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].at <= this.clock) { const tm = this.timers[i]; this.timers.splice(i, 1); tm.fn(); }
    this.me.update(dt);
    this.partner.update(dt);
    for (const n of this.npcs) { this.stepNpc(n); n.actor.update(dt); }
    this.fx.update(dt);
    this.dayTimer += dt;
    if (this.dayTimer > 20) { this.dayTimer = 0; this.applyDaylight(); }
    this.tickHold(dt);
    this.follow(dt);
    this.tickArea(dt, t);
  }

  protected after(seconds: number, fn: () => void) { this.timers.push({ at: this.clock + seconds, fn }); }

  private follow(dt: number) {
    // Keep the person you are in the middle of the screen, easing so walking feels smooth.
    // Zoomed out there's nothing to look around; zoomed in, a dragged view eases back once I walk off.
    const reach = Math.max(0, this.r.zoom - 1) * 5;
    const L = this.look;
    if (this.me.walking) L.multiplyScalar(Math.max(0, 1 - dt * 1.2));
    L.x = Math.max(-reach, Math.min(reach, L.x)); L.z = Math.max(-reach, Math.min(reach, L.z));
    if (this.camFixed) { this.r.target.set(this.camFixed.x + L.x, this.camFixed.y, this.camFixed.z + L.z); return; }
    this.camGoal.set(this.me.pos.x + L.x, 1.05, this.me.pos.z + L.z);
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
    const w = this.weatherNow();
    const d = daylight(now, this.theme, w);
    if (!force && this.day && Math.abs(d.hour - this.day.hour) < 0.05 && w === this.shownWeather) return;
    this.day = d;
    this.shownWeather = w;
    this.applyDay(d);
  }

  // ---------- Walking ----------

  tileOf(world: THREE.Vector3): Tile { return { x: Math.floor(world.x + 3.5), y: Math.floor(world.z + 3.5) }; }

  walkMeTo(t: Tile, by: 'me' | 'follow' = 'me') {
    const start = this.blocked.has(key(this.me.tile.x, this.me.tile.y)) ? nearestFree(this.me.tile, this.blocked, this.L) ?? this.me.tile : this.me.tile;
    const path = findPath(start, t, this.blocked, this.L);
    if (!path || !path.length) return;
    this.startWalk(start, path, undefined, by);
  }

  /** Everything my walks have in common: get up, pace by distance, tell the partner. */
  private startWalk(from: Tile, path: Tile[], then: (() => void) | undefined, by: 'me' | 'follow') {
    this.getUp();
    if (by === 'me') {
      this.myLeadAt = performance.now();
      // The one who is being led lets go when they head off on their own.
      if (this.hold?.mode === 'follow' && this.hold.leader === 'partner') this.letGo();
    }
    this.me.speed = by === 'follow' ? Math.max(this.partner.speed, SPEED) * 1.1 : paceFor(path.length);
    this.me.walk(path, then);
    this.events.walked(from, path, by === 'follow');
  }

  /** Walk to a hotspot's approach tile, then use it. */
  goTo(h: Hotspot) {
    if (h.seats?.length) { this.sitAt(h); return; }
    const here = this.me.tile;
    const at = h.approach;
    const use = () => this.events.hotspot(h, this.anchor(() => h.at));
    if (here.x === at.x && here.y === at.y && !this.me.walking) { this.getUp(); use(); return; }
    const path = findPath(here, at, this.blocked, this.L);
    if (!path) return;
    this.startWalk(here, path, use, 'me');
  }

  // ---------- Sitting ----------

  /** Walk to a bench and sit on the first free seat, next to my partner if they're already there. */
  private sitAt(h: Hotspot) {
    const seats = h.seats!;
    const taken = (s: Seat) => this.partnerHere && this.partner.seated && Math.hypot(this.partner.pos.x - s.world.x, this.partner.pos.z - s.world.z) < 0.5;
    const mine = (s: Seat) => this.seat === s;
    const free = seats.filter((s) => !taken(s));
    const seat = free.find(mine) ?? free[0];
    if (!seat) { this.events.tapEmpty(); return; }
    if (mine(seat)) return;
    const sit = () => {
      this.me.settle(new THREE.Vector3(seat.world.x, 0, seat.world.z), seat.facing, { height: seat.height, pose: { frames: ['sit'], fps: 1 } });
      this.me.tile = { ...seat.approach };
      this.seat = seat;
      this.events.settled?.({ tile: seat.approach, world: seat.world, facing: seat.facing, height: seat.height, pose: 'sit' });
      // Two of us on one bench is worth a heart.
      if (this.partnerHere && this.partner.seated && seats.some((o) => taken(o))) this.fx.spawn('heart', this.me.head(), { count: 3, spread: 0.4 });
    };
    const here = this.me.tile, at = seat.approach;
    if (here.x === at.x && here.y === at.y && !this.me.walking) { this.getUp(); sit(); return; }
    const path = findPath(here, at, this.blocked, this.L);
    if (!path) return;
    this.startWalk(here, path, sit, 'me');
  }

  /** Stand up from wherever I'm sitting (before walking off). */
  protected getUp() {
    if (!this.seat) return;
    this.seat = null;
    this.me.stand();
    this.events.settled?.(null);
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
    if (!here) { if (this.hold) this.setHold(null, false); if (this.partner.seated) this.partner.stand(); }
    if (here && at) { this.partner.stand(); this.partner.place(at); }
  }

  /** My partner walked (`follow`: they were only keeping up with me, so I'm still the one leading). */
  remoteWalk(from: Tile, path: Tile[], follow = false) {
    if (!follow) this.theirLeadAt = performance.now();
    if (this.partner.seated) this.partner.stand();
    if (Math.abs(this.partner.tile.x - from.x) + Math.abs(this.partner.tile.y - from.y) > 1) this.partner.place(from);
    this.partner.speed = paceFor(path.length);
    this.partner.walk(path);
  }

  /** My partner sat down on a bench, or got up (null). */
  remoteSettle(s: SettleState | null) {
    const p = this.partner;
    if (!s) { p.stand(); return; }
    p.settle(new THREE.Vector3(s.world.x, 0, s.world.z), s.facing, { height: s.height, pose: { frames: ['sit'], fps: 1 } });
    p.tile = { ...s.tile };
  }

  // ---------- Holding hands ----------

  private poseNow: string | null = null;

  /** Start or stop holding hands. `send` is true when I did it (so my partner's phone is told). */
  setHold(h: Hold | null, send = true) {
    if (!h && !this.hold) return;
    this.hold = h;
    this.trail = [];
    this.followGoal = '';
    if (h?.mode === 'side') { if (send) this.myLeadAt = performance.now(); else this.theirLeadAt = performance.now(); }
    if (!h && this.poseNow) { this.poseNow = null; this.me.play(null); }
    this.events.hold?.(h, send);
  }
  get holding() { return this.hold; }
  letGo() { this.setHold(null); }

  /** Am I the one keeping up right now? */
  private following(): boolean {
    const h = this.hold;
    if (!h) return false;
    return h.mode === 'follow' ? h.leader === 'partner' : this.theirLeadAt > this.myLeadAt;
  }

  private tickHold(dt: number) {
    const h = this.hold;
    if (!h) return;
    if (!this.partnerHere) { this.setHold(null, false); return; }
    const pt = this.partner.tile;
    if (!this.trail.length || this.trail[0].x !== pt.x || this.trail[0].y !== pt.y) { this.trail.unshift({ ...pt }); this.trail.length = Math.min(this.trail.length, 6); }
    if (this.following() && !this.seat) this.followStep(h);

    // Standing side by side: hands joined. Walking: a heart now and then between the two.
    const idle = !this.me.walking && !this.partner.walking && !this.seat && !this.partner.seated;
    const dx = this.partner.pos.x - this.me.pos.x, dz = Math.abs(this.partner.pos.z - this.me.pos.z);
    const joined = idle && Math.abs(dx) > 0.5 && Math.abs(dx) < 1.4 && dz < 0.4;
    const want = joined ? (dx > 0 ? 'hold' : 'holdL') : null;
    if (want !== this.poseNow) {
      this.poseNow = want;
      this.me.play(want ? { frames: [want], fps: 1 } : null);
      if (want) this.me.facing = '+z';
    }
    if (!idle) {
      this.heartAt += dt;
      if (this.heartAt > 2.4) {
        this.heartAt = 0;
        const mid = this.me.head().add(this.partner.head()).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.5, 0));
        this.fx.spawn('smallheart', mid, { spread: 0.15 });
      }
    }
  }

  /** Keep up with the leader: behind them on the path they took, or a step to their side. */
  private followStep(h: Hold) {
    const lead = this.trail[0];
    if (!lead) return;
    const back = this.trail[1];
    const free = (t: Tile) => !this.blocked.has(key(t.x, t.y)) && !(t.x === lead.x && t.y === lead.y);
    const near = (t: Tile) => Math.abs(t.x - this.me.tile.x) + Math.abs(t.y - this.me.tile.y);
    let goal: Tile | null = null;
    if (h.mode === 'side') {
      // Beside them across the way they're heading, on whichever side is closer to me.
      const from = back ?? this.me.tile;
      // Heading somewhere, along it; standing still, on the same row so you hold hands facing us.
      const horizontal = this.partner.walking && Math.abs(lead.x - from.x) >= Math.abs(lead.y - from.y);
      const perp = horizontal ? { x: 0, y: 1 } : { x: 1, y: 0 };
      const sides = [{ x: lead.x + perp.x, y: lead.y + perp.y }, { x: lead.x - perp.x, y: lead.y - perp.y }].filter(free);
      sides.sort((a, b) => near(a) - near(b));
      goal = sides[0] ?? null;
    }
    if (!goal && back && free(back)) goal = back;
    if (!goal) goal = [{ x: lead.x + 1, y: lead.y }, { x: lead.x - 1, y: lead.y }, { x: lead.x, y: lead.y + 1 }, { x: lead.x, y: lead.y - 1 }].find(free) ?? null;
    if (!goal) return;
    const k = `${goal.x},${goal.y}`;
    const there = this.me.tile.x === goal.x && this.me.tile.y === goal.y;
    if (k === this.followGoal && (this.me.walking || there)) return;
    this.followGoal = k;
    if (there && !this.me.walking) return;
    const start = this.me.walking ? this.me.nextTile ?? this.me.tile : this.me.tile;
    const path = findPath(start, goal, this.blocked, this.L);
    if (!path || !path.length) return;
    this.startWalk(this.me.tile, this.me.walking && this.me.nextTile ? [this.me.nextTile, ...path] : path, undefined, 'follow');
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

  /** Like screenOf, but the point keeps following `get()` (a walking person, a moving camera). */
  protected anchor(get: () => THREE.Vector3 | null): ScreenPoint {
    const at = (): ScreenPoint | null => { const v = get(); return v ? this.screenOf(v) : null; };
    return { ...(at() ?? { x: 0, y: 0 }), track: at };
  }

  private pinch: { d: number; z: number } | null = null;

  setZoom(z: number) {
    this.r.zoom = Math.max(this.zoomRange[0], Math.min(this.zoomRange[1], z));
    if (this.r.zoom <= 1) this.look.set(0, 0, 0);
  }

  /** Drag the view around by a few pixels (only while zoomed in; zoomed out everything's already in view). */
  private dragView(dx: number, dy: number) {
    if (this.r.zoom <= 1.02) return;
    const u = this.r.unitsPerPixel;
    // Screen right and screen up, laid onto the ground for whichever way the camera faces.
    const sx = Math.cos(view.yaw), sz = -Math.sin(view.yaw);
    const up = u / Math.max(0.3, this.r.elevationSin);
    this.look.x += -dx * u * sx - dy * up * Math.sin(view.yaw);
    this.look.z += -dx * u * sz - dy * up * Math.cos(view.yaw);
  }

  private bindInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), z: this.r.zoom };
        this.dragging = true;
      } else this.dragging = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        this.setZoom(this.pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.d));
        this.dragView(dx / 2, dy / 2);
        return;
      }
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) this.dragging = true;
      if (this.dragging && this.pointers.size === 1) this.dragView(dx, dy);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.active) return;
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (!p) return;
      if (!this.dragging && performance.now() - p.t < 600 && this.pointers.size === 0) this.tap(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.pinch = null; });
    canvas.addEventListener('wheel', (e) => { if (!this.active) return; e.preventDefault(); this.setZoom(this.r.zoom * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });
  }

  protected tap(sx: number, sy: number) {
    this.setRay(sx, sy);
    const actors: THREE.Object3D[] = [this.partner.sprite, ...this.npcs.filter((n) => n.actor.group.visible).map((n) => n.actor.sprite)];
    const hits = this.ray.intersectObjects([...actors, ...this.pickables], true);
    for (const h of hits) {
      if (h.object === this.partner.sprite) { if (this.partnerHere) { this.events.tapPartner(this.anchor(() => this.partner.head())); return; } continue; }
      const npc = h.object.userData.npc as string | undefined;
      const head = npc ? this.talkAt(npc) : null;
      if (npc && head) { this.events.tapNpc(npc, this.anchor(() => this.talkAt(npc))); return; }
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
      if (!m.geometry?.userData.shared) m.geometry?.dispose?.();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mm of mats) {
        if (mm.userData.shared) continue;
        for (const t of [(mm as THREE.MeshLambertMaterial).map, (mm as THREE.MeshLambertMaterial).emissiveMap]) if (t && !t.userData.shared) t.dispose();
        mm.dispose();
      }
    });
    this.me.dispose();
    this.partner.dispose();
    for (const n of this.npcs) n.actor.dispose();
  }
}

export { rngAt };
