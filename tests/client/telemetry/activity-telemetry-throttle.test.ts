// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-01 + ADR-207 §4 — throttle/dedupe policies
//
// Cobertura:
//   - Throttle default 30s para mesma (action, lessonId): segundo emit no
//     mesmo cooldown NAO posta ao endpoint.
//   - Apos avancar > 30s: novo emit posta.
//   - Throttle 1s para audio.seek (trackId-based) — caso especifico.
//
// Lessons: #14/#26 (await import), fakeTimers.
// =============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
  (globalThis as any).fetch = fetchSpy;
  if (typeof navigator !== 'undefined') {
    (navigator as any).sendBeacon = undefined;
  }
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadLib() {
  // Reset cache de throttle entre testes.
  vi.resetModules();
  const mod: any = await import('@/lib/activity-telemetry');
  if (typeof mod._resetForTests === 'function') mod._resetForTests();
  return mod;
}

describe('RF-01 throttle policies (ADR-207 §4)', () => {
  it('dedupe 30s mesmo (action, lessonId) — segundo emit silenciado', async () => {
    vi.useFakeTimers();
    const { emitLessonEvent } = await loadLib();

    await emitLessonEvent('lesson.view', {
      lesson_id: 'lesson-x',
      course_slug: 'cx',
      format: 'video',
    });
    await emitLessonEvent('lesson.view', {
      lesson_id: 'lesson-x',
      course_slug: 'cx',
      format: 'video',
    });

    // Apenas 1 POST (segundo bloqueado por throttle 30s).
    expect(fetchSpy.mock.calls.length).toBe(1);
  });

  it('apos avancar >30s emite novamente', async () => {
    vi.useFakeTimers();
    const { emitLessonEvent } = await loadLib();

    await emitLessonEvent('lesson.view', {
      lesson_id: 'lesson-y',
      course_slug: 'cx',
      format: 'video',
    });

    vi.advanceTimersByTime(31_000);

    await emitLessonEvent('lesson.view', {
      lesson_id: 'lesson-y',
      course_slug: 'cx',
      format: 'video',
    });

    expect(fetchSpy.mock.calls.length).toBe(2);
  });

  it('audio.seek throttle 1s por trackId (lesson #9 do MP2)', async () => {
    vi.useFakeTimers();
    const { emitAudioEvent } = await loadLib();

    // 5 emits no mesmo segundo.
    for (let i = 0; i < 5; i++) {
      await emitAudioEvent('audio.seek', {
        track_id: 'tr1',
        from_position_sec: i * 2,
        to_position_sec: i * 2 + 1,
        reason: 'user_scrub',
      });
    }

    // Apenas 1 emit (primeiro) — restante throttled.
    expect(fetchSpy.mock.calls.length).toBe(1);

    vi.advanceTimersByTime(1_100);

    await emitAudioEvent('audio.seek', {
      track_id: 'tr1',
      from_position_sec: 10,
      to_position_sec: 11,
      reason: 'user_scrub',
    });

    expect(fetchSpy.mock.calls.length).toBe(2);
  });
});
