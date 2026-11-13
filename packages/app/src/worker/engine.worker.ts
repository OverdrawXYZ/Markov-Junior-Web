/// <reference lib="webworker" />
import { EngineHost } from './host';
import type { MainToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const host = new EngineHost((msg, transfer) => self.postMessage(msg, transfer ?? []));
self.onmessage = (e: MessageEvent<MainToWorker>) => host.handle(e.data);
