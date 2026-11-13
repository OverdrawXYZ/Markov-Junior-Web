/**
 * Latest grid frame from the engine. Kept outside React state on purpose:
 * frames arrive at display rate and only the canvas needs them, so it
 * subscribes directly instead of re-rendering the component tree.
 */
export interface Frame {
  width: number;
  height: number;
  characters: string;
  state: Uint8Array;
}

type Listener = (frame: Frame) => void;

let latest: Frame | null = null;
const listeners = new Set<Listener>();

export const frames = {
  get latest(): Frame | null {
    return latest;
  },
  publish(frame: Frame): void {
    latest = frame;
    listeners.forEach((l) => l(frame));
  },
  clear(): void {
    latest = null;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};
