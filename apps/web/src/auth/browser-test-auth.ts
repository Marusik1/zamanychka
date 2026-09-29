const BROWSER_TEST_DEV_USER_KEY = 'zamanushka:browserTestDevUserKey';
export const BROWSER_TEST_DEV_USER_HEADER = 'x-zamanushka-dev-user-key';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

export function rememberBrowserTestDevUserKey(devUserKey: string | undefined) {
  if (!devUserKey) return;
  storage()?.setItem(BROWSER_TEST_DEV_USER_KEY, devUserKey);
}

export function currentBrowserTestDevUserKey() {
  return storage()?.getItem(BROWSER_TEST_DEV_USER_KEY) ?? undefined;
}

export function browserTestAuthHeaders(): Record<string, string> {
  const devUserKey = currentBrowserTestDevUserKey();
  return devUserKey ? { [BROWSER_TEST_DEV_USER_HEADER]: devUserKey } : {};
}

export function browserTestSocketAuth(): Record<string, string> | undefined {
  const devUserKey = currentBrowserTestDevUserKey();
  return devUserKey ? { devUserKey } : undefined;
}
