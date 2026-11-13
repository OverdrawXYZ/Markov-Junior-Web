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

Requires Node 22.

```bash
npm install
npm run dev        # start the app
npm test           # unit tests
npm run test:e2e   # browser smoke test
```

See [CLAUDE.md](./CLAUDE.md) for architecture, conventions and the roadmap.
