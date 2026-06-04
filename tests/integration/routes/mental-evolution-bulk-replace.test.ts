import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Feature: Evolucao Mental Editavel na Sessao
// Spec : Docs/specs/evolucao-mental-editavel-sessao.md
// ADR  : Docs/architecture/decisions/242-mental-evolution-editable-bulk-replace-derived-medias.md
// Diag : Docs/architecture/diagrams/mental-evolution-editable-save-sequence.mermaid
//
// Endpoint (Decisao 1): PUT /api/grind-sessions/:id/break-feedbacks
//   - bulk-replace ATOMICO da serie de breaks da sessao + recalculo das 5 medias
//     derivadas (mesma tx) + resposta { breaks(ASC), medias, breakCount }.
//   - NAO existem PUT/DELETE por id (substituidos). NAO existe patchBreakFeedbackSchema.
//
// O handler aceita injectedStorage como 3o arg (lesson #34) — injetamos um storage
// fake e asseridamos o DIFF (INSERT/UPDATE/DELETE) sem vi.mock do modulo de storage.
//
// SHAPE REAL (lesson #3) — break_feedbacks (shared/schema.ts:727):
//   { id, userId, sessionId, breakTime(Date), foco, energia, confianca,
//     inteligenciaEmocional, interferencias (int 0-10), notes(string|null), createdAt }
//   grind_sessions.*Media (schema.ts:701-705) sao decimal() => string|null no Drizzle.
//   storage real: getGrindSession, getBreakFeedbacks(userId, sessionId),
//     createBreakFeedback(insert), updateBreakFeedback(id, data),
//     deleteBreakFeedback(id), updateGrindSession(id, data).
//
// Lessons: #3 shape real, #32 db.transaction fallback gentil, #34 injectedStorage.
// Sem emoji. .test.ts => projeto server (node).
// =============================================================================

