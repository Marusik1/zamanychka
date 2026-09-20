import type { ReactNode } from 'react';
import './bot-seat-controls.css';

export interface BotSeatControlsProps {
  isHost: boolean;
  roomLocked?: boolean;
  participantKind?: 'HUMAN' | 'BOT' | null;
  busy?: boolean;
  onAddBot: () => void | Promise<void>;
  onRemoveBot: () => void | Promise<void>;
  children?: ReactNode;
}

export function BotSeatControls({
  isHost,
  roomLocked = false,
  participantKind = null,
  busy = false,
  onAddBot,
  onRemoveBot,
  children,
}: BotSeatControlsProps) {
  if (!isHost || roomLocked || participantKind === 'HUMAN') {
    return <>{children}</>;
  }

  if (participantKind === 'BOT') {
    return (
      <div className="bot-seat-controls" data-participant-kind="BOT">
        {children}
        <span className="bot-seat-controls__badge">BOT</span>
        <button
          type="button"
          className="bot-seat-controls__action"
          disabled={busy}
          onClick={() => void onRemoveBot()}
        >
          Удалить бота
        </button>
      </div>
    );
  }

  return (
    <div className="bot-seat-controls" data-participant-kind="EMPTY">
      {children}
      <button
        type="button"
        className="bot-seat-controls__action"
        disabled={busy}
        onClick={() => void onAddBot()}
      >
        + Добавить бота
      </button>
    </div>
  );
}
