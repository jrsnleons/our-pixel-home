// HomeScene ties the renderer, room, furniture, avatars and effects together, turns taps
// into walking and furniture use, runs paired interactions, and drives decorate mode.

import * as THREE from 'three';
import { mix } from '../core/color';
import { blockedTiles, canPlace, cellsOf, findFreeSpot, inFloor, key, ROOM, tileToWorld, wallLength, worldToTile, type FitResult, type Placement, type Surface, type Tile } from '../core/grid';
import { findPath, nearestFree, pathToAdjacent } from '../core/pathfinding';
import { frontOf, spotsFor, type Spot } from '../core/spots';
import { ORIGIN, STUDIO, type HomeLayout } from '../core/layout';
import { footprint, ITEM_BY_KEY, type Action } from '../data/catalog';
import { INTERACTION_BY_ID } from '../data/interactions';
import { THEMES, type Theme, type ThemeKey } from '../data/themes';
import { Actor, facingTowards, type Facing } from './actor';
import type { AvatarLook } from './art/avatar';
import { artKey, itemArt, keepTheme } from './art/bake';
import type { ItemArt } from './art/furniture';
import { dispose } from './art/kit';
import type { WallArt, WallContext } from './art/wall';
import { daylight, type Daylight } from './daylight';
import type { ScreenPoint } from './area';
import { Effects, type FxKind } from './fx';
import { Renderer } from './renderer';
import { RoomShell, type RoomStyle } from './room';

export type { ScreenPoint };

export interface SceneEvents {
  tapFurniture(p: Placement, at: ScreenPoint): void;
  tapPartner(at: ScreenPoint): void;
  tapMe(at: ScreenPoint): void;
  tapEmpty(): void;
  /** You walked up to the front door (and tapped it): step out into town. */
  tapDoor(): void;
  /** My avatar started walking; broadcast so the partner sees it. */
  walked(from: Tile, path: Tile[]): void;
  settled(state: SettleState | null): void;
  /** Decorate mode: a placed item or empty spot was tapped. */
  decorTap(p: Placement | null): void;
  placingChanged(state: PlacingState | null): void;
}

export interface SettleState { tile: Tile; world: { x: number; z: number }; facing: Facing; height: number; pose: 'sit' | 'lie' | 'stand'; lieRot?: number; placementId?: string }

export interface PlacingState { item: string; placementId?: string; surface: Surface; x: number; y: number; rot: number; fit: FitResult }

export interface InteractionPlay {
  id: string;
  /** Final arrangement, so the other phone can reproduce it exactly. */
  a: SettleState;
  b: SettleState;
}

interface Inst { p: Placement; root: THREE.Group; art: ItemArt | WallArt; wall: boolean; pending?: boolean; pop?: number; leaving?: number; mats?: THREE.Material[]; painted?: string }

type Timer = { at: number; fn: () => void };

const SIT_ANIM = { frames: ['sit'], fps: 1 };
const LIE_ANIM = { frames: ['lie'], fps: 1 };

/** What decides which shader a material needs (roughly what three.js keys its programs on). */
function variantOf(m: THREE.Material, ghost: boolean): string {
  const x = m as THREE.MeshLambertMaterial;
  return [m.type, !!x.map, x.alphaTest > 0, m.side, m.vertexColors, !!x.emissiveMap, ghost || m.transparent, m.toneMapped].join('|');
}

function materialsOf(o: THREE.Object3D): THREE.Material[] {
  const out: THREE.Material[] = [];
  o.traverse((n) => { const m = (n as THREE.Mesh).material; if (m) out.push(...(Array.isArray(m) ? m : [m])); });
  return out;
}

export class HomeScene {
  readonly r: Renderer;
  private room!: RoomShell;
  readonly fx = new Effects();
  private items = new Map<string, Inst>();
  private placements: Placement[] = [];
  me!: Actor;
  partner!: Actor;
  private theme: Theme;
  private style: RoomStyle;
  private day!: Daylight;
  private lights: THREE.PointLight[] = [];
  private lampOverride = new Map<string, boolean>();
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private timers: Timer[] = [];
  private clock = 0;
  private partnerOnline = false;
  private zzzT = 0;
  private wallCtx: WallContext = {};
  private photoCache = new Map<string, HTMLImageElement>();
  private dayTimer = 0;
  private wallTimer = 0;
  private interacting = false;
  /** Decorate mode */
  decorating = false;
  private L: HomeLayout;
  private gridFloor!: THREE.InstancedMesh;
  private gridWalls!: { back: THREE.InstancedMesh; left: THREE.InstancedMesh };
  private placing: (PlacingState & { ghost: THREE.Group; art: ItemArt | WallArt; data?: Record<string, unknown> | null }) | null = null;
  private selected: string | null = null;
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private pinchStart = 0;
  private zoomStart = 1;
  private dragging = false;
  /** False while another scene (the town, a shop) is on screen. */
  private live = true;
  private overview = false;
  private camFit = 10.6;

