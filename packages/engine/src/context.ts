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
}
