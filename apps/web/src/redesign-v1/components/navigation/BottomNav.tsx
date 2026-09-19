import React from 'react';
import type { NavTab } from '../../types/ui';
import { Icon } from '../ui/Icon';
import './bottom-nav.css';

interface Props {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
}

const items: Array<{ id: NavTab; label: string; icon: 'home' | 'rooms' | 'profile' }> = [
  { id: 'home', label: 'Главная', icon: 'home' },
  { id: 'rooms', label: 'Комнаты', icon: 'rooms' },
  { id: 'profile', label: 'Профиль', icon: 'profile' },
];

export function BottomNav({ active, onNavigate }: Props) {
  return (
    <nav className="z-bottom-nav" aria-label="Основная навигация">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={active === item.id ? 'is-active' : ''}
          aria-current={active === item.id ? 'page' : undefined}
          onClick={() => onNavigate(item.id)}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
