import { describe, expect, it } from 'vitest';
import { baseName, slug } from './files';

describe('file names', () => {
  it.each([
    ["Drunkard's walk", 'drunkards-walk'],
    ['Maze backtracker', 'maze-backtracker'],
    ['Café / Ünïcode!', 'cafe-unicode'],
    ['***', 'program'],
  ])('slug(%j) = %j', (input, expected) => {
    expect(slug(input)).toBe(expected);
  });

  it('strips extensions', () => {
    expect(baseName('river.v2.xml')).toBe('river.v2');
    expect(baseName('noext')).toBe('noext');
  });
});
