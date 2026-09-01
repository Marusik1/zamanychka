import type { ReactNode } from 'react';

import type { GameScreenPawnView } from './domain.js';

type PawnTone = 'red' | 'blue' | 'green' | 'yellow';

export type PawnMotion =
  | 'idle'
  | 'selected'
  | 'entering'
  | 'moving'
  | 'captured'
  | 'home-cue'
  | 'home-complete'
  | 'removed';

export type PawnSize = 'reserve' | 'panel' | 'board';

const pawnPalette: Record<
  PawnTone,
  { light: string; main: string; dark: string; edge: string; reflected: string }
> = {
  red: {
    light: '#f06a55',
    main: '#b92f23',
    dark: '#6b160f',
    edge: '#3a0b08',
    reflected: '#f4a26e',
  },
  blue: {
    light: '#5aa8ea',
    main: '#246cad',
    dark: '#133e6d',
    edge: '#092746',
    reflected: '#78bff1',
  },
  green: {
    light: '#89c85e',
    main: '#4f922d',
    dark: '#285619',
    edge: '#17370f',
    reflected: '#a1d878',
  },
  yellow: {
    light: '#f6c64b',
    main: '#d69411',
    dark: '#8b5708',
    edge: '#593405',
    reflected: '#f9d779',
  },
};

function toneFromColor(color: GameScreenPawnView['color']): PawnTone {
  switch (color) {
    case 'RED':
      return 'red';
    case 'BLUE':
      return 'blue';
    case 'GREEN':
      return 'green';
    case 'YELLOW':
      return 'yellow';
  }
}

function pawnStateClassName(pawn: GameScreenPawnView, motion: PawnMotion, size: PawnSize): string {
  const tone = toneFromColor(pawn.color);
  const modifiers = [`game-pawn--${tone}`, `game-pawn--${size}`, `game-pawn--motion-${motion}`];
  if (pawn.position.zone === 'OFF_BOARD') modifiers.push('game-pawn--reserve');
  if (pawn.position.zone === 'HOME') modifiers.push('game-pawn--home');
  if (pawn.position.zone === 'REMOVED') modifiers.push('game-pawn--removed');
  return ['game-pawn', ...modifiers].join(' ');
}

function safeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function GamePawn({
  pawn,
  children,
  motion = 'idle',
  size = 'board',
}: {
  pawn: GameScreenPawnView;
  children?: ReactNode;
  motion?: PawnMotion;
  size?: PawnSize;
}) {
  const tone = toneFromColor(pawn.color);
  const palette = pawnPalette[tone];
  const id = safeToken(pawn.pawnId);

  return (
    <div
      className={pawnStateClassName(pawn, motion, size)}
      aria-label={`${pawn.color} pawn`}
      data-pawn-id={pawn.pawnId}
      data-player-id={pawn.playerId}
      data-motion={motion}
      data-testid={pawn.pawnId}
    >
      <svg
        className="game-pawn__svg"
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 72 94"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id={`pawnHead-${id}`} cx="31%" cy="23%" r="76%">
            <stop offset="0%" stopColor="#fff4dc" stopOpacity=".78" />
            <stop offset="13%" stopColor={palette.light} />
            <stop offset="52%" stopColor={palette.main} />
            <stop offset="83%" stopColor={palette.dark} />
            <stop offset="100%" stopColor={palette.edge} />
          </radialGradient>
          <linearGradient id={`pawnBody-${id}`} x1="4%" y1="14%" x2="92%" y2="82%">
            <stop offset="0%" stopColor={palette.dark} />
            <stop offset="27%" stopColor={palette.main} />
            <stop offset="47%" stopColor={palette.light} />
            <stop offset="68%" stopColor={palette.main} />
            <stop offset="100%" stopColor={palette.edge} />
          </linearGradient>
          <linearGradient id={`pawnBase-${id}`} x1="12%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%" stopColor={palette.light} />
            <stop offset="28%" stopColor={palette.main} />
            <stop offset="72%" stopColor={palette.dark} />
            <stop offset="100%" stopColor={palette.edge} />
          </linearGradient>
          <linearGradient id={`pawnReflection-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".42" />
            <stop offset="58%" stopColor={palette.reflected} stopOpacity=".17" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <filter id={`pawnShadow-${id}`} x="-40%" y="-40%" width="180%" height="190%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          <filter id={`pawnSoft-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation=".45" />
          </filter>
        </defs>

        <ellipse
          cx="38"
          cy="88"
          rx="25"
          ry="5.4"
          fill="#000"
          opacity=".38"
          filter={`url(#pawnShadow-${id})`}
        />

        <circle
          cx="36"
          cy="19"
          r="13.2"
          fill={`url(#pawnHead-${id})`}
          stroke={palette.edge}
          strokeOpacity=".48"
          strokeWidth=".9"
        />
        <ellipse
          cx="31.5"
          cy="14.3"
          rx="3.1"
          ry="4.7"
          fill="#fff"
          opacity=".24"
          transform="rotate(24 31.5 14.3)"
          filter={`url(#pawnSoft-${id})`}
        />

        <path
          d="M30.4 31.5C30.8 28.8 41.2 28.8 41.6 31.5L42.8 42.8H29.2Z"
          fill={`url(#pawnBody-${id})`}
        />

        <ellipse
          cx="36"
          cy="42.5"
          rx="19.4"
          ry="6.6"
          fill={`url(#pawnBase-${id})`}
          stroke={palette.edge}
          strokeOpacity=".3"
          strokeWidth=".7"
        />

        <path
          d="M25.2 44.4C26.5 54 21.2 63.1 17.5 69.5C22.5 75.9 49.4 75.9 54.5 69.5C50.7 63.1 45.5 54 46.8 44.4Z"
          fill={`url(#pawnBody-${id})`}
          stroke={palette.edge}
          strokeOpacity=".34"
          strokeWidth=".8"
        />

        <path
          d="M29 49.2C31 53.5 27.7 61.9 24.1 67.1"
          fill="none"
          stroke={`url(#pawnReflection-${id})`}
          strokeLinecap="round"
          strokeWidth="3.4"
          opacity=".78"
        />

        <ellipse
          cx="36"
          cy="70.5"
          rx="25.2"
          ry="7.8"
          fill={`url(#pawnBase-${id})`}
          stroke={palette.edge}
          strokeOpacity=".38"
          strokeWidth=".8"
        />

        <path
          d="M12.5 70.5C12.5 77.6 15.1 82.9 18.3 85.5H53.7C56.9 82.9 59.5 77.6 59.5 70.5Z"
          fill={`url(#pawnBase-${id})`}
          stroke={palette.edge}
          strokeOpacity=".4"
          strokeWidth=".8"
        />

        <ellipse cx="36" cy="83.7" rx="22.8" ry="4.8" fill={palette.dark} opacity=".7" />
        <ellipse
          cx="31"
          cy="72.3"
          rx="9"
          ry="2.1"
          fill="#fff"
          opacity=".12"
          transform="rotate(-8 31 72.3)"
        />
      </svg>
      {children}
    </div>
  );
}
