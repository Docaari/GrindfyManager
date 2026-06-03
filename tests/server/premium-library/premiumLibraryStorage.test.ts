import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Biblioteca Premium curada (ADR-240)
//
// Spec : Docs/specs/premium-library.md (RF-01/02/03/04/06/07)
// ADR  : Docs/architecture/decisions/240-premium-library-curated.md
// Contrato: Docs/architecture/diagrams/premium-library/storage-contract.md
//
// Modulo NOVO (AINDA NAO EXISTE):
//   server/storage/premiumLibraryStorage.ts -> attachPremiumLibraryStorage(storage)
//     storage.listPremiumHighlights(site?, injectedDb?)
//     storage.getPremiumHighlight(id, injectedDb?)               row | null
//     storage.promotePremiumHighlight(input, injectedDb?)        DISCRIMINADO
//       -> { ok: true, row } | { ok: false, conflict: 'already_in_premium' }
//          NAO LANCA no conflito (pg 23505) — o handler decide o 409.
//     storage.removePremiumHighlight(id, injectedDb?)            boolean
//     storage.listAllUserHighlights({ site?, userId?, limit?, offset? }, injectedDb?)
//       -> { items[], total } com atribuicao (username nullable, email) + alreadyInPremium
//     storage.getSavedHighlightByIdAnyUser(id, injectedDb?)      SEM escopo owner
//
// Padrao espelha goalsStorage/mdaStorage (attach + injectedDb como ultimo arg).
//
// Lessons aplicadas:
//   #3  — fakeDb chainable espelha o shape REAL do drizzle. promotePremium retorna
//         objeto DISCRIMINADO, NAO throw. listAllUserHighlights: username nullable,
//         email not null. getSavedHighlightByIdAnyUser NAO filtra por owner.
//   #34 — injectedDb como ultimo arg (sem vi.mock global de storage).
//   #36 — o modulo carrega @shared/schema lazy + fallback; fakeDb ignora os args
//         de .from()/.where(), entao placeholder basta.
//   #9  — em erro de DB (nao-conflito) loga antes do fallback; list retorna [].
//
// .test.ts roda no projeto "server" (node).
// =============================================================================

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

async function loadAttach() {
  return await import('../../../server/storage/premiumLibraryStorage');
}

function makeStorage() {
  return {} as any;
}

// Helper: erro pg de UNIQUE violation (code 23505) — shape REAL do node-postgres.
function uniqueViolation() {
  const e: any = new Error('duplicate key value violates unique constraint "uq_premium_highlight_family"');
  e.code = '23505';
  e.constraint = 'uq_premium_highlight_family';
  return e;
}

const PROMOTE_INPUT = {
  site: 'ggpoker',
  familyKey: 'ggpoker|mtt|$22|regular',
  groupName: 'Bounty Hunters $22',
  buyInTier: '$22',
  type: 'mtt',
  metrics: { roi: 18.4, volume: 320 },
  reasons: [{ kind: 'roi', label: 'ROI alto' }],
  curatedBy: 'USER-CURATOR',
};

describe('attachPremiumLibraryStorage — exposicao dos metodos', () => {
  it('attach popula os 6 metodos do contrato', async () => {
    const { attachPremiumLibraryStorage } = await loadAttach();
    const storage = makeStorage();
    attachPremiumLibraryStorage(storage);
    expect(typeof storage.listPremiumHighlights).toBe('function');
    expect(typeof storage.getPremiumHighlight).toBe('function');
    expect(typeof storage.promotePremiumHighlight).toBe('function');
    expect(typeof storage.removePremiumHighlight).toBe('function');
    expect(typeof storage.listAllUserHighlights).toBe('function');
    expect(typeof storage.getSavedHighlightByIdAnyUser).toBe('function');
  });
});

// =============================================================================
// promotePremiumHighlight — retorno DISCRIMINADO (lesson #3, NAO throw)
// =============================================================================

