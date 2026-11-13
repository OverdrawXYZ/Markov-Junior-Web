import { describe, expect, it } from 'vitest';
import { createRun, ProgramError, validateProgram, type Program } from '../src';

const one = (inp: string, out: string, extra: object = {}) => ({
  kind: 'one' as const,
  rules: [{ in: inp, out, ...extra }],
});

describe('validateProgram', () => {
  it('accepts a valid program', () => {
    expect(validateProgram({ values: 'BW', root: one('B', 'W') })).toEqual([]);
  });

  it.each<[string, Program]>([
    ['values must declare', { values: '', root: one('B', 'W') }],
    ['repeating value B', { values: 'BWB', root: one('B', 'W') }],
    ['"*" cannot be used', { values: 'B*', root: one('B', 'B') }],
    ['origin requires at least two', { values: 'B', origin: true, root: one('B', 'B') }],
    ['at most 31 symbols', { values: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef', root: one('A', 'B') }],
    [
      'repeating union symbol B',
      { values: 'BW', unions: [{ symbol: 'B', values: 'W' }], root: one('B', 'W') },
    ],
    [
      'union ? uses unknown value X',
      { values: 'BW', unions: [{ symbol: '?', values: 'X' }], root: one('B', 'W') },
    ],
    ['input symbol X is not defined', { values: 'BW', root: one('X', 'W') }],
    [
      'output symbol ? is not a value',
      { values: 'BW', unions: [{ symbol: '?', values: 'BW' }], root: one('B', '?') },
    ],
    ['different sizes', { values: 'BW', root: one('BB', 'W') }],
    ['input: non-rectangular', { values: 'BW', root: one('BB/B', 'WW/W') }],
    ['3D patterns are not supported', { values: 'BW', root: one('B B', 'W W') }],
    ['p must be between 0 and 1', { values: 'BW', root: one('B', 'W', { p: 2 }) }],
    ['unknown symmetry (z)', { values: 'BW', root: one('B', 'W', { symmetry: '(z)' }) }],
    ['unknown symmetry (q)', { values: 'BW', root: { ...one('B', 'W'), symmetry: '(q)' } }],
    [
      'steps must be a non-negative integer',
      { values: 'BW', root: { ...one('B', 'W'), steps: -1 } },
    ],
    ['one node has no rules', { values: 'BW', root: { kind: 'one', rules: [] } }],
  ])('reports "%s"', (message, program) => {
    const issues = validateProgram(program);
    expect(issues.map((i) => i.message).join('\n')).toContain(message);
  });

  it('reports paths and rule indices', () => {
    const issues = validateProgram({
      values: 'BW',
      root: {
        kind: 'sequence',
        children: [
          one('B', 'W'),
          {
            kind: 'markov',
            children: [
              one('B', 'W'),
              {
                kind: 'all',
                rules: [
                  { in: 'B', out: 'W' },
                  { in: 'Q', out: 'W' },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(issues).toEqual([{ message: 'input symbol Q is not defined', path: [1, 1], rule: 1 }]);
  });

  it('makes createRun throw a ProgramError with all issues', () => {
    expect(() =>
      createRun({ values: 'BW', root: one('X', 'Y') }, { width: 4, height: 4, seed: 0 }),
    ).toThrow(ProgramError);
  });
});
