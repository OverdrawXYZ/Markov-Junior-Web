import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRun, programFromXml, type Program, type Run } from '../src';

export function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}.xml`, import.meta.url)), 'utf8');
}

export function load(xml: string): Program {
  return programFromXml(xml).program;
}

export function run(xml: string, size: number | [number, number], seed = 1): Run {
  const [width, height] = typeof size === 'number' ? [size, size] : size;
  return createRun(load(xml), { width, height, seed });
}

/** Grid as rows of symbol characters, top row first. */
export function rows(r: Run): string[] {
  const out: string[] = [];
  for (let y = 0; y < r.height; y++) {
    let line = '';
    for (let x = 0; x < r.width; x++) line += r.characters[r.state[x + y * r.width]!];
    out.push(line);
  }
  return out;
}

export function count(r: Run, symbol: string): number {
  const v = r.characters.indexOf(symbol);
  return r.state.reduce((n, s) => n + (s === v ? 1 : 0), 0);
}

/** FNV-1a hash of the grid state, as 8 hex digits. */
export function hash(r: Run): string {
  let h = 0x811c9dc5;
  for (const v of r.state) {
    h ^= v;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Does a 1D horizontal or vertical run of `pattern` occur anywhere (either direction)? */
export function containsLine(r: Run, pattern: string): boolean {
  const g = rows(r);
  const cols = Array.from({ length: r.width }, (_, x) => g.map((row) => row[x]).join(''));
  const rev = [...pattern].reverse().join('');
  return [...g, ...cols].some((line) => line.includes(pattern) || line.includes(rev));
}
