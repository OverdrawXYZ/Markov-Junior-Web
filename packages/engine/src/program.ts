/**
 * Program AST — the canonical, serialisable model of a MarkovJunior program.
 *
 * Both the visual editor and the XML view are projections of this model.
 * Keep it plain data (no classes, no functions) so it can be cloned,
 * diffed, stored and posted to a worker.
 */

/** Index path from the root node to a node, e.g. [] is the root, [1, 0] its 2nd child's 1st child. */
export type NodePath = readonly number[];

export interface RuleDef {
  /** Input pattern: rows separated by `/`. `*` matches anything; union symbols match a set. */
  in: string;
  /** Output pattern, same size as `in`. `*` leaves the cell unchanged. */
  out: string;
  /** Probability of applying a match (only meaningful in `prl` nodes). Default 1. */
  p?: number;
  /** Symmetry subgroup for this rule; inherits from the node when omitted. */
  symmetry?: string;
}

export type RuleNodeKind = 'one' | 'all' | 'prl';

/**
 * A distance field that steers a `one`/`all` node: matches are preferred when
 * they move `for` cells closer to the `to` symbols (or away from `from`),
 * measured in steps through `on` cells.
 */
export interface FieldDef {
  /** Symbol whose placement the field guides. */
  for: string;
  /** Symbols the distance may pass through. */
  on: string;
  /** Distance is measured from these symbols, attracting `for` (exclusive with `from`). */
  to?: string;
  /** Like `to` but repelling: `for` is pushed away from these symbols. */
  from?: string;
  /** Recompute the field every step instead of once when the node starts. */
  recompute?: boolean;
  /** Stop the node when this field can't be computed (no `to`/`from` cells exist). */
  essential?: boolean;
}
export type BranchNodeKind = 'markov' | 'sequence';

export interface RuleNodeDef {
  kind: RuleNodeKind;
  rules: RuleDef[];
  /** Distance fields that bias which matches are applied (`one`/`all` only). */
  fields?: FieldDef[];
  /**
   * With fields: 0 (default) always takes the best match; higher values pick
   * more randomly.
   */
  temperature?: number;
  /** Maximum number of steps this node may take before it stops (0 / omitted = unlimited). */
  steps?: number;
  symmetry?: string;
  /** Free-text note; shown as the node's label in the editor. */
  comment?: string;
}

export interface BranchNodeDef {
  kind: BranchNodeKind;
  children: NodeDef[];
  symmetry?: string;
  comment?: string;
}

/** Which neighbours a convolution counts. */
export type Neighborhood = 'Moore' | 'VonNeumann';

export interface ConvolutionRuleDef {
  /** Symbol a cell must have. */
  in: string;
  /** Symbol it becomes. */
  out: string;
  /** Probability of applying when the condition holds. Default 1. */
  p?: number;
  /** Symbols to count among the neighbours (requires `sum`). */
  values?: string;
  /** Allowed neighbour counts, e.g. "3" or "0,1,4..8" (requires `values`). */
  sum?: string;
}

/**
 * A cellular-automaton step: every cell looks at its neighbourhood and the first
 * matching rule rewrites it, all cells at once.
 */
export interface ConvolutionNodeDef {
  kind: 'convolution';
  neighborhood: Neighborhood;
  rules: ConvolutionRuleDef[];
  /** Wrap around the grid edges. */
  periodic?: boolean;
  /** Maximum number of steps (0 / omitted = until nothing changes). */
  steps?: number;
  comment?: string;
}

/**
 * Draws one shortest path per step from a `from` cell to the nearest `to` cell,
 * walking only through `on` cells, painting it in `color`.
 */