  constructor(canvas: HTMLCanvasElement, themeKey: ThemeKey, style: RoomStyle, looks: { me: AvatarLook; partner: AvatarLook }, readonly events: SceneEvents, layout: HomeLayout = STUDIO) {
    this.r = new Renderer(canvas);
    this.L = layout;
    this.theme = THEMES[themeKey];
    this.style = style;
    this.r.scene.add(this.fx.group);
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight('#FFC070', 0, 7, 2);
      this.lights.push(l);
      this.r.scene.add(l);
    }
    this.buildGrids();
    this.buildRoom();
    this.me = new Actor(looks.me, { x: 3, y: 4 }, true);
    this.partner = new Actor(looks.partner, { x: 4, y: 4 }, false);
    this.r.scene.add(this.me.group, this.partner.group);
    this.bindInput(canvas);
  }

  // ---------- Theme & room ----------

  private buildRoom() {
    if (this.room) { this.r.scene.remove(this.room.group); this.room.dispose(); }
    this.room = new RoomShell(this.theme, this.style, this.L);
    this.r.scene.add(this.room.group);
    this.r.setShadowLight(this.room.sun);
    const m = this.theme.mood;
    this.r.setMood(m.bloom, m.grade, m.gradeAmount, m.backdrop);
    for (const l of this.lights) l.color.set(m.lamp);
    this.applyDaylight(true);
  }

  setTheme(k: ThemeKey) {
    if (this.theme.key === k) return;
    this.theme = THEMES[k];
    this.buildRoom();
    const all = this.placements;
    for (const id of [...this.items.keys()]) this.removeInst(id);
    this.placements = [];
    this.sync(all);
    keepTheme(k);
  }

  /** The home grew (or shrank): rebuild the shell and the decorate grids, then put everything back. */
  setLayout(L: HomeLayout) {
    if (L === this.L) return;
    this.L = L;
    this.buildRoom();
    this.buildGrids();
    const all = this.placements;
    for (const id of [...this.items.keys()]) this.removeInst(id);
    this.placements = [];
    this.sync(all);
    this.applyView(true);
  }

  get layout(): HomeLayout { return this.L; }
  get themeKey(): ThemeKey { return this.theme.key; }

  /** Anything bigger than the studio is too wide for the screen: the camera follows you instead. */
  private get big() { return this.L.w * this.L.d > STUDIO.w * STUDIO.d; }

  get wholeHome() { return this.big && (this.overview || this.decorating); }

  /** Pull back to see the whole home (decorating does this on its own). */
  setOverview(on: boolean) {
    this.overview = on;
    this.applyView();
  }

  private overviewFit() { return Math.max(10.6, (this.L.w + this.L.d) * 0.757 + 1.6); }

  private applyView(snap = false) {
    const fit = this.wholeHome ? this.overviewFit() : 10.6;
    if (fit !== this.camFit) { this.camFit = fit; this.r.setView(0.66, fit); }
    if (!this.big) { this.r.target.set(0, 1.05, 0.25); return; }
    if (snap) this.followCam(1);
  }

  /** Ease the camera toward whoever you are playing as, kept inside the home. */
  private followCam(k: number) {
    const L = this.L;
    const HALF = ORIGIN.w / 2;
    let tx = -HALF + L.w / 2, tz = -HALF + L.d / 2;
    if (!this.wholeHome) {
      const m = 3.2;
      const lo = (n: number) => -HALF + Math.min(m, n / 2), hi = (n: number) => -HALF + Math.max(n - m, n / 2);
      tx = Math.max(lo(L.w), Math.min(hi(L.w), this.me.pos.x));
      tz = Math.max(lo(L.d), Math.min(hi(L.d), this.me.pos.z));
    }
    const t = this.r.target;
    t.x += (tx - t.x) * k;
    t.z += (tz + 0.25 - t.z) * k;
    t.y = 1.05;
  }

  /** Repaint walls and floors, only when the style actually changed (every data update calls this). */
  setStyle(style: RoomStyle) {
    if (JSON.stringify(style) === JSON.stringify(this.style)) return;
    this.style = style;
    this.room.setStyle(style);
  }

  setLooks(me: AvatarLook, partner: AvatarLook) {
    if (JSON.stringify(me) !== JSON.stringify(this.me.look)) this.me.setLook(me);
    if (JSON.stringify(partner) !== JSON.stringify(this.partner.look)) this.partner.setLook(partner);
  }

  /** Pin the clock to an hour (previews and the time-of-day picker); null follows real time. */
  hourOverride: number | null = null;

  setHour(h: number | null) { this.hourOverride = h; this.applyDaylight(true); }

  private applyDaylight(force = false) {
    const now = new Date();
    if (this.hourOverride != null) now.setHours(Math.floor(this.hourOverride), Math.round((this.hourOverride % 1) * 60), 0, 0);
    const d = daylight(now, this.theme);
    if (!force && this.day && Math.abs(d.hour - this.day.hour) < 0.05) return;
    this.day = d;
    this.room.applyDaylight(d);
    this.refreshLights();
  }

  get daylightNow() { return this.day; }

  // ---------- Furniture ----------

  /** Bring the room in line with `placements` (adds, removes and moves instances). */
  sync(placements: Placement[]) {
    const next = new Map(placements.map((p) => [p.id, p]));
    // A piece placed a moment ago under a temporary id: when the server's copy arrives (same
    // item in the same spot, new id), keep the instance and just take the new id, instead of
    // throwing it away and building it again.
    for (const [id, inst] of [...this.items]) {
      if (!inst.pending || next.has(id)) continue;
      const real = placements.find((p) => !this.items.has(p.id) && p.item === inst.p.item && p.surface === inst.p.surface && p.x === inst.p.x && p.y === inst.p.y && p.rot === inst.p.rot);
      if (real) this.rekey(id, real.id);
    }
    for (const id of [...this.items.keys()]) if (!next.has(id)) { const inst = this.items.get(id)!; if (inst.pending) continue; this.removeInst(id); }
    for (const p of placements) {
      const cur = this.items.get(p.id);
      if (!cur) this.addInst(p);
      else if (artKey(cur.p.item, '', cur.p.data) !== artKey(p.item, '', p.data)) { this.removeInst(p.id); this.addInst(p); }
      else if (cur.p.x !== p.x || cur.p.y !== p.y || cur.p.rot !== p.rot || cur.p.surface !== p.surface) { cur.p = p; this.positionInst(cur); }
      else cur.p = p;
    }
    this.placements = placements.slice();
    this.refreshLights();
    this.refreshWalls();
    // Nobody should end up standing inside furniture.
    const blocked = blockedTiles(this.placements);
    for (const a of [this.me, this.partner]) {
      if (a.elevation > 0.01 || a.lying) continue;
      if (blocked.has(key(a.tile.x, a.tile.y))) { const t = nearestFree(a.tile, blocked, this.L); if (t) a.place(t); }
    }
  }

  private addInst(p: Placement) {
    const def = ITEM_BY_KEY[p.item];
    if (!def) return;
    const wall = def.kind === 'wall-item';
    const art = itemArt(p.item, this.theme, p.data);
    const root = new THREE.Group();
    root.add(art.group);
    root.userData.placementId = p.id;
    art.group.traverse((o) => { o.userData.placementId = p.id; });
    const inst: Inst = { p, root, art, wall };
    this.items.set(p.id, inst);
    this.positionInst(inst);
    this.r.scene.add(root);
    if (wall) this.refreshWall(inst);
  }

  private rekey(from: string, to: string) {
    const inst = this.items.get(from);
    if (!inst) return;
    this.items.delete(from);
    inst.p = { ...inst.p, id: to };
    inst.root.userData.placementId = to;
    inst.root.traverse((o) => { o.userData.placementId = to; });
    this.setPending(inst, false);
    this.items.set(to, inst);
    if (this.selected === from) this.selected = to;
  }

  /** While the server hasn't confirmed a placement, the piece breathes softly. */
  private setPending(inst: Inst, on: boolean) {
    inst.pending = on;
    inst.root.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) {
        if (on) { mm.userData.prev ??= { transparent: mm.transparent, opacity: mm.opacity }; mm.transparent = true; }
        else if (mm.userData.prev) { mm.transparent = mm.userData.prev.transparent; mm.opacity = mm.userData.prev.opacity; delete mm.userData.prev; mm.needsUpdate = true; }
      }
    });
  }

  /** Take a piece out of the room now (optimistically), shrinking it away with a puff. */
  removeNow(id: string) {
    const inst = this.items.get(id);
    if (!inst) return;
    const c = new THREE.Box3().setFromObject(inst.root).getCenter(new THREE.Vector3());
    this.fx.spawn('sparkle', c, { count: 5, spread: 0.45, life: 0.6, rise: 0.5, size: 0.3 });
    this.items.delete(id);
    this.placements = this.placements.filter((p) => p.id !== id);
    inst.leaving = 0;
    this.leaving.push(inst);
    if (this.selected === id) this.selected = null;
    this.paintGrid();
  }
  private leaving: Inst[] = [];

  /** The server refused a placement: take the waiting piece back out. */
  dropPending(id: string) {
    const inst = this.items.get(id);
    if (inst?.pending) { this.removeInst(id); this.placements = this.placements.filter((p) => p.id !== id); this.paintGrid(); }
  }

  private removeInst(id: string) {
    const inst = this.items.get(id);
    if (!inst) return;
    this.r.scene.remove(inst.root);
    dispose(inst.root);
    this.items.delete(id);
  }

  private positionInst(inst: Inst) {
    const { p } = inst;
    const def = ITEM_BY_KEY[p.item]!;
    const g = inst.art.group;
    if (inst.wall) {
      const [w] = def.size ?? [1, 1];
      g.position.set(0, 0, 0);
      if (p.surface === 'back') {
        inst.root.rotation.set(0, 0, 0);
        inst.root.position.set(-ORIGIN.w / 2 + p.x, ROOM.wainscot + p.y, -ORIGIN.d / 2 + 0.01);
      } else {
        inst.root.rotation.set(0, Math.PI / 2, 0);
        inst.root.position.set(-ORIGIN.w / 2 + 0.01, ROOM.wainscot + p.y, -ORIGIN.d / 2 + p.x + w);
      }
      return;
    }
    const [w, d] = def.size ?? [1, 1];
    const [W, D] = footprint(def, p.rot);
    g.position.set(-w / 2, 0, -d / 2);
    inst.root.rotation.set(0, (p.rot * Math.PI) / 2, 0);
    inst.root.position.set(-ORIGIN.w / 2 + p.x + W / 2, 0, -ORIGIN.d / 2 + p.y + D / 2);
    // Billboards inside rotated furniture still face the camera.
    g.traverse((o) => { if (o.userData.billboard) o.rotation.y = -(p.rot * Math.PI) / 2 + Math.atan2(0.62, 0.78); });
  }

  /** Lamps: the strongest three get real point lights, the rest only glow. */
  private refreshLights() {
    const lamps = [...this.items.values()].filter((i) => !i.wall && (i.art as ItemArt).light && ITEM_BY_KEY[i.p.item]?.light);
    lamps.sort((a, b) => (ITEM_BY_KEY[b.p.item]!.light ?? 0) - (ITEM_BY_KEY[a.p.item]!.light ?? 0));
    const autoOn = this.day?.lampsOn ?? true;
    this.lights.forEach((l, i) => {
      const inst = lamps[i];
      if (!inst) { l.intensity = 0; l.userData.base = 0; return; }
      const on = this.lampOverride.get(inst.p.id) ?? autoOn;
      const art = inst.art as ItemArt;
      const pos = art.light!.pos.clone();
      inst.root.updateMatrixWorld(true);
      art.group.localToWorld(pos);
      l.position.copy(pos);
      l.color.set(mix(this.theme.mood.lamp, art.light!.color, 0.4));
      l.userData.base = on ? (ITEM_BY_KEY[inst.p.item]!.light ?? 3) * (this.theme.mood.lampPower / 5) : 0;
    });
    for (const inst of this.items.values()) {
      const glow = inst.art.glow;
      if (!glow) continue;
      const def = ITEM_BY_KEY[inst.p.item]!;
      const on = def.category === 'lighting' || def.key === 'candles' ? (this.lampOverride.get(inst.p.id) ?? autoOn) : true;
      for (const m of glow) {
        // Shades stay visible when off; they just stop glowing. Bare bulbs go dull.
        const mat = m.material as THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;
        if (mat instanceof THREE.MeshBasicMaterial) {
          m.userData.onColor ??= mat.color.clone();
          mat.color.copy(on ? m.userData.onColor : new THREE.Color('#9A9080'));
        } else if (mat.emissiveMap) mat.emissiveIntensity = on ? 0.75 : 0.05;
      }
    }
  }

  isLampOn(id: string) { return this.lampOverride.get(id) ?? this.day?.lampsOn ?? true; }
  toggleLamp(id: string) { this.lampOverride.set(id, !this.isLampOn(id)); this.refreshLights(); }

  setWallContext(ctx: WallContext) {
    const next = { ...this.wallCtx, ...ctx };
    if (JSON.stringify(next) === JSON.stringify(this.wallCtx)) return;
    this.wallCtx = next;
    this.refreshWalls();
  }

  /** Photos for frames, keyed by placement id. */
  setPhoto(placementId: string, img: HTMLImageElement | null) {
    if (img) this.photoCache.set(placementId, img); else this.photoCache.delete(placementId);
    const inst = this.items.get(placementId);
    if (inst) this.refreshWall(inst);
  }

  /** `clocks` also repaints the pieces showing the time or date, which change by themselves. */
  private refreshWalls(clocks = false) { for (const i of this.items.values()) if (i.wall) this.refreshWall(i, clocks && !!(i.art as WallArt).clock); }

  private photoIds = new WeakMap<object, number>();
  private photoN = 0;
  private refreshWall(inst: Inst, force = false) {
    const art = inst.art as WallArt;
    if (!art.refresh) return;
    const data = inst.p.data ?? {};
    const photo = this.photoCache.get(inst.p.id) ?? null;
    const ctx: WallContext = { ...this.wallCtx, photo, pixelate: Boolean(data.pixelate), verse: (data.verse as WallContext['verse']) ?? this.wallCtx.verse };
    // Repainting uploads a new texture, so skip it when the picture would come out the same.
    if (photo && !this.photoIds.has(photo)) this.photoIds.set(photo, ++this.photoN);
    const sig = JSON.stringify({ ...ctx, photo: photo ? this.photoIds.get(photo) : null });
    if (!force && sig === inst.painted) return;
    inst.painted = sig;
    art.refresh(ctx);
  }

  // ---------- Avatars ----------

  placeActors(me: Tile, partner: Tile) {
    const blocked = blockedTiles(this.placements);
    this.me.place(blocked.has(key(me.x, me.y)) ? nearestFree(me, blocked, this.L) ?? me : me);
    this.partner.place(blocked.has(key(partner.x, partner.y)) ? nearestFree(partner, blocked, this.L) ?? partner : partner);
  }

  /** Where someone sleeps: the best bed in the room, or the floor by the door. */
  private bedSpot(which: 0 | 1): Spot | null {
    const beds = this.placements.filter((p) => ITEM_BY_KEY[p.item]?.category === 'bed').sort((a, b) => (ITEM_BY_KEY[b.item]!.tier ?? 0) - (ITEM_BY_KEY[a.item]!.tier ?? 0));
    for (const b of beds) {
      const spots = spotsFor(b, 'sleep', this.placements, this.L);
      if (spots.length) return spots[Math.min(which, spots.length - 1)];
    }
    return null;
  }

  private blanketColor(): string {
    const bed = this.placements.find((p) => ITEM_BY_KEY[p.item]?.category === 'bed');
    return bed ? this.theme.blanket : this.theme.blanket;
  }

  setPartnerOnline(online: boolean, opts: { wake?: boolean } = {}) {
    const was = this.partnerOnline;
    this.partnerOnline = online;
    if (!online) this.sleep(this.partner, 1);
    else if (!was && opts.wake) this.wake(this.partner);
  }

  sleep(a: Actor, which: 0 | 1) {
    const s = this.bedSpot(which);
    if (s) a.settle(new THREE.Vector3(s.world.x, 0, s.world.z), s.facing, { lying: true, height: s.height, pose: LIE_ANIM, cover: this.blanketColor() });
    else a.settle(new THREE.Vector3(-2.9, 0, 1.5), '+x', { lying: true, height: 0.02, pose: LIE_ANIM, cover: this.blanketColor() });
    a.lieRot = s?.lieRot ?? 1;
  }

  /** Get out of bed and stretch. */
  wake(a: Actor) {
    const blocked = blockedTiles(this.placements);
    const t = nearestFree(worldToTile(a.pos.x, a.pos.z), blocked, this.L) ?? a.tile;
    a.stand();
    a.place(t);
    a.play({ frames: ['cheer', 'cheer', 'idle2', 'idle'], fps: 2, loop: false });
    this.after(2, () => a.play(null));
  }

  get partnerIsOnline() { return this.partnerOnline; }

  /** Apply a remote walk. */
  remoteWalk(from: Tile, path: Tile[]) {
    if (this.interacting) return;
    const p = this.partner;
    if (p.lying || p.elevation > 0.01) p.stand();
    if (Math.abs(p.tile.x - from.x) + Math.abs(p.tile.y - from.y) > 1) p.place(from);
    p.walk(path);
  }

  remoteSettle(s: SettleState | null) {
    const p = this.partner;
    if (!s) { p.stand(); return; }
    this.applySettle(p, s);
  }

  /** Where my avatar is now, as the partner's phone needs it. */
  mySettleState(settled: SettleState | null): SettleState {
    return settled ?? this.settleOf(this.me);
  }

  /** Put someone back where they were when the app was last open, if that spot still exists. */
  restoreSettle(who: 'me' | 'partner', s: SettleState): boolean {
    if (s.pose !== 'stand' && !(s.placementId && this.placements.some((p) => p.id === s.placementId))) return false;
    this.applySettle(who === 'me' ? this.me : this.partner, s);
    return true;
  }

  private applySettle(a: Actor, s: SettleState) {
    a.tile = { ...s.tile };
    if (s.pose === 'stand') { a.stand(); a.place(s.tile); a.pos.set(s.world.x, 0, s.world.z); a.facing = s.facing; return; }
    a.settle(new THREE.Vector3(s.world.x, 0, s.world.z), s.facing, { lying: s.pose === 'lie', height: s.height, pose: s.pose === 'lie' ? LIE_ANIM : SIT_ANIM, cover: this.blanketColor() });
    a.lieRot = s.lieRot ?? 0;
  }

  private settleOf(a: Actor, s?: Spot, placementId?: string): SettleState {
    if (s) return { tile: s.approach, world: s.world, facing: s.facing, height: s.height, pose: s.pose, lieRot: s.lieRot, placementId };
    return { tile: a.tile, world: { x: a.pos.x, z: a.pos.z }, facing: a.facing, height: 0, pose: 'stand' };
  }

  /** Walk my avatar to a tile (or next to it if blocked). */
  walkMeTo(t: Tile, then?: () => void): boolean {
    const me = this.me;
    const blocked = blockedTiles(this.placements);
    if (me.lying || me.elevation > 0.01) { me.stand(); this.events.settled(null); }
    const start = blocked.has(key(me.tile.x, me.tile.y)) ? nearestFree(me.tile, blocked, this.L) ?? me.tile : me.tile;
    if (start !== me.tile) me.place(start);
    const path = blocked.has(key(t.x, t.y)) ? pathToAdjacent(start, [t], blocked, undefined, this.L) : findPath(start, t, blocked, this.L);
    if (!path) return false;
    me.walk(path, then);
    this.events.walked(start, path);
    return true;
  }

  /** Use a piece of furniture: walk over, then sit, sleep or stand facing it. Resolves when in place. */
  useFurniture(p: Placement, action: Action): Promise<boolean> {
    return new Promise((resolve) => {
      const spots = spotsFor(p, action, this.placements, this.L);
      const partnerTile = this.partner.tile;
      const spot = spots.find((s) => !(s.approach.x === partnerTile.x && s.approach.y === partnerTile.y && this.partner.elevation > 0.01)) ?? spots[0];
      if (!spot) { resolve(false); return; }
      const ok = this.walkMeTo(spot.approach, () => {
        if (spot.pose === 'stand') { this.me.facing = spot.facing; this.events.settled(null); resolve(true); return; }
        const st = this.settleOf(this.me, spot, p.id);
        this.applySettle(this.me, st);
        this.events.settled(st);
        resolve(true);
      });
      if (!ok) resolve(false);
    });
  }

  /** Both avatars use a table or seat together (games, sit together). */
  bothUse(p: Placement, action: Action, partnerToo: boolean): Promise<{ a: SettleState; b: SettleState } | null> {
    return new Promise((resolve) => {
      const spots = spotsFor(p, action, this.placements, this.L);
      if (spots.length < (partnerToo ? 2 : 1)) { resolve(null); return; }
      const [sa, sb] = spots;
      const ok = this.walkMeTo(sa.approach, () => {
        const a = this.settleOf(this.me, sa, p.id);
        this.applySettle(this.me, a);
        this.events.settled(a);
        const b = this.settleOf(this.partner, sb, p.id);
        // A partner who's asleep already is tucked into the same bed.
        if (partnerToo && (this.partnerOnline || action === 'sleep')) this.applySettle(this.partner, b);
        resolve({ a, b });
      });
      if (!ok) resolve(null);
    });
  }

  // ---------- Interactions ----------

  private after(sec: number, fn: () => void) { this.timers.push({ at: this.clock + sec, fn }); }

  /** Start an interaction from my side: arrange, then play. Returns the arrangement to broadcast. */
  async startInteraction(id: string, at?: Placement): Promise<InteractionPlay | null> {
    const def = INTERACTION_BY_ID[id];
    if (!def || this.interacting) return null;
    const me = this.me, other = this.partner;
    const blocked = blockedTiles(this.placements);
    const otherAsleep = !this.partnerOnline;
    let a: SettleState, b: SettleState;

    if (def.arrange === 'seat' || def.arrange === 'bed') {
      const action: Action = def.arrange === 'bed' ? 'sleep' : 'sit';
      const allowed = def.needs?.items ?? [];
      const roomy = (p: Placement) => allowed.includes(p.item) && spotsFor(p, action, this.placements, this.L).length >= 2;
      // The bed or sofa I tapped, if it's the right kind; otherwise the best one in the room.
      const seat = at && roomy(at) ? at : [...this.placements].sort((a, b) => (ITEM_BY_KEY[b.item]?.tier ?? 0) - (ITEM_BY_KEY[a.item]?.tier ?? 0)).find(roomy);
      if (!seat) return null;
      const res = await this.bothUse(seat, action, true);
      if (!res) return null;
      a = res.a; b = res.b;
    } else if (def.arrange === 'none') {
      if (me.lying || me.elevation > 0) { me.stand(); }
      me.facing = facingTowards(me.pos, other.pos);
      a = this.settleOf(me);
      b = this.settleOf(other);
    } else {
      // Walk up next to them. "side" prefers standing left/right of them so both face the camera.
      const target = otherAsleep ? worldToTile(other.pos.x, other.pos.z) : other.tile;
      const prefer = (t: Tile) => def.arrange === 'side' ? (t.y === target.y ? 0 : 3) : def.arrange === 'behind' ? (t.y < target.y || t.x < target.x ? 0 : 2) : 0;
      if (me.lying || me.elevation > 0.01) me.stand();
      const adjacent = Math.abs(me.tile.x - target.x) + Math.abs(me.tile.y - target.y) === 1 && prefer(me.tile) === 0;
      if (!adjacent) {
        const path = pathToAdjacent(me.tile, [target], blocked, prefer, this.L);
        if (!path) return null;
        const arrived = new Promise<void>((res) => me.walk(path, res));
        this.events.walked(me.tile, path);
        await arrived;
      }
      if (!otherAsleep && (other.lying || other.elevation > 0.01)) { other.stand(); other.place(target); }
      a = this.settleOf(me);
      b = this.settleOf(other);
      const fa = facingTowards(me.pos, other.pos);
      const fb = facingTowards(other.pos, me.pos);
      if (def.arrange === 'side') {
        a.facing = '+z'; b.facing = '+z';
        if (me.tile.x === other.tile.x) { a.facing = '+x'; b.facing = '+x'; }
      } else if (def.arrange === 'behind') {
        a.facing = fa; b.facing = fa;
      } else { a.facing = fa; b.facing = fb; }
      if (otherAsleep) b = this.settleOf(other, undefined);
    }
    const play: InteractionPlay = { id, a, b };
    this.playInteraction(play, true);
    return play;
  }

  /** Play an arranged interaction. `mine` is true when I started it. */
  playInteraction(play: InteractionPlay, mine: boolean) {
    const def = INTERACTION_BY_ID[play.id];
    if (!def) return;
    const A = mine ? this.me : this.partner;
    const Bc = mine ? this.partner : this.me;
    const asleep = mine ? !this.partnerOnline : false;
    if (!mine) { this.applySettle(A, play.a); this.applySettle(Bc, play.b); }
    else if (play.a.pose !== 'stand') this.applySettle(A, play.a);
    if (play.a.pose === 'stand') { A.facing = play.a.facing; }
    if (!asleep && play.b.pose === 'stand') { Bc.facing = play.b.facing; }
    else if (!asleep && mine && play.b.pose !== 'stand') this.applySettle(Bc, play.b);

    this.interacting = true;
    const seated = play.a.pose !== 'stand';
    A.play({ frames: seated && def.a[0] === 'sitHappy' ? ['sitHappy'] : def.a, fps: def.fps });
    if (!asleep) Bc.play({ frames: def.b, fps: def.fps });
    // Lean toward each other.
    if (def.lean && !seated) {
      const dir = new THREE.Vector3(Bc.pos.x - A.pos.x, 0, Bc.pos.z - A.pos.z).normalize();
      A.nudge(dir.clone().multiplyScalar(def.lean));
      if (!asleep) Bc.nudge(dir.clone().multiplyScalar(-def.lean));
    } else if (def.lean && seated) {
      const dir = new THREE.Vector3(Bc.pos.x - A.pos.x, 0, Bc.pos.z - A.pos.z).normalize();
      A.nudge(dir.clone().multiplyScalar(def.lean));
    }
    const seconds = def.seconds || 4;
    const between = () => A.head().add(Bc.head()).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.1, 0));
    for (const f of def.fx ?? []) {
      for (let t = 0.2; t < seconds; t += f.every) {
        this.after(t, () => {
          const spots = f.on === 'both' ? [A.head(), Bc.head()] : [f.on === 'a' ? A.head() : f.on === 'b' ? Bc.head() : between()];
          for (const s of spots) this.fx.spawn(f.kind as FxKind, s, { spread: 0.25 });
        });
      }
    }
    switch (def.special) {
      case 'hop': A.hop = 1; if (!asleep) Bc.hop = 1; break;
      case 'blow': this.after(0.5, () => this.fx.fling(A.head(), Bc.head())); this.after(1.4, () => this.fx.spawn('heart', Bc.head(), { count: 2 })); break;
      case 'twirl': {
        const order: Facing[] = ['+z', '+x', '-z', '-x'];
        for (let i = 0; i < 10; i++) this.after(i * 0.15, () => { Bc.facing = order[i % 4]; });
        this.after(1.6, () => { Bc.facing = facingTowards(Bc.pos, A.pos); });
        break;
      }
      case 'umbrella': this.fx.spawn('umbrella', between().add(new THREE.Vector3(0, 0.55, 0)), { life: seconds, rise: 0, spread: 0, follow: () => between().add(new THREE.Vector3(0, 0.55, 0)) }); break;
      case 'piggyback': {
        Bc.nudge(new THREE.Vector3(A.pos.x - Bc.pos.x, 0.5, A.pos.z - Bc.pos.z).add(new THREE.Vector3(-0.08, 0, -0.08)));
        Bc.facing = A.facing;
        break;
      }
      case 'carry': {
        Bc.nudge(new THREE.Vector3((A.pos.x - Bc.pos.x) * 0.75, 0.45, (A.pos.z - Bc.pos.z) * 0.75));
        Bc.tilt = A.facing === '+x' || A.facing === '-z' ? -1.25 : 1.25;
        break;
      }
      case 'chase': if (mine) this.chase(seconds); break;
    }
    if (def.seconds > 0) {
      this.after(seconds, () => {
        A.play(null); Bc.play(null);
        A.nudge(new THREE.Vector3()); Bc.nudge(new THREE.Vector3());
        Bc.tilt = 0;
        this.interacting = false;
        if (asleep) this.sleep(this.partner, 1);
      });
    } else this.interacting = false;
  }

  private chase(seconds: number) {
    // The partner's avatar darts to random free tiles while mine follows, then a hug.
    const blocked = blockedTiles(this.placements);
    const free: Tile[] = [];
    for (let y = 0; y < this.L.d; y++) for (let x = 0; x < this.L.w; x++) if (inFloor({ x, y }, this.L) && !blocked.has(key(x, y))) free.push({ x, y });
    const run = (i: number) => {
      if (i >= 3) return;
      const goal = free[(Math.random() * free.length) | 0];
      const pp = findPath(this.partner.tile, goal, blocked, this.L);
      if (pp) { this.partner.speed = 3.6; this.partner.walk(pp); }
      this.after(0.4, () => { const mp = pathToAdjacent(this.me.tile, [goal], blocked, undefined, this.L); if (mp) { this.me.speed = 3.4; this.me.walk(mp); this.events.walked(this.me.tile, mp); } });
      this.after(seconds / 3, () => run(i + 1));
    };
    run(0);
    this.after(seconds + 0.2, () => { this.me.speed = 2.4; this.partner.speed = 2.4; });
  }

  get busy() { return this.interacting; }

  // ---------- Getting ready ahead of time ----------

  private warmed = new Set<string>();
  private variants = new Set<string>();
  /** Materials kept alive only so their compiled shaders stay cached. */
  private warmKeep: THREE.Material[] = [];

  /** True once every one of these pieces is built and its shaders compiled. */
  isWarm(items: string[]) { return items.every((k) => this.warmed.has(`${this.theme.key}|${k}`)); }

  /**
   * Build these pieces and compile every shader they (and decorate mode) will need, a few at a
   * time, so the first sofa you pick up, the ghost you drag and the grid never stall the phone
   * while its GPU compiles. `urgent` works through them every frame (behind a loading screen);
   * otherwise only while the phone is idle.
   */
  async warm(items: string[], urgent = false) {
    const idle = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const slice = () => new Promise<void>((res) => (urgent || !idle ? requestAnimationFrame(() => res()) : idle(() => res(), { timeout: 1500 })));
    const plane = new THREE.PlaneGeometry(0.1, 0.1);
    const queue = [...new Set(items)].filter((k) => ITEM_BY_KEY[k]);
    // The decorate grid and the scene as it stands, first.
    const compile = async (o: THREE.Object3D) => { try { await this.r.compile(o, this.r.scene); } catch { /* compiles on first draw instead */ } };
    if (!this.variants.has('scene')) { this.variants.add('scene'); await compile(this.r.scene); }
    while (queue.length) {
      await slice();
      const theme = this.theme.key;
      const batch = new THREE.Group();
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 8) {
        const k = queue.shift()!;
        const id = `${theme}|${k}`;
        if (this.warmed.has(id)) continue;
        this.warmed.add(id);
        const art = itemArt(k, this.theme);
        art.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            // As it sits in the room, and as a see-through ghost while it's carried or saving.
            for (const ghost of [false, true]) {
              const v = `${variantOf(mat, ghost)}|${m.receiveShadow}`;
              if (this.variants.has(v)) continue;
              this.variants.add(v);
              const c = mat.clone();
              if (ghost) { c.transparent = true; c.opacity = 0.72; }
              this.warmKeep.push(c);
              const stand = new THREE.Mesh(plane, c);
              stand.receiveShadow = m.receiveShadow;
              batch.add(stand);
            }
          }
        });
        dispose(art.group);
      }
      if (batch.children.length) await compile(batch);
    }
  }

  // ---------- Decorate mode ----------

  private makeGrid(n: number): THREE.InstancedMesh {
    // Cell outlines with a faint fill, so the grid reads as guides, not as a new floor.
    const geo = new THREE.PlaneGeometry(0.96, 0.96);
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, 0, 16, 16);
    g.clearRect(1, 1, 14, 14);
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(1, 1, 14, 14);
    g.fillStyle = 'rgba(255,255,255,.6)'; for (const [x, y] of [[0, 0], [15, 0], [0, 15], [15, 15]]) g.fillRect(x, y, 1, 1);
    const map = new THREE.CanvasTexture(c);
    map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter;
    const mat = new THREE.MeshBasicMaterial({ map, color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false });
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    m.visible = false;
    m.renderOrder = 2;
    return m;
  }

  private buildGrids() {
    for (const m of [this.gridFloor, this.gridWalls?.back, this.gridWalls?.left]) if (m) { this.r.scene.remove(m); m.dispose(); }
    this.gridFloor = this.makeGrid(this.L.w * this.L.d);
    this.gridWalls = { back: this.makeGrid(this.L.w * ROOM.wallRows), left: this.makeGrid(this.L.d * ROOM.wallRows) };
    this.r.scene.add(this.gridFloor, this.gridWalls.back, this.gridWalls.left);
    this.layoutGrids();
  }

  private layoutGrids() {
    const L = this.L;
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const none = new THREE.Vector3(0, 0, 0);
    for (let y = 0; y < L.d; y++) for (let x = 0; x < L.w; x++) {
      const w = tileToWorld({ x, y });
      // Tiles outside every room are squashed to nothing so the grid only covers real floor.
      mat.compose(new THREE.Vector3(w.x, 0.02, w.z), q, inFloor({ x, y }, L) ? s : none);
      this.gridFloor.setMatrixAt(y * L.w + x, mat);
    }
    for (let y = 0; y < ROOM.wallRows; y++) {
      for (let x = 0; x < L.w; x++) {
        mat.compose(new THREE.Vector3(-ORIGIN.w / 2 + x + 0.5, ROOM.wainscot + y + 0.5, -ORIGIN.d / 2 + 0.03), new THREE.Quaternion(), s);
        this.gridWalls.back.setMatrixAt(y * L.w + x, mat);
      }
      for (let x = 0; x < L.d; x++) {
        mat.compose(new THREE.Vector3(-ORIGIN.w / 2 + 0.03, ROOM.wainscot + y + 0.5, -ORIGIN.d / 2 + x + 0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), s);
        this.gridWalls.left.setMatrixAt(y * L.d + x, mat);
      }
    }
    this.paintGrid();
  }

  private paintGrid() {
    const base = new THREE.Color('#FFFFFF');
    // Marked cells are pushed past 1 so the faint fill becomes a clear tint.
    const good = new THREE.Color('#5BE07A').multiplyScalar(4), bad = new THREE.Color('#FF5A5A').multiplyScalar(4), sel = new THREE.Color('#FFD25A').multiplyScalar(4);
    const color = (m: THREE.InstancedMesh, i: number, c: THREE.Color) => m.setColorAt(i, c);
    const floorTaken = blockedTiles(this.placements);
    const L = this.L;
    for (let y = 0; y < L.d; y++) for (let x = 0; x < L.w; x++) color(this.gridFloor, y * L.w + x, floorTaken.has(key(x, y)) ? base.clone().multiplyScalar(0.55) : base);
    for (const w of ['back', 'left'] as const) for (let i = 0; i < wallLength(w, L) * ROOM.wallRows; i++) color(this.gridWalls[w], i, base);
    const mark = (surface: Surface, cells: Tile[], c: THREE.Color) => {
      for (const t of cells) {
        if (surface === 'floor') { if (inFloor(t, L)) color(this.gridFloor, t.y * L.w + t.x, c); }
        else if (t.x >= 0 && t.y >= 0 && t.x < wallLength(surface, L) && t.y < ROOM.wallRows) color(this.gridWalls[surface], t.y * wallLength(surface, L) + t.x, c);
      }
    };
    if (this.selected && !this.placing) {
      const inst = this.items.get(this.selected);
      if (inst) mark(inst.p.surface, cellsOf(ITEM_BY_KEY[inst.p.item]!, inst.p), sel);
    }
    if (this.placing) {
      const def = ITEM_BY_KEY[this.placing.item]!;
      mark(this.placing.surface, cellsOf(def, this.placing), this.placing.fit.ok ? good : bad);
    }
    for (const m of [this.gridFloor, this.gridWalls.back, this.gridWalls.left]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // Wall guides only matter while a wall item is in hand or selected.
    const wallActive = (this.placing && this.placing.surface !== 'floor') || (!this.placing && this.selected && this.items.get(this.selected)?.p.surface !== 'floor');
    this.gridWalls.back.visible = this.gridWalls.left.visible = this.decorating && !!wallActive;
  }

  setDecorating(on: boolean) {
    this.decorating = on;
    this.applyView();
    if (!on) { this.cancelPlacing(); this.selected = null; }
    this.gridFloor.visible = on;
    this.paintGrid();
  }

  select(id: string | null) { this.selected = id; this.paintGrid(); }

  /** Begin placing an item (new from inventory, or moving an existing one). */
  startPlacing(item: string, opts: { placementId?: string; data?: Record<string, unknown> | null } = {}): PlacingState | null {
    this.cancelPlacing();
    const def = ITEM_BY_KEY[item];
    if (!def) return null;
    const existing = opts.placementId ? this.items.get(opts.placementId) : undefined;
    const others = this.placements.filter((p) => p.id !== opts.placementId);
    const spot = existing ? { surface: existing.p.surface, x: existing.p.x, y: existing.p.y, rot: existing.p.rot } : findFreeSpot(def, others, [this.me.tile, this.partner.tile], this.L) ?? { surface: (def.kind === 'wall-item' ? 'back' : 'floor') as Surface, x: 0, y: 0, rot: 0 };
    const art = itemArt(item, this.theme, opts.data);
    const ghost = new THREE.Group();
    ghost.add(art.group);
    art.group.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) { mm.userData.ghost ??= { transparent: mm.transparent, opacity: mm.opacity, depthWrite: mm.depthWrite }; mm.transparent = true; mm.opacity = 0.72; mm.depthWrite = true; }
    });
    if (existing) existing.root.visible = false;
    this.r.scene.add(ghost);
    this.placing = { item, placementId: opts.placementId, ...spot, fit: { ok: true }, ghost, art, data: opts.data };
    this.placingSig = '';
    this.updatePlacing();
    return this.placingState();
  }

  placingState(): PlacingState | null {
    if (!this.placing) return null;
    const { item, placementId, surface, x, y, rot, fit } = this.placing;
    return { item, placementId, surface, x, y, rot, fit };
  }

  private updatePlacing() {
    const pl = this.placing;
    if (!pl) return;
    const def = ITEM_BY_KEY[pl.item]!;
    const others = this.placements.filter((p) => p.id !== pl.placementId);
    const people = [this.me, this.partner].filter((a) => !a.lying && a.elevation < 0.01).map((a) => a.tile);
    pl.fit = canPlace(def, pl, others, { occupiedByPeople: people, layout: this.L });
    const fake: Inst = { p: { id: '__ghost', item: pl.item, surface: pl.surface, x: pl.x, y: pl.y, rot: pl.rot }, root: pl.ghost, art: pl.art, wall: def.kind === 'wall-item' };
    this.positionInst(fake);
    this.paintGrid();
    const st = this.placingState()!;
    const sig = `${st.surface}|${st.x}|${st.y}|${st.rot}|${st.fit.ok ? '' : st.fit.reason}`;
    if (sig !== this.placingSig) { this.placingSig = sig; this.events.placingChanged(st); }
  }
  private placingSig = '';

  rotatePlacing() {
    if (!this.placing || ITEM_BY_KEY[this.placing.item]?.kind === 'wall-item') return;
    this.placing.rot = (this.placing.rot + 1) % 4;
    // Keep the footprint inside the room after rotating.
    const def = ITEM_BY_KEY[this.placing.item]!;
    const [W, D] = footprint(def, this.placing.rot);
    this.placing.x = Math.min(this.placing.x, this.L.w - W);
    this.placing.y = Math.min(this.placing.y, this.L.d - D);
    this.updatePlacing();
  }

  cancelPlacing() {
    if (!this.placing) return;
    this.r.scene.remove(this.placing.ghost);
    dispose(this.placing.ghost);
    if (this.placing.placementId) { const inst = this.items.get(this.placing.placementId); if (inst) inst.root.visible = true; }
    this.placing = null;
    this.paintGrid();
    this.events.placingChanged(null);
  }

  /**
   * Finish placing; the caller persists it. A new piece stays in the room straight away under
   * `tempId` (breathing until the server confirms), so there's no wait and no second build.
   */
  takePlacing(tempId?: string): PlacingState | null {
    const s = this.placingState();
    if (!s || !s.fit.ok) return null;
    const pl = this.placing!;
    if (!s.placementId && tempId) {
      this.placing = null;
      const p: Placement = { id: tempId, item: s.item, surface: s.surface, x: s.x, y: s.y, rot: s.rot, data: pl.data ?? null };
      // The ghost becomes the piece: back to its own opacity, then pending.
      pl.ghost.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (!m) return;
        for (const mm of Array.isArray(m) ? m : [m]) { const prev = mm.userData.ghost as { transparent: boolean; opacity: number; depthWrite: boolean } | undefined; if (prev) { mm.transparent = prev.transparent; mm.opacity = prev.opacity; mm.depthWrite = prev.depthWrite; delete mm.userData.ghost; mm.needsUpdate = true; } }
        o.userData.placementId = tempId;
      });
      pl.ghost.userData.placementId = tempId;
      const inst: Inst = { p, root: pl.ghost, art: pl.art, wall: ITEM_BY_KEY[s.item]?.kind === 'wall-item', pop: 0 };
      this.items.set(tempId, inst);
      this.placements = [...this.placements, p];
      this.positionInst(inst);
      if (inst.wall) this.refreshWall(inst);
      this.setPending(inst, true);
      this.refreshLights();
      this.paintGrid();
      this.events.placingChanged(null);
      return s;
    }
    this.cancelPlacing();
    if (s.placementId) {
      // Show the move immediately (optimistic); the server confirms through sync.
      const inst = this.items.get(s.placementId);
      if (inst) { inst.p = { ...inst.p, surface: s.surface, x: s.x, y: s.y, rot: s.rot }; this.positionInst(inst); }
    }
    return s;
  }

  private dragPlacingTo(sx: number, sy: number) {
    const pl = this.placing;
    if (!pl) return;
    const was = `${pl.surface}|${pl.x}|${pl.y}`;
    const def = ITEM_BY_KEY[pl.item]!;
    this.setRay(sx, sy);
    if (def.kind === 'wall-item') {
      const [w, h] = def.size ?? [1, 1];
      const hitBack = new THREE.Vector3(), hitLeft = new THREE.Vector3();
      const okB = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), ORIGIN.d / 2), hitBack);
      const okL = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(1, 0, 0), ORIGIN.w / 2), hitLeft);
      const onBack = okB && hitBack.x >= -ORIGIN.w / 2 - 0.2 && hitBack.x <= -ORIGIN.w / 2 + this.L.w;
      const useLeft = okL && (!onBack || hitLeft.z > -ORIGIN.d / 2 + 0.2) && hitLeft.z <= -ORIGIN.d / 2 + this.L.d && hitBack.x < -ORIGIN.w / 2 + 0.6;
      if (useLeft) {
        pl.surface = 'left';
        pl.x = Math.round(hitLeft.z + ORIGIN.d / 2 - w / 2);
        pl.y = Math.round(hitLeft.y - ROOM.wainscot - h / 2);
        // On the left wall the item's x runs toward the back corner; flip so it follows the finger.
        pl.x = Math.max(0, Math.min(this.L.d - w, pl.x));
      } else if (onBack) {
        pl.surface = 'back';
        pl.x = Math.max(0, Math.min(this.L.w - w, Math.round(hitBack.x + ORIGIN.w / 2 - w / 2)));
        pl.y = Math.round(hitBack.y - ROOM.wainscot - h / 2);
      }
      pl.y = Math.max(0, Math.min(ROOM.wallRows - h, pl.y));
    } else {
      const hit = new THREE.Vector3();
      if (!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return;
      const [W, D] = footprint(def, pl.rot);
      pl.x = Math.max(0, Math.min(this.L.w - W, Math.round(hit.x + ORIGIN.w / 2 - W / 2)));
      pl.y = Math.max(0, Math.min(this.L.d - D, Math.round(hit.z + ORIGIN.d / 2 - D / 2)));
    }
    // A finger moves many times per tile; only a new tile needs a new fit check and grid.
    if (`${pl.surface}|${pl.x}|${pl.y}` !== was) this.updatePlacing();
  }

  // ---------- Input ----------

  private setRay(sx: number, sy: number) {
    const rect = this.r.canvas.getBoundingClientRect();
    this.ndc.set(((sx - rect.left) / rect.width) * 2 - 1, -((sy - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.r.camera);
  }

  private bindInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.live) return;
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomStart = this.r.zoom;
      }
      this.dragging = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.live) return;
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.setZoom(this.zoomStart * (d / Math.max(1, this.pinchStart)));
        this.panBy(dx / 2, dy / 2);
        return;
      }
      const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
      if (moved > 8) this.dragging = true;
      if (this.placing && this.dragging) this.dragPlacingTo(e.clientX, e.clientY);
      else if (this.dragging && this.r.zoom > 1.02) this.panBy(dx, dy);
    });
    const end = (e: PointerEvent) => {
      if (!this.live) return;
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (!p) return;
      const quick = performance.now() - p.t < 600;
      if (!this.dragging && quick && this.pointers.size === 0) this.tap(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.setZoom(this.r.zoom * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });
  }

  setZoom(z: number) {
    this.r.zoom = Math.max(1, Math.min(2.6, z));
    if (this.r.zoom <= 1.01) this.r.pan.set(0, 0);
  }

  private panBy(dx: number, dy: number) {
    const k = 0.012 / this.r.zoom;
    const lim = (this.r.zoom - 1) * 3.2 * (this.wholeHome ? 1.8 : 1);
    this.r.pan.x = Math.max(-lim, Math.min(lim, this.r.pan.x - dx * k));
    this.r.pan.y = Math.max(-lim, Math.min(lim, this.r.pan.y + dy * k));
  }

  private screenOf(v: THREE.Vector3): ScreenPoint {
    const rect = this.r.canvas.getBoundingClientRect();
    const p = this.r.project(v);
    return { x: p.x + rect.left, y: p.y + rect.top };
  }

  /** Like screenOf, but the point keeps following `get()` as people walk and the camera moves. */
  private anchor(get: () => THREE.Vector3): ScreenPoint {
    return { ...this.screenOf(get()), track: () => this.screenOf(get()) };
  }

  private tap(sx: number, sy: number) {
    this.setRay(sx, sy);
    if (this.placing) { this.dragPlacingTo(sx, sy); return; }
    const targets: THREE.Object3D[] = [this.me.sprite, this.partner.sprite];
    for (const i of this.items.values()) targets.push(i.root);
    const hits = this.ray.intersectObjects(targets, true);
    for (const h of hits) {
      const actor = h.object.userData.actor as Actor | undefined;
      if (actor && !this.decorating) {
        // Sprites are rectangles: ignore taps on transparent pixels by requiring a hit in the
        // middle 70% of the width.
        if (actor === this.partner) { this.events.tapPartner(this.anchor(() => actor.head())); return; }
        if (actor === this.me) { this.events.tapMe(this.anchor(() => actor.head())); return; }
      }
      const id = h.object.userData.placementId as string | undefined;
      if (id) {
        const inst = this.items.get(id);
        if (!inst) continue;
        const def = ITEM_BY_KEY[inst.p.item];
        if (this.decorating) { this.selected = id; this.paintGrid(); this.events.decorTap(inst.p); return; }
        if (def?.flat) continue; // rugs: treat as floor
        const top = new THREE.Box3().setFromObject(inst.root);
        const anchorAt = new THREE.Vector3((top.min.x + top.max.x) / 2, top.max.y + 0.2, (top.min.z + top.max.z) / 2);
        const at = this.anchor(() => anchorAt);
        this.events.tapFurniture(inst.p, at);
        return;
      }
    }
    if (this.decorating) { this.selected = null; this.paintGrid(); this.events.decorTap(null); return; }
    if (!this.interacting && this.ray.intersectObjects(this.room.doorPicks, false).length) { this.goOut(); return; }
    const hit = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
      const t = worldToTile(hit.x, hit.z);
      if (inFloor(t, this.L)) {
        this.events.tapEmpty();
        if (!this.interacting) this.walkMeTo(t);
        this.fx.spawn('sparkle', new THREE.Vector3(hit.x, 0.1, hit.z), { life: 0.5, rise: 0.4, size: 0.25, spread: 0 });
        return;
      }
    }
    this.events.tapEmpty();
  }

  // ---------- Loop ----------

  private onFrame?: (dt: number, t: number) => void;

  start(onFrame?: (dt: number, t: number) => void) {
    this.onFrame = onFrame;
    this.startLoop();
  }

  private startLoop() {
    this.r.start((dt, t) => {
      this.clock += dt;
      for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].at <= this.clock) { const tm = this.timers[i]; this.timers.splice(i, 1); tm.fn(); }
      this.me.update(dt);
      this.partner.update(dt);
      this.fx.update(dt);
      if (this.big && this.live) this.followCam(Math.min(1, dt * 4));
      this.room.tick(t, dt, this.r.reduceMotion);
      for (const i of this.items.values()) {
        i.art.tick?.(t);
        // Just placed: a little pop; waiting on the server: a soft breathing shimmer.
        if (i.pop != null) {
          i.pop += dt;
          const k = Math.min(1, i.pop / 0.28);
          const sc = k < 1 ? 0.82 + 0.26 * Math.sin(k * Math.PI * 0.75) : 1;
          i.root.scale.setScalar(sc);
          if (k >= 1) { i.root.scale.setScalar(1); i.pop = undefined; }
        }
        if (i.pending) {
          const o = 0.62 + 0.3 * (0.5 + 0.5 * Math.sin(t * 7));
          for (const mm of i.mats ??= materialsOf(i.root)) mm.opacity = o * (mm.userData.prev?.opacity ?? 1);
        }
      }
      for (const i of this.leaving) {
        i.leaving! += dt;
        const k = Math.min(1, i.leaving! / 0.22);
        i.root.scale.setScalar(1 - 0.9 * k);
        if (k >= 1) { this.r.scene.remove(i.root); dispose(i.root); }
      }
      this.leaving = this.leaving.filter((i) => i.leaving! < 0.22);
      // Lamps flicker gently.
      for (const l of this.lights) if (l.userData.base) l.intensity = l.userData.base * (1 + 0.03 * Math.sin(t * 13 + l.id) + 0.02 * Math.sin(t * 7.3));
      this.dayTimer += dt;
      if (this.dayTimer > 20) { this.dayTimer = 0; this.applyDaylight(); }
      this.wallTimer += dt;
      if (this.wallTimer > 30) { this.wallTimer = 0; this.refreshWalls(true); }
      if (!this.partnerOnline && this.partner.lying) {
        this.zzzT += dt;
        if (this.zzzT > 1.6) { this.zzzT = 0; this.fx.spawn('zzz', this.partner.head(), { spread: 0.1 }); }
      }
      this.onFrame?.(dt, t);
    });
  }

  /** Walk to the front door, then leave. */
  private goOut() {
    const d = this.L.door;
    if (this.me.tile.x === d.x && this.me.tile.y === d.y && !this.me.walking) { this.events.tapDoor(); return; }
    this.walkMeTo(d, () => this.events.tapDoor());
  }

  /** Another scene takes over the screen: stop reacting to taps. */
  pause() { this.live = false; this.pointers.clear(); }

  /** Back home: draw this room again with its own camera, light and mood. */
  resume() {
    this.live = true;
    this.r.attach(this.r.scene, { pitch: 0.66, fitW: 10.6 });
    this.r.zoom = 1;
    this.r.pan.set(0, 0);
    this.r.setShadowLight(this.room.sun);
    this.r.target.set(0, 1.05, 0.25);
    this.camFit = 10.6;
    this.applyView(true);
    const m = this.theme.mood;
    this.r.setMood(m.bloom, m.grade, m.gradeAmount, m.backdrop);
    this.applyDaylight(true);
    this.startLoop();
  }

  resize(w: number, h: number) { this.r.resize(w, h); }

  project(v: THREE.Vector3): ScreenPoint & { visible: boolean } {
    const rect = this.r.canvas.getBoundingClientRect();
    const p = this.r.project(v);
    return { x: p.x + rect.left, y: p.y + rect.top, visible: p.visible };
  }

  spawn(kind: FxKind, who: 'me' | 'partner', count = 3) {
    const a = who === 'me' ? this.me : this.partner;
    this.fx.spawn(kind, a.head(), { count, spread: 0.4 });
  }

  /** Item keys currently placed (for interaction requirements). */
  placedKeys(): Set<string> { return new Set(this.placements.map((p) => p.item)); }

  frontOf(rot: number) { return frontOf(rot); }

  destroy() {
    this.r.stop();
    for (const m of this.warmKeep) m.dispose();
    for (const id of [...this.items.keys()]) this.removeInst(id);
    this.room.dispose();
    this.me.dispose();
    this.partner.dispose();
    this.r.renderer.dispose();
  }
}
