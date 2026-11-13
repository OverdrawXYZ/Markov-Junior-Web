import type { Issue } from './errors';
import { MAX_SYMBOLS } from './grid';
import { isBranch, type NodeDef, type NodePath, type Program, type RuleDef } from './program';
import { parsePattern } from './rule';
import { isSymmetryName } from './symmetry';

/** Check a program for every error that can be detected without running it. */
export function validateProgram(program: Program): Issue[] {
  const issues: Issue[] = [];
  const { values } = program;
  const unions = program.unions ?? [];

  if (values.length === 0) issues.push({ message: 'values must declare at least one symbol' });
  if (values.length > MAX_SYMBOLS) {
    issues.push({ message: `at most ${MAX_SYMBOLS} symbols are supported, got ${values.length}` });
  }
  const seen = new Set<string>();
  for (const ch of values) {
    if (ch === '*' || /\s/.test(ch)) issues.push({ message: `"${ch}" cannot be used as a symbol` });
    else if (seen.has(ch)) issues.push({ message: `repeating value ${ch}` });
    seen.add(ch);
  }
  if (program.origin && values.length < 2) {
    issues.push({ message: 'origin requires at least two symbols' });
  }

  const inputSymbols = new Set([...values, '*']);
  for (const u of unions) {
    if ([...u.symbol].length !== 1) {
      issues.push({ message: `union symbol must be a single character, got "${u.symbol}"` });
      continue;
    }
    if (inputSymbols.has(u.symbol)) issues.push({ message: `repeating union symbol ${u.symbol}` });
    if (u.values.length === 0) issues.push({ message: `union ${u.symbol} has no values` });
    for (const ch of u.values) {
      if (!seen.has(ch)) issues.push({ message: `union ${u.symbol} uses unknown value ${ch}` });
    }
    inputSymbols.add(u.symbol);
  }

  const visit = (node: NodeDef, path: NodePath): void => {
    if (node.symmetry !== undefined && !isSymmetryName(node.symmetry)) {
      issues.push({ message: `unknown symmetry ${node.symmetry}`, path });
    }
    if (isBranch(node)) {
      node.children.forEach((child, i) => visit(child, [...path, i]));
      return;
    }
    if (node.steps !== undefined && !(Number.isInteger(node.steps) && node.steps >= 0)) {
      issues.push({ message: `steps must be a non-negative integer, got ${node.steps}`, path });
    }
    if (node.rules.length === 0) issues.push({ message: `${node.kind} node has no rules`, path });
    node.rules.forEach((rule, r) => validateRule(rule, path, r, inputSymbols, seen, issues));
  };
  visit(program.root, []);
  return issues;
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
