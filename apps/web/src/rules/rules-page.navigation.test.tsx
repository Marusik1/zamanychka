import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RulesPage } from './rules-page.js';

describe('RulesPage navigation', () => {
  it('lets the user return from the standalone rules screen', () => {
    const onBack = vi.fn();
    render(<RulesPage onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
