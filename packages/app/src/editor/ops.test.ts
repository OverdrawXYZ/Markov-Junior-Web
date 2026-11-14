import { describe, expect, it } from 'vitest';
import { programFromXml, programToXml, validateProgram, type Program } from '@mj/engine';
import {
  addField,
  addMapRule,
  moveMapRule,
  removeMapRule,
  scopedProgram,
  updateMap,
  updateMapRule,
  addNode,
  addRule,
  addSymbol,
  addUnion,
  duplicateNode,
  duplicateRule,
  insertNode,
  moveNode,
  moveRule,
  moveSymbol,
  newNode,
  removeField,
  removeNode,
  removeRule,
  removeSymbol,
  removeUnion,
  renameSymbol,
  resizePattern,
  setCell,
  setKind,
  setOrigin,
  setUnionValues,
  symbolUsage,
  unwrapNode,
  updateField,
  updateNode,
  updatePath,
  updateRule,
  wrapNode,
} from './ops';

const xml = (p: Program) => programToXml(p).trim();
const load = (source: string) => programFromXml(source).program;

const tree = load(`<sequence values="BWR">
  <one in="B" out="W" comment="a"/>
  <markov comment="b">
    <one in="W" out="R" comment="c"/>
    <all in="R" out="B" comment="d"/>
  </markov>
  <prl in="B" out="R" comment="e"/>
</sequence>`);

/** Comments of the tree in pre-order — a compact way to assert structure. */
function shape(p: Program): string {
  const rec = (n: Program['root']): string =>
    'children' in n
      ? `${n.comment ?? n.kind}(${n.children.map(rec).join(' ')})`
      : (n.comment ?? n.kind);
  return rec(p.root);
}

describe('node operations', () => {
  it('shape helper', () => {
    expect(shape(tree)).toBe('sequence(a b(c d) e)');
  });

  it('adds inside a selected branch, after a selected rule node, or at the root', () => {
    const n = { ...newNode('one', tree), comment: 'n' };
    expect(shape(addNode(tree, [1], n).program)).toBe('sequence(a b(c d n) e)');
    expect(addNode(tree, [1], n).path).toEqual([1, 2]);
    expect(shape(addNode(tree, [1, 0], n).program)).toBe('sequence(a b(c n d) e)');
    expect(shape(addNode(tree, null, n).program)).toBe('sequence(a b(c d) e n)');
  });

  it('wraps a rule-node root in markov when adding a sibling (same semantics)', () => {
    const single = load('<one values="BW" in="B" out="W"/>');
    const { program, path } = addNode(single, [], { kind: 'all', rules: [{ in: 'W', out: 'B' }] });
    expect(xml(program)).toBe(
      '<markov values="BW">\n  <one in="B" out="W"/>\n  <all in="W" out="B"/>\n</markov>',
    );
    expect(path).toEqual([1]);
    expect(insertNode(single, [], 0, newNode('prl', single)).path).toEqual([0]);
  });

  it('removes and duplicates nodes (never the root)', () => {
    expect(shape(removeNode(tree, [1, 0]))).toBe('sequence(a b(d) e)');
    expect(removeNode(tree, [])).toBe(tree);
    const dup = duplicateNode(tree, [1]);
    expect(shape(dup.program)).toBe('sequence(a b(c d) b(c d) e)');
    expect(dup.path).toEqual([2]);
  });

  it.each([
    [[0], [], 3, 'sequence(b(c d) e a)', [2]],
    [[2], [], 0, 'sequence(e a b(c d))', [0]],
    [[0], [1], 1, 'sequence(b(c a d) e)', [0, 1]],
    [[1, 1], [], 0, 'sequence(d a b(c) e)', [0]],
    [[0], [1], 2, 'sequence(b(c d a) e)', [0, 2]],
    [[1, 0], [1], 2, 'sequence(a b(d c) e)', [1, 1]],
  ] as const)('moves %j into %j at %i', (from, to, index, expected, path) => {
    const res = moveNode(tree, from, to, index);
    expect(shape(res.program)).toBe(expected);
    expect(res.path).toEqual(path);
  });

  it('refuses to move a node into itself or onto its own position', () => {
    expect(moveNode(tree, [1], [1], 0).program).toBe(tree);
    expect(moveNode(tree, [0], [], 0).program).toBe(tree);
    expect(moveNode(tree, [0], [], 1).program).toBe(tree);
    expect(moveNode(tree, [0], [0], 0).program).toBe(tree); // not a branch
    expect(moveNode(tree, [0], [], -1).program).toBe(tree); // already first
    expect(moveNode(tree, [2], [], 99).program).toBe(tree); // already last
  });

  it('wraps and unwraps', () => {
    const wrapped = wrapNode(tree, [0], 'markov');
    expect(shape(wrapped)).toBe('sequence(markov(a) b(c d) e)');
    expect(shape(unwrapNode(wrapped, [0]))).toBe(shape(tree));
    expect(shape(unwrapNode(tree, [1]))).toBe('sequence(a c d e)');
    expect(unwrapNode(tree, [])).toBe(tree); // root with 3 children
    expect(xml(unwrapNode(load('<markov values="BW"><one in="B" out="W"/></markov>'), []))).toBe(
      '<one values="BW" in="B" out="W"/>',
    );
  });

  it('changes kind only within the same family', () => {
    expect(shape(setKind(tree, [0], 'all'))).toBe(shape(tree));
    expect(setKind(tree, [0], 'all').root).not.toBe(tree.root);
    expect(xml(setKind(tree, [0], 'all'))).toContain('<all in="B" out="W"');
    expect(setKind(tree, [0], 'markov')).toEqual(tree);
    expect(xml(setKind(tree, [1], 'sequence'))).toContain('<sequence comment="b">');
  });

  it('updates and clears node fields', () => {
    let p = updateNode(tree, [0], { steps: 5, symmetry: '(x)' });
    expect(xml(p)).toContain('<one in="B" out="W" steps="5" symmetry="(x)" comment="a"/>');
    p = updateNode(p, [0], { steps: undefined, comment: '' });
    expect(xml(p)).toContain('<one in="B" out="W" symmetry="(x)"/>');
    expect(updateNode(tree, [1], { steps: 3 })).toEqual(tree); // branches have no steps
  });
});

