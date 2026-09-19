import React from 'react';
import type { RoomSummary } from '../../types/ui';
import { Icon } from '../ui/Icon';

export function RoomCard({ room, onOpen }: { room: RoomSummary; onOpen: (id: string) => void }) {
  const active = room.status === 'playing';
  return (
    <button type="button" className="z-room-card z-surface" onClick={() => onOpen(room.id)}>
      <img src={room.imageUrl} alt="" aria-hidden="true" />
      <span className="z-room-card__content">
        <span className="z-room-card__head"><strong>{room.name}</strong><Icon name="chevron" /></span>
        <span className="z-room-card__status"><i className={active ? 'is-playing' : 'is-waiting'} />{active ? 'Идёт матч' : 'Ожидает игроков'}</span>
        <span className="z-room-card__meta">
          <span><Icon name="users" /> {room.players} / {room.maxPlayers}</span>
          <span>{room.readyCount} {room.readyCount === 1 ? 'готов' : 'готовы'}</span>
        </span>
      </span>
    </button>
  );
}
