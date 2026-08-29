import type { ReactNode } from 'react';

import type { NavigationItem } from '@zamanushka/ui';

import { PlaceholderPage } from './placeholder-page.js';

export type ShellRouteKey = 'home' | 'rooms' | 'chat' | 'collection' | 'profile';

interface ShellRoute {
  key: ShellRouteKey;
  hash: string;
  title: string;
  description: string;
  eyebrow: string;
  scaffoldLabel: string;
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
    description: 'Раздел появится в следующем этапе.',
    eyebrow: 'Оболочка приложения',
    scaffoldLabel: 'Каркас главного раздела',
    icon: routeIcon(['M3.5 9.5 10 4l6.5 5.5', 'M5.5 8.5V16h9V8.5', 'M8.5 16v-4h3v4']),
  },
  {
    key: 'rooms',
    hash: '#/rooms',
    title: 'Комнаты',
    description: 'Раздел появится в следующем этапе.',
    eyebrow: 'Оболочка приложения',
    scaffoldLabel: 'Каркас раздела комнат',
    icon: routeIcon(['M4 6.5h12', 'M4 10h12', 'M4 13.5h7', 'M13.5 13.5h2.5']),
  },
  {
    key: 'chat',
    hash: '#/chat',
    title: 'Чат',
    description: 'Раздел появится в следующем этапе.',
    eyebrow: 'Оболочка приложения',
    scaffoldLabel: 'Каркас раздела чата',
    icon: routeIcon(['M4.5 5.5h11v7h-6L6 15v-2.5H4.5z', 'M7.5 8.5h5']),
  },
  {
    key: 'collection',
    hash: '#/collection',
    title: 'Коллекция',
    description: 'Раздел появится в следующем этапе.',
    eyebrow: 'Оболочка приложения',
    scaffoldLabel: 'Каркас раздела коллекции',
    icon: routeIcon([
      'M4.5 4.5h4.5v4.5H4.5z',
      'M11 4.5h4.5v4.5H11z',
      'M4.5 11h4.5v4.5H4.5z',
      'M11 11h4.5v4.5H11z',
    ]),
  },
  {
    key: 'profile',
    hash: '#/profile',
    title: 'Профиль',
    description: 'Раздел появится в следующем этапе.',
    eyebrow: 'Оболочка приложения',
    scaffoldLabel: 'Каркас раздела профиля',
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
  const normalized = hash === '#/profile/history' ? '#/profile' : hash;
  const matchedRoute = shellRoutes.find((route) => route.hash === normalized);
  if (matchedRoute) return matchedRoute;

  const defaultRoute = shellRoutes[0];
  if (!defaultRoute) {
    throw new Error('Shell routes must include a default route.');
  }

  return defaultRoute;
}

export function renderShellRoute(hash: string) {
  const route = resolveShellRoute(hash);

  return {
    activeKey: route.key,
    page: (
      <PlaceholderPage
        eyebrow={route.eyebrow}
        title={route.title}
        description={route.description}
        scaffoldLabel={route.scaffoldLabel}
      />
    ),
  };
}
