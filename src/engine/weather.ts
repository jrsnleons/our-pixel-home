// Weather and night fog for the town: rain, snow and mist drawn in the same chunky pixels as
// everything else, and a depth fog that thickens after dark. Which weather it is comes from the
// calendar, so both of you stand under the same sky without a single message between phones.

import * as THREE from 'three';
import { mix } from '../core/color';
import { rngAt } from '../core/hash';
import type { WeatherKind } from '../data/weather';
import { view } from './art/kit';
import { canvas, texture } from './art/pixel';

const BOX = { w: 26, h: 15, d: 26 };
const RAIN_N = 420;
const SNOW_N = 280;
const PIXEL = 1 / 16;

/** A soft patch of mist in four dithered steps, so it reads as pixel art and not as a blur. */
function mistTexture(seed: number): THREE.CanvasTexture {
  const S = 64;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const blobs = Array.from({ length: 9 }, (_, i) => ({ x: rngAt(seed, i * 3) * S, y: rngAt(seed, i * 3 + 1) * S, r: 9 + rngAt(seed, i * 3 + 2) * 13 }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let a = 0;
    for (const b of blobs) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const d = Math.hypot(x - (b.x + ox), y - (b.y + oy)) / b.r;
      if (d < 1) a = Math.max(a, 1 - d);
    }
    const q = Math.min(1, Math.floor(a * 4 + bayer[(y % 4) * 4 + (x % 4)] / 16) / 3);
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(q * 255);
  }
  g.putImageData(img, 0, 0);
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class WeatherFx {
  readonly group = new THREE.Group();
  private readonly fog = new THREE.Fog('#8090A8', 30, 90);
  private rain: THREE.InstancedMesh;
  private snow: THREE.InstancedMesh;
  private layers: { mesh: THREE.Mesh; tex: THREE.CanvasTexture; speed: number; y: number }[] = [];
  private px = new Float32Array(RAIN_N * 3);
  private sx = new Float32Array(SNOW_N * 4);
  private kind: WeatherKind = 'clear';
  private amount = 0;
  private dummy = new THREE.Object3D();

  constructor(private readonly scene: THREE.Scene) {
    const rainMat = new THREE.MeshBasicMaterial({ color: '#C4DCF4', transparent: true, opacity: 0.62, depthWrite: false, fog: false });
    this.rain = new THREE.InstancedMesh(new THREE.PlaneGeometry(PIXEL, 0.5), rainMat, RAIN_N);
    const snowMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.92, depthWrite: false, fog: false });
    this.snow = new THREE.InstancedMesh(new THREE.PlaneGeometry(PIXEL * 2.2, PIXEL * 2.2), snowMat, SNOW_N);
    for (const m of [this.rain, this.snow]) { m.frustumCulled = false; m.visible = false; m.renderOrder = 20; this.group.add(m); }
    for (let i = 0; i < RAIN_N; i++) {
      this.px[i * 3] = (rngAt(11, i) - 0.5) * BOX.w; this.px[i * 3 + 1] = rngAt(12, i) * BOX.h; this.px[i * 3 + 2] = (rngAt(13, i) - 0.5) * BOX.d;
    }
    for (let i = 0; i < SNOW_N; i++) {
      this.sx[i * 4] = (rngAt(21, i) - 0.5) * BOX.w; this.sx[i * 4 + 1] = rngAt(22, i) * BOX.h; this.sx[i * 4 + 2] = (rngAt(23, i) - 0.5) * BOX.d; this.sx[i * 4 + 3] = rngAt(24, i) * 6.28;
    }
    // Two sheets of drifting mist near the ground, at different heights and speeds.
    [{ y: 0.35, speed: 0.012, seed: 3 }, { y: 1.0, speed: -0.008, seed: 7 }].forEach((l) => {
      const tex = mistTexture(l.seed);
      tex.repeat.set(8, 8);
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: '#C8D0E4', transparent: true, opacity: 0, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 10;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.layers.push({ mesh, tex, speed: l.speed, y: l.y });
    });
    scene.add(this.group);
  }

  /** Change the sky: which weather, how thick the fog is, and the fog's color (a lit-up sky tone). */
  set(kind: WeatherKind, fog: number, skyHorizon: string) {
    this.kind = kind;
    this.amount = fog;
    this.rain.visible = kind === 'rain';
    this.snow.visible = kind === 'snow';
    this.fog.color.set(mix(skyHorizon, kind === 'snow' ? '#E8EEF8' : '#9CA8C8', 0.5));
    this.scene.fog = fog > 0.02 ? this.fog : null;
    for (const l of this.layers) {
      l.mesh.visible = fog > 0.15;
      (l.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.22, fog * 0.28);
      (l.mesh.material as THREE.MeshBasicMaterial).color.set(mix(skyHorizon, '#E4EAFA', 0.75));
    }
  }

  /** Move the weather along: it follows the camera's target so it fills whatever you're looking at. */
  update(dt: number, t: number, target: THREE.Vector3, camDist: number) {
    this.group.position.set(target.x, 0, target.z);
    const s = this.amount;
    // Fog starts just in front of the middle of the screen and swallows the far end of the street.
    this.fog.near = camDist - 4 - 4 * s;
    this.fog.far = camDist + 52 - 30 * s;
    for (const l of this.layers) {
      l.tex.offset.x = (t * l.speed) % 1;
      l.tex.offset.y = (t * l.speed * 0.6) % 1;
      l.mesh.position.y = l.y + Math.sin(t * 0.3 + l.y) * 0.05;
    }
    if (this.kind === 'rain') this.stepRain(dt);
    else if (this.kind === 'snow') this.stepSnow(dt, t);
  }

  private stepRain(dt: number) {
    const d = this.dummy;
    for (let i = 0; i < RAIN_N; i++) {
      let y = this.px[i * 3 + 1] - dt * (11 + (i % 5));
      if (y < 0) y += BOX.h;
      this.px[i * 3 + 1] = y;
      d.position.set(this.px[i * 3] + y * 0.12, y, this.px[i * 3 + 2]);
      d.rotation.set(0, view.yaw, -0.12);
      d.updateMatrix();
      this.rain.setMatrixAt(i, d.matrix);
    }
    this.rain.instanceMatrix.needsUpdate = true;
  }

  private stepSnow(dt: number, t: number) {
    const d = this.dummy;
    for (let i = 0; i < SNOW_N; i++) {
      let y = this.sx[i * 4 + 1] - dt * (0.9 + (i % 4) * 0.25);
      if (y < 0) y += BOX.h;
      this.sx[i * 4 + 1] = y;
      const sway = Math.sin(t * 0.8 + this.sx[i * 4 + 3]) * 0.35;
      d.position.set(this.sx[i * 4] + sway, y, this.sx[i * 4 + 2]);
      d.rotation.set(0, view.yaw, 0);
      d.updateMatrix();
      this.snow.setMatrixAt(i, d.matrix);
    }
    this.snow.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.fog = null;
    this.scene.remove(this.group);
    this.rain.geometry.dispose(); (this.rain.material as THREE.Material).dispose();
    this.snow.geometry.dispose(); (this.snow.material as THREE.Material).dispose();
    for (const l of this.layers) { l.mesh.geometry.dispose(); (l.mesh.material as THREE.Material).dispose(); l.tex.dispose(); }
  }
}
