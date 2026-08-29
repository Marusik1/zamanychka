import type { MatchResultCardDto } from '@zamanushka/shared';
import { Button, EmptyState } from '@zamanushka/ui';

import { ResultCard } from './result-card.js';

export function HistoryPage({
  items,
  nextCursor,
  onLoadMore,
}: {
  items: MatchResultCardDto[];
  nextCursor: string | null;
  onLoadMore: () => void;
}) {
  return (
    <div className="profile-page">
      <section className="profile-page__section-header">
        <div>
          <p className="profile-page__eyebrow">Профиль игрока</p>
          <h1>История игр</h1>
        </div>
        <a className="profile-page__link-button profile-page__link-button--ghost" href="#/profile">
          Назад в профиль
        </a>
      </section>

      {items.length === 0 ? (
        <EmptyState
          className="profile-page__empty"
          title="История пока пуста"
          description="Здесь появятся результаты завершённых игр."
        />
      ) : (
        <div className="profile-page__result-list">
          {items.map((result) => (
            <ResultCard key={result.id} result={result} />
          ))}
        </div>
      )}

      {nextCursor ? (
        <div className="profile-page__load-more">
          <Button variant="secondary" onClick={onLoadMore}>
            Показать ещё
          </Button>
        </div>
      ) : null}
    </div>
  );
}
