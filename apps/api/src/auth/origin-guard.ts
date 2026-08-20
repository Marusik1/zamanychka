export function isAllowedOrigin(value: string | undefined, allowed: readonly string[]): boolean {
  if (!value || value === 'null') return false;
  try {
    const parsed = new URL(value);
    return parsed.origin === value && allowed.includes(value);
  } catch {
    return false;
  }
}
