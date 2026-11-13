import type { NodeDef } from '@mj/engine';

/** Largest rule pattern the painter offers. */
export const MAX_PATTERN = 9;

export const KIND_HINT: Record<NodeDef['kind'], string> = {
  one: 'Apply one random match per step',
  all: 'Apply all non-overlapping matches per step',
  prl: 'Apply every match independently per step',
  markov: 'Each step, run the first child that can still progress',
  sequence: 'Run children in order, each until it is done',
};

export const SYMMETRY_LABELS: Record<string, string> = {
  '()': 'none',
  '(x)': 'mirror left–right',
  '(y)': 'mirror top–bottom',
  '(x)(y)': 'both mirrors',
  '(xy+)': 'rotations',
  '(xy)': 'rotations + mirrors',
};
