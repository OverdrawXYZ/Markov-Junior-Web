/**
 * Pure, immutable edit operations on the program AST. The visual editor only
 * changes programs through these; each returns a new Program (or the same
 * object when the edit is not applicable).
 */
import {
  isBranch,
  nodeAt,
  type BranchNodeDef,
  type BranchNodeKind,
  type NodeDef,
  type NodePath,
  type Program,
  type RuleDef,
  type RuleNodeDef,
  type RuleNodeKind,
  type UnionDef,
} from '@mj/engine';

export const RULE_KINDS: readonly RuleNodeKind[] = ['one', 'all', 'prl'];
export const BRANCH_KINDS: readonly BranchNodeKind[] = ['markov', 'sequence'];
export const NODE_KINDS: readonly NodeDef['kind'][] = [...RULE_KINDS, ...BRANCH_KINDS];

export const isRuleKind = (kind: NodeDef['kind']): kind is RuleNodeKind =>
  (RULE_KINDS as readonly string[]).includes(kind);

// ---------------------------------------------------------------- paths

export const samePath = (a: NodePath, b: NodePath) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** True if `a` is `b` or an ancestor of it. */
export const isAncestorOrSelf = (a: NodePath, b: NodePath) =>
  a.length <= b.length && a.every((v, i) => v === b[i]);

export const parentOf = (path: NodePath): NodePath => path.slice(0, -1);

// ---------------------------------------------------------------- tree surgery

/** Replace the node at `path` with `fn(node)`. */
export function mapNode(program: Program, path: NodePath, fn: (node: NodeDef) => NodeDef): Program {
  const rec = (node: NodeDef, depth: number): NodeDef => {
    if (depth === path.length) return fn(node);
    if (!isBranch(node)) return node;
    const i = path[depth]!;
    const child = node.children[i];
    if (!child) return node;
    const children = node.children.slice();
    children[i] = rec(child, depth + 1);
    return { ...node, children };
  };
  const root = rec(program.root, 0);
  return root === program.root ? program : { ...program, root };
}

function mapBranch(
  program: Program,
  path: NodePath,
  fn: (node: BranchNodeDef) => BranchNodeDef,
): Program {
  return mapNode(program, path, (n) => (isBranch(n) ? fn(n) : n));
}

function mapRuleNode(
  program: Program,
  path: NodePath,
  fn: (node: RuleNodeDef) => RuleNodeDef,
): Program {
  return mapNode(program, path, (n) => (isBranch(n) ? n : fn(n)));
}

export function defaultRule(program: Program): RuleDef {
  const a = program.values[0] ?? 'B';
  return { in: a, out: program.values[1] ?? a };
}

export function newNode(kind: NodeDef['kind'], program: Program): NodeDef {
  return isRuleKind(kind) ? { kind, rules: [defaultRule(program)] } : { kind, children: [] };
}

/** Patch simple node fields. `undefined` values remove the field. */
export function updateNode(
  program: Program,
  path: NodePath,
  patch: {
    symmetry?: string | undefined;
    comment?: string | undefined;
    steps?: number | undefined;
  },
): Program {
  return mapNode(program, path, (node) => {
    const next: Record<string, unknown> = { ...node };
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'steps' && isBranch(node)) continue;
      if (v === undefined || v === '') delete next[k];
      else next[k] = v;
    }
    return next as unknown as NodeDef;
  });
}

/** Change kind within the same family (one/all/prl or markov/sequence). */
export function setKind(program: Program, path: NodePath, kind: NodeDef['kind']): Program {
  return mapNode(program, path, (node) => {
    if (isRuleKind(kind) !== !isBranch(node)) return node;
    return { ...node, kind } as NodeDef;
  });
}

/** Insert `node` into the branch at `parent` (wrapping a rule-node root in markov first). */
export function insertNode(
  program: Program,
  parent: NodePath,
  index: number,
  node: NodeDef,
): { program: Program; path: NodePath } {
  let p = program;
  let parentPath = parent;
  if (parent.length === 0 && !isBranch(p.root)) {
    // A rule node at the root already runs as if wrapped in markov.
    p = { ...p, root: { kind: 'markov', children: [p.root] } };
  }
  const target = nodeAt(p.root, parentPath);
  if (!target || !isBranch(target)) return { program, path: parent };
  const i = Math.max(0, Math.min(index, target.children.length));
  p = mapBranch(p, parentPath, (b) => {
    const children = b.children.slice();
    children.splice(i, 0, node);
    return { ...b, children };
  });
  parentPath = [...parentPath, i];
  return { program: p, path: parentPath };
}

/**
 * Add a node relative to the current selection: inside it if it's a branch,
 * otherwise right after it. With no selection, append to the root.
 */
