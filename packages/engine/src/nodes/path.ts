import type { Context } from '../context';
import type { NodePath } from '../program';
import { Node } from './node';

export interface PathOptions {
  /** Bitmasks of symbols. */
  start: number;
  finish: number;
  substrate: number;
  /** Symbol index painted along the path. */
  value: number;
  inertia: boolean;
  longest: boolean;
  edges: boolean;
  vertices: boolean;
}

/**
 * Each turn: breadth-first distances from the finish cells through the
 * substrate, then walk downhill from the nearest (or farthest) start cell,
 * painting every cell strictly between start and finish.
 */
export class PathNode extends Node {
  private readonly generations: Int32Array;
  private readonly queue: Int32Array;
  /** Scratch list of candidate directions as [dx, dy, dz, ...]. */
  private readonly candidates: number[] = [];

  constructor(
    ctx: Context,
    path: NodePath,
    private readonly opts: PathOptions,
  ) {
    super(ctx, path);
    const cells = ctx.grid.state.length;
    this.generations = new Int32Array(cells);
    this.queue = new Int32Array(cells);
  }

  reset(): void {}

  go(): boolean {
    const { grid, rng, changes } = this.ctx;
    const { MX, MY, state } = grid;
    const { start, finish, substrate, value, longest } = this.opts;
    const gen = this.generations;
    const queue = this.queue;
    const plane = MX * MY;
    let head = 0;
    let tail = 0;
    let anyStart = false;

    for (let i = 0; i < state.length; i++) {
      gen[i] = -1;
      const bit = 1 << state[i]!;
      if (start & bit) anyStart = true;
      if (finish & bit) {
        gen[i] = 0;
        queue[tail++] = i;
      }
    }
    if (!anyStart || tail === 0) return false;

    const dirs = this.candidates;
    while (head < tail) {
      const i = queue[head++]!;
      const t = gen[i]! + 1;
      const x = i % MX;
      const y = ((i - x) / MX) % MY;
      const z = (i - x - y * MX) / plane;
      this.directions(x, y, z, dirs);
      for (let k = 0; k < dirs.length; k += 3) {
        const n = i + dirs[k]! + dirs[k + 1]! * MX + dirs[k + 2]! * plane;
        if (gen[n] !== -1) continue;
        const bit = 1 << state[n]!;
        if (substrate & bit) {
          gen[n] = t;
          queue[tail++] = n;
        } else if (start & bit) {
          gen[n] = t; // reachable start, but the path doesn't continue through it
        }
      }
    }

    // Pick the nearest (or farthest) reachable start, with a little noise to break ties.
    let min = state.length;
    let max = -2;
    let argmin = -1;
    let argmax = -1;
    for (let i = 0; i < state.length; i++) {
      if (!(start & (1 << state[i]!))) continue;
      const g = gen[i]!;
      if (g <= 0) continue; // unreachable, or already a goal

      const d = g + 0.1 * rng.next();
      if (d < min) {
        min = d;
        argmin = i;
      }
      if (d > max) {
        max = d;
        argmax = i;
      }
    }
    let pen = longest ? argmax : argmin;
    if (pen < 0) return false;

    let x = pen % MX;
    let y = ((pen - x) / MX) % MY;
    let z = (pen - x - y * MX) / plane;
    let [dx, dy, dz] = this.direction(x, y, z, 0, 0, 0);
    x += dx;
    y += dy;
    z += dz;
    pen = x + y * MX + z * plane;
    while (gen[pen] !== 0) {
      state[pen] = value;
      changes.push(pen);
      [dx, dy, dz] = this.direction(x, y, z, dx, dy, dz);
      x += dx;
      y += dy;
      z += dz;
      pen = x + y * MX + z * plane;
    }
    this.ctx.lastActive = this;
    return true;
  }

