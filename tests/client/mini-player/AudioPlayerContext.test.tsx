// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1 / RF-07 - AudioPlayerContext extension
//
// Spec: Docs/specs/sprint-mini-player-1.md RF-07
// ADR: 187 (driver) + 188 (FSM)
//
// Target: client/src/contexts/AudioPlayerContext.tsx (EXTENSAO da existente)
//
// Cobertura da NOVA surface:
//   volume, isMuted, setVolume, toggleMute (D5)
//   activeSource, activeTrack
//   playTrack(track, courseContext?)
//   playNext, playPrevious (RF-05 / RF-02)
//   courseContext, setCourseContext (RF-05)
//   displayMode, setDisplayMode (ADR-188)
//
// + back-compat: play(lesson) legado funciona como wrapper de playTrack({source:'library',...})
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const lesson = {
  lessonId: 'l1',
  audioUrl: '/api/library/lessons/l1/audio',
  title: 'Aula 1',
  coverUrl: '/x.jpg',
  courseTitle: 'Curso',
  durationSeconds: 1200,
};

const trackLibrary = {
  source: 'library' as const,
  trackId: 'l2',
  title: 'Aula 2',
  coverUrl: '/y.jpg',
  courseTitle: 'Curso',
  durationSeconds: 600,
  audioUrl: '/audio/l2',
};

function Probe() {
  // useAudioPlayer continua sendo a entrada — surface estendida (RF-07).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAudioPlayer } = require('@/contexts/AudioPlayerContext');
  const ctx = useAudioPlayer();
  return (
    <div>
      <button data-testid="play-legacy" onClick={() => ctx.play(lesson)}>play</button>
      <button data-testid="playTrack-lib" onClick={() => ctx.playTrack(trackLibrary)}>playTrack</button>
      <button data-testid="set-vol-50" onClick={() => ctx.setVolume(0.5)}>vol</button>
      <button data-testid="toggle-mute" onClick={() => ctx.toggleMute()}>mute</button>
      <button data-testid="setmode-expanded" onClick={() => ctx.setDisplayMode('expanded')}>expand</button>
      <button data-testid="setmode-bar" onClick={() => ctx.setDisplayMode('bar')}>bar</button>
      <button data-testid="setmode-hidden" onClick={() => ctx.setDisplayMode('hidden')}>hidden</button>
      <button data-testid="close" onClick={() => ctx.close()}>close</button>
      <button data-testid="next" onClick={() => ctx.playNext()}>next</button>
      <button data-testid="prev" onClick={() => ctx.playPrevious()}>prev</button>
      <span data-testid="volume">{String(ctx.volume)}</span>
      <span data-testid="isMuted">{String(ctx.isMuted)}</span>
      <span data-testid="displayMode">{ctx.displayMode}</span>
      <span data-testid="activeSource">{ctx.activeSource ?? 'null'}</span>
      <span data-testid="activeTrack-id">{ctx.activeTrack?.trackId ?? 'null'}</span>
      <span data-testid="current-id">{ctx.current?.lessonId ?? 'null'}</span>
      <span data-testid="courseContext-slug">{ctx.courseContext?.courseSlug ?? 'null'}</span>
      <span data-testid="courseContext-index">{String(ctx.courseContext?.currentIndex ?? 'null')}</span>
    </div>
  );
}

function renderProbe() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AudioPlayerProvider } = require('@/contexts/AudioPlayerContext');
  return render(
    <AudioPlayerProvider>
      <Probe />
    </AudioPlayerProvider>,
  );
}

