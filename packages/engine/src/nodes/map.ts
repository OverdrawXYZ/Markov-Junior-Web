import type { Context } from '../context';
import type { Grid } from '../grid';
import type { NodePath } from '../program';
import { WILDCARD_OUT, type Rule } from '../rule';
import { Branch } from './node';

export interface Scale {
  NX: number;
  DX: number;
  NY: number;
  DY: number;
}

/**
 * Translates the current grid into a rescaled grid with its own alphabet, then
 * runs its children on it. Like MarkovJunior's map, it is detached from its
 * parent: when its children finish, the program halts.
 */
export class MapNode extends Branch {
  protected override readonly detached = true;

  constructor(
    ctx: Context,
    path: NodePath,
    /** The grid this map reads from (its parent's). */
    private readonly source: Grid,
    /** The grid it creates and its children run on. */
    readonly target: Grid,
    /** Rules with inputs in the source alphabet and outputs in the target's. */
    private readonly rules: Rule[],
    private readonly scale: Scale,
  ) {
    super(ctx, path);
    this.n = -1;
  }

  override reset(): void {
    super.reset();
    this.n = -1;
  }

  override go(): boolean {
    if (this.n >= 0) return super.go();
    const { source, target, rules, scale } = this;
    target.clear();
    for (const rule of rules)
      for (let y = 0; y < source.MY; y++)
        for (let x = 0; x < source.MX; x++) {
          if (matchesWrapped(rule, x, y, source)) {
            applyWrapped(
              rule,
              Math.floor((x * scale.NX) / scale.DX),
              Math.floor((y * scale.NY) / scale.DY),
              target,
            );
          }
        }
    this.ctx.grid = target;
    this.n = 0;
    this.ctx.lastActive = this;
    return true;
  }
}

/** Does `rule` match at (x, y), wrapping around the grid edges? */
function matchesWrapped(rule: Rule, x: number, y: number, grid: Grid): boolean {
  const { MX, MY, state } = grid;
  for (let dy = 0; dy < rule.IMY; dy++)
    for (let dx = 0; dx < rule.IMX; dx++) {
      const sx = (x + dx) % MX;
      const sy = (y + dy) % MY;
      if ((rule.input[dx + dy * rule.IMX]! & (1 << state[sx + sy * MX]!)) === 0) return false;
    }
  return true;
}

/** Write `rule`'s output at (x, y), wrapping around the grid edges. */
function applyWrapped(rule: Rule, x: number, y: number, grid: Grid): void {
  const { MX, MY, state } = grid;
  for (let dy = 0; dy < rule.OMY; dy++)
    for (let dx = 0; dx < rule.OMX; dx++) {
      const v = rule.output[dx + dy * rule.OMX]!;
      if (v === WILDCARD_OUT) continue;
      state[((x + dx) % MX) + ((y + dy) % MY) * MX] = v;
    }
}
