import { describe, expect, it } from 'vitest';
import { programFromXml, programToXml, validateProgram } from '../src';
import { count, fixture, rows, run } from './helpers';

function paint(r: ReturnType<typeof run>, picture: string[]): void {
  picture.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      r.state[x + y * r.width] = r.characters.indexOf(ch);
    }),
  );
}

describe('path node', () => {
  it('draws one shortest path per step, between (not over) start and goal', () => {
    const r = run('<path values="DRUW" from="R" to="U" on="D" color="W"/>', [7, 3]);
    paint(r, ['RDDDDDU', 'RDDDDDU', 'RDDDDDU']);
    r.step();
    const g = rows(r);
    const row = g.findIndex((line) => line.includes('W'));
    expect(g[row]).toBe('RWWWWWU');
    expect(count(r, 'W')).toBe(5);
    // Keeps drawing while start cells can still reach a goal through D.
    expect(r.runToEnd().halted).toBe(true);
    expect(rows(r)).toEqual(['RWWWWWU', 'RWWWWWU', 'RWWWWWU']);
  });

  it('stops when no start can reach a goal, letting the next node run', () => {
    const r = run(
      `<sequence values="DRUWB">
        <path from="R" to="U" on="D" color="W"/>
        <all in="D" out="B"/>
      </sequence>`,
      [5, 1],
    );
    paint(r, ['RDWDU']); // a W wall in the way
    r.runToEnd();
    expect(rows(r)).toEqual(['RBWBU']);
  });

  it('starts from the farthest start with longest', () => {
    // R on both sides of U: 3 cells to the left one, 5 to the right one.
    const draw = (longest: boolean) => {
      const r = run(
        `<path values="DRUW" from="R" to="U" on="D" color="W"${longest ? ' longest="True"' : ''}/>`,
        [9, 1],
      );
      paint(r, ['RDDUDDDDR']);
      r.step();
      return rows(r)[0];
    };
    expect(draw(false)).toBe('RWWUDDDDR');
    expect(draw(true)).toBe('RDDUWWWWR');
  });

  it('takes diagonal steps with edges', () => {
    const r = run('<path values="DRUW" from="R" to="U" on="D" color="W" edges="True"/>', 5);
    paint(r, ['RDDDD', 'DDDDD', 'DDDDD', 'DDDDD', 'DDDDU']);
    r.step();
    expect(count(r, 'W')).toBe(3);
    expect(rows(r).map((l, y) => l[y])).toEqual(['R', 'W', 'W', 'W', 'U']);
  });

  it('defaults the colour to the first start symbol', () => {
    const r = run('<path values="DRU" from="R" to="U" on="D"/>', [4, 1]);
    paint(r, ['RDDU']);
    r.step();
    expect(rows(r)).toEqual(['RRRU']);
  });

  it.each(['Percolation', 'ConnectedCaves'])('runs %s to completion', (name) => {
    const r = run(fixture(name), 40, 2);
    expect(r.runToEnd(50_000).halted).toBe(true);
  });
});

describe('path XML and validation', () => {
  it.each(['Percolation', 'ConnectedCaves'])('round-trips %s', (name) => {
    const { program, warnings } = programFromXml(fixture(name));
    expect(warnings).toEqual([]);
    expect(validateProgram(program)).toEqual([]);
    expect(programFromXml(programToXml(program)).program).toEqual(program);
  });

  it('parses all attributes', () => {
    const { program } = programFromXml(
      '<path values="DRUW" from="R" to="U" on="D W" color="W" inertia="True" longest="True" edges="True" comment="road"/>',
    );
    expect(program.root).toEqual({
      kind: 'path',
      from: 'R',
      to: 'U',
      on: 'DW',
      color: 'W',
      inertia: true,
      longest: true,
      edges: true,
      comment: 'road',
    });
    expect(programFromXml(programToXml(program)).program).toEqual(program);
  });

  it.each([
    ['<path values="DRU" to="U" on="D"/>', 'needs a from attribute'],
    ['<path values="DRU" from="R" to="X" on="D"/>', 'unknown symbol X in "to"'],
    ['<path values="DRU" from="R" to="U" on="D" color="Q"/>', 'color must be one of the symbols'],
  ])('reports problems in %s', (xml, message) => {
    let text: string;
    try {
      text = validateProgram(programFromXml(xml).program)
        .map((i) => i.message)
        .join('\n');
    } catch (e) {
      text = String(e);
    }
    expect(text).toContain(message);
  });
});
