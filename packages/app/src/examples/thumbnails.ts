import { colorOf, createRun, programFromXml } from '@mj/engine';
import type { Example } from './index';

/** Cap for programs that never halt (e.g. Snake). */
const MAX_STEPS = 20_000;
export const THUMBNAIL_SEED = 1;

const cache = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function render(example: Example): string | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { program } = programFromXml(example.source);
  const run = createRun(program, {
    width: example.size,
    height: example.size,
    seed: THUMBNAIL_SEED,
  });
  const { stepCount } = run.runToEnd(MAX_STEPS);
  // Programs that end as one solid colour (e.g. Growth) are more telling mid-way.
  if (run.state.every((v) => v === run.state[0])) {
    run.reset();
    run.step(Math.max(1, Math.floor(stepCount / 3)));
  }
  canvas.width = run.width;
  canvas.height = run.height;
  const image = ctx.createImageData(run.width, run.height);
  const colors = [...run.characters].map((c) => colorOf(c));
  for (let i = 0; i < run.state.length; i++) {
    const rgb = colors[run.state[i]!]!;
    image.data[i * 4] = rgb >> 16;
    image.data[i * 4 + 1] = (rgb >> 8) & 0xff;
    image.data[i * 4 + 2] = rgb & 0xff;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

/**
 * A finished run of the example as a data URL (null where canvas isn't
 * available). Rendered on demand, one at a time, and cached.
 */
export function thumbnail(example: Example): Promise<string | null> {
  let result = cache.get(example.id);
  if (!result) {
    result = queue.then(yieldToBrowser).then(() => {
      try {
        return render(example);
      } catch {
        return null;
      }
    });
    queue = result;
    cache.set(example.id, result);
  }
  return result;
}
