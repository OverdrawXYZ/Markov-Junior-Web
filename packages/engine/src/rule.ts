import { squareSymmetries, type SymmetryMask } from './symmetry';

/** Output value meaning "leave the cell unchanged". */
export const WILDCARD_OUT = 0xff;

export interface Pattern {
  /** Characters in x-fastest order: index = x + y*MX + z*MX*MY. */
  chars: string[];
  MX: number;
  MY: number;
  MZ: number;
}

/**
 * Parse a compact pattern string: rows separated by `/`, 3D layers by a space.
 * Returns an error message string instead of throwing.
 */
export function parsePattern(source: string): Pattern | string {
  const layers = source.split(' ').map((layer) => layer.split('/'));
  const MZ = layers.length;
  const MY = layers[0]!.length;
  const MX = layers[0]![0]!.length;
  if (MX === 0) return 'empty pattern';
  const chars = new Array<string>(MX * MY * MZ);
  for (let z = 0; z < MZ; z++) {
    // Layers are listed top-down, z grows upward (as in MarkovJunior).
    const rows = layers[MZ - 1 - z]!;
    if (rows.length !== MY) return 'non-rectangular pattern';
    for (let y = 0; y < MY; y++) {
      const row = rows[y]!;
      if (row.length !== MX) return 'non-rectangular pattern';
      for (let x = 0; x < MX; x++) chars[x + y * MX + z * MX * MY] = row[x]!;
    }
  }
  return { chars, MX, MY, MZ };
}

/**
 * A compiled rewrite rule. Input cells are bitmasks over symbol indices ("waves");
 * output cells are symbol indices or WILDCARD_OUT. Input and output have equal size.
 */
export class Rule {
  readonly input: Int32Array;
  readonly output: Uint8Array;
  readonly IMX: number;
  readonly IMY: number;
  readonly IMZ: number;
  readonly p: number;
  readonly C: number;
  /**
   * For each symbol c: flat [x, y, z, x, y, z, ...] positions inside the input
   * pattern that accept c. Used to find all placements covering a given cell.
   */
  readonly ishifts: Int32Array[];

  constructor(
    input: Int32Array,
    output: Uint8Array,
    IMX: number,
    IMY: number,
    IMZ: number,
    C: number,
    p = 1,
  ) {
    this.input = input;
    this.output = output;
    this.IMX = IMX;
    this.IMY = IMY;
    this.IMZ = IMZ;
    this.C = C;
    this.p = p;

    const lists: number[][] = Array.from({ length: C }, () => []);
    for (let z = 0; z < IMZ; z++)
      for (let y = 0; y < IMY; y++)
        for (let x = 0; x < IMX; x++) {
          let w = input[x + y * IMX + z * IMX * IMY]!;
          for (let c = 0; c < C; c++, w >>>= 1) if (w & 1) lists[c]!.push(x, y, z);
        }
    this.ishifts = lists.map((l) => Int32Array.from(l));
  }

  /** Rotate 90° in the xy plane. */
  zRotated(): Rule {
    const { IMX, IMY, IMZ } = this;
    const input = new Int32Array(this.input.length);
    const output = new Uint8Array(this.output.length);
    for (let z = 0; z < IMZ; z++)
      for (let y = 0; y < IMX; y++)
        for (let x = 0; x < IMY; x++) {
          const to = x + y * IMY + z * IMX * IMY;
          const from = IMX - 1 - y + x * IMX + z * IMX * IMY;
          input[to] = this.input[from]!;
          output[to] = this.output[from]!;
        }
    return new Rule(input, output, IMY, IMX, IMZ, this.C, this.p);
  }

  /** Mirror in x. */
  reflected(): Rule {
    const { IMX, IMY, IMZ } = this;
    const input = new Int32Array(this.input.length);
    const output = new Uint8Array(this.output.length);
    for (let z = 0; z < IMZ; z++)
      for (let y = 0; y < IMY; y++)
        for (let x = 0; x < IMX; x++) {
          const to = x + y * IMX + z * IMX * IMY;
          const from = IMX - 1 - x + y * IMX + z * IMX * IMY;
          input[to] = this.input[from]!;
          output[to] = this.output[from]!;
        }
    return new Rule(input, output, IMX, IMY, IMZ, this.C, this.p);
  }

  static same(a: Rule, b: Rule): boolean {
    if (a.IMX !== b.IMX || a.IMY !== b.IMY || a.IMZ !== b.IMZ) return false;
    for (let i = 0; i < a.input.length; i++) if (a.input[i] !== b.input[i]) return false;
    for (let i = 0; i < a.output.length; i++) if (a.output[i] !== b.output[i]) return false;
    return true;
  }

  /** All distinct variants of this rule under a 2D symmetry subgroup. */
  symmetries(subgroup: SymmetryMask): Rule[] {
    return squareSymmetries<Rule>(
      this,
      (r) => r.zRotated(),
      (r) => r.reflected(),
      Rule.same,
      subgroup,
    );
  }
}
