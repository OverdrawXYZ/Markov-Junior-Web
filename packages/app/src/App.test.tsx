import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the shell panels', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'MarkovJunior Web' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Program tree' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Preview' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo', { name: 'Transport' })).toBeInTheDocument();
  });
});
