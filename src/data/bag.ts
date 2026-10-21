// Seeded shuffling and "shuffle bag" picking for the weekly shops: everything in a pool comes
// up once before anything repeats, and everyone (and the server) gets the same order.

export function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(list: T[], r: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * `n` items from `pool`, starting at position `start` of an endless sequence made of one fresh
 * shuffle of the pool after another. Seven weeks of eight items out of a pool of fifty go
 * through the whole pool before anything shows twice. A new shuffle never opens with something
 * the last one just closed with, so nothing appears in two weeks running.
 */
export function bagPick<T>(pool: T[], n: number, start: number, seed: number): T[] {
  if (!pool.length) return [];
  const take = Math.min(n, pool.length);
  const raw = (cycle: number) => shuffled(pool, seeded(seed + cycle * 7919));
  const orders = new Map<number, T[]>();
  const order = (cycle: number): T[] => {
    let o = orders.get(cycle);
    if (o) return o;
    o = raw(cycle);
    if (pool.length >= take * 3) {
      // Two picks of the same thing less than two weeks' worth apart could land in back-to-back
      // weeks, so anything the old shuffle closed with stays out of the new one's opening stretch.
      const gap = take * 2;
      const old = raw(cycle - 1);
      const away = (x: T, p: number) => { const q = old.lastIndexOf(x); return q < 0 || old.length - q + p >= gap; };
      for (let guard = 0; guard < pool.length; guard++) {
        const p = o.findIndex((x, i) => i < gap && !away(x, i));
        if (p < 0) break;
        const [x] = o.splice(p, 1);
        o.splice(Math.floor(o.length / 2), 0, x);
      }
    }
    orders.set(cycle, o);
    return o;
  };
  const out: T[] = [];
  for (let i = start; i < start + take; i++) {
    const o = order(Math.floor(i / pool.length));
    let k = i % pool.length;
    while (out.includes(o[k])) k = (k + 1) % pool.length;
    out.push(o[k]);
  }
  return out;
}
