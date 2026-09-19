import React, { useMemo, useState } from 'react';
import type { NavTab, RoomStatus, RoomSummary } from '../../types/ui';
import { Icon } from '../ui/Icon';
import { BottomNav } from '../navigation/BottomNav';
import { RoomCard } from './RoomCard';
import './rooms.css';

type Filter = 'all' | RoomStatus;

interface Props {
  rooms: RoomSummary[];
  onCreateRoom: () => void;
  onRefresh: () => void;
  onOpenRoom: (id: string) => void;
  onNavigate: (tab: NavTab) => void;
}

export function RoomsScreen({ rooms, onCreateRoom, onRefresh, onOpenRoom, onNavigate }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const visible = useMemo(() => filter === 'all' ? rooms : rooms.filter((r) => r.status === filter), [rooms, filter]);
  const count = (value: Filter) => value === 'all' ? rooms.length : rooms.filter((r) => r.status === value).length;

  return (
    <div className="z-screen">
      <div className="z-page z-rooms">
        <header className="z-page-head">
          <h1 className="z-title">Комнаты</h1>
          <div className="z-page-head__actions">
            <button className="z-icon-button" type="button" aria-label="Обновить список" onClick={onRefresh}><Icon name="refresh" /></button>
            <button className="z-create-room" type="button" aria-label="Создать комнату" onClick={onCreateRoom}><Icon name="plus" /></button>
          </div>
        </header>

        <div className="z-room-filters" role="tablist" aria-label="Фильтр комнат">
          {([['all','Все'],['waiting','Ожидают'],['playing','Играют']] as const).map(([value,label]) => (
            <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>
              {label} <span>{count(value)}</span>
            </button>
          ))}
        </div>

        <section className="z-room-list" aria-live="polite">
          {visible.map((room) => <RoomCard key={room.id} room={room} onOpen={onOpenRoom} />)}
          {visible.length === 0 && (
            <div className="z-empty z-surface"><strong>Комнат пока нет</strong><span>Создайте свою или обновите список.</span><button className="z-button z-button--primary" onClick={onCreateRoom}>Создать комнату</button></div>
          )}
        </section>
      </div>
      <BottomNav active="rooms" onNavigate={onNavigate} />
    </div>
  );
}
