import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from './App';
import { useApp } from './store/app';

const xml = () => useApp.getState().source;

beforeEach(async () => {
  useApp.setState(useApp.getInitialState(), true);
  render(<App />);
  await screen.findByRole('tree', { name: 'Program tree' });
  act(() => useApp.getState().loadExample('MazeBacktracker'));
});

const tree = () => screen.getByRole('tree', { name: 'Program tree' });
const item = (name: string | RegExp) => within(tree()).getByRole('treeitem', { name });

describe('node tree', () => {
  it('selects nodes and rules, showing them in the inspector', () => {
    fireEvent.click(within(tree()).getAllByRole('treeitem', { name: 'one' })[1]!);
    expect(screen.getByRole('combobox', { name: 'Node kind' })).toHaveValue('one');
    fireEvent.click(item('rule RGG to WWR'));
    expect(screen.getByRole('grid', { name: 'Input pattern' })).toBeInTheDocument();
    expect(screen.getByText('Rule 1')).toBeInTheDocument();
  });

  it('adds a node after the selection from the toolbar', () => {
    fireEvent.click(within(tree()).getAllByRole('treeitem', { name: 'one' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Add all node' }));
    expect(xml()).toBe(`<markov values="BRGW" origin="True">
  <one in="RBB" out="GGR"/>
  <all in="B" out="R"/>
  <one in="RGG" out="WWR"/>
</markov>
`);
    expect(screen.getByRole('combobox', { name: 'Node kind' })).toHaveValue('all');
  });

  it('moves and deletes with the keyboard, and undo restores', () => {
    const original = xml();
    fireEvent.click(within(tree()).getAllByRole('treeitem', { name: 'one' })[1]!);
    fireEvent.keyDown(tree(), { key: 'ArrowUp', altKey: true });
    expect(xml()).toMatch(/RGG[\s\S]*RBB/);
    fireEvent.keyDown(tree(), { key: 'Delete' });
    expect(xml()).not.toContain('RGG');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(xml()).toBe(original);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(xml()).toMatch(/RGG[\s\S]*RBB/);
  });

  it('navigates rows with arrow keys', () => {
    fireEvent.click(item('markov'));
    fireEvent.keyDown(tree(), { key: 'ArrowDown' });
    fireEvent.keyDown(tree(), { key: 'ArrowDown' });
    expect(useApp.getState().selection).toEqual({ path: [0], rule: 0 });
  });
});

describe('inspector', () => {
  beforeEach(() => fireEvent.click(within(tree()).getAllByRole('treeitem', { name: 'one' })[0]!));

  it('edits kind, comment, steps and symmetry', () => {
    fireEvent.change(screen.getByRole('combobox', { name: 'Node kind' }), {
      target: { value: 'prl' },
    });
    fireEvent.change(screen.getByPlaceholderText('What does this step do?'), {
      target: { value: 'carve' },
    });
    const steps = screen.getByRole('spinbutton', { name: 'Max steps' });
    fireEvent.change(steps, { target: { value: '7' } });
    fireEvent.blur(steps);
    fireEvent.change(screen.getByRole('combobox', { name: 'Node symmetry' }), {
      target: { value: '(x)' },
    });
    expect(xml()).toContain('<prl in="RBB" out="GGR" steps="7" symmetry="(x)" comment="carve"/>');
  });

  it('wraps a node and manages rules', () => {
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }));
    expect(xml()).toContain('<rule in="B" out="R"/>');
    fireEvent.click(screen.getByRole('button', { name: 'Move rule 2 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete rule 2' }));
    expect(xml()).toContain('<one in="B" out="R"/>');
    fireEvent.click(screen.getByRole('button', { name: 'Wrap in sequence' }));
    expect(xml()).toContain('<sequence>\n    <one in="B" out="R"/>\n  </sequence>');
  });
});

describe('rule editor', () => {
  beforeEach(() => fireEvent.click(item('rule RBB to GGR')));

  it('paints cells with the chosen brush', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Brush W' }));
    fireEvent.click(screen.getByRole('gridcell', { name: 'input 2,0: B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Brush * (any / unchanged)' }));
    fireEvent.click(screen.getByRole('gridcell', { name: 'output 0,0: G' }));
    expect(xml()).toContain('<one in="RBW" out="*GR"/>');
  });

  it('resizes both patterns and previews symmetry variants', () => {
    expect(
      within(screen.getByRole('list', { name: 'Symmetry variants' })).getAllByRole('listitem'),
    ).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Taller' }));
    expect(xml()).toContain('<one in="RBB/***" out="GGR/***"/>');
    fireEvent.change(
      screen.getAllByRole('combobox').find((c) => c.closest('section[aria-label="Rule editor"]'))!,
      {
        target: { value: '()' },
      },
    );
    expect(
      within(screen.getByRole('list', { name: 'Symmetry variants' })).getAllByRole('listitem'),
    ).toHaveLength(1);
    expect(xml()).toContain('symmetry="()"');
  });

  it('copies the input into the output', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy input → output' }));
    expect(xml()).toContain('<one in="RBB" out="RBB"/>');
  });
});

describe('symbols', () => {
  it('adds, renames and removes symbols; removal is blocked while in use', () => {
    fireEvent.click(screen.getByRole('button', { name: '+ Add symbol' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Y' }));
    expect(useApp.getState().program?.values).toBe('BRGWY');
    expect(screen.getByRole('button', { name: 'Remove B' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Y' }));
    expect(useApp.getState().program?.values).toBe('BRGW');

    fireEvent.click(screen.getByRole('button', { name: 'G' }));
    const input = screen.getByRole('textbox', { name: 'Rename G' });
    fireEvent.change(input, { target: { value: 'K' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(xml()).toContain('<one in="RBB" out="KKR"/>');
  });

  it('toggles origin and edits unions', () => {
    fireEvent.click(screen.getByRole('checkbox', { name: /Seed the centre/ }));
    expect(xml()).not.toContain('origin');
    fireEvent.click(screen.getByRole('button', { name: '+ Add union' }));
    expect(xml()).toContain('<union symbol="?" values="BR"/>');
    fireEvent.click(screen.getByRole('button', { name: '? matches W' }));
    expect(xml()).toContain('<union symbol="?" values="BRW"/>');
  });

  it('overrides colours without touching the program', () => {
    const before = xml();
    fireEvent.change(screen.getByLabelText('Colour of R'), { target: { value: '#123456' } });
    expect(useApp.getState().palette).toEqual({ R: 0x123456 });
    expect(xml()).toBe(before);
  });
});

describe('two-way sync', () => {
  it('updates the tree from XML and the XML from the tree', async () => {
    fireEvent.click(screen.getByRole('tab', { name: /XML/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Program XML' }), {
      target: { value: '<sequence values="BW"><all in="B" out="W"/></sequence>' },
    });
    await waitFor(() => expect(item('all')).toBeInTheDocument());
    fireEvent.click(item('all'));
    fireEvent.click(screen.getByRole('button', { name: 'Add one node' }));
    expect(screen.getByRole('tab', { name: 'Inspector' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('textbox', { name: 'Program XML' })).toHaveValue(
      '<sequence values="BW">\n  <all in="B" out="W"/>\n  <one in="B" out="W"/>\n</sequence>\n',
    );
  });
});
