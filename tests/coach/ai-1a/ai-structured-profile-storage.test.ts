import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-1A / RF-01 — Perfil estruturado JSONB: storage layer com DB
//
// Modulo alvo (NAO existe ainda): server/storage/aiStructuredProfile.ts
//   export async function getAiStructuredProfile(userId): Promise<AiStructuredProfile>
//   export async function updateAiStructuredProfile(userId, delta): Promise<AiStructuredProfile>
//   export function _resetAiStructuredProfileCacheForTests()  // se cachear
//
// Fontes:
//   - Docs/specs/sprint-ai-1a.md (RF-01)
//   - Docs/architecture/decisions/151-ai-structured-profile-jsonb.md
//
// Lessons:
//   - #3: mock o SHAPE REAL de `users` (a coluna `ai_structured_profile` jsonb).
//   - #9: erro de DB na leitura -> log estruturado + retorna { schemaVersion: 1 }, sem throw.
//   - #19/#21: se cachear, _resetForTests() em beforeEach + invalidate em todo write.
// =============================================================================

// Mock do db Drizzle — implementer usa db.select().from(users).where(...).limit(1)
// para ler, db.update(users).set(...).where(...) para escrever.
const dbSelectMock = vi.fn();
const dbUpdateMock = vi.fn();

vi.mock('../../../server/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => dbSelectMock(),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => dbUpdateMock(),
      }),
    }),
  },
  pool: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: any[]) => ({ type: 'eq', a })),
  and: vi.fn((...a: any[]) => ({ type: 'and', a })),
  sql: Object.assign(vi.fn((...a: any[]) => ({ type: 'sql', a })), { raw: (s: string) => ({ raw: s }) }),
}));

vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'meta-mock-id') }));

async function loadModule() {
  const mod: any = await import('../../../server/storage/aiStructuredProfile');
  if (typeof mod._resetAiStructuredProfileCacheForTests === 'function') {
    mod._resetAiStructuredProfileCacheForTests();
  }
  return mod;
}

beforeEach(() => {
  dbSelectMock.mockReset();
  dbUpdateMock.mockReset();
});

describe('getAiStructuredProfile — defaults / normalize', () => {
  it('user sem o campo populado (coluna NULL) -> { schemaVersion: 1 }, sem throw', async () => {
    dbSelectMock.mockResolvedValue([{ id: 'u-1', userPlatformId: 'USER-0001', aiStructuredProfile: null }]);
    const { getAiStructuredProfile } = await loadModule();
    const out = await getAiStructuredProfile('USER-0001');
    expect(out.schemaVersion).toBe(1);
  });

  it('coluna = {} -> { schemaVersion: 1 }', async () => {
    dbSelectMock.mockResolvedValue([{ id: 'u-1', userPlatformId: 'USER-0001', aiStructuredProfile: {} }]);
    const { getAiStructuredProfile } = await loadModule();
    const out = await getAiStructuredProfile('USER-0001');
    expect(out.schemaVersion).toBe(1);
  });

  it('coluna com dados -> normalizada (clamp metas a 3)', async () => {
    dbSelectMock.mockResolvedValue([{
      id: 'u-1', userPlatformId: 'USER-0001',
      aiStructuredProfile: {
        schemaVersion: 1,
        metas: [1, 2, 3, 4, 5].map(n => ({ id: `m${n}`, texto: `meta ${n}`, criadaEm: '2026-05-12T00:00:00Z', origem: 'onboarding' })),
      },
    }]);
    const { getAiStructuredProfile } = await loadModule();
    const out = await getAiStructuredProfile('USER-0001');
    expect(out.metas!.length).toBe(3);
  });

  it('user nao existe (array vazio) -> { schemaVersion: 1 } sem throw', async () => {
    dbSelectMock.mockResolvedValue([]);
    const { getAiStructuredProfile } = await loadModule();
    const out = await getAiStructuredProfile('USER-GHOST');
    expect(out.schemaVersion).toBe(1);
  });

  it('lesson #9 — erro de DB na leitura -> console.error + retorna { schemaVersion: 1 }, sem throw', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbSelectMock.mockRejectedValue(new Error('connection_reset'));
    const { getAiStructuredProfile } = await loadModule();
    const out = await getAiStructuredProfile('USER-DB-ERR');
    expect(out.schemaVersion).toBe(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('updateAiStructuredProfile — persiste, merge raso, clamps, updatedAt', () => {
  it('updateAiStructuredProfile(userId, { focoDoMes }) persiste e seta updatedAt', async () => {
    dbSelectMock.mockResolvedValue([{ id: 'u-1', userPlatformId: 'USER-0001', aiStructuredProfile: { schemaVersion: 1 } }]);
    dbUpdateMock.mockResolvedValue(undefined);
    const { updateAiStructuredProfile } = await loadModule();
    const out = await updateAiStructuredProfile('USER-0001', { focoDoMes: 'defesa de 3bet' });
    expect(out.focoDoMes).toBe('defesa de 3bet');
    expect(typeof out.updatedAt).toBe('string');
    expect(dbUpdateMock).toHaveBeenCalled();
  });

  it('merge raso — arrays substituem por completo (nao append)', async () => {
    dbSelectMock.mockResolvedValue([{
      id: 'u-1', userPlatformId: 'USER-0001',
      aiStructuredProfile: {
        schemaVersion: 1,
        redesPrincipais: ['GGPoker', 'PokerStars'],
        tomPreferido: 'balanced',
      },
    }]);
    dbUpdateMock.mockResolvedValue(undefined);
    const { updateAiStructuredProfile } = await loadModule();
    const out = await updateAiStructuredProfile('USER-0001', { redesPrincipais: ['WPN'] });
    expect(out.redesPrincipais).toEqual(['WPN']);
    // campos nao tocados preservados
    expect(out.tomPreferido).toBe('balanced');
  });

  it('clamp — metas de 5 elementos -> persistido com 3', async () => {
    dbSelectMock.mockResolvedValue([{ id: 'u-1', userPlatformId: 'USER-0001', aiStructuredProfile: { schemaVersion: 1 } }]);
    dbUpdateMock.mockResolvedValue(undefined);
    const { updateAiStructuredProfile } = await loadModule();
    const out = await updateAiStructuredProfile('USER-0001', {
      metas: [1, 2, 3, 4, 5].map(n => ({ id: `m${n}`, texto: `meta ${n}`, criadaEm: '2026-05-12T00:00:00Z', origem: 'onboarding' as const })),
    });
    expect(out.metas!.length).toBe(3);
  });

  it('invalida cache — leitura apos update reflete o novo valor', async () => {
    // 1a leitura: perfil vazio
    dbSelectMock.mockResolvedValueOnce([{ id: 'u-1', userPlatformId: 'USER-0001', aiStructuredProfile: { schemaVersion: 1 } }]);
    dbUpdateMock.mockResolvedValue(undefined);
    const { getAiStructuredProfile, updateAiStructuredProfile } = await loadModule();
    const before = await getAiStructuredProfile('USER-0001');
    expect(before.focoDoMes).toBeFalsy();

    // update
    await updateAiStructuredProfile('USER-0001', { focoDoMes: 'cbet ranges' });

    // 2a leitura: o DB agora retorna o valor atualizado (mock) — o cache nao pode mascarar
    dbSelectMock.mockResolvedValueOnce([{ id: 'u-1', userPlatformId: 'USER-0001', aiStructuredProfile: { schemaVersion: 1, focoDoMes: 'cbet ranges' } }]);
    const after = await getAiStructuredProfile('USER-0001');
    expect(after.focoDoMes).toBe('cbet ranges');
  });
});
