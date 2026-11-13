import { describe, expect, it } from 'vitest';
import { fitScale, zoomIn, zoomOut } from './zoom';

describe('zoom', () => {
  it('fits with whole-number scales when enlarging', () => {
    expect(fitScale(500, 400, 59, 59)).toBe(6);
    expect(fitScale(100, 100, 400, 200)).toBe(0.25);
    expect(fitScale(0, 100, 10, 10)).toBe(1);
  });

  it('steps through zoom levels', () => {
    expect(zoomIn(3)).toBe(4);
    expect(zoomIn(3.7)).toBe(4);
    expect(zoomIn(0.25)).toBe(0.5);
    expect(zoomOut(4)).toBe(3);
    expect(zoomOut(1)).toBe(0.5);
    expect(zoomOut(1 / 16)).toBe(1 / 16);
  });
});
