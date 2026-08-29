import { describe, expect, it } from 'vitest';
import { rulesContent, rulesContentSchema, tutorialStepOrder } from './rules.js';

describe('rules and tutorial canonical content', () => {
  it('freezes the exact seven-step order and canonical Russian entry points', () => {
    expect(tutorialStepOrder).toEqual([
      'ENTRY_ON_SIX',
      'EXTRA_ROLL',
      'PERIMETER_MOVEMENT',
      'BLOCKING',
      'CAPTURE',
      'HOME_ENTRY',
      'VICTORY',
    ]);
    expect(rulesContent.screenTitle).toBe('ПРАВИЛА ИГРЫ');
    expect(rulesContent.onboardingTitle).toBe('Как играть в «Заманушку»');
    expect(rulesContent.tutorialDoneLabel).toBe('Готово');
  });

  it('parses the canonical content model and keeps topics aligned with fixtures', () => {
    const parsed = rulesContentSchema.parse(rulesContent);

    expect(parsed.topics.map((topic) => topic.id)).toEqual(tutorialStepOrder);
    expect(parsed.fixtures.map((fixture) => fixture.topicId)).toEqual(tutorialStepOrder);
  });
});
