// Maple Street in HD-2D: a lit, walkable diorama of the town with the same pixel scale as your
// room. Buildings are painted boxes with stepped roofs, windows that glow at night, street lamps,
// trees, a fountain and townsfolk on a shared timetable.

import * as THREE from 'three';
import { mix, shade } from '../core/color';
import type { FloorPlan } from '../core/layout';
import { BENCHES, LAMPS, PARK_SOLIDS, PLACES, rowY, TOWN, TOWN_SPAWN, townBlocked, townWaypoints, type Place } from '../data/town';
import { randomWear } from '../data/clothes';
import type { ThemeKey } from '../data/themes';
import { AreaScene, type AreaEvents, type Hotspot } from './area';
import { Actor } from './actor';
import { DEFAULT_LOOK, HAIR_STYLES, type AvatarLook } from './art/avatar';
import { billboard, cbox, pbox, spriteTexture } from './art/kit';
import { solid } from './art/paint';
import { canvas, rng, texture, PPU } from './art/pixel';
import { paintFacade, paintGlow, paintGround, paintRoof, paintSide, paintStone, paintTree, paintWater } from './art/town';
import type { Daylight } from './daylight';

/** The town's floor: one big rectangle (what's solid is in the blocked set). */
export const TOWN_FLOOR: FloorPlan = { w: TOWN.w, d: TOWN.d, rooms: [{ id: 'street', name: 'Maple Street', x: 0, y: 0, w: TOWN.w, d: TOWN.d }] };

const wx = (x: number) => x - 3.5;
const wz = (y: number) => y - 3.5;

export function npcLook(n: number): AvatarLook {
  return { ...DEFAULT_LOOK, body: n % 2 ? 'girl' : 'guy', hair: HAIR_STYLES[(n * 5 + 1) % HAIR_STYLES.length], hairColor: (n * 3 + 2) % 8, skin: (n * 5 + 3) % 6, wear: randomWear(n + 40), eyes: n % 4 };
}

export const TOWNSFOLK: { name: string; line: string }[] = [
  { name: 'Mrs. Alvarez', line: 'The café makes the best cinnamon rolls on Maple Street.' },
  { name: 'Theo', line: 'I deliver the post by bike. Come work with me!' },
  { name: 'Grandpa Joon', line: 'Be kind to each other. That is the whole secret.' },
  { name: 'Priya', line: 'I check the boutique every Monday for the new rack.' },
  { name: 'Mr. Okafor', line: 'Realty is on the right. Homes grow with the people in them.' },
  { name: 'Bea', line: 'Look, the park fountain is running again!' },
  { name: 'Sam the baker', line: 'Come by the cart later for something sweet to share.' },
  { name: 'Lena', line: 'I heard the pet shop is opening soon. I can’t wait.' },
];

interface Lit { mat: THREE.MeshLambertMaterial; strength: number }

export class TownScene extends AreaScene {
  private lit: Lit[] = [];
  private glows: THREE.Mesh[] = [];
  private signs = new Map<string, THREE.Object3D>();
  private water: THREE.Mesh | null = null;
  private ground!: THREE.Mesh;
  private skyColor = new THREE.Color('#7EC0E8');

  constructor(r: ConstructorParameters<typeof AreaScene>[0], themeKey: ThemeKey, looks: { me: AvatarLook; partner: AvatarLook }, events: AreaEvents) {
    super(r, themeKey, TOWN_FLOOR, looks, events, { pitch: 1.0, fitW: 15 }, TOWN_SPAWN);
    this.blocked = townBlocked();
    // The street is narrow: keep it in the middle of the screen and stop before the empty lawn at either end.
    this.camBounds = { x: [wx(5.5), wx(8.5)], z: [wz(9), wz(36)] };
    this.build();
  }

  // ---------- Building the street ----------

