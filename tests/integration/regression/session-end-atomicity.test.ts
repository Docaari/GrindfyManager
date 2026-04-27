/**
 * Regressao — atomicidade da reconciliacao fim de sessao.
 *
 * Sprint: session-end-reconciliation-v2 (reviewer pre-merge)
 *  - CRITICAL-01: wallet_transaction + session_wallet_snapshot devem commitar
 *    juntos ou nada. Antes do fix, walletService abria tx interna que commitava
 *    antes do snapshot ser inserido -> snapshot orfao + idempotencia quebrada.
 *  - HIGH-01: skipReconciliation=true tambem precisa rodar em UMA tx (todos os
 *    snapshots commitam atomicamente).
 *  - HIGH-02: race UNIQUE concorrente — 2 callers paralelos passam preflight,
 *    ambos abrem tx, segundo viola UNIQUE em snapshot. Esperado: tx do segundo
 *    revertida (incluindo wallet_transaction), retorno mapeado para
 *    `alreadyReconciled`.
 *
 * Pattern: mock storage.transaction para simular DB real (commits/rollbacks
 * por throw). Spy em walletService.recordWalletTransaction recebendo `tx` no
 * 4o argumento — confirma que service participa da tx do caller (vs abrir uma
 * propria).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    recordWalletTransaction: vi.fn(),
    listWallets: vi.fn(),
  },
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    findReconciliationMarker: vi.fn(),
    findSessionWalletSnapshot: vi.fn(),
    listWalletsByUser: vi.fn(),
    createSessionWalletSnapshot: vi.fn(),
    transaction: vi.fn(),
  },
}));

import { runReconciliation } from '../../../server/services/sessionReconciliation';
import { walletService } from '../../../server/services/walletService';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Helper: cria um tx wrapper fake que registra calls e propaga sucesso/falha
 * de funcoes mockadas. Comportamento de DB real: throw -> rollback (callsite
 * recebe erro, tx nao "commita"). Estado eh mantido em closures.
 */
function makeFakeTransaction(opts: {
  snapshotInsertImpl?: (input: any) => Promise<any>;
  innerSnapshotPreflight?: any;
} = {}) {
  const calls: { name: string; args: any[] }[] = [];
  const tx: any = {
    findSessionWalletSnapshot: vi.fn(async () => {
      calls.push({ name: 'findSessionWalletSnapshot', args: [] });
      return opts.innerSnapshotPreflight ?? null;
    }),
    createSessionWalletSnapshot: vi.fn(async (input: any) => {
      calls.push({ name: 'createSessionWalletSnapshot', args: [input] });
      if (opts.snapshotInsertImpl) {
        return await opts.snapshotInsertImpl(input);
      }
      return { id: 'snap_' + (calls.filter(c => c.name === 'createSessionWalletSnapshot').length) };
    }),
  };
  return { tx, calls };
}

// =============================================================================
// CRITICAL-01: wallet_transaction + snapshot atomicos
// =============================================================================

