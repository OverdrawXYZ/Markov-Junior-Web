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
  act(() => useApp.getState().loadExample('SequentialSokoban'));
});

const searchNode = () => within(tree()).getAllByRole('treeitem', { name: 'one' })[3]!;

describe('goals in the editor', () => {
  it('shows goals and search on the node and explains them', () => {
    expect(searchNode()).toHaveTextContent('4 goals · search');
    fireEvent.click(searchNode());
    const summaries = screen.getAllByTestId('goal-summary').map((e) => e.textContent);
    expect(summaries).toEqual([
      'B cells must end as B, R.',
      'R cells must end as B, R.',
      'W cells must end as B, R.',
      'G cells become D now and must end as A.',
    ]);
    expect(
      screen.getByRole('checkbox', { name: 'Plan the whole route first (search)' }),
    ).toBeChecked();
  });

  it('edits goals and search settings', () => {
    fireEvent.click(searchNode());
    const goal = screen.getByRole('listitem', { name: 'Goal 4' });
    fireEvent.click(within(goal).getByRole('button', { name: 'Goal I' }));
    expect(xml()).toContain('<observe value="G" from="D" to="IA"/>');
    const limit = screen.getByRole('spinbutton', { name: 'State limit' });
    fireEvent.change(limit, { target: { value: '500' } });
    fireEvent.blur(limit);
    expect(xml()).toContain('<one search="True" limit="500">');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Plan the whole route first (search)' }));
    expect(screen.queryByRole('spinbutton', { name: 'State limit' })).toBeNull();
  });

  it('adds and removes goals', () => {
    fireEvent.click(searchNode());
    fireEvent.click(screen.getByRole('button', { name: '+ Add goal' }));
    expect(screen.getAllByTestId('goal-summary')).toHaveLength(5);
    for (let i = 5; i >= 1; i--)
      fireEvent.click(screen.getByRole('button', { name: `Remove goal ${i}` }));
    expect(xml()).not.toContain('<observe');
    expect(xml()).not.toContain('search=');
  });
});
