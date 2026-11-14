import { describe, expect, it } from 'vitest';
import { count, fixture, hash, run } from './helpers';

/**
 * Golden outputs: program + seed + size → grid hash. These pin down engine
 * behaviour so refactors (e.g. performance work) can't silently change results.
 * If a change is intentional, re-run with `vitest -u` and explain why in the commit.
 */
const CASES: [name: string, size: number, maxSteps?: number][] = [
  ['Basic', 60],
  ['Growth', 59],
  ['MazeGrowth', 59],
  ['MazeBacktracker', 59],
  ['River', 80],
  ['BasicSnake', 23, 100],
  ['Flowers', 60],
  ['NystromDungeon', 39],
  ['Cave', 60],
  ['GameOfLife', 120, 100],
  ['BiasedGrowth', 120, 1000],
  ['BiasedMazeGrowth', 117, 400],
  ['Laplace', 60, 1000],
  ['Keys', 33],
  ['GrowTo', 120, 2000],
  ['Percolation', 60],
  ['ConnectedCaves', 60],
  ['MarchingSquares', 20],
  ['MazeMap', 30],
  ['OddScale', 8],
  ['DiagonalPath', 80],
  ['BishopParity', 60],
  ['SequentialSokoban', 20],
];

describe('golden outputs', () => {
  it.each(CASES)('%s at size %i', (name, size, maxSteps) => {
    const r = run(fixture(name), size, 1);
    const res = r.runToEnd(maxSteps);
    if (maxSteps === undefined) expect(res.halted).toBe(true);
    expect({ steps: res.stepCount, hash: hash(r) }).toMatchSnapshot();
  });

  it('River leaves no unclassified black cells next to land', () => {
    const r = run(fixture('River'), 80, 1);
    r.runToEnd();
    expect(count(r, 'W') + count(r, 'R')).toBe(0);
  });
});
