import type { Issue } from './errors';
import { MAX_SYMBOLS } from './grid';
import { parseSum } from './convolution-sum';
import { KERNELS_2D } from './nodes/convolution';
import {
  isBranch,
  isConvolution,
  isMap,
  isPath,
  type ConvolutionNodeDef,
  type MapNodeDef,
  type UnionDef,
  type PathNodeDef,
  type NodeDef,
  type NodePath,
  type Program,
  type RuleDef,
  type RuleNodeDef,
} from './program';
import { parsePattern } from './rule';
import { isSymmetryName } from './symmetry';

interface Scope {
  /** Symbols of the grid. */
  values: ReadonlySet<string>;
  /** Characters allowed in rule inputs: symbols, unions and `*`. */
  inputs: ReadonlySet<string>;
}

/** Check an alphabet (values + unions) and return its scope. */
function checkAlphabet(
  values: string,
  unions: readonly UnionDef[],
  issues: Issue[],
  path?: NodePath,
): Scope {
  const at = path ? { path } : {};
  if (values.length === 0)
    issues.push({ message: 'values must declare at least one symbol', ...at });
  if (values.length > MAX_SYMBOLS) {
    issues.push({
      message: `at most ${MAX_SYMBOLS} symbols are supported, got ${values.length}`,
      ...at,
    });
  }
  const seen = new Set<string>();
  for (const ch of values) {
    if (ch === '*' || /\s/.test(ch))
      issues.push({ message: `"${ch}" cannot be used as a symbol`, ...at });
    else if (seen.has(ch)) issues.push({ message: `repeating value ${ch}`, ...at });
    seen.add(ch);
  }
  const inputs = new Set([...values, '*']);
  for (const u of unions) {
    if ([...u.symbol].length !== 1) {
      issues.push({ message: `union symbol must be a single character, got "${u.symbol}"`, ...at });
      continue;
    }
    if (inputs.has(u.symbol)) issues.push({ message: `repeating union symbol ${u.symbol}`, ...at });
    if (u.values.length === 0) issues.push({ message: `union ${u.symbol} has no values`, ...at });
    for (const ch of u.values) {
      if (!seen.has(ch))
        issues.push({ message: `union ${u.symbol} uses unknown value ${ch}`, ...at });
    }
    inputs.add(u.symbol);
  }
  return { values: seen, inputs };
}

/** Parse one component of a map scale: "N" or "N/D" with positive integers. */
export function parseScaleComponent(s: string): [number, number] | null {
  const m = /^(\d+)(?:\/(\d+))?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const d = m[2] === undefined ? 1 : Number(m[2]);
  return n > 0 && d > 0 ? [n, d] : null;
}

/** Check a program for every error that can be detected without running it. */
export function validateProgram(program: Program): Issue[] {
  const issues: Issue[] = [];
  const root = checkAlphabet(program.values, program.unions ?? [], issues);
  if (program.origin && program.values.length < 2) {
    issues.push({ message: 'origin requires at least two symbols' });
  }

  const visit = (node: NodeDef, path: NodePath, scope: Scope): void => {
    if ('symmetry' in node && node.symmetry !== undefined && !isSymmetryName(node.symmetry)) {
      issues.push({ message: `unknown symmetry ${node.symmetry}`, path });
    }
    if (isMap(node)) {
      const inner = checkAlphabet(node.values, node.unions ?? [], issues, path);
      validateMap(node, path, scope, inner, issues);
      node.children.forEach((child, i) => visit(child, [...path, i], inner));
      return;
    }
    if (isBranch(node)) {
      node.children.forEach((child, i) => visit(child, [...path, i], scope));
      return;
    }
    if (isPath(node)) {
      validatePath(node, path, scope.values, issues);
      return;
    }
    if (node.steps !== undefined && !(Number.isInteger(node.steps) && node.steps >= 0)) {
      issues.push({ message: `steps must be a non-negative integer, got ${node.steps}`, path });
    }
    if (isConvolution(node)) {
      validateConvolution(node, path, scope.values, issues);
      return;
    }
    if (node.rules.length === 0) issues.push({ message: `${node.kind} node has no rules`, path });
    if (
      node.temperature !== undefined &&
      !(Number.isFinite(node.temperature) && node.temperature >= 0)
    ) {
      issues.push({ message: `temperature must be 0 or more, got ${node.temperature}`, path });
    }
    validateFields(node, path, scope.values, issues);
    node.rules.forEach((rule, r) =>
      validateRule(rule, path, r, scope.inputs, scope.values, issues),
    );
  };
  visit(program.root, [], root);
  return issues;
}

