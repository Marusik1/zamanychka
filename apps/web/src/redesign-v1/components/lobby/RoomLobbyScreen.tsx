import React from 'react';
import type { PlayerSlot, RoomDetails } from '../../types/ui';
import { Icon } from '../ui/Icon';
import './lobby.css';

type LobbyAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

interface Props {
  room: RoomDetails;
  isOwner: boolean;
  canStart: boolean;
  onBack: () => void;
  onCopyCode: () => void;
  onMore: () => void;
  onStart: () => void;
  onLeave: () => void;
  primaryAction?: LobbyAction | null;
  secondaryActions?: readonly LobbyAction[];
}

function PlayerSlotCard({ slot }: { slot?: PlayerSlot }) {
  if (!slot?.name) {
    return (
      <div className="z-player-slot is-empty">
        <span className="z-slot-plus"><Icon name="plus" /></span>
        <small>Ожидает<br />игрока</small>
      </div>
    );
  }

  return (
    <div className="z-player-slot">
      <div className="z-player-avatar">{slot.avatarUrl ? <img src={slot.avatarUrl} alt="" /> : slot.initials}</div>
      <strong>{slot.name}{slot.isOwner ? ' ♛' : ''}</strong>
      <span className={slot.ready ? 'is-ready' : ''}><i />{slot.ready ? 'Готов' : 'Не готов'}</span>
    </div>
  );
}

export function RoomLobbyScreen({
  room,
  isOwner,
  canStart,
  onBack,
  onCopyCode,
  onMore,
  onStart,
  onLeave,
  primaryAction = null,
  secondaryActions = [],
}: Props) {
  const slots = Array.from({ length: room.maxPlayers }, (_, i) => room.playersList[i]);

  return (
    <div className="z-screen">
      <div className="z-page z-lobby">
        <header className="z-lobby-head">
          <button className="z-icon-button" aria-label="Назад" onClick={onBack}><Icon name="back" /></button>
          <strong>{room.name}</strong>
          <button className="z-icon-button" aria-label="Ещё" onClick={onMore}><Icon name="more" /></button>
        </header>

        <section className="z-room-cover z-surface">
          <img src={room.imageUrl} alt="" aria-hidden="true" />
          <div className="z-room-code">
            <small>Код комнаты</small>
            <strong>{room.code}</strong>
            <button type="button" aria-label="Скопировать код" onClick={onCopyCode}><Icon name="copy" /></button>
          </div>
        </section>

        <div className="z-lobby-section-title"><strong>Игроки ({room.players} / {room.maxPlayers})</strong></div>
        <section className="z-player-grid">
          {slots.map((slot, idx) => (
            <PlayerSlotCard key={slot?.id ?? `empty-${idx}`} {...(slot ? { slot } : {})} />
          ))}
        </section>

        <div className="z-lobby-ready">{room.readyCount} из {room.maxPlayers} игроков готовы</div>
        {primaryAction ? (
          <button className="z-button z-button--primary z-lobby-start" disabled={primaryAction.disabled} onClick={primaryAction.onClick}>
            {primaryAction.label}
          </button>
        ) : isOwner ? (
          <button className="z-button z-button--primary z-lobby-start" disabled={!canStart} onClick={onStart}>Начать игру</button>
        ) : null}
        {secondaryActions.length > 0 ? (
          <div className="z-lobby-actions">
            {secondaryActions.map((action) => (
              <button
                key={action.label}
                className={action.destructive ? 'z-button z-button--secondary is-destructive' : 'z-button z-button--secondary'}
                type="button"
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
        {secondaryActions.length === 0 ? (
          <button className="z-button z-button--secondary" onClick={onLeave}>Выйти из комнаты</button>
        ) : null}
      </div>
    </div>
  );
}