export function addNode(
  program: Program,
  selected: NodePath | null,
  node: NodeDef,
): { program: Program; path: NodePath } {
  const sel = selected ?? [];
  const target = nodeAt(program.root, sel);
  if (target && isBranch(target)) return insertNode(program, sel, target.children.length, node);
  if (sel.length === 0) return insertNode(program, [], 1, node);
  return insertNode(program, parentOf(sel), sel[sel.length - 1]! + 1, node);
}

export function removeNode(program: Program, path: NodePath): Program {
  if (path.length === 0) return program;
  const i = path[path.length - 1]!;
  return mapBranch(program, parentOf(path), (b) => ({
    ...b,
    children: b.children.filter((_, j) => j !== i),
  }));
}

export function duplicateNode(
  program: Program,
  path: NodePath,
): { program: Program; path: NodePath } {
  const node = nodeAt(program.root, path);
  if (!node || path.length === 0) return { program, path };
  return insertNode(program, parentOf(path), path[path.length - 1]! + 1, structuredClone(node));
}

/**
 * Move a node into branch `toParent` at `toIndex` (index as seen before the
 * move). Refuses to move a node into itself or its descendants.
 */
export function moveNode(
  program: Program,
  from: NodePath,
  toParent: NodePath,
  toIndex: number,
): { program: Program; path: NodePath } {
  const node = nodeAt(program.root, from);
  const target = nodeAt(program.root, toParent);
  if (
    !node ||
    from.length === 0 ||
    !target ||
    !isBranch(target) ||
    isAncestorOrSelf(from, toParent)
  ) {
    return { program, path: from };
  }
  const fromParent = parentOf(from);
  const fromIndex = from[from.length - 1]!;
  const sameParent = samePath(fromParent, toParent);
  let index = Math.max(0, Math.min(toIndex, target.children.length));
  if (sameParent && fromIndex < index) index--;
  if (sameParent && index === fromIndex) return { program, path: from };

  // Adjust the destination path if removing `from` shifts it.
  const adjusted = toParent.slice();
  if (
    fromParent.length < adjusted.length &&
    isAncestorOrSelf(fromParent, adjusted) &&
    adjusted[fromParent.length]! > fromIndex
  ) {
    adjusted[fromParent.length]!--;
  }
  const removed = removeNode(program, from);
  return insertNode(removed, adjusted, index, node);
}

/** Replace the node at `path` with a branch of `kind` containing it. */
export function wrapNode(program: Program, path: NodePath, kind: BranchNodeKind): Program {
  return mapNode(program, path, (node) => ({ kind, children: [node] }));
}

/** Replace a branch with its children (the root only if it has exactly one child). */
export function unwrapNode(program: Program, path: NodePath): Program {
  const node = nodeAt(program.root, path);
  if (!node || !isBranch(node)) return program;
  if (path.length === 0) {
    return node.children.length === 1 ? { ...program, root: node.children[0]! } : program;
  }
  const i = path[path.length - 1]!;
  return mapBranch(program, parentOf(path), (b) => {
    const children = b.children.slice();
    children.splice(i, 1, ...node.children);
    return { ...b, children };
  });
}

// ---------------------------------------------------------------- rules

export function addRule(program: Program, path: NodePath, rule = defaultRule(program)): Program {
  return mapRuleNode(program, path, (n) => ({ ...n, rules: [...n.rules, rule] }));
}

export function updateRule(
  program: Program,
  path: NodePath,
  index: number,
  patch: { in?: string; out?: string; p?: number | undefined; symmetry?: string | undefined },
): Program {
  return mapRuleNode(program, path, (n) => {
    const rule = n.rules[index];
    if (!rule) return n;
    const next: Record<string, unknown> = { ...rule };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    const rules = n.rules.slice();
    rules[index] = next as unknown as RuleDef;
    return { ...n, rules };
  });
}

export function removeRule(program: Program, path: NodePath, index: number): Program {
  return mapRuleNode(program, path, (n) => ({
    ...n,
    rules: n.rules.filter((_, i) => i !== index),
  }));
}

export function duplicateRule(program: Program, path: NodePath, index: number): Program {
  return mapRuleNode(program, path, (n) => {
    const rule = n.rules[index];
    if (!rule) return n;
    const rules = n.rules.slice();
    rules.splice(index + 1, 0, { ...rule });
    return { ...n, rules };
  });
}

export function moveRule(program: Program, path: NodePath, from: number, to: number): Program {
  return mapRuleNode(program, path, (n) => {
    if (from === to || !n.rules[from] || to < 0 || to >= n.rules.length) return n;
    const rules = n.rules.slice();
    const [rule] = rules.splice(from, 1);
    rules.splice(to, 0, rule!);
    return { ...n, rules };
  });
}

// ---------------------------------------------------------------- patterns

export function patternSize(pattern: string): { w: number; h: number } {
  const rows = pattern.split('/');
  return { w: Math.max(0, ...rows.map((r) => r.length)), h: rows.length };
}