// O handler importado pode ser nomeado handlePutSessionBreakFeedbacks (ADR-242).
async function loadHandler(): Promise<any | null> {
  try {
    const mod = await import('../../../server/routes/grind-sessions');
    return (mod as any).handlePutSessionBreakFeedbacks ?? null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Fakes de req/res
// ----------------------------------------------------------------------------
function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function makeReq(opts: { userId?: string; id?: string; body?: any }) {
  return {
    user: { userPlatformId: opts.userId ?? 'USER-0001' },
    params: { id: opts.id ?? 'sess_1' },
    body: opts.body ?? {},
  } as any;
}

// ----------------------------------------------------------------------------
// Storage fake espelhando o shape real (lesson #3)
// ----------------------------------------------------------------------------
function row(over: Partial<Record<string, any>> = {}): any {
  return {
    id: 'b_existing',
    userId: 'USER-0001',
    sessionId: 'sess_1',
    breakTime: new Date('2026-06-04T13:00:00.000Z'),
    foco: 5,
    energia: 5,
    confianca: 5,
    inteligenciaEmocional: 5,
    interferencias: 5,
    notes: null,
    createdAt: new Date('2026-06-04T12:00:00.000Z'),
    ...over,
  };
}

function makeStorage(opts: {
  session?: any;
  existingBreaks?: any[];
} = {}) {
  const existing = opts.existingBreaks ?? [];
  // store mutavel para o segundo getBreakFeedbacks (pos-mutacao) refletir o estado final.
  let current = [...existing];

  const storage: any = {
    getGrindSession: vi.fn(async (_id: string) =>
      opts.session === undefined
        ? { id: 'sess_1', userId: 'USER-0001' }
        : opts.session,
    ),
    getBreakFeedbacks: vi.fn(async (_userId: string, _sessionId?: string) => {
      // ORDER BY breakTime DESC (paridade com storage real)
      return [...current].sort(
        (a, b) => new Date(b.breakTime).getTime() - new Date(a.breakTime).getTime(),
      );
    }),
    createBreakFeedback: vi.fn(async (data: any) => {
      const created = { ...row(), ...data, id: data.id ?? `gen_${current.length}` };
      current.push(created);
      return created;
    }),
    updateBreakFeedback: vi.fn(async (id: string, data: any) => {
      const idx = current.findIndex((r) => r.id === id);
      if (idx >= 0) current[idx] = { ...current[idx], ...data };
      return current[idx];
    }),
    deleteBreakFeedback: vi.fn(async (id: string) => {
      current = current.filter((r) => r.id !== id);
    }),
    updateGrindSession: vi.fn(async (_id: string, data: any) => ({ id: 'sess_1', ...data })),
  };
  return storage;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Existencia
// =============================================================================
describe('handlePutSessionBreakFeedbacks (ADR-242) — existencia', () => {
  it('handler exportado existe', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
  });
});

// =============================================================================
// Ownership — 404 ANTES de qualquer mutacao
// =============================================================================
describe('ownership (ADR-242 — 404 antes de mutar)', () => {
  it('sessao de OUTRO usuario -> 404 e NENHUMA escrita', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({ session: { id: 'sess_1', userId: 'USER-OTHER' } });
    const req = makeReq({ userId: 'USER-0001', body: { breaks: [] } });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(404);
    expect(storage.createBreakFeedback).not.toHaveBeenCalled();
    expect(storage.updateBreakFeedback).not.toHaveBeenCalled();
    expect(storage.deleteBreakFeedback).not.toHaveBeenCalled();
    expect(storage.updateGrindSession).not.toHaveBeenCalled();
  });

  it('sessao inexistente -> 404 e NENHUMA escrita', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({ session: null });
    const req = makeReq({ userId: 'USER-0001', body: { breaks: [{ breakTime: '2026-06-04T14:00:00.000Z', foco: 5, energia: 5, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 }] } });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(404);
    expect(storage.createBreakFeedback).not.toHaveBeenCalled();
    expect(storage.updateGrindSession).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Diff de set-replace: INSERT / UPDATE / DELETE
// =============================================================================
describe('bulk-replace diff (INSERT/UPDATE/DELETE)', () => {
  it('id ausente no payload -> CREATE novo break vinculado a sessao', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({ existingBreaks: [] });
    const req = makeReq({
      userId: 'USER-0001',
      body: {
        breaks: [
          { breakTime: '2026-06-04T14:00:00.000Z', foco: 7, energia: 6, confianca: 8, inteligenciaEmocional: 5, interferencias: 9 },
        ],
      },
    });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(storage.createBreakFeedback).toHaveBeenCalledTimes(1);
    const created = storage.createBreakFeedback.mock.calls[0][0];
    // herda userId+sessionId da sessao validada (NUNCA do payload)
    expect(created.userId).toBe('USER-0001');
    expect(created.sessionId).toBe('sess_1');
    expect(storage.deleteBreakFeedback).not.toHaveBeenCalled();
  });

  it('id presente no payload e no DB -> UPDATE daquele break', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({ existingBreaks: [row({ id: 'b1', foco: 5 })] });
    const req = makeReq({
      userId: 'USER-0001',
      body: {
        breaks: [
          { id: 'b1', breakTime: '2026-06-04T13:00:00.000Z', foco: 9, energia: 5, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 },
        ],
      },
    });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(storage.updateBreakFeedback).toHaveBeenCalledTimes(1);
    const [updId, updData] = storage.updateBreakFeedback.mock.calls[0];
    expect(updId).toBe('b1');
    expect(updData.foco).toBe(9);
    expect(storage.createBreakFeedback).not.toHaveBeenCalled();
    expect(storage.deleteBreakFeedback).not.toHaveBeenCalled();
  });

  it('id no DB ausente no payload -> DELETE', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({
      existingBreaks: [row({ id: 'keep' }), row({ id: 'gone', breakTime: new Date('2026-06-04T13:30:00.000Z') })],
    });
    const req = makeReq({
      userId: 'USER-0001',
      body: {
        breaks: [
          { id: 'keep', breakTime: '2026-06-04T13:00:00.000Z', foco: 5, energia: 5, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 },
        ],
      },
    });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(storage.deleteBreakFeedback).toHaveBeenCalledTimes(1);
    expect(storage.deleteBreakFeedback).toHaveBeenCalledWith('gone');
    // o break mantido NAO eh deletado
    const deletedIds = storage.deleteBreakFeedback.mock.calls.map((c: any[]) => c[0]);
    expect(deletedIds).not.toContain('keep');
  });

  it('breaks: [] -> remove TODOS os breaks da sessao', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({
      existingBreaks: [row({ id: 'a' }), row({ id: 'b', breakTime: new Date('2026-06-04T13:30:00.000Z') })],
    });
    const req = makeReq({ userId: 'USER-0001', body: { breaks: [] } });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(storage.deleteBreakFeedback).toHaveBeenCalledTimes(2);
    const deletedIds = storage.deleteBreakFeedback.mock.calls.map((c: any[]) => c[0]).sort();
    expect(deletedIds).toEqual(['a', 'b']);
  });
});

// =============================================================================
// Recalculo das medias derivadas (Decisao 2)
// =============================================================================
describe('medias derivadas (recalculo na mesma tx)', () => {
  it('2 breaks energia 4 e 8 -> updateGrindSession com energiaMedia "6.0"', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({ existingBreaks: [] });
    const req = makeReq({
      userId: 'USER-0001',
      body: {
        breaks: [
          { breakTime: '2026-06-04T14:00:00.000Z', foco: 5, energia: 4, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 },
          { breakTime: '2026-06-04T15:00:00.000Z', foco: 5, energia: 8, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 },
        ],
      },
    });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(storage.updateGrindSession).toHaveBeenCalledTimes(1);
    const mediaData = storage.updateGrindSession.mock.calls[0][1];
    expect(String(mediaData.energiaMedia)).toMatch(/^6(\.0)?$/);
  });

  it('breaks: [] -> medias gravadas como null (sem fantasma)', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({ existingBreaks: [row({ id: 'a' })] });
    const req = makeReq({ userId: 'USER-0001', body: { breaks: [] } });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(storage.updateGrindSession).toHaveBeenCalledTimes(1);
    const mediaData = storage.updateGrindSession.mock.calls[0][1];
    expect(mediaData.energiaMedia).toBeNull();
    expect(mediaData.focoMedio).toBeNull();
    expect(mediaData.confiancaMedia).toBeNull();
    expect(mediaData.inteligenciaEmocionalMedia).toBeNull();
    expect(mediaData.interferenciasMedia).toBeNull();
  });
});

