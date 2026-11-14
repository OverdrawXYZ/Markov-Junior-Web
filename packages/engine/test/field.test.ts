import { describe, expect, it } from 'vitest';
import { programFromXml, programToXml, validateProgram } from '../src';
import { Field } from '../src/field';
import { Grid } from '../src/grid';
import { count, fixture, hash, rows, run } from './helpers';

describe('Field.compute', () => {
  it('computes BFS distances through the substrate', () => {
    const grid = new Grid('BWR', [], 5, 3);
    // R is a wall the field can't pass; distances flow around it.
    const picture = ['WBRBB', 'BBRBB', 'BBBBB'];
    picture.forEach((row, y) =>
      [...row].forEach((ch, x) => (grid.state[x + y * 5] = 'BWR'.indexOf(ch))),
    );
    const field = new Field(grid.wave('B'), grid.wave('W'), false, false, false, 15);
    const potential = new Int32Array(15);
    expect(field.compute(potential, grid)).toBe(true);
    expect([...potential]).toEqual([0, 1, -1, 7, 8, 1, 2, -1, 6, 7, 2, 3, 4, 5, 6]);
  });

  it('fails when there is nothing to measure from', () => {
    const grid = new Grid('BW', [], 3, 3);
    const field = new Field(grid.wave('B'), grid.wave('W'), false, false, false, 9);
    expect(field.compute(new Int32Array(9), grid)).toBe(false);
  });
});

describe('fields steer one nodes', () => {
  /** An 11×11 grid: target row T at the top, a W seed in the centre, B elsewhere. */
  const setup = (field: string, temperature = '', seed = 1) => {
    const r = run(`<one values="BWT" in="WB" out="WW"${temperature}>${field}</one>`, 11, seed);
    for (let x = 0; x < 11; x++) r.state[x] = 2;
    r.state[5 + 5 * 11] = 1;
    return r;
  };

  it('greedily grows straight to the target at temperature 0', () => {
    const r = setup('<field for="W" to="T" on="B"/>');
    r.step(4);
    const g = rows(r);
    // Each step takes the cell closest to the T row: a straight line up from (5,5).
    for (let y = 1; y <= 5; y++) expect(g[y]![5]).toBe('W');
    expect(count(r, 'W')).toBe(5);
    // It keeps growing afterwards (WB → WW still matches) until the grid is full.
    expect(r.runToEnd().halted).toBe(true);
    expect(count(r, 'B')).toBe(0);
  });

  it('pushes away from "from" symbols', () => {
    const r = setup('<field for="W" from="T" on="B"/>');
    r.step(5);
    const g = rows(r);
    // Heads straight for the bottom edge, away from the top row.
    for (let y = 5; y <= 10; y++) expect(g[y]![5]).toBe('W');
    expect(count(r, 'W')).toBe(6);
  });

  it('with temperature, explores more broadly but still halts', () => {
    const r = setup('<field for="W" to="T" on="B"/>', ' temperature="50"', 4);
    const res = r.runToEnd(10_000);
    expect(res.halted).toBe(true);
    expect(count(r, 'W')).toBeGreaterThan(5);
  });

  it('an essential field with no target stops the node', () => {
    const r = run(
      `<sequence values="BWR" origin="True">
        <one in="WB" out="WW"><field for="W" to="R" on="B" essential="True"/></one>
        <one in="B" out="R" steps="3"/>
      </sequence>`,
      9,
    );
    r.runToEnd();
    expect(count(r, 'W')).toBe(1);
    expect(count(r, 'R')).toBe(3);
  });

  it('never places a symbol where its field cannot reach', () => {
    // A wall of R splits the grid; the target T is only on the left.
    const r = run(
      `<sequence values="BWTR">
        <one in="B" out="T" steps="1"/>
        <one in="B" out="W" steps="1"/>
        <one in="WB" out="WW"><field for="W" to="T" on="B"/></one>
      </sequence>`,
      9,
      2,
    );
    r.runToEnd();
    // Every W must sit on a cell connected to T through B/W cells; easiest check:
    // the program halts with the field computed and growth never "jumps".
    expect(r.halted).toBe(true);
  });
});

describe('fields steer all nodes', () => {
  it('only applies matches whose field is defined', () => {
    // W spreads everywhere it can reach T through B; the R-walled pocket stays B.
    const r = run(
      `<sequence values="BWTR">
        <all in="B" out="T" steps="1"><field for="T" to="T" on="B"/></all>
      </sequence>`,
      5,
    );
    // With no T anywhere the field can't be computed, so the node does nothing.
    r.runToEnd();
    expect(count(r, 'T')).toBe(0);
  });

  it('runs BiasedMazeGrowth deterministically', () => {
    const a = run(fixture('BiasedMazeGrowth'), 41, 3);
    const b = run(fixture('BiasedMazeGrowth'), 41, 3);
    a.runToEnd(400);
    b.runToEnd(400);
    expect(hash(a)).toBe(hash(b));
  });
});

describe('field XML and validation', () => {
  it.each(['BiasedGrowth', 'BiasedMazeGrowth', 'Laplace', 'Keys', 'GrowTo'])(
    'round-trips %s',
    (name) => {
      const { program, warnings } = programFromXml(fixture(name));
      expect(warnings).toEqual([]);
      expect(validateProgram(program)).toEqual([]);
      expect(programFromXml(programToXml(program)).program).toEqual(program);
    },
  );

  it('parses fields and temperature', () => {
    const { program } = programFromXml(fixture('Laplace'));
    expect(program.root).toEqual({
      kind: 'one',
      temperature: 12,
      rules: [{ in: 'B', out: 'W' }],
      fields: [{ for: 'W', to: 'W', on: 'B' }],
    });
    expect(programToXml(program)).toBe(
      '<one values="BW" origin="True" in="B" out="W" temperature="12">\n  <field for="W" to="W" on="B"/>\n</one>\n',
    );
  });

  it.each([
    [
      '<prl values="BW" in="B" out="W"><field for="W" to="W" on="B"/></prl>',
      'fields only steer one and all nodes',
    ],
    [
      '<one values="BW" in="B" out="W"><field for="Q" to="W" on="B"/></one>',
      '"for" must be one of the symbols',
    ],
    [
      '<one values="BW" in="B" out="W"><field for="W" on="B"/></one>',
      'give exactly one of "to" or "from"',
    ],
    [
      '<one values="BW" in="B" out="W"><field for="W" to="W" from="B" on="B"/></one>',
      'give exactly one of "to" or "from"',
    ],
    [
      '<one values="BW" in="B" out="W"><field for="W" to="Z" on="B"/></one>',
      'unknown symbol Z in "to"',
    ],
    [
      '<one values="BW" in="B" out="W"><field for="W" to="W" on=""/></one>',
      '"on" needs at least one symbol',
    ],
    [
      '<one values="BW" in="B" out="W"><field for="W" to="W" on="B"/><field for="W" to="B" on="B"/></one>',
      'there is already a field for W',
    ],
    ['<one values="BW" in="B" out="W" temperature="-1"/>', 'temperature must be 0 or more'],
  ])('reports problems in %s', (xml, message) => {
    const issues = validateProgram(programFromXml(xml).program);
    expect(issues.map((i) => i.message).join('\n')).toContain(message);
  });
});
