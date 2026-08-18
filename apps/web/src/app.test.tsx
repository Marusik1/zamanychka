import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './app.js';

describe('EPIC-00 app shell', () => {
  it('identifies the product and foundation status without product functionality', () => {
    render(<App />);

    expect(screen.getByRole('banner')).toHaveTextContent('Заманушка');
    expect(screen.getByRole('main')).toHaveTextContent('Фундамент продукта');
    expect(screen.getByText('EPIC-00')).toBeVisible();
    expect(screen.queryByRole('button', { name: /игра/i })).not.toBeInTheDocument();
  });
});
