export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function easeOutCubic(t: number): number {
  const x = 1 - clamp01(t);
  return 1 - x * x * x;
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOutQuint(t: number): number {
  const x = 1 - clamp01(t);
  return 1 - x * x * x * x * x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
