// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1.2 / RF-02 - Migrar cover className para cn() helper
//
// Spec: Docs/specs/sprint-mini-player-1.2.md RF-02 (LOW-2)
//
// Target: client/src/components/audio-player/MiniPlayerBar.tsx (linha ~189)
//
// Background: hoje cover className usa string concat:
//   'w-12 h-12 rounded-md object-cover ...' + (isPlaying && !reducedMotion ?
//     ' animate-spin-slow' : '')
// Migrar pra:
//   cn('w-12 h-12 rounded-md object-cover ...',
//      isPlaying && !reducedMotion && 'animate-spin-slow')
//
// Cobertura (className assertions — comportamento identico):
//   - source NAO usa mais string concat (` + ` no className em volta de
//     condicional animate-spin-slow).
//   - source importa { cn } de '@/lib/utils' OR '@/lib/utils/cn'.
//   - quando isPlaying=true + !reducedMotion: className contem 'animate-spin-slow'.
//   - quando isPlaying=false: className NAO contem 'animate-spin-slow'.
//   - sempre contem classes base 'w-12 h-12 rounded-md object-cover'.
//   - sempre contem 'mini-player-cover' (regressao MP1 marker).
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import {
  AudioPlayerProvider,
  useAudioPlayer,
} from '@/contexts/AudioPlayerContext';
import { MiniPlayerBar } from '@/components/audio-player/MiniPlayerBar';

function PlayInitiator({
  coverUrl,
  autoPlay = true,
}: {
  coverUrl: string | null;
  autoPlay?: boolean;
}) {
  const ctx = useAudioPlayer();
  return (
    <button
      data-testid="trigger-play"
      onClick={() => {
        ctx.playTrack({
          source: 'library',
          trackId: 'l1',
          title: 'Aula 1',
          coverUrl,
          courseTitle: 'Curso',
          durationSeconds: 1200,
          audioUrl: '/audio/l1.mp3',
        });
        if (!autoPlay) {
          ctx.toggle(); // pausa
        }
      }}
    >
      play
    </button>
  );
}

describe('<MiniPlayerBar> RF-02 cn() helper migration', () => {
  it('source de MiniPlayerBar.tsx importa cn de @/lib/utils', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      process.cwd(),
      'client/src/components/audio-player/MiniPlayerBar.tsx',
    );
    const src = fs.readFileSync(filePath, 'utf8');

    // Aceita ambos: `import { cn } from '@/lib/utils'` ou subpath.
    const hasCnImport = /import\s*\{[^}]*\bcn\b[^}]*\}\s*from\s*['"]@\/lib\/utils/.test(
      src,
    );
    expect(hasCnImport).toBe(true);
  });

  it('source NAO contem mais string concat condicional pro cover className', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      process.cwd(),
      'client/src/components/audio-player/MiniPlayerBar.tsx',
    );
    const src = fs.readFileSync(filePath, 'utf8');

    // Pattern anti: `+ (isPlaying && !reducedMotion ? " animate-spin-slow"`
    // ou `+ (isPlaying && !reducedMotion ? ' animate-spin-slow'`.
    const antiPattern =
      /\+\s*\(\s*isPlaying\s*&&\s*!reducedMotion\s*\?\s*['"]\s*animate-spin-slow/;
    expect(antiPattern.test(src)).toBe(false);
  });

  it('source contem chamada cn(...) com animate-spin-slow conditional', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      process.cwd(),
      'client/src/components/audio-player/MiniPlayerBar.tsx',
    );
    const src = fs.readFileSync(filePath, 'utf8');

    // Pattern: `cn(...` ou `className={cn(...` algures no arquivo, e o spin-slow
    // deve aparecer logicamente dentro do helper.
    const cnUsage = /cn\(/.test(src);
    expect(cnUsage).toBe(true);

    // animate-spin-slow ainda deve existir no source (caso contrario migracao
    // engoliu a classe).
    expect(src).toContain('animate-spin-slow');
  });

  it('comportamento identico: isPlaying=true + cover -> img contem animate-spin-slow', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator coverUrl="https://cdn.example.com/cover.jpg" />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));

    const bar = screen.getByTestId('mini-player-bar');
    const img = bar.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.className).toMatch(/animate-spin-slow/);
  });

  it('img sempre contem classes base independente de isPlaying', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator coverUrl="https://cdn.example.com/cover.jpg" />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));

    const bar = screen.getByTestId('mini-player-bar');
    const img = bar.querySelector('img');
    expect(img).not.toBeNull();

    // Classes base: w-12 h-12 rounded-md object-cover + mini-player-cover marker.
    expect(img!.className).toMatch(/\bw-12\b/);
    expect(img!.className).toMatch(/\bh-12\b/);
    expect(img!.className).toMatch(/\brounded-md\b/);
    expect(img!.className).toMatch(/\bobject-cover\b/);
    expect(img!.className).toMatch(/\bmini-player-cover\b/);
  });
});
