import {
  rulesContent,
  tutorialStepOrder,
  type RuleTopicId,
  type TutorialFixture,
  type TutorialPawnFixture,
} from '@zamanushka/shared';
import { Button, Panel } from '@zamanushka/ui';
import { useEffect, useMemo, useState } from 'react';

const perimeterCoords: Array<[number, number]> = [
  [0, 0],
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [0, 6],
  [0, 7],
  [1, 7],
  [2, 7],
  [3, 7],
  [4, 7],
  [5, 7],
  [6, 7],
  [7, 7],
  [7, 6],
  [7, 5],
  [7, 4],
  [7, 3],
  [7, 2],
  [7, 1],
  [7, 0],
  [6, 0],
  [5, 0],
  [4, 0],
  [3, 0],
  [2, 0],
  [1, 0],
];

const homeCoords = {
  RED: [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  BLUE: [
    [0, 7],
    [1, 6],
    [2, 5],
    [3, 4],
  ],
  YELLOW: [
    [7, 7],
    [6, 6],
    [5, 5],
    [4, 4],
  ],
  GREEN: [
    [7, 0],
    [6, 1],
    [5, 2],
    [4, 3],
  ],
} as const;

type CellTone = 'base' | 'red' | 'blue' | 'green' | 'yellow';

function colorClass(color: TutorialPawnFixture['color']) {
  return `rules-pawn--${color.toLowerCase()}`;
}

function getPawnCoordinate(pawn: TutorialPawnFixture): [number, number] | null {
  if (pawn.position.zone === 'OFF_BOARD' || pawn.position.zone === 'REMOVED') {
    return null;
  }

  if (pawn.position.zone === 'PERIMETER') {
    return perimeterCoords[pawn.position.progress] ?? null;
  }

  const coord = homeCoords[pawn.color][pawn.position.homeIndex];
  return coord ? [coord[0], coord[1]] : null;
}

function getPathCoords(topicId: RuleTopicId): Array<[number, number]> {
  switch (topicId) {
    case 'ENTRY_ON_SIX':
      return [[0, 0]];
    case 'EXTRA_ROLL':
      return [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]];
    case 'PERIMETER_MOVEMENT':
      return [[0, 2], [0, 3], [0, 4], [0, 5], [0, 6]];
    case 'BLOCKING':
      return [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]];
    case 'CAPTURE':
      return [[0, 1], [0, 2], [0, 3]];
    case 'HOME_ENTRY':
      return [
        [2, 0],
        [1, 0],
        [0, 0],
        [1, 1],
      ];
    case 'VICTORY':
      return [
        [1, 0],
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
      ];
  }
}

function getCellTone(row: number, col: number): CellTone {
  if (row === col && row <= 3) return 'red';
  if (row + col === 7 && row <= 3) return 'blue';
  if (row === col && row >= 4) return 'yellow';
  if (row + col === 7 && row >= 4) return 'green';
  return 'base';
}

