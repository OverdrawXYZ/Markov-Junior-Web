import { describe, expect, it } from 'vitest';
import { createRun, programFromXml, programToXml, validateProgram, type Progress } from '../src';
import { count, fixture, rows, run } from './helpers';

function paint(r: ReturnType<typeof run>, picture: string[]): void {
  picture.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      r.state[x + y * r.width] = r.characters.indexOf(ch);
    }),
  );
}

// A pusher R moves a box W; the box must end on the target I.
const sokoban = (kind: 'one' | 'all', extra = '') => `<sequence values="BRWI">
  <${kind} search="True" depthCoefficient="1.0"${extra}>
    <rule in="RB" out="BR"/>
    <rule in="RWB" out="BRW"/>
    <observe value="I" from="B" to="W"/>
    <observe value="B" to="BR"/>
    <observe value="W" to="BR"/>
    <observe value="R" to="BR"/>
  </${kind}>
</sequence>`;

describe('observe (steering towards a goal)', () => {
  it('walks straight to the observed goal and stops there', () => {
    // R walks, leaving W; the G cell must end up as R. Every cell needs a goal:
    // background may become trail, and the start must become trail.
    const r = run(
      `<one values="BRWG" in="RB" out="WR">
        <observe value="G" from="B" to="R"/>
        <observe value="B" to="BW"/>
        <observe value="R" to="W"/>
      </one>`,
      [7, 5],
    );
    paint(r, ['BBBBBBB', 'BBBBBBB', 'RBBBBBG', 'BBBBBBB', 'BBBBBBB']);
    r.runToEnd(100);
    expect(rows(r)[2]).toBe('WWWWWWR');
    expect(count(r, 'W')).toBe(6);
  });

  it('does nothing when an observed symbol is missing', () => {
    const r = run(
      `<sequence values="BRWG">
        <one in="RB" out="WR"><observe value="G" from="B" to="R"/></one>
        <one in="B" out="W" steps="2"/>
      </sequence>`,
      5,
    );
    r.runToEnd(100);
    expect(count(r, 'W')).toBe(2);
  });

  it.each(['DiagonalPath', 'BishopParity'])('runs %s', (name) => {
    const r = run(fixture(name), 40, 2);
    expect(r.runToEnd(20_000).halted).toBe(true);
  });
});

describe('search', () => {
  it.each(['one', 'all'] as const)('plans and replays a solution (%s)', (kind) => {
    const progress: Progress[] = [];
    const r = createRun(programFromXml(sokoban(kind)).program, {
      width: 6,
      height: 3,
      seed: 1,
      onProgress: (p) => progress.push(p),
    });
    paint(r as unknown as ReturnType<typeof run>, ['BBBBBB', 'RWBBIB', 'BBBBBB']);
    const res = r.runToEnd(100);
    expect(res.halted).toBe(true);
    // Two pushes to the right put the box on the target (I itself became B).
    expect(rows(r as unknown as ReturnType<typeof run>)).toEqual(['BBBBBB', 'BBBRWB', 'BBBBBB']);
    expect(progress.at(-1)).toMatchObject({ kind: 'search', done: true, found: 3 });
  });

  it('falls back to ordinary matching when no trajectory is found', () => {
    // The box is walled in: no solution within the limit.
    const r = createRun(programFromXml(sokoban('one', ' limit="50"')).program, {
      width: 6,
      height: 1,
      seed: 1,
    });
    paint(r as unknown as ReturnType<typeof run>, ['IBBWRB']);
    expect(() => r.runToEnd(100)).not.toThrow();
  });

  it('solves SequentialSokoban', () => {
    const r = run(fixture('SequentialSokoban'), 20, 1);
    expect(r.runToEnd(5_000).halted).toBe(true);
  });
});

describe('observe XML and validation', () => {
  it.each(['DiagonalPath', 'BishopParity', 'SequentialSokoban'])('round-trips %s', (name) => {
    const { program, warnings } = programFromXml(fixture(name));
    expect(warnings).toEqual([]);
    expect(validateProgram(program)).toEqual([]);
    expect(programFromXml(programToXml(program)).program).toEqual(program);
  });

  it('parses observe and search settings', () => {
    const { program } = programFromXml(sokoban('all', ' limit="500"'));
    expect(program.root).toMatchObject({
      children: [
        {
          kind: 'all',
          search: true,
          limit: 500,
          depthCoefficient: 1,
          observations: [
            { value: 'I', from: 'B', to: 'W' },
            { value: 'B', to: 'BR' },
            { value: 'W', to: 'BR' },
            { value: 'R', to: 'BR' },
          ],
        },
      ],
    });
  });

  it.each([
    [
      '<prl values="BW" in="B" out="W"><observe value="W" to="B"/></prl>',
      'observe only works in one and all nodes',
    ],
    [
      '<one values="BW" in="B" out="W" search="True"/>',
      'search settings need at least one <observe>',
    ],
    [
      '<one values="BW" in="B" out="W"><observe value="Q" to="B"/></one>',
      '"value" must be one of the symbols',
    ],
    [
      '<one values="BW" in="B" out="W"><observe value="W" from="Q" to="B"/></one>',
      '"from" must be one of the symbols',
    ],
    [
      '<one values="BW" in="B" out="W"><observe value="W" to="Z"/></one>',
      'unknown symbol Z in "to"',
    ],
    [
      '<one values="BW" in="B" out="W"><observe value="W" to="B"/><observe value="W" to="W"/></one>',
      'W is already observed',
    ],
  ])('reports problems in %s', (xml, message) => {
    const issues = validateProgram(programFromXml(xml).program);
    expect(issues.map((i) => i.message).join('\n')).toContain(message);
  });
});
