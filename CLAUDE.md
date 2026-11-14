# CLAUDE.md

Guidance for Claude (and humans) working in this repository.

## Project goal

A browser-based implementation of the **MarkovJunior** probabilistic programming
language (original C# project by Maxim Gumin, MIT licensed: github.com/mxgmn/MarkovJunior),
paired with an **intuitive visual editor** for building rule programs, running them, and
previewing the result live.

Two halves, kept strictly separate:

1. **Engine** — a pure TypeScript library that parses and interprets MarkovJunior programs on a grid.
   No DOM, no React. Runs in a Web Worker in the app, and in Node for tests.
2. **App** — a React UI that edits programs (visually and as XML), drives the engine, and renders the grid.

## Background: how MarkovJunior works

- State is a **grid** (2D for v1; 3D later) of cells, each holding one **symbol** from an
  alphabet declared by `values`, e.g. `values="BWR"`. Each symbol letter maps to a colour via a palette.
- A **rule** `in → out` is a pair of same-sized patterns. In compact form rows are separated by
  `/` (and 3D layers by a space), e.g. `in="RBB" out="WWR"`.
  - `*` in `in` matches any symbol; `*` in `out` means "leave unchanged".
  - **Unions** (`<union symbol="?" values="BW"/>`) let one character match several symbols.
- **Symmetry**: a rule is expanded into its rotations/reflections according to a symmetry group
  (e.g. `()`, `(x)`, `(xy)`, default = full square symmetry in 2D).
- Rules live inside **nodes** that decide how matches are applied:
  - `one` — apply one randomly chosen match per step (`temperature`/fields can bias the choice).
  - `all` — apply a maximal set of non-overlapping matches at once.
  - `prl` — apply every match independently, in parallel (rule `p` = probability).
  - `markov` — repeatedly run the first child that can still make progress; stops when none can.
  - `sequence` — run children in order, each until it finishes.
  - `steps="N"` limits how many steps a node may run.
- Advanced nodes / features (later phases): `field` (distance-field guided `one`/`all`),
  `observe` + search/inference, `path`, `map` (grid rescaling), `convolution`, `convchain`, `wfc`.
- A program **halts** when the root node makes no further progress.

Reference behaviour is the original C# implementation. When semantics are unclear, read its
source (`Interpreter.cs`, `RuleNode.cs`, `OneNode.cs`, `AllNode.cs`, `ParallelNode.cs`,
`Rule.cs`, `SymmetryHelper.cs`) rather than guessing, and note any intentional deviation in
`docs/deviations.md`.

## Tech stack

| Concern        | Choice                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------- |
| Language       | TypeScript 6.0 (strict) — pinned `~6.0`; typescript-eslint doesn't support TS 7 yet       |
| Build / dev    | Vite                                                                                      |
| UI             | React 19 + Zustand for app state                                                          |
| Styling        | CSS modules (or Tailwind if adopted — pick one, don't mix)                                |
| Rendering      | `<canvas>` 2D with `ImageData`; WebGL only if profiling demands                           |
| Engine runtime | Dedicated Web Worker, messages via a typed protocol (Comlink ok)                          |
| XML            | Small in-house parser in the engine (`DOMParser` doesn't exist in Web Workers)            |
| Tests          | Vitest (engine unit + golden tests), Playwright (UI smoke)                                |
| Lint / format  | ESLint + Prettier                                                                         |
| Package mgr    | npm workspaces (`@mj/engine`, `@mj/app`), Node ≥ 22.22.2 or ≥ 24.15 (`.nvmrc`, `engines`) |

## Repository layout (target)

```
/
├── CLAUDE.md
├── package.json            # npm workspaces root
├── packages/
│   ├── engine/             # pure TS, zero DOM/React dependencies
│   │   ├── src/
│   │   │   ├── grid.ts         # Grid: dims, Uint8Array state, symbol<->index maps
│   │   │   ├── rule.ts         # Rule parsing, wildcard masks, symmetry expansion
│   │   │   ├── symmetry.ts     # square/cube symmetry groups
│   │   │   ├── match.ts        # match finding + incremental match maintenance
│   │   │   ├── nodes/          # one.ts, all.ts, prl.ts, markov.ts, sequence.ts ...
│   │   │   ├── program.ts      # AST types for a program (the canonical model)
│   │   │   ├── xml.ts          # XML <-> AST (import/export, MJ-compatible)
│   │   │   ├── interpreter.ts  # step()/run() generator, halting, step counters
│   │   │   ├── rng.ts          # seeded PRNG (e.g. mulberry32/xoshiro)
│   │   │   └── index.ts
│   │   └── test/
│   └── app/                # React UI
│       ├── src/
│       │   ├── worker/         # engine worker entry + message protocol
│       │   ├── components/
│       │   │   ├── Header/         # project name, examples/open/save/share, dialogs
│       │   │   ├── Gallery/        # examples gallery with rendered thumbnails
│       │   │   ├── Modal/          # accessible dialog
│       │   │   ├── Canvas/         # grid renderer, zoom, pan, hover readout, PNG
│       │   │   ├── NodeTree/       # program tree: select, add, drag/drop, keyboard
│       │   │   ├── Inspector/      # selected node's properties + rules list
│       │   │   ├── RuleEditor/     # paint in/out patterns, resize, symmetry preview, p
│       │   │   ├── ConvolutionEditor/ # convolution rules in plain language
│       │   │   ├── FieldsEditor/   # distance fields + temperature for one/all
│       │   │   ├── PathEditor/     # path node settings
│       │   │   ├── MapEditor/      # map scale, alphabet, translation rules
│       │   │   ├── GoalsEditor/    # observe goals + search settings
│       │   │   ├── Palette/        # symbols, colours, unions, origin
│       │   │   ├── PatternView/    # a rule pattern as a tiny colour grid
│       │   │   ├── Transport/      # run / pause / step / reset / speed / seed / size
│       │   │   └── XmlPanel/       # XML editor + inline errors
│       │   ├── editor/         # AST ops (ops.ts), project actions + shortcuts (actions.ts), labels
│       │   ├── render/         # palette LUT + ImageData painting
│       │   ├── store/          # app.ts (Zustand), frames.ts, persist.ts (save/share), session.ts
│       │   ├── util/           # downloads, file names
│       │   └── examples/       # bundled sample programs (MIT, attributed)
│       └── e2e/
└── docs/
    ├── deviations.md
    └── architecture.md
```

## Core design decisions

- **The program AST is the single source of truth.** The visual editor and the XML panel are
  both views of it. Edits in either produce AST updates; the other view re-renders.
  XML round-trips must be lossless for supported features (test this).
- **Determinism.** All randomness flows from one seeded PRNG. Same program + same seed + same
  grid size ⇒ identical output, bit-for-bit. Never use `Math.random()` in the engine.
- **Engine API is a stepping generator**, so the UI can run fast, slow, or single-step:
  ```ts
  const run = createRun(program, { width, height, seed });
  run.step(n?): StepResult   // { changed: number[] /* cell indices */, halted, stepCount, activeNodePath }
  run.grid: Uint8Array
  ```
- **Worker protocol.** Main thread sends `load | run | pause | step | reset | setSpeed`.
  Worker posts batched frames (transfer `ArrayBuffer`s, don't clone) at most once per animation
  frame, plus status (step count, halted, active node path for highlighting in the tree).
- **Performance.** Grid state is a flat `Uint8Array`. Maintain match lists incrementally
  (only re-scan cells near changes) like the original does — naive full rescans per step will
  be far too slow for `one` nodes on 256×256 grids. Target: classic samples at ≥ 60 fps redraw
  with thousands of steps/sec.
- **Rendering.** One pixel per cell into an offscreen `ImageData`, scaled up with
  `imageSmoothingEnabled = false`. Only repaint dirty cells when the diff is small.

## UI / UX plan

Layout: left = **program tree**, centre = **canvas preview**, right = **inspector**
(selected node / rule), bottom = **transport bar**. XML panel as a toggleable tab.

- **Palette panel**: define the alphabet (letters) and their colours; default palette matches
  MarkovJunior's standard letter→colour mapping so imported examples look right.
- **Rule editor**: two side-by-side mini-grids (`in` and `out`). Click/drag to paint with the
  selected symbol; `*` wildcard is a tool; resize pattern with handles. Shows a live preview of
  the symmetry variants that will be generated. Per-rule `p` slider for `prl`.
- **Node tree**: drag-and-drop to add `one/all/prl/markov/sequence` nodes, nest, reorder,
  set `steps`, `symmetry`, `origin`. The node currently executing is highlighted during a run.
- **Transport**: Run, Pause, Step (1 / N), Reset, speed slider (steps per frame), seed field with
  "randomise", grid width/height, "run to completion" (fast, no intermediate frames).
- **Canvas**: zoom, pan, hover tooltip showing cell coords + symbol; optional
  "highlight last changes" overlay; export PNG; export animated GIF (later).
- **Examples gallery**: load bundled programs (maze growth, river, cave, dungeon, etc.)
  written from scratch or ported from the MIT-licensed originals with attribution.
- **Persistence**: autosave current project to `localStorage`; import/export `.xml`;
  shareable URL (program compressed into the hash).
- **Errors**: validation surfaces inline (e.g. in/out size mismatch, unknown symbol) — never
  crash the worker; report errors with a path into the AST.

## Roadmap

1. ✅ **Scaffold** — workspaces, Vite app, Vitest, ESLint/Prettier, CI (lint + typecheck + test).
2. ✅ **Engine MVP** — grid, rules, wildcards, unions, 2D symmetry, `one`, `all`, `prl`,
   `markov`, `sequence`, `steps`, seeded RNG, XML import. Golden tests vs. known outputs.
3. ✅ **Preview MVP** — worker + canvas + transport; load a program from XML and watch it run.
4. ✅ **Visual editor** — palette, node tree, rule painter, inspector, two-way XML sync.
5. ✅ **Polish** — examples gallery, persistence, share URLs, PNG export, keyboard shortcuts.
6. **Advanced engine** — `field`s/temperature, `observe` + search, `map`, `path`,
   `convolution`, `convchain`, `wfc`.
7. **3D** — 3D grids, cube symmetries, isometric/voxel preview (three.js).

Work through phases in order; each phase should leave `main` in a working, tested state.

## Commands

```bash
npm install
npm run dev          # start the app (Vite)
npm run build        # production build
npm test             # Vitest, all workspaces
npm run test:e2e     # Playwright smoke tests
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit across workspaces
```

Run `npm run lint && npm run format:check && npm run typecheck && npm test` before every commit.

Notes:

- Golden tests (`packages/engine/test/golden.test.ts`) snapshot program + seed → grid hash.
  If engine behaviour changes **intentionally**, update with
  `npx vitest run -u --root packages/engine` and say why in the commit message.
- Engine and app design (worker protocol, back-pressure, rendering, editor sync and undo):
  `docs/architecture.md`.
- All program edits from the UI go through `packages/app/src/editor/ops.ts` (pure, tested) and
  `useApp().edit(fn, { coalesce })`. Don't mutate the AST in components.
- Share links (`#p=z…`/`#p=j…`) and the autosave key (`mj.project.v1`) are a compatibility
  contract — people bookmark and send links. Add a new prefix/key instead of changing them.
- Keyboard shortcuts live in one table, `SHORTCUTS` in `editor/actions.ts`; the help dialog is
  generated from it.
- Node kinds: rule nodes (`one`/`all`/`prl`), branches (`markov`/`sequence`/`map`), `convolution`
  and `path`. Don't assume "not a branch ⇒ has rules": use `hasRules` / `isRuleNode` /
  `isConvolution` / `isPath` / `isMap` from the engine. `isBranch` is true for `map` too.
- **Alphabets are scoped.** Inside a `map`, rules use the map's `values`/unions; a map's own rule
  inputs use the outer alphabet. Use `alphabetAt(program, path)` (engine) or
  `scopedProgram(program, path)` (app) — never `program.values` — when showing or validating a
  node's symbols. Palette edits (rename, usage) stay in the top-level alphabet.
- `search` runs synchronously inside one engine step and reports progress via `onProgress`
  (forwarded by the worker as `progress` messages). Stopping it restarts the worker
  (`EngineClient.restart`) — there is no other way to interrupt it.
- A `map` can change the grid's size and alphabet mid-run: `Run.width/height/characters/state`
  are getters, and every worker frame carries its `characters`.
- `npm run typecheck` uses `tsc -b --force`: plain `tsc -b` in the app can miss errors caused by
  engine changes because of its incremental cache.
- Zustand selectors must return stable values: select the raw array/object and derive in the
  component. A selector that returns a new array (e.g. `s.issues.filter(...)`) loops forever.

- The app imports the engine from source (`@mj/engine` → `packages/engine/src/index.ts`);
  there is no separate engine build step.
- ESLint enforces engine purity: no React/zustand/app imports, no `window`/`document`,
  no `Math.random` in `packages/engine`.
- Playwright is pinned to the version matching the locally installed browsers; e2e runs
  against `vite preview` on port 4173 (see `packages/app/playwright.config.ts`).

## Conventions

- Engine code must not import from `app`, React, or any DOM API (enforce with an ESLint
  `no-restricted-imports` rule and a Node-environment test run).
- Prefer small pure functions; avoid classes in the UI layer, fine in the engine where they
  model hot-path state.
- Every engine feature lands with unit tests; every node type gets at least one
  deterministic golden test (program + seed → expected grid hash).
- No hot-path allocations inside `step()` (reuse buffers).
- Keep `docs/deviations.md` up to date when behaviour knowingly differs from the C# original.
- Commit messages: imperative mood, scoped (`engine: add prl node`, `app: rule painter undo`).

## Licensing

The original MarkovJunior is MIT licensed. Credit it in the README and in any example
program ported from it. Don't copy its C# code verbatim into this repo — reimplement from
understanding of the semantics.
