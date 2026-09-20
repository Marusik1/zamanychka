import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FullscreenIntroGate, FullscreenScrubPortal } from './FullscreenIntroGate.js';

describe('FullscreenIntroGate', () => {
  beforeEach(() => {
    class InstantImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = vi.fn(async () => undefined);

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal('Image', InstantImage);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-intro-active');
    document.documentElement.classList.remove('zamanushka-scrub-active');
    document.body.classList.remove('zamanushka-scrub-active');
    document.documentElement.style.removeProperty('--zamanushka-viewport-height');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });

  it('owns the viewport before AppShell and starts the supplied scrub in a body portal only once', async () => {
    const onComplete = vi.fn();
    const renderScrub = vi.fn(({ running, onComplete: complete }) => (
      <button type="button" onClick={complete}>
        scrub {running ? 'running' : 'idle'}
      </button>
    ));

    render(<FullscreenIntroGate onComplete={onComplete} renderScrub={renderScrub} />);

    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(document.documentElement.dataset.introActive).toBe('true');
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(document.querySelector('.z-fullscreen-intro__poster-image')).toHaveAttribute(
      'src',
      '/intro/approved-start.png',
    );
    expect(screen.queryByText('scrub idle')).not.toBeInTheDocument();
    expect(screen.queryByText('scrub running')).not.toBeInTheDocument();
    expect(document.body.querySelector('.zScrubViewport')).toBeNull();

    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('scrub running')).toBeInTheDocument();
    expect(document.body.querySelector('.zScrubViewport')).toBeInTheDocument();
    expect(document.body.querySelector('.z-fullscreen-intro .zScrubViewport')).toBeNull();
    expect(screen.queryByRole('button', { name: /play|играть|Р/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('scrub running'));
    fireEvent.click(screen.getByText('scrub running'));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('restores document overflow when unmounted', () => {
    const { unmount } = render(
      <FullscreenIntroGate
        onComplete={vi.fn()}
        renderScrub={() => <span>scrub running</span>}
      />,
    );

    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.documentElement.dataset.introActive).toBeUndefined();
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('');
  });

  it('mounts the supplied scrub directly into document.body while active', () => {
    render(
      <FullscreenScrubPortal active>
        <section data-scrub-root data-testid="existing-scrub">
          approved scrub
        </section>
      </FullscreenScrubPortal>,
    );

    const viewport = screen.getByText('approved scrub').closest('.zScrubViewport');
    expect(viewport).toBeInTheDocument();
    expect(viewport?.parentElement).toBe(document.body);
    expect(document.documentElement).toHaveClass('zamanushka-scrub-active');
    expect(document.documentElement.style.getPropertyValue('--zamanushka-viewport-height')).toMatch(/px$/);
    expect(screen.getByTestId('existing-scrub')).toHaveAttribute('data-scrub-root');
  });
});
