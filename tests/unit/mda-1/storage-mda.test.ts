import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint MDA-1 storage (RF-02)
//
// Spec: Docs/specs/sprint-mda-1-2026-06-01.md (RF-02, §"Regras de Negocio N:N tagging")
// ADR : Docs/architecture/decisions/230-mda-1-reference-cards-nn-tagging.md (D-1/D-3/D-4)
//
// Metodos de storage NOVOS (red phase) — expostos via (storage as any).x:
//   - createMdaRead(input)         insere read + tags; normaliza images (nanoid);
//                                  cap 8 prints; cap 20 temas; themeIds vazio rejeita;
//                                  fallback gentil sem db.transaction (lesson #32).
//   - getMdaReadById(id, userId)   read + themeIds (junction), deleted_at IS NULL.
//   - getMdaReadsByTheme(u, theme) reads do tema, keys CRUS (handler monta URLs).
//   - updateMdaRead(id, u, patch)  merge campos + diff de tags idempotente
//                                  (append novos / remove ausentes) lesson #33.
//   - addMdaReadImage / removeMdaReadImage   CRUD array jsonb; remove retorna oldKey.
//   - getMdaReadImageKey(id,u,imgId)         key crua p/ serve (ownership).
//   - softDeleteMdaRead(id, userId)          set deleted_at; retorna keys p/ cleanup.
//   - deleteStudyTheme (EXISTENTE, alterado) limpa tags orfas em mda_read_themes.
//
// Pattern lesson #36/#37: vi.doMock("drizzle-orm") augmenta `relations`; mock
// server/db com builder chainable + captura de execute(). resetModules por caso.
// =============================================================================

// Builder chainable: select resolve para `rows`; insert/update capturam values;
// execute (raw sql) registra cada chamada e resolve { rows } (para SELECT raw) ou
// undefined. Captura ambos estilos (query-builder + raw sql) — o implementer pode
// usar qualquer um para as ops de junction.
function makeChainableDb(rows: any[], execRows: any[] = []) {
  const captured: any = { insertValues: null, updateSet: null, executeCalls: [], transactionUsed: false };
  const selectChain: any = {
    from: () => selectChain,
    leftJoin: () => selectChain,
    innerJoin: () => selectChain,
    where: () => selectChain,
    groupBy: () => selectChain,
    orderBy: () => selectChain,
    limit: () => selectChain,
    offset: () => Promise.resolve(rows),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  const db: any = {
    select: () => selectChain,
    insert: () => ({
      values: (v: any) => {
        // Acumula (varios inserts: 1 read + N tags). Guarda o ultimo + lista.
        captured.insertValues = v;
        (captured.allInserts ??= []).push(v);
        return {
          returning: () => Promise.resolve([Array.isArray(v) ? { ...v[0] } : { ...v }]),
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve([]),
            then: (r: any) => Promise.resolve(undefined).then(r),
          }),
          then: (r: any) => Promise.resolve(undefined).then(r),
        };
      },
    }),
    update: () => ({
      set: (s: any) => {
        captured.updateSet = s;
        return {
          where: () => ({
            returning: () => Promise.resolve([{ ...rows[0], ...s }]),
            then: (r: any) => Promise.resolve(undefined).then(r),
          }),
        };
      },
    }),
    delete: () => ({
      where: () => ({
        returning: () => Promise.resolve([]),
        then: (r: any) => Promise.resolve(undefined).then(r),
      }),
    }),
    execute: (q: any) => {
      captured.executeCalls.push(q);
      return Promise.resolve({ rows: execRows });
    },
  };
  return { db, captured };
}

