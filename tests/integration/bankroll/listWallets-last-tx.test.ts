/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UX-QW-2 — RF-06 (storage side)
 * Spec: Docs/specs/sprint-ux-qw-2.md
 *
 * O endpoint GET /api/wallets deve retornar `lastTransactionAt` para cada wallet,
 * derivado de `MAX(wallet_transactions.occurred_at) WHERE wallet_id = w.id`.
 *
 * Estrategia:
 *   - Mock storage.listWalletsByUser para retornar wallets enriquecidas com
 *     `lastTransactionAt` (campo nullable).
 *   - Mock storage.getLastWalletTransaction OU o helper agregado (a depender da
 *     implementacao escolhida pelo implementer).
 *   - Asserta que o handler GET /api/wallets retorna o campo no shape de cada
 *     wallet.
 *
 * Decisao de design (delegada ao implementer):
 *   A) Estender `listWalletsByUser` para fazer LEFT JOIN agregado e retornar
 *      `lastTransactionAt` direto no row. (Default — single query, performance OK).
 *   B) Adicionar helper separado `getLastTransactionAtMap(userId)` e o handler
 *      faz merge. (Mais flexivel mas N+1 leve).
 *
 * Esta suite cobre o contrato (handler GET /api/wallets retorna o campo) sem
 * impor o caminho A vs B. Implementer escolhe.
 *
 * Lessons aplicadas:
 *   #2  data-testid (n/a aqui — backend).
 *   #3  mock shape REAL de wallet_transactions (occurredAt timestamp ISO).
 *   #34 handler aceita injectedStorage como terceiro arg para teste.
 *   #36 storage modules lazy `@shared/schema` quando mockam drizzle parcialmente.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Lesson #14: vi.mock eh hoisted; const top-level que ele referencia gera TDZ
// "Cannot access 'storageMock' before initialization". Workaround canonico:
// vi.hoisted (referencias compartilhadas para mocks).
const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    listWalletsByUser: vi.fn(),
    getLastTransactionAtByWallet: vi.fn(),
  },
}));

vi.mock('../../../server/storage', () => ({
  storage: storageMock,
}));

vi.mock('../../../server/services/walletCache', () => ({
  walletCache: {
    invalidateAllForUser: vi.fn(),
    get: vi.fn(() => null),
    set: vi.fn(),
  },
}));

// Handler a ser exposto pelo implementer. Pode reusar handleListWallets existente
// — apenas garantir que o shape de resposta inclui `lastTransactionAt`.
// @ts-expect-error — RED: handler com nome canonico pode ainda nao existir
import { handleListWallets } from '../../../server/routes/wallets';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    query: {},
    params: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  return res;
}

// ===========================================================================
// Happy path
// ===========================================================================

