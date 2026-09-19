import './mobile-profile.css';

export type MobileProfileStats = { games: number; wins: number; losses: number; winRate: number };
export type MobileProfileMatch = { id: string; result: 'WIN' | 'LOSS' | 'SURRENDERED'; primaryText: string; secondaryText: string; meta: string };
type MobileProfileProps = { displayName: string; initials: string; stats: MobileProfileStats; recentMatches: readonly MobileProfileMatch[]; onOpenRules: () => void; onOpenHistory: () => void; onOpenMatch?: (id: string) => void };

function resultLabel(result: MobileProfileMatch['result']) {
  switch (result) { case 'WIN': return 'Победа'; case 'LOSS': return 'Поражение'; case 'SURRENDERED': return 'Сдался'; }
}

function ChevronRight() {
  return <svg aria-hidden="true" className="z-profile__chevron" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg>;
}

export function MobileProfile({ displayName, initials, stats, recentMatches, onOpenRules, onOpenHistory, onOpenMatch }: MobileProfileProps) {
  return <section className="z-profile" data-testid="mobile-profile">
    <header className="z-profile__header"><h1>Профиль</h1></header>
    <section className="z-profile__identity"><div className="z-profile__avatar" aria-hidden="true">{initials}</div><div className="z-profile__identity-copy"><strong>{displayName}</strong><span>Профиль игрока</span></div></section>
    <section className="z-profile__stats" aria-label="Статистика">{[[stats.games, 'Игры'], [stats.wins, 'Победы'], [stats.losses, 'Поражения'], [`${stats.winRate}%`, 'Винрейт']].map(([value, label]) => <div className="z-profile__stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}</section>
    <section className="z-profile__history">
      <header className="z-profile__section-header"><div><span className="z-profile__eyebrow">ПОСЛЕДНИЕ РЕЗУЛЬТАТЫ</span><h2>Недавние матчи</h2></div><button type="button" onClick={onOpenHistory}>Все<span aria-hidden="true"> →</span></button></header>
      {recentMatches.length === 0 ? <div className="z-profile__empty"><strong>Здесь появятся ваши матчи</strong><span>Завершённые партии будут отображаться в истории.</span></div> : <div className="z-profile__matches">{recentMatches.map((match) => <button key={match.id} type="button" className="z-profile__match" onClick={onOpenMatch ? () => onOpenMatch(match.id) : undefined} disabled={!onOpenMatch}>
        <span className={`z-profile__result-dot z-profile__result-dot--${match.result.toLowerCase()}`} aria-hidden="true" />
        <span className="z-profile__match-copy"><span className="z-profile__match-top"><strong className={`z-profile__result z-profile__result--${match.result.toLowerCase()}`}>{resultLabel(match.result)}</strong><span>{match.meta}</span></span><span className="z-profile__match-primary">{match.primaryText}</span><span className="z-profile__match-secondary">{match.secondaryText}</span></span>
        {onOpenMatch ? <ChevronRight /> : null}
      </button>)}</div>}
    </section>
    <button type="button" className="z-profile__rules" onClick={onOpenRules}><span>Правила игры</span><ChevronRight /></button>
  </section>;
}
