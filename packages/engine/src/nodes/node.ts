import type { Context } from '../context';
import type { NodePath } from '../program';

export abstract class Node {
  constructor(
    protected readonly ctx: Context,
    /** Path of the AST node this was compiled from. */
    readonly path: NodePath,
  ) {}

  /** Restore the node to its initial state (called when its parent restarts it). */
  abstract reset(): void;

  /** Try to make one step of progress. Returns false when the node can't. */
  abstract go(): boolean;
}

/**
 * A node that runs its children in order. Once a child branch makes progress
 * it becomes `ctx.current`, and subsequent turns go straight to it until it is
 * exhausted, at which point control returns to the parent.
 */
export abstract class Branch extends Node {
  parent: Branch | null = null;
  nodes: Node[] = [];
  n = 0;
  /** A detached branch doesn't return control to its parent when done: the program halts (map). */
  protected readonly detached: boolean = false;

  setChildren(nodes: Node[]): void {
    this.nodes = nodes;
    for (const node of nodes) if (node instanceof Branch) node.parent = node.detached ? null : this;
  }

  go(): boolean {
    for (; this.n < this.nodes.length; this.n++) {
      const node = this.nodes[this.n]!;
      if (node instanceof Branch) this.ctx.current = node;
      if (node.go()) return true;
    }
    this.ctx.current = this.parent;
    this.reset();
    return false;
  }

  reset(): void {
    for (const node of this.nodes) node.reset();
    this.n = 0;
  }
}

/** Runs children in order; each child runs until it can make no more progress. */
export class SequenceNode extends Branch {}

/** Each turn, runs the first child that can make progress. Stops when none can. */
export class MarkovNode extends Branch {
  override go(): boolean {
    this.n = 0;
    return super.go();
  }
}
