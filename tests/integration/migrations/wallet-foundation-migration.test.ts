import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: RF-08 — Migration v1->v2 multi-wallet
//
// Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-08)
// ADR-035: compatibilidade v1->v2 + lazy/one-shot decision
// Script: server/scripts/migrate-v2-multi-wallet.ts
// =============================================================================

const txMock: any = {};

vi.mock('../../../server/storage', () => ({
  storage: {
    listUsersForV2Migration: vi.fn(),
    transaction: vi.fn(async (fn: any) => fn(txMock)),
    // Direto (fora de tx):
    getUserSettings: vi.fn(),
    listWalletsByUser: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';

async function importMigration() {
  return await import('../../../server/scripts/migrate-v2-multi-wallet');
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BANKROLL_V2_DRY_RUN;
  Object.assign(txMock, {
    getUserSettings: vi.fn(),
    listWalletsByUser: vi.fn(async () => []),
    createWallet: vi.fn(),
    backfillSnapshotsWalletId: vi.fn(),
    setUserBankrollV2Migrated: vi.fn(),
    selectUserSettingsForUpdate: vi.fn(),
  });
});

describe('RF-08: migration v1->v2 — happy path', () => {
  it('usuario com bankrollAmount=1000 e 5 snapshots: cria 1 wallet "Banca Padrao USD" + backfill', async () => {
    (storage.listUsersForV2Migration as any).mockResolvedValue([
      { userId: 'USER-LEG1', bankrollAmount: '1000.00', bankrollV2Migrated: false },
    ]);
    txMock.selectUserSettingsForUpdate.mockResolvedValue({
      userId: 'USER-LEG1', bankrollAmount: '1000.00', bankrollV2Migrated: false,
    });
    txMock.listWalletsByUser.mockResolvedValue([]);
    txMock.createWallet.mockResolvedValue({
      id: 'wlt_default_LEG1',
      userId: 'USER-LEG1',
      name: 'Banca Padrao USD',
      platform: 'GenericUSD',
      nativeCurrency: 'USD',
      balance: '1000.00',
      status: 'active',
      isShotPocket: false,
    });
    txMock.backfillSnapshotsWalletId.mockResolvedValue(5);
    txMock.setUserBankrollV2Migrated.mockResolvedValue(true);

    const { runV2Migration } = await importMigration();
    const r = await runV2Migration({ dryRun: false });

    expect(r.migrated).toBe(1);
    expect(r.skipped).toBe(0);
    expect(txMock.createWallet).toHaveBeenCalledTimes(1);
    expect(txMock.backfillSnapshotsWalletId).toHaveBeenCalledTimes(1);
    expect(txMock.setUserBankrollV2Migrated).toHaveBeenCalledTimes(1);

    const created = (txMock.createWallet.mock.calls[0][0]) ?? {};
    // Aceita assinatura { name, ... } direto OU como segundo argumento
    const wname = created.name ?? (txMock.createWallet.mock.calls[0][1]?.name);
    expect(wname).toMatch(/Banca Padrao|Default/i);
  });
});

describe('RF-08: migration — idempotencia', () => {
  it('usuario ja migrado (bankrollV2Migrated=true): pula sem criar wallet', async () => {
    (storage.listUsersForV2Migration as any).mockResolvedValue([
      { userId: 'USER-MIG', bankrollAmount: '1000', bankrollV2Migrated: true },
    ]);
    txMock.selectUserSettingsForUpdate.mockResolvedValue({
      userId: 'USER-MIG', bankrollAmount: '1000', bankrollV2Migrated: true,
    });

    const { runV2Migration } = await importMigration();
    const r = await runV2Migration({ dryRun: false });

    expect(r.migrated).toBe(0);
    expect(r.skipped).toBe(1);
    expect(txMock.createWallet).not.toHaveBeenCalled();
  });

  it('usuario com walletCount > 0 (defesa em profundidade): marca migrated e pula', async () => {
    (storage.listUsersForV2Migration as any).mockResolvedValue([
      { userId: 'USER-OK', bankrollAmount: '1000', bankrollV2Migrated: false },
    ]);
    txMock.selectUserSettingsForUpdate.mockResolvedValue({
      userId: 'USER-OK', bankrollAmount: '1000', bankrollV2Migrated: false,
    });
    txMock.listWalletsByUser.mockResolvedValue([{ id: 'wlt_existing' }]);
    txMock.setUserBankrollV2Migrated.mockResolvedValue(true);

    const { runV2Migration } = await importMigration();
    const r = await runV2Migration({ dryRun: false });

    expect(r.skipped).toBe(1);
    expect(txMock.createWallet).not.toHaveBeenCalled();
    expect(txMock.setUserBankrollV2Migrated).toHaveBeenCalled();
  });

  it('re-execucao da migration: 0 novas wallets criadas', async () => {
    (storage.listUsersForV2Migration as any).mockResolvedValueOnce([
      { userId: 'USER-X', bankrollAmount: '500', bankrollV2Migrated: false },
    ]).mockResolvedValueOnce([]);
    // Primeira execucao: migra
    txMock.selectUserSettingsForUpdate.mockResolvedValue({
      userId: 'USER-X', bankrollAmount: '500', bankrollV2Migrated: false,
    });
    txMock.listWalletsByUser.mockResolvedValue([]);
    txMock.createWallet.mockResolvedValue({ id: 'wlt_x', balance: '500' });
    txMock.backfillSnapshotsWalletId.mockResolvedValue(0);

    const { runV2Migration } = await importMigration();
    const r1 = await runV2Migration({ dryRun: false });
    expect(r1.migrated).toBe(1);

    // Segunda execucao: lista vazia (filtro por bankrollV2Migrated=false ja cobre)
    const r2 = await runV2Migration({ dryRun: false });
    expect(r2.migrated).toBe(0);
  });
});

describe('RF-08: migration — usuarios sem bankroll v1', () => {
  it('usuario com bankrollAmount=NULL: nao listado (filtro SQL); migration nao toca', async () => {
    // listUsersForV2Migration filtra usuarios com bankrollAmount > 0 e nao migrados
    (storage.listUsersForV2Migration as any).mockResolvedValue([]);

    const { runV2Migration } = await importMigration();
    const r = await runV2Migration({ dryRun: false });

    expect(r.migrated).toBe(0);
    expect(r.skipped).toBe(0);
    expect(txMock.createWallet).not.toHaveBeenCalled();
  });

  it('usuario com bankrollAmount=0: nao migrado (filtro); migration nao toca', async () => {
    (storage.listUsersForV2Migration as any).mockResolvedValue([]);

    const { runV2Migration } = await importMigration();
    const r = await runV2Migration({ dryRun: false });

    expect(r.migrated).toBe(0);
  });
});

describe('RF-08: migration — dry-run', () => {
  it('dryRun=true nao escreve no banco; loga delta planejado', async () => {
    (storage.listUsersForV2Migration as any).mockResolvedValue([
      { userId: 'USER-DRY', bankrollAmount: '500', bankrollV2Migrated: false },
    ]);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { runV2Migration } = await importMigration();
    const r = await runV2Migration({ dryRun: true });

    expect(txMock.createWallet).not.toHaveBeenCalled();
    expect(txMock.backfillSnapshotsWalletId).not.toHaveBeenCalled();
    expect(txMock.setUserBankrollV2Migrated).not.toHaveBeenCalled();
    expect(r.dryRun).toBe(true);

    const allLogs = infoSpy.mock.calls.flat().map((x) => JSON.stringify(x)).join(' ');
    expect(allLogs).toMatch(/USER-DRY|would create|plan|dry/i);
    infoSpy.mockRestore();
  });
});

describe('RF-08: migration — log estruturado por usuario', () => {
  it('log inclui userId, walletId criado, snapshotsBackfilled, originalAmount', async () => {
    (storage.listUsersForV2Migration as any).mockResolvedValue([
      { userId: 'USER-LOG', bankrollAmount: '1500', bankrollV2Migrated: false },
    ]);
    txMock.selectUserSettingsForUpdate.mockResolvedValue({
      userId: 'USER-LOG', bankrollAmount: '1500', bankrollV2Migrated: false,
    });
    txMock.listWalletsByUser.mockResolvedValue([]);
    txMock.createWallet.mockResolvedValue({
      id: 'wlt_log', userId: 'USER-LOG', balance: '1500.00',
    });
    txMock.backfillSnapshotsWalletId.mockResolvedValue(7);
    txMock.setUserBankrollV2Migrated.mockResolvedValue(true);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { runV2Migration } = await importMigration();
    await runV2Migration({ dryRun: false });

    const allLogs = infoSpy.mock.calls.flat().map((x) => JSON.stringify(x)).join(' ');
    expect(allLogs).toMatch(/USER-LOG/);
    expect(allLogs).toMatch(/wlt_log|walletId/i);
    expect(allLogs).toMatch(/7|snapshotsBackfilled/i);
    expect(allLogs).toMatch(/1500|originalAmount/i);
    infoSpy.mockRestore();
  });
});

describe('RF-08: migration NAO cria wallet_transactions', () => {
  it('decisao ADR-035 Opcao A: snapshots ja sao audit trail v1; NAO duplicar', async () => {
    (storage.listUsersForV2Migration as any).mockResolvedValue([
      { userId: 'USER-NOTX', bankrollAmount: '1000', bankrollV2Migrated: false },
    ]);
    txMock.selectUserSettingsForUpdate.mockResolvedValue({
      userId: 'USER-NOTX', bankrollAmount: '1000', bankrollV2Migrated: false,
    });
    txMock.listWalletsByUser.mockResolvedValue([]);
    txMock.createWallet.mockResolvedValue({ id: 'wlt_notx', balance: '1000' });
    txMock.backfillSnapshotsWalletId.mockResolvedValue(3);
    txMock.createWalletTransaction = vi.fn();

    const { runV2Migration } = await importMigration();
    await runV2Migration({ dryRun: false });

    expect(txMock.createWalletTransaction).not.toHaveBeenCalled();
  });
});

describe('RF-08: migration — error handling', () => {
  it('usuario com erro mid-migration: transacao do usuario faz rollback; outros prosseguem', async () => {
    (storage.listUsersForV2Migration as any).mockResolvedValue([
      { userId: 'USER-FAIL', bankrollAmount: '1000', bankrollV2Migrated: false },
      { userId: 'USER-OK', bankrollAmount: '500', bankrollV2Migrated: false },
    ]);

    let callIndex = 0;
    (storage.transaction as any).mockImplementation(async (fn: any) => {
      callIndex++;
      const innerTx = {
        selectUserSettingsForUpdate: vi.fn(async () => {
          if (callIndex === 1) throw new Error('snapshot inconsistente USER-FAIL');
          return { userId: 'USER-OK', bankrollAmount: '500', bankrollV2Migrated: false };
        }),
        listWalletsByUser: vi.fn(async () => []),
        createWallet: vi.fn(async () => ({ id: 'wlt_ok', balance: '500' })),
        backfillSnapshotsWalletId: vi.fn(async () => 0),
        setUserBankrollV2Migrated: vi.fn(),
      };
      return fn(innerTx);
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runV2Migration } = await importMigration();
    const r = await runV2Migration({ dryRun: false });

    // 1 falhou + 1 sucesso = 1 migrado, 1 erro
    expect(r.errors).toBeGreaterThanOrEqual(1);
    expect(r.migrated).toBeGreaterThanOrEqual(1);
    errSpy.mockRestore();
  });
});

describe('RF-08: migration — schema delta validation', () => {
  it.todo('rollback drop colunas novas em snapshots nao corrompe dados pre-existentes (teste estrutural via SQL — exige neon dev branch)');
});
