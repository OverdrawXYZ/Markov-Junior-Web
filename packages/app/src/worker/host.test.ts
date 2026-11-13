import { describe, expect, it } from 'vitest';
import { programFromXml, type Program } from '@mj/engine';
import { EngineHost, FRAME_MS, type Scheduler } from './host';
import type { MainToWorker, WorkerToMain } from './protocol';

/** Deterministic timers. `now()` ticks forward on every call so time budgets terminate. */
class FakeScheduler implements Scheduler {
  time = 0;
  private nextId = 1;
  private timers = new Map<number, { at: number; fn: () => void }>();

  setTimeout(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + ms, fn });
    return id;
  }
  clearTimeout(id: unknown): void {
    this.timers.delete(id as number);
  }
  now(): number {
    return (this.time += 0.01);
  }
  get pending(): number {
    return this.timers.size;
  }
  /** Run timers due within `ms`, in order. */
  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      const due = [...this.timers]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.time = Math.max(this.time, due[1].at);
      due[1].fn();
    }
    this.time = end;
  }
}

const maze: Program = programFromXml(
  '<markov values="BRGW" origin="True"><one in="RBB" out="GGR"/><one in="RGG" out="WWR"/></markov>',
).program;

function setup() {
  const scheduler = new FakeScheduler();
  const out: WorkerToMain[] = [];
  const host = new EngineHost((msg) => out.push(msg), scheduler);
  const send = (msg: MainToWorker) => host.handle(msg);
  const frames = () => out.filter((m) => m.type === 'frame');
  const last = <T extends WorkerToMain['type']>(type: T) =>
    out.filter((m): m is Extract<WorkerToMain, { type: T }> => m.type === type).at(-1);
  return { scheduler, out, send, frames, last };
}

describe('EngineHost', () => {
  it('posts loaded + an initial frame on load', () => {
    const { send, out } = setup();
    send({ type: 'load', program: maze, width: 11, height: 11, seed: 1 });
    expect(out.map((m) => m.type)).toEqual(['loaded', 'frame']);
    const frame = out[1] as Extract<WorkerToMain, { type: 'frame' }>;
    expect(frame.stepCount).toBe(0);
    const state = new Uint8Array(frame.state);
    expect(state.length).toBe(121);
    expect(state[5 + 5 * 11]).toBe(1); // origin
  });

  it('reports program errors instead of throwing', () => {
    const { send, out } = setup();
    send({
      type: 'load',
      program: { values: 'BW', root: { kind: 'one', rules: [{ in: 'X', out: 'W' }] } },
      width: 4,
      height: 4,
      seed: 1,
    });
    expect(out).toEqual([
      {
        type: 'error',
        issues: [expect.objectContaining({ message: 'input symbol X is not defined' })],
      },
    ]);
  });

  it('steps on demand and waits for an ack before the next frame', () => {
    const { send, frames, last } = setup();
    send({ type: 'load', program: maze, width: 11, height: 11, seed: 1 });
    send({ type: 'step', count: 3 });
    expect(frames()).toHaveLength(1); // still awaiting ack for the initial frame
    send({ type: 'ack' });
    expect(frames()).toHaveLength(2);
    expect(last('frame')!.stepCount).toBe(3);
    send({ type: 'ack' });
    expect(frames()).toHaveLength(2); // nothing new to send
  });

  it('plays at the configured steps per frame', () => {
    const { send, scheduler, last } = setup();
    send({ type: 'load', program: maze, width: 21, height: 21, seed: 1 });
    send({ type: 'setSpeed', stepsPerFrame: 5 });
    send({ type: 'play' });
    expect(last('status')!.mode).toBe('playing');
    scheduler.advance(0); // the first tick runs immediately
    send({ type: 'ack' });
    expect(last('frame')!.stepCount).toBe(5);
    for (let i = 0; i < 3; i++) {
      scheduler.advance(FRAME_MS);
      send({ type: 'ack' });
    }
    expect(last('frame')!.stepCount).toBe(20);
  });

  it('handles fractional speeds', () => {
    const { send, scheduler, last } = setup();
    send({ type: 'load', program: maze, width: 21, height: 21, seed: 1 });
    send({ type: 'setSpeed', stepsPerFrame: 0.25 });
    send({ type: 'play' });
    for (let i = 0; i < 8; i++) {
      scheduler.advance(FRAME_MS);
      send({ type: 'ack' });
    }
    expect(last('frame')!.stepCount).toBe(2);
  });

  it('pauses and stops its timer', () => {
    const { send, scheduler, last } = setup();
    send({ type: 'load', program: maze, width: 21, height: 21, seed: 1 });
    send({ type: 'play' });
    scheduler.advance(FRAME_MS);
    send({ type: 'pause' });
    expect(scheduler.pending).toBe(0);
    expect(last('status')!.mode).toBe('paused');
  });

  it('runs to the end, then pauses with halted set', () => {
    const { send, scheduler, last } = setup();
    send({ type: 'load', program: maze, width: 21, height: 21, seed: 1 });
    send({ type: 'runToEnd' });
    for (let i = 0; i < 100 && scheduler.pending; i++) {
      scheduler.advance(0);
      send({ type: 'ack' });
    }
    const status = last('status')!;
    expect(status).toMatchObject({ mode: 'paused', halted: true });
    // 120 forward + 120 back + 1 halting turn on an 11×11 lattice.
    expect(last('frame')!).toMatchObject({ halted: true, stepCount: 241, mode: 'paused' });
    expect(last('frame')!.activeNodePath).toEqual([1]);
  });

  it('ignores play once halted', () => {
    const { send, scheduler } = setup();
    send({ type: 'load', program: maze, width: 5, height: 5, seed: 1 });
    send({ type: 'step', count: 1000 });
    send({ type: 'play' });
    expect(scheduler.pending).toBe(0);
  });

  it('reset restores the initial grid, optionally with a new seed', () => {
    const { send, last, out } = setup();
    send({ type: 'load', program: maze, width: 21, height: 21, seed: 1 });
    send({ type: 'ack' });
    send({ type: 'step', count: 1000 });
    send({ type: 'ack' });
    const done = new Uint8Array(last('frame')!.state).join();
    send({ type: 'reset', seed: 2 });
    send({ type: 'ack' });
    expect(last('frame')!.stepCount).toBe(0);
    send({ type: 'step', count: 1000 });
    send({ type: 'ack' });
    expect(new Uint8Array(last('frame')!.state).join()).not.toBe(done);
    expect(out.some((m) => m.type === 'error')).toBe(false);
  });
});