function validateMap(
  node: MapNodeDef,
  path: NodePath,
  outer: Scope,
  inner: Scope,
  issues: Issue[],
): void {
  const parts = node.scale.trim().split(/\s+/);
  if (parts.length !== 3 || parts.some((p) => parseScaleComponent(p) === null)) {
    issues.push({
      message: `scale must be three factors like "2 2 1" or "1/2 1/2 1", got "${node.scale}"`,
      path,
    });
  } else {
    const [n, d] = parseScaleComponent(parts[2]!)!;
    if (Math.floor(n / d) !== 1)
      issues.push({ message: 'the z scale must be 1 (3D grids are not supported yet)', path });
  }
  node.rules.forEach((rule, r) => {
    const at = { path, rule: r };
    const inp = parsePattern(rule.in);
    const out = parsePattern(rule.out);
    if (typeof inp === 'string') issues.push({ message: `input: ${inp}`, ...at });
    else {
      if (inp.MZ > 1) issues.push({ message: '3D patterns are not supported yet', ...at });
      for (const ch of new Set(inp.chars)) {
        if (!outer.inputs.has(ch))
          issues.push({ message: `input symbol ${ch} is not defined outside the map`, ...at });
      }
    }
    if (typeof out === 'string') issues.push({ message: `output: ${out}`, ...at });
    else {
      if (out.MZ > 1) issues.push({ message: '3D patterns are not supported yet', ...at });
      for (const ch of new Set(out.chars)) {
        if (ch !== '*' && !inner.values.has(ch)) {
          issues.push({ message: `output symbol ${ch} is not one of the map's values`, ...at });
        }
      }
    }
  });
}

function validateRule(
  rule: RuleDef,
  path: NodePath,
  r: number,
  inputSymbols: ReadonlySet<string>,
  outputSymbols: ReadonlySet<string>,
  issues: Issue[],
): void {
  const at = { path, rule: r };
  const inp = parsePattern(rule.in);
  const out = parsePattern(rule.out);
  if (typeof inp === 'string') issues.push({ message: `input: ${inp}`, ...at });
  if (typeof out === 'string') issues.push({ message: `output: ${out}`, ...at });
  if (typeof inp !== 'string' && typeof out !== 'string') {
    if (inp.MX !== out.MX || inp.MY !== out.MY || inp.MZ !== out.MZ) {
      issues.push({ message: 'input and output patterns have different sizes', ...at });
    }
    if (inp.MZ > 1) issues.push({ message: '3D patterns are not supported yet', ...at });
  }
  if (typeof inp !== 'string') {
    for (const ch of new Set(inp.chars)) {
      if (!inputSymbols.has(ch))
        issues.push({ message: `input symbol ${ch} is not defined`, ...at });
    }
  }
  if (typeof out !== 'string') {
    for (const ch of new Set(out.chars)) {
      if (ch !== '*' && !outputSymbols.has(ch)) {
        issues.push({ message: `output symbol ${ch} is not a value`, ...at });
      }
    }
  }
  if (rule.p !== undefined && !(rule.p >= 0 && rule.p <= 1)) {
    issues.push({ message: `p must be between 0 and 1, got ${rule.p}`, ...at });
  }
  if (rule.symmetry !== undefined && !isSymmetryName(rule.symmetry)) {
    issues.push({ message: `unknown symmetry ${rule.symmetry}`, ...at });
  }
}

