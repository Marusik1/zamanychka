import type { ReactNode } from 'react';
import type { NavigationItem } from '@zamanushka/ui';

export type ShellRouteKey = 'home' | 'rooms' | 'profile';

interface ShellRoute {
  key: ShellRouteKey;
  hash: string;
  title: string;
  icon: ReactNode;
}

function routeIcon(paths: readonly string[]) {
  return (
    <svg
      aria-hidden="true"
      className="app-shell-route-icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
    >
      {paths.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}

const shellRoutes: readonly ShellRoute[] = [
  {
    key: 'home',
    hash: '#/',
    title: 'Главная',
    icon: routeIcon(['M3.5 9.5 10 4l6.5 5.5', 'M5.5 8.5V16h9V8.5', 'M8.5 16v-4h3v4']),
  },
  {
    key: 'rooms',
    hash: '#/rooms',
    title: 'Комнаты',
    icon: routeIcon(['M4 6.5h12', 'M4 10h12', 'M4 13.5h7', 'M13.5 13.5h2.5']),
  },
  {
    key: 'profile',
    hash: '#/profile',
    title: 'Профиль',
    icon: routeIcon([
      'M10 10a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z',
      'M5.5 15.5a4.5 4.5 0 0 1 9 0',
    ]),
  },
] as const;

export const shellNavigationItems: readonly NavigationItem[] = shellRoutes.map((route) => ({
  key: route.key,
  href: route.hash,
  label: route.title,
  icon: route.icon,
}));

export function resolveShellRoute(hash: string): ShellRoute {
  const normalized =
    hash === '#/profile/history' || hash === '#/profile/rules'
      ? '#/profile'
      : hash === '#/rooms' || hash.startsWith('#/rooms/')
        ? '#/rooms'
        : hash;
  const matchedRoute = shellRoutes.find((route) => route.hash === normalized);
  if (matchedRoute) return matchedRoute;

  const fallback = shellRoutes[0];
  if (!fallback) {
    throw new Error('Shell routes must include a default route.');
  }
  return fallback;
}
