import type { Issue, NodePath, Program } from '@mj/engine';

/** Steps per animation frame. `Infinity` = as many as fit in a frame's time budget. */
export const SPEEDS = [
  0.1,
  0.25,
  0.5,
  1,
  2,
  5,
  10,
  25,
  50,
  100,
  250,
  1000,
  5000,
  Infinity,
] as const;
export const DEFAULT_SPEED_INDEX = SPEEDS.indexOf(25);

export function speedLabel(speed: number): string {
  if (speed === Infinity) return 'max';
  if (speed < 1) return `1 step / ${Math.round(1 / speed)} frames`;
  return `${speed} step${speed === 1 ? '' : 's'} / frame`;
}

export type MainToWorker =
  | { type: 'load'; program: Program; width: number; height: number; seed: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step'; count: number }
  | { type: 'runToEnd' }
  | { type: 'reset'; seed?: number }
  | { type: 'setSpeed'; stepsPerFrame: number }
  /** The main thread has drawn the last frame and can take another. */
  | { type: 'ack' };

export type RunMode = 'paused' | 'playing' | 'toEnd';

export interface Status {
  mode: RunMode;
  halted: boolean;
  stepCount: number;
  activeNodePath: NodePath | null;
}

export type WorkerToMain =
  | { type: 'loaded'; width: number; height: number; characters: string }
  /** Sent while a long search runs (the worker can't take messages until it ends). */
  | { type: 'progress'; visited: number; done: boolean; found?: number }
  | { type: 'error'; issues: Issue[] }
  | ({ type: 'status' } & Status)
  | ({
      type: 'frame';
      width: number;
      height: number;
      /** Symbols of the grid shown (a map node can switch to a new alphabet mid-run). */
      characters: string;
      /** Copy of the grid state (transferred). */
      state: ArrayBuffer;
    } & Status);
