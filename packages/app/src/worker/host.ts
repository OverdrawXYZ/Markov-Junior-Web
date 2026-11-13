import { createRun, ProgramError, type NodePath, type Program, type Run } from '@mj/engine';
import type { MainToWorker, RunMode, Status, WorkerToMain } from './protocol';

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export const realScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => performance.now(),
};

export type Post = (msg: WorkerToMain, transfer?: Transferable[]) => void;

/** Interval between playback ticks (one display frame). */
export const FRAME_MS = 1000 / 60;
/** Time budget per tick at "max" speed, leaving headroom within a frame. */
export const MAX_SPEED_BUDGET_MS = 12;
/** Time budget per slice when running to the end (yields between slices for messages). */
export const RUN_TO_END_SLICE_MS = 40;
const CHUNK = 32;

/**
 * Owns a Run and drives it in response to messages. Lives in the worker, but
 * has no worker-specific code so it can be tested (and used in-process).
 *
 * Frames are back-pressured: after posting a frame the host waits for an
 * `ack` before posting another, so the main thread is never flooded and
 * always draws the newest state.
 */
export class EngineHost {
  private run: Run | null = null;
  private mode: RunMode = 'paused';
  private speed = 1;
  private carry = 0;
  private timer: unknown = null;
  private dirty = false;
  private awaitingAck = false;
  private activeNodePath: NodePath | null = null;

  constructor(
    private readonly post: Post,
    private readonly scheduler: Scheduler = realScheduler,
  ) {}

  handle(msg: MainToWorker): void {
    switch (msg.type) {
      case 'load':
        this.load(msg.program, msg.width, msg.height, msg.seed);
        break;
      case 'play':
        this.setMode('playing');
        break;
      case 'runToEnd':
        this.setMode('toEnd');
        break;
      case 'pause':
        this.setMode('paused');
        break;
      case 'step':
        if (!this.run) return;
        this.setMode('paused');
        this.advance(msg.count);
        this.flush();
        break;
      case 'reset':
        if (!this.run) return;
        this.setMode('paused');
        this.run.reset(msg.seed);
        this.activeNodePath = null;
        this.dirty = true;
        this.postStatus();
        this.flush();
        break;
      case 'setSpeed':
        this.speed = msg.stepsPerFrame;
        this.carry = 0;
        break;
      case 'ack':
        this.awaitingAck = false;
        this.flush();
        break;
    }
  }

  dispose(): void {
    this.stopTimer();
    this.run = null;
  }

  private load(program: Program, width: number, height: number, seed: number): void {
    this.setMode('paused');
    try {
      this.run = createRun(program, { width, height, seed });
    } catch (e) {
      this.run = null;
      const issues = e instanceof ProgramError ? [...e.issues] : [{ message: String(e) }];
      this.post({ type: 'error', issues });
      return;
    }
    this.activeNodePath = null;
    this.carry = 0;
    this.post({ type: 'loaded', width, height, characters: this.run.characters });
    this.dirty = true;
    this.awaitingAck = false;
    this.flush();
  }

  private setMode(mode: RunMode): void {
    if (mode !== 'paused' && (!this.run || this.run.halted)) mode = 'paused';
    const changed = mode !== this.mode;
    this.mode = mode;
    this.carry = 0;
    if (mode === 'paused') this.stopTimer();
    else if (this.timer === null) this.timer = this.scheduler.setTimeout(this.tick, 0);
    if (changed) this.postStatus();
  }

  private stopTimer(): void {
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    this.timer = null;
  }

  private advance(n: number): void {
    const res = this.run!.step(n);
    if (res.activeNodePath) this.activeNodePath = res.activeNodePath;
    this.dirty = true;
  }

  private readonly tick = (): void => {
    this.timer = null;
    const run = this.run;
    if (!run || this.mode === 'paused') return;

    if (this.mode === 'toEnd' || this.speed === Infinity) {
      const budget = this.mode === 'toEnd' ? RUN_TO_END_SLICE_MS : MAX_SPEED_BUDGET_MS;
      const start = this.scheduler.now();
      do this.advance(CHUNK);
      while (!run.halted && this.scheduler.now() - start < budget);
    } else {
      this.carry += this.speed;
      const n = Math.floor(this.carry);
      this.carry -= n;
      if (n > 0) this.advance(n);
    }

    if (run.halted) {
      this.setMode('paused');
      this.flush();
      return;
    }
    this.flush();
    this.timer = this.scheduler.setTimeout(this.tick, this.mode === 'toEnd' ? 0 : FRAME_MS);
  };

  private status(): Status {
    return {
      mode: this.mode,
      halted: this.run?.halted ?? false,
      stepCount: this.run?.stepCount ?? 0,
      activeNodePath: this.activeNodePath,
    };
  }

  private postStatus(): void {
    this.post({ type: 'status', ...this.status() });
  }

  /** Post a frame if there is something new and the main thread is ready for it. */
  private flush(): void {
    if (!this.run || !this.dirty || this.awaitingAck) return;
    const state = this.run.state.slice().buffer;
    this.post(
      { type: 'frame', width: this.run.width, height: this.run.height, state, ...this.status() },
      [state],
    );
    this.dirty = false;
    this.awaitingAck = true;
  }
}
