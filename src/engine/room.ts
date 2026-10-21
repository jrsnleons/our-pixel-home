// The studio shell: floor slab, two walls with wainscot and wallpaper, the window with a
// live sky, the front door, and the room's lights.

import * as THREE from 'three';
import { mix, ramp, shade } from '../core/color';
import { ROOM } from '../core/grid';
import { ORIGIN, STUDIO, type FloorPlan } from '../core/layout';
import type { Theme } from '../data/themes';
import { cbox, dispose, flat, pbox } from './art/kit';
import { solid, wood } from './art/paint';
import { bevel, canvas, disc, frame as frameRect, px, PPU, rng, texture, woodFace, type Ctx } from './art/pixel';
import { paintFloor, paintSlab, paintWainscot, paintWallpaper } from './art/surfaces';
import type { Daylight } from './daylight';

export interface RoomStyle { wallpaper: string; wallTint: string; floor: string; floorTint: string | null; curtains: boolean }

const HALF = ORIGIN.w / 2; // 3.5: the back wall sits at z = -HALF and the left wall at x = -HALF in every home
const WALL_H = 4.3;
const WALL_T = 0.25;

export class RoomShell {
  readonly group = new THREE.Group();
  /** The front door and its mat: tap either to step outside. */
  readonly doorPicks: THREE.Object3D[] = [];
  private skyCtx: Ctx;
  private skyTex: THREE.CanvasTexture;
  private shaft: THREE.Mesh;
  private dust: THREE.Points;
  private dustBase: Float32Array;
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  private floorMat: THREE.MeshLambertMaterial;
  private wallMats: THREE.MeshLambertMaterial[] = [];
  private curtainGroup = new THREE.Group();
  private T: Theme;
  private day: Daylight | null = null;
  private rain: { x: number; y: number; s: number }[] = [];
  private L: FloorPlan;

  constructor(T: Theme, style: RoomStyle, L: FloorPlan = STUDIO) {
    this.T = T;
    this.L = L;
    const g = this.group;
    // The studio anchors the world frame, so a bigger home grows toward +x and +z from it.
    const cx = -HALF + L.w / 2, cz = -HALF + L.d / 2;

    // Floor slab: painted top, cut-earth sides.
    this.floorMat = new THREE.MeshLambertMaterial();
    const slabSide = new THREE.MeshLambertMaterial({ map: this.paintTex(L.w * PPU, 8, (c, w, h) => paintSlab(c, w, h, T.slab)) });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(L.w, 0.5, L.d), [slabSide, slabSide, this.floorMat, flat(shade(T.slab, -0.3)), slabSide, slabSide]);
    slab.position.set(cx, -0.25, cz);
    slab.receiveShadow = true;
    slab.userData.floor = true;
    g.add(slab);