function renderReservePawns(fixture: TutorialFixture, color: TutorialPawnFixture['color']) {
  const offBoard = fixture.pawns.filter(
    (pawn) => pawn.color === color && pawn.position.zone === 'OFF_BOARD',
  );

  return Array.from({ length: 4 }).map((_, index) => {
    const pawn = offBoard[index];
    return (
      <span
        key={`${color}-reserve-${index}`}
        className={[
          'rules-pawn',
          colorClass(color),
          pawn ? 'rules-pawn--reserve' : 'rules-pawn--ghost',
          pawn?.emphasis ? `rules-pawn--${pawn.emphasis.toLowerCase()}` : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden="true"
      />
    );
  });
}

function TutorialBoard({
  fixture,
  topicId,
  title,
}: {
  fixture: TutorialFixture;
  topicId: RuleTopicId;
  title: string;
}) {
  const path = useMemo(() => getPathCoords(topicId), [topicId]);
  const occupied = new Map<string, TutorialPawnFixture[]>();

  for (const pawn of fixture.pawns) {
    const coord = getPawnCoordinate(pawn);
    if (!coord) continue;
    const key = `${coord[0]}:${coord[1]}`;
    occupied.set(key, [...(occupied.get(key) ?? []), pawn]);
  }

  return (
    <div className="rules-page__board-block">
      <div
        className="rules-board"
        data-testid="tutorial-board"
        aria-label={`Пример правила: ${title}`}
      >
        <div className="rules-board__reserves">
          {(['RED', 'BLUE', 'GREEN', 'YELLOW'] as const).map((color) => (
            <div
              key={color}
              className={`rules-board__reserve rules-board__reserve--${color.toLowerCase()}`}
            >
              {renderReservePawns(fixture, color)}
            </div>
          ))}
        </div>

        <div className="rules-board__grid">
          {Array.from({ length: 64 }).map((_, index) => {
            const row = Math.floor(index / 8);
            const col = index % 8;
            const tone = getCellTone(row, col);
            const pawns = occupied.get(`${row}:${col}`) ?? [];
            const isPath = path.some(([pathRow, pathCol]) => pathRow === row && pathCol === col);

            return (
              <div
                key={`${row}-${col}`}
                className={[
                  'rules-board__cell',
                  `rules-board__cell--${tone}`,
                  isPath ? 'rules-board__cell--path' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {pawns.map((pawn) => (
                  <span
                    key={pawn.pawnId}
                    className={[
                      'rules-pawn',
                      colorClass(pawn.color),
                      pawn.emphasis ? `rules-pawn--${pawn.emphasis.toLowerCase()}` : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden="true"
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <p className="rules-page__board-caption">
        Фиксированный пример без подключения живого матча, сокета и игровой очереди.
      </p>
    </div>
  );
}

export function RulesPage({ guidedStartKey }: { guidedStartKey?: number }) {
  const [guidedStepIndex, setGuidedStepIndex] = useState<number | null>(null);

  useEffect(() => {
    if (guidedStartKey === undefined) return;
    setGuidedStepIndex(0);
  }, [guidedStartKey]);

  const currentTopic =
    guidedStepIndex === null ? null : rulesContent.topics[guidedStepIndex] ?? null;
  const currentFixture =
    guidedStepIndex === null ? null : rulesContent.fixtures[guidedStepIndex] ?? null;

  if (currentTopic && currentFixture) {
    const stepIndex = guidedStepIndex!;
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === tutorialStepOrder.length - 1;
    const topicImportant = 'important' in currentTopic ? currentTopic.important : undefined;
    const fixtureImportant =
      'important' in currentFixture ? currentFixture.important : undefined;
    const topicCounterExample =
      'counterExample' in currentTopic ? currentTopic.counterExample : undefined;
    const fixtureCounterExample =
      'counterExample' in currentFixture ? currentFixture.counterExample : undefined;

    return (
      <div className="rules-page">
        <section className="rules-page__header rules-page__header--guided">
          <div>
            <p className="rules-page__eyebrow">Пошаговое обучение</p>
            <h1>{rulesContent.screenTitle}</h1>
          </div>
          <Button variant="ghost" onClick={() => setGuidedStepIndex(null)}>
            Закрыть обучение
          </Button>
        </section>

        <Panel as="section" className="rules-page__tutorial">
          <p className="rules-page__progress">
            {stepIndex + 1} / {tutorialStepOrder.length}
          </p>
          <div className="rules-page__tutorial-heading">
            <div className="rules-page__die" aria-label={`Бросок: ${currentFixture.diceValue ?? 'нет'}`}>
              {currentFixture.diceValue ?? '—'}
            </div>
            <div>
              <p className="rules-page__tutorial-kicker">Шаг обучения</p>
              <h2>{currentTopic.shortTitle}</h2>
              <p className="rules-page__summary">{currentTopic.summary}</p>
            </div>
          </div>

          <TutorialBoard
            fixture={currentFixture}
            topicId={currentTopic.id}
            title={currentTopic.shortTitle}
          />

          <ul className="rules-page__notes">
            {currentFixture.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>

          {topicImportant || fixtureImportant ? (
            <div className="rules-page__callout rules-page__callout--important">
              <p className="rules-page__callout-title">Важно</p>
              <p>{fixtureImportant ?? topicImportant}</p>
            </div>
          ) : null}

          {topicCounterExample || fixtureCounterExample ? (
            <div className="rules-page__callout rules-page__callout--warning">
              <p className="rules-page__callout-title">
                {(fixtureCounterExample ?? topicCounterExample)?.title}
              </p>
              <p>{(fixtureCounterExample ?? topicCounterExample)?.description}</p>
            </div>
          ) : null}

          <div className="rules-page__actions">
            <Button
              variant="secondary"
              disabled={isFirst}
              onClick={() => setGuidedStepIndex((index) => (index === null ? 0 : Math.max(0, index - 1)))}
            >
              Назад
            </Button>
            <Button
              onClick={() =>
                setGuidedStepIndex((index) => {
                  if (index === null) return 0;
                  if (index >= tutorialStepOrder.length - 1) return null;
                  return index + 1;
                })
              }
            >
              {isLast ? rulesContent.tutorialDoneLabel : 'Далее'}
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="rules-page">
      <section className="rules-page__header">
        <div>
          <p className="rules-page__eyebrow">Справочник матча</p>
          <h1>{rulesContent.screenTitle}</h1>
        </div>
      </section>

      <Panel as="section" className="rules-page__intro">
        <div className="rules-page__intro-visual" aria-hidden="true">
          <span className="rules-page__intro-die">6</span>
          <div className="rules-page__intro-pawns">
            <span className="rules-pawn rules-pawn--blue" />
            <span className="rules-pawn rules-pawn--green" />
            <span className="rules-pawn rules-pawn--yellow" />
            <span className="rules-pawn rules-pawn--red" />
          </div>
        </div>
        <div className="rules-page__intro-copy">
          <h2>{rulesContent.onboardingTitle}</h2>
          <p>
            {rulesContent.basics.pawnsPerPlayer} {rulesContent.basics.board}
          </p>
          <p>{rulesContent.basics.choiceAfterRoll}</p>
        </div>
        <Button onClick={() => setGuidedStepIndex(0)}>{rulesContent.tutorialCtaLabel}</Button>
      </Panel>

      <section className="rules-page__topic-list" aria-label="Краткие правила">
        {rulesContent.topics.map((topic, index) => (
          <Panel as="article" key={topic.id} className="rules-page__topic" data-testid="rules-topic">
            <p className="rules-page__topic-index">{String(index + 1).padStart(2, '0')}</p>
            <div className="rules-page__topic-copy">
              <h2 data-testid="rules-topic-title">{topic.title}</h2>
              <p>{topic.summary}</p>
            </div>
          </Panel>
        ))}
      </section>
    </div>
  );
}
