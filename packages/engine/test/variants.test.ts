import { describe, expect, it } from 'vitest';
import { compileRule } from '../src/compile';
import { Grid } from '../src/grid';
import { effectiveSymmetry, programFromXml, ruleVariants, SYMMETRY_NAMES } from '../src';
import { SQUARE_SUBGROUPS } from '../src/symmetry';

describe('ruleVariants', () => {
  it('lists the distinct rotations/reflections as strings', () => {
    expect(ruleVariants({ in: 'RBB', out: 'GGR' }, '(xy)')).toEqual([
      { in: 'RBB', out: 'GGR' },
      { in: 'BBR', out: 'RGG' },
      { in: 'B/B/R', out: 'R/G/G' },
      { in: 'R/B/B', out: 'G/G/R' },
    ]);
    expect(ruleVariants({ in: 'RBB', out: 'GGR' }, '()')).toEqual([{ in: 'RBB', out: 'GGR' }]);
  });

  it.each(['RBB/BWB', 'AB/CD', 'A', 'AAB', 'B*/WB'])(
    'matches the compiled rule count for %s',
    (pattern) => {
      const grid = new Grid('ABCDRW', [], 4, 4);
      const outPattern = pattern.replace(/[^/]/g, '*');
      for (const name of SYMMETRY_NAMES) {
        const compiled = compileRule({ in: pattern, out: outPattern }, grid);
        const expected = compiled.symmetries(SQUARE_SUBGROUPS[name]!).length;
        expect(ruleVariants({ in: pattern, out: outPattern }, name)).toHaveLength(expected);
      }
    },
  );

  it('returns [] for malformed patterns or unknown symmetry', () => {
    expect(ruleVariants({ in: 'AB/C', out: 'AB/C' }, '(xy)')).toEqual([]);
    expect(ruleVariants({ in: 'A', out: 'B' }, '(q)')).toEqual([]);
  });
});

describe('effectiveSymmetry', () => {
  const { program } = programFromXml(`
    <sequence values="BW" symmetry="(x)">
      <one in="B" out="W"/>
      <markov symmetry="()">
        <all>
          <rule in="B" out="W"/>
          <rule in="W" out="B" symmetry="(xy+)"/>
        </all>
      </markov>
    </sequence>`);

  it('inherits from the nearest ancestor', () => {
    expect(effectiveSymmetry(program, [])).toBe('(x)');
    expect(effectiveSymmetry(program, [0])).toBe('(x)');
    expect(effectiveSymmetry(program, [1, 0])).toBe('()');
    expect(effectiveSymmetry(program, [1, 0], 0)).toBe('()');
    expect(effectiveSymmetry(program, [1, 0], 1)).toBe('(xy+)');
  });

  it('defaults to full symmetry', () => {
    expect(effectiveSymmetry(programFromXml('<one values="BW" in="B" out="W"/>').program, [])).toBe(
      '(xy)',
    );
  });
});