// =============================================================================
// Resposta: serie ASC + medias + breakCount (derivado)
// =============================================================================
describe('resposta do bulk endpoint', () => {
  it('200 retorna breaks ASC por breakTime + medias + breakCount', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({ existingBreaks: [] });
    const req = makeReq({
      userId: 'USER-0001',
      body: {
        breaks: [
          { breakTime: '2026-06-04T15:00:00.000Z', foco: 5, energia: 5, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 },
          { breakTime: '2026-06-04T13:00:00.000Z', foco: 5, energia: 5, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 },
        ],
      },
    });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('breaks');
    expect(res.body).toHaveProperty('medias');
    expect(res.body).toHaveProperty('breakCount');
    expect(res.body.breakCount).toBe(2);
    // ASC por breakTime
    const times = res.body.breaks.map((b: any) => new Date(b.breakTime).getTime());
    expect(times[0]).toBeLessThanOrEqual(times[1]);
  });

  it('breakCount reflete a contagem da serie (derivado, nao coluna)', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({ existingBreaks: [] });
    const req = makeReq({
      userId: 'USER-0001',
      body: {
        breaks: [
          { breakTime: '2026-06-04T13:00:00.000Z', foco: 5, energia: 5, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 },
          { breakTime: '2026-06-04T14:00:00.000Z', foco: 5, energia: 5, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 },
          { breakTime: '2026-06-04T15:00:00.000Z', foco: 5, energia: 5, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 },
        ],
      },
    });
    const res = makeRes();

    await h(req, res, storage);
    expect(res.body.breakCount).toBe(3);
  });
});

// =============================================================================
// Clamp 0-10 (reuso clampBreakFeedback)
// =============================================================================
describe('clamp 0-10 por item (reuso clampBreakFeedback)', () => {
  it('metrica 15 -> 10 e -3 -> 0 ao persistir', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({ existingBreaks: [] });
    const req = makeReq({
      userId: 'USER-0001',
      body: {
        breaks: [
          { breakTime: '2026-06-04T14:00:00.000Z', foco: 15, energia: -3, confianca: 5, inteligenciaEmocional: 5, interferencias: 5 },
        ],
      },
    });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(storage.createBreakFeedback).toHaveBeenCalledTimes(1);
    const created = storage.createBreakFeedback.mock.calls[0][0];
    expect(created.foco).toBe(10);
    expect(created.energia).toBe(0);
  });

  it('metrica NaN/ausente -> 5 (paridade com POST)', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({ existingBreaks: [] });
    const req = makeReq({
      userId: 'USER-0001',
      body: {
        breaks: [
          // foco ausente -> clampBreakFeedback default 5
          { breakTime: '2026-06-04T14:00:00.000Z', energia: 6, confianca: 7, inteligenciaEmocional: 8, interferencias: 9 },
        ],
      },
    });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(200);
    const created = storage.createBreakFeedback.mock.calls[0][0];
    expect(created.foco).toBe(5);
  });
});

// =============================================================================
// Validacao Zod -> 400
// =============================================================================
describe('validacao Zod (bulkReplaceBreakFeedbacksSchema .strict())', () => {
  it('body sem "breaks" -> 400 e nenhuma escrita', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({ existingBreaks: [] });
    const req = makeReq({ userId: 'USER-0001', body: {} });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(400);
    expect(storage.createBreakFeedback).not.toHaveBeenCalled();
    expect(storage.updateGrindSession).not.toHaveBeenCalled();
  });

  it('chave desconhecida no item -> 400 (.strict())', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({ existingBreaks: [] });
    const req = makeReq({
      userId: 'USER-0001',
      body: {
        breaks: [
          { breakTime: '2026-06-04T14:00:00.000Z', foco: 5, energia: 5, confianca: 5, inteligenciaEmocional: 5, interferencias: 5, hackerField: 1 },
        ],
      },
    });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(400);
  });

  it('notes acima de 500 chars -> 400', async () => {
    const h = await loadHandler();
    expect(h).not.toBeNull();
    const storage = makeStorage({ existingBreaks: [] });
    const req = makeReq({
      userId: 'USER-0001',
      body: {
        breaks: [
          { breakTime: '2026-06-04T14:00:00.000Z', foco: 5, energia: 5, confianca: 5, inteligenciaEmocional: 5, interferencias: 5, notes: 'x'.repeat(501) },
        ],
      },
    });
    const res = makeRes();

    await h(req, res, storage);

    expect(res.statusCode).toBe(400);
  });
});
