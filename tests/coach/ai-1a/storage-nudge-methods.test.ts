import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-1A / RF-02 — Storage methods novos para anti-fadiga
//
// Modulo alvo: server/storage.ts (classe DatabaseStorage / export `storage`)
//   - getActiveSnoozeForCategory(userId, category, now): Promise<Date | null>
//   - getNudgeDismissRate(userId, category, sinceDays): Promise<{ sent, dismissed, rate }>
//   - listNudgeLog(userId, { category?, status?, since?, limit? }): Promise<CoachNudgeLog[]>
//   - getNudgeLogById(id): Promise<CoachNudgeLog | undefined>
//
// Fontes:
//   - Docs/specs/sprint-ai-1a.md (RF-02 + "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/152-anti-fadiga-snooze-telemetry-autofreeze-killswitch.md (§4, §5)
//
// Estrategia: mock `./db` com um builder chainable que devolve dados canned no
// fim da cadeia (a query exata varia — o que validamos e o shape de retorno +
// a semantica do filtro via dados que retornamos).
//
// Lesson #9: erro de DB -> retorna safe ([] / null) com console.error, NAO throw,
//   exceto onde o padrao existente do storage faz throw (countNudgeLog/findNudgeLog
//   fazem throw — o engine trata). getActiveSnoozeForCategory/getNudgeDismissRate
//   devem retornar safe (sao consumidos por nudgeAutoFreeze/engine que ja tem
//   try/catch — mas idealmente nao crasham). Aceitamos throw OU safe-return aqui;
//   o teste de erro valida que nao crasha o processo.
// =============================================================================

// Builder chainable: cada metodo encadeavel retorna `this`; o resultado final
// vem de `__result` (configuravel por teste).
// Para erro: setar `__error = new Error(...)` (a rejeicao so acontece quando o
// chain e awaited — evita unhandled rejection).
let __result: any = [];
let __error: Error | null = null;
function makeChainable() {
  const chain: any = {};
  const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'groupBy', 'leftJoin', 'innerJoin', 'set', 'update'];
  for (const m of methods) chain[m] = vi.fn(() => chain);
  // torna o chain "thenable" para `await db.select()...` — a rejeicao so acontece
  // dentro do `.then` (lazy), nunca como uma promise rejeitada solta.
  chain.then = (resolve: any, reject?: any) => {
    if (__error) {
      const e = __error;
      return reject ? Promise.resolve().then(() => reject(e)) : Promise.reject(e);
    }
    return Promise.resolve(__result).then(resolve, reject);
  };
  chain.catch = (reject: any) => chain.then(undefined, reject);
  return chain;
}

const dbChain = makeChainable();

vi.mock('../../../server/db', () => ({
  db: dbChain,
  pool: {},
}));

beforeEach(() => {
  __result = [];
  __error = null;
});

async function getStorage() {
  const mod: any = await import('../../../server/storage');
  return mod.storage;
}

