// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / ADR-207 §1 — formato `action` canonico
//
// Regex: ^[a-z]+(\.[a-z_]+)+(\.v[0-9]+)?$
//   - Namespace dot-separated (audio.play, lesson.completion_pct_50,
//     coach.legacy_redirect.fired, library.progress.upsert)
//   - Versionamento opcional .vN ao final.
//
// Cobertura:
//   - Lista canonica de 18 eventos (RF-01 + RF-04 + RF-05 canary) bate regex.
//   - Eventos legacy `audio_*` (ADR-191, sem dot) NAO casam regex novo
//     (legacy fica como subcaso ate retirada >6m).
// =============================================================================

import { describe, it, expect } from 'vitest';

const EVENT_NAME_REGEX = /^[a-z]+(\.[a-z0-9_]+)+(\.v[0-9]+)?$/;

const CANONICAL_EVENTS = [
  // audio (8)
  'audio.play',
  'audio.pause',
  'audio.seek',
  'audio.next',
  'audio.prev',
  'audio.queue_add',
  'audio.queue_remove',
  'audio.lesson_complete',
  // lesson (6)
  'lesson.view',
  'lesson.play_start',
  'lesson.completion_pct_25',
  'lesson.completion_pct_50',
  'lesson.completion_pct_75',
  'lesson.completion_pct_100',
  // coach (5 — 4 RF-01 + 1 RF-04)
  'coach.nudge_received',
  'coach.nudge_dismissed',
  'coach.nudge_cta_clicked',
  'coach.chat_message',
  'coach.legacy_redirect.fired',
  // library (1 — RF-05 canary)
  'library.progress.upsert',
];

const LEGACY_AUDIO_UNDERSCORE = [
  'audio_play',
  'audio_pause',
  'audio_driver_active',
  'audio_driver_switch',
];

describe('ADR-207 §1 — formato canonico action (regex)', () => {
  it.each(CANONICAL_EVENTS)('"%s" bate regex canonico', (name) => {
    expect(name).toMatch(EVENT_NAME_REGEX);
  });

  it('valida versionamento .vN ao final', () => {
    expect('audio.play.v2').toMatch(EVENT_NAME_REGEX);
    expect('lesson.view.v3').toMatch(EVENT_NAME_REGEX);
  });

  it('rejeita formatos invalidos', () => {
    expect('AudioPlay').not.toMatch(EVENT_NAME_REGEX);
    expect('audio play').not.toMatch(EVENT_NAME_REGEX);
    expect('audio-play').not.toMatch(EVENT_NAME_REGEX);
    expect('audio').not.toMatch(EVENT_NAME_REGEX); // sem namespace
    expect('').not.toMatch(EVENT_NAME_REGEX);
  });

  it('eventos legacy underscore (ADR-191) NAO batem regex novo (coexistencia)', () => {
    for (const legacy of LEGACY_AUDIO_UNDERSCORE) {
      expect(legacy).not.toMatch(EVENT_NAME_REGEX);
    }
  });

  it('expoe lista canonica via export do modulo conventions', async () => {
    // Modulo de runtime que server-side validator usa.
    const mod: any = await import('../../shared/activity-event-names');
    expect(Array.isArray(mod.CANONICAL_EVENT_NAMES)).toBe(true);
    expect(mod.CANONICAL_EVENT_NAMES.length).toBeGreaterThanOrEqual(18);
    expect(mod.EVENT_NAME_REGEX).toBeDefined();
  });
});
