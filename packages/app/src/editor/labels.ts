import type { ConvolutionRuleDef, FieldDef, NodeDef, ObserveDef, PathNodeDef } from '@mj/engine';

/** Largest rule pattern the painter offers. */
export const MAX_PATTERN = 9;

export const KIND_HINT: Record<NodeDef['kind'], string> = {
  one: 'Apply one random match per step',
  all: 'Apply all non-overlapping matches per step',
  prl: 'Apply every match independently per step',
  markov: 'Each step, run the first child that can still progress',
  sequence: 'Run children in order, each until it is done',
  convolution: 'Cellular automaton: every cell checks its neighbours, all at once',
  path: 'Draw a shortest path from one symbol to another, one path per step',
  map: 'Rescale the grid into a new alphabet, then run the children on it (the program ends after)',
};

export const SYMMETRY_LABELS: Record<string, string> = {
  '()': 'none',
  '(x)': 'mirror left–right',
  '(y)': 'mirror top–bottom',
  '(x)(y)': 'both mirrors',
  '(xy+)': 'rotations',
  '(xy)': 'rotations + mirrors',
};

/** Plain-language reading of a rule, e.g. "A D cell with 3 A neighbours becomes A." */
export function describeConvolutionRule(rule: ConvolutionRuleDef, neighbours: number): string {
  const chance = rule.p !== undefined && rule.p < 1 ? ` (${Math.round(rule.p * 100)}% chance)` : '';
  if (rule.values === undefined || rule.sum === undefined) {
    return `Every ${rule.in} cell becomes ${rule.out}${chance}.`;
  }
  const counted = [...rule.values].join(' or ');
  return `Each ${rule.in} cell becomes ${rule.out} when ${rule.sum.replace(/\.\./g, '–').replace(/,/g, ', ')} of its ${neighbours} neighbours are ${counted}${chance}.`;
}

const list = (symbols: string) => [...symbols].join(', ');

/** Plain-language reading of a field, e.g. "W grows towards T, through B." */
export function describeField(field: FieldDef): string {
  const direction =
    field.from !== undefined ? `away from ${list(field.from)}` : `towards ${list(field.to ?? '')}`;
  const extras = [field.recompute ? 'recomputed every step' : '', field.essential ? 'required' : '']
    .filter(Boolean)
    .join(', ');
  return `${field.for} is placed ${direction}, measured through ${list(field.on)}${extras ? ` (${extras})` : ''}.`;
}

/** Compact tree label for a path node, e.g. "R → U via D". */
export function describePathShort(node: PathNodeDef): string {
  return `${node.from} → ${node.to} via ${node.on}`;
}

/** Plain-language reading of a path node. */
export function describePath(node: PathNodeDef): string {
  const color = node.color ?? node.from[0] ?? '?';
  const start = node.longest ? 'the farthest' : 'the nearest';
  const extras = [
    node.edges ? 'diagonal steps allowed' : '',
    node.inertia ? 'prefers going straight' : '',
  ]
    .filter(Boolean)
    .join(', ');
  return `Each step draws a ${color} path from ${start} ${list(node.from)} to ${list(node.to)}, through ${list(node.on)}${extras ? ` (${extras})` : ''}.`;
}

/** Plain-language reading of a goal, e.g. "I cells become B now and must end as W." */
export function describeObservation(o: ObserveDef): string {
  const now = o.from !== undefined && o.from !== o.value ? ` become ${o.from} now and` : '';
  return `${o.value} cells${now} must end as ${list(o.to)}.`;
}
