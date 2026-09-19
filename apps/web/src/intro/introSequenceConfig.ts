export const INTRO_DURATION_MS = 1600;

export const INTRO_PHASES = {
  pressEnd: 0.09,
  approachEnd: 0.47,
  impactEnd: 0.60,
  resultEnd: 1,
} as const;

export const INTRO_ASSETS = {
  idle: {
    mobile: '/intro/idle-mobile.webp',
    desktop: '/intro/idle-desktop.webp',
  },
  approach: {
    mobile: '/intro/approach-mobile.webp',
    desktop: '/intro/approach-desktop.webp',
  },
  impact: {
    mobile: '/intro/impact-mobile.webp',
    desktop: '/intro/impact-desktop.webp',
  },
  result: {
    mobile: '/intro/result-mobile.webp',
    desktop: '/intro/result-desktop.webp',
  },
} as const;

export type IntroFrameName = keyof typeof INTRO_ASSETS;
