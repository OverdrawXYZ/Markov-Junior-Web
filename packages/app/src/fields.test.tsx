import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App';
import { useApp } from './store/app';

const xml = () => useApp.getState().source;
const tree = () => screen.getByRole('tree', { name: 'Program tree' });

beforeEach(async () => {
  useApp.setState(useApp.getInitialState(), true);
  render(<App />);
  await screen.findByRole('tree', { name: 'Program tree' });
  act(() => useApp.getState().loadExample('BiasedMazeGrowth'));
});

describe('fields in the editor', () => {
  it('shows fields on the node and explains them', () => {
    const one = within(tree()).getByRole('treeitem', { name: 'one' });
    expect(one).toHaveTextContent('1 field · t=10');
    fireEvent.click(one);
    expect(screen.getByTestId('field-summary')).toHaveTextContent(
      'W is placed towards N, measured through B.',
    );
    expect(screen.getByRole('slider', { name: 'Temperature' })).toHaveValue('10');
  });

  it('edits direction, targets and options', () => {
    fireEvent.click(within(tree()).getByRole('treeitem', { name: 'one' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Direction' }), {
      target: { value: 'from' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Target U' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Recompute every step' }));
    expect(xml()).toContain('<field for="W" from="NU" on="B" recompute="True"/>');
    expect(screen.getByTestId('field-summary')).toHaveTextContent(
      'W is placed away from N, U, measured through B (recomputed every step).',
    );
    fireEvent.change(screen.getByRole('slider', { name: 'Temperature' }), {
      target: { value: '0' },
    });
    expect(xml()).not.toContain('temperature');
  });

  it('adds and removes fields', () => {
    fireEvent.click(within(tree()).getByRole('treeitem', { name: 'one' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add field' }));
    expect(screen.getAllByTestId('field-summary')).toHaveLength(2);
    expect(useApp.getState().issues.map((i) => i.message)).toContain(
      'field for W: there is already a field for W',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove field 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove field 1' }));
    expect(xml()).not.toContain('<field');
    expect(screen.queryByRole('slider', { name: 'Temperature' })).toBeNull();
  });
});
