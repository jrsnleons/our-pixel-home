// Maple Town in HD-2D, seen straight on like Octopath Traveler: a lit, walkable diorama at the
// same pixel scale as your room. Buildings are painted boxes with stepped roofs and windows that
// glow at night; the streets are dressed with lamps, trees, stalls, a clock tower, a fountain, a
// river and a park with ducks; townsfolk keep to their own corners of town on a shared timetable.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mix, shade } from '../core/color';
import type { Tile } from '../core/grid';
import type { FloorPlan } from '../core/layout';
import {
  BRIDGE, districtAt, districtWaypoints, G, groundAt, PIER, PLACES, POND, RIVER, TOWN, TOWN_PROPS, TOWN_SPAWN, TOWNSFOLK, townBlocked,
  type Place, type TownProp,
} from '../data/town';
import { randomWear } from '../data/clothes';
import type { ThemeKey } from '../data/themes';
import { AreaScene, type AreaEvents, type Hotspot } from './area';
import { Actor } from './actor';
import { DEFAULT_LOOK, HAIR_STYLES, type AvatarLook } from './art/avatar';
import { cbox, flat, pbox, spriteTexture } from './art/kit';
import { solid } from './art/paint';
import { canvas, rng, texture, PPU, type Ctx } from './art/pixel';
import { textWidth } from './art/font';
import {
  paintBoard, paintBunting, paintBush, paintClock, paintDuck, paintFacade, paintGlow, paintGoods, paintGround, paintPine, paintRoof,
  paintSide, paintSign, paintStone, paintTree, paintWater, paintWillow,
} from './art/town';
import type { Daylight } from './daylight';

/** The town's floor: one big rectangle (what's solid is in the blocked set). */
export const TOWN_FLOOR: FloorPlan = { w: TOWN.w, d: TOWN.d, rooms: [{ id: 'street', name: 'Maple Town', x: 0, y: 0, w: TOWN.w, d: TOWN.d }] };

/** Straight on and a little high, with about fourteen tiles across a phone. */
const VIEW = { pitch: 0.8, fitW: 14, yaw: 0 };

const wx = (x: number) => x - 3.5;
const wz = (y: number) => y - 3.5;

export function npcLook(n: number): AvatarLook {
  return { ...DEFAULT_LOOK, body: n % 2 ? 'girl' : 'guy', hair: HAIR_STYLES[(n * 5 + 1) % HAIR_STYLES.length], hairColor: (n * 3 + 2) % 8, skin: (n * 5 + 3) % 6, wear: randomWear(n + 40), eyes: n % 4 };
}

/** What the notice board in the square says; it changes every hour. */
const NOTICES = [
  'LOST: one orange cat. Answers to Mango. Loves the fountain.',
  'The pet shop on Post Office Row opens soon!',
  'Quiet time at the chapel, every morning. All welcome.',
  'Garden Lane: the tomatoes are ready when they are red.',
  'Market in the square every day. Fresh bread by noon.',
  'Willow Park: please don’t feed the ducks bread. They prefer peas.',
  'Night music by the fountain when the lamps are on.',
];

interface Lit { mat: THREE.MeshLambertMaterial; strength: number }

export class TownScene extends AreaScene {
  private lit: Lit[] = [];
  private glowMat: THREE.MeshBasicMaterial;
  private lantern: THREE.MeshLambertMaterial;
  private signs = new Map<string, THREE.Object3D>();
  private waters: THREE.Texture[] = [];
  private waterMats: THREE.MeshLambertMaterial[] = [];
  private bobbers: { o: THREE.Object3D; y: number; phase: number }[] = [];
  private ducks: { m: THREE.Object3D; cx: number; cz: number; rx: number; rz: number; phase: number; speed: number }[] = [];
  private clockFace: { g: Ctx; tex: THREE.CanvasTexture; shown: number } | null = null;
  private board: THREE.Vector3 | null = null;
  private nightOnly = new Set<string>();
  private statics = new THREE.Group();
  private districtId: string | null = null;
  private districtT = 0;
  private billboardMats = new Map<string, THREE.MeshLambertMaterial>();

