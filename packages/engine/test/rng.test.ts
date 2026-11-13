import { describe, expect, it } from 'vitest';
import { createRng } from '../src';

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('next() stays in [0, 1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('nextInt(n) covers [0, n) and nothing else', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1_000; i++) seen.add(rng.nextInt(5));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('nextInt rejects invalid bounds', () => {
    const rng = createRng(0);
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(2.5)).toThrow(RangeError);
  });
});
