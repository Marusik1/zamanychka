import type {
  MatchResultCardDto,
  MatchResultParticipantSummaryDto,
  PlayerMatchOutcome,
} from '@zamanushka/shared';
import { Panel } from '@zamanushka/ui';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function outcomeLabel(outcome: PlayerMatchOutcome) {
  switch (outcome) {
    case 'WIN':
      return 'Победа';
    case 'LOSS':
      return 'Поражение';
    case 'SURRENDERED':
      return 'Сдался';
  }
}

function participantColorLabel(participant: MatchResultParticipantSummaryDto) {
  switch (participant.color) {
    case 'RED':
      return 'К';
    case 'BLUE':
      return 'С';
    case 'GREEN':
      return 'З';
    case 'YELLOW':
      return 'Ж';
  }
}

export function ResultCard({ result }: { result: MatchResultCardDto }) {
  return (
    <Panel as="article" className="profile-result-card" data-testid="profile-result-card">
      <div className="profile-result-card__header">
        <div>
          <span
            className={`profile-result-card__outcome-dot profile-result-card__outcome-dot--${result.currentUserOutcome.toLowerCase()}`}
            aria-hidden="true"
          />
          <h3>{outcomeLabel(result.currentUserOutcome)}</h3>
        </div>
        <div className="profile-result-card__meta">
          <span>{formatTime(result.finishedAt)}</span>
          <span>{result.participantCount} игрока</span>
        </div>
      </div>
      <p className="profile-result-card__summary">
        Победитель: {result.winnerDisplayName}
      </p>
      <ul className="profile-result-card__participants" aria-label="Участники матча">
        {result.participants.map((participant) => (
          <li key={`${result.id}-${participant.userId}`}>
            <span aria-hidden="true">{participantColorLabel(participant)}</span>
            <span>{participant.displayName}</span>
          </li>
        ))}
      </ul>
      <span className="profile-result-card__chevron" aria-hidden="true">›</span>
    </Panel>
  );
}
