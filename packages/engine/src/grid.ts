import type { Rule } from './rule';
import type { UnionDef } from './program';

/** Maximum alphabet size: input waves are 32-bit masks. */
export const MAX_SYMBOLS = 31;

export class Grid {
  readonly MX: number;
  readonly MY: number;
  readonly MZ: number;
  /** Number of symbols. */
  readonly C: number;
  /** Symbol characters by index. */
  readonly characters: string;
  /** Symbol character → index. */
  readonly values: ReadonlyMap<string, number>;
  /** Input character (symbol, union or `*`) → bitmask of matched symbol indices. */
  readonly waves: ReadonlyMap<string, number>;
  readonly state: Uint8Array;
  /** Scratch mask used by `all` nodes to prevent overlapping writes. */
  readonly mask: Uint8Array;

  constructor(characters: string, unions: readonly UnionDef[], MX: number, MY: number, MZ = 1) {
    if (characters.length === 0 || characters.length > MAX_SYMBOLS) {
      throw new RangeError(`alphabet must have 1..${MAX_SYMBOLS} symbols`);
    }
    this.MX = MX;
    this.MY = MY;
    this.MZ = MZ;
    this.C = characters.length;
    this.characters = characters;

    const values = new Map<string, number>();
    const waves = new Map<string, number>();
    for (let i = 0; i < characters.length; i++) {
      const ch = characters[i]!;
      if (values.has(ch)) throw new Error(`repeating value ${ch}`);
      values.set(ch, i);
      waves.set(ch, 1 << i);
    }
    waves.set('*', (1 << this.C) - 1);
    this.values = values;
    for (const u of unions) {
      if (waves.has(u.symbol)) throw new Error(`repeating union symbol ${u.symbol}`);
      waves.set(u.symbol, this.wave(u.values));
    }
    this.waves = waves;

    this.state = new Uint8Array(MX * MY * MZ);
    this.mask = new Uint8Array(MX * MY * MZ);
  }

  /** Bitmask of the given symbol characters. */
  wave(symbols: string): number {
    let w = 0;
    for (const ch of symbols) {
      const v = this.values.get(ch);
      if (v === undefined) throw new Error(`unknown symbol ${ch}`);
      w |= 1 << v;
    }
    return w;
  }

  clear(): void {
    this.state.fill(0);
  }

  /** Does `rule`'s input match with its corner at (x, y, z)? Bounds are the caller's job. */
  matches(rule: Rule, x: number, y: number, z: number): boolean {
    const { MX, MY, state } = this;
    const input = rule.input;
    const IMX = rule.IMX;
    const IMY = rule.IMY;
    let dx = 0;
    let dy = 0;
    let dz = 0;
    for (let di = 0; di < input.length; di++) {
      if ((input[di]! & (1 << state[x + dx + (y + dy) * MX + (z + dz) * MX * MY]!)) === 0) {
        return false;
      }
      dx++;
      if (dx === IMX) {
        dx = 0;
        dy++;
        if (dy === IMY) {
          dy = 0;
          dz++;
        }
      }
    }
    return true;
  }
}
