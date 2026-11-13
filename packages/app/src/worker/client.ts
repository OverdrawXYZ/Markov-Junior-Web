import { EngineHost } from './host';
import type { MainToWorker, WorkerToMain } from './protocol';

export interface EngineClient {
  send(msg: MainToWorker): void;
  subscribe(listener: (msg: WorkerToMain) => void): () => void;
  dispose(): void;
}

/**
 * Talk to the engine in a Web Worker. Where workers aren't available (jsdom
 * tests) the same host runs in-process, with messages delivered asynchronously.
 */
export function createEngineClient(): EngineClient {
  const listeners = new Set<(msg: WorkerToMain) => void>();
  const emit = (msg: WorkerToMain) => listeners.forEach((l) => l(msg));
  const subscribe = (listener: (msg: WorkerToMain) => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };

  if (typeof Worker !== 'undefined') {
    const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerToMain>) => emit(e.data);
    worker.onerror = (e) =>
      emit({ type: 'error', issues: [{ message: `engine worker failed: ${e.message}` }] });
    return { send: (msg) => worker.postMessage(msg), subscribe, dispose: () => worker.terminate() };
  }

  const host = new EngineHost((msg) => queueMicrotask(() => emit(msg)));
  return {
    send: (msg) => queueMicrotask(() => host.handle(msg)),
    subscribe,
    dispose: () => host.dispose(),
  };
}
