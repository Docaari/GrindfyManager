// Sprint Mini Player 3.1 Wave B / INFO-NEW-3 — Queue button viewport gate.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

describe('MiniPlayerBar Queue button viewport gate (Wave B INFO-NEW-3)', () => {
  const filePath = path.resolve(
    __dirname,
    '../../../client/src/components/audio-player/MiniPlayerBar.tsx',
  );
  const src = readFileSync(filePath, 'utf8');

  it('queue button usa Tailwind `hidden md:inline-flex` para esconder em mobile', () => {
    // garante que o snippet do queue button tem o gate de viewport via Tailwind.
    const queueIdx = src.indexOf('mini-player-queue-button');
    expect(queueIdx).toBeGreaterThan(-1);
    // pega um window de ~600 chars apos o testid
    const window = src.slice(queueIdx, queueIdx + 600);
    expect(window).toMatch(/hidden\s+md:inline-flex/);
  });
});
