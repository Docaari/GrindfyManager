/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-2: Auto-snapshot pos-cooldown (service layer)
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-2, D2)
 * ADR-058: Auto-snapshot dentro da TX, falha logada nao bloqueia finish
 *
 * API esperada (a ser implementada em server/services/bankrollService.ts):
 *   bankrollService.createAutoSnapshot({ userId, cooldownLogId, occurredAt? })
 *     -> Promise<BankrollSnapshot | null>
 *
 * Casos cobertos:
 *   1. Happy path: snapshot criado com origin='auto-cooldown'
 *   2. delta = newAmount - previousAmount (consolidado USD vs ultimo snapshot)
 *   3. previousAmount=0 quando user nao tem snapshot anterior
 *   4. Source mantem 'auto_session' (semantica enum existente)
 *   5. sourceRefId = cooldownLogId (idempotencia)
 *   6. Idempotencia: duplicate viola unique index → catch + log + return null
 *   7. bankrollManagementEnabled=false → return null sem chamar walletService
 *   8. Wallets vazias → consolidatedUSD=0, snapshot ainda gravado
 *   9. delta=0 ainda grava snapshot (auditoria)
 *  10. Erro inesperado em insertBankrollSnapshot NAO propaga
 *
 * Mocks: storage (insertBankrollSnapshot, getBankrollSnapshots, getUserSettings),
 *        walletService.getConsolidatedBalance (re-export por chamada dinamica).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    insertBankrollSnapshot: vi.fn(),
    getBankrollSnapshots: vi.fn(),
    getUserSettings: vi.fn(),
    transaction: vi.fn(async (fn: any) =>
      fn({
        insertBankrollSnapshot: vi.fn(),
        getBankrollSnapshots: vi.fn(),
        getUserSettings: vi.fn(),
      }),
    ),
  },
}));

const getConsolidatedBalanceMock = vi.fn();
vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    getConsolidatedBalance: (...args: any[]) => getConsolidatedBalanceMock(...args),
  },
}));

vi.mock('../../../server/services/bankrollCache', () => ({
  bankrollCache: { invalidateAllForUser: vi.fn(), get: vi.fn(() => null), set: vi.fn() },
}));
vi.mock('../../../server/services/selectorCache', () => ({
  selectorCache: { invalidateAllForUser: vi.fn(), get: vi.fn(() => null), set: vi.fn() },
}));
vi.mock('../../../server/services/walletCache', () => ({
  walletCache: { invalidateAllForUser: vi.fn(), get: vi.fn(() => null), set: vi.fn() },
}));

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getUserSettings as any).mockResolvedValue({
    userId: 'USER-0001',
    bankrollManagementEnabled: true,
    exchangeRates: { BRL: 5.0 },
  });
  (storage.getBankrollSnapshots as any).mockResolvedValue([]);
  (storage.insertBankrollSnapshot as any).mockImplementation(async (data: any) => ({
    id: 'snap_new',
    ...data,
    occurredAt: data.occurredAt ?? new Date(),
  }));
  getConsolidatedBalanceMock.mockResolvedValue({
    totalUSD: '5660.00',
    walletCount: 2,
    aggregationMode: 'global',
  });
});

async function loadService() {
  const mod = await import('../../../server/services/bankrollService');
  return mod.bankrollService;
}

describe('bankrollService.createAutoSnapshot — RF-2 happy path', () => {
  it('cria snapshot com origin=auto-cooldown e source=auto_session', async () => {
    const svc = await loadService();
    const result = await (svc as any).createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd_1',
    });

    expect(result).not.toBeNull();
    expect(storage.insertBankrollSnapshot).toHaveBeenCalled();
    const payload = (storage.insertBankrollSnapshot as any).mock.calls[0][0];
    expect(payload.userId).toBe('USER-0001');
    expect(payload.origin).toBe('auto-cooldown');
    expect(payload.source).toBe('auto_session');
    expect(payload.sourceRefId).toBe('cd_1');
  });

  it('delta = newAmount - previousAmount (snapshot anterior existe)', async () => {
    (storage.getBankrollSnapshots as any).mockResolvedValue([
      { id: 's_old', newAmount: '5000.00', occurredAt: new Date('2026-04-30T22:00:00Z') },
    ]);

    const svc = await loadService();
    await (svc as any).createAutoSnapshot({ userId: 'USER-0001', cooldownLogId: 'cd_1' });

    const payload = (storage.insertBankrollSnapshot as any).mock.calls[0][0];
    expect(parseFloat(String(payload.delta))).toBeCloseTo(660, 2);
    expect(parseFloat(String(payload.previousAmount))).toBeCloseTo(5000, 2);
    expect(parseFloat(String(payload.newAmount))).toBeCloseTo(5660, 2);
  });

  it('previousAmount=0 quando user nao tem snapshot anterior', async () => {
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);
    const svc = await loadService();
    await (svc as any).createAutoSnapshot({ userId: 'USER-0001', cooldownLogId: 'cd_1' });

    const payload = (storage.insertBankrollSnapshot as any).mock.calls[0][0];
    expect(parseFloat(String(payload.previousAmount))).toBe(0);
    expect(parseFloat(String(payload.delta))).toBeCloseTo(5660, 2);
  });

  it('grava snapshot mesmo com delta=0 (auditoria)', async () => {
    getConsolidatedBalanceMock.mockResolvedValue({
      totalUSD: '5000.00',
      walletCount: 2,
      aggregationMode: 'global',
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([
      { id: 's_old', newAmount: '5000.00' },
    ]);
    const svc = await loadService();
    const result = await (svc as any).createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd_1',
    });

    expect(storage.insertBankrollSnapshot).toHaveBeenCalled();
    expect(result).not.toBeNull();
    const payload = (storage.insertBankrollSnapshot as any).mock.calls[0][0];
    expect(parseFloat(String(payload.delta))).toBe(0);
  });

  it('grava snapshot mesmo com wallets vazias (consolidated=0)', async () => {
    getConsolidatedBalanceMock.mockResolvedValue({
      totalUSD: '0.00',
      walletCount: 0,
      aggregationMode: 'global',
    });
    (storage.getBankrollSnapshots as any).mockResolvedValue([
      { id: 's_old', newAmount: '500.00' },
    ]);
    const svc = await loadService();
    const result = await (svc as any).createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd_1',
    });

    expect(result).not.toBeNull();
    const payload = (storage.insertBankrollSnapshot as any).mock.calls[0][0];
    expect(parseFloat(String(payload.newAmount))).toBe(0);
    expect(parseFloat(String(payload.delta))).toBeCloseTo(-500, 2);
  });
});

