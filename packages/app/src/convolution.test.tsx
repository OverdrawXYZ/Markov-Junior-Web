import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App';
import { useApp } from './store/app';

const xml = () => useApp.getState().source;

beforeEach(async () => {
  useApp.setState(useApp.getInitialState(), true);
  render(<App />);
  await screen.findByRole('tree', { name: 'Program tree' });
  act(() => useApp.getState().loadExample('GameOfLife'));
});

const tree = () => screen.getByRole('tree', { name: 'Program tree' });

describe('convolution in the editor', () => {
  it('shows convolution rules with their condition in the tree', () => {
    const node = within(tree()).getByRole('treeitem', { name: 'convolution' });
    expect(node).toHaveTextContent('8 neighbours · wraps');
    // Distinct from the prl node's plain "rule D to A".
    expect(
      within(tree()).getByRole('treeitem', { name: 'rule D to A when 3 A' }),
    ).toHaveTextContent('= 3');
    expect(within(tree()).getByRole('treeitem', { name: 'rule D to A' })).toBeInTheDocument();
  });

  it('edits neighbourhood and wrapping', () => {
    fireEvent.click(within(tree()).getByRole('treeitem', { name: 'convolution' }));
    expect(screen.queryByRole('combobox', { name: 'Node symmetry' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Neighbourhood' }), {
      target: { value: 'VonNeumann' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Wrap around/ }));
    expect(xml()).toContain('<convolution neighborhood="VonNeumann">');
  });

  it('edits a rule through a plain-language editor', () => {
    fireEvent.click(within(tree()).getByRole('treeitem', { name: 'rule D to A when 3 A' }));
    const summary = screen.getByTestId('rule-summary');
    expect(summary).toHaveTextContent('Each D cell becomes A when 3 of its 8 neighbours are A.');

    const totals = screen.getByRole('textbox', { name: 'Neighbour totals' });
    fireEvent.change(totals, { target: { value: '3..' } });
    expect(screen.getByText(/invalid sum/)).toBeInTheDocument();
    expect(xml()).toContain('sum="3"');
    fireEvent.change(totals, { target: { value: '2..3' } });
    expect(xml()).toContain('<rule in="D" out="A" values="A" sum="2..3"/>');
    expect(summary).toHaveTextContent('when 2–3 of its 8 neighbours are A.');

    fireEvent.click(screen.getByRole('radio', { name: 'Output D' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only depending on its neighbours' }));
    expect(xml()).toContain('<rule in="D" out="D"/>');
    expect(summary).toHaveTextContent('Every D cell becomes D.');
  });

  it('can be added from the toolbar', () => {
    fireEvent.click(within(tree()).getByRole('treeitem', { name: 'sequence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add convolution node' }));
    expect(xml()).toContain(
      '<convolution neighborhood="Moore" in="D" out="A" values="A" sum="1..8"/>',
    );
    expect(useApp.getState().issues).toEqual([]);
  });
});