  constructor(r: ConstructorParameters<typeof AreaScene>[0], themeKey: ThemeKey, looks: { me: AvatarLook; partner: AvatarLook }, events: AreaEvents) {
    super(r, themeKey, TOWN_FLOOR, looks, events, VIEW, TOWN_SPAWN);
    this.blocked = townBlocked();
    // Keep the view over the town: the forest at the top and the edge of Maple Court at the bottom.
    this.camBounds = { x: [wx(7.5), wx(TOWN.w - 7.5)], z: [wz(14), wz(TOWN.d - 8)] };
    // The sun sits in front and to the left, so every shopfront is lit and shadows fall behind.
    this.sunOffset.set(-6, 14, 7);
    Object.assign(this.sun.shadow.camera, { left: -13, right: 13, top: 15, bottom: -15, near: 1, far: 50 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.glowMat = new THREE.MeshBasicMaterial({ map: spriteTexture(16, 16, paintGlow), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    this.lantern = new THREE.MeshLambertMaterial({ color: '#FFE9B0', emissive: '#FFD27A', emissiveIntensity: 0 });
    this.build();
  }

  // ---------- Building the town ----------

  private build() {
    this.buildGround();
    this.buildWater();
    this.buildBridges();
    this.buildHedges();
    for (const p of PLACES) this.buildPlace(p);
    for (const q of TOWN_PROPS) this.buildProp(q);
    this.buildWoods();
    this.buildDucks();
    this.scene.add(this.statics);
    this.batch();
    this.buildNpcs();
  }

  private buildGround() {
    // A wide lawn under everything so the edge of the map never shows void.
    const [lawn, lg] = canvas(32, 32);
    const r = rng(5);
    lg.fillStyle = '#5E9650'; lg.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 90; i++) { lg.fillStyle = r() < 0.5 ? '#6FA85A' : '#4E8446'; lg.fillRect((r() * 32) | 0, (r() * 32) | 0, 1, 1); }
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(TOWN.w + 60, TOWN.d + 60), new THREE.MeshLambertMaterial({ map: texture(lawn, [(TOWN.w + 60) / 2, (TOWN.d + 60) / 2]) }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(wx(TOWN.w / 2), -0.02, wz(TOWN.d / 2));
    outer.receiveShadow = true;
    this.scene.add(outer);

    const [c, g] = canvas(TOWN.w * PPU, TOWN.d * PPU);
    paintGround(g, c.width, c.height);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(TOWN.w, TOWN.d), new THREE.MeshLambertMaterial({ map: texture(c) }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(wx(TOWN.w / 2), 0, wz(TOWN.d / 2));
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  /** Moving water over the river and the pond, inset so the painted banks and foam show. */
  private buildWater() {
    const sheet = (x: number, y: number, w: number, d: number, inset: number) => {
      const tex = spriteTexture(16, 16, paintWater);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(w - inset * 2, d - inset * 2);
      const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.82, emissive: '#2E6A98', emissiveIntensity: 0.15 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w - inset * 2, d - inset * 2), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(wx(x) + w / 2, 0.015, wz(y) + d / 2);
      m.receiveShadow = true;
      this.waters.push(tex);
      this.waterMats.push(mat);
      this.scene.add(m);
    };
    // The river, in two pieces either side of the bridge so the planks stay dry.
    sheet(RIVER.x, RIVER.y, BRIDGE.x - RIVER.x, RIVER.d, 0.18);
    sheet(BRIDGE.x + BRIDGE.w, RIVER.y, RIVER.w - BRIDGE.x - BRIDGE.w, RIVER.d, 0.18);
    sheet(POND.x, POND.y, POND.w, POND.d, 0.25);
  }

  private buildBridges() {
    const s = this.statics;
    const rail = '#8A6244', post = '#6A4A32';
    // The bridge: posts and a handrail down both sides.
    for (const x of [wx(BRIDGE.x) + 0.04, wx(BRIDGE.x + BRIDGE.w) - 0.16]) {
      for (let z = wz(BRIDGE.y); z <= wz(BRIDGE.y + BRIDGE.d) + 0.01; z += 1) s.add(cbox(x, 0, z - 0.06, 0.12, 0.75, 0.12, post));
      s.add(cbox(x - 0.02, 0.66, wz(BRIDGE.y), 0.16, 0.1, BRIDGE.d, rail));
      s.add(cbox(x, 0.36, wz(BRIDGE.y), 0.12, 0.07, BRIDGE.d, rail));
    }
    // The bridge deck stands a little proud of the water.
    s.add(cbox(wx(BRIDGE.x) - 0.1, -0.1, wz(BRIDGE.y) - 0.05, BRIDGE.w + 0.2, 0.12, 0.1, '#7A5638', { cast: false }));
    // The pier: posts into the water and a rail along the sides.
    for (const x of [wx(PIER.x) + 0.04, wx(PIER.x + PIER.w) - 0.14]) {
      for (let z = wz(PIER.y); z < wz(PIER.y + PIER.d); z += 1) s.add(cbox(x, -0.2, z + 0.05, 0.1, 0.75, 0.1, post));
      s.add(cbox(x, 0.45, wz(PIER.y), 0.1, 0.07, PIER.d - 0.1, rail));
    }
    s.add(cbox(wx(PIER.x), 0.45, wz(PIER.y), PIER.w, 0.07, 0.1, rail));
  }

  /** Woods all round the edge of town, so the view never runs out onto empty lawn. */
  private buildWoods() {
    const r = rng(77);
    const plant = (x: number, z: number) => {
      const k = r();
      const seed = (r() * 12) | 0;
      if (k < 0.6) this.standee(`pine${seed % 4}`, 1.6, 3.0, 22, 40, (g, ww, hh) => paintPine(g, ww, hh, seed % 4), x, z);
      else this.standee(`tree${seed % 6}`, 1.8, 2.4, 24, 32, (g, ww, hh) => paintTree(g, ww, hh, seed % 6), x, z);
    };
    const x0 = wx(0), x1 = wx(TOWN.w), z0 = wz(0), z1 = wz(TOWN.d);
    for (let z = z0 - 14; z < z1 + 14; z += 1.1) for (let x = x0 - 12; x < x1 + 12; x += 1.25) {
      const inside = x > x0 - 0.6 && x < x1 + 0.6 && z > z0 - 0.6 && z < z1 + 0.6;
      if (inside) continue;
      plant(x + (r() - 0.5) * 0.8, z + (r() - 0.5) * 0.5);
    }
  }

  /** Clipped hedges: long low boxes along each run of hedge tiles. */
  private buildHedges() {
    const leaf = '#4E7E44';
    for (let y = 0; y < TOWN.d; y++) {
      let x = 0;
      while (x < TOWN.w) {
        if (groundAt(x, y) !== G.Hedge) { x++; continue; }
        const x0 = x;
        while (x < TOWN.w && groundAt(x, y) === G.Hedge) x++;
        this.statics.add(cbox(wx(x0) + 0.05, 0, wz(y) + 0.1, x - x0 - 0.1, 0.62, 0.8, leaf));
        this.statics.add(cbox(wx(x0) + 0.1, 0.62, wz(y) + 0.15, x - x0 - 0.2, 0.08, 0.7, '#5E9650', { cast: false }));
      }
    }
  }

  /** A painted box face with a night-light layer. */
  private faceMat(paintFn: (c: CanvasRenderingContext2D, glow: CanvasRenderingContext2D) => void, wPx: number, hPx: number): THREE.MeshLambertMaterial {
    const [c, g] = canvas(wPx, hPx);
    const [gc, gg] = canvas(wPx, hPx);
    paintFn(g, gg);
    const glow = texture(gc);
    const mat = new THREE.MeshLambertMaterial({ map: texture(c), emissiveMap: glow, emissive: '#FFFFFF', emissiveIntensity: 0 });
    this.lit.push({ mat, strength: 1 });
    return mat;
  }

  private buildPlace(p: Place) {
    if (p.style === 'park') { this.buildGazebo(p); return; }
    if (p.style === 'cart') { this.buildCart(p); return; }
    const group = new THREE.Group();
    const W = p.w, D = p.d, Hh = p.h;
    const wPx = Math.round(W * PPU), hPx = Math.round(Hh * PPU), dPx = Math.round(D * PPU);
    const front = this.faceMat((c, g) => paintFacade(c, g, p, wPx, hPx), wPx, hPx);
    const side = this.faceMat((c, g) => paintSide(c, g, p, dPx, hPx), dPx, hPx);
    const plain = flat(shade(p.palette.wall, -0.2));
    const top = flat(p.palette.roof);
    // Seen straight on, the sides only show at the edges of the screen; both get windows.
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, D), [side, side, top, plain, front, plain]);
    body.position.set(wx(p.x) + W / 2, Hh / 2, wz(p.y) + D / 2);
    body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    this.roof(group, p);
    // A doorstep so the way in reads from far away.
    group.add(cbox(wx(p.door.x) - 0.1, 0, wz(p.y + p.d), 1.2, 0.06, 0.35, shade(p.palette.trim, 0.25), { cast: false }));
    this.scene.add(group);

    const hotspot: Hotspot = {
      id: p.id, kind: 'door', label: p.name,
      approach: p.door,
      at: new THREE.Vector3(wx(p.door.x) + 0.5, Hh + 0.7, wz(p.y) + D),
    };
    this.addHotspot(hotspot, [body]);
  }

  private roof(g: THREE.Group, p: Place) {
    const { x, y, w, d, h } = p;
    const flatRoof = p.style === 'labs' || p.style === 'parcel' || p.style === 'home' || p.style === 'boarded';
    const tex = (base: string) => ({ top: (gx: CanvasRenderingContext2D, ww: number, hh: number) => paintRoof(gx, ww, hh, base, flatRoof), sides: solid(shade(base, -0.2)) });
    if (flatRoof) {
      // Parapet around a flat roof.
      g.add(pbox(wx(x) - 0.12, h, wz(y) - 0.12, w + 0.24, 0.22, d + 0.24, { ...tex(p.palette.roof), front: solid(shade(p.palette.trim, 0.1)), right: solid(shade(p.palette.trim, -0.05)) }));
      if (p.style === 'labs') {
        g.add(cbox(wx(x) + w - 1.1, h + 0.22, wz(y) + 0.6, 0.12, 1.3, 0.12, '#8A8A96'));
        g.add(cbox(wx(x) + w - 1.3, h + 1.2, wz(y) + 0.6, 0.5, 0.08, 0.08, '#8A8A96'));
        g.add(cbox(wx(x) + 0.6, h + 0.22, wz(y) + 0.6, 0.9, 0.5, 0.8, '#7A8A96'));
      }
      if (p.style === 'home') {
        // Chimneys, a water tank and a roof garden, so it reads as a building people live in.
        g.add(cbox(wx(x) + 0.6, h + 0.22, wz(y) + 0.6, 0.5, 0.9, 0.5, shade(p.palette.wall, -0.25)));
        g.add(cbox(wx(x) + w - 1.6, h + 0.22, wz(y) + 0.8, 0.9, 0.9, 0.9, '#7A8A96'));
        for (let i = 0; i < 3; i++) g.add(cbox(wx(x) + 2 + i * 1.6, h + 0.22, wz(y) + d - 1.2, 1.1, 0.35, 0.6, i % 2 ? '#6E9A52' : '#5E8A48'));
      }
      return;
    }
    // Gabled look as stepped slabs.
    const steps: [number, number][] = [[0.34, 0.26], [1.1, 0.26], [2.0, 0.22]];
    steps.forEach(([inset, ht], i) => {
      if (i === 2 && d < 5) return;
      const iw = w + 0.36 - inset * 1.2 * (i ? 1 : 0), idp = d + 0.36 - inset * 0.55 * (i ? 1 : 0) - (i === 2 ? 1.2 : 0);
      if (iw <= 0.8 || idp <= 0.6) return;
      g.add(pbox(wx(x) + (w - iw) / 2, h + i * 0.26, wz(y) + (d - idp) / 2, iw, ht, idp, { ...tex(shade(p.palette.roof, i * 0.04)), front: solid(shade(p.palette.roof, -0.1)) }));
    });
    if (p.style === 'cafe' || p.style === 'realty' || p.style === 'house' || p.style === 'chapel') {
      g.add(cbox(wx(x) + w - 1.2, h + 0.3, wz(y) + 0.8, 0.5, 1.0, 0.5, shade(p.palette.wall, -0.3)));
    }
    if (p.style === 'chapel') {
      // Bell tower with a spire and a cross.
      const tx = wx(x) + w / 2 - 0.7, tz = wz(y) + 0.3;
      g.add(pbox(tx, h + 0.5, tz, 1.4, 1.8, 1.4, { sides: (gx, ww, hh) => { solid(p.palette.wall)(gx, ww, hh); gx.fillStyle = '#3A2A22'; gx.fillRect(ww / 2 - 3, 6, 6, 12); gx.fillStyle = shade(p.palette.trim, -0.1); gx.fillRect(0, 0, ww, 2); } }));
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.5, 4), flat(p.palette.roof));
      spire.rotation.y = Math.PI / 4;
      spire.position.set(tx + 0.7, h + 2.3 + 0.75, tz + 0.7);
      spire.castShadow = true;
      g.add(spire);
      g.add(cbox(tx + 0.66, h + 3.8, tz + 0.66, 0.08, 0.7, 0.08, p.palette.accent));
      g.add(cbox(tx + 0.5, h + 4.1, tz + 0.66, 0.4, 0.08, 0.08, p.palette.accent));
    }
  }

  // ---------- The gazebo and the cart ----------

  private buildGazebo(p: Place) {
    const g = new THREE.Group();
    const x0 = wx(p.x), z0 = wz(p.y), cx = x0 + p.w / 2, cz = z0 + p.d / 2;
    g.add(cbox(x0 + 0.1, 0, z0 + 0.1, p.w - 0.2, 0.22, p.d - 0.2, '#C8B090'));
    for (const [px_, pz] of [[x0 + 0.25, z0 + 0.25], [x0 + p.w - 0.4, z0 + 0.25], [x0 + 0.25, z0 + p.d - 0.4], [x0 + p.w - 0.4, z0 + p.d - 0.4]]) g.add(cbox(px_, 0.22, pz, 0.15, 1.9, 0.15, p.palette.wall));
    // Railings on three sides; the front stays open.
    for (const z of [z0 + 0.3]) g.add(cbox(x0 + 0.3, 0.7, z, p.w - 0.6, 0.08, 0.06, p.palette.wall));
    for (const x of [x0 + 0.3, x0 + p.w - 0.36]) g.add(cbox(x, 0.7, z0 + 0.3, 0.06, 0.08, p.d - 0.6, p.palette.wall));
    g.add(cbox(x0 + 0.5, 0.22, z0 + 0.45, p.w - 1, 0.38, 0.4, '#A87A54'));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(p.w * 0.66, 1.1, 8), flat(p.palette.roof));
    roof.position.set(cx, 2.12 + 0.55, cz);
    roof.castShadow = true;
    g.add(roof);
    g.add(cbox(cx - 0.05, 3.3, cz - 0.05, 0.1, 0.35, 0.1, p.palette.accent));
    // Fairy lights round the eaves.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), this.lantern);
      m.position.set(cx + Math.cos(a) * p.w * 0.66, 2.05, cz + Math.sin(a) * p.d * 0.66);
      g.add(m);
    }
    this.scene.add(g);
    const hotspot: Hotspot = { id: p.id, kind: 'public', label: p.name, approach: p.door, at: new THREE.Vector3(cx, 3.2, cz) };
    const pick = new THREE.Mesh(new THREE.BoxGeometry(p.w, 3, p.d), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(cx, 1.5, cz);
    this.scene.add(pick);
    this.addHotspot(hotspot, [pick]);
  }

