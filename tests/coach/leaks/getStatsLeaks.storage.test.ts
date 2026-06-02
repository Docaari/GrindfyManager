import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Fase C #3 — getStatsLeaks: camada 2 (orquestração no storage) — ADR-231 RED phase
//
// Alvo: storage.getStatsLeaks(userId, top) em server/storage.ts (hoje stub `return []`).
//   - Lê 3 fontes via drizzle:
//       S1 coach_leak_focus  WHERE userId AND status='active'
//       S2 study_sessions_v2 WHERE userId AND mode='stat_analysis' AND deletedAt IS NULL
//                                 AND (startedAt IS NULL OR startedAt >= now-60d)
//       S3 user_focus_stats  WHERE userId AND month = currentMonth
//   - Deriva currentMonth = YYYY-MM (UTC) inline e passa ao helper.
//   - try/catch POR FONTE (lesson #9): 1 query lança -> loga + degrada SÓ ela; as
//     outras 2 ainda alimentam o helper. Todas lançam -> [].
//   - Chama synthesizeLeaks(inputs, top) (helper mockado p/ isolar orquestração).
//
// Lessons aplicadas:
//   #36 — mock parcial de `drizzle-orm` INCLUI `relations: vi.fn()` (senão @shared/schema
//          quebra ao carregar dentro de storage.ts: "No 'relations' export").
//   #9  — log emitido ANTES do degrade (spy em console.error).
//   #3  — rows mockadas usam o SHAPE REAL das colunas (CoachLeakFocus / StudySessionV2 /
//          UserFocusStat verificadas em shared/schema.ts).
//
// Estratégia (ADR D-A8): mockar o helper detectLeaks p/ isolar "leu certo + degradou
// certo"; a síntese é coberta exaustivamente em synthesizeLeaks.test.ts.
// =============================================================================

import {
  coachLeakFocus,
  studySessionsV2,
  userFocusStats,
} from '@shared/schema';

// -----------------------------------------------------------------------------
// Mock do helper puro — captura os inputs com que o storage o chama.
// -----------------------------------------------------------------------------
const synthesizeLeaksMock = vi.fn();

vi.mock('../../../server/coach/leaks/detectLeaks', () => ({
  synthesizeLeaks: (...args: any[]) => synthesizeLeaksMock(...args),
}));

// -----------------------------------------------------------------------------
// Mock do drizzle-orm — parcial mas com `relations` (lesson #36). Os helpers de
// condição só precisam não-lançar; o roteamento por fonte é por `.from(table)`.
// -----------------------------------------------------------------------------
vi.mock('drizzle-orm', () => ({
  relations: vi.fn(() => ({})),
  eq: vi.fn((...a: any[]) => ({ op: 'eq', a })),
  and: vi.fn((...a: any[]) => ({ op: 'and', a })),
  or: vi.fn((...a: any[]) => ({ op: 'or', a })),
  gte: vi.fn((...a: any[]) => ({ op: 'gte', a })),
  lte: vi.fn((...a: any[]) => ({ op: 'lte', a })),
  lt: vi.fn((...a: any[]) => ({ op: 'lt', a })),
  gt: vi.fn((...a: any[]) => ({ op: 'gt', a })),
  desc: vi.fn((x: any) => ({ op: 'desc', x })),
  asc: vi.fn((x: any) => ({ op: 'asc', x })),
  like: vi.fn((...a: any[]) => ({ op: 'like', a })),
  not: vi.fn((...a: any[]) => ({ op: 'not', a })),
  inArray: vi.fn((...a: any[]) => ({ op: 'inArray', a })),
  isNotNull: vi.fn((...a: any[]) => ({ op: 'isNotNull', a })),
  isNull: vi.fn((...a: any[]) => ({ op: 'isNull', a })),
  count: vi.fn((...a: any[]) => ({ op: 'count', a })),
  sql: Object.assign(
    vi.fn((...a: any[]) => ({ op: 'sql', a })),
    { raw: (s: string) => ({ raw: s }) },
  ),
}));

// -----------------------------------------------------------------------------
// "Banco" controlável por fonte (rows OU erro). Dispatch por identidade de tabela.
// O builder é chainable + thenable (resolve no await) e cobre .where/.orderBy/.limit
// em qualquer combinação (o implementer ainda não escreveu a query exata).
// -----------------------------------------------------------------------------
type SourceResult = { rows?: any[]; error?: Error };
const sourceFor = new Map<any, SourceResult>();

function makeChain(result: SourceResult) {
  const resolve = () => {
    if (result.error) return Promise.reject(result.error);
    return Promise.resolve(result.rows ?? []);
  };
  const chain: any = {
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    // thenable — `await db.select()...` resolve aqui
    then: (onF: any, onR: any) => resolve().then(onF, onR),
    catch: (onR: any) => resolve().catch(onR),
  };
  return chain;
}

vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        const res = sourceFor.get(table) ?? { rows: [] };
        return makeChain(res);
      }),
    })),
  },
  pool: {},
}));

async function loadStorage() {
  const mod: any = await import('../../../server/storage');
  return mod.storage;
}