describe('CRITICAL-01 — wallet_transaction + session_wallet_snapshot atomicos', () => {
  it('passa o mesmo `tx` para walletService.recordWalletTransaction e createSessionWalletSnapshot', async () => {
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (storage.listWalletsByUser as any).mockResolvedValue([
      { id: 'wA', nativeCurrency: 'USD' },
    ]);

    const { tx } = makeFakeTransaction();
    (storage.transaction as any).mockImplementation(async (fn: any) => fn(tx));

    (walletService.recordWalletTransaction as any).mockImplementation(
      async (_userId: any, _walletId: any, _input: any, providedTx: any) => {
        // CRITICAL: deve receber o MESMO tx que o caller passou para
        // createSessionWalletSnapshot, garantindo atomicidade.
        expect(providedTx).toBe(tx);
        return {
          transaction: { id: 'tx_1' },
          wallet: { id: 'wA' },
        };
      },
    );

    const r = await runReconciliation('USER-0001', 'ses_1', [
      { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180, expectedDelta: 67 },
    ]);

    expect(r.created).toHaveLength(1);
    expect(r.snapshotsCreated).toBe(1);
    expect(walletService.recordWalletTransaction).toHaveBeenCalledTimes(1);
    // 4o arg precisa ser o tx wrapper.
    const callArgs = (walletService.recordWalletTransaction as any).mock.calls[0];
    expect(callArgs[3]).toBe(tx);
    // Snapshot foi criado no MESMO tx, nao no storage global.
    expect(tx.createSessionWalletSnapshot).toHaveBeenCalledTimes(1);
    // storage.createSessionWalletSnapshot NAO eh chamado fora do tx.
    expect((storage.createSessionWalletSnapshot as any).mock.calls.length).toBe(0);
  });

  it('falha em createSessionWalletSnapshot apos tx ok -> tx wrapper aborta (rollback completo)', async () => {
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (storage.listWalletsByUser as any).mockResolvedValue([
      { id: 'wA', nativeCurrency: 'USD' },
    ]);

    // Snapshot insert falha com erro generico -> tx wrapper deve abortar
    // e propagar erro. wallet_transaction da iteracao anterior (que
    // foi escrita dentro do mesmo tx) tambem deve ser revertida.
    const { tx } = makeFakeTransaction({
      snapshotInsertImpl: async () => {
        throw new Error('disk full');
      },
    });
    let txAborted = false;
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      try {
        return await fn(tx);
      } catch (err) {
        // simula DB real: throw dentro do callback => ROLLBACK.
        txAborted = true;
        throw err;
      }
    });

    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'tx_uncommitted' },
      wallet: { id: 'wA' },
    });

    // Caller deve receber erro (router mapea para 500). NAO retorna 200 com
    // snapshot orfao.
    await expect(
      runReconciliation('USER-0001', 'ses_1', [
        { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180, expectedDelta: 67 },
      ]),
    ).rejects.toThrow();

    expect(txAborted).toBe(true);
    // walletService foi chamado (com tx), mas tx foi rollback'ada — efetivo
    // do ponto de vista do DB: zero rows persistidas.
    expect(walletService.recordWalletTransaction).toHaveBeenCalledTimes(1);
  });

  it('skipReconciliation=true: roda TODOS os snapshots em UMA tx (HIGH-01)', async () => {
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (storage.listWalletsByUser as any).mockResolvedValue([
      { id: 'wA', nativeCurrency: 'USD' },
      { id: 'wB', nativeCurrency: 'BRL' },
    ]);

    const { tx, calls } = makeFakeTransaction();
    (storage.transaction as any).mockImplementation(async (fn: any) => fn(tx));

    const r = await runReconciliation(
      'USER-0001',
      'ses_skip',
      [
        { walletId: 'wA', reportedBalance: 0, expectedPreviousBalance: 1180, expectedDelta: 67 },
        { walletId: 'wB', reportedBalance: 0, expectedPreviousBalance: 200, expectedDelta: -10 },
      ],
      { skipReconciliation: true },
    );

    expect(r.skippedByUser).toBe(true);
    expect(r.snapshotsCreated).toBe(2);
    // Snapshots criados via tx wrapper, nao via storage global.
    const snapshotCalls = calls.filter(c => c.name === 'createSessionWalletSnapshot');
    expect(snapshotCalls).toHaveLength(2);
    expect((storage.createSessionWalletSnapshot as any).mock.calls.length).toBe(0);
    // walletService nao foi tocado.
    expect(walletService.recordWalletTransaction).not.toHaveBeenCalled();
  });

  it('skipReconciliation=true: 1o snapshot ok, 2o falha -> tx aborta (sem snapshot orfao)', async () => {
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (storage.listWalletsByUser as any).mockResolvedValue([
      { id: 'wA', nativeCurrency: 'USD' },
      { id: 'wB', nativeCurrency: 'BRL' },
    ]);

    let snapshotAttempts = 0;
    const { tx } = makeFakeTransaction({
      snapshotInsertImpl: async () => {
        snapshotAttempts++;
        if (snapshotAttempts === 2) {
          throw new Error('disk full');
        }
        return { id: 'snap_' + snapshotAttempts };
      },
    });
    let txAborted = false;
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      try {
        return await fn(tx);
      } catch (err) {
        txAborted = true;
        throw err;
      }
    });

    await expect(
      runReconciliation(
        'USER-0001',
        'ses_skip',
        [
          { walletId: 'wA', reportedBalance: 0, expectedPreviousBalance: 1180, expectedDelta: 67 },
          { walletId: 'wB', reportedBalance: 0, expectedPreviousBalance: 200, expectedDelta: -10 },
        ],
        { skipReconciliation: true },
      ),
    ).rejects.toThrow();

    expect(txAborted).toBe(true);
    // Tentou criar 2 snapshots; segundo falhou; tx revertida -> efetivo: 0.
    expect(snapshotAttempts).toBe(2);
  });
});

