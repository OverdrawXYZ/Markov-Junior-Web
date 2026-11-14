import { create } from 'zustand';
import {
  DEFAULT_PALETTE,
  nodeAt,
  programFromXml,
  programToXml,
  ProgramError,
  validateProgram,
  withLines,
  type Issue,
  type NodePath,
  type Program,
} from '@mj/engine';
import { DEFAULT_EXAMPLE, EXAMPLES } from '../examples';
import { createEngineClient, type EngineClient } from '../worker/client';
import { DEFAULT_SPEED_INDEX, SPEEDS, type RunMode, type WorkerToMain } from '../worker/protocol';
import { frames } from './frames';
import type { ProjectData } from './persist';

export const MIN_SIZE = 1;
export const MAX_SIZE = 1024;
export const PARSE_DEBOUNCE_MS = 300;
export const LOAD_DEBOUNCE_MS = 120;
/** Consecutive edits with the same coalesce key within this window form one undo step. */
export const COALESCE_MS = 1000;
export const HISTORY_LIMIT = 200;

export interface Selection {
  path: NodePath;
  /** Index of the selected rule within a rule node. */
  rule?: number;
}

interface Snapshot {
  program: Program;
  source: string;
  selection: Selection | null;
}

export interface EditOptions {
  /** Edits sharing a key in quick succession are undone together (e.g. one paint stroke). */
  coalesce?: string;
  /** Selection after the edit (default: unchanged, or cleared if it no longer exists). */
  select?: Selection | null;
}

export type Tab = 'inspector' | 'xml';
export type Zoom = 'fit' | number;
export type Dialog = 'gallery' | 'share' | 'shortcuts' | null;

/** An edit may also say what should be selected afterwards. */
export type EditResult = Program | { program: Program; selection: Selection | null };

export interface AppState {
  /** XML text. Mirrors `program`, except while the user is typing invalid XML. */
  source: string;
  /** The program being edited — the single source of truth. May have validation issues. */
  program: Program | null;
  exampleId: string | null;
  /** Used for file names when exporting. */
  name: string;
  /** XML that could not be turned into a program (syntax or structure). */
  parseErrors: Issue[];
  /** Validation issues of `program`, with paths and source lines. */
  issues: Issue[];
  warnings: Issue[];
  selection: Selection | null;
  past: Snapshot[];
  future: Snapshot[];
  /** User colour overrides per symbol (not stored in the XML). */
  palette: Record<string, number>;
  tab: Tab;
  /** Canvas zoom: 'fit' or a scale factor. */
  zoom: Zoom;
  /** The scale 'fit' currently resolves to (reported by the canvas). */
  fitScale: number;
  dialog: Dialog;

  width: number;
  height: number;
  seed: number;
  speedIndex: number;
  stepSize: number;

  mode: RunMode;
  /** Progress of a running search, while one is running. */
  search: { visited: number } | null;
  halted: boolean;
  stepCount: number;
  activeNodePath: NodePath | null;

  // editing
  setSource(source: string): void;
  edit(fn: (program: Program) => EditResult, options?: EditOptions): void;
  undo(): void;
  redo(): void;
  select(selection: Selection | null): void;
  setTab(tab: Tab): void;
  setZoom(zoom: Zoom): void;
  setDialog(dialog: Dialog): void;
  setPaletteColor(symbol: string, rgb: number | null): void;
  loadExample(id: string): void;
  /**
   * Replace the program with new XML right away (no debounce). `record: false`
   * starts a fresh history, e.g. when restoring a session.
   */
  openSource(source: string, options?: { name?: string; record?: boolean }): void;
  /** Restore a saved or shared project (program, size, seed, colours). */
  openProject(project: ProjectData, options?: { name?: string; record?: boolean }): void;

  // running
  setSize(width: number, height: number): void;
  setSeed(seed: number): void;
  randomizeSeed(): void;
  setSpeedIndex(index: number): void;
  setStepSize(n: number): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  step(): void;
  runToEnd(): void;
  reset(): void;
}

const clampSize = (n: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n) || MIN_SIZE));
export const randomSeed = () => Math.floor(Math.random() * 1_000_000);

let engine: EngineClient | null = null;
let parseTimer: ReturnType<typeof setTimeout> | null = null;
let loadTimer: ReturnType<typeof setTimeout> | null = null;
let lastEdit = { key: '', at: 0 };
/** Program last sent to the engine, to skip redundant reloads. */
let loaded: { program: Program; width: number; height: number } | null = null;
/** Set when the user pauses or steps; edits then don't restart playback. */
let userPaused = false;

/** Validation issues with source lines (the source is parsed for its line map). */
function check(program: Program, source: string): Issue[] {
  const issues = validateProgram(program);
  if (issues.length === 0) return issues;
  try {
    return withLines(issues, programFromXml(source).lines);
  } catch {
    return issues;
  }
}

/** Keep a selection only if it still points at something. */
function validSelection(program: Program, selection: Selection | null): Selection | null {
  if (!selection) return null;
  const node = nodeAt(program.root, selection.path);
  if (!node) return null;
  if (selection.rule === undefined) return selection;
  return 'rules' in node && node.rules[selection.rule] ? selection : { path: selection.path };
}

