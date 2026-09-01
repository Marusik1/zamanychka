import type { GameScreenPawnView } from './domain.js';

type AvatarColor = GameScreenPawnView['color'];

function initialsFromName(name: string | null | undefined): string {
  const parts = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return '?';

  return parts
    .map((part) => Array.from(part)[0] ?? '')
    .join('')
    .toUpperCase();
}

export function GameAvatar({
  color,
  name,
  photoUrl,
  index = 0,
}: {
  color: AvatarColor;
  name: string;
  photoUrl?: string | null | undefined;
  index?: number;
}) {
  return (
    <span
      className={`game-board-scene__avatar game-board-scene__avatar--${color.toLowerCase()}`}
      data-avatar-index={index}
      aria-hidden="true"
    >
      {photoUrl ? (
        <img
          className="game-board-scene__avatar-portrait"
          src={photoUrl}
          alt=""
          draggable={false}
        />
      ) : (
        <span className="game-board-scene__avatar-fallback">{initialsFromName(name)}</span>
      )}
    </span>
  );
}