export interface PathNodeDef {
  kind: 'path';
  /** Start symbols (the path begins next to one of these). */
  from: string;
  /** Goal symbols. */
  to: string;
  /** Symbols the path may cross. */
  on: string;
  /** Symbol to paint; defaults to the first `from` symbol. */
  color?: string;
  /** Prefer to keep going in the same direction. */
  inertia?: boolean;
  /** Start from the farthest start cell instead of the nearest. */
  longest?: boolean;
  /** Allow diagonal steps. */
  edges?: boolean;
  /** Allow corner-diagonal steps (3D only). */
  vertices?: boolean;
  comment?: string;
}

/** A rule of a `map` node: an input pattern in the outer alphabet, an output in the map's. */
export interface MapRuleDef {
  in: string;
  /** May differ in size from `in`. */
  out: string;
  comment?: string;
}

/**
 * Replaces the grid with a rescaled one that has its own alphabet. On its first
 * step it translates the old grid through its rules; then its children run on
 * the new grid. When they finish, the whole program halts.
 */
export interface MapNodeDef {
  kind: 'map';
  /** Scale per axis, "x y z", each "N" or "N/D", e.g. "3 3 1" or "1/2 1/2 1". */
  scale: string;
  /** Alphabet of the new grid; its first symbol fills it. */
  values: string;
  /** Unions available inside the map. */
  unions?: UnionDef[];
  rules: MapRuleDef[];
  children: NodeDef[];
  symmetry?: string;
  comment?: string;
}

export type NodeDef = RuleNodeDef | BranchNodeDef | ConvolutionNodeDef | PathNodeDef | MapNodeDef;

export interface UnionDef {
  /** Single character used in rule inputs. */
  symbol: string;
  /** Symbols (from the alphabet) this union matches. */
  values: string;
}

export interface Program {
  /** Alphabet; the first symbol fills the initial grid. */
  values: string;
  /** If true, the centre cell starts as the second symbol. */
  origin?: boolean;
  unions?: UnionDef[];
  root: NodeDef;
}

/** Nodes with children: `markov`, `sequence` and `map`. */
export function isBranch(node: NodeDef): node is BranchNodeDef | MapNodeDef {
  return node.kind === 'markov' || node.kind === 'sequence' || node.kind === 'map';
}

export function isMap(node: NodeDef): node is MapNodeDef {
  return node.kind === 'map';
}

/** The symbols and unions usable at some point in a program. */
export interface Alphabet {
  values: string;
  unions: readonly UnionDef[];
}

/**
 * The alphabet a node's rules use: the program's, or that of the innermost
 * `map` containing the node. (A map node's own rule inputs use this alphabet;
 * its outputs and children use the map's.)
 */
export function alphabetAt(program: Program, path: NodePath): Alphabet {
  let scope: Alphabet = { values: program.values, unions: program.unions ?? [] };
  let node: NodeDef = program.root;
  for (const i of path) {
    if (!isBranch(node)) break;
    if (isMap(node)) scope = innerAlphabet(node);
    const child: NodeDef | undefined = node.children[i];
    if (!child) break;
    node = child;
  }
  return scope;
}

/** The alphabet inside a map node. */
export function innerAlphabet(node: MapNodeDef): Alphabet {
  return { values: node.values, unions: node.unions ?? [] };
}

export function isRuleNode(node: NodeDef): node is RuleNodeDef {
  return node.kind === 'one' || node.kind === 'all' || node.kind === 'prl';
}

/** Nodes with a `rules` list (rule nodes and convolutions). */
export function hasRules(node: NodeDef): node is RuleNodeDef | ConvolutionNodeDef {
  return isRuleNode(node) || isConvolution(node);
}

export function isPath(node: NodeDef): node is PathNodeDef {
  return node.kind === 'path';
}

export function isConvolution(node: NodeDef): node is ConvolutionNodeDef {
  return node.kind === 'convolution';
}

/** Look up a node by path; returns undefined if the path does not exist. */
export function nodeAt(root: NodeDef, path: NodePath): NodeDef | undefined {
  let node: NodeDef | undefined = root;
  for (const i of path) {
    if (!node || !isBranch(node)) return undefined;
    node = node.children[i];
  }
  return node;
}
