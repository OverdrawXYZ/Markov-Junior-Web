import { describe, expect, it } from 'vitest';
import { createRun, parseSum, programFromXml, programToXml, validateProgram } from '../src';
import { count, fixture, hash, rows, run } from './helpers';

/** Set cells from rows of characters (a test-only shortcut). */
function paint(r: ReturnType<typeof run>, picture: string[]): void {
  picture.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      r.state[x + y * r.width] = r.characters.indexOf(ch);
    }),
  );
}

const life = `<convolution values="DA" neighborhood="Moore" periodic="True">
  <rule in="D" out="A" sum="3" values="A"/>
  <rule in="A" out="D" sum="0,1,4..8" values="A"/>
</convolution>`;

describe('parseSum', () => {
  it('parses numbers, ranges and lists', () => {
    const t = parseSum('0,1,4..6');
    expect(typeof t !== 'string' && t.flatMap((v, i) => (v ? [i] : []))).toEqual([0, 1, 4, 5, 6]);
  });

  it.each(['', 'x', '3..1', '1..30', '1.5', '2,,3'])('rejects %j', (s) => {
    expect(typeof parseSum(s)).toBe('string');
  });
});

describe('convolution node', () => {
  it('runs the Game of Life: a blinker oscillates', () => {
    const r = run(life, 5);
    paint(r, ['DDDDD', 'DDDDD', 'DAAAD', 'DDDDD', 'DDDDD']);
    r.step();
    expect(rows(r)).toEqual(['DDDDD', 'DDADD', 'DDADD', 'DDADD', 'DDDDD']);
    r.step();
    expect(rows(r)).toEqual(['DDDDD', 'DDDDD', 'DAAAD', 'DDDDD', 'DDDDD']);
  });

  it('halts when nothing changes (a still life)', () => {
    const r = run(life, 6);
    paint(r, ['DDDDDD', 'DDDDDD', 'DDAADD', 'DDAADD', 'DDDDDD', 'DDDDDD']);
    const res = r.runToEnd(100);
    expect(res.halted).toBe(true);
    expect(res.stepCount).toBe(1);
    expect(count(r, 'A')).toBe(4);
  });

  it.each([
    ['VonNeumann', 5],
    ['Moore', 9],
  ])('counts the %s neighbourhood', (neighborhood, cells) => {
    const r = run(
      `<convolution values="DA" origin="True" neighborhood="${neighborhood}" steps="1"><rule in="D" out="A" values="A" sum="1..8"/></convolution>`,
      7,
    );
    r.runToEnd();
    expect(count(r, 'A')).toBe(cells);
  });

  it('wraps around edges when periodic', () => {
    const grow = (periodic: boolean) => {
      const r = run(
        `<convolution values="DA" neighborhood="Moore" steps="1"${periodic ? ' periodic="True"' : ''}><rule in="D" out="A" values="A" sum="1..8"/></convolution>`,
        6,
      );
      r.state[0] = 1; // top-left corner
      r.runToEnd();
      return count(r, 'A');
    };
    expect(grow(false)).toBe(4);
    expect(grow(true)).toBe(9);
  });

  it('applies unconditional rules to every matching cell at once', () => {
    const r = run('<convolution values="BW" neighborhood="Moore" in="B" out="W"/>', 10);
    expect(r.step().stepCount).toBe(1);
    expect(count(r, 'W')).toBe(100);
    expect(r.runToEnd().halted).toBe(true);
  });

  it('respects p and steps', () => {
    const r = run(
      '<convolution values="BW" neighborhood="Moore" in="B" out="W" p="0.25" steps="1"/>',
      64,
    );
    r.runToEnd();
    const fraction = count(r, 'W') / 4096;
    expect(fraction).toBeGreaterThan(0.2);
    expect(fraction).toBeLessThan(0.3);
  });

  it('logs its changes so later rule nodes see them', () => {
    // After the convolution paints everything W, the one node must find W cells to turn R.
    const r = run(
      `<sequence values="BWR">
        <one in="B" out="B" steps="1"/>
        <convolution neighborhood="Moore" in="B" out="W" steps="1"/>
        <one in="W" out="R" steps="5"/>
      </sequence>`,
      8,
    );
    r.runToEnd();
    expect(count(r, 'R')).toBe(5);
  });

  it('Cave: smoothing leaves a stable cave map', () => {
    const r = run(fixture('Cave'), 60, 3);
    const res = r.runToEnd(10_000);
    expect(res.halted).toBe(true);
    expect(count(r, 'A')).toBeGreaterThan(0);
    expect(count(r, 'D')).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const a = run(fixture('GameOfLife'), 40, 9);
    const b = run(fixture('GameOfLife'), 40, 9);
    a.step(50);
    b.step(50);
    expect(hash(a)).toBe(hash(b));
  });
});

describe('convolution XML and validation', () => {
  it.each(['GameOfLife', 'Cave'])('round-trips %s', (name) => {
    const { program, warnings } = programFromXml(fixture(name));
    expect(warnings).toEqual([]);
    expect(programFromXml(programToXml(program)).program).toEqual(program);
  });

  it('parses node and rule attributes', () => {
    const { program } = programFromXml(fixture('GameOfLife'));
    expect(program.root).toMatchObject({
      kind: 'sequence',
      children: [
        { kind: 'prl' },
        {
          kind: 'convolution',
          neighborhood: 'Moore',
          periodic: true,
          rules: [
            { in: 'D', out: 'A', sum: '3', values: 'A' },
            { in: 'A', out: 'D', sum: '0,1,4..8', values: 'A' },
          ],
        },
      ],
    });
  });

  it('keeps a counting rule on a root convolution unambiguous', () => {
    const { program } = programFromXml(
      '<convolution values="DA" neighborhood="Moore"><rule in="D" out="A" values="A" sum="3"/></convolution>',
    );
    const xml = programToXml(program);
    expect(xml).toContain('<rule in="D" out="A" values="A" sum="3"/>');
    expect(programFromXml(xml).program).toEqual(program);
  });

  it('treats steps="-1" as unlimited', () => {
    const { program } = programFromXml(
      '<convolution values="BW" neighborhood="Moore" in="B" out="W" steps="-1"/>',
    );
    expect(program.root).not.toHaveProperty('steps');
  });

  it.each([
    ['<convolution values="BW" neighborhood="Hex" in="B" out="W"/>', 'unknown neighborhood "Hex"'],
    [
      '<convolution values="BW" neighborhood="Moore"><rule in="B" out="W" values="W"/></convolution>',
      'values and sum must be given together',
    ],
    [
      '<convolution values="BW" neighborhood="Moore"><rule in="B" out="W" values="W" sum="9..1"/></convolution>',
      'invalid range 9..1',
    ],
    [
      '<convolution values="BW" neighborhood="Moore" in="BB" out="W"/>',
      'input must be a single symbol',
    ],
    [
      '<convolution values="BW" neighborhood="Moore" in="B" out="Q"/>',
      'output symbol Q is not a value',
    ],
    [
      '<convolution values="BW" neighborhood="Moore"><rule in="B" out="W" values="Z" sum="1"/></convolution>',
      'counted symbol Z is not a value',
    ],
  ])('reports problems in %s', (xml, message) => {
    const issues = validateProgram(programFromXml(xml).program);
    expect(issues.map((i) => i.message).join('\n')).toContain(message);
  });

  it('createRun rejects an invalid convolution', () => {
    const { program } = programFromXml(
      '<convolution values="BW" neighborhood="Moore" in="B" out="Q"/>',
    );
    expect(() => createRun(program, { width: 4, height: 4, seed: 1 })).toThrow('output symbol Q');
  });
});
