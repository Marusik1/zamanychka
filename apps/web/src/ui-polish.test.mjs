import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const webStyles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
const foundationStyles = readFileSync(
  resolve(process.cwd(), '../../packages/ui/src/foundation.css'),
  'utf8',
);

describe('beta UI polish contract', () => {
  it('keeps mobile shell chrome compact and touch accessible', () => {
    expect(foundationStyles).toContain('--shell-header-height-mobile: 60px');
    expect(foundationStyles).toContain('--shell-nav-height-mobile: 64px');
    expect(foundationStyles).toContain('min-height: 44px');
  });

  it('uses a compact two-column lobby and board-first match composition', () => {
    expect(webStyles).toContain('.beta-room-page__seat-grid');
    expect(webStyles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(webStyles).toContain('.beta-room-page__board-panel');
    expect(webStyles).toContain('aspect-ratio: 1');
  });

  it('preserves restrained feedback for reduced-motion users', () => {
    expect(foundationStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(webStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(webStyles).toContain('transition-duration: 140ms !important');
  });

  it('highlights legal pawns with a restrained halo instead of fading or jumping them', () => {
    const selectedPawn = webStyles.slice(
      webStyles.indexOf('.game-pawn--motion-selected'),
      webStyles.indexOf('.game-pawn--motion-entering'),
    );

    expect(selectedPawn).toContain('scale(1.022)');
    expect(selectedPawn).toContain('.game-pawn--motion-selected::after');
    expect(selectedPawn).not.toContain('opacity:');
  });

  it('keeps mobile gameplay in a simple board-first document flow', () => {
    expect(webStyles).toContain('@media (max-width: 768px)');
    expect(webStyles).toContain('width: calc(100% - 24px)');
    expect(webStyles).toContain('max-width: 520px');
    expect(webStyles).toContain('grid-template-areas:');
    expect(webStyles).toContain("'board'");
    expect(webStyles).toContain("'actions'");

    const mobileGameplay = webStyles.slice(
      webStyles.lastIndexOf('@media (max-width: 768px) {', webStyles.indexOf('/* Locked non-game mobile visual system.')),
      webStyles.indexOf('/* Locked non-game mobile visual system.'),
    );
    expect(mobileGameplay).not.toContain('calc(var(--app-viewport-height)');
    expect(mobileGameplay).not.toContain('position: sticky');
    expect(mobileGameplay).not.toContain('margin-inline: -');
    expect(mobileGameplay).toContain('.game-board-scene__board-rail,');
    expect(mobileGameplay).toContain('.game-board-scene__board {');
    expect(mobileGameplay).toContain('height: 100%');
  });

  it('keeps board pawns proportionate and bottom-anchored inside one cell', () => {
    const pawnLayer = webStyles.slice(
      webStyles.indexOf('.game-board-scene__board-pawn-slot,'),
      webStyles.indexOf('.game-board-scene__hardware'),
    );

    expect(pawnLayer).toContain('align-items: end');
    expect(pawnLayer).toContain('height: 78%');
    expect(pawnLayer).toContain('max-width: 72%');
    expect(pawnLayer).toContain('transform: translate(-50%, -68%)');
  });

  it('uses the approved one-column mobile app hierarchy outside gameplay', () => {
    const mobileApp = webStyles.slice(webStyles.indexOf('/* APPROVED MOBILE APP SURFACES'));

    expect(mobileApp).toContain('.beta-home-page__atmosphere');
    expect(mobileApp).toContain('.beta-room-page__seat-grid');
    expect(mobileApp).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(mobileApp).toContain('.profile-page__stats');
    expect(mobileApp).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(mobileApp).toContain('.shell-session-panel');
    expect(mobileApp).toContain('.beta-room-page__filters');
    expect(mobileApp).toContain('min-height: 88px');
    expect(mobileApp).toContain('.profile-result-card__outcome-dot');
  });

  it('locks the reference-led non-game mobile system without leaking into gameplay', () => {
    const lockedMobile = webStyles.slice(
      webStyles.indexOf('/* Locked non-game mobile visual system.'),
    );

    expect(lockedMobile).toContain('.ui-app-shell--mobile:not(:has(.game-board-scene))');
    expect(lockedMobile).toContain('--z-bg: #081015');
    expect(lockedMobile).toContain('--z-gold: #d7a955');
    expect(lockedMobile).toContain('.beta-home-page__summary');
    expect(lockedMobile).toContain('.beta-home-page__function-list');
    expect(lockedMobile).toContain('min-height: calc(64px + env(safe-area-inset-bottom))');
    expect(lockedMobile).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(lockedMobile).toContain('.beta-room-page--list .beta-room-page__seat-card');
    expect(lockedMobile).not.toContain('.game-board-scene__turn-card');
    expect(lockedMobile).not.toContain('.game-die');
  });

  it('keeps the EPIC-18 Home layout usable in Telegram WebViews without CSS scope support', () => {
    const compatibilityLayer = webStyles.slice(
      webStyles.indexOf('/* EPIC-18 compatibility layer for older Telegram WebViews. */'),
    );

    expect(compatibilityLayer).not.toContain('@scope');
    expect(compatibilityLayer).toContain('font-size: 24px');
    expect(compatibilityLayer).toContain('line-height: 29px');
    expect(compatibilityLayer).toContain('word-break: normal');
    expect(compatibilityLayer).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(compatibilityLayer).toContain('min-height: 72px');
    expect(compatibilityLayer).toContain('text-decoration: none');
  });
});
