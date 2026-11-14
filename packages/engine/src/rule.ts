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
 * output cells are symbol indices or WILDCARD_OUT. Input and output have the same
 * size, except in `map` rules, which translate between grids.
 */
export class Rule {
  readonly input: Int32Array;
  readonly output: Uint8Array;
  readonly IMX: number;
  readonly IMY: number;
  readonly IMZ: number;
  readonly OMX: number;
  readonly OMY: number;
  readonly OMZ: number;
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
    OMX = IMX,
    OMY = IMY,
    OMZ = IMZ,
  ) {
    this.input = input;
    this.output = output;
    this.IMX = IMX;
    this.IMY = IMY;
    this.IMZ = IMZ;
    this.OMX = OMX;
    this.OMY = OMY;
    this.OMZ = OMZ;
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
    const input = rotate(this.input, this.IMX, this.IMY, this.IMZ, Int32Array);
    const output = rotate(this.output, this.OMX, this.OMY, this.OMZ, Uint8Array);
    return new Rule(
      input,
      output,
      this.IMY,
      this.IMX,
      this.IMZ,
      this.C,
      this.p,
      this.OMY,
      this.OMX,
      this.OMZ,
    );
  }

  /** Mirror in x. */
  reflected(): Rule {
    const input = reflect(this.input, this.IMX, this.IMY, this.IMZ, Int32Array);
    const output = reflect(this.output, this.OMX, this.OMY, this.OMZ, Uint8Array);
    return new Rule(
      input,
      output,
      this.IMX,
      this.IMY,
      this.IMZ,
      this.C,
      this.p,
      this.OMX,
      this.OMY,
      this.OMZ,
    );
  }

  static same(a: Rule, b: Rule): boolean {
    if (a.IMX !== b.IMX || a.IMY !== b.IMY || a.IMZ !== b.IMZ) return false;
    if (a.OMX !== b.OMX || a.OMY !== b.OMY || a.OMZ !== b.OMZ) return false;
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

type TypedArray = Int32Array | Uint8Array;

function rotate<T extends TypedArray>(
  src: T,
  MX: number,
  MY: number,
  MZ: number,
  Ctor: new (n: number) => T,
): T {
  const out = new Ctor(src.length);
  for (let z = 0; z < MZ; z++)
    for (let y = 0; y < MX; y++)
      for (let x = 0; x < MY; x++)
        out[x + y * MY + z * MX * MY] = src[MX - 1 - y + x * MX + z * MX * MY]!;
  return out;
}

function reflect<T extends TypedArray>(
  src: T,
  MX: number,
  MY: number,
  MZ: number,
  Ctor: new (n: number) => T,
): T {
  const out = new Ctor(src.length);
  for (let z = 0; z < MZ; z++)
    for (let y = 0; y < MY; y++)
      for (let x = 0; x < MX; x++)
        out[x + y * MX + z * MX * MY] = src[MX - 1 - x + y * MX + z * MX * MY]!;
  return out;
}