describe('rule operations', () => {
  const p0 = load('<all values="BWR"><rule in="B" out="W"/><rule in="W" out="R"/></all>');

  it('adds, updates, duplicates, moves and removes rules', () => {
    let p = addRule(p0, []);
    expect(xml(p)).toContain(
      '<rule in="B" out="W"/>\n  <rule in="W" out="R"/>\n  <rule in="B" out="W"/>',
    );
    p = updateRule(p, [], 2, { in: 'R', out: 'B', p: 0.5 });
    expect(xml(p)).toContain('<rule in="R" out="B" p="0.5"/>');
    p = updateRule(p, [], 2, { p: undefined });
    expect(xml(p)).toContain('<rule in="R" out="B"/>');
    p = moveRule(p, [], 2, 0);
    expect(xml(p)).toMatch(/<rule in="R" out="B"\/>\s+<rule in="B" out="W"\/>/);
    p = duplicateRule(p, [], 0);
    expect(p.root).toMatchObject({ rules: [{ in: 'R' }, { in: 'R' }, { in: 'B' }, { in: 'W' }] });
    p = removeRule(p, [], 3);
    expect(p.root).toMatchObject({ rules: [{ in: 'R' }, { in: 'R' }, { in: 'B' }] });
  });
});

describe('pattern helpers', () => {
  it('resizes and paints', () => {
    expect(resizePattern('AB/CD', 3, 3)).toBe('AB*/CD*/***');
    expect(resizePattern('ABC/DEF', 2, 1)).toBe('AB');
    expect(setCell('AB/CD', 1, 1, 'X')).toBe('AB/CX');
    expect(setCell('AB/CD', 5, 1, 'X')).toBe('AB/CD');
  });
});

