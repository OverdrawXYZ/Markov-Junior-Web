import { describe, expect, it } from 'vitest';
import { compileRule } from '../src/compile';
import { Grid } from '../src/grid';
import { parsePattern, Rule, WILDCARD_OUT } from '../src/rule';
import { SQUARE_SUBGROUPS } from '../src/symmetry';

const grid = new Grid('ABCD', [{ symbol: '?', values: 'AB' }], 8, 8);
const rule = (inp: string, out: string, p?: number) =>
  compileRule({ in: inp, out, ...(p !== undefined && { p }) }, grid);

/** Render a rule's input back to characters (single symbols only). */
function show(r: Rule): string {
  const rowsOut: string[] = [];
  for (let y = 0; y < r.IMY; y++) {
    let row = '';
    for (let x = 0; x < r.IMX; x++) row += 'ABCD'[Math.log2(r.input[x + y * r.IMX]!)];
    rowsOut.push(row);
  }
  return rowsOut.join('/');
}

describe('parsePattern', () => {
  it('parses rows and dimensions', () => {
    expect(parsePattern('AB/CD/EF')).toEqual({ chars: [...'ABCDEF'], MX: 2, MY: 3, MZ: 1 });
  });

  it('parses 3D layers top-down', () => {
    const p = parsePattern('AB CD');
    expect(typeof p !== 'string' && p.MZ).toBe(2);
    expect(typeof p !== 'string' && p.chars).toEqual([...'CDAB']);
  });

  it('rejects ragged and empty patterns', () => {
    expect(parsePattern('AB/C')).toBe('non-rectangular pattern');
    expect(parsePattern('')).toBe('empty pattern');
  });
});

describe('Rule', () => {
  it('encodes waves, unions, wildcards and p', () => {
    const r = rule('A?*', 'B*C', 0.25);
    expect([...r.input]).toEqual([0b0001, 0b0011, 0b1111]);
    expect([...r.output]).toEqual([1, WILDCARD_OUT, 2]);
    expect(r.p).toBe(0.25);
  });

  it('builds ishifts listing where each symbol is accepted', () => {
    const r = rule('A?', 'BB');
    expect([...r.ishifts[0]!]).toEqual([0, 0, 0, 1, 0, 0]); // A at x=0 and x=1
    expect([...r.ishifts[1]!]).toEqual([1, 0, 0]); // B only via ? at x=1
    expect([...r.ishifts[2]!]).toEqual([]);
  });

  it('rotates 90° and reflects', () => {
    const r = rule('AB/CD', 'AB/CD');
    expect(show(r.zRotated())).toBe('BD/AC');
    expect(show(r.reflected())).toBe('BA/DC');
    expect(show(r.zRotated().zRotated().zRotated().zRotated())).toBe('AB/CD');
    expect(show(rule('ABC', 'ABC').zRotated())).toBe('C/B/A');
  });

  it.each([
    ['()', 'AB/CD', 1],
    ['(x)', 'AB/CD', 2],
    ['(xy+)', 'AB/CD', 4],
    ['(xy)', 'AB/CD', 8],
    ['(xy)', 'ABB', 4], // reflection coincides with a 180° rotation
    ['(xy)', 'AA', 2],
    ['(xy)', 'A', 1],
    ['(x)', 'ABA', 1],
  ])('symmetry %s of %s yields %i distinct rules', (name, pattern, n) => {
    const variants = rule(pattern, pattern).symmetries(SQUARE_SUBGROUPS[name]!);
    expect(variants).toHaveLength(n);
    for (let i = 0; i < variants.length; i++)
      for (let j = i + 1; j < variants.length; j++)
        expect(Rule.same(variants[i]!, variants[j]!)).toBe(false);
  });
});
