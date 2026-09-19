import React from 'react';

type IconName =
  | 'home' | 'rooms' | 'profile' | 'plus' | 'refresh' | 'chevron'
  | 'settings' | 'skins' | 'stats' | 'rules' | 'users' | 'copy'
  | 'back' | 'more' | 'trophy';

interface Props extends React.SVGProps<SVGSVGElement> { name: IconName; }

export function Icon({ name, ...props }: Props) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const path: Record<IconName, React.ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/></>,
    rooms: <><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/><circle cx="7" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="7" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="7" cy="18" r="1" fill="currentColor" stroke="none"/></>,
    profile: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.8-4.2 3.3-6.5 7.5-6.5s6.7 2.3 7.5 6.5"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.2 9A7 7 0 0 0 6.7 6.8L4 9"/><path d="M5.8 15A7 7 0 0 0 17.3 17.2L20 15"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3h4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.1v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    skins: <><path d="M4 8h16v12H4z"/><path d="M8 8V4h8v4"/><path d="M9 12h6"/></>,
    stats: <><path d="M5 20V11"/><path d="M12 20V5"/><path d="M19 20V8"/></>,
    rules: <><path d="M6 4h12v16H6z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/></>,
    users: <><circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.4"/><path d="M3.5 20c.6-3.6 2.5-5.5 5.5-5.5s4.9 1.9 5.5 5.5"/><path d="M14.5 15c3.2-.2 5.2 1.4 6 4.3"/></>,
    copy: <><rect x="8" y="8" width="10" height="10" rx="2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></>,
    back: <><path d="m15 18-6-6 6-6"/></>,
    more: <><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/></>,
    trophy: <><path d="M8 4h8v4c0 4-1.5 6-4 6s-4-2-4-6V4Z"/><path d="M8 6H4c0 3 1.4 5 4 5"/><path d="M16 6h4c0 3-1.4 5-4 5"/><path d="M12 14v4"/><path d="M8 20h8"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common} {...props}>{path[name]}</svg>;
}
