import type { Grid } from './grid';
import type { Rule } from './rule';
import { WILDCARD_OUT } from './rule';

/** A compiled distance field (see FieldDef). */
export class Field {
  /** Reusable BFS queue of cell indices. */
  private readonly queue: Int32Array;

  constructor(
    /** Bitmask of symbols the distance may pass through. */
    readonly substrate: number,
    /** Bitmask of symbols at distance 0. */
    readonly zero: number,
    /** True for `from` fields (repelling). */
    readonly inversed: boolean,
    readonly recompute: boolean,
    readonly essential: boolean,
    cells: number,
  ) {
    this.queue = new Int32Array(cells);
  }

  /**
   * Breadth-first distances (4-neighbourhood) from zero cells through substrate
   * cells into `potential`; -1 where unreachable. Returns false if there are no
   * zero cells.
   */
  compute(potential: Int32Array, grid: Grid): boolean {
    const { MX, MY, MZ, state } = grid;
    const { queue, substrate } = this;
    let head = 0;
    let tail = 0;
    for (let i = 0; i < state.length; i++) {
      if (this.zero & (1 << state[i]!)) {
        potential[i] = 0;
        queue[tail++] = i;
      } else {
        potential[i] = -1;
      }
    }
    if (tail === 0) return false;
    const plane = MX * MY;
    // Each cell enters the queue at most once, so `queue` never overflows.
    const visit = (n: number, t: number) => {
      if (potential[n] === -1 && substrate & (1 << state[n]!)) {
        potential[n] = t;
        queue[tail++] = n;
      }
    };
    while (head < tail) {
      const i = queue[head++]!;
      const t = potential[i]! + 1;
      const x = i % MX;
      const y = ((i - x) / MX) % MY;
      const z = (i - x - y * MX) / plane;
      // Same neighbour order as MarkovJunior: -x, +x, -y, +y, -z, +z.
      if (x > 0) visit(i - 1, t);
      if (x < MX - 1) visit(i + 1, t);
      if (y > 0) visit(i - MX, t);
      if (y < MY - 1) visit(i + MX, t);
      if (z > 0) visit(i - plane, t);
      if (z < MZ - 1) visit(i + plane, t);
    }
    return true;
  }
}

/**
 * How much applying `rule` at (x, y, z) would change the total field potential
 * (lower is better), or null if it would put a symbol where its field can't
 * reach.
 */
export function deltaPointwise(
  state: Uint8Array,
  rule: Rule,
  x: number,
  y: number,
  z: number,
  fields: readonly (Field | null)[] | null,
  potentials: readonly Int32Array[],
  MX: number,
  MY: number,
): number | null {
  let sum = 0;
  let dx = 0;
  let dy = 0;
  let dz = 0;
  const { input, output, IMX, IMY } = rule;
  for (let di = 0; di < input.length; di++) {
    const newValue = output[di]!;
    if (newValue !== WILDCARD_OUT && (input[di]! & (1 << newValue)) === 0) {
      const i = x + dx + (y + dy) * MX + (z + dz) * MX * MY;
      const newPotential = potentials[newValue]![i]!;
      if (newPotential === -1) return null;
      const oldValue = state[i]!;
      const oldPotential = potentials[oldValue]![i]!;
      sum += newPotential - oldPotential;
      if (fields) {
        if (fields[oldValue]?.inversed) sum += 2 * oldPotential;
        if (fields[newValue]?.inversed) sum -= 2 * newPotential;
      }
    }
    dx++;
    if (dx === IMX) {
      dx = 0;
      dy++;
      if (dy === IMY) {
        dy = 0;
        dz++;
      }
    }
  }
  return sum;
}