// =============================================================================
// HIGH-02: UNIQUE race em concorrencia
// =============================================================================

describe('HIGH-02 — UNIQUE race concorrente (already_reconciled)', () => {
  it('UNIQUE violation (23505) em snapshot dentro da tx -> alreadyReconciled', async () => {
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (storage.listWalletsByUser as any).mockResolvedValue([
      { id: 'wA', nativeCurrency: 'USD' },
    ]);

    // Simula race: preflight passou, mas dentro da tx o INSERT falha com 23505
    // porque outra request paralela ja inseriu o snapshot.
    const uniqueErr: any = new Error('duplicate key value violates unique constraint "session_wallet_snapshots_session_wallet_unique"');
    uniqueErr.code = '23505';

    const { tx } = makeFakeTransaction({
      snapshotInsertImpl: async () => { throw uniqueErr; },
    });
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      // DB real: throw dentro -> rollback + propaga.
      return await fn(tx);
    });

    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'tx_uncommitted' },
      wallet: { id: 'wA' },
    });

    const r = await runReconciliation('USER-0001', 'ses_race', [
      { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180, expectedDelta: 67 },
    ]);

    // Mapeamento esperado: 23505 -> alreadyReconciled (router converte para 409).
    expect(r.alreadyReconciled).toBe(true);
    expect(r.created).toEqual([]);
    expect(r.snapshotsCreated).toBeFalsy();
  });

  it('2 promises paralelas mesma sessao: uma sucesso, outra alreadyReconciled', async () => {
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (storage.listWalletsByUser as any).mockResolvedValue([
      { id: 'wA', nativeCurrency: 'USD' },
    ]);

    // Simula a UNIQUE constraint do DB: apenas o primeiro INSERT em uma
    // (sessionId, walletId) eh aceito; o segundo joga 23505.
    const insertedKeys = new Set<string>();
    const sharedSnapshotInsert = async (input: any) => {
      const key = `${input.sessionId}:${input.walletId}`;
      if (insertedKeys.has(key)) {
        const e: any = new Error('duplicate key value violates unique constraint');
        e.code = '23505';
        throw e;
      }
      insertedKeys.add(key);
      return { id: 'snap_' + insertedKeys.size };
    };

    // Cada chamada cria seu proprio tx wrapper; ambos falam com o mesmo
    // mock de "DB" (insertedKeys closure compartilhado).
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      const localTx: any = {
        findSessionWalletSnapshot: vi.fn(async () => null),
        createSessionWalletSnapshot: sharedSnapshotInsert,
      };
      return await fn(localTx);
    });

    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'tx_x' },
      wallet: { id: 'wA' },
    });

    const adjustments = [
      { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180, expectedDelta: 67 },
    ];

    // Race: 2 chamadas em paralelo.
    const [r1, r2] = await Promise.all([
      runReconciliation('USER-0001', 'ses_race2', adjustments),
      runReconciliation('USER-0001', 'ses_race2', adjustments),
    ]);

    // Exatamente uma deve ter sucesso (created=1) e outra deve receber
    // alreadyReconciled. Quem chega primeiro depende de ordering — testamos
    // a propriedade simetrica.
    const successes = [r1, r2].filter((r) => !r.alreadyReconciled && r.created.length === 1);
    const conflicts = [r1, r2].filter((r) => r.alreadyReconciled === true);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
  });
});
