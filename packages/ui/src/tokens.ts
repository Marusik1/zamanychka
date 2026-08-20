type TypographyTokenRole = {
  family: string;
  size: string;
  weight: string;
  lineHeight: string;
  letterSpacing: string;
};

export const semanticTokenVars = {
  backgrounds: {
    canvas: '--color-canvas',
    surface: '--color-surface',
    surfaceElevated: '--color-surface-elevated',
    surfaceContrast: '--color-surface-contrast',
  },
  text: {
    primary: '--text-primary',
    secondary: '--text-secondary',
    muted: '--text-muted',
    inverse: '--text-inverse',
  },
  accent: {
    primary: '--accent-primary',
    hover: '--accent-hover',
    pressed: '--accent-pressed',
    success: '--accent-success',
    warning: '--accent-warning',
    danger: '--accent-danger',
    focusRing: '--accent-focus-ring',
  },
  spacing: {
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
  },
  typography: {
    display: {
      family: '--font-family-display',
      size: '--font-size-display',
      weight: '--font-weight-display',
      lineHeight: '--line-height-display',
      letterSpacing: '--letter-spacing-display',
    } satisfies TypographyTokenRole,
    h1: {
      family: '--font-family-base',
      size: '--font-size-h1',
      weight: '--font-weight-heading',
      lineHeight: '--line-height-heading',
      letterSpacing: '--letter-spacing-heading',
    } satisfies TypographyTokenRole,
    h2: {
      family: '--font-family-base',
      size: '--font-size-h2',
      weight: '--font-weight-heading',
      lineHeight: '--line-height-heading',
      letterSpacing: '--letter-spacing-heading',
    } satisfies TypographyTokenRole,
    h3: {
      family: '--font-family-base',
      size: '--font-size-h3',
      weight: '--font-weight-heading',
      lineHeight: '--line-height-heading',
      letterSpacing: '--letter-spacing-heading',
    } satisfies TypographyTokenRole,
    body: {
      family: '--font-family-base',
      size: '--font-size-body',
      weight: '--font-weight-body',
      lineHeight: '--line-height-body',
      letterSpacing: '--letter-spacing-body',
    } satisfies TypographyTokenRole,
    bodySmall: {
      family: '--font-family-base',
      size: '--font-size-body-small',
      weight: '--font-weight-body',
      lineHeight: '--line-height-body',
      letterSpacing: '--letter-spacing-body',
    } satisfies TypographyTokenRole,
    caption: {
      family: '--font-family-base',
      size: '--font-size-caption',
      weight: '--font-weight-emphasis',
      lineHeight: '--line-height-compact',
      letterSpacing: '--letter-spacing-caption',
    } satisfies TypographyTokenRole,
    button: {
      family: '--font-family-base',
      size: '--font-size-button',
      weight: '--font-weight-button',
      lineHeight: '--line-height-compact',
      letterSpacing: '--letter-spacing-button',
    } satisfies TypographyTokenRole,
    numeric: {
      family: '--font-family-numeric',
      size: '--font-size-numeric',
      weight: '--font-weight-numeric',
      lineHeight: '--line-height-compact',
      letterSpacing: '--letter-spacing-body',
    } satisfies TypographyTokenRole,
  },
  radius: {
    control: '--radius-control',
    button: '--radius-button',
    panel: '--radius-panel',
    sheet: '--radius-sheet',
    pill: '--radius-pill',
  },
  borders: {
    subtle: '--border-subtle',
    strong: '--border-strong',
    active: '--border-active',
    contrast: '--border-contrast',
  },
  elevation: {
    panel: '--shadow-panel',
    raised: '--shadow-raised',
    focus: '--shadow-focus',
  },
  motion: {
    fast: '--motion-duration-fast',
    normal: '--motion-duration-normal',
    slow: '--motion-duration-slow',
    standardEase: '--motion-ease-standard',
    emphasizedEase: '--motion-ease-emphasized',
  },
  layers: {
    base: '--layer-base',
    raised: '--layer-raised',
    sticky: '--layer-sticky',
    overlay: '--layer-overlay',
    modal: '--layer-modal',
  },
} as const;

export type SemanticTokenVars = typeof semanticTokenVars;
export type SemanticTypographyTokenVars = typeof semanticTokenVars.typography;
