import type { Context } from './context';
import { ProgramError } from './errors';
import { Field } from './field';
import { Grid } from './grid';
import { AllNode } from './nodes/all';
import { Branch, MarkovNode, SequenceNode, type Node } from './nodes/node';
import { ConvolutionNode, KERNELS_2D } from './nodes/convolution';
import { MapNode } from './nodes/map';
import { OneNode } from './nodes/one';
import { PathNode } from './nodes/path';
import { parseSum } from './convolution-sum';
import { PrlNode } from './nodes/prl';
import {
  isBranch,
  isConvolution,
  isMap,
  isPath,
  type ConvolutionNodeDef,
  type FieldDef,
  type MapNodeDef,
  type NodeDef,
  type NodePath,
  type Program,
  type RuleDef,
} from './program';
import { parsePattern, Rule, WILDCARD_OUT } from './rule';
import { FULL_SQUARE_SYMMETRY, resolveSymmetry, type SymmetryMask } from './symmetry';
import { parseScaleComponent, validateProgram } from './validate';

/**
 * Build the executable node tree. Throws ProgramError if the program is invalid.
 * A non-branch root is wrapped in a markov node (as MarkovJunior does).
 */
export function compileProgram(program: Program, ctx: Context): Branch {
  const issues = validateProgram(program);
  if (issues.length > 0) throw new ProgramError(issues);

  const top = compileNode(program.root, [], FULL_SQUARE_SYMMETRY, ctx);
  if (top instanceof Branch) return top;
  const wrapper = new MarkovNode(ctx, []);
  wrapper.setChildren([top]);
  return wrapper;
}

function compileNode(def: NodeDef, path: NodePath, inherited: SymmetryMask, ctx: Context): Node {
  if (isConvolution(def)) return compileConvolution(def, path, ctx);
  if (isPath(def)) {
    const { grid } = ctx;
    return new PathNode(ctx, path, {
      start: grid.wave(def.from),
      finish: grid.wave(def.to),
      substrate: grid.wave(def.on),
      value: grid.values.get(def.color ?? def.from[0]!)!,
      inertia: def.inertia ?? false,
      longest: def.longest ?? false,
      edges: def.edges ?? false,
      vertices: def.vertices ?? false,
    });
  }
  const symmetry = resolveSymmetry(def.symmetry, inherited)!;

  if (isMap(def)) return compileMap(def, path, symmetry, ctx);
  if (isBranch(def)) {
    const branch = def.kind === 'markov' ? new MarkovNode(ctx, path) : new SequenceNode(ctx, path);
    branch.setChildren(def.children.map((c, i) => compileNode(c, [...path, i], symmetry, ctx)));
    return branch;
  }

  const rules: Rule[] = [];
  for (const ruleDef of def.rules) {
    const base = compileRule(ruleDef, ctx.grid);
    rules.push(...base.symmetries(resolveSymmetry(ruleDef.symmetry, symmetry)!));
  }
  const steps = def.steps ?? 0;
  const options = {
    fields: compileFields(def.fields, ctx.grid),
    temperature: def.temperature ?? 0,
  };
  switch (def.kind) {
    case 'one':
      return new OneNode(ctx, path, rules, steps, options);
    case 'all':
      return new AllNode(ctx, path, rules, steps, options);
    case 'prl':
      return new PrlNode(ctx, path, rules, steps);
  }
}

/** Compile one rule definition (assumed valid) against a grid's alphabet. */
export function compileRule(def: RuleDef, grid: Grid): Rule {
  const inp = parsePattern(def.in);
  const out = parsePattern(def.out);
  if (typeof inp === 'string' || typeof out === 'string') throw new Error('invalid pattern');
  const input = Int32Array.from(inp.chars, (ch) => grid.waves.get(ch)!);
  const output = Uint8Array.from(out.chars, (ch) =>
    ch === '*' ? WILDCARD_OUT : grid.values.get(ch)!,
  );
  return new Rule(input, output, inp.MX, inp.MY, inp.MZ, grid.C, def.p ?? 1);
}

function compileConvolution(
  def: ConvolutionNodeDef,
  path: NodePath,
  ctx: Context,
): ConvolutionNode {
  const { grid } = ctx;
  const rules = def.rules.map((r) => {
    const sums = r.sum === undefined ? null : parseSum(r.sum);
    return {
      input: grid.values.get(r.in)!,
      output: grid.values.get(r.out)!,
      p: r.p ?? 1,
      values:
        r.values === undefined ? null : Int32Array.from(r.values, (ch) => grid.values.get(ch)!),
      sums: typeof sums === 'string' ? null : sums,
    };
  });
  return new ConvolutionNode(
    ctx,
    path,
    rules,
    KERNELS_2D[def.neighborhood],
    def.periodic ?? false,
    def.steps ?? 0,
  );
}

/** Per-symbol compiled fields, or null if the node has none. */
function compileFields(defs: readonly FieldDef[] | undefined, grid: Grid): (Field | null)[] | null {
  if (!defs || defs.length === 0) return null;
  const fields: (Field | null)[] = new Array<Field | null>(grid.C).fill(null);
  for (const f of defs) {
    fields[grid.values.get(f.for)!] = new Field(
      grid.wave(f.on),
      grid.wave(f.from ?? f.to ?? ''),
      f.from !== undefined,
      f.recompute ?? false,
      f.essential ?? false,
      grid.state.length,
    );
  }
  return fields;
}

function compileMap(
  def: MapNodeDef,
  path: NodePath,
  symmetry: SymmetryMask,
  ctx: Context,
): MapNode {
  const source = ctx.grid;
  const factors = def.scale
    .trim()
    .split(/\s+/)
    .map((part) => parseScaleComponent(part)!);
  const [NX, DX] = factors[0]!;
  const [NY, DY] = factors[1]!;
  const width = Math.floor((source.MX * NX) / DX);
  const height = Math.floor((source.MY * NY) / DY);
  if (width < 1 || height < 1) {
    throw new ProgramError([
      {
        message: `map scale "${def.scale}" makes a ${width}×${height} grid from ${source.MX}×${source.MY}`,
        path,
      },
    ]);
  }
  const target = new Grid(def.values, def.unions ?? [], width, height, 1);

  const rules: Rule[] = [];
  for (const r of def.rules) {
    const inp = parsePattern(r.in);
    const out = parsePattern(r.out);
    if (typeof inp === 'string' || typeof out === 'string') throw new Error('invalid pattern');
    const base = new Rule(
      Int32Array.from(inp.chars, (ch) => source.waves.get(ch)!),
      Uint8Array.from(out.chars, (ch) => (ch === '*' ? WILDCARD_OUT : target.values.get(ch)!)),
      inp.MX,
      inp.MY,
      inp.MZ,
      source.C,
      1,
      out.MX,
      out.MY,
      out.MZ,
    );
    rules.push(...base.symmetries(symmetry));
  }

  const node = new MapNode(ctx, path, source, target, rules, {
    NX: NX!,
    DX: DX!,
    NY: NY!,
    DY: DY!,
  });
  // Children allocate their buffers for, and run on, the map's grid.
  ctx.grid = target;
  try {
    node.setChildren(def.children.map((c, i) => compileNode(c, [...path, i], symmetry, ctx)));
  } finally {
    ctx.grid = source;
  }
  return node;
}
