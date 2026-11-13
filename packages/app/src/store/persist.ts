/**
 * Saving and sharing projects: localStorage autosave, and compact share
 * links that carry the whole project in the URL hash (no server needed).
 */

export interface ProjectData {
  source: string;
  width: number;
  height: number;
  seed: number;
  /** Colour overrides, symbol → 0xRRGGBB. */
  palette?: Record<string, number>;
}

export const STORAGE_KEY = 'mj.project.v1';
export const SHARE_PARAM = 'p';

const isSize = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 1024;

/** Validate untrusted data (from storage or a URL) into a ProjectData, or null. */
export function asProject(value: unknown): ProjectData | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.source !== 'string' || v.source.length > 1_000_000) return null;
  if (!isSize(v.width) || !isSize(v.height)) return null;
  if (!Number.isInteger(v.seed) || (v.seed as number) < 0) return null;
  const project: ProjectData = {
    source: v.source,
    width: v.width as number,
    height: v.height as number,
    seed: v.seed as number,
  };
  if (v.palette && typeof v.palette === 'object') {
    const palette: Record<string, number> = {};
    for (const [k, c] of Object.entries(v.palette as Record<string, unknown>)) {
      if (
        [...k].length === 1 &&
        Number.isInteger(c) &&
        (c as number) >= 0 &&
        (c as number) <= 0xffffff
      )
        palette[k] = c as number;
    }
    if (Object.keys(palette).length > 0) project.palette = palette;
  }
  return project;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // e.g. blocked third-party storage
  }
}

export function saveProject(project: ProjectData, store: Storage | null = storage()): boolean {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(project));
    return !!store;
  } catch {
    return false; // quota exceeded or storage disabled
  }
}

export function loadProject(store: Storage | null = storage()): ProjectData | null {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    return raw ? asProject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ share links

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Errors surface through the reader below.
  void writer.write(bytes as Uint8Array<ArrayBuffer>).catch(() => {});
  void writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

const canCompress = () =>
  typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/**
 * Encode a project for a URL: `z<base64url(deflate(json))>`, or `j<base64url(json)>`
 * where compression streams are unavailable.
 */
export async function encodeShare(project: ProjectData): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(project));
  if (canCompress())
    return `z${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`;
  return `j${toBase64Url(json)}`;
}

export async function decodeShare(encoded: string): Promise<ProjectData | null> {
  try {
    const kind = encoded[0];
    let bytes = fromBase64Url(encoded.slice(1));
    if (kind === 'z') {
      if (!canCompress()) return null;
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    } else if (kind !== 'j') {
      return null;
    }
    return asProject(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/** The encoded project in a location hash like `#p=z…`, if any. */
export function shareParam(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get(SHARE_PARAM);
}

export async function shareUrl(
  project: ProjectData,
  base = `${location.origin}${location.pathname}`,
): Promise<string> {
  return `${base}#${SHARE_PARAM}=${await encodeShare(project)}`;
}
