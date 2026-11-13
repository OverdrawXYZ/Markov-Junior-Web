import { describe, expect, it } from 'vitest';
import { createRun, programFromXml } from '../src';
import { containsLine, count, fixture, hash, rows, run } from './helpers';

describe('one node', () => {
  it('Basic: rewrites one cell per turn until none match', () => {
    const r = run(fixture('Basic'), 12);
    const result = r.runToEnd();
    expect(result.halted).toBe(true);
    expect(count(r, 'W')).toBe(144);
    // 144 rewriting turns + 1 turn that discovers nothing matches.
    expect(result.stepCount).toBe(145);
  });

  it('Growth: origin seeds the centre cell with the second symbol', () => {
    const r = run(fixture('Growth'), 9);
    expect(rows(r)[4]![4]).toBe('W');
    expect(count(r, 'W')).toBe(1);
    expect(r.runToEnd().stepCount).toBe(81);
    expect(count(r, 'W')).toBe(81);
  });

  it('MazeGrowth: produces a spanning tree over the even lattice', () => {
    const r = run(fixture('MazeGrowth'), 21, 7);
    r.runToEnd();
    // 11×11 lattice nodes (W, including the origin), joined by 120 edges (A).
    expect(count(r, 'W')).toBe(121);
    expect(count(r, 'A')).toBe(120);
    expect(r.stepCount).toBe(121);
    expect(containsLine(r, 'WBB')).toBe(false);
  });

  it('respects steps', () => {
    const r = run('<one values="BW" in="B" out="W" steps="5"/>', 10);
    r.runToEnd();
    expect(count(r, 'W')).toBe(5);
  });
});

describe('markov node', () => {
  it('gives priority to earlier children every turn', () => {
    const r = run('<markov values="BWR"><one in="W" out="R"/><one in="B" out="W"/></markov>', 6);
    for (let i = 0; i < 80 && !r.halted; i++) {
      r.step();
      expect(count(r, 'W')).toBeLessThanOrEqual(1);
    }
    expect(r.halted).toBe(true);
    expect(count(r, 'R')).toBe(36);
  });

  it('MazeBacktracker: visits every lattice node and backtracks to the start', () => {
    const r = run(fixture('MazeBacktracker'), 21, 3);
    r.runToEnd();
    expect(count(r, 'G')).toBe(0);
    expect(count(r, 'R')).toBe(1);
    expect(rows(r)[10]![10]).toBe('R');
    // 121 lattice nodes + 120 corridor cells.
    expect(count(r, 'W') + count(r, 'R')).toBe(241);
  });
});

describe('sequence node', () => {
  it('runs children in order, each until exhausted', () => {
    const r = run(
      '<sequence values="BWR"><one in="B" out="W" steps="3"/><all in="B" out="R"/></sequence>',
      8,
    );
    r.runToEnd();
    expect(count(r, 'W')).toBe(3);
    expect(count(r, 'R')).toBe(61);
  });
});

describe('all node', () => {
  it('applies a maximal set of non-overlapping matches in one turn', () => {
    const r = run('<all values="BW" in="BB" out="WW" steps="1"/>', 15, 11);
    const res = r.step();
    expect(res.stepCount).toBe(1);
    expect(containsLine(r, 'BB')).toBe(false);
    expect(count(r, 'W') % 2).toBe(0);
  });

  it('treats output wildcards as untouched (they do not block other matches)', () => {
    const r = run('<all values="BR" in="*B" out="*R" symmetry="()"/>', [5, 1]);
    r.step();
    expect(rows(r)).toEqual(['BRRRR']);
  });

  it('fills everything in a single turn', () => {
    const r = run('<all values="BW" in="B" out="W"/>', 20);
    expect(r.runToEnd().stepCount).toBe(2);
    expect(count(r, 'W')).toBe(400);
  });
});