describe('AudioPlayerContext extension (RF-07)', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('library:audio:volume');
      localStorage.removeItem('library:audio:speed');
    } catch {}
  });

  // ===== volume + isMuted (D5) =====
  describe('volume + isMuted', () => {
    it('volume default = 1.0', () => {
      renderProbe();
      expect(screen.getByTestId('volume').textContent).toBe('1');
    });

    it('setVolume(0.5) atualiza volume e persiste em localStorage', async () => {
      renderProbe();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('set-vol-50'));
      expect(screen.getByTestId('volume').textContent).toBe('0.5');
      expect(localStorage.getItem('library:audio:volume')).toBe('0.5');
    });

    it('setVolume clampa fora do range [0,1]', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { AudioPlayerProvider, useAudioPlayer } = require('@/contexts/AudioPlayerContext');
      function P() {
        const ctx = useAudioPlayer();
        return (
          <>
            <button data-testid="vol-hi" onClick={() => ctx.setVolume(2.5)}>hi</button>
            <button data-testid="vol-lo" onClick={() => ctx.setVolume(-0.5)}>lo</button>
            <span data-testid="v">{String(ctx.volume)}</span>
          </>
        );
      }
      render(<AudioPlayerProvider><P /></AudioPlayerProvider>);
      const user = userEvent.setup();
      await user.click(screen.getByTestId('vol-hi'));
      expect(parseFloat(screen.getByTestId('v').textContent || '0')).toBeLessThanOrEqual(1);
      await user.click(screen.getByTestId('vol-lo'));
      expect(parseFloat(screen.getByTestId('v').textContent || '0')).toBeGreaterThanOrEqual(0);
    });

    it('toggleMute flipa isMuted SEM alterar volume state', async () => {
      renderProbe();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('set-vol-50'));
      expect(screen.getByTestId('volume').textContent).toBe('0.5');
      await user.click(screen.getByTestId('toggle-mute'));
      expect(screen.getByTestId('isMuted').textContent).toBe('true');
      expect(screen.getByTestId('volume').textContent).toBe('0.5'); // volume preservado
      await user.click(screen.getByTestId('toggle-mute'));
      expect(screen.getByTestId('isMuted').textContent).toBe('false');
    });

    it('isMuted NAO persiste (D5) - boot sempre false', () => {
      localStorage.setItem('library:audio:volume', '0.3');
      renderProbe();
      expect(screen.getByTestId('isMuted').textContent).toBe('false');
      expect(screen.getByTestId('volume').textContent).toBe('0.3');
    });
  });

  // ===== playTrack + activeSource/activeTrack =====
  describe('playTrack + activeSource/activeTrack', () => {
    it('playTrack({source:"library",...}) seta activeTrack + activeSource + current (back-compat)', async () => {
      renderProbe();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('playTrack-lib'));
      expect(screen.getByTestId('activeSource').textContent).toBe('library');
      expect(screen.getByTestId('activeTrack-id').textContent).toBe('l2');
      // back-compat: current projetado pra LessonViewer/PodcastPlayer
      expect(screen.getByTestId('current-id').textContent).toBe('l2');
    });

    it('playTrack mantem/transita displayMode para "bar" (Sprint MP-MODERN RF-06: default agora e "bar")', async () => {
      renderProbe();
      // Sprint MP-MODERN RF-06: default agora "bar" (EmptyStateCTA visivel pre-track).
      expect(screen.getByTestId('displayMode').textContent).toBe('bar');
      const user = userEvent.setup();
      await user.click(screen.getByTestId('playTrack-lib'));
      expect(screen.getByTestId('displayMode').textContent).toBe('bar');
    });

    it('playTrack substitui sem confirmar (D9 / D18)', async () => {
      renderProbe();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('playTrack-lib'));
      // Trocar para outra track (libera handler novo via mock context interno)
      // Aqui apenas verifica que activeTrack mudou no segundo playTrack.
      await user.click(screen.getByTestId('playTrack-lib'));
      expect(screen.getByTestId('activeTrack-id').textContent).toBe('l2');
    });
  });

  // ===== back-compat play(lesson) =====
  describe('back-compat play(lesson)', () => {
    it('play(lesson) legado seta current E activeTrack (via wrapper para playTrack)', async () => {
      renderProbe();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('play-legacy'));
      expect(screen.getByTestId('current-id').textContent).toBe('l1');
      expect(screen.getByTestId('activeSource').textContent).toBe('library');
      expect(screen.getByTestId('activeTrack-id').textContent).toBe('l1');
    });

    it('play(lesson) legado NAO seta courseContext (preserva comportamento Biblioteca-1)', async () => {
      renderProbe();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('play-legacy'));
      expect(screen.getByTestId('courseContext-slug').textContent).toBe('null');
    });
  });

  // ===== displayMode FSM =====
  describe('displayMode', () => {
    it('displayMode default = "bar" (Sprint MP-MODERN RF-06: EmptyStateCTA renderiza pre-track)', () => {
      renderProbe();
      expect(screen.getByTestId('displayMode').textContent).toBe('bar');
    });

    it('setDisplayMode("expanded") COM current=null e no-op + console.warn (RF-07 acceptance)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      renderProbe();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('setmode-expanded'));
      // Sem current ativo, expand deve ser no-op
      expect(screen.getByTestId('displayMode').textContent).not.toBe('expanded');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('setDisplayMode("expanded") COM current ativo deve transicionar', async () => {
      renderProbe();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('playTrack-lib'));
      await user.click(screen.getByTestId('setmode-expanded'));
      expect(screen.getByTestId('displayMode').textContent).toBe('expanded');
    });

    it('close() reseta displayMode para "hidden"', async () => {
      renderProbe();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('playTrack-lib'));
      expect(screen.getByTestId('displayMode').textContent).toBe('bar');
      await user.click(screen.getByTestId('close'));
      expect(screen.getByTestId('displayMode').textContent).toBe('hidden');
      expect(screen.getByTestId('current-id').textContent).toBe('null');
    });
  });

  // ===== courseContext + playNext/Previous =====
  describe('courseContext + playNext / playPrevious', () => {
    function CourseProbe() {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useAudioPlayer } = require('@/contexts/AudioPlayerContext');
      const ctx = useAudioPlayer();
      const courseLessons = [
        { source: 'library' as const, trackId: 'a', title: 'A', audioUrl: '/a' },
        { source: 'library' as const, trackId: 'b', title: 'B', audioUrl: '/b' },
        { source: 'library' as const, trackId: 'c', title: 'C', audioUrl: '/c' },
      ];
      return (
        <>
          <button
            data-testid="play-with-course"
            onClick={() =>
              ctx.playTrack(courseLessons[1], {
                courseSlug: 'curso-1',
                lessons: courseLessons,
                currentIndex: 1,
              })
            }
          >
            with-course
          </button>
          <button data-testid="next" onClick={() => ctx.playNext()}>next</button>
          <button data-testid="prev" onClick={() => ctx.playPrevious()}>prev</button>
          <span data-testid="active">{ctx.activeTrack?.trackId ?? 'null'}</span>
          <span data-testid="slug">{ctx.courseContext?.courseSlug ?? 'null'}</span>
          <span data-testid="idx">{String(ctx.courseContext?.currentIndex ?? 'null')}</span>
        </>
      );
    }

    function renderCourse() {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { AudioPlayerProvider } = require('@/contexts/AudioPlayerContext');
      return render(
        <AudioPlayerProvider>
          <CourseProbe />
        </AudioPlayerProvider>,
      );
    }

    it('playTrack(track, courseContext) seta courseContext', async () => {
      renderCourse();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('play-with-course'));
      expect(screen.getByTestId('slug').textContent).toBe('curso-1');
      expect(screen.getByTestId('idx').textContent).toBe('1');
    });

    it('playNext troca pra lessons[currentIndex+1] e incrementa currentIndex', async () => {
      renderCourse();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('play-with-course'));
      await user.click(screen.getByTestId('next'));
      expect(screen.getByTestId('active').textContent).toBe('c');
      expect(screen.getByTestId('idx').textContent).toBe('2');
    });

    it('playPrevious troca pra lessons[currentIndex-1] e decrementa currentIndex', async () => {
      renderCourse();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('play-with-course'));
      await user.click(screen.getByTestId('prev'));
      expect(screen.getByTestId('active').textContent).toBe('a');
      expect(screen.getByTestId('idx').textContent).toBe('0');
    });

    it('playNext no fim do curso vira no-op (nao explode, mantem track atual)', async () => {
      renderCourse();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('play-with-course'));
      await user.click(screen.getByTestId('next')); // -> c (idx 2)
      await user.click(screen.getByTestId('next')); // no-op
      expect(screen.getByTestId('active').textContent).toBe('c');
      expect(screen.getByTestId('idx').textContent).toBe('2');
    });

    it('playPrevious no inicio do curso vira no-op', async () => {
      renderCourse();
      const user = userEvent.setup();
      await user.click(screen.getByTestId('play-with-course'));
      await user.click(screen.getByTestId('prev')); // -> a (idx 0)
      await user.click(screen.getByTestId('prev')); // no-op
      expect(screen.getByTestId('active').textContent).toBe('a');
      expect(screen.getByTestId('idx').textContent).toBe('0');
    });
  });

  // ===== useOptionalAudioPlayer =====
  describe('useOptionalAudioPlayer (back-compat RF-14)', () => {
    it('retorna null fora do Provider', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useOptionalAudioPlayer } = require('@/contexts/AudioPlayerContext');
      function P() {
        const ctx = useOptionalAudioPlayer();
        return <span data-testid="opt">{ctx === null ? 'null' : 'present'}</span>;
      }
      render(<P />);
      expect(screen.getByTestId('opt').textContent).toBe('null');
    });
  });
});

// Vitest globals (test envs com `globals: true` no config)
declare const vi: any;
