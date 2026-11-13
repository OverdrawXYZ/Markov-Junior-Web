import { describe, expect, it } from 'vitest';
import {
  programFromXml,
  programToXml,
  ProgramError,
  validateProgram,
  withLines,
  type Issue,
} from '../src';
import { fixture } from './helpers';

const SUPPORTED = [
  'Basic',
  'Growth',
  'MazeGrowth',
  'MazeBacktracker',
  'River',
  'BasicSnake',
  'Flowers',
  'NystromDungeon',
];

function issuesOf(fn: () => unknown): readonly Issue[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof ProgramError) return e.issues;
    throw e;
  }
  throw new Error('expected a ProgramError');
}

describe('programFromXml', () => {
  it('parses an inline rule node as the root', () => {
    expect(programFromXml(fixture('MazeGrowth')).program).toEqual({
      values: 'BWA',
      origin: true,
      root: { kind: 'one', rules: [{ in: 'WBB', out: 'WAW' }] },
    });
  });

  it('parses branches, rule children, p, steps and symmetry', () => {
    const { program } = programFromXml(`
      <sequence values="B W R" symmetry="(x)">
        <prl in="B" out="W" p="0.5" steps="2"/>
        <markov>
          <all symmetry="()">
            <rule in="WB" out="WW"/>
            <rule in="RB" out="RR" symmetry="(xy)" p="0.1"/>
          </all>
        </markov>
      </sequence>`);
    expect(program).toEqual({
      values: 'BWR',
      root: {
        kind: 'sequence',
        symmetry: '(x)',
        children: [
          { kind: 'prl', steps: 2, rules: [{ in: 'B', out: 'W', p: 0.5 }] },
          {
            kind: 'markov',
            children: [
              {
                kind: 'all',
                symmetry: '()',
                rules: [
                  { in: 'WB', out: 'WW' },
                  { in: 'RB', out: 'RR', symmetry: '(xy)', p: 0.1 },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it('collects unions from the root and branches', () => {
    const { program } = programFromXml(`
      <markov values="BWR">
        <union symbol="?" values="WR"/>
        <sequence><union symbol="!" values="B W"/><one in="?B" out="?W"/></sequence>
      </markov>`);
    expect(program.unions).toEqual([
      { symbol: '?', values: 'WR' },
      { symbol: '!', values: 'BW' },
    ]);
  });

  it('keeps node comments', () => {
    const { program } = programFromXml(fixture('NystromDungeon'));
    expect(program.root.comment).toBeUndefined();
    expect('children' in program.root && program.root.children[0]!.comment).toBe('draw a grid');
  });

  it('records the source line of every node', () => {
    const { lines } = programFromXml('<markov values="BW">\n  <one in="B" out="W"/>\n</markov>');
    expect(lines.get('')).toBe(1);
    expect(lines.get('0')).toBe(2);
  });

  it('warns about unknown attributes instead of failing', () => {
    const { warnings } = programFromXml('<one values="BW" in="B" out="W" temperature="1"/>');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('temperature');
  });

  it.each([
    ['<one in="B" out="W"/>', 'needs a values attribute'],
    ['<one values="BW" in="B"/>', 'no output'],
    ['<foo values="BW"/>', 'unknown node type <foo>'],
    ['<one values="BW" in="B" out="W"><rule in="B" out="W"/></one>', 'not both'],
    ['<markov values="BW"><one in="B" out="W" steps="x"/></markov>', 'steps must be an integer'],
    ['<one values="BW" origin="maybe" in="B" out="W"/>', 'origin must be True or False'],
    [
      '<markov values="BW"><one in="B" out="W"><union symbol="?" values="BW"/></one></markov>',
      '<union> must be declared',
    ],
    [
      '<markov values="BW"><one in="B" out="W"><field for="B" to="W"/></one></markov>',
      '<field> is not supported yet',
    ],
    ['<markov values="BW"', 'unterminated tag'],
  ])('rejects %s', (xml, message) => {
    const issues = issuesOf(() => programFromXml(xml));
    expect(issues.map((i) => i.message).join('\n')).toContain(message);
  });

  it.each(['GameOfLife', 'Cave'])('reports unsupported nodes in %s with a line', (name) => {
    const issues = issuesOf(() => programFromXml(fixture(name)));
    expect(issues[0]!.message).toBe('<convolution> nodes are not supported yet');
    expect(issues[0]!.line).toBeGreaterThan(1);
  });
});

describe('programToXml', () => {
  it.each(SUPPORTED)('round-trips %s losslessly', (name) => {
    const { program, warnings } = programFromXml(fixture(name));
    expect(warnings).toEqual([]);
    const xml = programToXml(program);
    expect(programFromXml(xml).program).toEqual(program);
  });

  it('round-trips unions, comments and per-rule symmetry', () => {
    const source = `<sequence values="BWR" origin="True">
  <union symbol="?" values="WR"/>
  <one in="?B" out="?W" steps="3" comment="grow &amp; spread"/>
  <all>
    <rule in="W" out="R" symmetry="()"/>
  </all>
</sequence>
`;
    const { program } = programFromXml(source);
    expect(programToXml(program)).toBe(source);
  });

  it('writes an inline root rule node with values and origin first', () => {
    expect(programToXml(programFromXml(fixture('MazeGrowth')).program)).toBe(
      '<one values="BWA" origin="True" in="WBB" out="WAW"/>\n',
    );
  });
});

describe('withLines', () => {
  it('maps validation issues back to source lines', () => {
    const { program, lines } = programFromXml(
      '<sequence values="BW">\n  <one in="B" out="W"/>\n  <one in="BX" out="WW"/>\n</sequence>',
    );
    const issues = withLines(validateProgram(program), lines);
    expect(issues).toEqual([
      { message: 'input symbol X is not defined', path: [1], rule: 0, line: 3 },
    ]);
  });
});
