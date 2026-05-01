/**
 * Sprint Bankroll-3 — round 2 reviewer fix CRIT-2 + HIGH-1
 *
 * SMOKE tests para validar que os handlers Bankroll-3 estao corretamente
 * MONTADOS no Express. Verifica:
 *   1. POST /api/grind-sessions chama stop-lock gate (CRIT-2)
 *   2. POST /api/wallets/transfers nao colide com /api/wallets/:id (HIGH-1)
 *   3. POST /api/wallets/pending/:id/settle eh roteado para o handler correto
 *   4. POST /api/cooldown-logs/:id/finish chama auto-snapshot (CRIT-6 alternative)
 *
 * Strategy: Express real + supertest + auth middleware mockado + services mockados.
 * Garante que `registerWalletRoutes`/`registerGrindSessionRoutes`/`registerCooldownRoutes`
 * conectam corretamente os handlers — diferente de `tests/integration/api/*` que
 * chama handlers diretamente sem o Express layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// Mock auth middleware ANTES dos imports dos route registers.
vi.mock('../../../server/auth', async () => {
  const actual = await vi.importActual<any>('../../../server/auth');
  return {
    ...actual,
    requireAuth: (req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = { userPlatformId: 'USER-0001', subscriptionPlan: 'admin' };
      next();
    },
  };
});

const stopServiceMock = {
  assertNotStopLocked: vi.fn(),
  evaluateStops: vi.fn(),
  getCurrentDayDeltaUsd: vi.fn(async () => 0),
  releaseLock: vi.fn(),
};
vi.mock('../../../server/services/stopService', () => ({
  stopService: stopServiceMock,
}));

const walletServiceMock = {
  createTransfer: vi.fn(async () => ({
    transfer: { id: 'transfer_1' },
    transactions: [],
  })),
  listTransfers: vi.fn(async () => []),
  getTransfer: vi.fn(async () => null),
  createPending: vi.fn(async () => ({ id: 'p1', status: 'pending' })),
  listPending: vi.fn(async () => []),
  cancelPending: vi.fn(async () => ({ status: 'cancelled' })),
  settlePending: vi.fn(async () => ({ transaction: { id: 'tx_settled' }, pending: { status: 'cleared' } })),
  // Outros metodos do walletService que rotas chamam mas nao sao foco do smoke:
  createWallet: vi.fn(),
  getWallet: vi.fn(),
  listWallets: vi.fn(async () => []),
  updateWallet: vi.fn(),
  archiveWallet: vi.fn(),
  listWalletTransactions: vi.fn(),
  recordWalletTransaction: vi.fn(),
  getConsolidatedBalance: vi.fn(async () => ({ totalUSD: '0', walletCount: 0, aggregationMode: 'global' })),
};
vi.mock('../../../server/services/walletService', () => ({
  walletService: walletServiceMock,
}));

const bankrollServiceMock = {
  createAutoSnapshot: vi.fn(async () => ({ id: 'snap_1', sourceRefId: 'cd_1' })),
  getBankrollState: vi.fn(),
  updateBankroll: vi.fn(),
  recordSnapshot: vi.fn(),
  getBankrollHistory: vi.fn(),
};
vi.mock('../../../server/services/bankrollService', () => ({
  bankrollService: bankrollServiceMock,
}));

const storageMock = {
  // grind-sessions
  getGrindSession: vi.fn(async () => ({ id: 'ses_1', userId: 'USER-0001', status: 'active' })),
  getGrindSessions: vi.fn(async () => []),
  createGrindSession: vi.fn(async (data: any) => ({ id: 'ses_new', ...data })),
  updateGrindSession: vi.fn(async () => ({ id: 'ses_1', status: 'completed' })),
  deleteGrindSession: vi.fn(),
  resetPlannedTournamentsForSession: vi.fn(),
  getPlannedTournaments: vi.fn(async () => []),
  getPlannedTournamentsBySession: vi.fn(async () => []),
  updatePlannedTournament: vi.fn(),
  createSessionTournament: vi.fn(),
  getSessionTournamentsByDay: vi.fn(async () => []),
  // cooldown
  getCooldownLog: vi.fn(async () => ({
    id: 'cd_1',
    sessionId: 'ses_1',
    userId: 'USER-0001',
    mode: 'full',
    startedAt: new Date(),
    blocksCompleted: ['hands', 'abc', 'tilt'],
  })),
  updateCooldownLog: vi.fn(async () => ({ id: 'cd_1', completedAt: new Date() })),
  setSessionPlanClosed: vi.fn(),
  setUserDashboardSnoozedUntil: vi.fn(),
  setGrindSessionStatus: vi.fn(),
  // user settings
  getUserSettings: vi.fn(async () => ({ bankrollManagementEnabled: true })),
  upsertUserSettings: vi.fn(),
  // wallets (consolidated/listWallets path)
  listWalletsByUser: vi.fn(async () => []),
};
vi.mock('../../../server/storage', () => ({
  storage: storageMock,
  getSitePerformanceData: vi.fn(),
}));

// Stub db (impede crash de imports indiretos)
vi.mock('../../../server/db', () => ({ db: {}, pool: {} }));

// Mock Vite middleware (impede crash em registerRoutes? mas nao usamos registerRoutes)
beforeEach(() => {
  vi.clearAllMocks();
  // Reset defaults dos mocks que retornam valores
  storageMock.getGrindSession.mockResolvedValue({ id: 'ses_1', userId: 'USER-0001', status: 'active' } as any);
  storageMock.getGrindSessions.mockResolvedValue([]);
  storageMock.createGrindSession.mockImplementation(async (data: any) => ({ id: 'ses_new', ...data }));
  storageMock.updateGrindSession.mockResolvedValue({ id: 'ses_1', status: 'completed' } as any);
  storageMock.getCooldownLog.mockResolvedValue({
    id: 'cd_1',
    sessionId: 'ses_1',
    userId: 'USER-0001',
    mode: 'full',
    startedAt: new Date(),
    blocksCompleted: ['hands', 'abc', 'tilt'],
  } as any);
  storageMock.updateCooldownLog.mockResolvedValue({ id: 'cd_1', completedAt: new Date() } as any);
  storageMock.getUserSettings.mockResolvedValue({ bankrollManagementEnabled: true } as any);
  bankrollServiceMock.createAutoSnapshot.mockResolvedValue({ id: 'snap_1', sourceRefId: 'cd_1' } as any);
  walletServiceMock.createTransfer.mockResolvedValue({
    transfer: { id: 'transfer_1' },
    transactions: [],
  } as any);
  walletServiceMock.listTransfers.mockResolvedValue([] as any);
  walletServiceMock.settlePending.mockResolvedValue({
    transaction: { id: 'tx_settled' },
    pending: { status: 'cleared' },
  } as any);
  stopServiceMock.assertNotStopLocked.mockResolvedValue(undefined);
  stopServiceMock.evaluateStops.mockResolvedValue({ stopReached: null });
});

async function buildApp() {
  // Import lazily depois dos mocks aplicados.
  const { registerWalletRoutes } = await import('../../../server/routes/wallets');
  const { registerGrindSessionRoutes } = await import('../../../server/routes/grind-sessions');
  const { registerCooldownRoutes } = await import('../../../server/routes/cooldown');
  const app = express();
  app.use(express.json());
  registerWalletRoutes(app as any);
  registerGrindSessionRoutes(app as any);
  registerCooldownRoutes(app as any);
  return app;
}

describe('Bankroll-3 route wiring smoke tests', () => {
  describe('CRIT-2 — POST /api/grind-sessions chama stop-lock gate', () => {
    it('quando lock ativo, retorna 423 e NAO cria sessao', async () => {
      stopServiceMock.assertNotStopLocked.mockRejectedValue(
        Object.assign(new Error('STOP_LOCKED'), {
          httpStatus: 423,
          code: 'STOP_LOCKED',
          lockedUntil: new Date(Date.now() + 3600 * 1000).toISOString(),
          remainingMs: 3600 * 1000,
        }),
      );
      const app = await buildApp();
      const res = await request(app)
        .post('/api/grind-sessions')
        .send({ date: new Date().toISOString(), type: 'mtt' });

      expect(res.status).toBe(423);
      expect(res.body.code).toBe('STOP_LOCKED');
      expect(stopServiceMock.assertNotStopLocked).toHaveBeenCalledWith('USER-0001');
      expect(storageMock.createGrindSession).not.toHaveBeenCalled();
    });

    it('quando sem lock, prossegue normalmente (retorna 200/201)', async () => {
      const app = await buildApp();
      const res = await request(app)
        .post('/api/grind-sessions')
        .send({ date: new Date().toISOString(), type: 'mtt' });

      expect([200, 201]).toContain(res.status);
      expect(stopServiceMock.assertNotStopLocked).toHaveBeenCalledWith('USER-0001');
    });
  });

  describe('CRIT-2 — PUT /api/grind-sessions/:id chama evaluateStops em status=completed', () => {
    it('PUT status=completed chama stopService.evaluateStops', async () => {
      const app = await buildApp();
      const res = await request(app)
        .put('/api/grind-sessions/ses_1')
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(stopServiceMock.evaluateStops).toHaveBeenCalledWith('USER-0001', 'ses_1');
    });

    it('PUT status=paused NAO chama evaluateStops', async () => {
      const app = await buildApp();
      await request(app)
        .put('/api/grind-sessions/ses_1')
        .send({ status: 'paused' });

      expect(stopServiceMock.evaluateStops).not.toHaveBeenCalled();
    });
  });

  describe('HIGH-1 — POST /api/wallets/transfers nao colide com /api/wallets/:id', () => {
    it('POST /api/wallets/transfers vai para handlePostWalletTransfer (nao para handlePutWallet)', async () => {
      const app = await buildApp();
      const res = await request(app)
        .post('/api/wallets/transfers')
        .send({
          fromWalletId: 'w1',
          toWalletId: 'w2',
          amountFrom: 100,
          reason: 'transfer',
        });

      // 201 esperado (handler deve validar + chamar createTransfer mock)
      expect(walletServiceMock.createTransfer).toHaveBeenCalled();
      expect(res.status).toBe(201);
    });

    it('GET /api/wallets/transfers retorna lista vazia (nao 404 por collision)', async () => {
      const app = await buildApp();
      const res = await request(app).get('/api/wallets/transfers');
      expect(res.status).toBe(200);
      expect(walletServiceMock.listTransfers).toHaveBeenCalled();
    });
  });

  describe('HIGH-1 — POST /api/wallets/pending/:id/settle vai para o handler correto', () => {
    it('settle handler eh invocado, nao colide com :walletId/pending', async () => {
      const app = await buildApp();
      const res = await request(app).post('/api/wallets/pending/p1/settle').send({});
      expect(walletServiceMock.settlePending).toHaveBeenCalledWith(
        'USER-0001',
        'p1',
        expect.anything(),
      );
      expect([200, 201]).toContain(res.status);
    });
  });

  describe('CRIT-6 alternative — auto-snapshot atomicidade fraca (idempotencia via unique index)', () => {
    it('POST /api/cooldown-logs/:id/finish chama bankrollService.createAutoSnapshot', async () => {
      const app = await buildApp();
      const res = await request(app)
        .post('/api/cooldown-logs/cd_1/finish')
        .send({ sleepIntent: false, planClosed: true });

      expect(res.status).toBe(200);
      expect(bankrollServiceMock.createAutoSnapshot).toHaveBeenCalledWith({
        userId: 'USER-0001',
        cooldownLogId: 'cd_1',
      });
      expect(res.body.snapshot).toBeDefined();
    });

    it('falha em createAutoSnapshot NAO quebra finish (snapshot:null, status 200)', async () => {
      bankrollServiceMock.createAutoSnapshot.mockRejectedValue(new Error('snapshot db down'));
      const app = await buildApp();
      const res = await request(app)
        .post('/api/cooldown-logs/cd_1/finish')
        .send({ sleepIntent: false, planClosed: true });
      expect(res.status).toBe(200);
      expect(res.body.snapshot).toBeNull();
    });
  });
});
