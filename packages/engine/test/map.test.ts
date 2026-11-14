import { describe, expect, it } from 'vitest';
import { alphabetAt, programFromXml, programToXml, ProgramError, validateProgram } from '../src';
import { count, fixture, rows, run } from './helpers';

const twoStage = `<sequence values="BW">
  <one in="B" out="W" steps="1"/>
  <map scale="2 2 1" values="RG">
    <rule in="W" out="RR/RR"/>
    <rule in="B" out="GG/GG"/>
    <all in="R" out="G"/>
  </map>
</sequence>`;

describe('map node', () => {
  it('replaces the grid with a rescaled one in a new alphabet', () => {
    const r = run(twoStage, [4, 3]);
    r.step(); // one W
    expect([r.width, r.height, r.characters]).toEqual([4, 3, 'BW']);
    r.step(); // the map
    expect([r.width, r.height, r.characters]).toEqual([8, 6, 'RG']);
    expect(count(r, 'R')).toBe(4);
    expect(count(r, 'G')).toBe(44);
    // Its children then run on the new grid.
    expect(r.runToEnd().halted).toBe(true);
    expect(count(r, 'G')).toBe(48);
  });

  it('places each output at the scaled position of its match', () => {
    const r = run(
      `<sequence values="BW">
        <map scale="2 2 1" values="DA">
          <rule in="W" out="AA/AA"/>
        </map>
      </sequence>`,
      [3, 1],
    );
    r.state[1] = 1; // B W B
    r.runToEnd();
    expect(rows(r)).toEqual(['DDAADD', 'DDAADD']);
  });

  it('wraps outputs larger than the scale around the new grid', () => {
    const r = run(
      `<sequence values="BW">
        <map scale="1 1 1" values="DA">
          <rule in="W" out="AAA"/>
        </map>
      </sequence>`,
      [4, 1],
    );
    r.state[3] = 1; // last cell
    r.runToEnd();
    expect(rows(r)).toEqual(['AADA']);
  });

  it('supports fractional scales', () => {
    const r = run(
      `<sequence values="BW">
        <map scale="1/2 1/2 1" values="DA"><rule in="B" out="A"/></map>
      </sequence>`,
      [8, 6],
    );
    r.runToEnd();
    expect([r.width, r.height]).toEqual([4, 3]);
    expect(count(r, 'A')).toBe(12);
  });

  it('halts the program when its children finish (as in MarkovJunior)', () => {
    const r = run(
      `<sequence values="BW">
        <map scale="1 1 1" values="RG"><rule in="B" out="R"/></map>
        <one in="B" out="W"/>
      </sequence>`,
      4,
    );
    r.runToEnd();
    expect(r.characters).toBe('RG');
    expect(count(r, 'R')).toBe(16);
  });

  it('reset returns to the original grid', () => {
    const r = run(twoStage, [4, 3]);
    r.runToEnd();
    r.reset();
    expect([r.width, r.height, r.characters]).toEqual([4, 3, 'BW']);
    r.runToEnd();
    expect([r.width, r.height, r.characters]).toEqual([8, 6, 'RG']);
  });

  it.each([
    ['MarchingSquares', 20, 60],
    ['MazeMap', 30, 60],
    ['OddScale', 8, 16],
  ] as const)('runs %s', (name, size, scaled) => {
    const r = run(fixture(name), size, 3);
    expect(r.runToEnd(10_000).halted).toBe(true);
    expect(r.width).toBe(scaled);
  });

  it('rejects a scale that makes an empty grid', () => {
    expect(() =>
      run(
        '<sequence values="BW"><map scale="1/8 1 1" values="DA"><rule in="B" out="A"/></map></sequence>',
        4,
      ),
    ).toThrow(ProgramError);
  });
});

describe('map alphabets, XML and validation', () => {
  it('scopes alphabets and unions to the map', () => {
    const { program } = programFromXml(`<sequence values="BW">
  <union symbol="?" values="BW"/>
  <map scale="2 2 1" values="DAE">
    <union symbol="!" values="AE"/>
    <rule in="?" out="DA/AE"/>
    <all in="!D" out="*A"/>
  </map>
</sequence>`);
    expect(program.unions).toEqual([{ symbol: '?', values: 'BW' }]);
    expect(program.root).toMatchObject({
      children: [{ kind: 'map', unions: [{ symbol: '!', values: 'AE' }] }],
    });
    expect(alphabetAt(program, [0]).values).toBe('BW');
    expect(alphabetAt(program, [0, 0]).values).toBe('DAE');
    expect(validateProgram(program)).toEqual([]);
    expect(programFromXml(programToXml(program)).program).toEqual(program);
  });

  it.each(['MarchingSquares', 'MazeMap', 'OddScale'])('round-trips %s', (name) => {
    const { program, warnings } = programFromXml(fixture(name));
    expect(warnings).toEqual([]);
    expect(validateProgram(program)).toEqual([]);
    expect(programFromXml(programToXml(program)).program).toEqual(program);
  });

  it.each([
    [
      '<sequence values="BW"><map scale="2 2" values="DA"/></sequence>',
      'scale must be three factors',
    ],
    ['<sequence values="BW"><map scale="2 2 2" values="DA"/></sequence>', 'the z scale must be 1'],
    [
      '<sequence values="BW"><map scale="2 2 1" values="DA"><rule in="X" out="A"/></map></sequence>',
      'input symbol X is not defined outside the map',
    ],
    [
      '<sequence values="BW"><map scale="2 2 1" values="DA"><rule in="B" out="W"/></map></sequence>',
      "output symbol W is not one of the map's values",
    ],
    [
      '<sequence values="BW"><map scale="2 2 1" values="DA"><one in="B" out="A"/></map></sequence>',
      'input symbol B is not defined',
    ],
    ['<sequence values="BW"><map scale="2 2 1" values="DD"/></sequence>', 'repeating value D'],
  ])('reports problems in %s', (xml, message) => {
    const issues = validateProgram(programFromXml(xml).program);
    expect(issues.map((i) => i.message).join('\n')).toContain(message);
  });

  it('refuses a map as the top-level node', () => {
    expect(() => programFromXml('<map values="BW" scale="2 2 1"/>')).toThrow(
      "can't be the top-level node",
    );
  });
});