function validateConvolution(
  node: ConvolutionNodeDef,
  path: NodePath,
  values: ReadonlySet<string>,
  issues: Issue[],
): void {
  if (!Object.hasOwn(KERNELS_2D, node.neighborhood)) {
    issues.push({
      message: `unknown neighborhood "${node.neighborhood}" (use Moore or VonNeumann)`,
      path,
    });
  }
  if (node.rules.length === 0) issues.push({ message: 'convolution node has no rules', path });
  node.rules.forEach((rule, r) => {
    const at = { path, rule: r };
    for (const [name, ch] of [
      ['input', rule.in],
      ['output', rule.out],
    ] as const) {
      if ([...ch].length !== 1) issues.push({ message: `${name} must be a single symbol`, ...at });
      else if (!values.has(ch))
        issues.push({ message: `${name} symbol ${ch} is not a value`, ...at });
    }
    if (rule.p !== undefined && !(rule.p >= 0 && rule.p <= 1)) {
      issues.push({ message: `p must be between 0 and 1, got ${rule.p}`, ...at });
    }
    if ((rule.values === undefined) !== (rule.sum === undefined)) {
      issues.push({ message: 'values and sum must be given together', ...at });
    }
    if (rule.values !== undefined) {
      if (rule.values.length === 0)
        issues.push({ message: 'values must list at least one symbol', ...at });
      for (const ch of new Set(rule.values)) {
        if (!values.has(ch)) issues.push({ message: `counted symbol ${ch} is not a value`, ...at });
      }
    }
    if (rule.sum !== undefined) {
      const parsed = parseSum(rule.sum);
      if (typeof parsed === 'string') issues.push({ message: parsed, ...at });
    }
  });
}

function validateFields(
  node: RuleNodeDef,
  path: NodePath,
  values: ReadonlySet<string>,
  issues: Issue[],
): void {
  const fields = node.fields ?? [];
  if (fields.length > 0 && node.kind === 'prl') {
    issues.push({ message: 'fields only steer one and all nodes', path });
  }
  const seenFor = new Set<string>();
  for (const f of fields) {
    const label = `field for ${f.for || '?'}`;
    if ([...f.for].length !== 1 || !values.has(f.for)) {
      issues.push({ message: `${label}: "for" must be one of the symbols`, path });
    } else if (seenFor.has(f.for)) {
      issues.push({ message: `${label}: there is already a field for ${f.for}`, path });
    }
    seenFor.add(f.for);
    if (f.on.length === 0)
      issues.push({ message: `${label}: "on" needs at least one symbol`, path });
    if ((f.to === undefined) === (f.from === undefined)) {
      issues.push({ message: `${label}: give exactly one of "to" or "from"`, path });
    }
    for (const [attr, symbols] of [
      ['on', f.on],
      ['to', f.to ?? ''],
      ['from', f.from ?? ''],
    ] as const) {
      for (const ch of new Set(symbols)) {
        if (!values.has(ch))
          issues.push({ message: `${label}: unknown symbol ${ch} in "${attr}"`, path });
      }
    }
    if ((f.to ?? f.from ?? 'x') === '')
      issues.push({ message: `${label}: "to"/"from" is empty`, path });
  }
}

function validatePath(
  node: PathNodeDef,
  path: NodePath,
  values: ReadonlySet<string>,
  issues: Issue[],
): void {
  for (const [attr, symbols] of [
    ['from', node.from],
    ['to', node.to],
    ['on', node.on],
  ] as const) {
    if (symbols.length === 0) issues.push({ message: `path needs "${attr}" symbols`, path });
    for (const ch of new Set(symbols)) {
      if (!values.has(ch))
        issues.push({ message: `path: unknown symbol ${ch} in "${attr}"`, path });
    }
  }
  if (node.color !== undefined && ([...node.color].length !== 1 || !values.has(node.color))) {
    issues.push({ message: `path: color must be one of the symbols, got "${node.color}"`, path });
  }
}
