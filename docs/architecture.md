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

## App (`packages/app`)

```
 main thread                                         worker (engine.worker.ts)
┌───────────────────────────────┐   load/play/…    ┌──────────────────────────┐
│ Zustand store (store/app.ts)  │ ───────────────▶ │ EngineHost (worker/host) │
│  source → parse → validate    │                  │  owns the Run, timer,    │
│  run status (mode, steps, …)  │ ◀─────────────── │  speed, back-pressure    │
│                               │  status / frame  └──────────────────────────┘
│ frames bus (store/frames.ts) ─┼─▶ Canvas draws on rAF, then sends `ack`
└───────────────────────────────┘
```

- **Parsing and validation happen on the main thread** so errors appear as you type
  (debounced 300 ms). Only valid programs are sent to the worker; the preview keeps running
  the last valid one.
- **Protocol** (`worker/protocol.ts`): `load | play | pause | step | runToEnd | reset |
setSpeed | ack` in; `loaded | error | status | frame` out. Frames carry a transferred copy
  of the grid plus step count, halted flag and the active node path.
- **Back-pressure.** After posting a frame the host waits for `ack` (sent by the canvas after
  drawing) before posting another; state changes in between are coalesced. The main thread
  is never flooded and always draws the newest state.
- **Speed** is steps per display frame (60 Hz ticks), including fractions (e.g. 1 step every
  4 frames). "max" and "run to end" step in time-boxed slices (12 ms / 40 ms) and yield
  between slices so `pause` is handled promptly.
- **Frames bypass React.** The frames bus is a tiny pub/sub outside Zustand; only the canvas
  subscribes, so a 60 fps run doesn't re-render the component tree. Status fields (step count,
  mode, active node) do go through the store, and only the components that select them re-render.
- **Rendering.** One canvas pixel per cell (`ImageData` via a palette LUT), scaled with CSS and
  `image-rendering: pixelated`. A full repaint per frame is cheap at these sizes
  (≤ 1024² cells), so no dirty-rect tracking yet.
- **Testing without workers.** `createEngineClient()` falls back to running `EngineHost`
  in-process when `Worker` is undefined (jsdom), so component tests exercise the real engine
  and protocol. `EngineHost` itself is tested with a fake scheduler.
