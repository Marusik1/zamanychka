import { describe, expect, it } from 'vitest';

import { createRuntimePreviewFixture } from './runtime-preview.js';
import {
  ANIMATION_TIMINGS,
  buildGameplayAnimationFrames,
  movementDurationMs,
} from './animation-director.js';

describe('runtime preview fixture', () => {
  it('includes a deterministic surrender/removal transition in canonical pawn order', () => {
    const fixture = createRuntimePreviewFixture('green-seat');
    const surrender = fixture.transitions.find((transition) => transition.transitionId === 'green-surrender');

    expect(surrender).toBeDefined();
    expect(surrender?.events.map((event) => event.type)).toEqual([
      'playerSurrendered',
      'pawnRemoved',
      'pawnRemoved',
      'pawnRemoved',
      'pawnRemoved',
    ]);
    expect(
      surrender?.events
        .filter((event) => event.type === 'pawnRemoved')
        .map((event) => event.payload.pawnId),
    ).toEqual([
      'green-seat-pawn-1',
      'green-seat-pawn-2',
      'green-seat-pawn-3',
      'green-seat-pawn-4',
    ]);
    expect(surrender?.snapshot.pawns.filter((pawn) => pawn.playerId === 'green-seat').every((pawn) => pawn.position.zone === 'REMOVED')).toBe(
      true,
    );
  });

  it('exposes every exact-reference manual preview scenario including reset-only recovery point', () => {
    const fixture = createRuntimePreviewFixture('green-seat');

    expect(fixture.scenarios.map((scenario) => scenario.key)).toEqual([
      'dice',
      'enter',
      'move4',
      'capture',
      'home-entry',
      'home-complete',
      'victory',
      'victory-last-active',
      'surrender',
      'turn-change',
      'snapshot-invalidate',
    ]);
  });

  it('keeps move tempo readable and capture follow-through within the approved budget', () => {
    const fixture = createRuntimePreviewFixture('green-seat');
    const enter = fixture.scenarios.find((scenario) => scenario.key === 'enter');
    const capture = fixture.scenarios.find((scenario) => scenario.key === 'capture');

    const enterFrames = buildGameplayAnimationFrames({
      transition: enter!.transitions[0]!,
      initialSnapshot: enter!.startSnapshot,
      reducedMotion: false,
    });
    const captureFrames = buildGameplayAnimationFrames({
      transition: capture!.transitions[0]!,
      initialSnapshot: capture!.startSnapshot,
      reducedMotion: false,
    });

    const captureDuration = captureFrames
      .filter(
        (frame) =>
          frame.state.pawnVisuals['red-seat-pawn-1']?.motion === 'captured' ||
          frame.state.cellCue?.tone === 'capture',
      )
      .reduce((total, frame) => total + frame.durationMs, 0);

    expect(movementDurationMs(1)).toBeGreaterThanOrEqual(220);
    expect(movementDurationMs(1)).toBeLessThanOrEqual(260);
    expect(movementDurationMs(4)).toBeGreaterThanOrEqual(460);
    expect(movementDurationMs(4)).toBeLessThanOrEqual(540);
    expect(movementDurationMs(6)).toBeGreaterThanOrEqual(620);
    expect(movementDurationMs(6)).toBeLessThanOrEqual(720);
    expect(ANIMATION_TIMINGS.captureImpactMs).toBeGreaterThanOrEqual(100);
    expect(ANIMATION_TIMINGS.captureImpactMs).toBeLessThanOrEqual(140);
    expect(ANIMATION_TIMINGS.captureExitMs).toBeGreaterThanOrEqual(150);
    expect(ANIMATION_TIMINGS.captureExitMs).toBeLessThanOrEqual(200);
    expect(captureDuration).toBeGreaterThanOrEqual(220);
    expect(captureDuration).toBeLessThanOrEqual(360);
  });
});
