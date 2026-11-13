import { colorOf } from '@mj/engine';

/**
 * Lookup table from symbol index to a 32-bit pixel in ImageData's byte order
 * (RGBA in memory = ABGR as a little-endian Uint32).
 */
export function buildLut(
  characters: string,
  palette?: Readonly<Record<string, number>>,
): Uint32Array {
  const lut = new Uint32Array(256);
  for (let i = 0; i < characters.length; i++) {
    const rgb = colorOf(characters[i]!, palette);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    lut[i] = (0xff << 24) | (b << 16) | (g << 8) | r;
  }
  return lut;
}

/** Write one pixel per cell into `pixels` (a Uint32 view over ImageData.data). */
export function paint(state: Uint8Array, lut: Uint32Array, pixels: Uint32Array): void {
  for (let i = 0; i < state.length; i++) pixels[i] = lut[state[i]!]!;
}

export function hex(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, '0')}`;
}
