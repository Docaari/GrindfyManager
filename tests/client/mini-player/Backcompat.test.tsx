// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1 / RF-14 - Backward compat + cleanup StickyAudioBar
//
// Spec: Docs/specs/sprint-mini-player-1.md RF-14
//
// Acceptance:
//   - client/src/components/biblioteca/StickyAudioBar.tsx DELETADO
//   - import em App.tsx removido
//   - grep "StickyAudioBar" em client/src/ -> 0 ocorrencias pos-cleanup
//   - play(lesson) legado funciona (delega ao playTrack internamente)
//   - useOptionalAudioPlayer() retorna null sem Provider
//   - LessonViewer + PodcastPlayer SEM mudanca
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

function loadCtx() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/contexts/AudioPlayerContext');
}

beforeEach(() => {
  try {
    localStorage.removeItem('library:audio:volume');
    localStorage.removeItem('library:audio:speed');
  } catch {}
});

describe('RF-14 backward compat + cleanup', () => {
  describe('play(lesson) legado', () => {
    it('play({lessonId, audioUrl, title, ...}) seta current E activeTrack (wrap interno)', async () => {
      const { AudioPlayerProvider, useAudioPlayer } = loadCtx();
      function P() {
        const ctx = useAudioPlayer();
        return (
          <>
            <button
              data-testid="play-legacy"
              onClick={() =>
                ctx.play({
                  lessonId: 'leg-1',
                  audioUrl: '/audio/leg',
                  title: 'Legacy',
                  durationSeconds: 100,
                })
              }
            >
              play
            </button>
            <span data-testid="current-id">{ctx.current?.lessonId ?? 'null'}</span>
            <span data-testid="active-id">{ctx.activeTrack?.trackId ?? 'null'}</span>
            <span data-testid="active-src">{ctx.activeSource ?? 'null'}</span>
            <span data-testid="is-playing">{String(ctx.isPlaying)}</span>
          </>
        );
      }
      render(<AudioPlayerProvider><P /></AudioPlayerProvider>);
      const user = userEvent.setup();
      await user.click(screen.getByTestId('play-legacy'));
      expect(screen.getByTestId('current-id').textContent).toBe('leg-1');
      expect(screen.getByTestId('active-id').textContent).toBe('leg-1');
      expect(screen.getByTestId('active-src').textContent).toBe('library');
      expect(screen.getByTestId('is-playing').textContent).toBe('true');
    });

    it('play() legado NAO seta courseContext (preserva Biblioteca-1)', async () => {
      const { AudioPlayerProvider, useAudioPlayer } = loadCtx();
      function P() {
        const ctx = useAudioPlayer();
        return (
          <>
            <button
              data-testid="play-legacy"
              onClick={() =>
                ctx.play({
                  lessonId: 'leg-2',
                  audioUrl: '/audio/leg2',
                  title: 'Legacy 2',
                })
              }
            >
              play
            </button>
            <span data-testid="course">{String(ctx.courseContext)}</span>
          </>
        );
      }
      render(<AudioPlayerProvider><P /></AudioPlayerProvider>);
      const user = userEvent.setup();
      await user.click(screen.getByTestId('play-legacy'));
      expect(screen.getByTestId('course').textContent).toBe('null');
    });
  });

  describe('useOptionalAudioPlayer fora do Provider', () => {
    it('retorna null sem Provider (back-compat para tests que nao wrap-am)', () => {
      const { useOptionalAudioPlayer } = loadCtx();
      function P() {
        const ctx = useOptionalAudioPlayer();
        return <span data-testid="ctx">{ctx === null ? 'null' : 'present'}</span>;
      }
      render(<P />);
      expect(screen.getByTestId('ctx').textContent).toBe('null');
    });
  });

  describe('StickyAudioBar deletado + import removido', () => {
    it('arquivo client/src/components/biblioteca/StickyAudioBar.tsx NAO existe (pos-cleanup)', () => {
      const filePath = path.join(
        PROJECT_ROOT,
        'client/src/components/biblioteca/StickyAudioBar.tsx',
      );
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('App.tsx NAO importa nem renderiza StickyAudioBar', () => {
      const appPath = path.join(PROJECT_ROOT, 'client/src/App.tsx');
      const content = fs.readFileSync(appPath, 'utf8');
      expect(content).not.toMatch(/StickyAudioBar/);
    });

    it('grep "StickyAudioBar" em client/src/ retorna 0 ocorrencias (recursive)', () => {
      const clientRoot = path.join(PROJECT_ROOT, 'client/src');
      function walk(dir: string, occ: string[] = []): string[] {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full, occ);
          } else if (/\.(ts|tsx|js|jsx|md)$/.test(entry.name)) {
            const content = fs.readFileSync(full, 'utf8');
            if (content.includes('StickyAudioBar')) {
              occ.push(full);
            }
          }
        }
        return occ;
      }
      const hits = walk(clientRoot, []);
      expect(hits).toEqual([]);
    });
  });

  describe('MiniPlayerBar substitui StickyAudioBar em App.tsx', () => {
    it('App.tsx importa e renderiza MiniPlayerBar', () => {
      const appPath = path.join(PROJECT_ROOT, 'client/src/App.tsx');
      const content = fs.readFileSync(appPath, 'utf8');
      expect(content).toMatch(/MiniPlayerBar/);
    });
  });
});
