/**
 * 2D symmetry groups. A subgroup is a mask over the 8 elements of the dihedral
 * group of the square, enumerated in this fixed order (matches MarkovJunior):
 *
 *   0: e      1: b      2: a      3: ba
 *   4: a²     5: ba²    6: a³     7: ba³
 *
 * where `a` is a 90° rotation and `b` a reflection in x.
 */
export type SymmetryMask = readonly boolean[];

export const SQUARE_SUBGROUPS: Readonly<Record<string, SymmetryMask>> = {
  '()': [true, false, false, false, false, false, false, false],
  '(x)': [true, true, false, false, false, false, false, false],
  '(y)': [true, false, false, false, false, true, false, false],
  '(x)(y)': [true, true, false, false, true, true, false, false],
  '(xy+)': [true, false, true, false, true, false, true, false],
  '(xy)': [true, true, true, true, true, true, true, true],
};

export const SYMMETRY_NAMES = Object.keys(SQUARE_SUBGROUPS);

export const FULL_SQUARE_SYMMETRY: SymmetryMask = SQUARE_SUBGROUPS['(xy)']!;

export function isSymmetryName(name: string): boolean {
  return Object.hasOwn(SQUARE_SUBGROUPS, name);
}

/** Resolve a (possibly absent) symmetry name, inheriting from the parent. Returns null if unknown. */
export function resolveSymmetry(
  name: string | undefined,
  inherited: SymmetryMask,
): SymmetryMask | null {
  if (name === undefined) return inherited;
  return Object.hasOwn(SQUARE_SUBGROUPS, name) ? SQUARE_SUBGROUPS[name]! : null;
}

/** All distinct images of `thing` under the selected subgroup, in group order. */
export function squareSymmetries<T>(
  thing: T,
  rotate: (t: T) => T,
  reflect: (t: T) => T,
  same: (a: T, b: T) => boolean,
  subgroup: SymmetryMask = FULL_SQUARE_SYMMETRY,
): T[] {
  const e = thing;
  const a = rotate(e);
  const a2 = rotate(a);
  const a3 = rotate(a2);
  const things = [e, reflect(e), a, reflect(a), a2, reflect(a2), a3, reflect(a3)];
  const result: T[] = [];
  things.forEach((t, i) => {
    if (subgroup[i] && !result.some((s) => same(s, t))) result.push(t);
  });
  return result;
}
