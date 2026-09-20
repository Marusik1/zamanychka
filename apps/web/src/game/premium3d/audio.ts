export type PremiumSfxName = 'dice-roll' | 'pawn-step' | 'pawn-enter' | 'pawn-capture' | 'pawn-home' | 'victory' | 'defeat';
type PlayOptions = Readonly<{ playbackRate?: number }>;
type AudioDiagnosticEvent = Readonly<{
  event: 'unlock-start' | 'unlock-ok' | 'unlock-failed' | 'play-start' | 'play-ok' | 'play-blocked' | 'play-missing-source' | 'play-disabled';
  name?: PremiumSfxName;
  at: string;
  message?: string;
}>;

declare global {
  interface Window {
    __zGameAudioDiagnostics?: AudioDiagnosticEvent[];
  }
}

export const GAMEPLAY_SOUND_ENABLED_KEY = 'zamanushka.gameplay-sound-enabled';

const SOURCES: Record<PremiumSfxName, string> = {
  'dice-roll': '/assets/zamanushka/sfx/dice-roll.mp3',
  'pawn-step': '/assets/zamanushka/sfx/pawn-step.mp3',
  'pawn-enter': '/assets/zamanushka/sfx/pawn-enter.mp3',
  'pawn-capture': '/assets/zamanushka/sfx/pawn-capture.mp3',
  'pawn-home': '/assets/zamanushka/sfx/pawn-home.mp3',
  victory: '/assets/zamanushka/sfx/victory.mp3',
  defeat: '/assets/zamanushka/sfx/defeat.mp3',
};

const VOLUMES: Record<PremiumSfxName, number> = {
  'pawn-step': 0.12, 'pawn-enter': 0.18, 'dice-roll': 0.24, 'pawn-capture': 0.28,
  'pawn-home': 0.22, victory: 0.34, defeat: 0.24,
};

function recordAudioDiagnostic(entry: Omit<AudioDiagnosticEvent, 'at'>) {
  if (typeof window === 'undefined') return;
  window.__zGameAudioDiagnostics = [
    ...(window.__zGameAudioDiagnostics ?? []),
    { ...entry, at: new Date().toISOString() },
  ].slice(-120);
}

export class PremiumGameAudio {
  private readonly audio = new Map<PremiumSfxName, HTMLAudioElement>();

  constructor() {
    if (typeof Audio === 'undefined') return;
    for (const [name, source] of Object.entries(SOURCES) as [PremiumSfxName, string][]) {
      const element = new Audio(source);
      element.preload = 'auto';
      element.volume = VOLUMES[name];
      this.audio.set(name, element);
    }
  }

  unlock() {
    const source = this.audio.get('dice-roll');
    if (!source) return;
    recordAudioDiagnostic({ event: 'unlock-start', name: 'dice-roll' });
    const volume = source.volume;
    source.volume = 0;
    source.currentTime = 0;
    const playback = source.play();
    if (!playback || typeof playback.then !== 'function') {
      source.volume = volume;
      return;
    }
    void playback.then(() => {
      recordAudioDiagnostic({ event: 'unlock-ok', name: 'dice-roll' });
      source.pause();
      source.currentTime = 0;
      source.volume = volume;
    }).catch((error: unknown) => {
      recordAudioDiagnostic({
        event: 'unlock-failed',
        name: 'dice-roll',
        message: error instanceof Error ? error.message : String(error),
      });
      source.volume = volume;
    });
  }

  play(name: PremiumSfxName, options?: PlayOptions) {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(GAMEPLAY_SOUND_ENABLED_KEY) === 'false') {
      recordAudioDiagnostic({ event: 'play-disabled', name });
      return;
    }
    const source = this.audio.get(name);
    if (!source) {
      recordAudioDiagnostic({ event: 'play-missing-source', name });
      return;
    }
    recordAudioDiagnostic({ event: 'play-start', name });
    source.currentTime = 0;
    source.playbackRate = options?.playbackRate ?? 1;
    const playback = source.play();
    if (playback && typeof playback.then === 'function') {
      void playback
        .then(() => recordAudioDiagnostic({ event: 'play-ok', name }))
        .catch((error: unknown) => {
          recordAudioDiagnostic({
            event: 'play-blocked',
            name,
            message: error instanceof Error ? error.message : String(error),
          });
        });
    }
  }
}
