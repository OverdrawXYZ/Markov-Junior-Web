import {
  isBranch,
  isRuleNode,
  nodeAt,
  type NodeDef,
  type NodePath,
  type Program,
  type RuleDef,
} from './program';
import { isSymmetryName, SQUARE_SUBGROUPS, squareSymmetries } from './symmetry';

export const DEFAULT_SYMMETRY = '(xy)';

interface Grid2 {
  inp: string[];
  out: string[];
  MX: number;
  MY: number;
}

function toGrid(rule: Pick<RuleDef, 'in' | 'out'>): Grid2 | null {
  const a = rule.in.split('/');
  const b = rule.out.split('/');
  const MX = a[0]!.length;
  const MY = a.length;
  const ok = (rows: string[]) => rows.length === MY && rows.every((r) => r.length === MX);
  if (MX === 0 || !ok(a) || !ok(b) || rule.in.includes(' ')) return null;
  return { inp: [...a.join('')], out: [...b.join('')], MX, MY };
}

const rows = (cells: string[], MX: number) =>
  Array.from({ length: cells.length / MX }, (_, y) =>
    cells.slice(y * MX, (y + 1) * MX).join(''),
  ).join('/');

/** Rotate 90° (same convention as the compiled Rule). */
function rotate(g: Grid2): Grid2 {
  const { MX, MY } = g;
  const inp = new Array<string>(MX * MY);
  const out = new Array<string>(MX * MY);
  for (let y = 0; y < MX; y++)
    for (let x = 0; x < MY; x++) {
      const from = MX - 1 - y + x * MX;
      inp[x + y * MY] = g.inp[from]!;
      out[x + y * MY] = g.out[from]!;
    }
  return { inp, out, MX: MY, MY: MX };
}

function reflect(g: Grid2): Grid2 {
  const { MX, MY } = g;
  const inp = new Array<string>(MX * MY);
  const out = new Array<string>(MX * MY);
  for (let y = 0; y < MY; y++)
    for (let x = 0; x < MX; x++) {
      inp[x + y * MX] = g.inp[MX - 1 - x + y * MX]!;
      out[x + y * MX] = g.out[MX - 1 - x + y * MX]!;
    }
  return { inp, out, MX, MY };
}

const same = (a: Grid2, b: Grid2) =>
  a.MX === b.MX &&
  a.MY === b.MY &&
  a.inp.join('') === b.inp.join('') &&
  a.out.join('') === b.out.join('');

/**
 * The distinct variants a rule expands into under a symmetry subgroup, as
 * pattern strings — for previewing in the editor. Returns [] for malformed
 * or 3D patterns.
 */
export function ruleVariants(
  rule: Pick<RuleDef, 'in' | 'out'>,
  symmetry: string,
): { in: string; out: string }[] {
  const g = toGrid(rule);
  if (!g || !isSymmetryName(symmetry)) return [];
  return squareSymmetries(g, rotate, reflect, same, SQUARE_SUBGROUPS[symmetry]).map((v) => ({
    in: rows(v.inp, v.MX),
    out: rows(v.out, v.MX),
  }));
}

/**
 * The symmetry that applies to a node (or one of its rules), following the
 * inheritance chain: rule → node → ancestors → default `(xy)`.
 */
const symmetryOf = (node: NodeDef): string | undefined =>
  'symmetry' in node ? node.symmetry : undefined;

export function effectiveSymmetry(program: Program, path: NodePath, rule?: number): string {
  let result = DEFAULT_SYMMETRY;
  let node = program.root;
  result = symmetryOf(node) ?? result;
  for (const i of path) {
    if (!isBranch(node)) break;
    const child = node.children[i];
    if (!child) break;
    node = child;
    result = symmetryOf(node) ?? result;
  }
  if (rule !== undefined) {
    const target = nodeAt(program.root, path);
    const r = target && isRuleNode(target) ? target.rules[rule] : undefined;
    if (r?.symmetry !== undefined) result = r.symmetry;
  }
  return result;
}
