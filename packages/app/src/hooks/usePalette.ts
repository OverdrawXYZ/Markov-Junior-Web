import { useMemo } from 'react';
import { colorOf } from '@mj/engine';
import { effectivePalette, useApp } from '../store/app';
import { hex } from '../render/paint';

/** Colour lookup that honours the user's palette overrides. */
export function useColor(): (symbol: string) => string {
  const overrides = useApp((s) => s.palette);
  return useMemo(() => {
    const palette = effectivePalette(overrides);
    return (symbol: string) => hex(colorOf(symbol, palette));
  }, [overrides]);
}
