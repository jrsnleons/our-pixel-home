// Inside a building: a shop or workplace is a small room built like your home (same shell, same
// furniture art, same camera), with a keeper behind the counter and spots you walk up to.

import * as THREE from 'three';
import { cellsOf, key } from '../core/grid';
import type { FloorPlan } from '../core/layout';
import { footprint, ITEM_BY_KEY } from '../data/catalog';
import { drawText, textWidth } from './art/font';
import { billboard, pbox, spriteTexture, dispose } from './art/kit';
import { solid } from './art/paint';
import { INTERIOR_DOOR, type InteriorSpec } from '../data/town';
import type { ThemeKey } from '../data/themes';
import { AreaScene, type AreaEvents } from './area';
import { Actor } from './actor';
import type { AvatarLook } from './art/avatar';
import { buildFloorItem, type ItemArt } from './art/furniture';
import { buildWallItem } from './art/wall';
import type { Daylight } from './daylight';
import { RoomShell } from './room';
import { npcLook } from './town';

const HALF = 3.5;

/** One thing on show this week: a piece of furniture on a stand, or an outfit on a mannequin. */
export type StockEntry =
  | { id: string; kind: 'item'; key: string; price: string }
  | { id: string; kind: 'piece'; key: string; price: string; look: AvatarLook; name: string };

export class InteriorScene extends AreaScene {
  readonly shell: RoomShell;
  readonly keeper: { name: string; line: string } | null;
  private lights: { light: THREE.PointLight; base: number }[] = [];
  private glowing: THREE.Mesh[] = [];
  private props = new Map<string, THREE.Object3D>();
  private stock = new THREE.Group();
  private stockIds: string[] = [];
  private stockSig = '';