  private buildCart(p: Place) {
    const g = new THREE.Group();
    const x0 = wx(p.x), z0 = wz(p.y);
    // Counter with a striped awning on two poles.
    g.add(pbox(x0, 0, z0 + 0.2, p.w, 0.9, p.d - 0.4, { sides: solid(p.palette.wall), top: solid(shade(p.palette.wall, 0.1)), front: (gx, w, h) => { solid(p.palette.wall)(gx, w, h); gx.fillStyle = shade(p.palette.trim, -0.1); gx.fillRect(0, h - 3, w, 3); for (let i = 4; i < w - 4; i += 8) { gx.fillStyle = '#FFF2D0'; gx.fillRect(i, 4, 5, 4); gx.fillStyle = '#C8A06E'; gx.fillRect(i + 1, 5, 3, 2); } } }));
    for (const px_ of [x0 + 0.1, x0 + p.w - 0.18]) g.add(cbox(px_, 0.9, z0 + p.d - 0.3, 0.08, 1.2, 0.08, '#8A6A4A'));
    for (const px_ of [x0 + 0.1, x0 + p.w - 0.18]) g.add(cbox(px_, 0.9, z0 + 0.25, 0.08, 1.2, 0.08, '#8A6A4A'));
    // Wheels.
    for (const px_ of [x0 + 0.3, x0 + p.w - 0.42]) g.add(cbox(px_, 0, z0 + p.d - 0.24, 0.12, 0.5, 0.12, '#3A2A22'));
    const aw = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.3, 0.12, p.d), new THREE.MeshLambertMaterial({ map: spriteTexture(p.w * PPU, 16, (gx, w, h) => { for (let i = 0; i < w; i++) { gx.fillStyle = ((i >> 2) & 1) ? '#FFF2D0' : '#E8506A'; gx.fillRect(i, 0, 1, h); } }) }));
    aw.position.set(x0 + p.w / 2, 2.1, z0 + p.d / 2);
    aw.castShadow = true;
    g.add(aw);
    g.add(this.sign(p.sign, x0 + p.w / 2, 2.16, z0 + p.d - 0.1, '#C8553D'));
    this.scene.add(g);
    const hotspot: Hotspot = { id: p.id, kind: 'public', label: p.name, approach: p.door, at: new THREE.Vector3(x0 + p.w / 2, 2.8, z0 + p.d - 0.3) };
    const pick = new THREE.Mesh(new THREE.BoxGeometry(p.w, 2, p.d), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(x0 + p.w / 2, 1, z0 + p.d / 2);
    this.scene.add(pick);
    this.addHotspot(hotspot, [pick]);
  }

  // ---------- Decorations ----------

  /** A sprite standing upright and facing the camera, sharing one material per picture. */
  private standee(key: string, w: number, h: number, pw: number, ph: number, paint: (g: Ctx, w: number, h: number) => void, x: number, z: number, opts: { cast?: boolean; y?: number } = {}) {
    let mat = this.billboardMats.get(key);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ map: spriteTexture(pw, ph, paint), alphaTest: 0.5, side: THREE.DoubleSide });
      this.billboardMats.set(key, mat);
    }
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, h / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, opts.y ?? 0, z);
    m.castShadow = opts.cast ?? true;
    m.receiveShadow = true;
    this.statics.add(m);
    return m;
  }

  /** A little painted sign facing the camera. */
  private sign(text: string, cx: number, y: number, z: number, bg = '#3E6A4A'): THREE.Mesh {
    const wpx = textWidth(text) + 6;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wpx / PPU, 9 / PPU), new THREE.MeshLambertMaterial({ map: spriteTexture(wpx, 9, (g, w, h) => paintSign(g, w, h + 0, text, bg)), alphaTest: 0.5 }));
    m.position.set(cx, y + 9 / PPU / 2, z);
    return m;
  }

  private buildProp(q: TownProp) {
    const s = this.statics;
    const w = q.w ?? 1, d = q.d ?? 1;
    const x0 = wx(q.x), z0 = wz(q.y), cx = x0 + w / 2, cz = z0 + d / 2;
    const seed = q.seed ?? q.x * 7 + q.y * 13;
    switch (q.kind) {
      case 'tree': this.standee(`tree${seed % 6}`, 1.7, 2.3, 24, 32, (g, ww, hh) => paintTree(g, ww, hh, seed % 6), cx, cz + 0.1); break;
      case 'pine': this.standee(`pine${seed % 4}`, 1.5, 2.8, 22, 40, (g, ww, hh) => paintPine(g, ww, hh, seed % 4), cx, cz + 0.1); break;
      case 'willow': this.standee(`willow${seed % 2}`, 2.4, 2.8, 34, 40, (g, ww, hh) => paintWillow(g, ww, hh, seed % 2), cx, cz + 0.1); break;
      case 'bush': this.standee(`bush${seed % 3}`, 1.0, 0.75, 16, 12, (g, ww, hh) => paintBush(g, ww, hh, seed % 3), cx, cz + 0.2); break;
      case 'flowers': {
        const col = q.label ?? '#E8506A';
        this.standee(`flowers${col}`, 0.9, 0.45, 14, 8, (g, ww, hh) => { const r = rng(3); for (let i = 0; i < 14; i++) { const fx = (r() * (ww - 2)) | 0, fy = 2 + ((r() * (hh - 4)) | 0); g.fillStyle = '#4E8446'; g.fillRect(fx, fy + 1, 1, hh - fy); g.fillStyle = i % 3 ? col : '#FFFFFF'; g.fillRect(fx, fy, 2, 2); } }, cx, cz, { cast: false });
        break;
      }
      case 'lamp': {
        s.add(cbox(cx - 0.07, 0, cz - 0.07, 0.14, 2.0, 0.14, '#3A3A46'));
        s.add(cbox(cx - 0.12, 0, cz - 0.12, 0.24, 0.2, 0.24, '#3A3A46'));
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.36), this.lantern);
        lamp.position.set(cx, 2.17, cz);
        s.add(lamp);
        s.add(cbox(cx - 0.23, 2.34, cz - 0.23, 0.46, 0.08, 0.46, '#3A3A46'));
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), this.glowMat);
        glow.position.set(cx, 2.15, cz + 0.25);
        s.add(glow);
        break;
      }
      case 'bench': {
        const f = q.facing ?? '+z';
        const along = f === '+z' || f === '-z';
        const bw = along ? 0.9 : 0.42, bd = along ? 0.42 : 0.9;
        s.add(cbox(cx - bw / 2, 0.3, cz - bd / 2, bw, 0.08, bd, '#A87A54'));
        for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.add(cbox(cx + lx * (bw / 2 - 0.08) - 0.04, 0, cz + lz * (bd / 2 - 0.08) - 0.04, 0.08, 0.3, 0.08, '#3A3A46'));
        const back = { '+z': [cx - bw / 2, cz - bd / 2, bw, 0.07], '-z': [cx - bw / 2, cz + bd / 2 - 0.07, bw, 0.07], '+x': [cx - bw / 2, cz - bd / 2, 0.07, bd], '-x': [cx + bw / 2 - 0.07, cz - bd / 2, 0.07, bd] }[f];
        s.add(cbox(back[0], 0.38, back[1], back[2], 0.36, back[3], '#8A6244'));
        break;
      }
      case 'planter': {
        s.add(cbox(cx - 0.4, 0, cz - 0.4, 0.8, 0.45, 0.8, '#B8B0A4'));
        s.add(cbox(cx - 0.34, 0.45, cz - 0.34, 0.68, 0.04, 0.68, '#5E4630', { cast: false }));
        if (q.label === 'tree') this.standee(`tree${seed % 6}`, 1.3, 1.8, 24, 32, (g, ww, hh) => paintTree(g, ww, hh, seed % 6), cx, cz, { y: 0.45 });
        else this.standee(`bush${(seed + 1) % 3}`, 0.8, 0.6, 16, 12, (g, ww, hh) => paintBush(g, ww, hh, (seed + 1) % 3), cx, cz, { y: 0.45 });
        break;
      }
      case 'stall': this.buildStall(q, x0, z0, w, d, seed); break;
      case 'fountain': this.buildFountain(cx, cz, w, d); break;
      case 'clock': this.buildClock(cx, cz); break;
      case 'board': {
        for (const px_ of [x0 + 0.2, x0 + w - 0.32]) s.add(cbox(px_, 0, cz - 0.06, 0.12, 1.7, 0.12, '#5E4630'));
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, 0.9), new THREE.MeshLambertMaterial({ map: spriteTexture((w - 0.3) * PPU, 15, paintBoard) }));
        m.position.set(cx, 1.15, cz + 0.08);
        m.castShadow = true;
        s.add(m);
        s.add(cbox(x0 + 0.05, 1.62, cz - 0.2, w - 0.1, 0.1, 0.45, '#7A3E32'));
        this.board = new THREE.Vector3(cx, 2.1, cz);
        // Tap the board to read it (it talks like a person would).
        const pick = new THREE.Mesh(new THREE.BoxGeometry(w, 1.8, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
        pick.position.set(cx, 0.9, cz);
        pick.userData.npc = 'board';
        this.scene.add(pick);
        this.pickables.push(pick);
        break;
      }
      case 'hydrant': {
        s.add(cbox(cx - 0.13, 0, cz - 0.13, 0.26, 0.5, 0.26, '#C8553D'));
        s.add(cbox(cx - 0.18, 0.2, cz - 0.06, 0.36, 0.1, 0.12, '#A8402E'));
        s.add(cbox(cx - 0.1, 0.5, cz - 0.1, 0.2, 0.08, 0.2, '#E8C060'));
        break;
      }
      case 'mailbox': {
        s.add(cbox(cx - 0.05, 0, cz - 0.05, 0.1, 0.8, 0.1, '#5E4630'));
        s.add(cbox(cx - 0.2, 0.8, cz - 0.15, 0.4, 0.3, 0.3, '#3E5E8A'));
        s.add(cbox(cx + 0.2, 0.9, cz - 0.02, 0.04, 0.2, 0.04, '#C8553D'));
        break;
      }
      case 'busstop': {
        s.add(cbox(x0 + 0.1, 0, z0 + 0.1, w - 0.2, 1.9, 0.06, '#B8D8E8'));
        for (const px_ of [x0 + 0.1, x0 + w - 0.18]) s.add(cbox(px_, 0, z0 + 0.1, 0.08, 2.0, 0.5, '#4A5E6E'));
        s.add(cbox(x0, 2.0, z0, w, 0.1, 0.8, '#4A5E6E'));
        s.add(cbox(x0 + 0.3, 0.32, z0 + 0.18, w - 0.6, 0.08, 0.34, '#A87A54'));
        s.add(cbox(x0 + w + 0.1, 0, z0 + 0.7, 0.08, 1.9, 0.08, '#3A3A46'));
        s.add(this.sign('BUS', x0 + w + 0.14, 1.9, z0 + 0.79, '#3E5E8A'));
        break;
      }
      case 'signpost': {
        s.add(cbox(cx - 0.05, 0, cz - 0.05, 0.1, 1.7, 0.1, '#3A3A46'));
        s.add(this.sign(q.label ?? '', cx, 1.55, cz + 0.06));
        break;
      }
      case 'cafetable': {
        s.add(cbox(cx - 0.04, 0, cz - 0.04, 0.08, 0.6, 0.08, '#3A3A46'));
        s.add(cbox(cx - 0.3, 0.6, cz - 0.3, 0.6, 0.05, 0.6, '#F2E8D0'));
        for (const dx of [-0.48, 0.32]) s.add(cbox(cx + dx, 0, cz - 0.08, 0.16, 0.36, 0.16, '#C8553D'));
        s.add(cbox(cx - 0.03, 0.65, cz - 0.03, 0.06, 1.25, 0.06, '#E8E0D0'));
        const um = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.4, 8), flat(q.x % 2 ? '#C8553D' : '#FFF2D0'));
        um.position.set(cx, 2.0, cz);
        um.castShadow = true;
        s.add(um);
        break;
      }
      case 'bikerack': {
        for (let i = 0; i < 4; i++) s.add(cbox(x0 + 0.2 + i * 0.45, 0, cz - 0.03, 0.05, 0.5, 0.06, '#8A8A96'));
        s.add(cbox(x0 + 0.15, 0.45, cz - 0.03, w - 0.3, 0.05, 0.06, '#8A8A96'));
        // One bike parked.
        s.add(cbox(x0 + 0.3, 0.1, cz + 0.12, 0.9, 0.06, 0.06, '#E8506A'));
        for (const bx of [x0 + 0.3, x0 + 1.1]) s.add(cbox(bx - 0.14, 0, cz + 0.12, 0.3, 0.3, 0.04, '#2A2A36'));
        break;
      }
      case 'greenhouse': {
        const glass = new THREE.MeshLambertMaterial({ color: '#D8F0F0', emissive: '#AEE0E0', emissiveIntensity: 0.15, transparent: true, opacity: 0.7 });
        const box = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 1.5, d - 0.2), glass);
        box.position.set(cx, 0.75, cz);
        this.scene.add(box);
        for (let i = 0; i <= d - 0.2; i += 0.9) s.add(cbox(x0 + 0.08, 0, z0 + 0.1 + i, w - 0.16, 1.58, 0.05, '#F2F2F2', { cast: false }));
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, (w - 0.2) * 0.62, 0.6, 4, 1, false, Math.PI / 4), glass);
        roof.scale.set(1, 1, (d - 0.2) / (w - 0.2));
        roof.position.set(cx, 1.8, cz);
        this.scene.add(roof);
        for (let i = 0; i < 3; i++) this.standee(`bush${i}`, 0.6, 0.5, 16, 12, (g, ww, hh) => paintBush(g, ww, hh, i), cx, z0 + 0.8 + i * 1.1, { cast: false });
        break;
      }
      case 'fence': {
        for (let i = 0; i <= w * 2; i++) s.add(cbox(x0 + i * 0.5 - 0.05, 0, cz - 0.05, 0.1, 0.6, 0.1, '#F2EAD8'));
        for (const y of [0.22, 0.46]) s.add(cbox(x0, y, cz - 0.03, w, 0.07, 0.06, '#F2EAD8'));
        break;
      }
      case 'bunting': {
        for (const px_ of [x0, x0 + w - 0.12]) s.add(cbox(px_, 0, cz - 0.06, 0.12, 3.2, 0.12, '#6A5A4A'));
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.75), new THREE.MeshLambertMaterial({ map: spriteTexture(w * PPU, 12, (g, ww, hh) => paintBunting(g, ww, hh, seed)), alphaTest: 0.5, side: THREE.DoubleSide }));
        m.position.set(cx, 2.8, cz);
        s.add(m);
        break;
      }
      case 'boat': {
        const g = new THREE.Group();
        g.add(cbox(-0.6, 0, -0.3, 1.2, 0.25, 0.6, seed % 2 ? '#C8553D' : '#3E6A8A'));
        g.add(cbox(-0.5, 0.25, -0.24, 1.0, 0.06, 0.48, '#E8D8B8'));
        g.add(cbox(-0.08, 0.25, -0.24, 0.16, 0.12, 0.48, '#8A6244'));
        g.position.set(cx + 0.5, 0, cz);
        this.scene.add(g);
        this.bobbers.push({ o: g, y: -0.02, phase: seed });
        break;
      }
      case 'lilypad': {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshLambertMaterial({ map: spriteTexture(10, 10, (g) => { g.fillStyle = '#4E8A3A'; g.beginPath(); g.arc(5, 5, 4.5, 0.4, Math.PI * 2); g.lineTo(5, 5); g.fill(); g.fillStyle = seed % 2 ? '#F29AB8' : '#FFFFFF'; g.fillRect(4, 3, 2, 2); }), alphaTest: 0.5 }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(cx, 0.03, cz);
        this.scene.add(m);
        break;
      }
      case 'picnic': {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, d - 0.1), new THREE.MeshLambertMaterial({ map: spriteTexture((w - 0.2) * 8, (d - 0.1) * 8, (g, ww, hh) => { for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) { g.fillStyle = ((x >> 1) + (y >> 1)) % 2 ? '#E8506A' : '#FFF2E8'; g.fillRect(x, y, 1, 1); } }) }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(cx, 0.02, cz);
        m.receiveShadow = true;
        s.add(m);
        s.add(cbox(cx + 0.3, 0, cz - 0.15, 0.4, 0.28, 0.3, '#B8895A'));
        break;
      }
      case 'crates': {
        s.add(cbox(cx - 0.4, 0, cz - 0.35, 0.5, 0.45, 0.5, '#B8895A'));
        s.add(cbox(cx + 0.05, 0, cz - 0.2, 0.42, 0.4, 0.42, '#A87A4A'));
        s.add(cbox(cx - 0.3, 0.45, cz - 0.28, 0.4, 0.36, 0.4, '#C8A06E'));
        break;
      }
      case 'well': {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.48, 0.6, 10), flat('#A8A094'));
        ring.position.set(cx, 0.3, cz);
        ring.castShadow = true;
        s.add(ring);
        for (const dx of [-0.42, 0.34]) s.add(cbox(cx + dx, 0.6, cz - 0.04, 0.08, 1.0, 0.08, '#6A4A32'));
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.45, 4), flat('#7A3E32'));
        roof.rotation.y = Math.PI / 4;
        roof.position.set(cx, 1.78, cz);
        roof.castShadow = true;
        s.add(roof);
        break;
      }
    }
  }

  private buildStall(q: TownProp, x0: number, z0: number, w: number, d: number, seed: number) {
    const s = this.statics;
    const colors: [string, string][] = [['#E8506A', '#FFF2D0'], ['#F2C14E', '#FFF2D0'], ['#7FB070', '#FFF2D0'], ['#6CB8E0', '#FFF2D0']];
    const [a, b] = colors[seed % colors.length];
    // The counter faces the camera; the seller stands behind it.
    s.add(cbox(x0 + 0.1, 0, z0 + d - 1.0, w - 0.2, 0.85, 0.8, '#A87A54'));
    s.add(cbox(x0 + 0.05, 0.85, z0 + d - 1.05, w - 0.1, 0.08, 0.9, '#C8A06E', { cast: false }));
    const goods = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, 0.35), new THREE.MeshLambertMaterial({ map: spriteTexture((w - 0.3) * PPU, 6, (g, ww, hh) => paintGoods(g, ww, hh, q.label ?? 'crafts')), alphaTest: 0.5 }));
    goods.position.set(x0 + w / 2, 0.93 + 0.17, z0 + d - 0.6);
    s.add(goods);
    for (const px_ of [x0 + 0.1, x0 + w - 0.2]) for (const pz of [z0 + 0.15, z0 + d - 0.3]) s.add(cbox(px_, 0, pz, 0.1, 2.2, 0.1, '#8A6244'));
    // A sloped striped awning.
    const aw = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.08, d + 0.2), new THREE.MeshLambertMaterial({ map: spriteTexture(w * PPU, 16, (g, ww, hh) => { for (let i = 0; i < ww; i++) { g.fillStyle = ((i >> 2) & 1) ? b : a; g.fillRect(i, 0, 1, hh); } }) }));
    aw.rotation.x = 0.22;
    aw.position.set(x0 + w / 2, 2.25, z0 + d / 2);
    aw.castShadow = true;
    s.add(aw);
    // The scalloped hem along the front.
    const hem = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, 0.2), new THREE.MeshLambertMaterial({ map: spriteTexture(w * PPU, 4, (g, ww) => { for (let i = 0; i < ww; i++) { g.fillStyle = ((i >> 2) & 1) ? b : a; g.fillRect(i, 0, 1, (i % 4 === 0 || i % 4 === 3) ? 2 : 4); } }), alphaTest: 0.5, side: THREE.DoubleSide }));
    hem.position.set(x0 + w / 2, 1.98, z0 + d + 0.08);
    s.add(hem);
    // Crates of stock at the side.
    s.add(cbox(x0 + w - 0.05, 0, z0 + d - 0.7, 0.4, 0.35, 0.4, '#B8895A'));
  }

  private buildFountain(cx: number, cz: number, w: number, d: number) {
    const s = this.statics;
    const stone = new THREE.MeshLambertMaterial({ map: spriteTexture(32, 16, paintStone) });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.05, 0.5, 12), stone);
    basin.scale.set((w - 0.2) / 2, 1, (d - 0.2) / 2);
    basin.position.set(cx, 0.25, cz);
    basin.castShadow = true; basin.receiveShadow = true;
    this.scene.add(basin);
    const tex = spriteTexture(16, 16, paintWater);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: '#4E98C8', emissiveIntensity: 0.25 });
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 16), mat);
    water.rotation.x = -Math.PI / 2;
    water.scale.set((w - 0.5) / 2, (d - 0.5) / 2, 1);
    water.position.set(cx, 0.46, cz);
    this.scene.add(water);
    this.waters.push(tex);
    this.waterMats.push(mat);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.2, 8), stone);
    pillar.position.set(cx, 0.9, cz);
    pillar.castShadow = true;
    this.scene.add(pillar);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.3, 0.22, 10), stone);
    bowl.position.set(cx, 1.55, cz);
    bowl.castShadow = true;
    this.scene.add(bowl);
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.55, 10), mat);
    top.rotation.x = -Math.PI / 2;
    top.position.set(cx, 1.67, cz);
    this.scene.add(top);
    // Little jets of water that bob up and down.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const jet = cbox(-0.04, 0, -0.04, 0.08, 0.3, 0.08, '#CDEBF8', { cast: false });
      const g = new THREE.Group();
      g.add(jet);
      g.position.set(cx + Math.cos(a) * 0.45, 1.6, cz + Math.sin(a) * 0.45);
      this.scene.add(g);
      this.bobbers.push({ o: g, y: 1.6, phase: i * 1.1 });
    }
    void s;
  }

  private buildClock(cx: number, cz: number) {
    const s = this.statics;
    const W = 1.5, H = 3.6;
    s.add(pbox(cx - W / 2, 0, cz - W / 2, W, H, W, { sides: paintStoneFace, top: paintStoneFace }));
    s.add(cbox(cx - W / 2 - 0.1, H, cz - W / 2 - 0.1, W + 0.2, 0.15, W + 0.2, '#8A7A6A'));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.85, 1.1, 4), flat('#4E6E5A'));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(cx, H + 0.15 + 0.55, cz);
    roof.castShadow = true;
    s.add(roof);
    s.add(cbox(cx - 0.04, H + 1.25, cz - 0.04, 0.08, 0.4, 0.08, '#E8C060'));
    const [c, g] = canvas(20, 20);
    const tex = texture(c);
    this.clockFace = { g, tex, shown: -1 };
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, emissive: '#FFF0C0', emissiveMap: tex, emissiveIntensity: 0 }));
    face.position.set(cx, H - 0.8, cz + W / 2 + 0.01);
    this.lit.push({ mat: face.material as THREE.MeshLambertMaterial, strength: 0.6 });
    this.scene.add(face);
    this.tickClock();
  }

  private tickClock() {
    const c = this.clockFace;
    if (!c) return;
    const now = new Date();
    if (this.hourOverride != null) now.setHours(Math.floor(this.hourOverride), Math.round((this.hourOverride % 1) * 60));
    const m = now.getHours() * 60 + now.getMinutes();
    if (m === c.shown) return;
    c.shown = m;
    c.g.clearRect(0, 0, 20, 20);
    paintClock(c.g, 20, 20, now.getHours(), now.getMinutes());
    c.tex.needsUpdate = true;
  }

  private buildDucks() {
    const mat = new THREE.MeshLambertMaterial({ map: spriteTexture(14, 12, paintDuck), alphaTest: 0.5, side: THREE.DoubleSide });
    const cx = wx(POND.x) + POND.w / 2, cz = wz(POND.y) + POND.d / 2;
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(0.5, 0.42);
      geo.translate(0, 0.21, 0);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      this.scene.add(m);
      this.ducks.push({ m, cx, cz, rx: POND.w / 2 - 1.1 - i * 0.4, rz: POND.d / 2 - 0.9 - i * 0.2, phase: i * 2.1, speed: 0.25 + i * 0.06 });
    }
  }

  /**
   * Merge every static mesh that shares a material into one, so a town with hundreds of lamps,
   * benches and trees still draws in a few dozen calls on a phone.
   */
  private batch() {
    const groups = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
    this.statics.updateMatrixWorld(true);
    const keep: THREE.Object3D[] = [];
    this.statics.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (Array.isArray(m.material)) { keep.push(m); return; }
      const k = `${m.material.uuid}|${m.castShadow ? 1 : 0}`;
      let b = groups.get(k);
      if (!b) { b = { mat: m.material, cast: m.castShadow, geos: [] }; groups.set(k, b); }
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      g.clearGroups();
      b.geos.push(g);
      m.geometry.dispose();
    });
    const merged = new THREE.Group();
    for (const b of groups.values()) {
      const geo = mergeGeometries(b.geos, false);
      for (const g of b.geos) g.dispose();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = true;
      merged.add(mesh);
    }
    for (const m of keep) { m.updateMatrixWorld(true); const w = m.matrixWorld.clone(); m.removeFromParent(); w.decompose(m.position, m.quaternion, m.scale); merged.add(m); }
    this.scene.remove(this.statics);
    this.statics = merged;
    this.scene.add(merged);
  }

  // ---------- Townsfolk ----------

  private buildNpcs() {
    TOWNSFOLK.forEach((t, i) => {
      const fixed = typeof t.home !== 'string';
      const route: Tile[] = fixed ? [t.home as Tile] : districtWaypoints(t.home as string, this.blocked);
      if (!route.length) return;
      // Everyone starts somewhere different on their own beat.
      const actor = new Actor(npcLook(i), route[0], false);
      if (t.facing) { actor.facing = t.facing; actor.holdFacing = fixed; }
      this.addNpc({ id: `npc${i}`, actor, route, seed: i + 3, name: t.name, line: t.line });
      if (t.hours === 'night') this.nightOnly.add(`npc${i}`);
    });
  }

  npcInfo(id: string): { name: string; line: string } | null {
    if (id === 'board') return { name: 'Notice board', line: NOTICES[Math.floor(Date.now() / 3_600_000) % NOTICES.length] };
    const n = this.npcs.find((q) => q.id === id);
    return n ? { name: n.name, line: n.line } : null;
  }

  protected override talkAt(id: string): THREE.Vector3 | null {
    if (id === 'board') return this.board;
    return super.talkAt(id);
  }

  /** The front door of a place, for the map: walk there (jogging if it's far). */
  travel(id: string) {
    const h = this.hotspots.get(id);
    if (h) this.goTo(h);
  }

  /** Little "hiring soon" boards by the doors of jobs this couple hasn't opened yet. */
  setLocked(ids: Set<string>) {
    for (const p of PLACES) {
      if (p.kind !== 'job') continue;
      let sign = this.signs.get(p.id);
      if (!sign) {
        const tex = spriteTexture(20, 22, (g) => {
          g.fillStyle = '#6A4E34'; g.fillRect(2, 20, 2, 2); g.fillRect(16, 20, 2, 2);
          g.fillStyle = '#E8D8B0'; g.fillRect(1, 2, 18, 18);
          g.fillStyle = '#6A4E34'; g.fillRect(0, 1, 20, 2); g.fillRect(0, 19, 20, 1);
          g.fillStyle = '#C8553D'; g.fillRect(3, 5, 14, 3);
          g.fillStyle = '#3A2A22'; for (let i = 0; i < 4; i++) g.fillRect(3, 10 + i * 2, 14 - (i % 2) * 4, 1);
        });
        const geo = new THREE.PlaneGeometry(0.9, 1.0);
        geo.translate(0, 0.5, 0);
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
        m.castShadow = true;
        m.position.set(wx(p.door.x) + 1.35, 0, wz(p.door.y) + 0.1);
        this.scene.add(m);
        this.signs.set(p.id, m);
        sign = m;
      }
      sign.visible = ids.has(p.id);
    }
  }

  // ---------- Time of day ----------

  protected applyDay(d: Daylight) {
    const T = this.theme;
    const night = d.lampsOn ? 1 : 0;
    // Smooth the dusk and dawn edges a little so lamps and windows fade rather than snap.
    const dusk = d.hour >= 17.5 && d.hour < 19.5 ? (d.hour - 17.5) / 2 : d.hour >= 5 && d.hour < 6.5 ? 1 - (d.hour - 5) / 1.5 : night;
    this.hemi.color.set(mix('#FFFFFF', d.sky[1], 0.3));
    this.hemi.groundColor.set(mix('#6A5A7A', '#3A4A3A', 0.5));
    this.hemi.intensity = 0.9 * d.ambientPower;
    this.sun.color.set(d.sun);
    this.sun.intensity = d.sunPower * 1.1;
    this.r.setMood(T.mood.bloom, T.mood.grade, T.mood.gradeAmount * 0.7, mix(d.sky[1], d.sky[2], 0.4), this.scene);
    for (const l of this.lit) l.mat.emissiveIntensity = 0.95 * dusk * l.strength;
    this.glowMat.opacity = 0.85 * dusk;
    this.lantern.emissiveIntensity = 1.2 * dusk;
    for (const m of this.waterMats) m.emissiveIntensity = 0.15 + 0.2 * dusk;
    // The busker only plays once the lamps are on.
    const lampsOn = dusk > 0.5;
    for (const n of this.npcs) if (this.nightOnly.has(n.id)) n.actor.group.visible = lampsOn;
    if (T.weather === 'rain') this.hemi.color.set(mix('#FFFFFF', '#8A9AA6', 0.5));
    this.tickClock();
  }

  protected override tickArea(dt: number, t: number) {
    for (const w of this.waters) { w.offset.x = (t * 0.05) % 1; w.offset.y = Math.sin(t * 0.4) * 0.04; }
    for (const b of this.bobbers) b.o.position.y = b.y + Math.sin(t * 1.6 + b.phase) * 0.04;
    for (const k of this.ducks) {
      const a = t * k.speed + k.phase;
      k.m.position.set(k.cx + Math.cos(a) * k.rx, 0.02, k.cz + Math.sin(a) * k.rz);
      // Paddling left or right: flip the picture to match.
      k.m.scale.x = Math.sin(a) > 0 ? 1 : -1;
    }
    this.districtT += dt;
    if (this.districtT > 0.5) {
      this.districtT = 0;
      this.tickClock();
      const d = districtAt(this.me.tile);
      if (d && d.id !== this.districtId) {
        const first = this.districtId == null;
        this.districtId = d.id;
        if (!first) this.events.district?.({ name: d.name, blurb: d.blurb });
      }
    }
  }

  override start() {
    super.start();
    // Arriving shows where you are, even if it's the same district as last time.
    const d = districtAt(this.me.tile);
    this.districtId = d?.id ?? null;
    if (d) this.events.district?.({ name: d.name, blurb: d.blurb });
  }
}

const paintStoneFace = (g: CanvasRenderingContext2D, w: number, h: number) => paintStone(g, w, h);