  private build() {
    this.buildGround();
    for (const p of PLACES) this.buildPlace(p);
    this.buildTrees();
    this.buildLamps();
    this.buildBenches();
    this.buildNpcs();
  }

  private buildGround() {
    // A wide, plain lawn under everything so the edge of the map never shows void.
    const lawn = canvas(32, 32)[0];
    const lg = lawn.getContext('2d')!;
    const r = rng(5);
    lg.fillStyle = '#5E9650'; lg.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 90; i++) { lg.fillStyle = r() < 0.5 ? '#6FA85A' : '#4E8446'; lg.fillRect((r() * 32) | 0, (r() * 32) | 0, 1, 1); }
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(60, 90), new THREE.MeshLambertMaterial({ map: texture(lawn, [60 / 2, 90 / 2]) }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(wx(TOWN.w / 2), -0.02, wz(TOWN.d / 2));
    outer.receiveShadow = true;
    this.scene.add(outer);

    const [c, g] = canvas(TOWN.w * PPU, TOWN.d * PPU);
    paintGround(g, c.width, c.height);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(TOWN.w, TOWN.d), new THREE.MeshLambertMaterial({ map: texture(c) }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(wx(TOWN.w / 2), 0, wz(TOWN.d / 2));
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
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
    if (p.style === 'park') { this.buildPark(p); return; }
    if (p.style === 'cart') { this.buildCart(p); return; }
    const group = new THREE.Group();
    const W = p.w, D = p.d, Hh = p.h;
    const wPx = Math.round(W * PPU), hPx = Math.round(Hh * PPU), dPx = Math.round(D * PPU);
    const front = this.faceMat((c, g) => paintFacade(c, g, p, wPx, hPx), wPx, hPx);
    const side = this.faceMat((c, g) => paintSide(c, g, p, dPx, hPx), dPx, hPx);
    const plain = new THREE.MeshLambertMaterial({ color: shade(p.palette.wall, -0.2) });
    const top = new THREE.MeshLambertMaterial({ color: p.palette.roof });
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, D), [side, plain, top, plain, front, plain]);
    body.position.set(wx(p.x) + W / 2, Hh / 2, wz(p.y) + D / 2);
    body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    this.roof(group, p);
    this.scene.add(group);