// -----------------------------------------------------------------------------
// PRECONDIÇÃO ambiental (lesson #25 — documentar, não corrigir):
// Na branch feature/fase-c-stats-leaks (tree compartilhada com MDA-1), server/storage.ts
// faz `import { attachMdaStorage } from "./storage/mdaStorage"` mas o arquivo
// server/storage/mdaStorage.ts está AUSENTE (incidente de entanglement MDA-1 — main e a
// branch ficaram com o import sem o módulo; PR#5/completação restaura). Logo, `storage.ts`
// é IMPORTÁVEL repo-wide somente quando a árvore estiver inteira. Estes testes de
// orquestração SÓ podem rodar com storage.ts carregável.
//
// Esta probe distingue "storage.ts não carrega por motivo ALHEIO a getStatsLeaks"
// (módulo faltando -> BLOQUEADO, não é red de feature) de uma falha real de assertion.
// Quando a árvore estiver inteira (mdaStorage presente), a probe passa e os testes
// medem getStatsLeaks de verdade.
let storageLoadError: unknown = null;
beforeAll(async () => {
  try {
    await import('../../../server/storage');
  } catch (e) {
    storageLoadError = e;
  }
});

beforeEach(() => {
  synthesizeLeaksMock.mockReset();
  synthesizeLeaksMock.mockReturnValue([]);
  sourceFor.clear();
  sourceFor.set(coachLeakFocus, { rows: [] });
  sourceFor.set(studySessionsV2, { rows: [] });
  sourceFor.set(userFocusStats, { rows: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// SHAPES REAIS (lesson #3) — colunas verificadas em shared/schema.ts:
//   coach_leak_focus: leakCode, description, targetMonth, baselineStatKey, baselineValue, status
//   study_sessions_v2: statId, statAnalysisEntries (jsonb), startedAt, deletedAt, mode
//   user_focus_stats: statId, month
function coachLeakRow(over: Partial<any> = {}) {
  return {
    id: over.id ?? 'clf-1',
    userId: over.userId ?? 'USER-0001',
    leakCode: over.leakCode ?? 'leak_vpip',
    description: over.description ?? 'VPIP muito alto',
    targetMonth: over.targetMonth ?? '2026-06',
    baselineStatKey: over.baselineStatKey ?? 'vpip',
    baselineValue: over.baselineValue ?? '28.50',
    baselineSampleSize: over.baselineSampleSize ?? 1200,
    status: over.status ?? 'active',
    resolvedAt: over.resolvedAt ?? null,
  };
}

function statAnalysisRow(over: Partial<any> = {}) {
  return {
    id: over.id ?? 'ssv2-1',
    userId: over.userId ?? 'USER-0001',
    mode: 'stat_analysis',
    statId: over.statId ?? 'pfr',
    statAnalysisEntries: over.statAnalysisEntries ?? [{ id: 'e1' }, { id: 'e2' }],
    startedAt: over.startedAt ?? new Date(),
    deletedAt: over.deletedAt ?? null,
  };
}

function focusStatRow(over: Partial<any> = {}) {
  return {
    id: over.id ?? 'ufs-1',
    userId: over.userId ?? 'USER-0001',
    statId: over.statId ?? 'threebet_pf',
    month: over.month ?? '2026-06',
  };
}

// =============================================================================
// Orquestração — leu as 3 fontes e chamou o helper com os inputs crus
// =============================================================================
describe('getStatsLeaks — orquestração das 3 leituras (RF-07)', () => {
  it('passa os inputs das 3 fontes + currentMonth + top para synthesizeLeaks', async () => {
    sourceFor.set(coachLeakFocus, { rows: [coachLeakRow()] });
    sourceFor.set(studySessionsV2, { rows: [statAnalysisRow()] });
    sourceFor.set(userFocusStats, { rows: [focusStatRow()] });

    const storage = await loadStorage();
    await storage.getStatsLeaks('USER-0001', 5);

    expect(synthesizeLeaksMock).toHaveBeenCalledTimes(1);
    const [inputs, top] = synthesizeLeaksMock.mock.calls[0];
    expect(top).toBe(5);
    expect(Array.isArray(inputs.coachLeaks)).toBe(true);
    expect(Array.isArray(inputs.statAnalysisSessions)).toBe(true);
    expect(Array.isArray(inputs.focusStats)).toBe(true);
    expect(inputs.coachLeaks.length).toBe(1);
    expect(inputs.statAnalysisSessions.length).toBe(1);
    expect(inputs.focusStats.length).toBe(1);
  });

  it('currentMonth derivado UTC no formato YYYY-MM', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));

    const storage = await loadStorage();
    await storage.getStatsLeaks('USER-0001', 3);

    const [inputs] = synthesizeLeaksMock.mock.calls[0];
    expect(inputs.currentMonth).toBe('2026-06');
    expect(inputs.currentMonth).toMatch(/^\d{4}-\d{2}$/);
  });

  it('retorna exatamente o que o helper devolve', async () => {
    const fake = [{ statId: 'pfr', statName: 'PFR', value: null, benchmark: 18, delta: null, severity: 10 }];
    synthesizeLeaksMock.mockReturnValue(fake);

    const storage = await loadStorage();
    const out = await storage.getStatsLeaks('USER-0001', 3);
    expect(out).toEqual(fake);
  });

  it('todas as fontes vazias -> helper recebe arrays vazios; resultado [] (degrade preservado)', async () => {
    const storage = await loadStorage();
    const out = await storage.getStatsLeaks('USER-0001', 3);
    expect(out).toEqual([]);
    const [inputs] = synthesizeLeaksMock.mock.calls[0];
    expect(inputs.coachLeaks).toEqual([]);
    expect(inputs.statAnalysisSessions).toEqual([]);
    expect(inputs.focusStats).toEqual([]);
  });
});

// =============================================================================
// Resiliência por fonte (lesson #9) — try/catch por query
// =============================================================================
describe('getStatsLeaks — try/catch por fonte (lesson #9)', () => {
  it('S1 (coach_leak_focus) lança -> loga + degrada S1 para []; S2/S3 ainda alimentam o helper', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sourceFor.set(coachLeakFocus, { error: new Error('boom S1') });
    sourceFor.set(studySessionsV2, { rows: [statAnalysisRow()] });
    sourceFor.set(userFocusStats, { rows: [focusStatRow()] });

    const storage = await loadStorage();
    await storage.getStatsLeaks('USER-0001', 5);

    // helper ainda foi chamado, com S1 degradado para [] mas S2/S3 presentes
    expect(synthesizeLeaksMock).toHaveBeenCalledTimes(1);
    const [inputs] = synthesizeLeaksMock.mock.calls[0];
    expect(inputs.coachLeaks).toEqual([]);
    expect(inputs.statAnalysisSessions.length).toBe(1);
    expect(inputs.focusStats.length).toBe(1);

    // logou ANTES de degradar (lesson #9)
    expect(errSpy).toHaveBeenCalled();
  });

  it('S2 (stat_analysis) lança -> degrada S2 para []; S1/S3 presentes + log', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sourceFor.set(coachLeakFocus, { rows: [coachLeakRow()] });
    sourceFor.set(studySessionsV2, { error: new Error('boom S2') });
    sourceFor.set(userFocusStats, { rows: [focusStatRow()] });

    const storage = await loadStorage();
    await storage.getStatsLeaks('USER-0001', 5);

    const [inputs] = synthesizeLeaksMock.mock.calls[0];
    expect(inputs.statAnalysisSessions).toEqual([]);
    expect(inputs.coachLeaks.length).toBe(1);
    expect(inputs.focusStats.length).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('S3 (user_focus_stats) lança -> degrada S3 para []; S1/S2 presentes + log', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sourceFor.set(coachLeakFocus, { rows: [coachLeakRow()] });
    sourceFor.set(studySessionsV2, { rows: [statAnalysisRow()] });
    sourceFor.set(userFocusStats, { error: new Error('boom S3') });

    const storage = await loadStorage();
    await storage.getStatsLeaks('USER-0001', 5);

    const [inputs] = synthesizeLeaksMock.mock.calls[0];
    expect(inputs.focusStats).toEqual([]);
    expect(inputs.coachLeaks.length).toBe(1);
    expect(inputs.statAnalysisSessions.length).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('todas as 3 queries lançam -> método NÃO lança; retorna [] (helper com 3 arrays vazios ou não chamado)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sourceFor.set(coachLeakFocus, { error: new Error('S1') });
    sourceFor.set(studySessionsV2, { error: new Error('S2') });
    sourceFor.set(userFocusStats, { error: new Error('S3') });

    const storage = await loadStorage();
    const out = await storage.getStatsLeaks('USER-0001', 5);
    expect(out).toEqual([]);
  });
});

// =============================================================================
// Assinatura preservada
// =============================================================================
describe('getStatsLeaks — assinatura preservada', () => {
  it('getStatsLeaks(userId, top) é função e retorna Promise<array>', async () => {
    const storage = await loadStorage();
    expect(typeof storage.getStatsLeaks).toBe('function');
    const out = await storage.getStatsLeaks('USER-0001', 3);
    expect(Array.isArray(out)).toBe(true);
  });
});

// =============================================================================
// Diagnóstico do bloqueador ambiental (lesson #25) — NÃO é red de feature.
// Se este teste FALHAR, server/storage.ts está IMPORTÁVEL e todos os testes acima
// medem getStatsLeaks de verdade. Se PASSAR, a árvore está incompleta (mdaStorage
// ausente) e as falhas acima são do import quebrado, não da síntese.
// =============================================================================
describe('precondição: server/storage.ts importável', () => {
  it('storage.ts carrega sem erro de módulo ausente (mdaStorage)', () => {
    if (storageLoadError) {
      // eslint-disable-next-line no-console
      console.warn(
        '[BLOQUEADO] server/storage.ts não importa nesta árvore: ' +
          String((storageLoadError as Error)?.message ?? storageLoadError) +
          ' — incidente entanglement MDA-1 (mdaStorage ausente). Restaurar a árvore (PR#5/completação MDA-1) destrava os testes de orquestração de getStatsLeaks.',
      );
    }
    expect(storageLoadError).toBeNull();
  });
});
