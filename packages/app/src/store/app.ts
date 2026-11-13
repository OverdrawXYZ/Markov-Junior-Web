import { create } from 'zustand';
import {
  programFromXml,
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

export const MIN_SIZE = 1;
export const MAX_SIZE = 1024;
export const PARSE_DEBOUNCE_MS = 300;

export interface AppState {
  /** XML source being edited. */
  source: string;
  exampleId: string | null;
  /** Last successfully parsed + validated program (what the engine is running). */
  program: Program | null;
  /** Errors in the current source (empty if it compiled). */
  issues: Issue[];
  warnings: Issue[];

  width: number;
  height: number;
  seed: number;
  speedIndex: number;
  stepSize: number;

  mode: RunMode;
  halted: boolean;
  stepCount: number;
  activeNodePath: NodePath | null;

  setSource(source: string): void;
  loadExample(id: string): void;
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
/** Characters of the loaded grid, needed to interpret frames. */
let characters = '';

export const useApp = create<AppState>()((set, get) => {
  const send: EngineClient['send'] = (msg) => engine?.send(msg);

  /** Parse + validate the current source; load it into the engine if valid. */
  const compile = (resume: boolean) => {
    const { source } = get();
    let program: Program;
    let warnings: Issue[];
    try {
      const parsed = programFromXml(source);
      const issues = withLines(validateProgram(parsed.program), parsed.lines);
      warnings = parsed.warnings;
      if (issues.length > 0) {
        set({ issues, warnings });
        return;
      }
      program = parsed.program;
    } catch (e) {
      if (!(e instanceof ProgramError)) throw e;
      set({ issues: [...e.issues], warnings: [] });
      return;
    }
    set({ program, issues: [], warnings });
    load(resume);
  };

  const load = (resume: boolean) => {
    const { program, width, height, seed } = get();
    if (!program) return;
    send({ type: 'load', program, width, height, seed });
    if (resume) send({ type: 'play' });
  };

  const isRunning = () => get().mode !== 'paused';

  return {
    source: DEFAULT_EXAMPLE.source,
    exampleId: DEFAULT_EXAMPLE.id,
    program: null,
    issues: [],
    warnings: [],
    width: DEFAULT_EXAMPLE.size,
    height: DEFAULT_EXAMPLE.size,
    seed: randomSeed(),
    speedIndex: DEFAULT_SPEED_INDEX,
    stepSize: 1,
    mode: 'paused',
    halted: false,
    stepCount: 0,
    activeNodePath: null,

    setSource(source) {
      set({ source, exampleId: null });
      if (parseTimer) clearTimeout(parseTimer);
      parseTimer = setTimeout(() => {
        parseTimer = null;
        compile(isRunning());
      }, PARSE_DEBOUNCE_MS);
    },

    loadExample(id) {
      const example = EXAMPLES.find((e) => e.id === id);
      if (!example) return;
      if (parseTimer) clearTimeout(parseTimer);
      set({ source: example.source, exampleId: id, width: example.size, height: example.size });
      compile(true);
    },

    setSize(width, height) {
      set({ width: clampSize(width), height: clampSize(height) });
      load(isRunning());
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

    play: () => send({ type: 'play' }),
    pause: () => send({ type: 'pause' }),
    togglePlay: () => (isRunning() ? get().pause() : get().play()),
    step: () => send({ type: 'step', count: get().stepSize }),
    runToEnd: () => send({ type: 'runToEnd' }),
    reset: () => send({ type: 'reset' }),
  };
});

function onEngineMessage(msg: WorkerToMain): void {
  switch (msg.type) {
    case 'loaded':
      characters = msg.characters;
      break;
    case 'error':
      useApp.setState({ issues: msg.issues, mode: 'paused' });
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
          characters,
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
  const unsubscribe = client.subscribe(onEngineMessage);
  const { speedIndex } = useApp.getState();
  client.send({ type: 'setSpeed', stepsPerFrame: SPEEDS[speedIndex]! });
  const { exampleId, source, setSource, loadExample } = useApp.getState();
  if (exampleId) loadExample(exampleId);
  else setSource(source);
  return () => {
    unsubscribe();
    client.dispose();
    if (engine === client) engine = null;
    frames.clear();
  };
}

/** Tell the engine the latest frame has been drawn. */
export function ackFrame(): void {
  engine?.send({ type: 'ack' });
}