describe('promotePremiumHighlight — sucesso', () => {
  it('retorna { ok: true, row } com curatedBy preenchido e source default library', async () => {
    const { attachPremiumLibraryStorage } = await loadAttach();
    const storage = makeStorage();
    attachPremiumLibraryStorage(storage);

    let inserted: any = null;
    const fakeDb: any = {
      insert: vi.fn(() => ({
        values: vi.fn((v: any) => {
          inserted = v;
          return { returning: vi.fn(async () => [{ ...v, createdAt: new Date().toISOString() }]) };
        }),
      })),
    };

    const out = await storage.promotePremiumHighlight(PROMOTE_INPUT, fakeDb);
    expect(out.ok).toBe(true);
    expect(out.row).toBeTruthy();
    expect(out.row.familyKey).toBe(PROMOTE_INPUT.familyKey);
    expect(out.row.curatedBy).toBe('USER-CURATOR');
    // source default 'library' quando nao informado.
    expect(inserted.source ?? 'library').toBe('library');
    // id via nanoid (string nao vazia).
    expect(typeof inserted.id).toBe('string');
    expect(inserted.id.length).toBeGreaterThan(0);
  });

  it('preserva rastreabilidade de import (source/sourceUserId/sourceHighlightId)', async () => {
    const { attachPremiumLibraryStorage } = await loadAttach();
    const storage = makeStorage();
    attachPremiumLibraryStorage(storage);

    let inserted: any = null;
    const fakeDb: any = {
      insert: vi.fn(() => ({
        values: vi.fn((v: any) => { inserted = v; return { returning: vi.fn(async () => [{ ...v }]) }; }),
      })),
    };

    const out = await storage.promotePremiumHighlight(
      { ...PROMOTE_INPUT, source: 'import', sourceUserId: 'USER-OWNER', sourceHighlightId: 'hl_42' },
      fakeDb,
    );
    expect(out.ok).toBe(true);
    expect(inserted.source).toBe('import');
    expect(inserted.sourceUserId).toBe('USER-OWNER');
    expect(inserted.sourceHighlightId).toBe('hl_42');
  });
});

describe('promotePremiumHighlight — conflito UNIQUE (familyKey duplicada)', () => {
  it('retorna { ok: false, conflict: "already_in_premium" } em pg 23505 SEM lancar', async () => {
    const { attachPremiumLibraryStorage } = await loadAttach();
    const storage = makeStorage();
    attachPremiumLibraryStorage(storage);

    const fakeDb: any = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn(async () => { throw uniqueViolation(); }) })),
      })),
    };

    // NAO deve lancar — promessa resolve com objeto discriminado.
    let out: any;
    await expect(
      (async () => { out = await storage.promotePremiumHighlight(PROMOTE_INPUT, fakeDb); })(),
    ).resolves.toBeUndefined();

    expect(out.ok).toBe(false);
    expect(out.conflict).toBe('already_in_premium');
  });
});

// =============================================================================
// getPremiumHighlight
// =============================================================================

describe('getPremiumHighlight', () => {
  it('retorna a row quando existe', async () => {
    const { attachPremiumLibraryStorage } = await loadAttach();
    const storage = makeStorage();
    attachPremiumLibraryStorage(storage);

    const row = { id: 'p_1', site: 'ggpoker', familyKey: 'ggpoker|mtt|$22|regular' };
    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => [row]) })) })),
      })),
    };
    const out = await storage.getPremiumHighlight('p_1', fakeDb);
    expect(out).toBeTruthy();
    expect(out.id).toBe('p_1');
  });

  it('retorna null quando nao existe', async () => {
    const { attachPremiumLibraryStorage } = await loadAttach();
    const storage = makeStorage();
    attachPremiumLibraryStorage(storage);

    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })),
      })),
    };
    const out = await storage.getPremiumHighlight('p_missing', fakeDb);
    expect(out).toBeNull();
  });
});

// =============================================================================
// removePremiumHighlight — boolean (false se inexistente)
// =============================================================================

describe('removePremiumHighlight', () => {
  it('retorna true quando a row foi removida (returning com 1 row)', async () => {
    const { attachPremiumLibraryStorage } = await loadAttach();
    const storage = makeStorage();
    attachPremiumLibraryStorage(storage);

    const fakeDb: any = {
      delete: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'p_1' }]) })) })),
    };
    const out = await storage.removePremiumHighlight('p_1', fakeDb);
    expect(out).toBe(true);
  });

  it('retorna false quando nada foi removido (:id inexistente)', async () => {
    const { attachPremiumLibraryStorage } = await loadAttach();
    const storage = makeStorage();
    attachPremiumLibraryStorage(storage);

    const fakeDb: any = {
      delete: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => []) })) })),
    };
    const out = await storage.removePremiumHighlight('p_missing', fakeDb);
    expect(out).toBe(false);
  });
});

// =============================================================================
// listPremiumHighlights — filtro site + fallback [] em erro (lesson #9)
// =============================================================================

describe('listPremiumHighlights', () => {
  it('retorna as rows da premium (sem filtro)', async () => {
    const { attachPremiumLibraryStorage } = await loadAttach();
    const storage = makeStorage();
    attachPremiumLibraryStorage(storage);

    const rows = [{ id: 'p_1', site: 'ggpoker' }, { id: 'p_2', site: 'pokerstars' }];
    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(async () => rows) })) })),
      })),
    };
    const out = await storage.listPremiumHighlights(undefined, fakeDb);
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(2);
  });

  it('retorna [] (nao lanca) quando o DB explode — lesson #9', async () => {
    const { attachPremiumLibraryStorage } = await loadAttach();
    const storage = makeStorage();
    attachPremiumLibraryStorage(storage);

    const fakeDb: any = {
      select: vi.fn(() => { throw new Error('connection lost'); }),
    };
    const out = await storage.listPremiumHighlights('ggpoker', fakeDb);
    expect(out).toEqual([]);
  });
});

