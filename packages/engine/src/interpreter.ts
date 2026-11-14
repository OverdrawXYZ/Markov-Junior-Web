import { compileProgram } from './compile';
import type { Context } from './context';
import { Grid } from './grid';
import { IntList } from './int-list';
import type { Branch } from './nodes/node';
import type { NodePath, Program } from './program';
import { createRng } from './rng';

export interface RunOptions {
  width: number;
  height: number;
  seed: number;
}

export interface StepResult {
  /** True once the program can make no further progress. */
  halted: boolean;
  /** Total turns executed since the last reset. */
  stepCount: number;
  /**
   * Flat indices (x + y*width) of cells written during this call. May contain
   * duplicates. A view into internal storage: valid until the next step/reset.
   */
  changed: Int32Array;
  /** AST path of the rule node that made progress most recently, if any. */
  activeNodePath: NodePath | null;
}

export interface Run {
  /** Size of the current grid (a `map` node can change it mid-run). */
  readonly width: number;
  readonly height: number;
  /** Symbol characters of the current grid; `state[i]` indexes into this. */
  readonly characters: string;
  /** Live state of the current grid, x-fastest. Mutated in place by `step`. */
  readonly state: Uint8Array;
  readonly halted: boolean;
  readonly stepCount: number;
  /** Execute up to `n` turns (default 1), stopping early if the program halts. */
  step(n?: number): StepResult;
  /** Run until halted or `maxSteps` more turns have executed. */
  runToEnd(maxSteps?: number): StepResult;
  /** Restart from the initial grid, optionally with a new seed. */
  reset(seed?: number): void;
}

/** Compile `program` for a grid of the given size. Throws ProgramError if invalid. */
export function createRun(program: Program, options: RunOptions): Run {
  const { width, height } = options;
  if (!(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0)) {
    throw new RangeError(`grid size must be positive integers, got ${width}×${height}`);
  }
  const grid = new Grid(program.values, program.unions ?? [], width, height, 1);
  const ctx: Context = {
    grid,
    rng: createRng(options.seed),
    changes: new IntList(1024),
    first: [0],
    counter: 0,
    current: null,
    lastActive: null,
  };
  const root: Branch = compileProgram(program, ctx);
  const origin = program.origin ?? false;
  let seed = options.seed;

  const reset = (newSeed?: number): void => {
    if (newSeed !== undefined) seed = newSeed;
    ctx.rng = createRng(seed);
    ctx.grid = grid; // a map may have switched to its own grid
    grid.clear();
    if (origin) {
      const { MX, MY, MZ } = grid;
      grid.state[(MX >> 1) + (MY >> 1) * MX + (MZ >> 1) * MX * MY] = 1;
    }
    ctx.changes.clear();
    ctx.first = [0];
    ctx.counter = 0;
    ctx.lastActive = null;
    root.reset();
    ctx.current = root;
  };

  const step = (n = 1): StepResult => {
    const from = ctx.changes.length;
    for (let i = 0; i < n && ctx.current !== null; i++) {
      ctx.current.go();
      ctx.counter++;
      ctx.first.push(ctx.changes.length);
    }
    return {
      halted: ctx.current === null,
      stepCount: ctx.counter,
      changed: ctx.changes.data.subarray(from, ctx.changes.length),
      activeNodePath: ctx.lastActive?.path ?? null,
    };
  };

  reset();

  return {
    // A map node can replace the grid mid-run, so these follow the current one.
    get width() {
      return ctx.grid.MX;
    },
    get height() {
      return ctx.grid.MY;
    },
    get characters() {
      return ctx.grid.characters;
    },
    get state() {
      return ctx.grid.state;
    },
    get halted() {
      return ctx.current === null;
    },
    get stepCount() {
      return ctx.counter;
    },
    step,
    runToEnd: (maxSteps = Number.POSITIVE_INFINITY) => step(maxSteps),
    reset,
  };
}
