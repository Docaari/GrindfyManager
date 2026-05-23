// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-05 — PodcastPlayer expoe prop onTimeUpdate
//
// Spec: Docs/specs/sprint-mp-validation.md RF-05 §3
//
// Cobertura:
//   - PodcastPlayer ganha prop opcional `onTimeUpdate?: (cur, dur) => void`.
//   - O <audio> dispara timeupdate -> chamamos prop com (currentTime, duration).
//   - Throttle eh responsabilidade do CALLER (LessonViewer) — aqui so validamos
//     que callback recebe TODOS os timeupdate sem dedupe interno.
//
// Lessons: #14/#26/#38 (await import).
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('PodcastPlayer — RF-05 onTimeUpdate prop', () => {
  it('invoca onTimeUpdate com (currentTime, duration) a cada timeupdate', async () => {
    const { PodcastPlayer } = await import('@/components/biblioteca/PodcastPlayer');

    const onTimeUpdate = vi.fn();

    const { container } = render(
      <PodcastPlayer
        audioUrl="/audio/x.mp3"
        durationSeconds={300}
        mimeType="audio/mpeg"
        title="Test"
        coverUrl="/cover.png"
        onTimeUpdate={onTimeUpdate}
        startSeconds={0}
      />,
    );

    const audio = container.querySelector('audio') as HTMLAudioElement | null;
    expect(audio).not.toBeNull();

    Object.defineProperty(audio!, 'currentTime', { value: 42, writable: true, configurable: true });
    Object.defineProperty(audio!, 'duration', { value: 300, writable: true, configurable: true });

    await act(async () => {
      fireEvent(audio!, new Event('timeupdate'));
    });

    expect(onTimeUpdate).toHaveBeenCalled();
    const [cur, dur] = onTimeUpdate.mock.calls[0];
    expect(cur).toBeCloseTo(42, 0);
    expect(dur).toBeCloseTo(300, 0);
  });

  it('NAO quebra quando onTimeUpdate eh undefined (prop opcional)', async () => {
    const { PodcastPlayer } = await import('@/components/biblioteca/PodcastPlayer');

    const { container } = render(
      <PodcastPlayer
        audioUrl="/audio/x.mp3"
        durationSeconds={300}
        mimeType="audio/mpeg"
        title="Test"
        coverUrl="/cover.png"
        startSeconds={0}
      />,
    );

    const audio = container.querySelector('audio') as HTMLAudioElement | null;
    expect(audio).not.toBeNull();

    expect(() => {
      fireEvent(audio!, new Event('timeupdate'));
    }).not.toThrow();
  });
});
