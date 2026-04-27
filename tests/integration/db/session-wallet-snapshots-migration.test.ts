/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-07: Persistencia em `session_wallet_snapshots` (nova tabela)
 *  - ADR-046: snapshots-table
 *
 * Modulos esperados pelo implementer:
 *   shared/schema.ts
 *     - export const sessionWalletSnapshots = pgTable("session_wallet_snapshots", { ... })
 *     - export const insertSessionWalletSnapshotSchema = z.object({ ... }).strict()
 *     - export type SessionWalletSnapshot
 *
 *   migration aplicada via `drizzle-kit push` (sem migration formal — convencao do projeto).
 *
 * Os testes validam **shape** do schema Drizzle + Zod insert schema. Sao
 * unit-style: importam o schema e exercitam regras estaticas + parsing.
 * Migration de runtime fica para teste e2e/storage (fora desta spec).
 */

import { describe, it, expect } from 'vitest';

describe('RF-07: schema sessionWalletSnapshots — colunas e tipos', () => {
  it('tabela sessionWalletSnapshots existe no schema exportado', async () => {
    const schema: any = await import('../../../shared/schema');
    expect(schema.sessionWalletSnapshots).toBeDefined();
  });

  it('possui colunas: id, userId, sessionId, walletId, nativeCurrency', async () => {
    const { sessionWalletSnapshots } = (await import('../../../shared/schema')) as any;
    const cols = sessionWalletSnapshots[Symbol.for('drizzle:Columns')] ?? sessionWalletSnapshots._?.columns ?? sessionWalletSnapshots;
    // Drizzle expoe colunas via Symbol em alguns paths; verifica via $inferInsert.
    // Estrategia robusta: tipo TS via insert schema Zod (verificado abaixo).
    expect(sessionWalletSnapshots).toHaveProperty('id');
    expect(sessionWalletSnapshots).toHaveProperty('userId');
    expect(sessionWalletSnapshots).toHaveProperty('sessionId');
    expect(sessionWalletSnapshots).toHaveProperty('walletId');
    expect(sessionWalletSnapshots).toHaveProperty('nativeCurrency');
  });

  it('possui colunas de balance: openingBalance, closingBalance, expectedDelta, manualAdjustment', async () => {
    const { sessionWalletSnapshots } = (await import('../../../shared/schema')) as any;
    expect(sessionWalletSnapshots).toHaveProperty('openingBalance');
    expect(sessionWalletSnapshots).toHaveProperty('closingBalance');
    expect(sessionWalletSnapshots).toHaveProperty('expectedDelta');
    expect(sessionWalletSnapshots).toHaveProperty('manualAdjustment');
  });

  it('possui colunas auxiliares: contributingTournamentIds, reason, walletTransactionId, createdAt', async () => {
    const { sessionWalletSnapshots } = (await import('../../../shared/schema')) as any;
    expect(sessionWalletSnapshots).toHaveProperty('contributingTournamentIds');
    expect(sessionWalletSnapshots).toHaveProperty('reason');
    expect(sessionWalletSnapshots).toHaveProperty('walletTransactionId');
    expect(sessionWalletSnapshots).toHaveProperty('createdAt');
  });
});

