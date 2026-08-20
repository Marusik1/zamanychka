import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { semanticTokenVars } from '../tokens.js';

const foundationCss = readFileSync(
  resolve(process.cwd(), 'src/foundation.css'),
  'utf8',
);

function TokenFixture() {
  return (
    <div className="ui-canvas">
      <section className="ui-surface ui-text-primary ui-panel">
        <h1 className="ui-type-heading">Zamanushka</h1>
        <p className="ui-text-secondary">Semantic token contract only.</p>
        <button className="ui-accent ui-type-button">Play</button>
      </section>
    </div>
  );
}

describe('semantic foundation tokens', () => {
  it('styles a minimal primitive tree through semantic classes and variables', () => {
    document.head.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = foundationCss;
    document.head.appendChild(style);

    render(<TokenFixture />);

    const canvas = screen.getByText('Zamanushka').closest('.ui-canvas');
    const panel = screen.getByText('Zamanushka').closest('.ui-panel');
    const button = screen.getByRole('button', { name: 'Play' });

    expect(canvas).toHaveClass('ui-canvas');
    expect(panel).toHaveClass('ui-surface', 'ui-text-primary', 'ui-panel');
    expect(button).toHaveClass('ui-accent', 'ui-type-button');

    expect(foundationCss).toContain(`${semanticTokenVars.backgrounds.canvas}:`);
    expect(foundationCss).toContain(`${semanticTokenVars.backgrounds.surface}:`);
    expect(foundationCss).toContain(`${semanticTokenVars.text.primary}:`);
    expect(foundationCss).toContain(`${semanticTokenVars.accent.primary}:`);
    expect(foundationCss).toContain(`${semanticTokenVars.spacing[4]}:`);
    expect(foundationCss).toContain(`${semanticTokenVars.typography.body}:`);
    expect(foundationCss).toContain(`${semanticTokenVars.radius.panel}:`);
    expect(foundationCss).toContain(`${semanticTokenVars.borders.subtle}:`);
    expect(foundationCss).toContain(`${semanticTokenVars.elevation.panel}:`);
    expect(foundationCss).toContain(`${semanticTokenVars.motion.normal}:`);
    expect(foundationCss).toContain(`${semanticTokenVars.layers.overlay}:`);
    expect(foundationCss).toContain('.ui-canvas');
    expect(foundationCss).toContain('.ui-surface');
    expect(foundationCss).toContain('.ui-panel');
    expect(foundationCss).toContain('.ui-accent');
    expect(foundationCss).toContain('.ui-type-button');

    expect(getComputedStyle(canvas as Element).backgroundColor).not.toBe('');
    expect(getComputedStyle(panel as Element).color).not.toBe('');
    expect(getComputedStyle(button).backgroundColor).not.toBe('');
  });
});
