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
  it('defines a typed semantic token contract and applies generic token classes', () => {
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

    expect(semanticTokenVars.backgrounds).toEqual({
      canvas: '--color-canvas',
      surface: '--color-surface',
      surfaceElevated: '--color-surface-elevated',
      surfaceContrast: '--color-surface-contrast',
    });
    expect(semanticTokenVars.text).toEqual({
      primary: '--text-primary',
      secondary: '--text-secondary',
      muted: '--text-muted',
      inverse: '--text-inverse',
    });
    expect(semanticTokenVars.accent).toEqual({
      primary: '--accent-primary',
      hover: '--accent-hover',
      pressed: '--accent-pressed',
      success: '--accent-success',
      warning: '--accent-warning',
      danger: '--accent-danger',
      focusRing: '--accent-focus-ring',
    });
    expect(semanticTokenVars.spacing).toEqual({
      1: '--space-1',
      2: '--space-2',
      3: '--space-3',
      4: '--space-4',
      5: '--space-5',
      6: '--space-6',
      7: '--space-7',
      8: '--space-8',
      9: '--space-9',
      10: '--space-10',
    });
    expect(semanticTokenVars.typography).toEqual({
      display: {
        family: '--font-family-display',
        size: '--font-size-display',
        weight: '--font-weight-display',
        lineHeight: '--line-height-display',
        letterSpacing: '--letter-spacing-display',
      },
      h1: {
        family: '--font-family-base',
        size: '--font-size-h1',
        weight: '--font-weight-heading',
        lineHeight: '--line-height-heading',
        letterSpacing: '--letter-spacing-heading',
      },
      h2: {
        family: '--font-family-base',
        size: '--font-size-h2',
        weight: '--font-weight-heading',
        lineHeight: '--line-height-heading',
        letterSpacing: '--letter-spacing-heading',
      },
      h3: {
        family: '--font-family-base',
        size: '--font-size-h3',
        weight: '--font-weight-heading',
        lineHeight: '--line-height-heading',
        letterSpacing: '--letter-spacing-heading',
      },
      body: {
        family: '--font-family-base',
        size: '--font-size-body',
        weight: '--font-weight-body',
        lineHeight: '--line-height-body',
        letterSpacing: '--letter-spacing-body',
      },
      bodySmall: {
        family: '--font-family-base',
        size: '--font-size-body-small',
        weight: '--font-weight-body',
        lineHeight: '--line-height-body',
        letterSpacing: '--letter-spacing-body',
      },
      caption: {
        family: '--font-family-base',
        size: '--font-size-caption',
        weight: '--font-weight-emphasis',
        lineHeight: '--line-height-compact',
        letterSpacing: '--letter-spacing-caption',
      },
      button: {
        family: '--font-family-base',
        size: '--font-size-button',
        weight: '--font-weight-button',
        lineHeight: '--line-height-compact',
        letterSpacing: '--letter-spacing-button',
      },
      numeric: {
        family: '--font-family-numeric',
        size: '--font-size-numeric',
        weight: '--font-weight-numeric',
        lineHeight: '--line-height-compact',
        letterSpacing: '--letter-spacing-body',
      },
    });
    expect(semanticTokenVars.radius).toEqual({
      control: '--radius-control',
      button: '--radius-button',
      panel: '--radius-panel',
      sheet: '--radius-sheet',
      pill: '--radius-pill',
    });
    expect(semanticTokenVars.borders).toEqual({
      subtle: '--border-subtle',
      strong: '--border-strong',
      active: '--border-active',
      contrast: '--border-contrast',
    });
    expect(semanticTokenVars.elevation).toEqual({
      panel: '--shadow-panel',
      raised: '--shadow-raised',
      focus: '--shadow-focus',
    });
    expect(semanticTokenVars.motion).toEqual({
      fast: '--motion-duration-fast',
      normal: '--motion-duration-normal',
      slow: '--motion-duration-slow',
      standardEase: '--motion-ease-standard',
      emphasizedEase: '--motion-ease-emphasized',
    });
    expect(semanticTokenVars.zIndex).toEqual({
      base: '--layer-base',
      raised: '--layer-raised',
      sticky: '--layer-sticky',
      overlay: '--layer-overlay',
      modal: '--layer-modal',
    });

    for (const tokenGroup of [
      semanticTokenVars.backgrounds,
      semanticTokenVars.text,
      semanticTokenVars.accent,
      semanticTokenVars.spacing,
      semanticTokenVars.radius,
      semanticTokenVars.borders,
      semanticTokenVars.elevation,
      semanticTokenVars.motion,
      semanticTokenVars.zIndex,
    ]) {
      for (const tokenVar of Object.values(tokenGroup)) {
        expect(foundationCss).toMatch(new RegExp(`${tokenVar}:\\s*[^;]+;`));
      }
    }

    for (const typographyRole of Object.values(semanticTokenVars.typography)) {
      for (const tokenVar of Object.values(typographyRole)) {
        expect(foundationCss).toMatch(new RegExp(`${tokenVar}:\\s*[^;]+;`));
      }
    }

    for (const semanticClass of [
      '.ui-canvas',
      '.ui-surface',
      '.ui-panel',
      '.ui-text-primary',
      '.ui-text-secondary',
      '.ui-accent',
      '.ui-type-heading',
      '.ui-type-button',
    ]) {
      expect(foundationCss).toContain(semanticClass);
    }

    expect(foundationCss).not.toContain('.app-frame');
    expect(foundationCss).not.toContain('.app-frame__header');
    expect(foundationCss).not.toContain('.app-frame__main');
  });
});
