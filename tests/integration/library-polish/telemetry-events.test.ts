// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Bloco-A-Polish / RF-09 + D10 + ADR-097
// Backend: POST /api/library/events aceita prologue_viewed + prologue_skipped
//
// Spec: Docs/specs/biblioteca-spec-bloco-a-polish.md RF-09 + D10
// ADR: Docs/architecture/decisions/097-telemetry-prologue-events-enum-expansion.md
// Migration: 0035 (ja aplicada em DB local)
//
// Pre-requisito ja DONE:
//   - migrations/0035_library_events_prologue_telemetry.sql aplicada
//   - shared/schema.ts libraryEventTypeEnum inclui novos values
//
// FALTA (red phase):
//   - server/routes/library.ts eventSchema Zod NAO inclui novos values
//   - apos implementer: schema atualizado, endpoint aceita 202.
//
// Estrategia: testar handler direto como ja faz tests/server/library/events.test.ts.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    findLessonAccess: vi.fn(),
    createLibraryEvent: vi.fn(),
    countLibraryEventsForUserInWindow: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';
import { handleCreateLibraryEvent } from '../../../server/routes/library';

beforeEach(() => {
  vi.clearAllMocks();
  (storage as any).findLessonAccess.mockResolvedValue({
    userId: 'USER-0001',
    lessonId: 'lesson-a1',
    source: 'admin',
  });
  (storage as any).countLibraryEventsForUserInWindow.mockResolvedValue(0);
  (storage as any).createLibraryEvent.mockResolvedValue({ id: 'evt_polish_1' });
});

function makeReq(body: any, user: any = { userPlatformId: 'USER-0001' }) {
  return { user, body, params: {}, query: {} };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res.body = data;
    return res;
  });
  return res;
}

describe('POST /api/library/events — prologue events (RF-09)', () => {
  it('deve aceitar eventType="prologue_viewed" e retornar 202', async () => {
    const req = makeReq({
      lessonId: 'lesson-a1',
      eventType: 'prologue_viewed',
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    expect(res.statusCode).toBe(202);
  });

  it('deve aceitar eventType="prologue_skipped" e retornar 202', async () => {
    const req = makeReq({
      lessonId: 'lesson-a1',
      eventType: 'prologue_skipped',
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    expect(res.statusCode).toBe(202);
  });

  it('deve persistir evento prologue_viewed via storage.createLibraryEvent', async () => {
    const req = makeReq({
      lessonId: 'lesson-a1',
      eventType: 'prologue_viewed',
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    expect((storage as any).createLibraryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'USER-0001',
        lessonId: 'lesson-a1',
        eventType: 'prologue_viewed',
      }),
    );
  });

  it('deve persistir evento prologue_skipped via storage.createLibraryEvent', async () => {
    const req = makeReq({
      lessonId: 'lesson-a1',
      eventType: 'prologue_skipped',
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    expect((storage as any).createLibraryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'USER-0001',
        lessonId: 'lesson-a1',
        eventType: 'prologue_skipped',
      }),
    );
  });

  it('deve aplicar rate limit 60/min mesmo para eventos prologue_*', async () => {
    (storage as any).countLibraryEventsForUserInWindow.mockResolvedValue(60);
    const req = makeReq({
      lessonId: 'lesson-a1',
      eventType: 'prologue_viewed',
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    expect(res.statusCode).toBe(429);
  });

  it('deve rejeitar 400 quando eventType nao reconhecido (typo)', async () => {
    const req = makeReq({
      lessonId: 'lesson-a1',
      eventType: 'prolouge_viewed', // typo proposital
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    expect(res.statusCode).toBe(400);
  });
});
