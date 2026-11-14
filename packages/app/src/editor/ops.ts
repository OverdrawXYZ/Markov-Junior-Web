/**
 * Pure, immutable edit operations on the program AST. The visual editor only
 * changes programs through these; each returns a new Program (or the same
 * object when the edit is not applicable).
 */
import {
  alphabetAt,
  isBranch,
  hasRules,
  isConvolution,
  isMap,
  isPath,
  isRuleNode,
  type ConvolutionNodeDef,
  type ConvolutionRuleDef,
  type FieldDef,
  type MapNodeDef,
  type MapRuleDef,
  type PathNodeDef,
  type Neighborhood,
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
export const NODE_KINDS: readonly NodeDef['kind'][] = [
  ...RULE_KINDS,
  ...BRANCH_KINDS,
  'convolution',
  'path',
  'map',
];

/** Nodes that hold a list of rules. */
export type RulesNode = RuleNodeDef | ConvolutionNodeDef;
export type AnyRule = RuleDef | ConvolutionRuleDef;

/** Kinds a node can be switched between without losing its contents. */
export function kindFamily(kind: NodeDef['kind']): readonly NodeDef['kind'][] {
  if (isRuleKind(kind)) return RULE_KINDS;
  if (kind === 'convolution' || kind === 'path' || kind === 'map') return [kind];
  return BRANCH_KINDS;
}

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
    const next = rec(child, depth + 1);
    if (next === child) return node; // unchanged: keep identity so no-op edits are detectable
    const children = node.children.slice();
    children[i] = next;
    return { ...node, children };
  };
  const root = rec(program.root, 0);
  return root === program.root ? program : { ...program, root };
}

type BranchLike = BranchNodeDef | MapNodeDef;

function mapBranch(
  program: Program,
  path: NodePath,
  fn: (node: BranchLike) => BranchLike,
): Program {
  return mapNode(program, path, (n) => (isBranch(n) ? fn(n) : n));
}

function mapRuleNode(
  program: Program,
  path: NodePath,
  fn: (node: RulesNode) => RulesNode,
): Program {
  return mapNode(program, path, (n) => (hasRules(n) ? fn(n) : n));
}

export function defaultRule(program: Program): RuleDef {
  const a = program.values[0] ?? 'B';
  return { in: a, out: program.values[1] ?? a };
}

/** A starting convolution rule: the first symbol turns into the second next to one. */
export function defaultConvolutionRule(program: Program): ConvolutionRuleDef {
  const a = program.values[0] ?? 'B';
  const b = program.values[1] ?? a;
  return { in: a, out: b, values: b, sum: '1..8' };
}

export function newNode(kind: NodeDef['kind'], program: Program): NodeDef {
  if (isRuleKind(kind)) return { kind, rules: [defaultRule(program)] };
  if (kind === 'convolution') {
    return { kind, neighborhood: 'Moore', rules: [defaultConvolutionRule(program)] };
  }
  if (kind === 'map') {
    return { kind, scale: '2 2 1', values: program.values, rules: [], children: [] };
  }
  if (kind === 'path') {
    const v = program.values;
    return { kind, from: v[1] ?? v[0] ?? 'B', to: v[2] ?? v[1] ?? v[0] ?? 'B', on: v[0] ?? 'B' };
  }
  return { kind, children: [] };
}

/** Patch simple node fields. `undefined` values remove the field. */
export function updateNode(
  program: Program,
  path: NodePath,
  patch: {
    symmetry?: string | undefined;
    comment?: string | undefined;
    steps?: number | undefined;
    neighborhood?: Neighborhood | undefined;
    periodic?: boolean | undefined;
    temperature?: number | undefined;
  },
): Program {
  return mapNode(program, path, (node) => {
    const next: Record<string, unknown> = { ...node };
    const conv = isConvolution(node);
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'steps' && isBranch(node)) continue;
      if (k === 'symmetry' && conv) continue;
      if ((k === 'neighborhood' || k === 'periodic') && !conv) continue;
      if (k === 'temperature' && !isRuleNode(node)) continue;
      if (k === 'temperature' && v === 0) {
        delete next[k];
        continue;
      }
      if (k === 'neighborhood' && v === undefined) continue;
      if (v === undefined || v === '' || v === false) delete next[k];
      else next[k] = v;
    }
    return next as unknown as NodeDef;
  });
}

