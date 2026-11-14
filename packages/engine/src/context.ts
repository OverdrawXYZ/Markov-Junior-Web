import type { Grid } from './grid';
import type { IntList } from './int-list';
import type { Rng } from './rng';
import type { Branch, Node } from './nodes/node';

/** Shared interpreter state that nodes read and mutate. */
export interface Context {
  grid: Grid;
  rng: Rng;
  /** Flat indices of every cell written so far in this run (may repeat). */
  changes: IntList;
  /** first[t] = changes.length at the start of turn t. */
  first: number[];
  /** Current turn number. */
  counter: number;
  /** Branch that receives the next `go()`; null once the program halts. */
  current: Branch | null;
  /** Rule node that made progress most recently. */
  lastActive: Node | null;
  /** Most states a search without its own `limit` may explore. */
  searchStateCap: number;
  /** Long-running work (search) reports progress here, e.g. so a worker can tell the UI. */
  onProgress?: ((progress: Progress) => void) | undefined;
}

export interface Progress {
  kind: 'search';
  /** States explored so far. */
  visited: number;
  /** Set when the search finishes. */
  done?: boolean;
  /** Length of the trajectory found (if done and successful). */
  found?: number;
}
