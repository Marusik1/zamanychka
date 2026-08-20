import type { ReactNode } from 'react';

import type { NavigationItem } from '@zamanushka/ui';

import { PlaceholderPage } from './placeholder-page.js';

export type ShellRouteKey = 'home' | 'rooms' | 'chat' | 'collection' | 'profile';

type ShellRoute = {
  key: ShellRouteKey;
  hash: string;
  title: string;
  description: string;
  eyebrow: string;
  scaffoldLabel: string;
};

const shellRoutes: readonly ShellRoute[] = [
  {
    key: 'home',
    hash: '#/',
    title: 'Home',
    description: 'This area is reserved for shell and spacing verification only.',
    eyebrow: 'Shell preview',
    scaffoldLabel: 'Home placeholder scaffold',
  },
  {
    key: 'rooms',
    hash: '#/rooms',
    title: 'Rooms',
    description: 'Room surfaces stay intentionally empty until the rooms epic is implemented.',
    eyebrow: 'Placeholder route',
    scaffoldLabel: 'Rooms placeholder scaffold',
  },
  {
    key: 'chat',
    hash: '#/chat',
    title: 'Chat',
    description: 'Chat remains a layout-only destination in this shell milestone.',
    eyebrow: 'Placeholder route',
    scaffoldLabel: 'Chat placeholder scaffold',
  },
  {
    key: 'collection',
    hash: '#/collection',
    title: 'Collection',
    description: 'Collection styling can be checked here without implying board skin behavior.',
    eyebrow: 'Placeholder route',
    scaffoldLabel: 'Collection placeholder scaffold',
  },
  {
    key: 'profile',
    hash: '#/profile',
    title: 'Profile',
    description: 'Profile space is limited to navigation and composition checks for now.',
    eyebrow: 'Placeholder route',
    scaffoldLabel: 'Profile placeholder scaffold',
  },
] as const;

function icon(label: string): ReactNode {
  return <span className="app-shell-route-icon">{label}</span>;
}

export const shellNavigationItems: readonly NavigationItem[] = shellRoutes.map((route) => ({
  key: route.key,
  href: route.hash,
  label: route.title,
  icon: icon(route.title.slice(0, 1)),
}));

export function resolveShellRoute(hash: string): ShellRoute {
  return shellRoutes.find((route) => route.hash === hash) ?? shellRoutes[0];
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
