import { effectivePalette, useApp } from '../store/app';
import { frames } from '../store/frames';
import { download, slug } from '../util/files';
import { buildLut, paint } from './paint';

/** Integer upscale so the longest side is at least 512px, without exceeding 4096px. */
export function exportScale(width: number, height: number): number {
  const longest = Math.max(width, height);
  return Math.max(1, Math.min(Math.ceil(512 / longest), Math.floor(4096 / longest)));
}

/** Save the current grid as a crisp PNG named after the program and seed. */
export async function exportPng(): Promise<boolean> {
  const frame = frames.latest;
  if (!frame) return false;
  const { name, seed, palette } = useApp.getState();
  const s = exportScale(frame.width, frame.height);

  const src = document.createElement('canvas');
  src.width = frame.width;
  src.height = frame.height;
  const srcCtx = src.getContext('2d');
  const out = document.createElement('canvas');
  out.width = frame.width * s;
  out.height = frame.height * s;
  const ctx = out.getContext('2d');
  if (!srcCtx || !ctx) return false;

  const image = srcCtx.createImageData(frame.width, frame.height);
  paint(
    frame.state,
    buildLut(frame.characters, effectivePalette(palette)),
    new Uint32Array(image.data.buffer),
  );
  srcCtx.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  if (!blob) return false;
  download(`${slug(name)}-${seed}.png`, blob);
  return true;
}