export function effectivePalette(overrides: Record<string, number>): Record<string, number> {
  return { ...DEFAULT_PALETTE, ...overrides };
}

export const useApp = create<AppState>()((set, get) => {
  const send: EngineClient['send'] = (msg) => engine?.send(msg);

  /** Send the current program to the engine (debounced) if it is valid. */
  const scheduleLoad = (immediate = false) => {
    if (loadTimer) clearTimeout(loadTimer);
    loadTimer = null;
    const run = () => {
      loadTimer = null;
      const { program, issues, width, height, seed } = get();
      if (!program || issues.length > 0) return;
      if (
        loaded &&
        loaded.program === program &&
        loaded.width === width &&
        loaded.height === height
      )
        return;
      loaded = { program, width, height };
      send({ type: 'load', program, width, height, seed });
      if (!userPaused) send({ type: 'play' });
    };
    if (immediate) run();
    else loadTimer = setTimeout(run, LOAD_DEBOUNCE_MS);
  };

  /** Make `program` current, recording the previous state for undo. */
  const commit = (
    program: Program,
    source: string,
    options: EditOptions & { immediate?: boolean } = {},
  ) => {
    const s = get();
    const now = Date.now();
    const coalesce =
      options.coalesce !== undefined &&
      options.coalesce === lastEdit.key &&
      now - lastEdit.at < COALESCE_MS;
    lastEdit = { key: options.coalesce ?? '', at: now };
    const past =
      s.program && !coalesce
        ? [...s.past, { program: s.program, source: s.source, selection: s.selection }].slice(
            -HISTORY_LIMIT,
          )
        : s.past;
    const selection = validSelection(
      program,
      options.select !== undefined ? options.select : s.selection,
    );
    set({
      program,
      source,
      parseErrors: [],
      issues: check(program, source),
      selection,
      past,
      future: [],
    });
    scheduleLoad(options.immediate);
  };

  const restore = (snap: Snapshot) => {
    lastEdit = { key: '', at: 0 };
    set({
      program: snap.program,
      source: snap.source,
      parseErrors: [],
      issues: check(snap.program, snap.source),
      selection: validSelection(snap.program, snap.selection),
    });
    scheduleLoad(true);
  };

  /** Parse the XML text; on success it becomes the program. */
  const parseSource = (options: EditOptions & { immediate?: boolean } = {}) => {
    const { source } = get();
    try {
      const parsed = programFromXml(source);
      set({ warnings: parsed.warnings });
      commit(parsed.program, source, options);
    } catch (e) {
      if (!(e instanceof ProgramError)) throw e;
      set({ parseErrors: [...e.issues], warnings: [] });
    }
  };

  const snapshot = (): Snapshot => {
    const { program, source, selection } = get();
    return { program: program!, source, selection };
  };

  return {
    source: DEFAULT_EXAMPLE.source,
    program: null,
    exampleId: DEFAULT_EXAMPLE.id,
    name: DEFAULT_EXAMPLE.name,
    parseErrors: [],
    issues: [],
    warnings: [],
    selection: null,
    past: [],
    future: [],
    palette: {},
    tab: 'inspector',
    zoom: 'fit',
    fitScale: 1,
    dialog: null,
    width: DEFAULT_EXAMPLE.size,
    height: DEFAULT_EXAMPLE.size,
    seed: randomSeed(),
    speedIndex: DEFAULT_SPEED_INDEX,
    stepSize: 1,
    mode: 'paused',
    search: null,
    halted: false,
    stepCount: 0,
    activeNodePath: null,

    setSource(source) {
      set({ source, exampleId: null });
      if (parseTimer) clearTimeout(parseTimer);
      parseTimer = setTimeout(() => {
        parseTimer = null;
        // A burst of typing forms one undo step.
        parseSource({ coalesce: 'xml' });
      }, PARSE_DEBOUNCE_MS);
    },

    edit(fn, options = {}) {
      const { program } = get();
      if (!program) return;
      if (parseTimer) {
        // Flush pending XML typing first so it isn't lost or applied afterwards.
        clearTimeout(parseTimer);
        parseTimer = null;
        parseSource({ coalesce: 'xml' });
      }
      const current = get().program!;
      const result = fn(current);
      const next = 'root' in result ? result : result.program;
      const opts = 'root' in result ? options : { ...options, select: result.selection };
      if (next === current) {
        if (opts.select !== undefined) get().select(opts.select);
        return;
      }
      set({ exampleId: null, warnings: [] });
      commit(next, programToXml(next), opts);
    },

    undo() {
      const { past, future, program } = get();
      const prev = past[past.length - 1];
      if (!prev || !program) return;
      set({ past: past.slice(0, -1), future: [snapshot(), ...future] });
      restore(prev);
    },

    redo() {
      const { past, future, program } = get();
      const next = future[0];
      if (!next || !program) return;
      set({ past: [...past, snapshot()], future: future.slice(1) });
      restore(next);
    },

    select(selection) {
      const { program } = get();
      set({ selection: program ? validSelection(program, selection) : null });
    },

    setTab: (tab) => set({ tab }),
    setZoom: (zoom) => set({ zoom }),
    setDialog: (dialog) => set({ dialog }),

    setPaletteColor(symbol, rgb) {
      const palette = { ...get().palette };
      if (rgb === null) delete palette[symbol];
      else palette[symbol] = rgb;
      set({ palette });
    },

    loadExample(id) {
      const example = EXAMPLES.find((e) => e.id === id);
      if (!example) return;
      set({ width: example.size, height: example.size });
      get().openSource(example.source, { name: example.name });
      set({ exampleId: id });
    },

    openSource(source, { name, record = true } = {}) {
      if (parseTimer) clearTimeout(parseTimer);
      parseTimer = null;
      userPaused = false;
      const example = EXAMPLES.find((e) => e.source === source);
      set({ source, exampleId: example?.id ?? null, name: name ?? example?.name ?? 'Untitled' });
      parseSource({ select: null, immediate: true });
      if (!record) set({ past: [], future: [] });
    },

    openProject(project, options = {}) {
      set({
        width: project.width,
        height: project.height,
        seed: project.seed,
        palette: project.palette ?? {},
      });
      get().openSource(project.source, options);
    },

    setSize(width, height) {
      set({ width: clampSize(width), height: clampSize(height) });
      scheduleLoad(true);
    },

    setSeed(seed) {
      set({ seed });
      send({ type: 'reset', seed });
    },

    randomizeSeed() {
      get().setSeed(randomSeed());
    },

    setSpeedIndex(index) {
      const i = Math.min(SPEEDS.length - 1, Math.max(0, index));
      set({ speedIndex: i });
      send({ type: 'setSpeed', stepsPerFrame: SPEEDS[i]! });
    },

    setStepSize(n) {
      set({ stepSize: Math.max(1, Math.round(n) || 1) });
    },

    play() {
      userPaused = false;
      send({ type: 'play' });
    },
    pause() {
      userPaused = true;
      if (get().search && engine) {
        // A search blocks the worker; the only way to stop it is a fresh one.
        engine.restart();
        set({ search: null, mode: 'paused' });
        engine.send({ type: 'setSpeed', stepsPerFrame: SPEEDS[get().speedIndex]! });
        loaded = null;
        scheduleLoad(true);
        return;
      }
      send({ type: 'pause' });
    },
    togglePlay: () => (get().mode !== 'paused' ? get().pause() : get().play()),
    step() {
      userPaused = true;
      send({ type: 'step', count: get().stepSize });
    },
    runToEnd() {
      userPaused = false;
      send({ type: 'runToEnd' });
    },
    reset: () => send({ type: 'reset' }),
  };
});

