import type { Context } from '../context';
import type { Rule } from '../rule';
import type { NodePath } from '../program';
import type { Field } from '../field';
import {
  computeBackwardPotentials,
  computeFutureSetPresent,
  type Observation,
} from '../observation';
import { createRng } from '../rng';
import { searchTrajectory } from '../search';
import { Node } from './node';

export interface RuleNodeOptions {
  /** fields[symbol] guides where that symbol is placed, or null. */
  fields?: (Field | null)[] | null;
  temperature?: number;
  /** observations[symbol] is the goal for that symbol, or null. */
  observations?: (Observation | null)[] | null;
  search?: boolean;
  /** Search: max states (-1 = unlimited, capped). */
  limit?: number;
  depthCoefficient?: number;
}

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

  /** Per-symbol fields, or null when the node has none. */
  protected readonly fields: (Field | null)[] | null;
  /** potentials[symbol][cell]: that symbol's field (0 for symbols without one). */
  protected readonly potentials: Int32Array[] | null;
  protected readonly temperature: number;
  protected readonly observations: (Observation | null)[] | null;
  /** future[cell]: bitmask of symbols the cell must end up as. */
  protected readonly future: Int32Array | null;
  protected futureComputed = false;
  /** Search result: grid states to replay, one per step. */
  protected trajectory: Uint8Array[] | null = null;
  private readonly search: boolean;
  private readonly limit: number;
  private readonly depthCoefficient: number;
  /** Search over every maximal set of matches (all nodes) instead of single matches. */
  protected readonly searchesAll: boolean = false;

  constructor(
    ctx: Context,
    path: NodePath,
    rules: Rule[],
    steps: number,
    options: RuleNodeOptions = {},
  ) {
    super(ctx, path);
    this.rules = rules;
    this.steps = steps;
    this.last = new Uint8Array(rules.length);
    this.fields = options.fields ?? null;
    this.temperature = options.temperature ?? 0;
    this.observations = options.observations ?? null;
    this.search = options.search ?? false;
    this.limit = options.limit ?? -1;
    this.depthCoefficient = options.depthCoefficient ?? 0.5;
    const cells = ctx.grid.state.length;
    this.future = this.observations ? new Int32Array(cells) : null;
    // Fields and (non-search) observations steer matches through per-symbol potentials.
    const steered = this.fields || (this.observations && !this.search);
    this.potentials = steered
      ? Array.from({ length: ctx.grid.C }, () => new Int32Array(cells))
      : null;
  }

  /** Selection key for a match with heuristic h (higher is better); see MarkovJunior. */
  protected heuristicKey(h: number, first: number): number {
    const u = this.ctx.rng.next();
    return this.temperature > 0
      ? Math.pow(u, Math.exp((h - first) / this.temperature))
      : -h + 0.001 * u;
  }

  reset(): void {
    this.lastMatchedTurn = -1;
    this.counter = 0;
    this.futureComputed = false;
    this.last.fill(0);
  }

  /**
   * With a search trajectory: set the grid to its next state (logging changed
   * cells). Returns null when there is no trajectory.
   */
  protected replay(): boolean | null {
    const trajectory = this.trajectory;
    if (!trajectory) return null;
    if (this.counter >= trajectory.length) return false;
    const next = trajectory[this.counter]!;
    const { state } = this.ctx.grid;
    for (let i = 0; i < state.length; i++) {
      if (state[i] !== next[i]) {
        state[i] = next[i]!;
        this.ctx.changes.push(i);
      }
    }
    this.counter++;
    this.ctx.lastActive = this;
    return true;
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

    if (this.observations && !this.futureComputed) {
      const { grid, changes, rng } = this.ctx;
      const ok = computeFutureSetPresent(this.future!, grid.state, this.observations, (i) =>
        changes.push(i),
      );
      if (!ok) return false;
      this.futureComputed = true;
      if (this.search) {
        this.trajectory = null;
        const tries = this.limit < 0 ? 1 : 20;
        for (let k = 0; k < tries && !this.trajectory; k++) {
          this.trajectory = searchTrajectory(
            grid.state,
            this.future!,
            this.rules,
            grid.MX,
            grid.MY,
            grid.C,
            this.searchesAll,
            this.limit,
            this.depthCoefficient,
            createRng(rng.nextInt(0x7fffffff)),
            this.ctx.onProgress,
            this.ctx.searchStateCap,
          );
        }
      } else {
        computeBackwardPotentials(this.potentials!, this.future!, grid.MX, grid.MY, this.rules);
      }
    }

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

    if (this.fields) {
      let anySuccess = false;
      let anyComputation = false;
      for (let c = 0; c < this.fields.length; c++) {
        const field = this.fields[c];
        if (field && (this.counter === 0 || field.recompute)) {
          const success = field.compute(this.potentials![c]!, grid);
          if (!success && field.essential) return false;
          anySuccess ||= success;
          anyComputation = true;
        }
      }
      if (anyComputation && !anySuccess) return false;
    }
    return true;
  }
}
