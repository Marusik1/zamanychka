import { render, screen } from '@testing-library/react';
import type { ComponentPropsWithoutRef } from 'react';
import { describe, expect, it } from 'vitest';

import type { DesktopAppShellProps } from '../app-frame.js';
import { DesktopAppShell } from '../app-frame.js';
import * as ui from '../index.js';

type Assert<T extends true> = T;
type ExtraKeys<T, Allowed extends PropertyKey> = Exclude<keyof T, Allowed>;
type DesktopShellAllowedKeys =
  | keyof ComponentPropsWithoutRef<'div'>
  | 'title'
  | 'children';

type DesktopShellHasNoCustomKeys = Assert<
  ExtraKeys<DesktopAppShellProps, DesktopShellAllowedKeys> extends never ? true : false
>;

const desktopShellHasNoCustomKeys: DesktopShellHasNoCustomKeys = true;

describe('DesktopAppShell shell boundaries', () => {
  it('renders non-game pages in a generic shell without complementary gameplay rails', () => {
    expect(desktopShellHasNoCustomKeys).toBe(true);

    render(
      <DesktopAppShell title="Boards Collection">
        <section>
          <h1>Boards Collection</h1>
          <p>Generic desktop content stays inside the primary page region.</p>
        </section>
      </DesktopAppShell>,
    );

    expect(screen.getByRole('banner')).toHaveTextContent('Boards Collection');
    expect(screen.getByRole('main')).toHaveTextContent('Boards Collection');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('uses the main ui package barrel for the canonical generic shell contract', () => {
    expect(ui.DesktopAppShell).toBe(DesktopAppShell);
    expect(ui.AppFrame).not.toBe(ui.DesktopAppShell);
  });
});
