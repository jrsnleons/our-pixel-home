// Little pixel particles: hearts, music notes, Zzz, sparkles. Pooled so effects never
// allocate during play.

import * as THREE from 'three';
import { view } from './art/kit';
import { canvas, outline, px, sprite, texture, HEART_MAP } from './art/pixel';

export type FxKind = 'heart' | 'note' | 'zzz' | 'sparkle' | 'star' | 'crumb' | 'drop' | 'smallheart' | 'umbrella' | 'pray';

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, ol = true) {
  const [c, g] = canvas(w, h);
  draw(g);
  if (ol) outline(g, w, h);
  return texture(c);
}

const TEXTURES: Record<FxKind, () => THREE.Texture> = {
  heart: () => tex(9, 8, (g) => sprite(g, HEART_MAP, { h: '#E8506A', H: '#FFB3C0' }, 1, 1)),
  smallheart: () => tex(6, 6, (g) => { px(g, '#F07890', 1, 1); px(g, '#F07890', 3, 1); px(g, '#F07890', 1, 2, 3, 1); px(g, '#F07890', 2, 3); px(g, '#FFD0DA', 1, 1); }),
  note: () => tex(7, 9, (g) => { px(g, '#5A4AA8', 4, 1, 1, 5); px(g, '#5A4AA8', 5, 1, 1, 1); px(g, '#5A4AA8', 6, 2); px(g, '#5A4AA8', 2, 5, 3, 2); px(g, '#8E7AD0', 2, 5); }),
  zzz: () => tex(8, 8, (g) => { px(g, '#FFFFFF', 1, 1, 5, 1); px(g, '#FFFFFF', 4, 2); px(g, '#FFFFFF', 3, 3); px(g, '#FFFFFF', 2, 4); px(g, '#FFFFFF', 1, 5, 5, 1); }),
  sparkle: () => tex(7, 7, (g) => { px(g, '#FFF2B0', 3, 1, 1, 5); px(g, '#FFF2B0', 1, 3, 5, 1); px(g, '#FFFFFF', 3, 3); }, false),
  star: () => tex(9, 9, (g) => { px(g, '#F7D046', 4, 1, 1, 7); px(g, '#F7D046', 1, 4, 7, 1); px(g, '#F7D046', 3, 3, 3, 3); px(g, '#FFF6C0', 4, 4); }),
  crumb: () => tex(3, 3, (g) => px(g, '#D8A860', 1, 1), false),
  drop: () => tex(3, 5, (g) => { px(g, '#7AC0F0', 1, 1, 1, 3); px(g, '#D0F0FF', 1, 1); }),
  umbrella: () => tex(24, 18, (g) => {
    const c = ['#E5566F', '#C93E58', '#FF8FA0'];
    for (let y = 0; y < 8; y++) { const w = Math.round(Math.sqrt(1 - ((7 - y) / 8) ** 2) * 11); px(g, c[0], 12 - w, 1 + y, w * 2, 1); }
    for (let x = 1; x < 23; x += 6) px(g, c[1], x, 8, 3, 1);
    px(g, c[2], 8, 2, 4, 1); px(g, c[1], 12, 1, 1, 8);
    px(g, '#5A3A2A', 12, 9, 1, 8); px(g, '#5A3A2A', 13, 16); px(g, '#5A3A2A', 14, 15);
  }),
  pray: () => tex(9, 9, (g) => { px(g, '#FFF2C4', 4, 0, 1, 9); px(g, '#FFF2C4', 1, 3, 7, 1); px(g, '#FFFFFF', 4, 3); }, false),
};

interface Particle { mesh: THREE.Mesh; life: number; max: number; vel: THREE.Vector3; kind: FxKind; follow?: () => THREE.Vector3; sway: number }

export class Effects {
  readonly group = new THREE.Group();
  private pool: THREE.Mesh[] = [];
  private live: Particle[] = [];
  private textures = new Map<FxKind, THREE.Texture>();
  private geo = new THREE.PlaneGeometry(1, 1);

  private texFor(k: FxKind) {
    let t = this.textures.get(k);
    if (!t) { t = TEXTURES[k](); this.textures.set(k, t); }
    return t;
  }

  private take(): THREE.Mesh {
    const m = this.pool.pop() ?? new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, alphaTest: 0.1 }));
    this.group.add(m);
    m.visible = true;
    return m;
  }

  spawn(kind: FxKind, at: THREE.Vector3, opts: { count?: number; spread?: number; life?: number; size?: number; rise?: number; follow?: () => THREE.Vector3 } = {}) {
    const n = opts.count ?? 1;
    for (let i = 0; i < n; i++) {
      const m = this.take();
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.map = this.texFor(kind);
      mat.opacity = 1;
      mat.needsUpdate = true;
      const s = opts.size ?? (kind === 'umbrella' ? 1.5 : kind === 'heart' ? 0.5 : kind === 'crumb' ? 0.12 : 0.36);
      const img = mat.map.image as HTMLCanvasElement;
      m.scale.set(s, s * (img.height / img.width), 1);
      const sp = opts.spread ?? 0.3;
      m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * sp, Math.random() * sp * 0.5, (Math.random() - 0.5) * sp));
      m.rotation.set(0, view.yaw, 0);
      const life = opts.life ?? (kind === 'zzz' ? 2.2 : 1.4);
      const rise = opts.rise ?? (kind === 'crumb' ? -0.6 : kind === 'umbrella' ? 0 : 0.6);
      this.live.push({ mesh: m, life, max: life, kind, vel: new THREE.Vector3((Math.random() - 0.5) * 0.2, rise, (Math.random() - 0.5) * 0.2), follow: opts.follow, sway: Math.random() * 6 });
    }
  }

  /** A heart that flies from one point to another (blow a kiss). */
  fling(from: THREE.Vector3, to: THREE.Vector3) {
    const m = this.take();
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.map = this.texFor('heart'); mat.opacity = 1; mat.needsUpdate = true;
    m.scale.set(0.45, 0.4, 1);
    m.position.copy(from);
    m.rotation.set(0, view.yaw, 0);
    const life = 0.9;
    const vel = to.clone().sub(from).divideScalar(life);
    this.live.push({ mesh: m, life, max: life, kind: 'heart', vel, sway: 0 });
  }

  clear(kind?: FxKind) {
    for (let i = this.live.length - 1; i >= 0; i--) if (!kind || this.live[i].kind === kind) { this.recycle(this.live[i].mesh); this.live.splice(i, 1); }
  }

  private recycle(m: THREE.Mesh) {
    m.visible = false;
    this.group.remove(m);
    this.pool.push(m);
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) { this.recycle(p.mesh); this.live.splice(i, 1); continue; }
      if (p.follow) p.mesh.position.copy(p.follow());
      else {
        p.mesh.position.addScaledVector(p.vel, dt);
        if (p.kind === 'zzz' || p.kind === 'note') p.mesh.position.x += Math.sin((p.max - p.life) * 3 + p.sway) * dt * 0.25;
        if (p.kind === 'crumb') p.vel.y -= dt * 2;
      }
      const k = p.life / p.max;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.kind === 'umbrella' ? Math.min(1, k * 6) : Math.min(1, k * 2.5);
      if (p.kind === 'sparkle' || p.kind === 'star') p.mesh.scale.multiplyScalar(1 - dt * 0.6);
    }
  }
}
