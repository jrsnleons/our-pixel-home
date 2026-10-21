import { describe, expect, it } from 'vitest';
import { artKey, pack } from '../src/engine/art/bake';

describe('furniture baking', () => {
  it('packs faces into an atlas without overlaps, padding included', () => {
    const sizes = [[1, 1], [32, 48], [16, 16], [30, 2], [64, 8], [3, 40], [16, 16], [8, 8], [2, 3]].map(([w, h]) => ({ w, h }));
    const r = pack(sizes)!;
    const boxes = sizes.map((s, i) => ({ x: r.at[i].x, y: r.at[i].y, w: s.w + 2, h: s.h + 2 }));
    for (const b of boxes) {
      expect(b.x + b.w).toBeLessThanOrEqual(r.W);
      expect(b.y + b.h).toBeLessThanOrEqual(r.H);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
  });

  it('refuses an atlas too big for phones', () => {
    expect(pack([{ w: 3000, h: 10 }])).toBeNull();
  });

  it('shares art between pieces that look the same', () => {
    expect(artKey('seat_sofa', 'honey', { anything: 1 })).toBe(artKey('seat_sofa', 'honey', null));
    expect(artKey('seat_sofa', 'honey')).not.toBe(artKey('seat_sofa', 'cabin'));
    // Plants look different as they grow, but not with every drop of water.
    expect(artKey('plant_fern', 'honey', { water: 0 })).toBe(artKey('plant_fern', 'honey', { water: 1 }));
    expect(artKey('plant_fern', 'honey', { water: 1 })).not.toBe(artKey('plant_fern', 'honey', { water: 5 }));
  });
});
