import React from 'react';
import type { MatchSummary, NavTab, ProfileSummary } from '../../types/ui';
import { BottomNav } from '../navigation/BottomNav';
import { Icon } from '../ui/Icon';
import './profile.css';

type ProfileMenuItem = {
  icon: 'skins' | 'stats' | 'rules';
  label: string;
  handler: () => void;
};

interface Props {
  profile: ProfileSummary;
  onOpenSettings: () => void;
  onOpenSkins?: () => void;
  onOpenStats?: () => void;
  onOpenRules: () => void;
  onOpenHistory: () => void;
  onNavigate: (tab: NavTab) => void;
}

function MatchRow({ match }: { match: MatchSummary }) {
  const label = match.result === 'win' ? 'Победа' : match.result === 'surrender' ? 'Сдался' : 'Поражение';
  return <div className="z-match-row"><i className={`is-${match.result}`} /><div><strong>{label}</strong><span>{match.roomName} · {match.playerCount} игрока</span></div><time>{match.dateLabel}</time></div>;
}

export function ProfileScreen({ profile, onOpenSettings, onOpenSkins, onOpenStats, onOpenRules, onOpenHistory, onNavigate }: Props) {
  const menu: ProfileMenuItem[] = [
    ...(onOpenSkins ? [{ icon: 'skins' as const, label: 'Коллекция скинов', handler: onOpenSkins }] : []),
    ...(onOpenStats ? [{ icon: 'stats' as const, label: 'Статистика', handler: onOpenStats }] : []),
    { icon: 'rules', label: 'Правила игры', handler: onOpenRules },
  ];
  return (
    <div className="z-screen">
      <div className="z-page z-profile">
        <header className="z-page-head"><h1 className="z-title">Профиль</h1><button className="z-icon-button" aria-label="Настройки" onClick={onOpenSettings}><Icon name="settings" /></button></header>

        <section className="z-profile-id">
          <div className="z-profile-avatar">{profile.initials}</div>
          <strong>{profile.displayName}</strong>
        </section>

        <section className="z-stats z-surface" aria-label="Статистика игрока">
          <div><strong>{profile.games}</strong><span>Игр</span></div>
          <div><strong>{profile.wins}</strong><span>Побед</span></div>
          <div><strong>{profile.winRate}%</strong><span>Винрейт</span></div>
        </section>

        <section className="z-profile-menu z-surface">
          {menu.map((item) => <button type="button" key={item.label} onClick={item.handler}><span><Icon name={item.icon} />{item.label}</span><Icon name="chevron" /></button>)}
        </section>

        <section className="z-recent">
          <div className="z-section-head"><h2>Недавние матчи</h2><button type="button" onClick={onOpenHistory}>Все →</button></div>
          <div className="z-match-list z-surface">{profile.recentMatches.map((m) => <MatchRow key={m.id} match={m} />)}</div>
        </section>
      </div>
      <BottomNav active="profile" onNavigate={onNavigate} />
    </div>
  );
}