/** Resize a pattern, keeping the top-left content and filling new cells. */
export function resizePattern(pattern: string, w: number, h: number, fill = '*'): string {
  const rows = pattern.split('/');
  return Array.from({ length: h }, (_, y) => {
    const row = [...(rows[y] ?? '')].slice(0, w);
    while (row.length < w) row.push(fill);
    return row.join('');
  }).join('/');
}

export function setCell(pattern: string, x: number, y: number, ch: string): string {
  const rows = pattern.split('/');
  const row = [...(rows[y] ?? '')];
  if (x < 0 || x >= row.length) return pattern;
  row[x] = ch;
  rows[y] = row.join('');
  return rows.join('/');
}

export const cellAt = (pattern: string, x: number, y: number): string | undefined =>
  [...(pattern.split('/')[y] ?? '')][x];

// ---------------------------------------------------------------- symbols

function mapRules(program: Program, fn: (rule: RuleDef) => RuleDef): NodeDef {
  const rec = (node: NodeDef): NodeDef =>
    isBranch(node)
      ? { ...node, children: node.children.map(rec) }
      : { ...node, rules: node.rules.map(fn) };
  return rec(program.root);
}

function allRules(node: NodeDef): RuleDef[] {
  return isBranch(node) ? node.children.flatMap(allRules) : node.rules;
}

/** How many rules (plus unions) refer to symbol `ch`. */
export function symbolUsage(program: Program, ch: string): number {
  const rules = allRules(program.root).filter(
    (r) => r.in.includes(ch) || r.out.includes(ch),
  ).length;
  const unions = (program.unions ?? []).filter(
    (u) => u.values.includes(ch) || u.symbol === ch,
  ).length;
  return rules + unions;
}

/** Characters that may not be used as a new symbol or union. */
export function isReservedChar(program: Program, ch: string): boolean {
  return (
    [...ch].length !== 1 ||
    /[\s/*]/.test(ch) ||
    program.values.includes(ch) ||
    (program.unions ?? []).some((u) => u.symbol === ch)
  );
}

export function addSymbol(program: Program, ch: string): Program {
  if (isReservedChar(program, ch)) return program;
  return { ...program, values: program.values + ch };
}

/** Remove an unused symbol (refuses if any rule or union uses it, or it's the last one). */
export function removeSymbol(program: Program, ch: string): Program {
  if (!program.values.includes(ch) || program.values.length === 1 || symbolUsage(program, ch) > 0)
    return program;
  return { ...program, values: program.values.replace(ch, '') };
}

/** Rename a symbol or union character everywhere it appears. */
export function renameSymbol(program: Program, from: string, to: string): Program {
  const isValue = program.values.includes(from);
  const isUnion = (program.unions ?? []).some((u) => u.symbol === from);
  if ((!isValue && !isUnion) || isReservedChar(program, to)) return program;
  const swap = (s: string) => [...s].map((c) => (c === from ? to : c)).join('');
  const unions = program.unions?.map((u) => ({ symbol: swap(u.symbol), values: swap(u.values) }));
  const next: Program = {
    ...program,
    values: swap(program.values),
    root: mapRules(program, (r) => ({ ...r, in: swap(r.in), out: swap(r.out) })),
  };
  if (unions) next.unions = unions;
  return next;
}

/** Move a symbol within the alphabet (order matters: index 0 fills the grid, 1 is the origin seed). */
export function moveSymbol(program: Program, ch: string, delta: number): Program {
  const chars = [...program.values];
  const i = chars.indexOf(ch);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= chars.length) return program;
  chars.splice(i, 1);
  chars.splice(j, 0, ch);
  return { ...program, values: chars.join('') };
}

export function setOrigin(program: Program, origin: boolean): Program {
  const next = { ...program };
  if (origin) next.origin = true;
  else delete next.origin;
  return next;
}

// ---------------------------------------------------------------- unions

const UNION_CANDIDATES = '?!%&$#@~^+=-_<>.,;:|0123456789';

export function nextUnionSymbol(program: Program): string | undefined {
  return [...UNION_CANDIDATES].find((c) => !isReservedChar(program, c));
}

export function addUnion(program: Program, union?: UnionDef): Program {
  const symbol = union?.symbol ?? nextUnionSymbol(program);
  if (!symbol || isReservedChar(program, symbol)) return program;
  const values = union?.values ?? program.values.slice(0, 2);
  return { ...program, unions: [...(program.unions ?? []), { symbol, values }] };
}

export function setUnionValues(program: Program, index: number, values: string): Program {
  const unions = (program.unions ?? []).map((u, i) => (i === index ? { ...u, values } : u));
  return { ...program, unions };
}

export function removeUnion(program: Program, index: number): Program {
  const unions = (program.unions ?? []).filter((_, i) => i !== index);
  const next: Program = { ...program, unions };
  if (unions.length === 0) delete next.unions;
  return next;
}
