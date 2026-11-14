import { ProgramError, type Issue } from './errors';
import {
  isBranch,
  isConvolution,
  type ConvolutionNodeDef,
  type ConvolutionRuleDef,
  type FieldDef,
  type BranchNodeDef,
  type NodeDef,
  type NodePath,
  type Program,
  type RuleDef,
  type RuleNodeDef,
  type UnionDef,
} from './program';
import { escapeAttribute, parseXml, XmlSyntaxError, type XmlElement } from './xml-parser';

export interface XmlParseResult {
  program: Program;
  /** Non-fatal problems, e.g. unknown attributes that were ignored. */
  warnings: Issue[];
  /** Source line of each node, keyed by `pathKey(path)`. */
  lines: Map<string, number>;
}

export const pathKey = (path: NodePath): string => path.join('/');

const RULE_NODES = new Set(['one', 'all', 'prl']);
const BRANCH_NODES = new Set(['markov', 'sequence']);
const UNSUPPORTED_NODES = new Set(['path', 'map', 'convchain', 'wfc']);
const CONVOLUTION_ATTRS = ['neighborhood', 'periodic', 'steps', 'comment'];
const CONVOLUTION_RULE_ATTRS = ['in', 'out', 'p', 'values', 'sum'];
const UNSUPPORTED_CHILDREN = new Set(['observe']);
const FIELD_ATTRS = ['for', 'on', 'to', 'from', 'recompute', 'essential'];

const ROOT_ATTRS = ['values', 'origin'];
const RULE_ATTRS = ['in', 'out', 'p', 'symmetry'];
const RULE_NODE_ATTRS = ['symmetry', 'steps', 'comment', 'temperature'];
const BRANCH_ATTRS = ['symmetry', 'comment'];