    // Walls. They never cast shadows so the sun can reach the room through the "missing" walls.
    const cap = flat(shade(T.wall.trim, -0.25));
    const body = flat(shade(T.wall.trim, -0.1));
    const back = new THREE.Mesh(new THREE.BoxGeometry(L.w + WALL_T, WALL_H, WALL_T), [body, body, cap, cap, body, body]);
    back.position.set(cx - WALL_T / 2, WALL_H / 2, -HALF - WALL_T / 2);
    const left = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, WALL_H, L.d), [body, body, cap, cap, body, body]);
    left.position.set(-HALF - WALL_T / 2, WALL_H / 2, cz);
    for (const w of [back, left]) { w.receiveShadow = true; w.userData.wall = w === back ? 'back' : 'left'; g.add(w); }

    // Wallpaper and wainscot faces (separate so they can be restyled cheaply).
    for (const side of ['back', 'left'] as const) {
      const paper = new THREE.MeshLambertMaterial();
      this.wallMats.push(paper);
      const len = side === 'back' ? L.w : L.d;
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(len, WALL_H - ROOM.wainscot), paper);
      const wm = new THREE.Mesh(new THREE.PlaneGeometry(len, ROOM.wainscot), new THREE.MeshLambertMaterial({ map: this.paintTex(len * PPU, 16, (c, w) => paintWainscot(c, w, T.wall.trim, T.outline)) }));
      // Crown molding along the top.
      const crown = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.1), [flat(T.wall.trim), flat(T.wall.trim), flat(shade(T.wall.trim, 0.12)), flat(T.wall.trim), new THREE.MeshLambertMaterial({ map: this.paintTex(len * PPU, 3, (c, w, h) => { px(c, shade(T.wall.trim, 0.1), 0, 0, w, h); px(c, shade(T.wall.trim, -0.15), 0, h - 1, w, 1); for (let x = 0; x < w; x += 4) px(c, shade(T.wall.trim, -0.05), x, 1); }) }), flat(T.wall.trim)]);
      if (side === 'back') {
        pm.position.set(cx, ROOM.wainscot + (WALL_H - ROOM.wainscot) / 2, -HALF + 0.002);
        wm.position.set(cx, ROOM.wainscot / 2, -HALF + 0.004);
        crown.position.set(cx, WALL_H - 0.07, -HALF + 0.05);
      } else {
        for (const m of [pm, wm, crown]) m.rotation.y = Math.PI / 2;
        pm.position.set(-HALF + 0.002, ROOM.wainscot + (WALL_H - ROOM.wainscot) / 2, cz);
        wm.position.set(-HALF + 0.004, ROOM.wainscot / 2, cz);
        crown.position.set(-HALF + 0.05, WALL_H - 0.07, cz);
      }
      for (const m of [pm, wm]) { m.receiveShadow = true; m.userData.wall = side; }
      g.add(pm, wm, crown);
    }

    // Window: frame, sill, live sky, mullions. Back wall, x -0.5..1.5, y 2..4.
    const [sc, sg] = canvas(32, 28);
    this.skyCtx = sg;
    this.skyTex = texture(sc);
    const wx = 0.5, wy = 2.95, ww = 1.7, wh = 1.5;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshBasicMaterial({ map: this.skyTex, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
    glass.position.set(wx, wy, -HALF + 0.01);
    g.add(glass);
    const fr = T.wood;
    const frameMat = (w: number, h: number) => pbox(0, 0, 0, w, h, 0.12, { front: wood(fr, { plank: 3 }), sides: solid(shade(fr, -0.1)), top: solid(shade(fr, 0.1)) }, { cast: false });
    const addFrame = (x: number, y: number, w: number, h: number) => { const m = frameMat(w, h); m.position.set(x + w / 2, y + h / 2, -HALF + 0.06); g.add(m); };
    addFrame(wx - ww / 2 - 0.1, wy - wh / 2 - 0.1, ww + 0.2, 0.12);
    addFrame(wx - ww / 2 - 0.1, wy + wh / 2 - 0.02, ww + 0.2, 0.12);
    addFrame(wx - ww / 2 - 0.1, wy - wh / 2, 0.12, wh);
    addFrame(wx + ww / 2 - 0.02, wy - wh / 2, 0.12, wh);
    addFrame(wx - 0.04, wy - wh / 2, 0.08, wh);
    addFrame(wx - ww / 2, wy - 0.04, ww, 0.08);
    const sill = pbox(wx - ww / 2 - 0.2, wy - wh / 2 - 0.2, -HALF, ww + 0.4, 0.1, 0.28, { top: wood(shade(fr, 0.05)), sides: solid(shade(fr, -0.12)) });
    sill.castShadow = true;
    g.add(sill);
    g.add(this.curtainGroup);
    this.buildCurtains(style.curtains);

    // Light shaft through the window, with dust drifting in it.
    const shaftTex = this.paintTex(8, 32, (c) => {
      for (let y = 0; y < 32; y++) {
        const a = 0.9 - Math.floor(y / 8) * 0.22;
        c.fillStyle = `rgba(255,255,255,${a})`; c.fillRect(1, y, 6, 1);
        c.fillStyle = `rgba(255,255,255,${a * 0.45})`; c.fillRect(0, y, 1, 1); c.fillRect(7, y, 1, 1);
      }
    });
    this.shaft = new THREE.Mesh(new THREE.PlaneGeometry(ww, 3.6), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.shaft.position.set(wx, 1.55, -HALF + 1.35);
    this.shaft.rotation.x = -0.62;
    g.add(this.shaft);
    const N = 60;
    this.dustBase = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { this.dustBase[i * 3] = wx - 0.9 + Math.random() * 1.8; this.dustBase[i * 3 + 1] = Math.random() * 3; this.dustBase[i * 3 + 2] = -HALF + 0.3 + Math.random() * 2.6; }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dustBase.slice(), 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#FFE9C0', size: 0.045, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(this.dust);

    // Door on the left wall at z 0.5..2.5.
    this.buildDoor();

    // Lights.
    this.hemi = new THREE.HemisphereLight(T.mood.ambient, T.mood.ground, T.mood.ambientPower);
    this.sun = new THREE.DirectionalLight('#ffffff', 1.5);
    this.sun.position.set(cx - 3, 9, cz + 7);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const reach = Math.max(L.w, L.d) / 2 + 2.5;
    Object.assign(this.sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 26 });
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    g.add(this.hemi, this.sun, this.sun.target);

    for (let i = 0; i < 26; i++) this.rain.push({ x: Math.random() * 32, y: Math.random() * 28, s: 0.7 + Math.random() * 0.6 });
    this.setStyle(style);
  }

  private paintTex(w: number, h: number, p: (c: Ctx, w: number, h: number) => void, repeat?: [number, number]) {
    const [c, g] = canvas(w, h);
    p(g, w, h);
    return texture(c, repeat);
  }

  setStyle(style: RoomStyle) {
    this.floorMat.map?.dispose();
    this.floorMat.map = this.paintTex(64, 64, (c) => paintFloor(c, style.floor, style.floorTint), [this.L.w / 4, this.L.d / 4]);
    this.floorMat.needsUpdate = true;
    const key = style.wallpaper;
    this.wallMats.forEach((m, i) => {
      m.map?.dispose();
      m.map = this.paintTex(32, 32, (c) => paintWallpaper(c, key, style.wallTint, this.T.accent), [(i === 0 ? this.L.w : this.L.d) / 2, (WALL_H - ROOM.wainscot) / 2]);
      m.needsUpdate = true;
    });
    this.buildCurtains(style.curtains);
  }

  private buildCurtains(on: boolean) {
    for (const c of [...this.curtainGroup.children]) { this.curtainGroup.remove(c); dispose(c); }
    const T = this.T;
    const rodY = 3.92;
    this.curtainGroup.add(cbox(-0.85, rodY, -HALF + 0.08, 2.7, 0.06, 0.06, shade(T.wood, -0.2)));
    for (const x of [-0.85, 1.79]) this.curtainGroup.add(cbox(x - 0.03, rodY - 0.03, -HALF + 0.06, 0.12, 0.12, 0.1, T.metal));
    if (!on) return;
    const c = ramp(T.curtain);
    const paint = (g: Ctx, w: number, h: number) => {
      for (let x = 0; x < w; x++) px(g, [c[1], c[2], c[3], c[2]][x % 4], x, 0, 1, h);
      const tie = (h * 0.62) | 0;
      px(g, shade(T.wood, -0.1), 0, tie, w, 2);
      for (let x = 0; x < w; x += 2) px(g, c[0], x, h - 1);
      px(g, c[4], 0, 0, w, 1);
    };
    for (const x of [-0.8, 1.32]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 2.1), new THREE.MeshLambertMaterial({ map: this.paintTex(8, 34, paint), side: THREE.DoubleSide }));
      m.position.set(x + 0.24, rodY - 1.05, -HALF + 0.12);
      m.castShadow = true;
      this.curtainGroup.add(m);
    }
  }

  private buildDoor() {
    const T = this.T;
    const g = this.group;
    const z0 = 0.5, z1 = 2.5, h = 2.7;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0 - 0.3, h - 0.15), new THREE.MeshLambertMaterial({ map: this.paintTex(26, 41, (c, w, hh) => {
      const d = ramp(T.darkWood);
      woodFace(c, 0, 0, w, hh, d[2], 41, 6, true);
      for (const [y0, y1] of [[3, 18], [21, 37]]) for (const [x0, x1] of [[3, 11], [14, 22]]) {
        frameRect(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, d[0]);
        px(c, d[3], x0 + 1, y0 + 1, x1 - x0 - 1, 1);
        px(c, d[1], x0 + 1, y1 - 1, x1 - x0 - 1, 1);
      }
      disc(c, '#E8C060', 22, 21, 1); px(c, '#FFF2B0', 21, 20);
      px(c, '#B88A30', 21, 24, 2, 3);
      bevel(c, 0, 0, w, hh, d[4], d[0]);
      // A little wreath with a heart.
      for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; px(c, a % 3 ? '#4F7A3A' : '#6E9A4A', Math.round(12 + Math.cos(t) * 4), Math.round(10 + Math.sin(t) * 4)); }
      px(c, '#E8506A', 11, 13, 3, 1); px(c, '#E8506A', 12, 14);
    }) }));
    door.rotation.y = Math.PI / 2;
    door.position.set(-HALF + 0.02, (h - 0.15) / 2, (z0 + z1) / 2);
    door.receiveShadow = true;
    g.add(door);
    this.doorPicks.push(door);
    const trim = shade(T.wall.trim, -0.05);
    const t1 = pbox(-HALF, 0, z0, 0.1, h, 0.15, { sides: solid(trim), top: solid(shade(trim, 0.1)) }, { cast: false });
    const t2 = pbox(-HALF, 0, z1 - 0.15, 0.1, h, 0.15, { sides: solid(trim), top: solid(shade(trim, 0.1)) }, { cast: false });
    const t3 = pbox(-HALF, h - 0.15, z0, 0.1, 0.18, z1 - z0, { sides: solid(trim), top: solid(shade(trim, 0.1)) }, { cast: false });
    g.add(t1, t2, t3);
    // Welcome mat.
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.5), new THREE.MeshLambertMaterial({ map: this.paintTex(11, 24, (c, w, hh) => {
      const m = ramp('#B88A50');
      px(c, m[2], 0, 0, w, hh);
      for (let y = 0; y < hh; y += 2) for (let x = (y / 2) % 2; x < w; x += 2) px(c, m[1], x, y);
      bevel(c, 0, 0, w, hh, m[3], m[0]);
      for (let y = 5; y < 19; y += 6) { px(c, '#C8572B', 3, y, 5, 1); px(c, '#C8572B', 4, y + 1, 3, 1); px(c, '#C8572B', 5, y + 2); px(c, '#C8572B', 3, y - 1); px(c, '#C8572B', 7, y - 1); }
    }), transparent: false }));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(-HALF + 0.42, 0.012, (z0 + z1) / 2);
    mat.receiveShadow = true;
    g.add(mat);
    this.doorPicks.push(mat);
  }

  /** Apply time of day: sky colors, sun, ambient, shaft. Cheap; call once a minute. */
  applyDaylight(d: Daylight) {
    this.day = d;
    const T = this.T;
    this.hemi.color.set(mix(T.mood.ambient, d.sky[2], 0.25));
    this.hemi.groundColor.set(T.mood.ground);
    this.hemi.intensity = T.mood.ambientPower * d.ambientPower;
    this.sun.color.set(d.sun);
    this.sun.intensity = d.sunPower;
    (this.shaft.material as THREE.MeshBasicMaterial).opacity = d.shaft;
    (this.shaft.material as THREE.MeshBasicMaterial).color.set(mix(d.sun, '#FFFFFF', 0.4));
    (this.dust.material as THREE.PointsMaterial).opacity = Math.min(0.8, d.shaft * 5);
  }

  /** Animate sky details (clouds, stars, rain) and dust. */
  tick(t: number, dt: number, reduceMotion: boolean) {
    const d = this.day;
    if (d) this.paintSky(t, d, dt, reduceMotion);
    const p = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    if (!reduceMotion) {
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + dt * 0.07;
        if (y > 3.3) y = 0.1;
        p.setY(i, y);
        p.setX(i, this.dustBase[i * 3] + Math.sin(t * 0.6 + i) * 0.08);
      }
      p.needsUpdate = true;
    }
  }

  private skyTimer = 0;
  private paintSky(t: number, d: Daylight, dt: number, reduce: boolean) {
    this.skyTimer += dt;
    if (this.skyTimer < 0.1 && this.skyTex.version > 0) return;
    this.skyTimer = 0;
    const g = this.skyCtx;
    const [top, mid, low] = d.sky;
    const W = 32, H = 28;
    for (let y = 0; y < H; y++) {
      const f = y / (H - 1);
      const c = f < 0.45 ? mix(top, mid, f / 0.45) : mix(mid, low, (f - 0.45) / 0.55);
      px(g, c, 0, y, W, 1);
    }
    // Dither the bands so it looks hand-placed.
    const r = rng(3);
    for (let i = 0; i < 40; i++) { const x = (r() * W) | 0, y = (r() * H) | 0; px(g, mix(top, low, y / H + 0.08), x, y); }
    if (d.stars > 0.05) {
      const pts = [[4, 4], [9, 9], [15, 5], [21, 12], [27, 4], [6, 16], [18, 19], [11, 2], [25, 17], [29, 9], [2, 11]];
      pts.forEach(([x, y], i) => { const tw = reduce ? 1 : Math.sin(t * 2 + i * 1.7); if (tw > 0.4 - d.stars) px(g, mix(mid, '#FFF6D6', d.stars), x, y); });
    }
    if (d.celestial === 'moon') { disc(g, '#FFF2C4', 22, 6, 3); disc(g, top, 23, 5, 2); }
    if (d.celestial === 'sun') {
      const sy = d.label === 'golden' || d.label === 'dusk' ? 19 : d.label === 'dawn' ? 21 : 7;
      disc(g, mix('#FFF6D0', d.sun, 0.4), 24, sy, 3);
      if (d.label === 'golden') { px(g, '#FFE2A0', 18, sy + 4, 12, 1); }
      // Clouds drifting.
      const cx = reduce ? 6 : Math.floor((t * 1.2) % 44) - 10;
      const cc = mix('#FFFFFF', low, 0.2);
      px(g, cc, cx, 9, 7, 2); px(g, cc, cx + 2, 8, 3, 1); px(g, cc, cx + 12, 15, 5, 1); px(g, cc, cx + 13, 14, 2, 1);
    }
    // Rooftops across the street.
    const roof = mix(low, '#1A1A2A', d.label === 'night' ? 0.75 : 0.45);
    px(g, roof, 0, 22, 9, 6); px(g, roof, 1, 20, 6, 2); px(g, roof, 12, 24, 10, 4); px(g, roof, 23, 21, 9, 7); px(g, roof, 25, 19, 3, 2);
    const lit = d.lampsOn ? '#FFD27A' : mix(roof, '#FFFFFF', 0.15);
    for (const [x, y] of [[3, 24], [6, 24], [15, 25], [26, 23], [29, 25]]) px(g, lit, x, y);
    if (this.T.weather === 'rain') {
      for (const drop of this.rain) {
        if (!reduce) drop.y += 1.6 * drop.s;
        if (drop.y > H) { drop.y = -2; drop.x = Math.random() * W; }
        px(g, '#D8E6EC', drop.x | 0, drop.y | 0, 1, 2);
      }
    }
    this.skyTex.needsUpdate = true;
  }

  dispose() {
    dispose(this.group);
  }
}
