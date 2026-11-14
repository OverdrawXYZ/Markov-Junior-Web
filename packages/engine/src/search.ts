import type { Progress } from './context';
import {
  backwardPointwise,
  computeBackwardPotentials,
  computeForwardPotentials,
  createScratch,
  forwardPointwise,
} from './observation';
import type { Rng } from './rng';
import { WILDCARD_OUT, type Rule } from './rule';

/** Safety cap on explored states when a search has no `limit`, so it can't run forever. */
export const SEARCH_STATE_CAP = 200_000;
const PROGRESS_EVERY = 2_000;

interface Board {
  state: Uint8Array;
  parent: number;
  depth: number;
  backward: number;
  forward: number;
}

function rank(board: Board, rng: Rng, depthCoefficient: number): number {
  const base =
    depthCoefficient < 0
      ? 1000 - board.depth
      : board.forward + board.backward + 2 * depthCoefficient * board.depth;
  return base + 0.0001 * rng.next();
}

/** Min-heap of board indices by priority. */
class Frontier {
  private items: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, key: number): void {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      items[i] = items[p]!;
      keys[i] = keys[p]!;
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }
  pop(): number {
    const { items, keys } = this;
    const top = items[0]!;
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    if (items.length > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= items.length) break;
        const r = l + 1;
        const c = r < items.length && keys[r]! < keys[l]! ? r : l;
        if (keys[c]! >= lastKey) break;
        items[i] = items[c]!;
        keys[i] = keys[c]!;
        i = c;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

const keyOf = (state: Uint8Array) => String.fromCharCode(...state);

/**
 * Best-first search for a sequence of states from `present` to one matching
 * `future`, using the node's rules (one match per step, or every maximal set
 * of non-overlapping matches for `all`). Returns the states after each step,
 * [] if already at the goal, or null if no trajectory was found.
 */
export function searchTrajectory(
  present: Uint8Array,
  future: Int32Array,
  rules: readonly Rule[],
  MX: number,
  MY: number,
  C: number,
  all: boolean,
  limit: number,
  depthCoefficient: number,
  rng: Rng,
  onProgress?: (p: Progress) => void,
  stateCap = SEARCH_STATE_CAP,
): Uint8Array[] | null {
  const cells = present.length;
  const bpotentials = Array.from({ length: C }, () => new Int32Array(cells).fill(-1));
  const fpotentials = Array.from({ length: C }, () => new Int32Array(cells).fill(-1));
  const scratch = createScratch(C, cells, rules);
  computeBackwardPotentials(bpotentials, future, MX, MY, rules, scratch);
  const rootBackward = backwardPointwise(bpotentials, present);
  computeForwardPotentials(fpotentials, present, MX, MY, rules, scratch);
  const rootForward = forwardPointwise(fpotentials, future);
  if (rootBackward < 0 || rootForward < 0) return null;
  if (rootBackward === 0) return [];

  const cap = limit < 0 ? stateCap : limit;
  onProgress?.({ kind: 'search', visited: 1 });
  const database: Board[] = [
    { state: present.slice(), parent: -1, depth: 0, backward: rootBackward, forward: rootForward },
  ];
  const visited = new Map<string, number>([[keyOf(present), 0]]);
  const frontier = new Frontier();
  frontier.push(0, rank(database[0]!, rng, depthCoefficient));

  const finish = (found: Uint8Array[] | null) => {
    onProgress?.({
      kind: 'search',
      visited: visited.size,
      done: true,
      ...(found && { found: found.length }),
    });
    return found;
  };

  while (frontier.size > 0 && database.length < cap) {
    const parentIndex = frontier.pop();
    const parent = database[parentIndex]!;
    const children = all
      ? allChildStates(parent.state, MX, MY, rules)
      : oneChildStates(parent.state, MX, MY, rules);
    for (const childState of children) {
      const key = keyOf(childState);
      const existing = visited.get(key);
      if (existing !== undefined) {
        const old = database[existing]!;
        if (parent.depth + 1 < old.depth) {
          old.depth = parent.depth + 1;
          old.parent = parentIndex;
          if (old.backward >= 0 && old.forward >= 0)
            frontier.push(existing, rank(old, rng, depthCoefficient));
        }
        continue;
      }
      const backward = backwardPointwise(bpotentials, childState);
      computeForwardPotentials(fpotentials, childState, MX, MY, rules, scratch);
      const forward = forwardPointwise(fpotentials, future);
      if (backward < 0 || forward < 0) continue;
      const board: Board = {
        state: childState,
        parent: parentIndex,
        depth: parent.depth + 1,
        backward,
        forward,
      };
      database.push(board);
      const index = database.length - 1;
      visited.set(key, index);
      if (visited.size % PROGRESS_EVERY === 0)
        onProgress?.({ kind: 'search', visited: visited.size });
      if (forward === 0) {
        const trajectory: Uint8Array[] = [];
        for (let b = board; b.parent >= 0; b = database[b.parent]!) trajectory.push(b.state);
        return finish(trajectory.reverse());
      }
      frontier.push(index, rank(board, rng, depthCoefficient));
    }
  }
  return finish(null);
}

function matchesAt(
  rule: Rule,
  x: number,
  y: number,
  state: Uint8Array,
  MX: number,
  MY: number,
): boolean {
  if (x + rule.IMX > MX || y + rule.IMY > MY) return false;
  for (let dy = 0; dy < rule.IMY; dy++)
    for (let dx = 0; dx < rule.IMX; dx++) {
      if ((rule.input[dx + dy * rule.IMX]! & (1 << state[x + dx + (y + dy) * MX]!)) === 0)
        return false;
    }
  return true;
}

function applyTo(rule: Rule, x: number, y: number, state: Uint8Array, MX: number): void {
  for (let dy = 0; dy < rule.OMY; dy++)
    for (let dx = 0; dx < rule.OMX; dx++) {
      const v = rule.output[dx + dy * rule.OMX]!;
      // MarkovJunior writes `*` here too in its all-search; we leave those cells alone.
      if (v !== WILDCARD_OUT) state[x + dx + (y + dy) * MX] = v;
    }
}

function oneChildStates(
  state: Uint8Array,
  MX: number,
  MY: number,
  rules: readonly Rule[],
): Uint8Array[] {
  const result: Uint8Array[] = [];
  for (const rule of rules)
    for (let y = 0; y < MY; y++)
      for (let x = 0; x < MX; x++) {
        if (!matchesAt(rule, x, y, state, MX, MY)) continue;
        const child = state.slice();
        applyTo(rule, x, y, child, MX);
        result.push(child);
      }
  return result;
}

/** Every maximal set of non-overlapping matches, applied (exact cover style enumeration). */
function allChildStates(
  state: Uint8Array,
  MX: number,
  MY: number,
  rules: readonly Rule[],
): Uint8Array[] {
  const tiles: { rule: Rule; x: number; y: number }[] = [];
  const amounts = new Int32Array(state.length);
  for (let i = 0; i < state.length; i++) {
    const x = i % MX;
    const y = (i - x) / MX;
    for (const rule of rules) {
      if (!matchesAt(rule, x, y, state, MX, MY)) continue;
      tiles.push({ rule, x, y });
      for (let dy = 0; dy < rule.IMY; dy++)
        for (let dx = 0; dx < rule.IMX; dx++) amounts[x + dx + (y + dy) * MX]!++;
    }
  }
  const visible = new Uint8Array(tiles.length).fill(1);
  const solution: number[] = [];
  const result: Uint8Array[] = [];
  const inside = (px: number, py: number, t: { rule: Rule; x: number; y: number }) =>
    t.x <= px && px < t.x + t.rule.IMX && t.y <= py && py < t.y + t.rule.IMY;
  const overlap = (a: (typeof tiles)[number], b: (typeof tiles)[number]) =>
    a.x < b.x + b.rule.IMX &&
    b.x < a.x + a.rule.IMX &&
    a.y < b.y + b.rule.IMY &&
    b.y < a.y + a.rule.IMY;
  const hide = (l: number, show: boolean) => {
    visible[l] = show ? 1 : 0;
    const t = tiles[l]!;
    const incr = show ? 1 : -1;
    for (let dy = 0; dy < t.rule.IMY; dy++)
      for (let dx = 0; dx < t.rule.IMX; dx++) amounts[t.x + dx + (t.y + dy) * MX]! += incr;
  };

  const enumerate = (): void => {
    let I = -1;
    let max = -1;
    for (let i = 0; i < amounts.length; i++) {
      const a = amounts[i]!;
      if (a > 0 && a > max) {
        max = a;
        I = i;
      }
    }
    if (I < 0) {
      const child = state.slice();
      for (const l of solution) {
        const t = tiles[l]!;
        applyTo(t.rule, t.x, t.y, child, MX);
      }
      result.push(child);
      return;
    }
    const X = I % MX;
    const Y = (I - X) / MX;
    const cover: number[] = [];
    for (let l = 0; l < tiles.length; l++) if (visible[l] && inside(X, Y, tiles[l]!)) cover.push(l);
    for (const l of cover) {
      solution.push(l);
      const intersecting: number[] = [];
      for (let m = 0; m < tiles.length; m++)
        if (visible[m] && overlap(tiles[l]!, tiles[m]!)) intersecting.push(m);
      for (const m of intersecting) hide(m, false);
      enumerate();
      for (const m of intersecting) hide(m, true);
      solution.pop();
    }
  };
  enumerate();
  return result;
}