describe('symbol operations', () => {
  const p0 = load(`<markov values="BWR" origin="True">
  <union symbol="?" values="WR"/>
  <one in="?B" out="*W"/>
  <all in="R" out="B"/>
</markov>`);

  it('counts usage', () => {
    expect(symbolUsage(p0, 'B')).toBe(2);
    expect(symbolUsage(p0, 'R')).toBe(2); // a rule and the union
    expect(symbolUsage(p0, 'Y')).toBe(0);
  });

  it('adds symbols, rejecting reserved characters', () => {
    expect(addSymbol(p0, 'Y').values).toBe('BWRY');
    for (const bad of ['B', '?', '*', '/', ' ', 'YY']) expect(addSymbol(p0, bad)).toBe(p0);
  });

  it('removes only unused symbols', () => {
    const p = addSymbol(p0, 'Y');
    expect(removeSymbol(p, 'Y').values).toBe('BWR');
    expect(removeSymbol(p, 'B')).toBe(p);
  });

  it('renames a symbol everywhere', () => {
    const p = renameSymbol(p0, 'W', 'G');
    expect(xml(p)).toBe(`<markov values="BGR" origin="True">
  <union symbol="?" values="GR"/>
  <one in="?B" out="*G"/>
  <all in="R" out="B"/>
</markov>`);
    expect(renameSymbol(p0, 'W', 'R')).toBe(p0);
    expect(xml(renameSymbol(p0, '?', '!'))).toContain('<one in="!B" out="*W"/>');
  });

  it('reorders symbols and toggles origin', () => {
    expect(moveSymbol(p0, 'R', -1).values).toBe('BRW');
    expect(moveSymbol(p0, 'B', -1)).toBe(p0);
    expect(setOrigin(p0, false).origin).toBeUndefined();
    expect(setOrigin(setOrigin(p0, false), true).origin).toBe(true);
  });

  it('manages unions', () => {
    let p = addUnion(p0);
    expect(p.unions).toEqual([
      { symbol: '?', values: 'WR' },
      { symbol: '!', values: 'BW' },
    ]);
    p = setUnionValues(p, 1, 'BR');
    expect(p.unions![1]!.values).toBe('BR');
    p = removeUnion(removeUnion(p, 1), 0);
    expect(p.unions).toBeUndefined();
  });

  it('keeps programs valid through a realistic edit session', () => {
    let p = load('<one values="BW" in="B" out="W"/>');
    p = addSymbol(p, 'R');
    p = addNode(p, [], { kind: 'all', rules: [{ in: 'WB', out: 'WR' }] }).program;
    p = updateRule(p, [1], 0, {
      in: resizePattern('WB', 2, 2, 'B'),
      out: resizePattern('WR', 2, 2, '*'),
    });
    p = wrapNode(p, [1], 'sequence');
    p = moveNode(p, [0], [1], 1).program;
    expect(validateProgram(p)).toEqual([]);
    expect(programFromXml(programToXml(p)).program).toEqual(p);
  });
});

describe('convolution nodes', () => {
  const life = load(`<sequence values="DAR">
  <convolution neighborhood="Moore" periodic="True">
    <rule in="D" out="A" sum="3" values="A"/>
    <rule in="A" out="D" sum="0,1,4..8" values="A"/>
  </convolution>
</sequence>`);

  it('creates a sensible default node', () => {
    expect(newNode('convolution', life)).toEqual({
      kind: 'convolution',
      neighborhood: 'Moore',
      rules: [{ in: 'D', out: 'A', values: 'A', sum: '1..8' }],
    });
  });

  it('is its own kind family', () => {
    expect(setKind(life, [0], 'one')).toBe(life);
    expect(setKind(tree, [0], 'convolution')).toBe(tree);
  });

  it('edits node and rule fields', () => {
    let p = updateNode(life, [0], {
      neighborhood: 'VonNeumann',
      periodic: false,
      steps: 4,
      symmetry: '(x)',
    });
    expect(xml(p)).toContain('<convolution neighborhood="VonNeumann" steps="4">');
    p = updateRule(p, [0], 1, { values: undefined, sum: undefined, p: 0.5 });
    expect(xml(p)).toContain('<rule in="A" out="D" p="0.5"/>');
    p = addRule(p, [0]);
    expect(xml(p)).toContain('<rule in="D" out="A" values="A" sum="1..8"/>');
    expect(validateProgram(p)).toEqual([]);
  });

  it('counts and renames symbols used as counted values', () => {
    expect(symbolUsage(life, 'A')).toBe(2);
    expect(symbolUsage(life, 'R')).toBe(0);
    expect(xml(renameSymbol(life, 'A', 'L'))).toContain(
      '<rule in="D" out="L" values="L" sum="3"/>',
    );
  });
});

