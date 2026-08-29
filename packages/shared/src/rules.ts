import { z } from 'zod';

export const ruleTopicIdSchema = z.enum([
  'ENTRY_ON_SIX',
  'EXTRA_ROLL',
  'PERIMETER_MOVEMENT',
  'BLOCKING',
  'CAPTURE',
  'HOME_ENTRY',
  'VICTORY',
]);

export const tutorialStepOrder = [
  'ENTRY_ON_SIX',
  'EXTRA_ROLL',
  'PERIMETER_MOVEMENT',
  'BLOCKING',
  'CAPTURE',
  'HOME_ENTRY',
  'VICTORY',
] as const satisfies readonly z.infer<typeof ruleTopicIdSchema>[];

export const tutorialPawnFixtureSchema = z
  .object({
    pawnId: z.string().min(1),
    playerId: z.string().min(1),
    color: z.enum(['RED', 'BLUE', 'GREEN', 'YELLOW']),
    position: z.discriminatedUnion('zone', [
      z.object({ zone: z.literal('OFF_BOARD') }).strict(),
      z
        .object({
          zone: z.literal('PERIMETER'),
          progress: z.number().int().min(0).max(27),
        })
        .strict(),
      z
        .object({
          zone: z.literal('HOME'),
          homeIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
        })
        .strict(),
      z.object({ zone: z.literal('REMOVED') }).strict(),
    ]),
    emphasis: z
      .enum(['ACTIVE', 'TARGET', 'BLOCKER', 'CAPTURED', 'HOME', 'WINNER'])
      .optional(),
  })
  .strict();

export const tutorialFixtureSchema = z
  .object({
    topicId: ruleTopicIdSchema,
    playerCount: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    seatOrder: z.array(z.string().min(1)).min(2).max(4),
    firstPlayerId: z.string().min(1),
    currentPlayerId: z.string().min(1),
    diceValue: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
      z.null(),
    ]),
    focusPawnId: z.string().min(1).nullable(),
    pawns: z.array(tutorialPawnFixtureSchema).min(1),
    notes: z.array(z.string().min(1)).min(1),
    important: z.string().min(1).nullable().optional(),
    counterExample: z
      .object({
        title: z.string().min(1),
        description: z.string().min(1),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.seatOrder.length !== value.playerCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'seatOrder length must equal playerCount',
      });
    }

    if (!value.seatOrder.includes(value.firstPlayerId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'firstPlayerId must belong to seatOrder',
      });
    }

    if (!value.seatOrder.includes(value.currentPlayerId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'currentPlayerId must belong to seatOrder',
      });
    }
  });

export const ruleTopicSchema = z
  .object({
    id: ruleTopicIdSchema,
    title: z.string().min(1),
    shortTitle: z.string().min(1),
    summary: z.string().min(1),
    bullets: z.array(z.string().min(1)).min(1),
    important: z.string().min(1).nullable().optional(),
    counterExample: z
      .object({
        title: z.string().min(1),
        description: z.string().min(1),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

export const rulesBasicsSchema = z
  .object({
    playerRange: z.string().min(1),
    pawnsPerPlayer: z.string().min(1),
    board: z.string().min(1),
    turnAuthority: z.string().min(1),
    choiceAfterRoll: z.string().min(1),
  })
  .strict();

export const rulesContentSchema = z
  .object({
    screenTitle: z.string().min(1),
    tutorialCtaLabel: z.string().min(1),
    onboardingTitle: z.string().min(1),
    onboardingBody: z.string().min(1),
    onboardingPrimaryAction: z.string().min(1),
    onboardingSecondaryAction: z.string().min(1),
    tutorialDoneLabel: z.string().min(1),
    basics: rulesBasicsSchema,
    topics: z.array(ruleTopicSchema).length(7),
    fixtures: z.array(tutorialFixtureSchema).length(7),
  })
  .strict()
  .superRefine((value, ctx) => {
    const topicIds = value.topics.map((topic) => topic.id);
    const fixtureIds = value.fixtures.map((fixture) => fixture.topicId);

    if (JSON.stringify(topicIds) !== JSON.stringify(tutorialStepOrder)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'topics must follow the canonical seven-step order',
      });
    }

    if (JSON.stringify(fixtureIds) !== JSON.stringify(tutorialStepOrder)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fixtures must follow the canonical seven-step order',
      });
    }
  });

