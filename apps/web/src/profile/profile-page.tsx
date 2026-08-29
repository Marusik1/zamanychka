import type { ProfileResponseDto } from '@zamanushka/shared';
import { EmptyState, StatItem } from '@zamanushka/ui';

import { ResultCard } from './result-card.js';

function renderAvatar(profile: ProfileResponseDto['user']) {
  if (profile.avatarUrl) {
    return <img src={profile.avatarUrl} alt="" />;
  }

  return profile.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function ProfilePage({ data }: { data: ProfileResponseDto }) {
  return (
    <div className="profile-page">
      <section className="profile-page__header">
        <div className="profile-page__identity">
          <div className="profile-page__avatar" aria-hidden="true">
            {renderAvatar(data.user)}
          </div>
          <div className="profile-page__identity-copy">
            <p className="profile-page__eyebrow">Профиль игрока</p>
            <h1>Профиль</h1>
            <p className="profile-page__name">{data.user.displayName}</p>
            {data.user.telegramUsername ? (
              <p className="profile-page__handle">@{data.user.telegramUsername}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="profile-page__stats" aria-label="Статистика игрока">
        <StatItem label="Игр" value={data.stats.gamesPlayed} />
        <StatItem label="Побед" value={data.stats.wins} />
        <StatItem label="Поражений" value={data.stats.losses} />
        <StatItem label="Винрейт" value={percent(data.stats.winRate)} />
      </section>

      <section className="profile-page__results">
        <div className="profile-page__section-header">
          <div>
            <p className="profile-page__eyebrow">Последние результаты</p>
            <h2>Недавние матчи</h2>
          </div>
          <a className="profile-page__link-button" href="#/profile/history">
            Вся история
          </a>
        </div>

        {data.recentResults.length === 0 ? (
          <EmptyState
            className="profile-page__empty"
            title="История пока пуста"
            description="Здесь появятся результаты завершённых игр."
          />
        ) : (
          <div className="profile-page__result-list">
            {data.recentResults.map((result) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
