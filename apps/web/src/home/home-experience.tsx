import { useState } from 'react';

import { IntroHero } from '../intro';
import './home-experience.css';
import '../intro/IntroHero.css';

type HomeStats = {
  games: number;
  wins: number;
  winRate: number;
};

type CurrentRoomSummary = {
  roomId: string;
  code: string;
  statusLabel: string;
} | null;

type HomeExperienceProps = {
  displayName: string;
  initials: string;
  stats: HomeStats;
  currentRoom?: CurrentRoomSummary;
  onLogout: () => void;
  onOpenRooms: () => void;
  onOpenRules: () => void;
  onOpenProfile: () => void;
  onOpenCurrentRoom?: (roomId: string) => void;
  introEnabled?: boolean;
};

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <span className="z-home-experience__stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}

export function HomeExperience({
  displayName,
  initials,
  stats,
  currentRoom = null,
  onLogout,
  onOpenRooms,
  onOpenRules,
  onOpenProfile,
  onOpenCurrentRoom,
  introEnabled = true,
}: HomeExperienceProps) {
  const [homeVisible, setHomeVisible] = useState(!introEnabled);

  const continueLabel = currentRoom ? `Продолжить комнату ${currentRoom.code}` : 'Продолжить';
  const continueDescription = currentRoom?.statusLabel ?? 'Откройте комнаты и выберите стол для игры';
  const continueAccessibleLabel = currentRoom
    ? `${continueLabel}. Комната ${currentRoom.code}. ${continueDescription}`
    : `${continueLabel}. Открыть комнаты. ${continueDescription}`;
  const handleContinue = () => {
    if (currentRoom && onOpenCurrentRoom) onOpenCurrentRoom(currentRoom.roomId);
    else onOpenRooms();
  };

  return (
    <div className="z-experience-shell">
      {!homeVisible ? <IntroHero onComplete={() => setHomeVisible(true)} /> : null}

      {homeVisible ? (
        <section className="z-home-experience is-visible" data-testid="z-home-experience">
          <div className="z-home-experience__top">
            <div className="z-home-experience__identity">
              <span className="z-home-experience__avatar">{initials}</span>
              <span>
                <small>Активная сессия</small>
                <strong>{displayName}</strong>
                <span className="z-home-experience__welcome">{`${displayName}, добро пожаловать!`}</span>
              </span>
            </div>
            <button type="button" className="z-home-experience__logout" onClick={onLogout}>
              Выйти
            </button>
          </div>

          <div className="z-home-experience__hero">
            <div className="z-home-experience__table-cue" aria-hidden="true">
              <span className="z-home-experience__mini-board" />
              <span className="z-home-experience__mini-pawn z-home-experience__mini-pawn--red" />
              <span className="z-home-experience__mini-pawn z-home-experience__mini-pawn--blue" />
              <span className="z-home-experience__mini-die" />
            </div>
            <div className="z-home-experience__hero-copy">
              <p>ЗАМАНУШКА</p>
              <h1>Стол уже готов</h1>
              <span>Выберите комнату, вернитесь в матч или быстро освежите правила.</span>
            </div>
          </div>

          <button
            type="button"
            className="z-home-experience__primary"
            aria-label={continueAccessibleLabel}
            onClick={handleContinue}
          >
            <span>
              <strong>{continueLabel}</strong>
              <small>{continueDescription}</small>
            </span>
            <i aria-hidden="true">→</i>
          </button>

          <div className="z-home-experience__stats" aria-label="Статистика">
            <Stat value={stats.games} label="Игр" />
            <Stat value={stats.wins} label="Побед" />
            <Stat value={`${stats.winRate}%`} label="Винрейт" />
          </div>

          <nav className="z-home-experience__actions" aria-label="Основные действия">
            <button type="button" onClick={onOpenRooms}>
              <span>Комнаты</span>
              <small>Найти стол</small>
            </button>
            <button type="button" aria-label="Правила игры" onClick={onOpenRules}>
              <span>Правила</span>
              <small>Освежить ход</small>
            </button>
            <button type="button" onClick={onOpenProfile}>
              <span>Профиль</span>
              <small>История и статистика</small>
            </button>
          </nav>
        </section>
      ) : null}
    </div>
  );
}
