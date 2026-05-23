// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-01 + ADR-207 — eventos dot-namespace
//
// Convencao (ADR-207 §1+§5):
//   - audio.play / audio.pause / audio.seek / audio.next / audio.prev /
//     audio.queue_add / audio.queue_remove / audio.lesson_complete
//   - lesson.view / lesson.play_start / lesson.completion_pct_25/50/75/100
//   - coach.nudge_received / coach.nudge_dismissed / coach.nudge_cta_clicked /
//     coach.chat_message / coach.legacy_redirect.fired
//   - library.progress.upsert
//
// Cobertura:
//   - Cada emit* posta shape canonico { action, page, metadata } no endpoint.
//   - Action eh exatamente o namespace.event passado.
//
// Lessons: #14/#26 (await import), fetch stub.
// =============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
  (globalThis as any).fetch = fetchSpy;
  // navigator.sendBeacon ausente -> forca path fetch.
  if (typeof navigator !== 'undefined') {
    (navigator as any).sendBeacon = undefined;
  }
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadLib() {
  return await import('@/lib/activity-telemetry');
}

function lastPayload(): any {
  const calls = fetchSpy.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const [, init] = calls[calls.length - 1] as any[];
  return JSON.parse(init.body);
}

describe('RF-01 namespace dot-format — audio.*', () => {
  it('emitAudioEvent("audio.play", payload) → action="audio.play"', async () => {
    const { emitAudioEvent } = await loadLib();
    await emitAudioEvent('audio.play', {
      track_id: 'tr1',
      source_driver: 'internal_mp4',
      queue_position: 0,
      queue_length: 3,
    });
    const body = lastPayload();
    expect(body.action).toBe('audio.play');
    expect(body.page).toBe('mini_player');
    expect(body.metadata).toMatchObject({
      track_id: 'tr1',
      source_driver: 'internal_mp4',
    });
  });

  it('emitAudioEvent("audio.pause", { duration_ms })', async () => {
    const { emitAudioEvent } = await loadLib();
    await emitAudioEvent('audio.pause', {
      track_id: 'tr1',
      at_position_sec: 42,
      duration_ms: 5000,
      reason: 'user',
    });
    const body = lastPayload();
    expect(body.action).toBe('audio.pause');
    expect(body.metadata.reason).toBe('user');
  });
});

describe('RF-01 namespace dot-format — lesson.*', () => {
  it('emitLessonEvent("lesson.completion_pct_50", payload) → action correct', async () => {
    const { emitLessonEvent } = await loadLib();
    await emitLessonEvent('lesson.completion_pct_50', {
      lesson_id: 'l1',
      course_slug: 'cx',
      format: 'video',
      total_duration_sec: 600,
      listened_sec: 300,
    });
    const body = lastPayload();
    expect(body.action).toBe('lesson.completion_pct_50');
    expect(body.metadata.lesson_id).toBe('l1');
  });

  it('emitLessonEvent("lesson.view", ...) → page lesson_viewer', async () => {
    const { emitLessonEvent } = await loadLib();
    await emitLessonEvent('lesson.view', {
      lesson_id: 'l1',
      course_slug: 'cx',
      format: 'video',
    });
    const body = lastPayload();
    expect(body.action).toBe('lesson.view');
    expect(body.page).toBe('lesson_viewer');
  });
});

describe('RF-01 namespace dot-format — coach.*', () => {
  it('emitCoachEvent("coach.nudge_received", ...)', async () => {
    const { emitCoachEvent } = await loadLib();
    await emitCoachEvent('coach.nudge_received', {
      nudge_id: 'n1',
      category: 'B-DOWNSWING',
    });
    const body = lastPayload();
    expect(body.action).toBe('coach.nudge_received');
  });
});

describe('RF-01 namespace dot-format — library.* (RF-05 canary)', () => {
  it('emitLibraryEvent("library.progress.upsert", ...)', async () => {
    const { emitLibraryEvent } = await loadLib();
    await emitLibraryEvent('library.progress.upsert', {
      lesson_id: 'l1',
      format: 'video',
      last_position_sec: 120,
      total_duration_sec: 600,
      completed: false,
    });
    const body = lastPayload();
    expect(body.action).toBe('library.progress.upsert');
    expect(body.metadata.completed).toBe(false);
  });
});
