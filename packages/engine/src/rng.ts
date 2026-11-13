/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * All engine randomness must flow through an Rng instance so that
 * program + seed + grid size always reproduce the same output.
 * Never use Math.random() inside the engine.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). `n` must be a positive integer. */
  nextInt(n: number): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    nextInt(n: number): number {
      if (!Number.isInteger(n) || n <= 0) {
        throw new RangeError(`nextInt expects a positive integer, got ${n}`);
      }
      return Math.floor(next() * n);
    },
  };
}