  /** Neighbour offsets allowed for a step, as [dx, dy, dz, ...] (MarkovJunior's order). */
  private directions(x: number, y: number, z: number, out: number[]): void {
    const { MX, MY, MZ } = this.ctx.grid;
    const { edges, vertices } = this.opts;
    out.length = 0;
    const add = (a: number, b: number, c: number) => out.push(a, b, c);
    const xl = x > 0;
    const xh = x < MX - 1;
    const yl = y > 0;
    const yh = y < MY - 1;
    if (xl) add(-1, 0, 0);
    if (xh) add(1, 0, 0);
    if (yl) add(0, -1, 0);
    if (yh) add(0, 1, 0);
    if (MZ === 1) {
      if (edges) {
        if (xl && yl) add(-1, -1, 0);
        if (xl && yh) add(-1, 1, 0);
        if (xh && yl) add(1, -1, 0);
        if (xh && yh) add(1, 1, 0);
      }
      return;
    }
    const zl = z > 0;
    const zh = z < MZ - 1;
    if (zl) add(0, 0, -1);
    if (zh) add(0, 0, 1);
    if (edges) {
      if (xl && yl) add(-1, -1, 0);
      if (xl && yh) add(-1, 1, 0);
      if (xh && yl) add(1, -1, 0);
      if (xh && yh) add(1, 1, 0);
      if (xl && zl) add(-1, 0, -1);
      if (xl && zh) add(-1, 0, 1);
      if (xh && zl) add(1, 0, -1);
      if (xh && zh) add(1, 0, 1);
      if (yl && zl) add(0, -1, -1);
      if (yl && zh) add(0, -1, 1);
      if (yh && zl) add(0, 1, -1);
      if (yh && zh) add(0, 1, 1);
    }
    if (vertices) {
      for (const [a, b, c] of [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, -1],
        [-1, 1, 1],
        [1, -1, -1],
        [1, -1, 1],
        [1, 1, -1],
        [1, 1, 1],
      ] as const) {
        if ((a < 0 ? xl : xh) && (b < 0 ? yl : yh) && (c < 0 ? zl : zh)) add(a, b, c);
      }
    }
  }

  /** Next step downhill (to generation g - 1), honouring inertia. */
  private direction(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
  ): [number, number, number] {
    const { MX, MY, MZ } = this.ctx.grid;
    const { rng } = this.ctx;
    const { inertia, edges, vertices } = this.opts;
    const gen = this.generations;
    const plane = MX * MY;
    const g = gen[x + y * MX + z * plane]! - 1;
    const cands: number[] = [];
    const add = (a: number, b: number, c: number) => {
      if (gen[x + a + (y + b) * MX + (z + c) * plane] === g) cands.push(a, b, c);
    };
    const moving = dx !== 0 || dy !== 0 || dz !== 0;

    if (!vertices && !edges) {
      if (inertia && moving) {
        const cx = x + dx;
        const cy = y + dy;
        const cz = z + dz;
        if (
          cx >= 0 &&
          cy >= 0 &&
          cz >= 0 &&
          cx < MX &&
          cy < MY &&
          cz < MZ &&
          gen[cx + cy * MX + cz * plane] === g
        ) {
          return [dx, dy, dz];
        }
      }
      if (x > 0) add(-1, 0, 0);
      if (x < MX - 1) add(1, 0, 0);
      if (y > 0) add(0, -1, 0);
      if (y < MY - 1) add(0, 1, 0);
      if (z > 0) add(0, 0, -1);
      if (z < MZ - 1) add(0, 0, 1);
      const k = rng.nextInt(cands.length / 3) * 3;
      return [cands[k]!, cands[k + 1]!, cands[k + 2]!];
    }

    const dirs: number[] = [];
    this.directions(x, y, z, dirs);
    for (let k = 0; k < dirs.length; k += 3) add(dirs[k]!, dirs[k + 1]!, dirs[k + 2]!);
    if (inertia && moving) {
      let best = -4;
      let result: [number, number, number] = [0, 0, 0];
      for (let k = 0; k < cands.length; k += 3) {
        const a = cands[k]!;
        const b = cands[k + 1]!;
        const c = cands[k + 2]!;
        const noise = 0.1 * rng.next();
        const cos =
          (a * dx + b * dy + c * dz) /
          Math.sqrt((a * a + b * b + c * c) * (dx * dx + dy * dy + dz * dz));
        if (cos + noise > best) {
          best = cos + noise;
          result = [a, b, c];
        }
      }
      return result;
    }
    const k = rng.nextInt(cands.length / 3) * 3;
    return [cands[k]!, cands[k + 1]!, cands[k + 2]!];
  }
}
