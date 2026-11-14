import type { Context } from '../context';
import type { NodePath } from '../program';
import { WILDCARD_OUT, type Rule } from '../rule';
import { deltaPointwise } from '../field';
import { RuleNode, type RuleNodeOptions } from './rule-node';

/** Applies one uniformly random match per turn. */
export class OneNode extends RuleNode {
  constructor(
    ctx: Context,
    path: NodePath,
    rules: Rule[],
    steps: number,
    options?: RuleNodeOptions,
  ) {
    super(ctx, path, rules, steps, options);
    const cells = ctx.grid.state.length;
    this.matchMask = rules.map(() => new Uint8Array(cells));
  }

  override reset(): void {
    super.reset();
    if (this.matchCount !== 0) {
      for (const m of this.matchMask!) m.fill(0);
      this.matchCount = 0;
    }
  }

  go(): boolean {
    if (!this.scan()) return false;
    this.lastMatchedTurn = this.ctx.counter;

    const k = this.randomMatch();
    if (k < 0) return false;
    const d = this.matchData;
    const r = d[k]!;
    this.last[r] = 1;
    this.apply(this.rules[r]!, d[k + 1]!, d[k + 2]!, d[k + 3]!);
    this.counter++;
    this.ctx.lastActive = this;
    return true;
  }

  /**
   * Pop random matches until one still holds (matches go stale as the grid
   * changes). Returns the offset of the chosen match in matchData — it is
   * moved just past the live region so it stays readable — or -1.
   */
  private randomMatch(): number {
    if (this.potentials) return this.bestMatch();
    const { grid, rng } = this.ctx;
    const { MX, MY } = grid;
    const d = this.matchData;
    while (this.matchCount > 0) {
      const k = rng.nextInt(this.matchCount) * 4;
      const r = d[k]!;
      const x = d[k + 1]!;
      const y = d[k + 2]!;
      const z = d[k + 3]!;
      this.matchMask![r]![x + y * MX + z * MX * MY] = 0;
      const lastK = (this.matchCount - 1) * 4;
      // Swap with the last live match so the chosen one lands at lastK.
      d[k] = d[lastK]!;
      d[k + 1] = d[lastK + 1]!;
      d[k + 2] = d[lastK + 2]!;
      d[k + 3] = d[lastK + 3]!;
      d[lastK] = r;
      d[lastK + 1] = x;
      d[lastK + 2] = y;
      d[lastK + 3] = z;
      this.matchCount--;
      if (grid.matches(this.rules[r]!, x, y, z)) return lastK;
    }
    return -1;
  }

  /**
   * With fields: the live match whose heuristic key is highest (dropping stale
   * matches on the way). The chosen match stays listed; it goes stale once applied.
   */
  private bestMatch(): number {
    const { grid } = this.ctx;
    const { MX, MY, state } = grid;
    const d = this.matchData;
    let max = -1000;
    let argmax = -1;
    let first = 0;
    let firstComputed = false;
    for (let k = 0; k < this.matchCount; k++) {
      const o = k * 4;
      const r = d[o]!;
      const x = d[o + 1]!;
      const y = d[o + 2]!;
      const z = d[o + 3]!;
      const rule = this.rules[r]!;
      if (!grid.matches(rule, x, y, z)) {
        this.matchMask![r]![x + y * MX + z * MX * MY] = 0;
        const last = (this.matchCount - 1) * 4;
        d[o] = d[last]!;
        d[o + 1] = d[last + 1]!;
        d[o + 2] = d[last + 2]!;
        d[o + 3] = d[last + 3]!;
        this.matchCount--;
        k--;
        continue;
      }
      const h = deltaPointwise(state, rule, x, y, z, this.fields, this.potentials!, MX, MY);
      if (h === null) continue;
      if (!firstComputed) {
        first = h;
        firstComputed = true;
      }
      const key = this.heuristicKey(h, first);
      if (key > max) {
        max = key;
        argmax = k;
      }
    }
    return argmax >= 0 ? argmax * 4 : -1;
  }

  private apply(rule: Rule, x: number, y: number, z: number): void {
    const { grid, changes } = this.ctx;
    const { MX, MY, state } = grid;
    const { IMX, IMY, IMZ, output } = rule;
    for (let dz = 0; dz < IMZ; dz++)
      for (let dy = 0; dy < IMY; dy++)
        for (let dx = 0; dx < IMX; dx++) {
          const v = output[dx + dy * IMX + dz * IMX * IMY]!;
          if (v === WILDCARD_OUT) continue;
          const i = x + dx + (y + dy) * MX + (z + dz) * MX * MY;
          if (state[i] !== v) {
            state[i] = v;
            changes.push(i);
          }
        }
  }
}
