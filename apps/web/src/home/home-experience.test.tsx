import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeExperience } from './home-experience.js';

class InstantImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    this.onload?.();
  }
}

function installMatchMedia(reducedMotion = false) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reducedMotion && query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function installAnimationClock() {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    return window.setTimeout(() => {
      now += 16;
      callback(now);
    }, 16);
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle: number) => {
    window.clearTimeout(handle);
  });
}

describe('HomeExperience', () => {
  const props = {
    displayName: 'Player One',
    initials: 'PO',
    stats: { games: 7, wins: 3, winRate: 43 },
    onLogout: vi.fn(),
    onOpenRooms: vi.fn(),
    onOpenRules: vi.fn(),
    onOpenProfile: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Image', InstantImage);
    installMatchMedia(false);
    installAnimationClock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('starts with the approved package Intro and no WebGL canvas', async () => {
    render(<HomeExperience {...props} />);
    await act(async () => {
      await Promise.resolve();
    });
    const play = screen.getByRole('button', { name: /Играть/i });

    const intro = screen.getByTestId('z-intro-experience');
    expect(intro).toBeVisible();
    expect(intro).toHaveAttribute('data-phase', 'idle');
    expect(screen.getByRole('heading', { name: 'ЗАМАНУШКА' })).toBeVisible();
    expect(play).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Комнаты/i })).not.toBeInTheDocument();
    expect(intro.querySelector('canvas')).toBeNull();
    expect(screen.queryByTestId('z-home-experience')).not.toBeInTheDocument();
  });

  it('starts the cinematic sequence only once and reveals Home after completion', async () => {
    render(<HomeExperience {...props} />);
    await act(async () => {
      await Promise.resolve();
    });

    const play = screen.getByRole('button', { name: /Играть/i });
    fireEvent.click(play);
    fireEvent.click(play);

    expect(play).toBeDisabled();
    expect(screen.getByTestId('z-intro-experience')).toHaveAttribute('data-phase', 'press');

    await vi.advanceTimersByTimeAsync(500);
    expect(screen.getByTestId('z-intro-experience')).toHaveAttribute('data-phase', 'approach');

    await vi.advanceTimersByTimeAsync(1200);
    expect(screen.getByTestId('z-home-experience')).toBeVisible();

    expect(screen.queryByTestId('z-intro-experience')).not.toBeInTheDocument();
    expect(screen.getByText('Player One')).toBeVisible();
    expect(screen.getByText('7')).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
    expect(screen.getByText('43%')).toBeVisible();
  });

  it('uses the reduced-motion path and still completes to Home', async () => {
    installMatchMedia(true);

    render(<HomeExperience {...props} />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: /Играть/i }));
    expect(screen.getByTestId('z-intro-experience')).toHaveAttribute('data-phase', 'result');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(230);
    });
    expect(screen.getByTestId('z-home-experience')).toBeVisible();
    expect(screen.queryByTestId('z-intro-experience')).not.toBeInTheDocument();
  });

  it('keeps existing Home actions wired to supplied navigation', async () => {
    const onOpenRooms = vi.fn();
    const onOpenRules = vi.fn();
    const onOpenProfile = vi.fn();
    const onOpenCurrentRoom = vi.fn();

    render(
      <HomeExperience
        {...props}
        currentRoom={{ roomId: 'room-248c', code: '248C', statusLabel: 'Матч продолжается' }}
        onOpenRooms={onOpenRooms}
        onOpenRules={onOpenRules}
        onOpenProfile={onOpenProfile}
        onOpenCurrentRoom={onOpenCurrentRoom}
        introEnabled={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Продолжить комнату 248C/i }));

    const actions = screen.getByRole('navigation', { name: 'Основные действия' });
    fireEvent.click(within(actions).getByRole('button', { name: /^Комнаты/i }));
    fireEvent.click(within(actions).getByRole('button', { name: /^Правила/i }));
    fireEvent.click(within(actions).getByRole('button', { name: /^Профиль/i }));

    expect(onOpenCurrentRoom).toHaveBeenCalledWith('room-248c');
    expect(onOpenRooms).toHaveBeenCalledOnce();
    expect(onOpenRules).toHaveBeenCalledOnce();
    expect(onOpenProfile).toHaveBeenCalledOnce();
  });
});