// ---------------------------------------------------------------------------
// getNudgeLogById
// ---------------------------------------------------------------------------
describe('getNudgeLogById', () => {
  it('retorna a row quando existe', async () => {
    __result = [{ id: 'nl-1', userId: 'USER-0001', category: 'B-LEAK', status: 'sent', sentAt: new Date() }];
    const storage = await getStorage();
    const row = await storage.getNudgeLogById('nl-1');
    expect(row).toEqual(expect.objectContaining({ id: 'nl-1', userId: 'USER-0001' }));
  });

  it('retorna undefined quando nao existe', async () => {
    __result = [];
    const storage = await getStorage();
    const row = await storage.getNudgeLogById('nl-ghost');
    expect(row).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getActiveSnoozeForCategory
// ---------------------------------------------------------------------------
describe('getActiveSnoozeForCategory', () => {
  it('retorna o snoozeUntil mais futuro entre rows snoozed da categoria com snoozeUntil > now', async () => {
    const now = new Date(Date.UTC(2026, 4, 12, 12, 0, 0));
    const future1 = new Date(now.getTime() + 24 * 3600 * 1000);
    const future2 = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    // O storage faz a query (status='snoozed', snoozeUntil > now, order desc, limit 1) — aqui
    // simulamos retornando o mais futuro como primeiro.
    __result = [{ id: 'nl-2', snoozeUntil: future2 }, { id: 'nl-1', snoozeUntil: future1 }];
    const storage = await getStorage();
    const out = await storage.getActiveSnoozeForCategory('USER-0001', 'B-LEAK', now);
    expect(out).toBeInstanceOf(Date);
    expect(out!.getTime()).toBe(future2.getTime());
  });

  it('retorna null quando nenhum snooze ativo', async () => {
    __result = [];
    const storage = await getStorage();
    const out = await storage.getActiveSnoozeForCategory('USER-0001', 'B-LEAK', new Date());
    expect(out).toBeNull();
  });

  it('erro de DB -> nao crasha o processo (safe-return null OU throw tratado)', async () => {
    __error = new Error('timeout');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const storage = await getStorage();
    let out: any; let threw = false;
    try { out = await storage.getActiveSnoozeForCategory('USER-DB-ERR', 'B-LEAK', new Date()); }
    catch { threw = true; }
    // aceitavel: throw (engine trata) OU null (safe). O importante e nao crash hard.
    expect(threw || out === null).toBe(true);
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getNudgeDismissRate
// ---------------------------------------------------------------------------
describe('getNudgeDismissRate', () => {
  it('retorna { sent, dismissed, rate } — sent inclui sent/engaged/dismissed/unsubscribed, exclui snoozed; dismissed inclui dismissed+unsubscribed', async () => {
    // Simulamos o que a query agregada retorna. O storage pode fazer 2 counts
    // ou 1 count com agregacao; aqui o mock devolve uma linha agregada.
    // sent=10 (4 dismissed + 1 unsubscribed + 5 engaged), dismissed=5 -> rate 0.5
    __result = [{ sent: 10, dismissed: 5 }];
    const storage = await getStorage();
    const out = await storage.getNudgeDismissRate('USER-0001', 'B-STUDY', 7);
    expect(out.sent).toBe(10);
    expect(out.dismissed).toBe(5);
    expect(out.rate).toBeCloseTo(0.5, 5);
  });

  it('sent === 0 -> rate 0 (nao divide por zero)', async () => {
    __result = [{ sent: 0, dismissed: 0 }];
    const storage = await getStorage();
    const out = await storage.getNudgeDismissRate('USER-0001', 'B-STUDY', 7);
    expect(out.sent).toBe(0);
    expect(out.rate).toBe(0);
  });

  it('erro de DB -> safe-return { sent:0, dismissed:0, rate:0 } OU throw tratado, sem crash hard', async () => {
    __error = new Error('connection_reset');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const storage = await getStorage();
    let out: any; let threw = false;
    try { out = await storage.getNudgeDismissRate('USER-DB-ERR', 'B-STUDY', 7); }
    catch { threw = true; }
    expect(threw || (out && out.rate === 0)).toBe(true);
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// listNudgeLog
// ---------------------------------------------------------------------------
describe('listNudgeLog', () => {
  it('retorna a lista de rows do usuario (ordenada sentAt desc — a query faz)', async () => {
    __result = [
      { id: 'nl-2', userId: 'USER-0001', category: 'B-LEAK', status: 'sent', sentAt: new Date(2026, 4, 12) },
      { id: 'nl-1', userId: 'USER-0001', category: 'B-STUDY', status: 'dismissed', sentAt: new Date(2026, 4, 10) },
    ];
    const storage = await getStorage();
    const rows = await storage.listNudgeLog('USER-0001', {});
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe('nl-2');
  });

  it('aceita filtros { category, status, since, limit } sem quebrar', async () => {
    __result = [{ id: 'nl-1', userId: 'USER-0001', category: 'B-LEAK', status: 'snoozed', sentAt: new Date() }];
    const storage = await getStorage();
    const rows = await storage.listNudgeLog('USER-0001', { category: 'B-LEAK', status: 'snoozed', since: new Date(2026, 4, 1), limit: 50 });
    expect(rows.length).toBe(1);
    expect(rows[0].category).toBe('B-LEAK');
  });

  it('sem rows -> []', async () => {
    __result = [];
    const storage = await getStorage();
    const rows = await storage.listNudgeLog('USER-EMPTY', {});
    expect(rows).toEqual([]);
  });

  it('erro de DB -> [] com console.error (lesson #9), sem throw', async () => {
    __error = new Error('timeout');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const storage = await getStorage();
    const rows = await storage.listNudgeLog('USER-DB-ERR', {});
    expect(rows).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// normalizeCoachPreferences back-fill (lesson #3)
// ---------------------------------------------------------------------------
describe('normalizeCoachPreferences — frozenCategories back-fill', () => {
  it('row sem frozenCategories -> normalize injeta {}', async () => {
    const { normalizeCoachPreferences } = await import('../../../server/storage/coachPreferences');
    const out: any = normalizeCoachPreferences({ nudgeBSnapshot: true });
    expect(out.frozenCategories).toEqual({});
  });

  it('row com frozenCategories -> preservado', async () => {
    const { normalizeCoachPreferences } = await import('../../../server/storage/coachPreferences');
    const fc = { 'B-STUDY': { frozenAt: '2026-05-01T00:00:00Z', reason: 'admin' } };
    const out: any = normalizeCoachPreferences({ frozenCategories: fc });
    expect(out.frozenCategories).toEqual(fc);
  });
});
