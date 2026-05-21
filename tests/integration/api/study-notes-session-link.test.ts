/**
 * Test-Writer (Modo TDD — Red Phase)
 *
 * Sprint Estudos-Sessao-1 — RF-04 (notes linkadas a sessao)
 *
 * Spec : Docs/specs/sprint-estudos-sessao-1.md §RF-04
 * ADR  : 177 (XOR-fraco: study_card_id OU study_session_id)
 * Diag : Docs/architecture/diagrams/estudos-sessao-1/er-patch.mermaid
 *
 * Cobertura:
 *   - POST /api/study-sessions/:id/notes com {content} -> 201 com note
 *     {id, content, studySessionId, studyCardId:null, createdAt}
 *   - GET /api/study-sessions/:id/notes -> array de notes daquela sessao
 *   - POST sem content -> 400
 *   - POST em sessao de outro user -> 404 (IDOR via ownership da sessao)
 *   - GET em sessao de outro user -> 404
 *   - DELETE /api/study-notes/:id em note de sessao do user -> 200
 *   - DELETE /api/study-notes/:id em note de outro user -> 404
 *   - Zod: payload sem sessionId NEM cardId em insertStudyNoteSchema -> rejeitado
 *
 * Lessons aplicadas:
 *   #3  mocks shape REAL (studyNotes: id, studyCardId NULLABLE pos-0072,
 *       studySessionId NOVO, content, tags, createdAt, updatedAt)
 *   #6  apiRequest retorna JSON parseado direto
 *   #34 handler aceita storage como 3o arg opcional
 *   #36 storage modulo dedicado studyStorage.ts (lazy import schema)
 *
 * Status RED esperado: endpoints + storage helpers
 * (getStudyNotesBySession, createStudyNoteForSession, ownsNote estendido)
 * nao existem. Schema atual ainda tem studyCardId NOT NULL (migration 0072
 * pendente).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — shape REAL de studyNotes (shared/schema.ts:973-981) + colunas novas.
// Migration 0072 traz:
//   - studyNotes.studySessionId varchar(21) (FK CASCADE)
//   - studyNotes.studyCardId NULLABLE
//   - CHECK study_notes_link_xor
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    // Helpers novos (RF-04)
    getStudySession: vi.fn(),
    getStudyNotesBySession: vi.fn(),
    createStudyNoteForSession: vi.fn(),
    deleteStudyNote: vi.fn(),
    // Helper existente reusado pelo ownership check
    getStudyNoteById: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-OWNER' },
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  res.send = (d: any) => {
    res.body = d;
    return res;
  };
  return res;
}

const baseSession = {
  id: 'sess_1',
  userId: 'USER-OWNER',
  themeId: 'thm_1',
  status: 'active',
  date: new Date('2026-05-21T10:00:00Z'),
  duration: 0,
  activities: ['theme'],
  studyCardId: null,
  createdAt: new Date('2026-05-21T10:00:00Z'),
};

const baseNote = (overrides: any = {}) => ({
  id: 'note_1',
  studyCardId: null, // schema pos-0072 — NULL aceitavel
  studySessionId: 'sess_1', // NOVO
  content: 'Anotacao 1',
  tags: [],
  createdAt: new Date('2026-05-21T10:05:00Z'),
  updatedAt: new Date('2026-05-21T10:05:00Z'),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Loaders — handlers podem morar em routes/studies.ts OU em modulo novo.
// =============================================================================

async function loadCreateNoteForSessionHandler() {
  const mods = [
    '../../../server/routes/studies',
    '../../../server/routes/study-sessions-page',
  ];
  for (const p of mods) {
    try {
      const mod: any = await import(p);
      const h =
        mod.handleCreateStudyNoteForSession ??
        mod.handlePostStudyNoteSession ??
        mod.createStudyNoteForSessionHandler;
      if (h) return h;
    } catch {
      // try next
    }
  }
  throw new Error('handleCreateStudyNoteForSession nao encontrado.');
}

async function loadListNotesBySessionHandler() {
  const mods = [
    '../../../server/routes/studies',
    '../../../server/routes/study-sessions-page',
  ];
  for (const p of mods) {
    try {
      const mod: any = await import(p);
      const h =
        mod.handleListStudyNotesBySession ??
        mod.handleGetStudyNotesBySession ??
        mod.listStudyNotesForSessionHandler;
      if (h) return h;
    } catch {
      // try next
    }
  }
  throw new Error('handleListStudyNotesBySession nao encontrado.');
}

async function loadDeleteNoteHandler() {
  const mods = [
    '../../../server/routes/studies',
    '../../../server/routes/study-sessions-page',
  ];
  for (const p of mods) {
    try {
      const mod: any = await import(p);
      const h =
        mod.handleDeleteStudyNote ??
        mod.deleteStudyNoteHandler;
      if (h) return h;
    } catch {
      // try next
    }
  }
  throw new Error('handleDeleteStudyNote nao encontrado.');
}

// =============================================================================
// RF-04 — POST /api/study-sessions/:id/notes
// =============================================================================
describe('POST /api/study-sessions/:id/notes — cria note linkada a sessao', () => {
  it('201 com note {studySessionId, content, studyCardId:null}', async () => {
    (storage.getStudySession as any).mockResolvedValue({ ...baseSession });
    (storage.createStudyNoteForSession as any).mockResolvedValue(
      baseNote({ content: 'Minha primeira nota' }),
    );
    const handler = await loadCreateNoteForSessionHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'sess_1' },
        body: { content: 'Minha primeira nota' },
      }),
      res,
    );
    expect([200, 201]).toContain(res.statusCode);
    expect(res.body).toMatchObject({
      id: 'note_1',
      studySessionId: 'sess_1',
      studyCardId: null,
      content: 'Minha primeira nota',
    });
    // Garante que o helper foi chamado com sessionId derivado do param.
    const callArgs = (storage.createStudyNoteForSession as any).mock.calls[0];
    const joined = JSON.stringify(callArgs);
    expect(joined).toContain('sess_1');
    expect(joined).toContain('Minha primeira nota');
  });

  it('400 quando body sem content', async () => {
    (storage.getStudySession as any).mockResolvedValue({ ...baseSession });
    const handler = await loadCreateNoteForSessionHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'sess_1' },
        body: {}, // sem content
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(storage.createStudyNoteForSession).not.toHaveBeenCalled();
  });

  it('400 quando content vazio (string em branco)', async () => {
    (storage.getStudySession as any).mockResolvedValue({ ...baseSession });
    const handler = await loadCreateNoteForSessionHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'sess_1' },
        body: { content: '   ' },
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 quando sessao pertence a outro user (IDOR via ownership)', async () => {
    (storage.getStudySession as any).mockResolvedValue(null);
    const handler = await loadCreateNoteForSessionHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'sess_de_outro_user' },
        body: { content: 'tentativa' },
      }),
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.createStudyNoteForSession).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-04 — GET /api/study-sessions/:id/notes
// =============================================================================
describe('GET /api/study-sessions/:id/notes — lista notes da sessao', () => {
  it('200 com array de notes ordenadas por createdAt ASC', async () => {
    (storage.getStudySession as any).mockResolvedValue({ ...baseSession });
    const notes = [
      baseNote({ id: 'n1', content: 'primeira', createdAt: new Date('2026-05-21T10:00Z') }),
      baseNote({ id: 'n2', content: 'segunda', createdAt: new Date('2026-05-21T10:05Z') }),
      baseNote({ id: 'n3', content: 'terceira', createdAt: new Date('2026-05-21T10:10Z') }),
    ];
    (storage.getStudyNotesBySession as any).mockResolvedValue(notes);
    const handler = await loadListNotesBySessionHandler();
    const res = makeRes();
    await handler(makeReq({ params: { id: 'sess_1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);
    expect(res.body[0]).toMatchObject({ id: 'n1', studySessionId: 'sess_1' });
    expect(res.body[2]).toMatchObject({ id: 'n3' });
  });

  it('200 com array vazio quando sessao nao tem notes', async () => {
    (storage.getStudySession as any).mockResolvedValue({ ...baseSession });
    (storage.getStudyNotesBySession as any).mockResolvedValue([]);
    const handler = await loadListNotesBySessionHandler();
    const res = makeRes();
    await handler(makeReq({ params: { id: 'sess_1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('404 quando sessao pertence a outro user (IDOR)', async () => {
    (storage.getStudySession as any).mockResolvedValue(null);
    const handler = await loadListNotesBySessionHandler();
    const res = makeRes();
    await handler(
      makeReq({ params: { id: 'sess_de_outro_user' } }),
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.getStudyNotesBySession).not.toHaveBeenCalled();
  });

  it('helper recebe sessionId + userId (ownership scoping)', async () => {
    (storage.getStudySession as any).mockResolvedValue({ ...baseSession });
    (storage.getStudyNotesBySession as any).mockResolvedValue([]);
    const handler = await loadListNotesBySessionHandler();
    const res = makeRes();
    await handler(makeReq({ params: { id: 'sess_1' } }), res);
    const callArgs = (storage.getStudyNotesBySession as any).mock.calls[0];
    const joined = JSON.stringify(callArgs);
    expect(joined).toContain('sess_1');
    expect(joined).toContain('USER-OWNER');
  });
});

// =============================================================================
// RF-04 — DELETE /api/study-notes/:id (estendido pra notes de sessao)
// =============================================================================
describe('DELETE /api/study-notes/:id — note de sessao', () => {
  it('200 quando user dono da sessao da note', async () => {
    // Note linkada via sessao do user
    (storage.getStudyNoteById as any).mockResolvedValue(
      baseNote({ studySessionId: 'sess_1', studyCardId: null }),
    );
    // Ownership: sessao pertence ao user.
    (storage.getStudySession as any).mockResolvedValue({ ...baseSession });
    (storage.deleteStudyNote as any).mockResolvedValue(true);
    const handler = await loadDeleteNoteHandler();
    const res = makeRes();
    await handler(makeReq({ params: { id: 'note_1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(storage.deleteStudyNote).toHaveBeenCalled();
  });

  it('404 quando note pertence a sessao de outro user (IDOR XOR)', async () => {
    (storage.getStudyNoteById as any).mockResolvedValue(
      baseNote({ studySessionId: 'sess_de_outro_user', studyCardId: null }),
    );
    // Sessao nao retorna pro user atual.
    (storage.getStudySession as any).mockResolvedValue(null);
    const handler = await loadDeleteNoteHandler();
    const res = makeRes();
    await handler(makeReq({ params: { id: 'note_1' } }), res);
    expect(res.statusCode).toBe(404);
    expect(storage.deleteStudyNote).not.toHaveBeenCalled();
  });

  it('404 quando note nao existe', async () => {
    (storage.getStudyNoteById as any).mockResolvedValue(null);
    const handler = await loadDeleteNoteHandler();
    const res = makeRes();
    await handler(makeReq({ params: { id: 'note_inexistente' } }), res);
    expect(res.statusCode).toBe(404);
    expect(storage.deleteStudyNote).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-01 — Zod insertStudyNoteSchema refinement (XOR fraco no payload-side)
// =============================================================================
describe('insertStudyNoteSchema — XOR-fraco entre studyCardId e studySessionId', () => {
  it('aceita payload com APENAS studySessionId', async () => {
    const schemaMod: any = await import('../../../shared/schema');
    const schema = schemaMod.insertStudyNoteSchema;
    const result = schema.safeParse({
      id: 'n1',
      studySessionId: 'sess_1',
      content: 'ok',
    });
    expect(result.success).toBe(true);
  });

  it('aceita payload com APENAS studyCardId (legacy)', async () => {
    const schemaMod: any = await import('../../../shared/schema');
    const schema = schemaMod.insertStudyNoteSchema;
    const result = schema.safeParse({
      id: 'n1',
      studyCardId: 'card_1',
      content: 'legacy',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita payload SEM studyCardId e SEM studySessionId', async () => {
    const schemaMod: any = await import('../../../shared/schema');
    const schema = schemaMod.insertStudyNoteSchema;
    const result = schema.safeParse({
      id: 'n1',
      content: 'orfa',
    });
    expect(result.success).toBe(false);
  });
});