/** Change kind within the same family (one/all/prl or markov/sequence). */
export function setKind(program: Program, path: NodePath, kind: NodeDef['kind']): Program {
  return mapNode(program, path, (node) => {
    if (node.kind === kind || !kindFamily(node.kind).includes(kind)) return node;
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
  // A map's children use its alphabet, so they can't simply move out of it.
  if (!node || !isBranch(node) || isMap(node)) return program;
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

export function addRule(program: Program, path: NodePath, rule?: AnyRule): Program {
  return mapRuleNode(program, path, (n) => {
    const next =
      rule ?? (isConvolution(n) ? defaultConvolutionRule(program) : defaultRule(program));
    return { ...n, rules: [...n.rules, next] } as RulesNode;
  });
}

export function updateRule(
  program: Program,
  path: NodePath,
  index: number,
  patch: {
    in?: string;
    out?: string;
    p?: number | undefined;
    symmetry?: string | undefined;
    values?: string | undefined;
    sum?: string | undefined;
  },
): Program {
  return mapRuleNode(program, path, (n) => {
    const rule = n.rules[index];
    if (!rule) return n;
    const next: Record<string, unknown> = { ...rule };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    const rules: AnyRule[] = n.rules.slice();
    rules[index] = next as unknown as AnyRule;
    return { ...n, rules } as RulesNode;
  });
}

export function removeRule(program: Program, path: NodePath, index: number): Program {
  return mapRuleNode(
    program,
    path,
    (n) => ({ ...n, rules: (n.rules as AnyRule[]).filter((_, i) => i !== index) }) as RulesNode,
  );
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

/** Apply `fn` to every rule (of rule and convolution nodes). */
// The helpers below stay within one alphabet: they don't look inside maps, which
// have their own. (A map's rule inputs do belong to the outer alphabet.)

function allFields(node: NodeDef): FieldDef[] {
  if (isMap(node)) return [];
  if (isBranch(node)) return node.children.flatMap(allFields);
  return isRuleNode(node) ? (node.fields ?? []) : [];
}

function allRules(node: NodeDef): { in: string; out: string; values?: string }[] {
  if (isMap(node)) return node.rules.map((r) => ({ in: r.in, out: '' }));
  if (isBranch(node)) return node.children.flatMap(allRules);
  return hasRules(node) ? node.rules : [];
}

function allPaths(node: NodeDef): PathNodeDef[] {
  if (isMap(node)) return [];
  if (isBranch(node)) return node.children.flatMap(allPaths);
  return isPath(node) ? [node] : [];
}

/** How many rules (plus unions) refer to symbol `ch`. */
export function symbolUsage(program: Program, ch: string): number {
  const rules = allRules(program.root).filter(
    (r) => r.in.includes(ch) || r.out.includes(ch) || ('values' in r && r.values?.includes(ch)),
  ).length;
  const unions = (program.unions ?? []).filter(
    (u) => u.values.includes(ch) || u.symbol === ch,
  ).length;
  const fields = allFields(program.root).filter((f) =>
    [f.for, f.on, f.to ?? '', f.from ?? ''].some((part) => part.includes(ch)),
  ).length;
  const paths = allPaths(program.root).filter((n) =>
    [n.from, n.to, n.on, n.color ?? ''].some((part) => part.includes(ch)),
  ).length;
  return rules + unions + fields + paths;
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
  const renameRule = <R extends AnyRule>(r: R): R => {
    const next = { ...r, in: swap(r.in), out: swap(r.out) };
    if ('values' in next && next.values !== undefined) next.values = swap(next.values);
    return next;
  };
  const rec = (node: NodeDef): NodeDef => {
    // Inside a map is another alphabet: only the map's rule inputs use this one.
    if (isMap(node)) return { ...node, rules: node.rules.map((r) => ({ ...r, in: swap(r.in) })) };
    if (isBranch(node)) return { ...node, children: node.children.map(rec) };
    if (isPath(node)) {
      const next: PathNodeDef = {
        ...node,
        from: swap(node.from),
        to: swap(node.to),
        on: swap(node.on),
      };
      if (node.color !== undefined) next.color = swap(node.color);
      return next;
    }
    if (isConvolution(node)) return { ...node, rules: node.rules.map(renameRule) };
    const next: RuleNodeDef = { ...node, rules: node.rules.map(renameRule) };
    if (node.fields) {
      next.fields = node.fields.map((f) => {
        const g: FieldDef = { ...f, for: swap(f.for), on: swap(f.on) };
        if (f.to !== undefined) g.to = swap(f.to);
        if (f.from !== undefined) g.from = swap(f.from);
        return g;
      });
    }
    return next;
  };
  const next: Program = { ...program, values: swap(program.values), root: rec(program.root) };
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

// ---------------------------------------------------------------- fields

function mapFields(
  program: Program,
  path: NodePath,
  fn: (fields: FieldDef[]) => FieldDef[],
): Program {
  return mapNode(program, path, (n) => {
    if (!isRuleNode(n)) return n;
    const fields = fn(n.fields ?? []);
    const next: RuleNodeDef = { ...n, fields };
    if (fields.length === 0) delete next.fields;
    return next;
  });
}

/** A starting field: guide the second symbol towards the third (or first) through the first. */
export function defaultField(program: Program): FieldDef {
  const v = program.values;
  return { for: v[1] ?? v[0] ?? 'B', to: v[2] ?? v[0] ?? 'B', on: v[0] ?? 'B' };
}

export function addField(program: Program, path: NodePath, field = defaultField(program)): Program {
  return mapFields(program, path, (fields) => [...fields, field]);
}

/** Patch a field; `undefined` removes optional keys. Setting `to` clears `from` and vice versa. */
export function updateField(
  program: Program,
  path: NodePath,
  index: number,
  patch: Partial<Record<keyof FieldDef, string | boolean | undefined>>,
): Program {
  return mapFields(program, path, (fields) =>
    fields.map((f, i) => {
      if (i !== index) return f;
      const next: Record<string, unknown> = { ...f };
      if ('to' in patch && patch.to !== undefined) delete next.from;
      if ('from' in patch && patch.from !== undefined) delete next.to;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === false) delete next[k];
        else next[k] = v;
      }
      return next as unknown as FieldDef;
    }),
  );
}

export function removeField(program: Program, path: NodePath, index: number): Program {
  return mapFields(program, path, (fields) => fields.filter((_, i) => i !== index));
}

// ---------------------------------------------------------------- paths

/** Patch a path node; `undefined`/`false` remove optional keys. */
export function updatePath(
  program: Program,
  path: NodePath,
  patch: Partial<Record<'from' | 'to' | 'on' | 'color', string | undefined>> &
    Partial<Record<'inertia' | 'longest' | 'edges' | 'vertices', boolean>>,
): Program {
  return mapNode(program, path, (n) => {
    if (!isPath(n)) return n;
    const next: Record<string, unknown> = { ...n };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === false) delete next[k];
      else next[k] = v;
    }
    return next as unknown as PathNodeDef;
  });
}

// ---------------------------------------------------------------- maps

/** Patch a map node's scale, alphabet or other fields. */
export function updateMap(
  program: Program,
  path: NodePath,
  patch: { scale?: string; values?: string },
): Program {
  return mapNode(program, path, (n) => (isMap(n) ? { ...n, ...patch } : n));
}

function mapMapRules(
  program: Program,
  path: NodePath,
  fn: (rules: MapRuleDef[]) => MapRuleDef[],
): Program {
  return mapNode(program, path, (n) => (isMap(n) ? { ...n, rules: fn(n.rules) } : n));
}

/** A starting map rule: the outer first symbol becomes a block of the map's first symbol. */
export function defaultMapRule(program: Program, path: NodePath): MapRuleDef {
  const node = nodeAt(program.root, path);
  const outer = alphabetAt(program, path).values;
  const inner = node && isMap(node) ? node.values : outer;
  const [nx, ny] = (node && isMap(node) ? node.scale : '1 1 1')
    .split(/\s+/)
    .map((p) => Math.max(1, parseInt(p) || 1));
  const block = (ch: string) => Array.from({ length: ny! }, () => ch.repeat(nx!)).join('/');
  return { in: outer[0] ?? 'B', out: block(inner[inner.length > 1 ? 1 : 0] ?? 'B') };
}

export function addMapRule(program: Program, path: NodePath, rule?: MapRuleDef): Program {
  const next = rule ?? defaultMapRule(program, path);
  return mapMapRules(program, path, (rules) => [...rules, next]);
}

export function updateMapRule(
  program: Program,
  path: NodePath,
  index: number,
  patch: { in?: string; out?: string; comment?: string | undefined },
): Program {
  return mapMapRules(program, path, (rules) =>
    rules.map((r, i) => {
      if (i !== index) return r;
      const next: Record<string, unknown> = { ...r };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') delete next[k];
        else next[k] = v;
      }
      return next as unknown as MapRuleDef;
    }),
  );
}

export function removeMapRule(program: Program, path: NodePath, index: number): Program {
  return mapMapRules(program, path, (rules) => rules.filter((_, i) => i !== index));
}

export function moveMapRule(program: Program, path: NodePath, from: number, to: number): Program {
  return mapMapRules(program, path, (rules) => {
    if (from === to || !rules[from] || to < 0 || to >= rules.length) return rules;
    const next = rules.slice();
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r!);
    return next;
  });
}

/**
 * The program as seen from `path`: the same tree, with `values` and `unions`
 * replaced by the alphabet in scope there (a map's, inside a map). For display
 * and pickers; edits still go through the real program.
 */
export function scopedProgram(program: Program, path: NodePath): Program {
  const { values, unions } = alphabetAt(program, path);
  const sameUnions = unions === program.unions || (unions.length === 0 && !program.unions?.length);
  if (values === program.values && sameUnions) return program;
  return { ...program, values, unions: [...unions] };
}