describe('RF-07: insertSessionWalletSnapshotSchema — Zod', () => {
  it('schema exportado existe', async () => {
    const { insertSessionWalletSnapshotSchema } = (await import('../../../shared/schema')) as any;
    expect(insertSessionWalletSnapshotSchema).toBeDefined();
    expect(typeof insertSessionWalletSnapshotSchema.parse).toBe('function');
  });

  it('aceita payload completo de reconciliacao normal', async () => {
    const { insertSessionWalletSnapshotSchema } = (await import('../../../shared/schema')) as any;
    const ok = insertSessionWalletSnapshotSchema.safeParse({
      userId: 'USER-0001',
      sessionId: 'ses_1',
      walletId: 'wA',
      nativeCurrency: 'USD',
      openingBalance: '1180.00',
      closingBalance: '1247.50',
      expectedDelta: '67.50',
      manualAdjustment: '0',
      contributingTournamentIds: ['st_1', 'st_2'],
      reason: 'session_result',
      walletTransactionId: 'tx_1',
    });
    expect(ok.success).toBe(true);
  });

  it('aceita closingBalance e manualAdjustment NULL (skip explicito)', async () => {
    const { insertSessionWalletSnapshotSchema } = (await import('../../../shared/schema')) as any;
    const ok = insertSessionWalletSnapshotSchema.safeParse({
      userId: 'USER-0001',
      sessionId: 'ses_1',
      walletId: 'wA',
      nativeCurrency: 'USD',
      openingBalance: '1180.00',
      closingBalance: null,
      expectedDelta: '67.50',
      manualAdjustment: null,
      contributingTournamentIds: ['st_1'],
      reason: 'session_result',
      walletTransactionId: null,
    });
    expect(ok.success).toBe(true);
  });

  it('aceita openingBalance/expectedDelta como number ou string (ADR-038 pattern)', async () => {
    const { insertSessionWalletSnapshotSchema } = (await import('../../../shared/schema')) as any;
    const a = insertSessionWalletSnapshotSchema.safeParse({
      userId: 'USER-0001',
      sessionId: 'ses_1',
      walletId: 'wA',
      nativeCurrency: 'USD',
      openingBalance: 1180,
      expectedDelta: 67.5,
    });
    expect(a.success).toBe(true);

    const b = insertSessionWalletSnapshotSchema.safeParse({
      userId: 'USER-0001',
      sessionId: 'ses_1',
      walletId: 'wA',
      nativeCurrency: 'USD',
      openingBalance: '1180.00',
      expectedDelta: '67.50',
    });
    expect(b.success).toBe(true);
  });

  it('reason default eh "session_result" quando ausente', async () => {
    const { insertSessionWalletSnapshotSchema } = (await import('../../../shared/schema')) as any;
    const ok = insertSessionWalletSnapshotSchema.safeParse({
      userId: 'USER-0001',
      sessionId: 'ses_1',
      walletId: 'wA',
      nativeCurrency: 'USD',
      openingBalance: '1180.00',
      expectedDelta: '67.50',
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.reason).toBe('session_result');
  });

  it('contributingTournamentIds default []', async () => {
    const { insertSessionWalletSnapshotSchema } = (await import('../../../shared/schema')) as any;
    const ok = insertSessionWalletSnapshotSchema.safeParse({
      userId: 'USER-0001',
      sessionId: 'ses_1',
      walletId: 'wA',
      nativeCurrency: 'USD',
      openingBalance: '0',
      expectedDelta: '0',
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.contributingTournamentIds).toEqual([]);
  });

  it('rejeita campos extras (.strict())', async () => {
    const { insertSessionWalletSnapshotSchema } = (await import('../../../shared/schema')) as any;
    const bad = insertSessionWalletSnapshotSchema.safeParse({
      userId: 'USER-0001',
      sessionId: 'ses_1',
      walletId: 'wA',
      nativeCurrency: 'USD',
      openingBalance: '0',
      expectedDelta: '0',
      campoInvalido: 'foo',
    });
    expect(bad.success).toBe(false);
  });

  it('rejeita userId vazio', async () => {
    const { insertSessionWalletSnapshotSchema } = (await import('../../../shared/schema')) as any;
    const bad = insertSessionWalletSnapshotSchema.safeParse({
      userId: '',
      sessionId: 'ses_1',
      walletId: 'wA',
      nativeCurrency: 'USD',
      openingBalance: '0',
      expectedDelta: '0',
    });
    expect(bad.success).toBe(false);
  });

  it('rejeita sessionId vazio', async () => {
    const { insertSessionWalletSnapshotSchema } = (await import('../../../shared/schema')) as any;
    const bad = insertSessionWalletSnapshotSchema.safeParse({
      userId: 'USER-0001',
      sessionId: '',
      walletId: 'wA',
      nativeCurrency: 'USD',
      openingBalance: '0',
      expectedDelta: '0',
    });
    expect(bad.success).toBe(false);
  });

  it('rejeita walletId vazio', async () => {
    const { insertSessionWalletSnapshotSchema } = (await import('../../../shared/schema')) as any;
    const bad = insertSessionWalletSnapshotSchema.safeParse({
      userId: 'USER-0001',
      sessionId: 'ses_1',
      walletId: '',
      nativeCurrency: 'USD',
      openingBalance: '0',
      expectedDelta: '0',
    });
    expect(bad.success).toBe(false);
  });

  it('rejeita nativeCurrency com mais de 8 chars', async () => {
    const { insertSessionWalletSnapshotSchema } = (await import('../../../shared/schema')) as any;
    const bad = insertSessionWalletSnapshotSchema.safeParse({
      userId: 'USER-0001',
      sessionId: 'ses_1',
      walletId: 'wA',
      nativeCurrency: 'TOOLONGCURRENCYCODE',
      openingBalance: '0',
      expectedDelta: '0',
    });
    expect(bad.success).toBe(false);
  });

  it('rejeita reason fora do enum (literal session_result)', async () => {
    const { insertSessionWalletSnapshotSchema } = (await import('../../../shared/schema')) as any;
    const bad = insertSessionWalletSnapshotSchema.safeParse({
      userId: 'USER-0001',
      sessionId: 'ses_1',
      walletId: 'wA',
      nativeCurrency: 'USD',
      openingBalance: '0',
      expectedDelta: '0',
      reason: 'rakeback', // nao permitido aqui
    });
    expect(bad.success).toBe(false);
  });
});

describe('RF-07: SessionWalletSnapshot type export', () => {
  it('type SessionWalletSnapshot exportado', async () => {
    const mod: any = await import('../../../shared/schema');
    // tipo eh erased em runtime; verifica via inferSelect helper exportado
    // ou pela existencia da tabela (compilacao garante o type).
    expect(mod.sessionWalletSnapshots).toBeDefined();
  });
});

// =============================================================================
// Storage methods (RF-07): listSessionWalletSnapshots, findSessionWalletSnapshot,
//                          createSessionWalletSnapshot.
// Validacao via interface — assinaturas existem no IStorage.
// =============================================================================

describe('RF-07: IStorage methods para snapshots', () => {
  it('storage exporta listSessionWalletSnapshots', async () => {
    const { storage } = (await import('../../../server/storage')) as any;
    expect(typeof storage.listSessionWalletSnapshots).toBe('function');
  });

  it('storage exporta findSessionWalletSnapshot (preflight idempotencia)', async () => {
    const { storage } = (await import('../../../server/storage')) as any;
    expect(typeof storage.findSessionWalletSnapshot).toBe('function');
  });

  it('storage exporta createSessionWalletSnapshot', async () => {
    const { storage } = (await import('../../../server/storage')) as any;
    expect(typeof storage.createSessionWalletSnapshot).toBe('function');
  });
});