function onEngineMessage(msg: WorkerToMain): void {
  switch (msg.type) {
    case 'loaded':
      useApp.setState({ search: null });
      break;
    case 'error':
      useApp.setState({ issues: msg.issues, mode: 'paused' });
      break;
    case 'progress':
      useApp.setState({ search: msg.done ? null : { visited: msg.visited } });
      break;
    case 'status':
    case 'frame': {
      const { mode, halted, stepCount, activeNodePath } = msg;
      const prev = useApp.getState().activeNodePath;
      const samePath = prev?.join() === activeNodePath?.join();
      useApp.setState({ mode, halted, stepCount, ...(!samePath && { activeNodePath }) });
      if (msg.type === 'frame') {
        frames.publish({
          width: msg.width,
          height: msg.height,
          characters: msg.characters,
          state: new Uint8Array(msg.state),
        });
      }
      break;
    }
  }
}

/** Start the engine and load the initial program. Returns a cleanup function. */
export function startEngine(client: EngineClient = createEngineClient()): () => void {
  engine = client;
  loaded = null;
  userPaused = false;
  const unsubscribe = client.subscribe(onEngineMessage);
  const { speedIndex } = useApp.getState();
  client.send({ type: 'setSpeed', stepsPerFrame: SPEEDS[speedIndex]! });
  const { source, program, openSource } = useApp.getState();
  if (program) scheduleInitialLoad();
  else openSource(source, { record: false });
  return () => {
    unsubscribe();
    client.dispose();
    if (engine === client) engine = null;
    frames.clear();
  };
}

/** The current project, as saved and shared. */
export function currentProject(): ProjectData {
  const { source, width, height, seed, palette } = useApp.getState();
  return { source, width, height, seed, ...(Object.keys(palette).length > 0 && { palette }) };
}

/** Re-send the current program after the engine restarts (e.g. React StrictMode remount). */
function scheduleInitialLoad(): void {
  const { program, issues, width, height, seed } = useApp.getState();
  if (!program || issues.length > 0 || !engine) return;
  loaded = { program, width, height };
  engine.send({ type: 'load', program, width, height, seed });
  engine.send({ type: 'play' });
}

/** Tell the engine the latest frame has been drawn. */
export function ackFrame(): void {
  engine?.send({ type: 'ack' });
}