    // A door-step glow so the way in reads from far away.
    const hotspot: Hotspot = {
      id: p.id, kind: p.kind, label: p.name,
      approach: p.door,
      at: new THREE.Vector3(wx(p.door.x) + 0.5, Hh + 0.7, wz(p.y) + D),
    };
    this.addHotspot(hotspot, [body]);
  }

  private roof(g: THREE.Group, p: Place) {
    const { x, y, w, d, h } = p;
    const flat = p.style === 'labs' || p.style === 'parcel' || p.style === 'home' || p.style === 'boarded';
    const tex = (base: string) => ({ top: (gx: CanvasRenderingContext2D, ww: number, hh: number) => paintRoof(gx, ww, hh, base, flat), sides: solid(shade(base, -0.2)) });
    if (flat) {
      // Parapet around a flat roof.
      const cap = pbox(wx(x) - 0.12, h, wz(y) - 0.12, w + 0.24, 0.22, d + 0.24, { ...tex(p.palette.roof), front: solid(shade(p.palette.trim, 0.1)), right: solid(shade(p.palette.trim, -0.05)) });
      g.add(cap);
      if (p.style === 'labs') {
        g.add(cbox(wx(x) + w - 1.1, h + 0.22, wz(y) + 0.6, 0.12, 1.3, 0.12, '#8A8A96'));
        g.add(cbox(wx(x) + w - 1.3, h + 1.2, wz(y) + 0.6, 0.5, 0.08, 0.08, '#8A8A96'));
        g.add(cbox(wx(x) + 0.6, h + 0.22, wz(y) + 0.6, 0.9, 0.5, 0.8, '#7A8A96'));
      }
      if (p.style === 'home') {
        // A chimney and a water tank, so it reads as a building people live in.
        g.add(cbox(wx(x) + 0.6, h + 0.22, wz(y) + 0.6, 0.5, 0.9, 0.5, shade(p.palette.wall, -0.25)));
        g.add(cbox(wx(x) + w - 1.4, h + 0.22, wz(y) + 0.8, 0.9, 0.9, 0.9, '#7A8A96'));
      }
      return;
    }
    // Gabled look as three stepped slabs.
    const steps: [number, number][] = [[0.34, 0.26], [1.1, 0.26]];
    steps.forEach(([inset, ht], i) => {
      const iw = w + 0.36 - inset * 1.2 * (i ? 1 : 0), idp = d + 0.36 - inset * 0.55 * (i ? 1 : 0);
      if (iw <= 0.8) return;
      g.add(pbox(wx(x) + (w - iw) / 2, h + i * 0.26, wz(y) + (d - idp) / 2 - (i ? 0 : 0.0), iw, ht, idp, { ...tex(shade(p.palette.roof, i * 0.04)), front: solid(shade(p.palette.roof, -0.1)) }));
    });
    if (p.style === 'cafe' || p.style === 'realty' || p.style === 'chapel') {
      g.add(cbox(wx(x) + w - 1.2, h + 0.3, wz(y) + 0.5, 0.5, 0.9, 0.5, shade(p.palette.wall, -0.3)));
    }
    if (p.style === 'chapel') {
      // Bell tower with a spire and a cross.
      const tx = wx(x) + w / 2 - 0.7, tz = wz(y) + 0.3;
      g.add(pbox(tx, h + 0.5, tz, 1.4, 1.8, 1.4, { sides: (gx, ww, hh) => { solid(p.palette.wall)(gx, ww, hh); gx.fillStyle = '#3A2A22'; gx.fillRect(ww / 2 - 3, 6, 6, 12); gx.fillStyle = shade(p.palette.trim, -0.1); gx.fillRect(0, 0, ww, 2); } }));
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.5, 4), new THREE.MeshLambertMaterial({ color: p.palette.roof }));
      spire.rotation.y = Math.PI / 4;
      spire.position.set(tx + 0.7, h + 2.3 + 0.75, tz + 0.7);
      spire.castShadow = true;
      g.add(spire);
      g.add(cbox(tx + 0.66, h + 3.8, tz + 0.66, 0.08, 0.7, 0.08, p.palette.accent));
      g.add(cbox(tx + 0.5, h + 4.1, tz + 0.66, 0.4, 0.08, 0.08, p.palette.accent));
    }
  }

  // ---------- Park and cart ----------

  private buildPark(p: Place) {
    const g = new THREE.Group();
    const cx = wx(10) + 0.5, cz = wz(rowY(1) + 1) + 0.5;
    // Fountain: stone basin, water, a little spout.
    g.add(pbox(cx - 0.55, 0, cz - 0.55, 1.1, 0.35, 1.1, { sides: paintStoneFace, top: paintStoneFace }));
    const water = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), new THREE.MeshLambertMaterial({ map: spriteTexture(14, 14, paintWater), emissive: '#4E98C8', emissiveIntensity: 0.25 }));
    water.rotation.x = -Math.PI / 2; water.position.set(cx, 0.37, cz);
    this.water = water;
    g.add(water);
    g.add(cbox(cx - 0.07, 0.35, cz - 0.07, 0.14, 0.55, 0.14, '#B8B0A4'));
    g.add(cbox(cx - 0.2, 0.9, cz - 0.2, 0.4, 0.08, 0.4, '#9ED0F0'));
    // Low fence around the lawn.
    const y0 = rowY(1), x0 = p.x, x1 = p.x + p.w;
    for (let x = x0; x < x1; x += 1) g.add(cbox(wx(x) + 0.42, 0, wz(y0) - 0.04, 0.16, 0.5, 0.08, '#E8D8B8', { cast: false }));
    g.add(cbox(wx(x0), 0.32, wz(y0) - 0.04, p.w, 0.08, 0.06, '#E8D8B8', { cast: false }));
    // A flower bed.
    const bed = spriteTexture(48, 16, (gx, w, h) => {
      const r = rng(3);
      gx.fillStyle = '#5E4630'; gx.fillRect(0, 0, w, h);
      const bloom = ['#E8506A', '#F2C14E', '#FFFFFF', '#B09AE8'];
      for (let i = 0; i < 40; i++) { gx.fillStyle = r() < 0.4 ? '#4E8446' : bloom[(r() * 4) | 0]; gx.fillRect((r() * (w - 2)) | 0, (r() * (h - 2)) | 0, 2, 2); }
    });
    const bedMesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), new THREE.MeshLambertMaterial({ map: bed }));
    bedMesh.rotation.x = -Math.PI / 2; bedMesh.position.set(wx(p.x) + 1.5 + 1, 0.02, wz(y0 + 2) + 0.5);
    g.add(bedMesh);
    this.scene.add(g);
    // Trees at the back corners of the lawn.
    for (const t of PARK_SOLIDS.slice(1)) this.tree(t.x, t.y, 7);
    const hotspot: Hotspot = { id: p.id, kind: 'public', label: p.name, approach: p.door, at: new THREE.Vector3(cx, 1.6, cz) };
    const pick = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.4, p.d), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(wx(p.x) + p.w / 2, 0.2, wz(p.y) + p.d / 2);
    this.scene.add(pick);
    this.addHotspot(hotspot, [pick]);
  }

  private buildCart(p: Place) {
    const g = new THREE.Group();
    const x0 = wx(p.x), z0 = wz(p.y);
    // Counter with a striped awning on two poles.
    g.add(pbox(x0, 0, z0 + 0.2, p.w, 0.9, p.d - 0.4, { sides: solid(p.palette.wall), top: solid(shade(p.palette.wall, 0.1)), front: (gx, w, h) => { solid(p.palette.wall)(gx, w, h); gx.fillStyle = shade(p.palette.trim, -0.1); gx.fillRect(0, h - 3, w, 3); for (let i = 4; i < w - 4; i += 8) { gx.fillStyle = '#FFF2D0'; gx.fillRect(i, 4, 5, 4); gx.fillStyle = '#C8A06E'; gx.fillRect(i + 1, 5, 3, 2); } } }));
    for (const px of [x0 + 0.1, x0 + p.w - 0.18]) g.add(cbox(px, 0.9, z0 + p.d - 0.3, 0.08, 1.2, 0.08, '#8A6A4A'));
    for (const px of [x0 + 0.1, x0 + p.w - 0.18]) g.add(cbox(px, 0.9, z0 + 0.25, 0.08, 1.2, 0.08, '#8A6A4A'));
    const aw = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.3, 0.12, p.d), new THREE.MeshLambertMaterial({ map: spriteTexture(p.w * PPU, 16, (gx, w, h) => { for (let i = 0; i < w; i++) { gx.fillStyle = ((i >> 2) & 1) ? '#FFF2D0' : '#E8506A'; gx.fillRect(i, 0, 1, h); } }) }));
    aw.position.set(x0 + p.w / 2, 2.1, z0 + p.d / 2);
    aw.castShadow = true;
    g.add(aw);
    this.scene.add(g);
    const hotspot: Hotspot = { id: p.id, kind: 'public', label: p.name, approach: p.door, at: new THREE.Vector3(x0 + p.w / 2, 2.6, z0 + p.d - 0.3) };
    const pick = new THREE.Mesh(new THREE.BoxGeometry(p.w, 2, p.d), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(x0 + p.w / 2, 1, z0 + p.d / 2);
    this.scene.add(pick);
    this.addHotspot(hotspot, [pick]);
  }

  // ---------- Street furniture ----------

  private tree(tx: number, ty: number, seed: number) {
    const m = billboard(spriteTexture(24, 32, (g, w, h) => paintTree(g, w, h, seed)), 1.5, 2);
    m.position.set(wx(tx) + 0.5, 0, wz(ty) + 0.8);
    this.scene.add(m);
  }

  private buildTrees() {
    for (let y = 1; y < TOWN.d - 2; y += 2) {
      this.tree(0, y, y);
      this.tree(TOWN.w - 1, y, y + 1);
    }
    for (let x = 1; x < TOWN.w - 1; x += 2) this.tree(x, 0, x + 2);
  }

  private buildLamps() {
    const glowTex = spriteTexture(16, 16, paintGlow);
    for (const l of LAMPS) {
      const g = new THREE.Group();
      g.add(cbox(wx(l.x) + 0.42, 0, wz(l.y) + 0.42, 0.14, 1.9, 0.14, '#3A3A46'));
      g.add(cbox(wx(l.x) + 0.3, 1.9, wz(l.y) + 0.3, 0.38, 0.34, 0.38, '#FFE9B0'));
      g.add(cbox(wx(l.x) + 0.26, 2.24, wz(l.y) + 0.26, 0.46, 0.08, 0.46, '#3A3A46'));
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      glow.position.set(wx(l.x) + 0.5, 2.05, wz(l.y) + 0.5);
      glow.rotation.y = Math.atan2(0.62, 0.78);
      this.glows.push(glow);
      g.add(glow);
      this.scene.add(g);
    }
  }

  private buildBenches() {
    for (const b of BENCHES) {
      this.scene.add(pbox(wx(b.tile.x) + 0.1, 0, wz(b.tile.y) + 0.3, 0.8, 0.38, 0.4, { sides: solid('#8A6244'), top: solid('#A87A54') }));
      this.scene.add(pbox(wx(b.tile.x) + 0.1, 0.38, wz(b.tile.y) + 0.26, 0.8, 0.4, 0.1, { sides: solid('#7A5438'), top: solid('#A87A54') }));
    }
  }

  private buildNpcs() {
    const wps = townWaypoints();
    TOWNSFOLK.forEach((n, i) => {
      // Each person keeps to a stretch of the street (a few rows) so the town feels lived in, not random.
      const lo = (i * 3) % wps.length;
      const route = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => wps[(lo + k * 4) % wps.length]);
      const actor = new Actor(npcLook(i), route[0], false);
      this.addNpc({ id: `npc${i}`, actor, route, seed: i + 3, name: n.name, line: n.line });
    });
  }

  npcInfo(id: string): { name: string; line: string } | null {
    const n = this.npcs.find((q) => q.id === id);
    return n ? { name: n.name, line: n.line } : null;
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
        const m = billboard(tex, 0.9, 1.0, { cast: false });
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
    this.skyColor.set(mix(d.sky[0], d.sky[1], 0.55));
    this.scene.background = this.skyColor;
    this.r.setMood(T.mood.bloom, T.mood.grade, T.mood.gradeAmount * 0.7, mix(d.sky[1], d.sky[2], 0.4), this.scene);
    for (const l of this.lit) l.mat.emissiveIntensity = 0.95 * dusk * l.strength;
    for (const g of this.glows) (g.material as THREE.MeshBasicMaterial).opacity = 0.85 * dusk;
    // Street lamps read warmer than the sky; rain themes pull everything toward grey.
    if (T.weather === 'rain') this.hemi.color.set(mix('#FFFFFF', '#8A9AA6', 0.5));
  }

  protected override tickArea(_dt: number, t: number) {
    if (this.water) (this.water.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.22 + 0.06 * Math.sin(t * 2);
  }
}

const paintStoneFace = (g: CanvasRenderingContext2D, w: number, h: number) => paintStone(g, w, h);

