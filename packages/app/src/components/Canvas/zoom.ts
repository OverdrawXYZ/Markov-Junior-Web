export function zoomIn(scale: number): number {
  return scale >= 1 ? Math.floor(scale) + 1 : Math.min(1, scale * 2);
}

export function zoomOut(scale: number): number {
  return scale > 1 ? Math.ceil(scale) - 1 : Math.max(1 / 16, scale / 2);
}

/** Largest scale that fits; whole numbers when ≥ 1 so pixels stay crisp. */
export function fitScale(containerW: number, containerH: number, w: number, h: number): number {
  const s = Math.min(containerW / w, containerH / h);
  if (!Number.isFinite(s) || s <= 0) return 1;
  return s >= 1 ? Math.floor(s) : s;
}