  constructor(r: ConstructorParameters<typeof AreaScene>[0], themeKey: ThemeKey, readonly spec: InteriorSpec, looks: { me: AvatarLook; partner: AvatarLook }, events: AreaEvents) {
    const floor: FloorPlan = { w: spec.w, d: spec.d, rooms: [{ id: 'main', name: spec.id, x: 0, y: 0, w: spec.w, d: spec.d }] };
    super(r, themeKey, floor, looks, events, { pitch: 0.66, fitW: 10.6 * Math.max(1, Math.max(spec.w, spec.d) / 7) }, INTERIOR_DOOR);
    this.camFixed = new THREE.Vector3(-HALF + spec.w / 2, 1.05, -HALF + spec.d / 2 + 0.25);
    this.sun.visible = false;
    this.hemi.visible = false;
    this.shell = new RoomShell(this.theme, { wallpaper: spec.wallpaper, wallTint: spec.wallTint, floor: spec.floor, floorTint: spec.floorTint ?? null, curtains: false }, floor);
    this.scene.add(this.shell.group, this.stock);
    this.blocked = new Set();
    this.build();
    this.hotspots.set('exit', { id: 'exit', kind: 'exit', label: 'Outside', approach: INTERIOR_DOOR, at: new THREE.Vector3(-HALF + 0.2, 2.9, 1.5) });
    for (const m of this.shell.doorPicks) { m.userData.hotspot = 'exit'; this.pickables.push(m); }
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(this.theme.mood.lamp, 0, 7, 2);
      this.lights.push({ light: l, base: 0 });
      this.scene.add(l);
    }
    this.keeper = spec.keeper ? { name: spec.keeper.name, line: spec.keeper.line } : null;
  }

  protected override shadowSun() { return this.shell.sun; }

  // ---------- Building the room ----------

  private build() {
    const { spec } = this;
    for (const p of spec.props) {
      const def = ITEM_BY_KEY[p.item];
      if (!def) throw new Error(`Unknown prop ${p.item}`);
      const root = new THREE.Group();
      let lamp: { art: ItemArt; strength: number } | null = null;
      const rot = p.rot ?? 0;
      if (def.kind === 'wall-item') {
        const art = buildWallItem(p.item, this.theme);
        root.add(art.group);
        const [w] = def.size ?? [1, 1];
        if ((p.surface ?? 'back') === 'back') root.position.set(-HALF + p.x, 1 + p.y, -HALF + 0.01);
        else { root.rotation.y = Math.PI / 2; root.position.set(-HALF + 0.01, 1 + p.y, -HALF + p.x + w); }
        art.refresh?.({});
        for (const g of art.glow ?? []) this.glowing.push(g);
      } else {
        const art = buildFloorItem(p.item, this.theme);
        root.add(art.group);
        const [w, d] = def.size ?? [1, 1];
        const [W, D] = footprint(def, rot);
        art.group.position.set(-w / 2, 0, -d / 2);
        root.rotation.y = (rot * Math.PI) / 2;
        root.position.set(-HALF + p.x + W / 2, 0, -HALF + p.y + D / 2);
        root.traverse((o) => { if (o.userData.billboard) o.rotation.y = -(rot * Math.PI) / 2 + Math.atan2(0.62, 0.78); });
        if (!def.flat && !def.hanging) for (const c of cellsOf(def, { x: p.x, y: p.y, rot })) this.blocked.add(key(c.x, c.y));
        for (const g of art.glow ?? []) this.glowing.push(g);
        if (art.light && def.light) lamp = { art, strength: def.light };
      }
      this.scene.add(root);
      if (lamp) { root.updateMatrixWorld(true); this.lampSpots.push({ pos: lamp.art.group.localToWorld(lamp.art.light!.pos.clone()), strength: lamp.strength }); }
      if (p.id) this.props.set(p.id, root);
    }
    for (const s of spec.spots) {
      const root = s.prop ? this.props.get(s.prop) : undefined;
      const box = root ? new THREE.Box3().setFromObject(root) : null;
      const at = box ? new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y + 0.4, (box.min.z + box.max.z) / 2) : new THREE.Vector3(-HALF + s.approach.x + 0.5, 1.4, -HALF + s.approach.y + 0.5);
      this.addHotspot({ id: s.id, kind: s.kind, label: s.label, approach: s.approach, at }, root ? [root] : []);
    }
    const k = spec.keeper;
    if (k) {
      const actor = new Actor(npcLook(k.look), k.tile, false);
      actor.facing = k.facing;
      this.addNpc({ id: 'keeper', actor, route: [k.tile], seed: k.look, name: k.name, line: k.line });
      this.blocked.add(key(k.tile.x, k.tile.y));
    }
  }

  private lampSpots: { pos: THREE.Vector3; strength: number }[] = [];

  /** Where the keeper's chat bubble goes, as a world point above their head. */
  keeperHead() { return this.npcs[0]?.actor.head() ?? new THREE.Vector3(); }

  npcInfo(id: string) { const n = this.npcs.find((q) => q.id === id); return n ? { name: n.name, line: n.line } : null; }

  /** The hotspot a job is done at (so the lobby can be opened from the right desk). */
  spotOfJob(job: string) { return this.spec.spots.find((s) => s.job === job); }

  // ---------- This week's stock ----------

  /** Put this week's stock on the display row (replacing last week's). */
  setStock(entries: StockEntry[]) {
    const sig = JSON.stringify(entries);
    if (sig === this.stockSig) return;
    this.stockSig = sig;
    const slots = this.spec.displays ?? [];
    for (const c of [...this.stock.children]) { this.stock.remove(c); dispose(c); }
    for (const id of this.stockIds) { this.hotspots.delete(id); this.removeNpc(id); }
    this.pickables = this.pickables.filter((o) => !o.userData.stock);
    this.stockIds = [];
    for (const t of slots) this.blocked.delete(key(t.x, t.y));
    if (this.spec.keeper) this.blocked.add(key(this.spec.keeper.tile.x, this.spec.keeper.tile.y));
    entries.slice(0, slots.length).forEach((e, i) => {
      const t = slots[i];
      const g = new THREE.Group();
      g.position.set(-HALF + t.x + 0.5, 0, -HALF + t.y + 0.5);
      g.add(pbox(-0.43, 0, -0.43, 0.86, 0.34, 0.86, { sides: solid('#8A6244'), top: solid('#C8A074') }));
      g.add(this.priceTag(e.price));
      this.blocked.add(key(t.x, t.y));
      const approach = { x: t.x, y: t.y + 1 };
      if (e.kind === 'item') {
        const def = ITEM_BY_KEY[e.key];
        const art = def.kind === 'wall-item' ? buildWallItem(e.key, this.theme) : buildFloorItem(e.key, this.theme);
        const model = new THREE.Group();
        model.add(art.group);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const k = Math.min(1, 0.8 / Math.max(size.x, size.z, 0.01), 1.15 / Math.max(size.y, 0.01));
        model.scale.setScalar(k);
        const c = box.getCenter(new THREE.Vector3());
        model.position.set(-c.x * k, 0.34 - box.min.y * k, -c.z * k);
        model.traverse((o) => { o.userData.stock = true; });
        g.add(model);
        // Thin things (frames, posters) are hard to tap, so the whole stand counts.
        const pick = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
        pick.position.y = 0.65;
        pick.userData.stock = true;
        g.add(pick);
        this.addHotspot({ id: e.id, kind: 'item', label: def.name, approach, at: new THREE.Vector3(g.position.x, 1.9, g.position.z) }, [model, pick]);
        this.stockIds.push(e.id);
      } else {
        const actor = new Actor(e.look, t, false);
        actor.facing = '+z';
        this.addNpc({ id: e.id, actor, route: [t], seed: i + 11, name: e.name, line: '' });
        this.stockIds.push(e.id);
        // The mannequin stands on the plinth.
        actor.perch(0.34);
      }
      this.stock.add(g);
    });
  }

  private priceTag(text: string) {
    const w = Math.max(12, textWidth(text) + 4);
    const tex = spriteTexture(w, 9, (g, ww, hh) => {
      g.fillStyle = '#3A2A22'; g.fillRect(0, 0, ww, hh);
      g.fillStyle = '#FFF4DC'; g.fillRect(1, 1, ww - 2, hh - 2);
      drawText(g, text, Math.floor((ww - textWidth(text)) / 2), 2, '#3A2A22');
    });
    const m = billboard(tex, w / 18, 9 / 18, { cast: false });
    m.position.set(0, 0.02, 0.56);
    return m;
  }

  // ---------- Time of day ----------

  protected applyDay(d: Daylight) {
    this.shell.applyDaylight(d);
    const m = this.theme.mood;
    this.r.setMood(m.bloom, m.grade, m.gradeAmount, m.backdrop, this.scene);
    const strongest = [...this.lampSpots].sort((a, b) => b.strength - a.strength).slice(0, this.lights.length);
    this.lights.forEach((l, i) => {
      const s = strongest[i];
      l.base = s && d.lampsOn ? s.strength * (m.lampPower / 5) : 0;
      if (s) l.light.position.copy(s.pos);
      l.light.color.set(m.lamp);
    });
    for (const g of this.glowing) {
      const mat = g.material as THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;
      if (mat instanceof THREE.MeshBasicMaterial) continue;
      if (mat.emissiveMap) mat.emissiveIntensity = d.lampsOn ? 0.75 : 0.05;
    }
  }

  protected override tickArea(dt: number, t: number) {
    this.shell.tick(t, dt, this.r.reduceMotion);
    for (const l of this.lights) l.light.intensity = l.base * (1 + 0.03 * Math.sin(t * 13 + l.light.id));
  }

  override destroy() {
    super.destroy();
    this.shell.dispose();
  }
}
