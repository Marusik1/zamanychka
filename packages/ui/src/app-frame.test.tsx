import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppFrame } from './app-frame.js';

describe('AppFrame', () => {
  it('provides a labelled application shell and main landmark', () => {
    render(<AppFrame title="Заманушка">Основа продукта</AppFrame>);

    expect(screen.getByRole('banner')).toHaveTextContent('Заманушка');
    expect(screen.getByRole('main')).toHaveTextContent('Основа продукта');
  });
});
