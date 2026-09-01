export type PremiumSfxName = 'dice' | 'place' | 'capture' | 'victory';
type PlayOptions = Readonly<{ playbackRate?: number }>;

const SOURCES: Record<PremiumSfxName, string> = {
  dice: '/assets/zamanushka/sfx/dice-clack.wav',
  place: '/assets/zamanushka/sfx/pawn-place.wav',
  capture: '/assets/zamanushka/sfx/capture-clack.wav',
  victory: '/assets/zamanushka/sfx/victory-chime.wav',
};

export class PremiumGameAudio {
  private readonly audio = new Map<PremiumSfxName, HTMLAudioElement>();

  constructor() {
    if (typeof Audio === 'undefined') return;
    for (const [name, source] of Object.entries(SOURCES) as [PremiumSfxName, string][]) {
      const element = new Audio(source);
      element.preload = 'auto';
      element.volume = name === 'victory' ? 0.34 : 0.22;
      this.audio.set(name, element);
    }
  }

  play(name: PremiumSfxName, options?: PlayOptions) {
    const source = this.audio.get(name);
    if (!source) return;
    source.currentTime = 0;
    source.playbackRate = options?.playbackRate ?? 1;
    void source.play().catch(() => undefined);
  }
}