/** Parse MarkovJunior XML into a Program. Throws ProgramError on structural errors. */
export function programFromXml(source: string): XmlParseResult {
  let rootEl: XmlElement;
  try {
    rootEl = parseXml(source);
  } catch (e) {
    if (e instanceof XmlSyntaxError) throw new ProgramError([{ message: e.message, line: e.line }]);
    throw e;
  }

  const issues: Issue[] = [];
  const warnings: Issue[] = [];
  const lines = new Map<string, number>();
  const unions: UnionDef[] = [];

  const checkAttributes = (el: XmlElement, allowed: readonly string[], path?: NodePath): void => {
    for (const name of el.attributes.keys()) {
      if (!allowed.includes(name)) {
        warnings.push({
          message: `attribute "${name}" on <${el.name}> is not supported and was ignored`,
          line: el.line,
          ...(path && { path }),
        });
      }
    }
  };

  const readBool = (el: XmlElement, name: string): boolean | undefined => {
    const raw = el.attributes.get(name);
    if (raw === undefined) return undefined;
    const lower = raw.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    issues.push({ message: `${name} must be True or False, got "${raw}"`, line: el.line });
    return undefined;
  };

  const readNumber = (
    el: XmlElement,
    name: string,
    path: NodePath,
    integer: boolean,
  ): number | undefined => {
    const raw = el.attributes.get(name);
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n) || (integer && !Number.isInteger(n))) {
      issues.push({
        message: `${name} must be ${integer ? 'an integer' : 'a number'}, got "${raw}"`,
        line: el.line,
        path,
      });
      return undefined;
    }
    return n;
  };

  const readUnion = (el: XmlElement): void => {
    checkAttributes(el, ['symbol', 'values']);
    const symbol = el.attributes.get('symbol');
    const values = el.attributes.get('values');
    if (symbol === undefined || values === undefined) {
      issues.push({ message: '<union> needs symbol and values attributes', line: el.line });
      return;
    }
    unions.push({ symbol, values: values.replace(/ /g, '') });
  };

  const readRule = (el: XmlElement, path: NodePath, rule?: number): RuleDef | null => {
    const at = { line: el.line, path, ...(rule !== undefined && { rule }) };
    const inp = el.attributes.get('in');
    const out = el.attributes.get('out');
    if (el.attributes.has('file') || el.attributes.has('fin') || el.attributes.has('fout')) {
      issues.push({ message: 'rules loaded from image files are not supported', ...at });
      return null;
    }
    if (inp === undefined) issues.push({ message: 'rule has no input (in)', ...at });
    if (out === undefined) issues.push({ message: 'rule has no output (out)', ...at });
    if (inp === undefined || out === undefined) return null;
    const def: RuleDef = { in: inp, out };
    const p = readNumber(el, 'p', path, false);
    if (p !== undefined) def.p = p;
    // An inline rule shares the node's symmetry attribute; store it on the node only.
    if (rule !== undefined) {
      const symmetry = el.attributes.get('symmetry');
      if (symmetry !== undefined) def.symmetry = symmetry;
    }
    return def;
  };

  const readNode = (el: XmlElement, path: NodePath, isRoot: boolean): NodeDef | null => {
    lines.set(pathKey(path), el.line);
    const extra = isRoot ? ROOT_ATTRS : [];
    const symmetry = el.attributes.get('symmetry');
    const comment = el.attributes.get('comment');

    if (BRANCH_NODES.has(el.name)) {
      checkAttributes(el, [...BRANCH_ATTRS, ...extra], path);
      const node: BranchNodeDef = { kind: el.name as BranchNodeDef['kind'], children: [] };
      if (symmetry !== undefined) node.symmetry = symmetry;
      if (comment !== undefined) node.comment = comment;
      for (const child of el.children) {
        if (child.name === 'union') {
          readUnion(child);
          continue;
        }
        const c = readNode(child, [...path, node.children.length], false);
        if (c) node.children.push(c);
      }
      return node;
    }

    if (RULE_NODES.has(el.name)) {
      const node: RuleNodeDef = { kind: el.name as RuleNodeDef['kind'], rules: [] };
      if (symmetry !== undefined) node.symmetry = symmetry;
      if (comment !== undefined) node.comment = comment;
      const steps = readNumber(el, 'steps', path, true);
      if (steps !== undefined) node.steps = steps;
      const temperature = readNumber(el, 'temperature', path, false);
      if (temperature !== undefined && temperature !== 0) node.temperature = temperature;

      const ruleEls = el.children.filter((c) => c.name === 'rule');
      for (const child of el.children) {
        if (child.name === 'rule') continue;
        if (child.name === 'field') {
          checkAttributes(child, FIELD_ATTRS, path);
          const field: FieldDef = {
            for: child.attributes.get('for') ?? '',
            on: (child.attributes.get('on') ?? '').replace(/ /g, ''),
          };
          const to = child.attributes.get('to');
          const from = child.attributes.get('from');
          if (to !== undefined) field.to = to.replace(/ /g, '');
          if (from !== undefined) field.from = from.replace(/ /g, '');
          if (readBool(child, 'recompute')) field.recompute = true;
          if (readBool(child, 'essential')) field.essential = true;
          (node.fields ??= []).push(field);
          continue;
        }
        if (child.name === 'union' && isRoot) readUnion(child);
        else if (child.name === 'union') {
          issues.push({
            message: '<union> must be declared at the top level or inside markov/sequence',
            line: child.line,
            path,
          });
        } else if (UNSUPPORTED_CHILDREN.has(child.name)) {
          issues.push({ message: `<${child.name}> is not supported yet`, line: child.line, path });
        } else {
          issues.push({
            message: `unexpected <${child.name}> inside <${el.name}>`,
            line: child.line,
            path,
          });
        }
      }

      if (ruleEls.length > 0) {
        checkAttributes(el, [...RULE_NODE_ATTRS, ...extra], path);
        if (el.attributes.has('in') || el.attributes.has('out')) {
          issues.push({
            message: 'use either in/out attributes or <rule> children, not both',
            line: el.line,
            path,
          });
        }
        ruleEls.forEach((ruleEl, r) => {
          checkAttributes(ruleEl, RULE_ATTRS, path);
          const rule = readRule(ruleEl, path, r);
          if (rule) node.rules.push(rule);
        });
      } else {
        checkAttributes(el, [...RULE_NODE_ATTRS, ...RULE_ATTRS, ...extra], path);
        const rule = readRule(el, path);
        if (rule) node.rules.push(rule);
      }
      return node;
    }

    if (el.name === 'convolution') {
      const neighborhood = el.attributes.get('neighborhood');
      if (neighborhood === undefined) {
        issues.push({
          message: '<convolution> needs a neighborhood (Moore or VonNeumann)',
          line: el.line,
          path,
        });
      }
      const node: ConvolutionNodeDef = {
        kind: 'convolution',
        neighborhood: (neighborhood ?? 'Moore') as ConvolutionNodeDef['neighborhood'],
        rules: [],
      };
      if (readBool(el, 'periodic')) node.periodic = true;
      const steps = readNumber(el, 'steps', path, true);
      // MarkovJunior uses -1 for "no limit".
      if (steps !== undefined && steps > 0) node.steps = steps;
      if (comment !== undefined) node.comment = comment;

      const readConvRule = (ruleEl: XmlElement, rule?: number): void => {
        const at = { line: ruleEl.line, path, ...(rule !== undefined && { rule }) };
        const inp = ruleEl.attributes.get('in');
        const out = ruleEl.attributes.get('out');
        if (inp === undefined || out === undefined) {
          issues.push({ message: 'convolution rule needs in and out', ...at });
          return;
        }
        const def: ConvolutionRuleDef = { in: inp, out };
        const p = readNumber(ruleEl, 'p', path, false);
        if (p !== undefined) def.p = p;
        // On the root element `values` is the alphabet, never a rule's counted symbols.
        const vals = ruleEl === rootEl ? undefined : ruleEl.attributes.get('values');
        const sum = ruleEl.attributes.get('sum');
        if (vals !== undefined) def.values = vals;
        if (sum !== undefined) def.sum = sum;
        node.rules.push(def);
      };

      const ruleEls = el.children.filter((c) => c.name === 'rule');
      for (const child of el.children) {
        if (child.name !== 'rule') {
          issues.push({
            message: `unexpected <${child.name}> inside <convolution>`,
            line: child.line,
            path,
          });
        }
      }
      if (ruleEls.length > 0) {
        checkAttributes(el, [...CONVOLUTION_ATTRS, ...extra], path);
        ruleEls.forEach((ruleEl, r) => {
          checkAttributes(ruleEl, CONVOLUTION_RULE_ATTRS, path);
          readConvRule(ruleEl, r);
        });
      } else {
        checkAttributes(el, [...CONVOLUTION_ATTRS, ...CONVOLUTION_RULE_ATTRS, ...extra], path);
        readConvRule(el);
      }
      return node;
    }

    const message = UNSUPPORTED_NODES.has(el.name)
      ? `<${el.name}> nodes are not supported yet`
      : `unknown node type <${el.name}>`;
    issues.push({ message, line: el.line, path });
    return null;
  };

  const values = rootEl.attributes.get('values');
  if (values === undefined)
    issues.push({ message: 'the root element needs a values attribute', line: rootEl.line });
  const origin = readBool(rootEl, 'origin');
  const root = readNode(rootEl, [], true);

  if (issues.length > 0 || !root || values === undefined) throw new ProgramError(issues);

  const program: Program = { values: values.replace(/ /g, ''), root };
  if (origin) program.origin = true;
  if (unions.length > 0) program.unions = unions;
  return { program, warnings, lines };
}