describe('bankrollService.createAutoSnapshot — RF-2 setting respect', () => {
  it('retorna null quando bankrollManagementEnabled=false (skip silencioso)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      bankrollManagementEnabled: false,
      exchangeRates: {},
    });

    const svc = await loadService();
    const result = await (svc as any).createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd_1',
    });

    expect(result).toBeNull();
    expect(storage.insertBankrollSnapshot).not.toHaveBeenCalled();
    expect(getConsolidatedBalanceMock).not.toHaveBeenCalled();
  });

  it('retorna snapshot quando bankrollManagementEnabled=true', async () => {
    const svc = await loadService();
    const result = await (svc as any).createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd_1',
    });
    expect(result).not.toBeNull();
  });

  it('retorna snapshot quando bankrollManagementEnabled undefined (default true)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-0001',
      // bankrollManagementEnabled undefined
      exchangeRates: {},
    });

    const svc = await loadService();
    const result = await (svc as any).createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd_1',
    });
    expect(result).not.toBeNull();
  });
});

describe('bankrollService.createAutoSnapshot — RF-2 idempotencia + erros', () => {
  it('insert lanca unique violation -> retorna null sem propagar', async () => {
    (storage.insertBankrollSnapshot as any).mockRejectedValue(
      Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
      }),
    );

    const svc = await loadService();
    const result = await (svc as any).createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd_1',
    });
    expect(result).toBeNull();
  });

  it('erro inesperado em insert NAO propaga (try/catch)', async () => {
    (storage.insertBankrollSnapshot as any).mockRejectedValue(new Error('boom'));
    const svc = await loadService();
    const result = await (svc as any).createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd_1',
    });
    expect(result).toBeNull();
  });

  it('erro em getConsolidatedBalance NAO propaga (return null)', async () => {
    getConsolidatedBalanceMock.mockRejectedValue(new Error('db down'));
    const svc = await loadService();
    const result = await (svc as any).createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd_1',
    });
    expect(result).toBeNull();
  });

  it('cooldownLogId undefined → 400-like (lanca ou retorna null)', async () => {
    const svc = await loadService();
    const result = await (svc as any).createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: '',
    });
    expect(result).toBeNull();
  });

  it('userId vazio → retorna null sem mexer em DB', async () => {
    const svc = await loadService();
    const result = await (svc as any).createAutoSnapshot({
      userId: '',
      cooldownLogId: 'cd_1',
    });
    expect(result).toBeNull();
    expect(storage.insertBankrollSnapshot).not.toHaveBeenCalled();
  });
});

describe('bankrollService.createAutoSnapshot — RF-2 payload contract', () => {
  it('reason eh "manual_adjustment" (enum suportado para snapshots automaticos)', async () => {
    const svc = await loadService();
    await (svc as any).createAutoSnapshot({ userId: 'USER-0001', cooldownLogId: 'cd_1' });
    const payload = (storage.insertBankrollSnapshot as any).mock.calls[0][0];
    // Reason aceitavel: manual_adjustment ou session_result. Implementer escolhe.
    expect(['manual_adjustment', 'session_result', 'auto_session']).toContain(payload.reason);
  });

  it('occurredAt vem da entrada se fornecido', async () => {
    const ts = new Date('2026-05-01T03:14:00Z');
    const svc = await loadService();
    await (svc as any).createAutoSnapshot({
      userId: 'USER-0001',
      cooldownLogId: 'cd_1',
      occurredAt: ts,
    });
    const payload = (storage.insertBankrollSnapshot as any).mock.calls[0][0];
    expect(new Date(payload.occurredAt).toISOString()).toBe(ts.toISOString());
  });

  it('occurredAt default = new Date() se ausente', async () => {
    const svc = await loadService();
    const before = Date.now();
    await (svc as any).createAutoSnapshot({ userId: 'USER-0001', cooldownLogId: 'cd_1' });
    const after = Date.now();
    const payload = (storage.insertBankrollSnapshot as any).mock.calls[0][0];
    const ts = new Date(payload.occurredAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });

  it('chama walletService.getConsolidatedBalance(userId)', async () => {
    const svc = await loadService();
    await (svc as any).createAutoSnapshot({ userId: 'USER-0001', cooldownLogId: 'cd_1' });
    // Sprint FX-1 RF-09: agora getConsolidatedBalance recebe (userId, { rates, date })
    // para snapshots novos. Validamos apenas o userId — opts e implementation detail.
    expect(getConsolidatedBalanceMock).toHaveBeenCalled();
    const call = getConsolidatedBalanceMock.mock.calls[0];
    expect(call[0]).toBe('USER-0001');
  });
});
