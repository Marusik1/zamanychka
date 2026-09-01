import { describe, expect, it } from 'vitest';

import { formatMatchDuration, matchDurationMilliseconds } from './match-duration.js';

describe('match duration', () => {
  it('formats active durations from the authoritative start timestamp', () => {
    expect(
      formatMatchDuration(
        matchDurationMilliseconds(
          '2026-09-01T10:00:00.000Z',
          null,
          new Date('2026-09-01T10:08:42.999Z'),
        ),
      ),
    ).toBe('08:42');
  });

  it('freezes a finished duration at the authoritative finished timestamp', () => {
    const startedAt = '2026-09-01T10:00:00.000Z';
    const finishedAt = '2026-09-01T11:04:15.000Z';

    expect(
      formatMatchDuration(
        matchDurationMilliseconds(startedAt, finishedAt, new Date('2026-09-01T15:00:00.000Z')),
      ),
    ).toBe('1:04:15');
  });

  it('does not invent a duration when a snapshot has no match start', () => {
    expect(matchDurationMilliseconds(null, null, new Date('2026-09-01T10:00:00.000Z'))).toBeNull();
  });

  it.each([
    [0, '00:00'],
    [8_000, '00:08'],
    [65_000, '01:05'],
    [3_599_000, '59:59'],
    [3_600_000, '1:00:00'],
  ])('formats %i milliseconds as %s', (milliseconds, expected) => {
    expect(formatMatchDuration(milliseconds)).toBe(expected);
  });
});
