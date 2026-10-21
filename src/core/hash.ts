/** A repeatable pseudo-random number in [0, 1) for (seed, n). */
export function rngAt(seed: number, n: number): number {
  let h = (seed * 374761393 + n * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
