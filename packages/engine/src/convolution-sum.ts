/** Largest neighbour count (a full 3D Moore neighbourhood). */
export const MAX_SUM = 27;

/**
 * Parse a convolution `sum` attribute like "3", "5..8" or "0,1,4..8" into a
 * lookup table indexed by neighbour count. Returns an error message instead.
 */
export function parseSum(source: string): boolean[] | string {
  const table = new Array<boolean>(MAX_SUM + 1).fill(false);
  const parts = source.split(',');
  for (const raw of parts) {
    const part = raw.trim();
    const m = /^(\d+)(?:\.\.(\d+))?$/.exec(part);
    if (!m) return `invalid sum "${part}" (use numbers like 3, 5..8 or 0,1,4..8)`;
    const min = Number(m[1]);
    const max = m[2] === undefined ? min : Number(m[2]);
    if (min > max) return `invalid range ${part}`;
    if (max > MAX_SUM) return `sum ${max} is larger than ${MAX_SUM}`;
    for (let i = min; i <= max; i++) table[i] = true;
  }
  return table;
}
