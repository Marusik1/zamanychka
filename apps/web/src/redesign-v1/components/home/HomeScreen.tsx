import React from 'react';
import type { MatchSummary, NavTab } from '../../types/ui';
import { Icon } from '../ui/Icon';
import { BottomNav } from '../navigation/BottomNav';
import './home.css';

interface Props {
  displayName: string;
  initials: string;
  heroImageUrl: string;
  currentRoomName?: string;
  lastMatch?: MatchSummary;
  onPrimaryAction: () => void;
  onOpenLastMatch?: () => void;
  onLogout?: () => void;
  onNavigate: (tab: NavTab) => void;
}

export function HomeScreen({ displayName, initials, heroImageUrl, currentRoomName, lastMatch, onPrimaryAction, onOpenLastMatch, onLogout, onNavigate }: Props) {
  const hasCurrent = Boolean(currentRoomName);
  return (
    <div className="z-screen">
      <div className="z-page z-home">
        <header className="z-home__header">
          <div>
            <div className="z-home__brand">ЗАМАНУШКА</div>
            <p>Добрый вечер,</p>
            <strong>{displayName}</strong>
          </div>
          <div className="z-home__header-actions">
            {onLogout ? (
              <button className="z-home__logout" type="button" onClick={onLogout}>
                Выйти
              </button>
            ) : null}
            <div className="z-avatar" aria-label={`Профиль ${displayName}`}>{initials}</div>
          </div>
        </header>

        <section className="z-home-hero z-surface">
          <img src={heroImageUrl} alt="" aria-hidden="true" />
          <div className="z-home-hero__shade" />
          <div className="z-home-hero__content">
            <h1>{hasCurrent ? 'Продолжить игру?' : 'Готовы к партии?'}</h1>
            <p>{hasCurrent ? `У вас активна ${currentRoomName}` : 'Заходите в комнаты, играйте и соревнуйтесь с друзьями.'}</p>
            <button className="z-button z-button--primary" type="button" onClick={onPrimaryAction}>
              {hasCurrent ? 'Продолжить' : 'Найти игру'} <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        {lastMatch && (
          <button type="button" className="z-last-match z-surface" onClick={onOpenLastMatch}>
            <span className="z-last-match__icon"><Icon name="trophy" /></span>
            <span className="z-last-match__content">
              <small>Последний матч</small>
              <strong className={`is-${lastMatch.result}`}>{lastMatch.result === 'win' ? 'Победа' : lastMatch.result === 'surrender' ? 'Сдался' : 'Поражение'}</strong>
              <span>{lastMatch.roomName} · {lastMatch.playerCount} игрока</span>
              <time>{lastMatch.dateLabel}</time>
            </span>
            <Icon name="chevron" className="z-last-match__chevron" />
          </button>
        )}
      </div>
      <BottomNav active="home" onNavigate={onNavigate} />
    </div>
  );
}
