import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GameDie } from './dice.js';

describe('GameDie', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
    [6, 6],
  ] as const)('renders %i visible pips for face %i', (value, expectedPips) => {
    const { container } = render(<GameDie value={value} label={`face ${value}`} />);

    expect(screen.getByRole('img', { name: `face ${value}` })).toBeInTheDocument();
    expect(container.querySelectorAll('.game-die__pip.is-on')).toHaveLength(expectedPips);
  });
  it('keeps the committed face while exposing a presentation-only rolling hook', () => {
    const { container } = render(<GameDie value={4} label="rolling four" rolling />);

    expect(screen.getByRole('img', { name: 'rolling four' })).toHaveAttribute(
      'data-die-value',
      '4',
    );
    expect(screen.getByRole('img', { name: 'rolling four' })).toHaveClass('game-die--rolling');
    expect(container.querySelector('.premium-die-3d')).toHaveClass('game-die--rolling');
    expect(container.querySelectorAll('.game-die__pip.is-on')).toHaveLength(4);
  });

  it('renders the premium die shell for the exact-reference action panel', () => {
    const { container } = render(<GameDie value={6} label="premium six" />);

    expect(screen.getByRole('img', { name: 'premium six' })).toHaveClass('premium-die');
    expect(container.querySelector('.premium-die-3d')).not.toBeNull();
    expect(container.querySelector('.premium-die')).not.toBeNull();
  });
});