// =============================================================================
// listAllUserHighlights — atribuicao (JOIN users) + alreadyInPremium
// =============================================================================

describe('listAllUserHighlights — painel cross-user', () => {
  it('monta atribuicao (username nullable, email) + alreadyInPremium do set premium', async () => {
    const { attachPremiumLibraryStorage } = await loadAttach();
    const storage = makeStorage();
    attachPremiumLibraryStorage(storage);

    // Linhas do JOIN saved_tournament_highlights x users (shape REAL: username pode
    // ser null; email not null). family_key 'A|...' ja na premium; 'B|...' nao.
    const joinedRows = [
      {
        id: 'hl_1', userId: 'USER-A', username: 'jogadorA', email: 'a@example.com',
        site: 'ggpoker', familyKey: 'A|mtt|$22|regular', groupName: 'Fam A',
        buyInTier: '$22', type: 'mtt', metrics: { roi: 10 }, reasons: [], source: 'overview',
        createdAt: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'hl_2', userId: 'USER-B', username: null, email: 'b@example.com',
        site: 'pokerstars', familyKey: 'B|mtt|$11|turbo', groupName: 'Fam B',
        buyInTier: '$11', type: 'mtt', metrics: { roi: 5 }, reasons: [], source: 'library',
        createdAt: '2026-06-02T00:00:00.000Z',
      },
    ];
    // Set de familyKeys ja na premium (so 'A|...').
    const premiumFamilyKeys = [{ familyKey: 'A|mtt|$22|regular' }];

    // fakeDb com 2 caminhos: o SELECT do JOIN (com limit/offset) e o SELECT dos
    // family_key da premium. Distinguimos por chamada sequencial.
    let call = 0;
    const fakeDb: any = {
      select: vi.fn(() => {
        call += 1;
        if (call === 1) {
          // JOIN paginado.
          return {
            from: vi.fn(() => ({
              innerJoin: vi.fn(() => ({
                where: vi.fn(() => ({
                  orderBy: vi.fn(() => ({
                    limit: vi.fn(() => ({ offset: vi.fn(async () => joinedRows) })),
                  })),
                })),
                orderBy: vi.fn(() => ({
                  limit: vi.fn(() => ({ offset: vi.fn(async () => joinedRows) })),
                })),
              })),
            })),
          };
        }
        // SELECT family_key FROM premium.
        return { from: vi.fn(async () => premiumFamilyKeys) };
      }),
    };

    const out = await storage.listAllUserHighlights({ limit: 50, offset: 0 }, fakeDb);
    expect(Array.isArray(out.items)).toBe(true);
    expect(out.items).toHaveLength(2);

    const a = out.items.find((i: any) => i.id === 'hl_1');
    const b = out.items.find((i: any) => i.id === 'hl_2');

    // atribuicao
    expect(a.userId).toBe('USER-A');
    expect(a.username).toBe('jogadorA');
    expect(a.email).toBe('a@example.com');
    // username nullable
    expect(b.username).toBeNull();
    expect(b.email).toBe('b@example.com');

    // alreadyInPremium derivado do set
    expect(a.alreadyInPremium).toBe(true);
    expect(b.alreadyInPremium).toBe(false);
  });
});

// =============================================================================
// getSavedHighlightByIdAnyUser — NAO filtra por owner (ponto sensivel anti-IDOR)
// =============================================================================

describe('getSavedHighlightByIdAnyUser', () => {
  it('le a row de QUALQUER conta (sem escopo de userId) — guard e a unica barreira', async () => {
    const { attachPremiumLibraryStorage } = await loadAttach();
    const storage = makeStorage();
    attachPremiumLibraryStorage(storage);

    const whereSpy = vi.fn(() => ({ limit: vi.fn(async () => [{ id: 'hl_99', userId: 'USER-OTHER' }]) }));
    const fakeDb: any = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: whereSpy })) })),
    };

    const out = await storage.getSavedHighlightByIdAnyUser('hl_99', fakeDb);
    expect(out).toBeTruthy();
    expect(out.id).toBe('hl_99');
    // Retorna highlight de outro user — confirma ausencia de escopo de owner.
    expect(out.userId).toBe('USER-OTHER');
  });

  it('retorna null quando o sourceHighlightId nao existe', async () => {
    const { attachPremiumLibraryStorage } = await loadAttach();
    const storage = makeStorage();
    attachPremiumLibraryStorage(storage);

    const fakeDb: any = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })) })),
    };
    const out = await storage.getSavedHighlightByIdAnyUser('hl_missing', fakeDb);
    expect(out).toBeNull();
  });
});