describe('prl node', () => {
  it('applies each match independently with probability p', () => {
    const r = run('<prl values="BW" in="B" out="W" p="0.5" steps="1"/>', 64);
    expect(r.runToEnd().stepCount).toBe(2);
    const fraction = count(r, 'W') / (64 * 64);
    expect(fraction).toBeGreaterThan(0.45);
    expect(fraction).toBeLessThan(0.55);
  });

  it('reads the grid as it was at the start of the turn', () => {
    const r = run('<prl values="BW" origin="True" in="WB" out="WW" steps="3"/>', 11);
    r.runToEnd();
    // A diamond of Manhattan radius 3: 1 + 4 + 8 + 12 cells.
    expect(count(r, 'W')).toBe(25);
  });
});

describe('symbols', () => {
  it('matches unions in the input', () => {
    const r = run(
      '<one values="BWR" origin="True" in="?B" out="*R"><union symbol="?" values="WR"/></one>',
      7,
    );
    r.runToEnd();
    expect(count(r, 'W')).toBe(1);
    expect(count(r, 'R')).toBe(48);
  });

  it('honours symmetry="()" (only the rule as written)', () => {
    const r = run('<one values="BW" in="WB" out="WW" symmetry="()" origin="True"/>', 9);
    r.runToEnd();
    expect(rows(r)[4]).toBe('BBBBWWWWW');
    expect(count(r, 'W')).toBe(5);
  });
});

describe('Run API', () => {
  const program = programFromXml(fixture('MazeBacktracker')).program;

  it('is deterministic for a seed and differs across seeds', () => {
    const a = createRun(program, { width: 31, height: 31, seed: 5 });
    const b = createRun(program, { width: 31, height: 31, seed: 5 });
    const c = createRun(program, { width: 31, height: 31, seed: 6 });
    a.runToEnd();
    b.runToEnd();
    c.runToEnd();
    expect(hash(a)).toBe(hash(b));
    expect(hash(a)).not.toBe(hash(c));
  });

  it('reset() reproduces the same run, or a new one with a new seed', () => {
    const r = createRun(program, { width: 31, height: 31, seed: 5 });
    r.runToEnd();
    const first = hash(r);
    r.reset();
    expect(r.stepCount).toBe(0);
    expect(count(r, 'R')).toBe(1);
    r.runToEnd();
    expect(hash(r)).toBe(first);
    r.reset(6);
    r.runToEnd();
    expect(hash(r)).not.toBe(first);
  });

  it('step(n) reports changed cells and stops at the halt', () => {
    const r = createRun(program, { width: 11, height: 11, seed: 1 });
    const before = Uint8Array.from(r.state);
    const res = r.step(10);
    expect(res.stepCount).toBe(10);
    expect(res.halted).toBe(false);
    const changed = new Set(res.changed);
    for (let i = 0; i < before.length; i++) {
      if (before[i] !== r.state[i]) expect(changed.has(i)).toBe(true);
    }
    const end = r.step(1_000_000);
    expect(end.halted).toBe(true);
    expect(r.step().stepCount).toBe(end.stepCount);
  });

  it('reports the active node path', () => {
    const p = programFromXml(
      '<sequence values="BWR"><one in="B" out="W" steps="2"/><markov><one in="B" out="R"/></markov></sequence>',
    ).program;
    const r = createRun(p, { width: 4, height: 4, seed: 1 });
    expect(r.step().activeNodePath).toEqual([0]);
    r.step(2);
    expect(r.step().activeNodePath).toEqual([1, 0]);
  });

  it('runToEnd(maxSteps) caps a non-halting program', () => {
    const r = run('<markov values="BW"><one in="B" out="W"/><one in="W" out="B"/></markov>', 4);
    const res = r.runToEnd(500);
    expect(res.halted).toBe(false);
    expect(res.stepCount).toBe(500);
  });

  it('rejects invalid grid sizes', () => {
    expect(() => createRun(program, { width: 0, height: 5, seed: 1 })).toThrow(RangeError);
    expect(() => createRun(program, { width: 2.5, height: 5, seed: 1 })).toThrow(RangeError);
  });
});
