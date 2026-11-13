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
export type BranchNodeKind = 'markov' | 'sequence';

export interface RuleNodeDef {
  kind: RuleNodeKind;
  rules: RuleDef[];
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

export type NodeDef = RuleNodeDef | BranchNodeDef;

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

export function isBranch(node: NodeDef): node is BranchNodeDef {
  return node.kind === 'markov' || node.kind === 'sequence';
}

export function isRuleNode(node: NodeDef): node is RuleNodeDef {
  return !isBranch(node);
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
