export function matchDurationMilliseconds(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!startedAt) return null;

  const started = Date.parse(startedAt);
  const ended = finishedAt ? Date.parse(finishedAt) : now.getTime();
  if (!Number.isFinite(started) || !Number.isFinite(ended)) return null;

  return Math.max(0, ended - started);
}

export function formatMatchDuration(milliseconds: number | null): string {
  if (milliseconds === null) return '00:00';

  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainderSeconds = seconds % 60;
  const twoDigits = (value: number) => String(value).padStart(2, '0');

  return hours > 0
    ? `${hours}:${twoDigits(minutes)}:${twoDigits(remainderSeconds)}`
    : `${twoDigits(minutes)}:${twoDigits(remainderSeconds)}`;
}