describe('fields', () => {
  const p0 = load('<one values="BWT" in="WB" out="WW"/>');

  it('adds, edits and removes fields', () => {
    let p = addField(p0, []);
    expect(xml(p)).toContain('<field for="W" to="T" on="B"/>');
    p = updateField(p, [], 0, { from: 'T', recompute: true });
    expect(xml(p)).toContain('<field for="W" from="T" on="B" recompute="True"/>');
    p = updateField(p, [], 0, { to: 'TB', recompute: false, essential: true });
    expect(xml(p)).toContain('<field for="W" to="TB" on="B" essential="True"/>');
    p = updateNode(p, [], { temperature: 5 });
    expect(xml(p)).toContain('temperature="5"');
    p = updateNode(p, [], { temperature: 0 });
    expect(xml(p)).not.toContain('temperature');
    expect(validateProgram(p)).toEqual([]);
    p = removeField(p, [], 0);
    expect(p.root).not.toHaveProperty('fields');
  });

  it('counts and renames symbols used in fields', () => {
    const p = addField(p0, []);
    expect(symbolUsage(p, 'T')).toBe(1);
    expect(xml(renameSymbol(p, 'T', 'G'))).toContain('<field for="W" to="G" on="B"/>');
  });
});

describe('path nodes', () => {
  const p0 = load('<sequence values="DRUW"><path from="R" to="U" on="D"/></sequence>');

  it('creates, edits and validates paths', () => {
    expect(newNode('path', p0)).toEqual({ kind: 'path', from: 'R', to: 'U', on: 'D' });
    let p = updatePath(p0, [0], { color: 'W', edges: true, inertia: false, on: 'DW' });
    expect(xml(p)).toContain('<path from="R" to="U" on="DW" color="W" edges="True"/>');
    p = updatePath(p, [0], { color: undefined, edges: false });
    expect(xml(p)).toContain('<path from="R" to="U" on="DW"/>');
    expect(validateProgram(p)).toEqual([]);
    expect(setKind(p, [0], 'one')).toBe(p);
  });

  it('counts and renames symbols used by paths', () => {
    expect(symbolUsage(p0, 'U')).toBe(1);
    expect(xml(renameSymbol(p0, 'R', 'G'))).toContain('<path from="G" to="U" on="D"/>');
  });
});

describe('map nodes', () => {
  const p0 = load(`<sequence values="BW">
  <one in="B" out="W" steps="1"/>
  <map scale="2 2 1" values="BA">
    <rule in="W" out="AA/AA"/>
    <one in="B" out="A"/>
  </map>
</sequence>`);

  it('renames symbols only in the scope they belong to', () => {
    // B exists outside and inside the map: renaming the outer B leaves the map's B alone.
    const p = renameSymbol(p0, 'B', 'K');
    expect(xml(p)).toBe(`<sequence values="KW">
  <one in="K" out="W" steps="1"/>
  <map scale="2 2 1" values="BA">
    <rule in="W" out="AA/AA"/>
    <one in="B" out="A"/>
  </map>
</sequence>`);
    expect(xml(renameSymbol(p0, 'W', 'G'))).toContain('<rule in="G" out="AA/AA"/>');
    expect(symbolUsage(p0, 'W')).toBe(2); // the one rule and the map rule's input
  });

  it('edits map settings and rules, and refuses to unwrap a map', () => {
    let p = updateMap(p0, [1], { scale: '3 3 1', values: 'BAE' });
    p = addMapRule(p, [1]);
    expect(xml(p)).toContain('<rule in="B" out="AAA/AAA/AAA"/>');
    p = updateMapRule(p, [1], 1, { out: 'E', comment: 'background' });
    p = moveMapRule(p, [1], 1, 0);
    expect(xml(p)).toMatch(
      /<rule in="B" out="E" comment="background"\/>\s+<rule in="W" out="AA\/AA"\/>/,
    );
    p = removeMapRule(p, [1], 0);
    expect(validateProgram(p)).toEqual([]);
    expect(unwrapNode(p, [1])).toBe(p);
    expect(newNode('map', p)).toEqual({
      kind: 'map',
      scale: '2 2 1',
      values: 'BW',
      rules: [],
      children: [],
    });
  });

  it('shows the alphabet in scope', () => {
    expect(scopedProgram(p0, [1, 0]).values).toBe('BA');
    expect(scopedProgram(p0, [1]).values).toBe('BW');
    expect(scopedProgram(p0, [0])).toBe(p0);
  });
});