describe('GET /api/wallets — lastTransactionAt no shape (RF-06)', () => {
  it('retorna lastTransactionAt para wallet com transacoes', async () => {
    const lastTx = new Date('2026-05-15T10:00:00.000Z').toISOString();
    storageMock.listWalletsByUser.mockResolvedValue([
      {
        id: 'w1',
        userId: 'USER-0001',
        name: 'GG Main',
        platform: 'GGNetwork',
        nativeCurrency: 'USD',
        balance: '500',
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
        lastTransactionAt: lastTx,
      },
    ]);

    const res = makeRes();
    await handleListWallets(makeReq() as any, res, storageMock as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.wallets).toBeDefined();
    expect(res.body.wallets).toHaveLength(1);
    expect(res.body.wallets[0].lastTransactionAt).toBe(lastTx);
  });

  it('retorna lastTransactionAt = null para wallet sem transacoes', async () => {
    storageMock.listWalletsByUser.mockResolvedValue([
      {
        id: 'w-new',
        userId: 'USER-0001',
        name: 'Recem criada',
        platform: 'Suprema',
        nativeCurrency: 'BRL',
        balance: '0',
        status: 'active',
        createdAt: '2026-05-20T00:00:00.000Z',
        updatedAt: '2026-05-20T00:00:00.000Z',
        lastTransactionAt: null,
      },
    ]);

    const res = makeRes();
    await handleListWallets(makeReq() as any, res, storageMock as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.wallets[0].lastTransactionAt).toBeNull();
  });

  it('retorna lastTransactionAt para multiplas wallets (cada uma com seu MAX)', async () => {
    const tx1 = new Date('2026-05-18T08:00:00.000Z').toISOString();
    const tx2 = new Date('2026-05-10T15:00:00.000Z').toISOString();
    storageMock.listWalletsByUser.mockResolvedValue([
      {
        id: 'w1',
        userId: 'USER-0001',
        name: 'A',
        platform: 'GGNetwork',
        nativeCurrency: 'USD',
        balance: '100',
        status: 'active',
        lastTransactionAt: tx1,
      },
      {
        id: 'w2',
        userId: 'USER-0001',
        name: 'B',
        platform: 'PokerStars',
        nativeCurrency: 'USD',
        balance: '200',
        status: 'active',
        lastTransactionAt: tx2,
      },
      {
        id: 'w3',
        userId: 'USER-0001',
        name: 'C',
        platform: 'Suprema',
        nativeCurrency: 'BRL',
        balance: '0',
        status: 'active',
        lastTransactionAt: null,
      },
    ]);

    const res = makeRes();
    await handleListWallets(makeReq() as any, res, storageMock as any);

    expect(res.body.wallets).toHaveLength(3);
    expect(res.body.wallets[0].lastTransactionAt).toBe(tx1);
    expect(res.body.wallets[1].lastTransactionAt).toBe(tx2);
    expect(res.body.wallets[2].lastTransactionAt).toBeNull();
  });
});

// ===========================================================================
// Contrato: listWalletsByUser DEVE prover lastTransactionAt
// ===========================================================================

describe('storage.listWalletsByUser — shape inclui lastTransactionAt', () => {
  it('quando storage retorna lastTransactionAt, handler propaga sem mutacao', async () => {
    const exactTimestamp = '2026-05-19T23:59:59.000Z';
    storageMock.listWalletsByUser.mockResolvedValue([
      {
        id: 'w1',
        userId: 'USER-0001',
        name: 'GG',
        platform: 'GGNetwork',
        nativeCurrency: 'USD',
        balance: '100',
        status: 'active',
        lastTransactionAt: exactTimestamp,
      },
    ]);

    const res = makeRes();
    await handleListWallets(makeReq() as any, res, storageMock as any);

    // Handler nao deve normalizar/mutar o timestamp (passa direto).
    expect(res.body.wallets[0].lastTransactionAt).toBe(exactTimestamp);
  });

  it('handler NAO falha se storage omitir lastTransactionAt (campo opcional)', async () => {
    // Cenario: wallet legada sem o campo enriquecido (back-compat).
    storageMock.listWalletsByUser.mockResolvedValue([
      {
        id: 'w-legacy',
        userId: 'USER-0001',
        name: 'Legacy',
        platform: 'PokerStars',
        nativeCurrency: 'USD',
        balance: '50',
        status: 'active',
      },
    ]);

    const res = makeRes();
    await handleListWallets(makeReq() as any, res, storageMock as any);

    expect(res.statusCode).toBe(200);
    // Pode ser undefined OU null — qualquer um eh aceitavel.
    const value = res.body.wallets[0].lastTransactionAt;
    expect(value === undefined || value === null).toBe(true);
  });
});

// ===========================================================================
// includeArchived continua funcionando
// ===========================================================================

describe('GET /api/wallets?includeArchived — sem regressao', () => {
  it('inclui wallets archived com lastTransactionAt quando includeArchived=true', async () => {
    storageMock.listWalletsByUser.mockResolvedValue([
      {
        id: 'w-archived',
        userId: 'USER-0001',
        name: 'Old',
        platform: 'PokerStars',
        nativeCurrency: 'USD',
        balance: '0',
        status: 'archived',
        lastTransactionAt: '2026-01-15T00:00:00.000Z',
      },
    ]);

    const res = makeRes();
    await handleListWallets(
      makeReq({ query: { includeArchived: 'true' } }) as any,
      res,
      storageMock as any,
    );

    expect(res.body.wallets).toHaveLength(1);
    expect(res.body.wallets[0].lastTransactionAt).toBeTruthy();
  });
});
