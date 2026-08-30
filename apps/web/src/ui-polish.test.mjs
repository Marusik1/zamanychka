import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const webStyles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
const foundationStyles = readFileSync(
  resolve(process.cwd(), '../../packages/ui/src/foundation.css'),
  'utf8',
);

describe('beta UI polish contract', () => {
  it('keeps mobile shell chrome compact and touch accessible', () => {
    expect(foundationStyles).toContain('--shell-header-height-mobile: 60px');
    expect(foundationStyles).toContain('--shell-nav-height-mobile: 64px');
    expect(foundationStyles).toContain('min-height: 44px');
  });

  it('uses a compact two-column lobby and board-first match composition', () => {
    expect(webStyles).toContain('.beta-room-page__seat-grid');
    expect(webStyles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(webStyles).toContain('.beta-room-page__board-panel');
    expect(webStyles).toContain('aspect-ratio: 1');
  });

  it('preserves restrained feedback for reduced-motion users', () => {
    expect(foundationStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(webStyles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
