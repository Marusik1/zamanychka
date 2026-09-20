export type PremiumSfxName = 'dice-roll' | 'pawn-step' | 'pawn-enter' | 'pawn-capture' | 'pawn-home' | 'victory' | 'defeat';
type PlayOptions = Readonly<{ playbackRate?: number }>;

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
    const volume = source.volume;
    source.volume = 0;
    source.currentTime = 0;
    const playback = source.play();
    if (!playback || typeof playback.then !== 'function') {
      source.volume = volume;
      return;
    }
    void playback.then(() => {
      source.pause();
      source.currentTime = 0;
      source.volume = volume;
    }).catch(() => { source.volume = volume; });
  }

  play(name: PremiumSfxName, options?: PlayOptions) {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(GAMEPLAY_SOUND_ENABLED_KEY) === 'false') return;
    const source = this.audio.get(name);
    if (!source) return;
    source.currentTime = 0;
    source.playbackRate = options?.playbackRate ?? 1;
    const playback = source.play();
    if (playback && typeof playback.catch === 'function') {
      void playback.catch(() => undefined);
    }
  }
}
