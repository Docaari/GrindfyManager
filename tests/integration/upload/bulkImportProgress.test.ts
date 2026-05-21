/**
 * Sprint Backend Tech-Debt Sweep — RF-02 Bulk-import progress
 *
 * Spec: Docs/specs/sprint-backend-sweep.md (RF-02 — R2-01..R2-03)
 * ADR-181 §2.2: kill-switch via threshold 5000 + coluna nova `processed_count`
 *
 * Comportamento esperado:
 *
 *   POST /api/upload-history
 *   ─────────────────────────
 *   - count <= 5000 → SYNC path (inalterado): retorna 200 com {imported, duplicates, ...}
 *   - count >  5000 → ASYNC path (novo): retorna 202 com
 *       { uploadHistoryId, estimatedTournaments, status: 'processing' }
 *
 *   GET /api/upload-history/:id
 *   ─────────────────────────────
 *   - Durante processing: { id, status: 'processing', processed_count: N,
 *                           tournaments_count: estimated, ... }
 *   - Após sucesso:        { id, status: 'success', processed_count: total,
 *                           tournaments_count: total, ... }
 *   - Após falha:          { id, status: 'failed', processed_count: N (partial),
 *                           errorMessage, ... }
 *
 *   Background job
 *   ──────────────
 *   - Batches de 500 → 1 chamada de createTournamentsBatch por iteração.
 *   - Falha em batch X NÃO para batches Y+1..N (continua, marca status='success' no fim).
 *
 *   Handlers (lesson #34):
 *   - export async function handlePostUploadHistory(req, res, injectedStorage?)
 *   - export async function handleGetUploadHistoryById(req, res, injectedStorage?)
 *   Implementer escolhe o local final (server/routes/upload.ts ou novo arquivo).
 *
 *   Lessons aplicadas: #3 (mock shape real), #9 (log antes de fallback),
 *   #34 (injectedStorage 3o arg), #36 (não importa @shared/schema no topo se
 *   parse parcial — aqui injetamos storage por composição, não usamos drizzle).
 *
 * RED phase: handlers NÃO existem ainda (sync path coexiste no handler atual
 * mas sem branch async). Todos os testes devem FALHAR até implementer shipar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers — req/res fakes
// ---------------------------------------------------------------------------

function makeReq(overrides: any = {}) {
  return {
    user: {
      id: 'u-1',
      userPlatformId: 'USER-0001',
      email: 'p@t.com',
      role: 'user',
      subscriptionPlan: 'pro',
    },
    params: {},
    body: {},
    query: {},
    file: undefined,
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, headersSent: false };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((d: any) => { res.body = d; return res; });
  return res;
}

/**
 * Cria um CSV PokerStars com N rows. Cada row tem Game ID único.
 */
function makeLargeCSV(rowCount: number): string {
  const headers = [
    'Network',
    ' Player',
    ' Game ID',
    ' Stake',
    ' Date',
    ' Entrants',
    ' Rake',
    ' Game',
    ' Structure',
    ' Speed',
    ' Result',
    ' Position',
    ' Flags',
    ' Currency',
    ' ReEntries/Rebuys',
    ' Duration',
    ' Players Per Table',
    ' Prize',
    ' Name',
    ' Total ReEntries',
  ].join(',');

  const rows: string[] = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push([
      'PokerStars',
      'tester',
      String(100000 + i),
      '50',
      '2025-01-15 18:00',
      '500',
      '5',
      'H',
      'No Limit',
      'Normal',
      '0',
      '100',
      '',
      'USD',
      '0',
      '0',
      '8',
      '',
      `$50 Test ${i}`,
      '0',
    ].join(','));
  }

  return [headers, ...rows].join('\n');
}

/**
 * Storage mock factory — shape REAL alinhada com server/storage.ts (lesson #3).
 */