/** Attach source lines (from programFromXml) to issues that only carry a path. */
export function withLines(issues: readonly Issue[], lines: ReadonlyMap<string, number>): Issue[] {
  return issues.map((issue) => {
    if (issue.line !== undefined || issue.path === undefined) return issue;
    const line = lines.get(pathKey(issue.path));
    return line === undefined ? issue : { ...issue, line };
  });
}

/** Serialise a Program to MarkovJunior-compatible XML. */
export function programToXml(program: Program): string {
  const out: string[] = [];
  const attrs = (pairs: [string, string | number | undefined][]): string =>
    pairs
      .filter((pair): pair is [string, string | number] => pair[1] !== undefined)
      .map(([k, v]) => ` ${k}="${escapeAttribute(String(v))}"`)
      .join('');

  const emit = (
    node: NodeDef,
    depth: number,
    rootAttrs: [string, string | undefined][],
    extraChildren: string[],
  ): void => {
    const pad = '  '.repeat(depth);
    const childPad = '  '.repeat(depth + 1);
    const children: string[] = extraChildren.map((c) => childPad + c);
    let head: string;

    if (isBranch(node)) {
      head = `<${node.kind}${attrs([...rootAttrs, ['symmetry', node.symmetry], ['comment', node.comment]])}`;
      if (node.children.length === 0 && children.length === 0) {
        out.push(`${pad}${head}/>`);
        return;
      }
      out.push(`${pad}${head}>`);
      out.push(...children);
      for (const child of node.children) emit(child, depth + 1, [], []);
      out.push(`${pad}</${node.kind}>`);
      return;
    }

    if (isConvolution(node)) {
      const convAttrs = (r: ConvolutionRuleDef): [string, string | number | undefined][] => [
        ['in', r.in],
        ['out', r.out],
        ['p', r.p],
        ['values', r.values],
        ['sum', r.sum],
      ];
      // A root rule that counts symbols can't be inline: its `values` would clash with the alphabet.
      const single =
        node.rules.length === 1 && !(rootAttrs.length > 0 && node.rules[0]!.values !== undefined);
      head = `<convolution${attrs([
        ...rootAttrs,
        ['neighborhood', node.neighborhood],
        ...(single ? convAttrs(node.rules[0]!) : []),
        ['periodic', node.periodic ? 'True' : undefined],
        ['steps', node.steps],
        ['comment', node.comment],
      ])}`;
      if (!single)
        for (const r of node.rules) children.push(`${childPad}<rule${attrs(convAttrs(r))}/>`);
      if (children.length === 0) {
        out.push(`${pad}${head}/>`);
        return;
      }
      out.push(`${pad}${head}>`);
      out.push(...children);
      out.push(`${pad}</convolution>`);
      return;
    }

    const inline = node.rules.length === 1 && node.rules[0]!.symmetry === undefined;
    const ruleAttrs = (r: RuleDef): [string, string | number | undefined][] => [
      ['in', r.in],
      ['out', r.out],
      ['p', r.p],
    ];
    head = `<${node.kind}${attrs([
      ...rootAttrs,
      ...(inline ? ruleAttrs(node.rules[0]!) : []),
      ['steps', node.steps],
      ['temperature', node.temperature],
      ['symmetry', node.symmetry],
      ['comment', node.comment],
    ])}`;
    if (!inline) {
      for (const r of node.rules) {
        children.push(`${childPad}<rule${attrs([...ruleAttrs(r), ['symmetry', r.symmetry]])}/>`);
      }
    }
    for (const f of node.fields ?? []) {
      children.push(
        `${childPad}<field${attrs([
          ['for', f.for],
          ['to', f.to],
          ['from', f.from],
          ['on', f.on],
          ['recompute', f.recompute ? 'True' : undefined],
          ['essential', f.essential ? 'True' : undefined],
        ])}/>`,
      );
    }
    if (children.length === 0) {
      out.push(`${pad}${head}/>`);
      return;
    }
    out.push(`${pad}${head}>`);
    out.push(...children);
    out.push(`${pad}</${node.kind}>`);
  };

  const unions = (program.unions ?? []).map(
    (u) =>
      `<union${attrs([
        ['symbol', u.symbol],
        ['values', u.values],
      ])}/>`,
  );
  emit(
    program.root,
    0,
    [
      ['values', program.values],
      ['origin', program.origin ? 'True' : undefined],
    ],
    unions,
  );
  return out.join('\n') + '\n';
}
