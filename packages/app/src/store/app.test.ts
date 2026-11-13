import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { programToXml } from '@mj/engine';
import { addNode, removeNode, setCell, updateRule } from '../editor/ops';
import { PARSE_DEBOUNCE_MS, useApp } from './app';

const state = () => useApp.getState();

beforeEach(() => {
  vi.useFakeTimers();
  useApp.setState(useApp.getInitialState(), true);
  state().loadExample('MazeBacktracker');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('editing the program', () => {
  it('starts from the example with empty history', () => {
    expect(state().program?.values).toBe('BRGW');
    expect(state().issues).toEqual([]);
  });

  it('regenerates the XML from visual edits', () => {
    state().edit((p) => updateRule(p, [0], 0, { in: 'RBW' }));
    expect(state().source).toBe(programToXml(state().program!));
    expect(state().source).toContain('<one in="RBW" out="GGR"/>');
    expect(state().exampleId).toBeNull();
  });

  it('records validation issues with paths and lines', () => {
    state().edit((p) => updateRule(p, [1], 0, { out: 'WWX' }));
    expect(state().issues).toEqual([
      { message: 'output symbol X is not a value', path: [1], rule: 0, line: 3 },
    ]);
  });

  it('parses XML typing after a debounce, without reformatting it', () => {
    const text = '<one   values="BW"  in="B" out="W"/>';
    state().setSource(text);
    expect(state().program?.values).toBe('BRGW');
    vi.advanceTimersByTime(PARSE_DEBOUNCE_MS);
    expect(state().program?.values).toBe('BW');
    expect(state().source).toBe(text);
  });

  it('keeps the last program while the XML does not parse', () => {
    state().setSource('<markov values="BW">');
    vi.advanceTimersByTime(PARSE_DEBOUNCE_MS);
    expect(state().parseErrors[0]!.message).toContain('unclosed tag <markov>');
    expect(state().program?.values).toBe('BRGW');
  });

  it('applies pending XML typing before a visual edit', () => {
    state().setSource('<markov values="BW"><one in="B" out="W"/></markov>');
    state().edit((p) => addNode(p, [], { kind: 'all', rules: [{ in: 'W', out: 'B' }] }).program);
    expect(state().source).toBe(
      '<markov values="BW">\n  <one in="B" out="W"/>\n  <all in="W" out="B"/>\n</markov>\n',
    );
  });
});

describe('undo / redo', () => {
  it('restores program, XML and selection', () => {
    const original = state().source;
    state().select({ path: [1], rule: 0 });
    state().edit((p) => removeNode(p, [1]));
    expect(state().selection).toBeNull();
    state().undo();
    expect(state().source).toBe(original);
    expect(state().selection).toEqual({ path: [1], rule: 0 });
    state().redo();
    expect(state().program).toMatchObject({ root: { children: [{ kind: 'one' }] } });
    expect(state().future).toEqual([]);
  });

  it('coalesces a paint stroke into one step', () => {
    const original = state().source;
    state().edit((p) => updateRule(p, [0], 0, { in: setCell('RBB', 1, 0, 'W') }), {
      coalesce: 'stroke-1',
    });
    state().edit((p) => updateRule(p, [0], 0, { in: setCell('RWB', 2, 0, 'W') }), {
      coalesce: 'stroke-1',
    });
    expect(state().source).toContain('in="RWW"');
    state().undo();
    expect(state().source).toBe(original);
  });

  it('does not record no-op edits', () => {
    const depth = state().past.length;
    state().edit((p) => p);
    expect(state().past.length).toBe(depth);
  });

  it('a new edit clears the redo stack', () => {
    state().edit((p) => updateRule(p, [0], 0, { in: 'RBW' }));
    state().undo();
    expect(state().future).toHaveLength(1);
    state().edit((p) => updateRule(p, [0], 0, { in: 'RWB' }));
    expect(state().future).toEqual([]);
  });
});

describe('selection and palette', () => {
  it('drops selections that no longer exist', () => {
    state().select({ path: [5] });
    expect(state().selection).toBeNull();
    state().select({ path: [0], rule: 3 });
    expect(state().selection).toEqual({ path: [0] });
  });

  it('stores colour overrides', () => {
    state().setPaletteColor('R', 0x123456);
    expect(state().palette).toEqual({ R: 0x123456 });
    state().setPaletteColor('R', null);
    expect(state().palette).toEqual({});
  });
});