function makeStorage(opts: {
  existingTournamentIds?: Set<string>;
  existingByFields?: Set<string>;
  createBatchImpl?: (rows: any[]) => Promise<any[]>;
  uploadHistoryRow?: any;
  updateUploadHistoryImpl?: (id: string, patch: any) => Promise<any>;
  userSettings?: any;
} = {}) {
  const created: any[] = [];
  const updates: Array<{ id: string; patch: any }> = [];

  return {
    // Para parseCSV upstream
    getUserSettings: vi.fn(async () => opts.userSettings ?? null),

    // Dup-check (já shipped — mantido)
    findExistingTournamentIds: vi.fn(async () => opts.existingTournamentIds ?? new Set<string>()),
    findExistingTournamentsByFields: vi.fn(async () => opts.existingByFields ?? new Set<string>()),

    // Batch insert — recebe array de InsertTournament
    createTournamentsBatch: vi.fn(async (rows: any[]) => {
      if (opts.createBatchImpl) return opts.createBatchImpl(rows);
      // Mock default: retorna rows como se tivessem sido criados
      created.push(...rows);
      return rows.map((r: any, idx: number) => ({ ...r, id: `t-${created.length - rows.length + idx}` }));
    }),

    // Upload history CRUD
    createUploadHistory: vi.fn(async (record: any) => {
      const row = {
        id: opts.uploadHistoryRow?.id ?? 'uh-test-1',
        userId: record.userId,
        filename: record.filename,
        status: record.status ?? 'processing',
        tournamentsCount: record.tournamentsCount ?? 0,
        processedCount: record.processedCount ?? 0,
        errorMessage: record.errorMessage ?? null,
        uploadDate: new Date(),
        duplicatesFound: record.duplicatesFound ?? 0,
        duplicateAction: record.duplicateAction ?? null,
        createdAt: new Date(),
        ...opts.uploadHistoryRow,
      };
      return row;
    }),

    updateUploadHistory: vi.fn(async (id: string, patch: any) => {
      if (opts.updateUploadHistoryImpl) return opts.updateUploadHistoryImpl(id, patch);
      updates.push({ id, patch });
      return { id, ...patch };
    }),

    getUploadHistoryById: vi.fn(async (id: string, userId?: string) => {
      return opts.uploadHistoryRow ?? {
        id,
        userId: userId ?? 'USER-0001',
        filename: 'test.csv',
        status: 'processing',
        tournamentsCount: 0,
        processedCount: 0,
        errorMessage: null,
        uploadDate: new Date(),
        duplicatesFound: 0,
        duplicateAction: null,
        createdAt: new Date(),
      };
    }),

    // Helpers de teste (não fazem parte da interface real — usados nos asserts)
    _created: created,
    _updates: updates,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// 1. SYNC PATH — count <= 5000
// ===========================================================================

describe('RF-02 — POST /api/upload-history SYNC path (count <= 5000)', () => {
  it('CSV pequeno (10 rows): retorna 200 com resultado sincrono', async () => {
    const csv = makeLargeCSV(10);
    const file = {
      buffer: Buffer.from(csv, 'utf-8'),
      originalname: 'small.csv',
      mimetype: 'text/csv',
      size: Buffer.byteLength(csv),
    };
    const storage = makeStorage();
    const req = makeReq({ file });
    const res = makeRes();

    const { handlePostUploadHistory } = await import('../../../server/routes/upload');
    await handlePostUploadHistory(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBeTruthy();
    // sync path retorna campos como `imported`/`tournamentsImported` (compat
    // com handler atual). Implementer mantém os campos legados.
    const importedCount = res.body.imported ?? res.body.tournamentsImported ?? res.body.savedCount;
    expect(typeof importedCount).toBe('number');
    expect(importedCount).toBeGreaterThan(0);
  });

  it('CSV 5000 rows (limite exato): ainda SYNC (não retorna 202)', async () => {
    const csv = makeLargeCSV(5000);
    const file = {
      buffer: Buffer.from(csv, 'utf-8'),
      originalname: 'medium.csv',
      mimetype: 'text/csv',
      size: Buffer.byteLength(csv),
    };
    const storage = makeStorage();
    const req = makeReq({ file });
    const res = makeRes();

    const { handlePostUploadHistory } = await import('../../../server/routes/upload');
    await handlePostUploadHistory(req, res, storage);

    expect(res.statusCode).not.toBe(202);
    expect(res.statusCode).toBe(200);
  });
});

// ===========================================================================
// 2. ASYNC PATH — count > 5000
// ===========================================================================

describe('RF-02 — POST /api/upload-history ASYNC path (count > 5000)', () => {
  it('CSV grande (6000 rows): retorna 202 com uploadHistoryId + estimatedTournaments + status=processing', async () => {
    const csv = makeLargeCSV(6000);
    const file = {
      buffer: Buffer.from(csv, 'utf-8'),
      originalname: 'large.csv',
      mimetype: 'text/csv',
      size: Buffer.byteLength(csv),
    };
    const storage = makeStorage({ uploadHistoryRow: { id: 'uh-async-1' } });
    const req = makeReq({ file });
    const res = makeRes();

    const { handlePostUploadHistory } = await import('../../../server/routes/upload');
    await handlePostUploadHistory(req, res, storage);

    expect(res.statusCode).toBe(202);
    expect(res.body).toBeTruthy();
    expect(res.body.uploadHistoryId).toBe('uh-async-1');
    expect(res.body.estimatedTournaments).toBeGreaterThanOrEqual(6000);
    expect(res.body.status).toBe('processing');
  });

  it('CSV grande: chama storage.createUploadHistory com status="processing" e processedCount=0', async () => {
    const csv = makeLargeCSV(6000);
    const file = {
      buffer: Buffer.from(csv, 'utf-8'),
      originalname: 'large.csv',
      mimetype: 'text/csv',
      size: Buffer.byteLength(csv),
    };
    const storage = makeStorage();
    const req = makeReq({ file });
    const res = makeRes();

    const { handlePostUploadHistory } = await import('../../../server/routes/upload');
    await handlePostUploadHistory(req, res, storage);

    expect(storage.createUploadHistory).toHaveBeenCalled();
    const arg = storage.createUploadHistory.mock.calls[0][0];
    expect(arg.status).toBe('processing');
    expect(arg.processedCount).toBe(0);
    expect(arg.userId).toBe('USER-0001');
  });

  it('Response 202 em < 2s (não espera background loop)', async () => {
    const csv = makeLargeCSV(7000);
    const file = {
      buffer: Buffer.from(csv, 'utf-8'),
      originalname: 'large.csv',
      mimetype: 'text/csv',
      size: Buffer.byteLength(csv),
    };
    const storage = makeStorage({
      // Simula createTournamentsBatch lento — 100ms por batch
      createBatchImpl: async (rows: any[]) => {
        await new Promise(r => setTimeout(r, 100));
        return rows.map((r: any, i: number) => ({ ...r, id: `t-${i}` }));
      },
    });
    const req = makeReq({ file });
    const res = makeRes();

    const t0 = Date.now();
    const { handlePostUploadHistory } = await import('../../../server/routes/upload');
    await handlePostUploadHistory(req, res, storage);
    const elapsed = Date.now() - t0;

    expect(res.statusCode).toBe(202);
    expect(elapsed).toBeLessThan(2000);
  });
});

// ===========================================================================
// 3. Background batch loop (500 chunks)
// ===========================================================================

describe('RF-02 — Background loop: batches de 500', () => {
  it('6000 rows → createTournamentsBatch chamado em chunks de até 500', async () => {
    const csv = makeLargeCSV(6000);
    const file = {
      buffer: Buffer.from(csv, 'utf-8'),
      originalname: 'large.csv',
      mimetype: 'text/csv',
      size: Buffer.byteLength(csv),
    };
    const storage = makeStorage();
    const req = makeReq({ file });
    const res = makeRes();

    const { handlePostUploadHistory } = await import('../../../server/routes/upload');
    await handlePostUploadHistory(req, res, storage);

    // Espera o background terminar (best-effort — aguarda microtasks + timers)
    await new Promise((r) => setTimeout(r, 50));

    // Cada chamada de createTournamentsBatch deve ter no máximo 500 rows.
    for (const call of storage.createTournamentsBatch.mock.calls) {
      const rows = call[0];
      expect(rows.length).toBeLessThanOrEqual(500);
    }
    // 6000 rows / 500 = 12 batches no mínimo
    expect(storage.createTournamentsBatch.mock.calls.length).toBeGreaterThanOrEqual(12);
  });

  it('após cada batch, updateUploadHistory atualiza processedCount incrementalmente', async () => {
    const csv = makeLargeCSV(6000);
    const file = {
      buffer: Buffer.from(csv, 'utf-8'),
      originalname: 'large.csv',
      mimetype: 'text/csv',
      size: Buffer.byteLength(csv),
    };
    const storage = makeStorage();
    const req = makeReq({ file });
    const res = makeRes();

    const { handlePostUploadHistory } = await import('../../../server/routes/upload');
    await handlePostUploadHistory(req, res, storage);

    // Aguarda background completar
    await new Promise((r) => setTimeout(r, 100));

    // Alguma chamada com processedCount setado
    const patches = storage.updateUploadHistory.mock.calls.map((c: any[]) => c[1]);
    const processedCountUpdates = patches.filter((p: any) => typeof p.processedCount === 'number');
    expect(processedCountUpdates.length).toBeGreaterThan(0);

    // Última deve refletir 6000 ou mais
    const last = processedCountUpdates[processedCountUpdates.length - 1];
    expect(last.processedCount).toBeGreaterThanOrEqual(6000);
  });

  it('ao final, updateUploadHistory marca status="success"', async () => {
    const csv = makeLargeCSV(6000);
    const file = {
      buffer: Buffer.from(csv, 'utf-8'),
      originalname: 'large.csv',
      mimetype: 'text/csv',
      size: Buffer.byteLength(csv),
    };
    const storage = makeStorage();
    const req = makeReq({ file });
    const res = makeRes();

    const { handlePostUploadHistory } = await import('../../../server/routes/upload');
    await handlePostUploadHistory(req, res, storage);

    await new Promise((r) => setTimeout(r, 100));

    const successUpdate = storage.updateUploadHistory.mock.calls.find(
      (c: any[]) => c[1]?.status === 'success'
    );
    expect(successUpdate).toBeDefined();
  });
});

// ===========================================================================
// 4. Falha parcial — batch X falha, batches Y+1..N continuam
// ===========================================================================

describe('RF-02 — Failure parcial: batch X falha não para os próximos', () => {
  it('batch 3 falha, batches 4..12 continuam, status final = success com processedCount < total', async () => {
    const csv = makeLargeCSV(6000);
    const file = {
      buffer: Buffer.from(csv, 'utf-8'),
      originalname: 'large.csv',
      mimetype: 'text/csv',
      size: Buffer.byteLength(csv),
    };

    let batchIdx = 0;
    const storage = makeStorage({
      createBatchImpl: async (rows: any[]) => {
        batchIdx++;
        if (batchIdx === 3) {
          throw new Error('simulated DB failure on batch 3');
        }
        return rows.map((r: any, i: number) => ({ ...r, id: `t-${i}` }));
      },
    });

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = makeReq({ file });
    const res = makeRes();
    const { handlePostUploadHistory } = await import('../../../server/routes/upload');
    await handlePostUploadHistory(req, res, storage);

    await new Promise((r) => setTimeout(r, 100));

    // Background deve ter logado o erro (lesson #9 — log antes do fallback)
    const loggedSomething = errSpy.mock.calls.some(call =>
      call.some((arg: any) => /batch_failed|batch.*fail/i.test(String(arg)))
    );
    expect(loggedSomething).toBe(true);

    // Total de chamadas a createBatch >= 12 (não parou após o fail)
    expect(storage.createTournamentsBatch.mock.calls.length).toBeGreaterThanOrEqual(12);

    // Status final: success (preserva trabalho parcial conforme ADR-181)
    const successUpdate = storage.updateUploadHistory.mock.calls.find(
      (c: any[]) => c[1]?.status === 'success'
    );
    expect(successUpdate).toBeDefined();

    errSpy.mockRestore();
  });
});

// ===========================================================================
// 5. GET /api/upload-history/:id — polling endpoint
// ===========================================================================

describe('RF-02 — GET /api/upload-history/:id', () => {
  it('durante processing: retorna {status:"processing", processedCount, tournamentsCount}', async () => {
    const storage = makeStorage({
      uploadHistoryRow: {
        id: 'uh-poll-1',
        userId: 'USER-0001',
        filename: 'large.csv',
        status: 'processing',
        tournamentsCount: 6000,
        processedCount: 1500,
        errorMessage: null,
        uploadDate: new Date(),
        duplicatesFound: 0,
        duplicateAction: null,
        createdAt: new Date(),
      },
    });

    const req = makeReq({ params: { id: 'uh-poll-1' } });
    const res = makeRes();
    const { handleGetUploadHistoryById } = await import('../../../server/routes/upload');
    await handleGetUploadHistoryById(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('processing');
    // Aceita snake_case ou camelCase — implementer escolhe.
    const pc = res.body.processedCount ?? res.body.processed_count;
    const tc = res.body.tournamentsCount ?? res.body.tournaments_count;
    expect(pc).toBe(1500);
    expect(tc).toBe(6000);
  });

  it('após sucesso: retorna {status:"success", processedCount === tournamentsCount}', async () => {
    const storage = makeStorage({
      uploadHistoryRow: {
        id: 'uh-poll-2',
        userId: 'USER-0001',
        filename: 'large.csv',
        status: 'success',
        tournamentsCount: 6000,
        processedCount: 6000,
        errorMessage: null,
        uploadDate: new Date(),
        duplicatesFound: 0,
        duplicateAction: null,
        createdAt: new Date(),
      },
    });

    const req = makeReq({ params: { id: 'uh-poll-2' } });
    const res = makeRes();
    const { handleGetUploadHistoryById } = await import('../../../server/routes/upload');
    await handleGetUploadHistoryById(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    const pc = res.body.processedCount ?? res.body.processed_count;
    const tc = res.body.tournamentsCount ?? res.body.tournaments_count;
    expect(pc).toBe(6000);
    expect(tc).toBe(6000);
  });

  it('após falha: retorna {status:"failed", processedCount (partial), errorMessage}', async () => {
    const storage = makeStorage({
      uploadHistoryRow: {
        id: 'uh-poll-3',
        userId: 'USER-0001',
        filename: 'large.csv',
        status: 'failed',
        tournamentsCount: 6000,
        processedCount: 1500,
        errorMessage: 'background job died',
        uploadDate: new Date(),
        duplicatesFound: 0,
        duplicateAction: null,
        createdAt: new Date(),
      },
    });

    const req = makeReq({ params: { id: 'uh-poll-3' } });
    const res = makeRes();
    const { handleGetUploadHistoryById } = await import('../../../server/routes/upload');
    await handleGetUploadHistoryById(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('failed');
    const pc = res.body.processedCount ?? res.body.processed_count;
    expect(pc).toBe(1500);
    expect(res.body.errorMessage).toBeTruthy();
  });

  it('id inexistente → 404', async () => {
    const storage = makeStorage();
    storage.getUploadHistoryById = vi.fn(async () => null);

    const req = makeReq({ params: { id: 'uh-missing' } });
    const res = makeRes();
    const { handleGetUploadHistoryById } = await import('../../../server/routes/upload');
    await handleGetUploadHistoryById(req, res, storage);

    expect(res.statusCode).toBe(404);
  });

  it('id pertence a outro user → 404 (não vaza existência)', async () => {
    const storage = makeStorage({
      uploadHistoryRow: {
        id: 'uh-other',
        userId: 'USER-OTHER',
        filename: 'other.csv',
        status: 'success',
        tournamentsCount: 100,
        processedCount: 100,
        errorMessage: null,
        uploadDate: new Date(),
        duplicatesFound: 0,
        duplicateAction: null,
        createdAt: new Date(),
      },
    });

    const req = makeReq({ params: { id: 'uh-other' } });
    const res = makeRes();
    const { handleGetUploadHistoryById } = await import('../../../server/routes/upload');
    await handleGetUploadHistoryById(req, res, storage);

    expect([403, 404]).toContain(res.statusCode);
  });
});
