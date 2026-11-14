import type { Context } from '../context';
import type { Neighborhood, NodePath } from '../program';
import { Node } from './node';

/** 3×3 kernels, row-major: weight of each neighbour in the count. */
export const KERNELS_2D: Readonly<Record<Neighborhood, readonly number[]>> = {
  VonNeumann: [0, 1, 0, 1, 0, 1, 0, 1, 0],
  Moore: [1, 1, 1, 1, 0, 1, 1, 1, 1],
};

export interface ConvolutionRule {
  input: number;
  output: number;
  p: number;
  /** Symbol indices to count, or null for an unconditional rule. */
  values: Int32Array | null;
  /** sums[n] = rule applies when the counted neighbours total n. */
  sums: readonly boolean[] | null;
}

/**
 * Cellular automaton step. Neighbour counts are taken from the grid as it was
 * at the start of the turn; then each cell takes the first rule that applies.
 */
export class ConvolutionNode extends Node {
  counter = 0;
  /** sumfield[cell * C + symbol] = weighted count of that symbol around the cell. */
  private readonly sumfield: Int32Array;

  constructor(
    ctx: Context,
    path: NodePath,
    private readonly rules: ConvolutionRule[],
    private readonly kernel: readonly number[],
    private readonly periodic: boolean,
    private readonly steps: number,
  ) {
    super(ctx, path);
    this.sumfield = new Int32Array(ctx.grid.state.length * ctx.grid.C);
  }

  reset(): void {
    this.counter = 0;
  }

  go(): boolean {
    if (this.steps > 0 && this.counter >= this.steps) return false;
    const { grid, rng, changes } = this.ctx;
    const { MX, MY, C, state } = grid;
    const { sumfield, kernel, periodic, rules } = this;

    sumfield.fill(0);
    for (let y = 0; y < MY; y++)
      for (let x = 0; x < MX; x++) {
        const base = (x + y * MX) * C;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const w = kernel[dx + 1 + (dy + 1) * 3]!;
            if (w === 0) continue;
            let sx = x + dx;
            let sy = y + dy;
            if (periodic) {
              if (sx < 0) sx += MX;
              else if (sx >= MX) sx -= MX;
              if (sy < 0) sy += MY;
              else if (sy >= MY) sy -= MY;
            } else if (sx < 0 || sy < 0 || sx >= MX || sy >= MY) continue;
            sumfield[base + state[sx + sy * MX]!]! += w;
          }
      }

    let change = false;
    for (let i = 0; i < state.length; i++) {
      const input = state[i]!;
      for (let r = 0; r < rules.length; r++) {
        const rule = rules[r]!;
        if (input !== rule.input || rule.output === input) continue;
        if (rule.p !== 1 && !(rng.next() < rule.p)) continue;
        if (rule.values && rule.sums) {
          let sum = 0;
          for (let c = 0; c < rule.values.length; c++) sum += sumfield[i * C + rule.values[c]!]!;
          if (!rule.sums[sum]) continue;
        }
        state[i] = rule.output;
        changes.push(i);
        change = true;
        break;
      }
    }

    this.counter++;
    if (change) this.ctx.lastActive = this;
    return change;
  }
}
