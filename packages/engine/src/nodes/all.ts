import type { Context } from '../context';
import type { NodePath } from '../program';
import { WILDCARD_OUT, type Rule } from '../rule';
import { RuleNode } from './rule-node';

/** Applies a maximal set of non-overlapping matches, in random order, per turn. */
export class AllNode extends RuleNode {
  private order = new Int32Array(64);

  constructor(ctx: Context, path: NodePath, rules: Rule[], steps: number) {
    super(ctx, path, rules, steps);
    const cells = ctx.grid.state.length;
    this.matchMask = rules.map(() => new Uint8Array(cells));
  }

  go(): boolean {
    if (!this.scan()) return false;
    this.lastMatchedTurn = this.ctx.counter;
    if (this.matchCount === 0) return false;

    const { grid, rng, changes, first } = this.ctx;
    const { MX, MY } = grid;
    const count = this.matchCount;

    if (this.order.length < count)
      this.order = new Int32Array(Math.max(count, this.order.length * 2));
    const order = this.order;
    // Inside-out Fisher–Yates: a uniformly random permutation of 0..count-1.
    for (let i = 0; i < count; i++) {
      const j = rng.nextInt(i + 1);
      order[i] = order[j]!;
      order[j] = i;
    }

    const d = this.matchData;
    for (let k = 0; k < count; k++) {
      const m = order[k]! * 4;
      const r = d[m]!;
      const x = d[m + 1]!;
      const y = d[m + 2]!;
      const z = d[m + 3]!;
      this.matchMask![r]![x + y * MX + z * MX * MY] = 0;
      this.fit(r, x, y, z);
    }

    const data = changes.data;
    for (let n = first[this.lastMatchedTurn]!; n < changes.length; n++) grid.mask[data[n]!] = 0;

    this.counter++;
    this.matchCount = 0;
    this.ctx.lastActive = this;
    return true;
  }

  /** Apply match unless one of its written cells was already written this turn. */
  private fit(r: number, x: number, y: number, z: number): void {
    const rule = this.rules[r]!;
    const { grid, changes } = this.ctx;
    const { MX, MY, state, mask } = grid;
    const { IMX, IMY, IMZ, output } = rule;
    for (let dz = 0; dz < IMZ; dz++)
      for (let dy = 0; dy < IMY; dy++)
        for (let dx = 0; dx < IMX; dx++) {
          const v = output[dx + dy * IMX + dz * IMX * IMY]!;
          if (v !== WILDCARD_OUT && mask[x + dx + (y + dy) * MX + (z + dz) * MX * MY]) return;
        }
    this.last[r] = 1;
    for (let dz = 0; dz < IMZ; dz++)
      for (let dy = 0; dy < IMY; dy++)
        for (let dx = 0; dx < IMX; dx++) {
          const v = output[dx + dy * IMX + dz * IMX * IMY]!;
          if (v === WILDCARD_OUT) continue;
          const i = x + dx + (y + dy) * MX + (z + dz) * MX * MY;
          mask[i] = 1;
          state[i] = v;
          changes.push(i);
        }
  }
}
