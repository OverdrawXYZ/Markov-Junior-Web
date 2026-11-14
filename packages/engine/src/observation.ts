import type { Rule } from './rule';
import { WILDCARD_OUT } from './rule';

/** A compiled observation: cells of a value become `from` now and must become one of `to`. */
export interface Observation {
  from: number;
  /** Bitmask of goal symbols. */
  to: number;
}

/**
 * Set up the goal: future[i] = allowed final symbols per cell. Observed cells are
 * rewritten to their `from` symbol (indices of rewritten cells are passed to
 * `changed`). Returns false if some observed value isn't on the grid.
 */
export function computeFutureSetPresent(
  future: Int32Array,
  state: Uint8Array,
  observations: readonly (Observation | null)[],
  changed: (i: number) => void,
): boolean {
  const present = observations.map((o) => o === null);
  for (let i = 0; i < state.length; i++) {
    const value = state[i]!;
    const obs = observations[value];
    present[value] = true;
    if (obs) {
      future[i] = obs.to;
      if (state[i] !== obs.from) {
        state[i] = obs.from;
        changed(i);
      }
    } else {
      future[i] = 1 << value;
    }
  }
  return present.every(Boolean);
}

/** Reusable buffers for potential computations (a search runs thousands of them). */
export interface PotentialScratch {
  queue: Int32Array;
  masks: Uint8Array[];
}

export function createScratch(C: number, cells: number, rules: readonly Rule[]): PotentialScratch {
  // Each (symbol, cell) pair is enqueued at most once.
  return { queue: new Int32Array(C * cells), masks: rules.map(() => new Uint8Array(cells)) };
}

export function computeForwardPotentials(
  potentials: Int32Array[],
  state: Uint8Array,
  MX: number,
  MY: number,
  rules: readonly Rule[],
  scratch?: PotentialScratch,
): void {
  for (const p of potentials) p.fill(-1);
  for (let i = 0; i < state.length; i++) potentials[state[i]!]![i] = 0;
  computePotentials(potentials, MX, MY, rules, false, scratch);
}

export function computeBackwardPotentials(
  potentials: Int32Array[],
  future: Int32Array,
  MX: number,
  MY: number,
  rules: readonly Rule[],
  scratch?: PotentialScratch,
): void {
  for (let c = 0; c < potentials.length; c++) {
    const potential = potentials[c]!;
    for (let i = 0; i < future.length; i++) potential[i] = future[i]! & (1 << c) ? 0 : -1;
  }
  computePotentials(potentials, MX, MY, rules, true, scratch);
}

/**
 * Breadth-first "how many rule applications away" per (symbol, cell): forwards
 * from the present, or backwards from the goal.
 */
function computePotentials(
  potentials: Int32Array[],
  MX: number,
  MY: number,
  rules: readonly Rule[],
  backwards: boolean,
  scratch: PotentialScratch = createScratch(potentials.length, potentials[0]!.length, rules),
): void {
  const cells = potentials[0]!.length;
  // Queue of (symbol, cell) pairs packed as symbol * cells + cell.
  const queue = scratch.queue;
  const masks = scratch.masks;
  for (const m of masks) m.fill(0);
  let tail = 0;
  for (let c = 0; c < potentials.length; c++) {
    const potential = potentials[c]!;
    for (let i = 0; i < cells; i++) if (potential[i] === 0) queue[tail++] = c * cells + i;
  }
  for (let head = 0; head < tail; head++) {
    const packed = queue[head]!;
    const value = Math.floor(packed / cells);
    const i = packed - value * cells;
    const x = i % MX;
    const y = (i - x) / MX;
    const t = potentials[value]![i]!;
    for (let r = 0; r < rules.length; r++) {
      const rule = rules[r]!;
      const maskr = masks[r]!;
      const shifts = (backwards ? rule.oshifts : rule.ishifts)[value]!;
      for (let l = 0; l < shifts.length; l += 3) {
        const sx = x - shifts[l]!;
        const sy = y - shifts[l + 1]!;
        if (sx < 0 || sy < 0 || sx + rule.IMX > MX || sy + rule.IMY > MY) continue;
        const si = sx + sy * MX;
        if (maskr[si] || !forwardMatches(rule, sx, sy, potentials, t, MX, backwards)) continue;
        maskr[si] = 1;
        const a = backwards ? rule.binput : rule.output;
        for (let dy = 0; dy < rule.IMY; dy++)
          for (let dx = 0; dx < rule.IMX; dx++) {
            const o = a[dx + dy * rule.IMX]!;
            const idi = sx + dx + (sy + dy) * MX;
            if (o !== WILDCARD_OUT && potentials[o]![idi] === -1) {
              potentials[o]![idi] = t + 1;
              queue[tail++] = o * cells + idi;
            }
          }
      }
    }
  }
}

function forwardMatches(
  rule: Rule,
  x: number,
  y: number,
  potentials: Int32Array[],
  t: number,
  MX: number,
  backwards: boolean,
): boolean {
  const a = backwards ? rule.output : rule.binput;
  for (let dy = 0; dy < rule.IMY; dy++)
    for (let dx = 0; dx < rule.IMX; dx++) {
      const value = a[dx + dy * rule.IMX]!;
      if (value === WILDCARD_OUT) continue;
      const current = potentials[value]![x + dx + (y + dy) * MX]!;
      if (current > t || current === -1) return false;
    }
  return true;
}

export function isGoalReached(present: Uint8Array, future: Int32Array): boolean {
  for (let i = 0; i < present.length; i++)
    if (((1 << present[i]!) & future[i]!) === 0) return false;
  return true;
}

/** Lower bound on steps to the goal from forward potentials, or -1 if unreachable. */
export function forwardPointwise(potentials: Int32Array[], future: Int32Array): number {
  let sum = 0;
  for (let i = 0; i < future.length; i++) {
    let f = future[i]!;
    let min = 1000;
    let found = false;
    for (let c = 0; c < potentials.length; c++, f >>= 1) {
      const potential = potentials[c]![i]!;
      if (f & 1 && potential >= 0 && potential < min) {
        min = potential;
        found = true;
      }
    }
    if (!found) return -1;
    sum += min;
  }
  return sum;
}

/** Lower bound on steps to the goal from backward potentials, or -1 if unreachable. */
export function backwardPointwise(potentials: Int32Array[], present: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < present.length; i++) {
    const potential = potentials[present[i]!]![i]!;
    if (potential < 0) return -1;
    sum += potential;
  }
  return sum;
}
