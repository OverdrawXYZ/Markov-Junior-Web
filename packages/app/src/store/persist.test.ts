import { describe, expect, it } from 'vitest';
import {
  asProject,
  decodeShare,
  encodeShare,
  loadProject,
  saveProject,
  shareParam,
  shareUrl,
  STORAGE_KEY,
  type ProjectData,
} from './persist';

const project: ProjectData = {
  source:
    '<markov values="BRGW" origin="True">\n  <one in="RBB" out="GGR"/>\n  <one in="RGG" out="WWR"/>\n</markov>\n',
  width: 59,
  height: 41,
  seed: 1234,
  palette: { R: 0x123456 },
};

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('asProject', () => {
  it('accepts valid projects and drops bad palette entries', () => {
    expect(asProject({ ...project, palette: { R: 5, XX: 1, G: -1, B: 'x' } })).toEqual({
      ...project,
      palette: { R: 5 },
    });
  });

  it.each([
    null,
    'x',
    { ...project, source: 3 },
    { ...project, width: 0 },
    { ...project, height: 2000 },
    { ...project, width: 1.5 },
    { ...project, seed: -1 },
  ])('rejects %j', (value) => {
    expect(asProject(value)).toBeNull();
  });
});

describe('local storage', () => {
  it('round-trips a project', () => {
    const store = new MemoryStorage();
    expect(saveProject(project, store)).toBe(true);
    expect(loadProject(store)).toEqual(project);
  });

  it('ignores corrupt data and failing storage', () => {
    const store = new MemoryStorage();
    store.setItem(STORAGE_KEY, '{not json');
    expect(loadProject(store)).toBeNull();
    const failing = new MemoryStorage();
    failing.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(saveProject(project, failing)).toBe(false);
    expect(loadProject(null)).toBeNull();
  });
});

describe('share links', () => {
  it('round-trips through a compressed, URL-safe encoding', async () => {
    const encoded = await encodeShare(project);
    expect(encoded).toMatch(/^z[A-Za-z0-9_-]+$/);
    // Shorter than the uncompressed fallback (base64 of the JSON).
    expect(encoded.length).toBeLessThan((JSON.stringify(project).length * 4) / 3);
    expect(await decodeShare(encoded)).toEqual(project);
  });

  it('decodes the uncompressed fallback', async () => {
    const json = btoa(JSON.stringify(project))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await decodeShare(`j${json}`)).toEqual(project);
  });

  it('survives large programs with non-ASCII comments', async () => {
    const big = {
      ...project,
      source: `<one values="BW" in="B" out="W" comment="✓ ${'é'.repeat(50_000)}"/>`,
    };
    expect(await decodeShare(await encodeShare(big))).toEqual(big);
  });

  it.each(['', 'q123', 'z!!!', 'zAAAA', 'jbm90IGpzb24'])('rejects %j', async (bad) => {
    expect(await decodeShare(bad)).toBeNull();
  });

  it('builds and reads #p= links', async () => {
    const url = await shareUrl(project, 'https://example.test/app/');
    expect(url.startsWith('https://example.test/app/#p=z')).toBe(true);
    const param = shareParam(new URL(url).hash)!;
    expect(await decodeShare(param)).toEqual(project);
    expect(shareParam('#other=1')).toBeNull();
  });
});
