// Renderer, camera and the HD-2D post stack (bloom, tilt-shift depth blur, vignette and
// color grade), with an adaptive quality ladder so cheap phones stay smooth.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { view } from './art/kit';

const TiltShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    dir: { value: new THREE.Vector2(1, 0) },
    focus: { value: 0.52 },
    spread: { value: 2.2 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 dir; uniform float focus; uniform float spread; varying vec2 vUv;
    void main(){
      // Blur grows with distance from a horizontal focus band: the toy-diorama look.
      float d = abs(vUv.y - focus);
      float amt = smoothstep(0.16, 0.5, d) * spread;
      vec4 s = texture2D(tDiffuse, vUv) * 0.2270270270;
      vec2 o1 = dir * amt * 1.3846153846, o2 = dir * amt * 3.2307692308;
      s += texture2D(tDiffuse, vUv + o1) * 0.3162162162; s += texture2D(tDiffuse, vUv - o1) * 0.3162162162;
      s += texture2D(tDiffuse, vUv + o2) * 0.0702702703; s += texture2D(tDiffuse, vUv - o2) * 0.0702702703;
      gl_FragColor = s;
    }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    vignette: { value: 0.32 },
    tint: { value: new THREE.Color('#FFFFFF') },
    tintAmt: { value: 0.1 },
  },
  vertexShader: TiltShader.vertexShader,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette; uniform vec3 tint; uniform float tintAmt; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.25, length(d * vec2(1.2, 0.9)));
      c.rgb *= mix(1.0 - vignette, 1.0, v);
      c.rgb = mix(c.rgb, c.rgb * tint, tintAmt);
      gl_FragColor = c;
    }`,
};

export interface QualityLevel { dpr: number; shadow: number; bloom: boolean; tilt: boolean; effects: boolean }

const LADDER: QualityLevel[] = [
  { dpr: 2, shadow: 1024, bloom: true, tilt: true, effects: true },
  { dpr: 1.5, shadow: 1024, bloom: true, tilt: true, effects: true },
  { dpr: 1.25, shadow: 512, bloom: true, tilt: true, effects: true },
  { dpr: 1, shadow: 512, bloom: false, tilt: true, effects: true },
  { dpr: 1, shadow: 512, bloom: false, tilt: false, effects: false },
];

function storageGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function storageSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(24, 0.5, 1, 120);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private tiltH: ShaderPass;
  private tiltV: ShaderPass;
  private grade: ShaderPass;
  private camDir = new THREE.Vector3(0.62, 0.66, 0.78).normalize();
  readonly target = new THREE.Vector3(0, 1.05, 0.25);
  private baseDist = 40;
  zoom = 1;
  pan = new THREE.Vector2(0, 0);
  private w = 1;
  private h = 1;
  /** User setting: HD-2D effects on or off. */
  effectsWanted = true;
  /** User setting: cap at 30 fps to save battery. */
  batterySaver = false;
  private level: number;
  private frameTimes: number[] = [];
  private lastDrop = 0;
  private running = false;
  private onFrame: ((dt: number, t: number) => void) | null = null;
  private last = 0;
  private acc = 0;
  private t0 = performance.now();
  reduceMotion = false;
  /** Last measured frames per second, for the settings screen. */
  fps = 0;
  private fpsAcc = 0;
  private fpsN = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const saved = Number(storageGet('oph.quality'));
    const weak = (navigator.hardwareConcurrency ?? 8) <= 4 || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 3;
    this.level = Number.isFinite(saved) && saved > 0 ? Math.min(saved, LADDER.length - 1) : weak ? 2 : 0;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.tiltH = new ShaderPass(TiltShader);
    this.tiltV = new ShaderPass(TiltShader);
    this.tiltV.uniforms.dir.value = new THREE.Vector2(0, 1);
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    view.yaw = Math.atan2(this.camDir.x, this.camDir.z);
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.renderer.setAnimationLoop(null);
      else if (this.running) this.start(this.onFrame!);
    });
  }

  setMood(bloom: number, tint: string, tintAmt: number, backdrop: string) {
    this.bloom.strength = bloom;
    (this.grade.uniforms.tint.value as THREE.Color).set(tint);
    this.grade.uniforms.tintAmt.value = tintAmt;
    this.scene.background = new THREE.Color(backdrop);
  }

  get quality(): QualityLevel { return LADDER[this.level]; }
  get qualityIndex() { return this.level; }

  resize(w: number, h: number) {
    this.w = Math.max(1, w); this.h = Math.max(1, h);
    const q = this.quality;
    const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(this.w, this.h);
    this.bloom.resolution.set(this.w / 2, this.h / 2);
    this.camera.aspect = this.w / this.h;
    // Fit the room's diagonal across the width, with breathing room for HUD bars.
    const fitW = 10.6;
    const visH = Math.max(fitW / this.camera.aspect, 11.2);
    this.baseDist = visH / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.far = this.baseDist + 60;
    this.camera.updateProjectionMatrix();
    this.tiltH.uniforms.spread.value = 2.0 / this.w;
    this.tiltV.uniforms.spread.value = 2.0 / this.h;
    this.applyShadow();
  }

  private shadowLight: THREE.DirectionalLight | null = null;
  setShadowLight(l: THREE.DirectionalLight) { this.shadowLight = l; this.applyShadow(); }
  private applyShadow() {
    const l = this.shadowLight;
    if (!l) return;
    const s = this.quality.shadow;
    if (l.shadow.mapSize.x !== s) {
      l.shadow.mapSize.set(s, s);
      l.shadow.map?.dispose();
      l.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }

  updateCamera(t: number) {
    const sway = this.reduceMotion ? 0 : Math.sin(t * 0.25) * 0.03;
    const dir = this.camDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), sway);
    const right = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const tgt = this.target.clone().addScaledVector(right, this.pan.x).add(new THREE.Vector3(0, this.pan.y, 0));
    this.camera.position.copy(tgt).addScaledVector(dir, this.baseDist / this.zoom);
    this.camera.lookAt(tgt);
  }

  start(onFrame: (dt: number, t: number) => void) {
    this.onFrame = onFrame;
    this.running = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop((now: number) => this.frame(now));
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private frame(now: number) {
    const raw = (now - this.last) / 1000;
    this.last = now;
    if (this.batterySaver) {
      this.acc += raw;
      if (this.acc < 1 / 31) return;
    }
    const dt = Math.min(this.batterySaver ? this.acc : raw, 0.05);
    this.acc = 0;
    const t = (now - this.t0) / 1000;
    this.onFrame?.(dt, t);
    this.updateCamera(t);
    const q = this.quality;
    const fx = this.effectsWanted && q.effects;
    if (fx) {
      this.bloom.enabled = q.bloom;
      this.tiltH.enabled = this.tiltV.enabled = q.tilt;
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.measure(raw);
  }

  /** Step quality down when frames run long for a few seconds straight. Never steps up on its own. */
  private measure(dt: number) {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 1) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    if (dt > 0.25) return; // tab switch or hitch; ignore
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 120) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    const budget = this.batterySaver ? 1 / 24 : 1 / 42;
    const now = performance.now();
    if (avg > budget && this.level < LADDER.length - 2 && now - this.lastDrop > 3000) {
      this.level++;
      this.lastDrop = now;
      storageSet('oph.quality', String(this.level));
      this.resize(this.w, this.h);
    }
  }

  /** Let the person reset the ladder from settings (e.g. after closing other apps). */
  resetQuality() {
    this.level = 0;
    storageSet('oph.quality', '0');
    this.resize(this.w, this.h);
  }

  project(v: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.w, y: (-p.y * 0.5 + 0.5) * this.h, visible: p.z < 1 };
  }
}
