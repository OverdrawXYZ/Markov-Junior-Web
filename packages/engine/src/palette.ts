/**
 * Default symbol → colour palette, matching MarkovJunior's resources/palette.xml
 * (MarkovJunior by Maxim Gumin, MIT License) so imported programs look the same.
 * Colours are 0xRRGGBB.
 */
export const DEFAULT_PALETTE: Readonly<Record<string, number>> = {
  B: 0x000000,
  I: 0x1d2b53,
  P: 0x7e2553,
  E: 0x008751,
  N: 0xab5236,
  D: 0x5f574f,
  A: 0xc2c3c7,
  W: 0xfff1e8,
  R: 0xff004d,
  O: 0xffa300,
  Y: 0xffec27,
  G: 0x00e436,
  U: 0x29adff,
  S: 0x83769c,
  K: 0xff77a8,
  F: 0xffccaa,
  b: 0x291814,
  i: 0x111d35,
  p: 0x422136,
  e: 0x125359,
  n: 0x742f29,
  d: 0x49333b,
  a: 0xa28879,
  w: 0xf3ef7d,
  r: 0xbe1250,
  o: 0xff6c24,
  y: 0xa8e72e,
  g: 0x00b543,
  u: 0x065ab5,
  s: 0x754665,
  k: 0xff6e59,
  f: 0xff9d81,
  C: 0x00ffff,
  c: 0x5fcde4,
  H: 0xe4bb40,
  h: 0x8a6f30,
  J: 0x4b692f,
  j: 0x45107e,
  L: 0x847e87,
  l: 0x696a6a,
  M: 0xff00ff,
  m: 0x9c09cc,
  Q: 0x9badb7,
  q: 0x3f3f74,
  T: 0x37946e,
  t: 0x323c39,
  V: 0x8f974a,
  v: 0x524b24,
  X: 0xff0000,
  x: 0xd95763,
  Z: 0xffffff,
  z: 0xcbdbfc,
};

/** Colour used for symbols that have no palette entry. */
export const FALLBACK_COLOR = 0xff00ff;

export function colorOf(
  symbol: string,
  palette: Readonly<Record<string, number>> = DEFAULT_PALETTE,
): number {
  return palette[symbol] ?? FALLBACK_COLOR;
}
