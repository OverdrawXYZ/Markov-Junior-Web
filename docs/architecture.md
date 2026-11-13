# Architecture

## Engine (`packages/engine`)

Pure TypeScript; no DOM, no React. Runs in Node (tests) and in a Web Worker (app).

```
XML text ──programFromXml──▶ Program (AST) ──createRun──▶ Run
                 ▲                │ validateProgram          │ step(n) / runToEnd / reset
                 └──programToXml──┘                          ▼
                                                    state: Uint8Array (x-fastest)
```

| Module                   | Responsibility                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `program.ts`             | AST types. Plain data: serialisable, clonable, postable to a worker.               |
| `xml-parser.ts`          | Minimal XML → element tree with line numbers.                                      |
| `xml.ts`                 | Element tree ↔ AST, warnings for ignored attributes, line map per node path.       |
| `validate.ts`            | All static checks; issues carry a node path + rule index (+ line via `withLines`). |
| `compile.ts`             | AST → executable node tree; expands each rule into its symmetry variants.          |
| `rule.ts`, `symmetry.ts` | Pattern parsing, rule encoding, rotation/reflection, dihedral subgroups.           |
| `grid.ts`                | Alphabet, union waves, state buffer, `matches()`.                                  |
| `nodes/`                 | `Branch` (`markov`, `sequence`) and `RuleNode` (`one`, `all`, `prl`).              |
| `interpreter.ts`         | `createRun` — the public stepping API.                                             |

### Execution model

- The interpreter repeatedly calls `current.go()`; one call is one **turn** (`stepCount`).
  `current` is the innermost active branch; it becomes `null` when the root is exhausted.
- **Rule encoding.** Input cells are bitmasks ("waves") over symbol indices, so unions and `*`
  are just wider masks. Output cells are symbol indices or `0xff` (unchanged).
- **Match finding.** `ishifts[c]` lists positions inside a rule's input that accept symbol `c`.
  A full scan visits only a lattice of cells spaced by the rule's size (every placement covers
  exactly one lattice cell). After that, `one` and `all` nodes rescan only around cells in the
  global `changes` log since their last turn, deduplicated by a per-rule `matchMask`.
  Stale matches are dropped lazily when picked.
- **Determinism.** One seeded RNG per run; scan and application order are fixed.

### Performance (Node 22, single core, reference sizes)

| Program         | Grid | Steps   | Time    |
| --------------- | ---- | ------- | ------- |
| MazeBacktracker | 359² | 64 081  | ~130 ms |
| MazeGrowth      | 359² | 32 041  | ~40 ms  |
| Growth          | 359² | 128 881 | ~60 ms  |
| River           | 160² | 50 258  | ~60 ms  |
