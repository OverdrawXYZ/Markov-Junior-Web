# Markov-Junior-Web

Web implementation of the [MarkovJunior](https://github.com/mxgmn/MarkovJunior) probabilistic
programming language, with a visual editor for building rules and previewing results.

MarkovJunior was created by Maxim Gumin and is MIT licensed. This project reimplements it in
TypeScript for the browser.

## Features

- Runs MarkovJunior programs (`one`, `all`, `prl`, `markov`, `sequence`, unions, symmetry)
  in a Web Worker, with a live, pixel-perfect preview.
- Visual editor: drag-and-drop program tree, rule painter with a symmetry preview, symbol
  palette — kept in sync with an XML view of the same program.
- Undo/redo, examples gallery, autosave, open/save `.xml`, shareable links (the program lives
  in the URL), PNG export, keyboard shortcuts (press `?`).

## Getting started

Requires **Node 22.22.2 or newer** (or Node 24.15+). Check with `node -v`; with nvm, run
`nvm install` in the repo (it reads `.nvmrc`). Older versions give "unsupported engine"
warnings during `npm install` and the tests may fail.

```bash
npm install
npm run dev        # start the app
npm test           # unit tests
npm run test:e2e   # browser smoke test
```

See [CLAUDE.md](./CLAUDE.md) for architecture, conventions and the roadmap.
