import type { Context } from '../context';
import type { NodePath } from '../program';
import { WILDCARD_OUT, type Rule } from '../rule';
import { RuleNode } from './rule-node';

/**
 * Applies every match independently (each with probability `p`), all reading
 * the grid as it was at the start of the turn. Always does a full scan.
 */
export class PrlNode extends RuleNode {
  private readonly newstate: Uint8Array;

  constructor(ctx: Context, path: NodePath, rules: Rule[], steps: number) {
    super(ctx, path, rules, steps);
    this.newstate = new Uint8Array(ctx.grid.state.length);
  }

  protected override add(r: number, x: number, y: number, z: number): void {
    const rule = this.rules[r]!;
    const { grid, rng, changes } = this.ctx;
    if (rng.next() > rule.p) return;
    this.last[r] = 1;
    const { MX, MY, state } = grid;
    const { IMX, IMY, IMZ, output } = rule;
    for (let dz = 0; dz < IMZ; dz++)
      for (let dy = 0; dy < IMY; dy++)
        for (let dx = 0; dx < IMX; dx++) {
          const v = output[dx + dy * IMX + dz * IMX * IMY]!;
          const i = x + dx + (y + dy) * MX + (z + dz) * MX * MY;
          if (v !== WILDCARD_OUT && v !== state[i]) {
            this.newstate[i] = v;
            changes.push(i);
          }
        }
    this.matchCount++;
  }

  go(): boolean {
    if (!this.scan()) return false;
    const { grid, changes, first, counter } = this.ctx;
    const data = changes.data;
    for (let n = first[counter]!; n < changes.length; n++) {
      const i = data[n]!;
      grid.state[i] = this.newstate[i]!;
    }
    this.counter++;
    if (this.matchCount > 0) {
      this.ctx.lastActive = this;
      return true;
    }
    return false;
  }
}
