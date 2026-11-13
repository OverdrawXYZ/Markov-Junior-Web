import type { Context } from '../context';
import type { Rule } from '../rule';
import type { NodePath } from '../program';
import { Node } from './node';

/**
 * Base class for nodes that apply rewrite rules. Keeps a list of candidate
 * matches; after the first full scan only cells changed since this node's last
 * turn are re-scanned (see `lastMatchedTurn`).
 */
export abstract class RuleNode extends Node {
  readonly rules: Rule[];
  readonly steps: number;
  counter = 0;
  /** Which rules were applied during the last turn. */
  readonly last: Uint8Array;

  /** Matches as flat [r, x, y, z] quadruples. */
  protected matchData = new Int32Array(256);
  protected matchCount = 0;
  /** Turn at which incremental scanning resumes; -1 forces a full scan. */
  protected lastMatchedTurn = -1;
  /** matchMask[r][cell] = 1 if the match (r, cell) is already in the list. */
  protected matchMask: Uint8Array[] | null = null;

  constructor(ctx: Context, path: NodePath, rules: Rule[], steps: number) {
    super(ctx, path);
    this.rules = rules;
    this.steps = steps;
    this.last = new Uint8Array(rules.length);
  }

  reset(): void {
    this.lastMatchedTurn = -1;
    this.counter = 0;
    this.last.fill(0);
  }

  protected add(r: number, x: number, y: number, z: number): void {
    const { MX, MY } = this.ctx.grid;
    this.matchMask![r]![x + y * MX + z * MX * MY] = 1;
    const k = this.matchCount * 4;
    if (k + 4 > this.matchData.length) {
      const next = new Int32Array(this.matchData.length * 2);
      next.set(this.matchData);
      this.matchData = next;
    }
    this.matchData[k] = r;
    this.matchData[k + 1] = x;
    this.matchData[k + 2] = y;
    this.matchData[k + 3] = z;
    this.matchCount++;
  }

  /** Update the match list. Returns false if the node may not run this turn. */
  protected scan(): boolean {
    this.last.fill(0);
    if (this.steps > 0 && this.counter >= this.steps) return false;

    const { grid, changes, first } = this.ctx;
    const { MX, MY, MZ, state } = grid;
    const rules = this.rules;

    if (this.lastMatchedTurn >= 0) {
      const masks = this.matchMask!;
      const data = changes.data;
      const end = changes.length;
      for (let n = first[this.lastMatchedTurn]!; n < end; n++) {
        const i = data[n]!;
        const x = i % MX;
        const yz = (i - x) / MX;
        const y = yz % MY;
        const z = (yz - y) / MY;
        const value = state[i]!;
        for (let r = 0; r < rules.length; r++) {
          const rule = rules[r]!;
          const maskr = masks[r]!;
          const shifts = rule.ishifts[value]!;
          for (let l = 0; l < shifts.length; l += 3) {
            const sx = x - shifts[l]!;
            const sy = y - shifts[l + 1]!;
            const sz = z - shifts[l + 2]!;
            if (sx < 0 || sy < 0 || sz < 0) continue;
            if (sx + rule.IMX > MX || sy + rule.IMY > MY || sz + rule.IMZ > MZ) continue;
            if (!maskr[sx + sy * MX + sz * MX * MY] && grid.matches(rule, sx, sy, sz)) {
              this.add(r, sx, sy, sz);
            }
          }
        }
      }
    } else {
      this.matchCount = 0;
      // Every placement of an IMX×IMY×IMZ pattern covers exactly one cell on the
      // lattice (IMX-1 + k*IMX, ...), so scanning that lattice finds each once.
      for (let r = 0; r < rules.length; r++) {
        const rule = rules[r]!;
        for (let z = rule.IMZ - 1; z < MZ; z += rule.IMZ)
          for (let y = rule.IMY - 1; y < MY; y += rule.IMY)
            for (let x = rule.IMX - 1; x < MX; x += rule.IMX) {
              const shifts = rule.ishifts[state[x + y * MX + z * MX * MY]!]!;
              for (let l = 0; l < shifts.length; l += 3) {
                const sx = x - shifts[l]!;
                const sy = y - shifts[l + 1]!;
                const sz = z - shifts[l + 2]!;
                if (sx < 0 || sy < 0 || sz < 0) continue;
                if (sx + rule.IMX > MX || sy + rule.IMY > MY || sz + rule.IMZ > MZ) continue;
                if (grid.matches(rule, sx, sy, sz)) this.add(r, sx, sy, sz);
              }
            }
      }
    }
    return true;
  }
}
