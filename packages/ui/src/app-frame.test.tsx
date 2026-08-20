import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppFrame, DesktopAppShell } from './index.js';

describe('DesktopAppShell', () => {
  it('provides a labelled generic shell with banner and main landmarks', () => {
    const view = render(<DesktopAppShell title="Заманушка">Основа продукта</DesktopAppShell>);

    expect(within(view.container).getByRole('banner')).toHaveTextContent('Заманушка');
    expect(within(view.container).getByRole('main')).toHaveTextContent('Основа продукта');
  });
});

describe('AppFrame compatibility alias', () => {
  it('stays available from the main ui package for existing consumers', () => {
    const view = render(<AppFrame title="Заманушка">Совместимость</AppFrame>);

    expect(within(view.container).getByRole('banner')).toHaveTextContent('Заманушка');
    expect(within(view.container).getByRole('main')).toHaveTextContent('Совместимость');
  });
});