async function loadStorageWithDb(rows: any[], execRows: any[] = [], opts: { withTransaction?: boolean } = {}) {
  vi.resetModules();
  vi.doMock('drizzle-orm', async () => {
    const actual = await vi.importActual<any>('drizzle-orm');
    return { ...actual, relations: vi.fn() };
  });
  const { db, captured } = makeChainableDb(rows, execRows);
  if (opts.withTransaction) {
    db.transaction = vi.fn(async (runner: any) => {
      captured.transactionUsed = true;
      return runner(db);
    });
  }
  vi.doMock('../../../server/db', () => ({ db }));
  const mod = await import('../../../server/storage');
  return { storage: mod.storage as any, captured, db };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// createMdaRead — insere read + tags; normaliza images; caps; fallback gentil
// =============================================================================

describe('MDA-1 storage.createMdaRead', () => {
  it('eh uma funcao exportada em storage', async () => {
    const { storage } = await loadStorageWithDb([]);
    expect(typeof storage.createMdaRead).toBe('function');
  });

  it('persiste title + statId no insert do read', async () => {
    const { storage, captured } = await loadStorageWithDb([]);
    await storage.createMdaRead({
      userId: 'USER-0001',
      title: 'BTN vs BB',
      statId: 'vpip',
      themeIds: ['t1', 't2'],
    });
    const readInsert = (captured.allInserts ?? []).find(
      (v: any) => v && !Array.isArray(v) && typeof v.title === 'string',
    );
    expect(readInsert).toBeDefined();
    expect(readInsert.title).toBe('BTN vs BB');
    expect(readInsert.statId ?? readInsert.stat_id).toBe('vpip');
  });

  it('normaliza images sem id gerando id via nanoid', async () => {
    const { storage, captured } = await loadStorageWithDb([]);
    await storage.createMdaRead({
      userId: 'USER-0001',
      title: 'x',
      themeIds: ['t1'],
      images: [{ key: 'USER-0001/r1/a.png', caption: 'sem id' }],
    });
    const readInsert = (captured.allInserts ?? []).find(
      (v: any) => v && !Array.isArray(v) && Array.isArray(v.images),
    );
    expect(readInsert).toBeDefined();
    const img = readInsert.images[0];
    expect(typeof img.id).toBe('string');
    expect(img.id.length).toBeGreaterThan(0);
    expect(img.key).toBe('USER-0001/r1/a.png');
  });

  it('cria 1 read + 2 rows de tag na junction (themeIds:[t1,t2])', async () => {
    const { storage, captured } = await loadStorageWithDb([]);
    await storage.createMdaRead({
      userId: 'USER-0001',
      title: 'x',
      themeIds: ['t1', 't2'],
    });
    // Ou via insert([{...},{...}]) ou via execute() — basta evidenciar t1 + t2.
    const serialized = JSON.stringify(captured.allInserts ?? []) + JSON.stringify(captured.executeCalls ?? []);
    expect(serialized).toContain('t1');
    expect(serialized).toContain('t2');
  });

  it('rejeita themeIds vazio (min 1 — defense in depth no storage)', async () => {
    const { storage } = await loadStorageWithDb([]);
    await expect(
      storage.createMdaRead({ userId: 'USER-0001', title: 'x', themeIds: [] }),
    ).rejects.toBeTruthy();
  });

  it('re-checa cap 8 prints — 9 imagens lanca', async () => {
    const { storage } = await loadStorageWithDb([]);
    await expect(
      storage.createMdaRead({
        userId: 'USER-0001',
        title: 'x',
        themeIds: ['t1'],
        images: Array.from({ length: 9 }, (_v, i) => ({ key: `k${i}`, caption: 'c' })),
      }),
    ).rejects.toBeTruthy();
  });

  it('re-checa cap 20 temas — 21 themeIds lanca', async () => {
    const { storage } = await loadStorageWithDb([]);
    await expect(
      storage.createMdaRead({
        userId: 'USER-0001',
        title: 'x',
        themeIds: Array.from({ length: 21 }, (_v, i) => `t${i}`),
      }),
    ).rejects.toBeTruthy();
  });

  it('usa db.transaction quando disponivel', async () => {
    const { storage, captured, db } = await loadStorageWithDb([], [], { withTransaction: true });
    await storage.createMdaRead({ userId: 'USER-0001', title: 'x', themeIds: ['t1'] });
    expect(db.transaction).toHaveBeenCalled();
    expect(captured.transactionUsed).toBe(true);
  });

  it('fallback gentil quando db.transaction indisponivel (lesson #32) — nao quebra', async () => {
    // Sem withTransaction -> db.transaction eh undefined.
    const { storage } = await loadStorageWithDb([]);
    await expect(
      storage.createMdaRead({ userId: 'USER-0001', title: 'x', themeIds: ['t1'] }),
    ).resolves.toBeTruthy();
  });
});

// =============================================================================
// getMdaReadById — read + themeIds via junction; deleted_at IS NULL; ownership
// =============================================================================

describe('MDA-1 storage.getMdaReadById', () => {
  it('eh uma funcao exportada', async () => {
    const { storage } = await loadStorageWithDb([]);
    expect(typeof storage.getMdaReadById).toBe('function');
  });

  it('retorna o read com themeIds (junction)', async () => {
    const readRow = {
      id: 'read_1', userId: 'USER-0001', title: 'x', statId: 'vpip',
      images: [], deletedAt: null,
    };
    // execRows simula tags da junction quando o storage faz raw SELECT.
    const { storage } = await loadStorageWithDb([readRow], [
      { themeId: 't1' }, { themeId: 't2' },
    ]);
    const read = await storage.getMdaReadById('read_1', 'USER-0001');
    expect(read).toBeTruthy();
    expect(read.id).toBe('read_1');
    expect(Array.isArray(read.themeIds)).toBe(true);
  });

  it('retorna null quando nao existe ou eh de outro user (deleted/ownership)', async () => {
    const { storage } = await loadStorageWithDb([]);
    const read = await storage.getMdaReadById('NOPE', 'USER-0001');
    expect(read ?? null).toBeNull();
  });
});

// =============================================================================
// getMdaReadsByTheme — reads do tema, keys CRUS (handler monta URLs)
// =============================================================================

describe('MDA-1 storage.getMdaReadsByTheme', () => {
  it('eh uma funcao exportada', async () => {
    const { storage } = await loadStorageWithDb([]);
    expect(typeof storage.getMdaReadsByTheme).toBe('function');
  });

  it('retorna reads do tema com keys CRUS (sem URL montada)', async () => {
    const rows = [
      {
        id: 'read_1', userId: 'USER-0001', title: 'x', statId: 'vpip', deletedAt: null,
        images: [{ id: 'img_1', key: 'USER-0001/read_1/a.png', caption: 'c' }],
      },
    ];
    const { storage } = await loadStorageWithDb(rows);
    const reads = await storage.getMdaReadsByTheme('USER-0001', 't1');
    expect(Array.isArray(reads)).toBe(true);
    const r = reads[0];
    const img = (r.images ?? [])[0];
    // Key crua preservada; storage NAO monta playImageUrl/url.
    expect(img.key).toBe('USER-0001/read_1/a.png');
    expect(img.url ?? undefined).toBeUndefined();
  });
});

// =============================================================================
// updateMdaRead — merge campos + diff de tags idempotente (lesson #33)
// =============================================================================

describe('MDA-1 storage.updateMdaRead — diff de tags (D-3)', () => {
  const existing = {
    id: 'read_1', userId: 'USER-0001', title: 'old', statId: 'vpip',
    images: [], deletedAt: null,
  };

  it('eh uma funcao exportada', async () => {
    const { storage } = await loadStorageWithDb([existing], [{ themeId: 't1' }, { themeId: 't2' }]);
    expect(typeof storage.updateMdaRead).toBe('function');
  });

  it('merge de campos (title) persiste no update', async () => {
    const { storage, captured } = await loadStorageWithDb([existing], [{ themeId: 't1' }, { themeId: 't2' }]);
    await storage.updateMdaRead('read_1', 'USER-0001', { title: 'novo' });
    const serialized = JSON.stringify(captured.updateSet ?? {}) + JSON.stringify(captured.executeCalls ?? []);
    expect(serialized).toContain('novo');
  });

  it('themeIds:[t2] (era [t1,t2]) — remove tag t1, mantem t2 (diff)', async () => {
    // tags atuais (junction) = t1, t2. patch substitui por [t2].
    const { storage, captured } = await loadStorageWithDb([existing], [{ themeId: 't1' }, { themeId: 't2' }]);
    await storage.updateMdaRead('read_1', 'USER-0001', { themeIds: ['t2'] });
    // Evidencia de um DELETE/diff mencionando t1 (a tag removida).
    const serialized = JSON.stringify(captured.executeCalls ?? []) + JSON.stringify(captured.allInserts ?? []);
    expect(serialized).toContain('t1');
  });

  it('re-aplicar as mesmas tags eh idempotente (UNIQUE-aware, nao duplica)', async () => {
    // tags atuais = t1, t2. patch = [t1, t2] (sem mudanca) -> nao deve throw.
    const { storage } = await loadStorageWithDb([existing], [{ themeId: 't1' }, { themeId: 't2' }]);
    await expect(
      storage.updateMdaRead('read_1', 'USER-0001', { themeIds: ['t1', 't2'] }),
    ).resolves.toBeTruthy();
  });
});

// =============================================================================
// addMdaReadImage / removeMdaReadImage / getMdaReadImageKey — array jsonb CRUD
// =============================================================================

describe('MDA-1 storage.addMdaReadImage / removeMdaReadImage / getMdaReadImageKey', () => {
  const readWithImg = {
    id: 'read_1', userId: 'USER-0001', title: 'x',
    images: [{ id: 'img_1', key: 'USER-0001/read_1/old.png', caption: 'c' }],
    deletedAt: null,
  };

  it('addMdaReadImage adiciona a imagem ao array jsonb', async () => {
    const { storage, captured } = await loadStorageWithDb([readWithImg]);
    await storage.addMdaReadImage('read_1', 'USER-0001', {
      id: 'img_2', key: 'USER-0001/read_1/new.png', caption: 'novo',
    });
    const serialized = JSON.stringify(captured.updateSet ?? {}) + JSON.stringify(captured.executeCalls ?? []);
    expect(serialized).toContain('USER-0001/read_1/new.png');
  });

  it('removeMdaReadImage retorna oldKey para cleanup', async () => {
    const { storage } = await loadStorageWithDb([readWithImg]);
    const result = await storage.removeMdaReadImage('read_1', 'USER-0001', 'img_1');
    expect(result?.oldKey).toBe('USER-0001/read_1/old.png');
  });

  it('getMdaReadImageKey retorna a key crua da imagem (ownership)', async () => {
    const { storage } = await loadStorageWithDb([readWithImg]);
    const key = await storage.getMdaReadImageKey('read_1', 'USER-0001', 'img_1');
    expect(key).toBe('USER-0001/read_1/old.png');
  });

  it('getMdaReadImageKey retorna null para imageId inexistente', async () => {
    const { storage } = await loadStorageWithDb([readWithImg]);
    const key = await storage.getMdaReadImageKey('read_1', 'USER-0001', 'NOPE');
    expect(key ?? null).toBeNull();
  });
});

// =============================================================================
// softDeleteMdaRead — set deleted_at; retorna keys p/ cleanup
// =============================================================================

describe('MDA-1 storage.softDeleteMdaRead', () => {
  const read = {
    id: 'read_1', userId: 'USER-0001', title: 'x', deletedAt: null,
    images: [
      { id: 'img_1', key: 'USER-0001/read_1/a.png', caption: 'c' },
      { id: 'img_2', key: 'USER-0001/read_1/b.png', caption: 'c' },
    ],
  };

  it('eh uma funcao exportada', async () => {
    const { storage } = await loadStorageWithDb([read]);
    expect(typeof storage.softDeleteMdaRead).toBe('function');
  });

  it('seta deleted_at no update (soft delete, row persiste)', async () => {
    const { storage, captured } = await loadStorageWithDb([read]);
    await storage.softDeleteMdaRead('read_1', 'USER-0001');
    const set = captured.updateSet ?? {};
    const hasDeletedAt = 'deletedAt' in set || 'deleted_at' in set;
    const serialized = JSON.stringify(captured.executeCalls ?? []).toLowerCase();
    expect(hasDeletedAt || serialized.includes('deleted_at')).toBe(true);
  });

  it('retorna as keys das imagens para cleanup best-effort', async () => {
    const { storage } = await loadStorageWithDb([read]);
    const result = await storage.softDeleteMdaRead('read_1', 'USER-0001');
    const keys = result?.keys ?? result?.imageKeys ?? [];
    expect(keys).toEqual(
      expect.arrayContaining(['USER-0001/read_1/a.png', 'USER-0001/read_1/b.png']),
    );
  });
});

// =============================================================================
// deleteStudyTheme (EXISTENTE, alterado) — cleanup de tags orfas (D-4)
// =============================================================================

describe('MDA-1 storage.deleteStudyTheme — cleanup de tags orfas (D-4)', () => {
  it('apaga rows de mda_read_themes com theme_id=? no delete do tema', async () => {
    const { storage, captured } = await loadStorageWithDb([]);
    await storage.deleteStudyTheme('t1', 'USER-0001');
    // Algum execute/delete deve mencionar mda_read_themes (cleanup app-level).
    const serialized = JSON.stringify(captured.executeCalls ?? []).toLowerCase();
    expect(serialized).toContain('mda_read_themes');
  });
});
