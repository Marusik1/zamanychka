import type { DieValue } from './dice.js';

const pips: Record<DieValue, readonly [number, number][]> = {
  1: [[50, 50]],
  2: [
    [31, 31],
    [69, 69],
  ],
  3: [
    [31, 31],
    [50, 50],
    [69, 69],
  ],
  4: [
    [31, 31],
    [69, 31],
    [31, 69],
    [69, 69],
  ],
  5: [
    [31, 31],
    [69, 31],
    [50, 50],
    [31, 69],
    [69, 69],
  ],
  6: [
    [31, 28],
    [31, 50],
    [31, 72],
    [69, 28],
    [69, 50],
    [69, 72],
  ],
};

export function PremiumDieV2({
  value,
  rolling = false,
  label = `Кубик: ${value}`,
  className = '',
}: {
  value: DieValue;
  rolling?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={['premium-die', rolling ? 'premium-die--rolling' : '', className]
        .filter(Boolean)
        .join(' ')}
      role="img"
      aria-label={label}
      data-value={value}
      data-die-value={value}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`dieIvory-${value}`} x1="14%" y1="8%" x2="86%" y2="92%">
            <stop offset="0%" stopColor="#fffdf4" />
            <stop offset="48%" stopColor="#eee8d5" />
            <stop offset="100%" stopColor="#c7bda6" />
          </linearGradient>
        </defs>
        <rect
          x="9"
          y="7"
          width="82"
          height="84"
          rx="18"
          fill={`url(#dieIvory-${value})`}
          stroke="#b8ad97"
          strokeWidth="2"
        />
        <path
          d="M22 16C38 10 63 10 78 17"
          fill="none"
          stroke="#fff"
          strokeOpacity=".72"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {pips[value].map(([x, y], index) => (
          <g key={`${x}-${y}-${index}`}>
            <circle
              className="game-die__pip-shadow"
              cx={x}
              cy={y + 1.5}
              r="8.6"
              fill="#8f8778"
              opacity=".25"
            />
            <circle className="game-die__pip is-on" cx={x} cy={y} r="7.2" fill="#111" />
            <circle cx={x - 2.1} cy={y - 2.3} r="1.55" fill="#fff" opacity=".24" />
          </g>
        ))}
      </svg>
    </span>
  );
}