export const rulesContent = {
  screenTitle: 'ПРАВИЛА ИГРЫ',
  tutorialCtaLabel: 'Пройти обучение',
  onboardingTitle: 'Как играть в «Заманушку»',
  onboardingBody: 'Семь коротких примеров объяснят вход на поле, движение, взятие и победу.',
  onboardingPrimaryAction: 'Начать обучение',
  onboardingSecondaryAction: 'Позже',
  tutorialDoneLabel: 'Готово',
  basics: {
    playerRange: 'В партии участвуют 2–4 игрока.',
    pawnsPerPlayer: 'У каждого игрока по 4 пешки своего цвета.',
    board: 'Пешки идут по внешнему периметру 8×8, а затем входят в свой дом.',
    turnAuthority: 'Бросок, результат и состояние матча подтверждаются сервером.',
    choiceAfterRoll: 'После подтверждённого броска игрок выбирает одно из допустимых действий.',
  },
  topics: [
    {
      id: 'ENTRY_ON_SIX',
      title: 'Вход пешки на поле',
      shortTitle: 'Вход на поле',
      summary: 'Пешка вне поля может войти только после броска 6.',
      bullets: [
        'Пешка появляется на стартовом углу своего цвета.',
        'Стартовая клетка должна быть полностью свободна.',
        'Вход на поле никогда не сбивает чужую пешку.',
        'На 6 можно выбрать и другой допустимый ход уже стоящей пешкой.',
      ],
      counterExample: {
        title: 'Когда вход недоступен',
        description: 'Если стартовый угол занят, действие входа не появляется.',
      },
    },
    {
      id: 'EXTRA_ROLL',
      title: 'Шестёрка даёт ещё один бросок',
      shortTitle: 'Ещё один бросок',
      summary: 'После успешного действия на 6 игрок делает ещё один ход кубиком.',
      bullets: [
        'Сначала сервер подтверждает бросок 6.',
        'Игрок выбирает вход или допустимое движение на 6.',
        'После успешного действия тот же игрок получает явный следующий бросок.',
        'Если на 6 нет допустимого входа или движения, игрок всё равно бросает ещё раз.',
      ],
    },
    {
      id: 'PERIMETER_MOVEMENT',
      title: 'Движение по кругу',
      shortTitle: 'Движение по кругу',
      summary: 'Пешки движутся строго по часовой стрелке по внешнему периметру.',
      bullets: [
        'Периметр содержит 28 логических клеток.',
        'Движение идёт только по часовой стрелке.',
        'После завершения круга пешка продолжает путь в свой дом.',
      ],
    },
    {
      id: 'BLOCKING',
      title: 'Перепрыгивать нельзя',
      shortTitle: 'Перепрыгивать нельзя',
      summary: 'Занятая промежуточная клетка делает ход недопустимым.',
      bullets: [
        'Блокировать могут свои и чужие пешки.',
        'Свободная конечная клетка не помогает, если путь занят.',
        'На свою пешку в конце хода вставать нельзя.',
      ],
    },
    {
      id: 'CAPTURE',
      title: 'Взятие пешки',
      shortTitle: 'Взятие',
      summary: 'Взятие происходит только при точном приземлении на чужую пешку.',
      bullets: [
        'Пешка соперника на промежуточной клетке только блокирует путь.',
        'Прыжка со взятием не бывает.',
        'Вход на поле никогда не считается взятием.',
      ],
    },
    {
      id: 'HOME_ENTRY',
      title: 'Вход домой',
      shortTitle: 'Вход домой',
      summary: 'После внешнего круга пешка идёт по своей домашней диагонали.',
      bullets: [
        'Дом состоит из клеток HOME(0..3).',
        'HOME(0) физически делит угол со стартом, но логически уже является домом.',
        'Для HOME(3) нужно точное попадание без перебора.',
      ],
      important: 'Перебор за HOME(3) запрещён: такой ход не станет допустимым.',
      counterExample: {
        title: 'Недопустимый перебор',
        description: 'Если оставшихся шагов больше, чем нужно до HOME(3), ход запрещён.',
      },
    },
    {
      id: 'VICTORY',
      title: 'Победа',
      shortTitle: 'Победа',
      summary: 'Побеждает тот, кто первым завершит свой дом или останется последним активным игроком.',
      bullets: [
        'Основной сценарий победы — все 4 пешки в HOME(0..3).',
        'Матч также завершается, если все соперники сдались.',
        'Дополнительных мест и рейтинга внутри матча нет.',
      ],
    },
  ],
  fixtures: [
    {
      topicId: 'ENTRY_ON_SIX',
      playerCount: 4,
      seatOrder: ['p1', 'p2', 'p3', 'p4'],
      firstPlayerId: 'p1',
      currentPlayerId: 'p1',
      diceValue: 6,
      focusPawnId: 'p1-pawn-1',
      pawns: [
        { pawnId: 'p1-pawn-1', playerId: 'p1', color: 'RED', position: { zone: 'OFF_BOARD' }, emphasis: 'ACTIVE' },
      ],
      notes: ['Красная пешка может войти на свободный стартовый угол после 6.'],
      counterExample: {
        title: 'Занятый старт',
        description: 'Если угол уже занят любой пешкой, вход недоступен.',
      },
    },
    {
      topicId: 'EXTRA_ROLL',
      playerCount: 4,
      seatOrder: ['p1', 'p2', 'p3', 'p4'],
      firstPlayerId: 'p1',
      currentPlayerId: 'p1',
      diceValue: 6,
      focusPawnId: 'p1-pawn-1',
      pawns: [
        {
          pawnId: 'p1-pawn-1',
          playerId: 'p1',
          color: 'RED',
          position: { zone: 'PERIMETER', progress: 0 },
          emphasis: 'ACTIVE',
        },
      ],
      notes: ['После успешного действия на 6 тот же игрок получает ещё один подтверждённый бросок.'],
    },
    {
      topicId: 'PERIMETER_MOVEMENT',
      playerCount: 4,
      seatOrder: ['p1', 'p2', 'p3', 'p4'],
      firstPlayerId: 'p1',
      currentPlayerId: 'p1',
      diceValue: 4,
      focusPawnId: 'p1-pawn-1',
      pawns: [
        {
          pawnId: 'p1-pawn-1',
          playerId: 'p1',
          color: 'RED',
          position: { zone: 'PERIMETER', progress: 2 },
          emphasis: 'ACTIVE',
        },
      ],
      notes: ['Пешка идёт по периметру по часовой стрелке на точное число шагов.'],
    },
    {
      topicId: 'BLOCKING',
      playerCount: 4,
      seatOrder: ['p1', 'p2', 'p3', 'p4'],
      firstPlayerId: 'p1',
      currentPlayerId: 'p1',
      diceValue: 4,
      focusPawnId: 'p1-pawn-1',
      pawns: [
        {
          pawnId: 'p1-pawn-1',
          playerId: 'p1',
          color: 'RED',
          position: { zone: 'PERIMETER', progress: 1 },
          emphasis: 'ACTIVE',
        },
        {
          pawnId: 'p2-pawn-1',
          playerId: 'p2',
          color: 'BLUE',
          position: { zone: 'PERIMETER', progress: 23 },
          emphasis: 'BLOCKER',
        },
      ],
      notes: ['Пешка не может перепрыгнуть через занятую промежуточную клетку.'],
    },
    {
      topicId: 'CAPTURE',
      playerCount: 4,
      seatOrder: ['p1', 'p2', 'p3', 'p4'],
      firstPlayerId: 'p1',
      currentPlayerId: 'p1',
      diceValue: 2,
      focusPawnId: 'p1-pawn-1',
      pawns: [
        {
          pawnId: 'p1-pawn-1',
          playerId: 'p1',
          color: 'RED',
          position: { zone: 'PERIMETER', progress: 1 },
          emphasis: 'ACTIVE',
        },
        {
          pawnId: 'p2-pawn-1',
          playerId: 'p2',
          color: 'BLUE',
          position: { zone: 'PERIMETER', progress: 24 },
          emphasis: 'CAPTURED',
        },
      ],
      notes: ['Точное попадание на чужую пешку возвращает её вне поля.'],
    },
    {
      topicId: 'HOME_ENTRY',
      playerCount: 4,
      seatOrder: ['p1', 'p2', 'p3', 'p4'],
      firstPlayerId: 'p1',
      currentPlayerId: 'p1',
      diceValue: 3,
      focusPawnId: 'p1-pawn-1',
      pawns: [
        {
          pawnId: 'p1-pawn-1',
          playerId: 'p1',
          color: 'RED',
          position: { zone: 'PERIMETER', progress: 26 },
          emphasis: 'HOME',
        },
      ],
      notes: ['После завершения внешнего круга пешка входит в домашнюю диагональ.'],
      important: 'Для попадания в HOME(3) нужно точное количество шагов.',
      counterExample: {
        title: 'Перебор дома',
        description: 'Ход с перебором дальше HOME(3) считается недопустимым.',
      },
    },
    {
      topicId: 'VICTORY',
      playerCount: 4,
      seatOrder: ['p1', 'p2', 'p3', 'p4'],
      firstPlayerId: 'p1',
      currentPlayerId: 'p1',
      diceValue: 1,
      focusPawnId: 'p1-pawn-4',
      pawns: [
        {
          pawnId: 'p1-pawn-1',
          playerId: 'p1',
          color: 'RED',
          position: { zone: 'HOME', homeIndex: 1 },
          emphasis: 'WINNER',
        },
        {
          pawnId: 'p1-pawn-2',
          playerId: 'p1',
          color: 'RED',
          position: { zone: 'HOME', homeIndex: 2 },
          emphasis: 'WINNER',
        },
        {
          pawnId: 'p1-pawn-3',
          playerId: 'p1',
          color: 'RED',
          position: { zone: 'HOME', homeIndex: 3 },
          emphasis: 'WINNER',
        },
        {
          pawnId: 'p1-pawn-4',
          playerId: 'p1',
          color: 'RED',
          position: { zone: 'PERIMETER', progress: 27 },
          emphasis: 'ACTIVE',
        },
      ],
      notes: ['Четвёртая пешка завершает дом и сразу приносит победу.'],
      important: 'Матч также завершается, если остаётся только один активный игрок.',
    },
  ],
} as const satisfies z.infer<typeof rulesContentSchema>;

export type RuleTopicId = z.infer<typeof ruleTopicIdSchema>;
export type RuleTopic = z.infer<typeof ruleTopicSchema>;
export type TutorialPawnFixture = z.infer<typeof tutorialPawnFixtureSchema>;
export type TutorialFixture = z.infer<typeof tutorialFixtureSchema>;
export type RulesBasics = z.infer<typeof rulesBasicsSchema>;
export type RulesContent = z.infer<typeof rulesContentSchema>;
