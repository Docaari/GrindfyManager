/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint Fase D #5 (Stop-loss cold-commit)
 *
 * Spec: Docs/specs/sprint-fase-d-stop-loss-2026-06-02.md (RF-04)
 * ADR:  Docs/architecture/decisions/235-fase-d-stop-loss-cold-commit.md (D-1, D-4, D-7)
 *
 * Estende PUT /api/user-settings/stops (handlePutUserSettingsStops em server/routes/auth.ts)
 * com a TRAVA DE EDIÇÃO QUENTE:
 *   - "Quente" = listGrindSessionsByUser(userId).some(s => s.status === 'active').
 *   - Re-consulta settings + sessões NO momento do write (anti-race do edge case).
 *   - stopLossUsd presente + quente + (aumentar OU -> null) -> 409 STOP_LOOSEN_BLOCKED, NÃO escreve.
 *   - apertar / criar (null->valor) / sem-sessão-ativa -> 200, upsertUserSettings chamado.
 *   - Trava NÃO afeta stopWinUsd nem stopLockDurationHours.
 *   - Back-compat: PUT sem sessão ativa = caminho idêntico ao atual.
 *
 * Lessons:
 *   - #3 mock no SHAPE REAL: getUserSettings.stopLossUsd é DECIMAL-STRING ('300');
 *        listGrindSessionsByUser retorna GrindSession[] com .status ('active'|'completed'|...).
 *   - #28 mockar storage por path: exportar TUDO que o handler importa
 *        (getUserSettings, upsertUserSettings, listGrindSessionsByUser).
 *
 * RED esperado: o handler atual NÃO consulta listGrindSessionsByUser e NUNCA retorna 409;
 *   logo os testes de "afrouxar quente -> 409" falham (recebem 200). Os de back-compat
 *   (sem sessão ativa) já passam — documentado abaixo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const stopServiceMock = {
  assertNotStopLocked: vi.fn(),
  evaluateStops: vi.fn(),
  getCurrentDayDeltaUsd: vi.fn(),
  releaseLock: vi.fn(),
};

vi.mock('../../../server/services/stopService', () => ({
  stopService: stopServiceMock,
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    upsertUserSettings: vi.fn(),
    listGrindSessionsByUser: vi.fn(),
  },
}));

import { handlePutUserSettingsStops } from '../../../server/routes/auth';
import { storage } from '../../../server/storage';

// SHAPE REAL de GrindSession: tem .status (e .userId, .date etc.). Aqui só o que o handler lê.
function grindSession(status: string, extra: any = {}) {
  return {
    id: 'GS-' + status,
    userId: 'USER-0001',
    status,
    date: new Date('2026-06-02T00:00:00Z'),
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // SHAPE REAL: stopLossUsd vem como decimal-string do pg numeric.
  (storage.getUserSettings as any).mockResolvedValue({
    bankrollManagementEnabled: true,
    stopLossUsd: '300',
    stopWinUsd: '500',
    stopLockUntil: null,
    stopLockDurationHours: 12,
  });
  // Default: NENHUMA sessão ativa (a frio).
  (storage.listGrindSessionsByUser as any).mockResolvedValue([
    grindSession('completed'),
  ]);
  (storage.upsertUserSettings as any).mockResolvedValue({});
  stopServiceMock.getCurrentDayDeltaUsd.mockResolvedValue(-50);
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

describe('PUT stops — A FRIO (sem sessão ativa): edição sempre livre [back-compat]', () => {
  beforeEach(() => {
    (storage.listGrindSessionsByUser as any).mockResolvedValue([
      grindSession('completed'),
      grindSession('cancelled'),
    ]);
  });

  it('afrouxar (aumentar) a frio -> 200, escreve', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ body: { stopLossUsd: 600 } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(storage.upsertUserSettings).toHaveBeenCalled();
  });

  it('apertar (diminuir) a frio -> 200, escreve', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ body: { stopLossUsd: 100 } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(storage.upsertUserSettings).toHaveBeenCalled();
  });

  it('remover (-> null) a frio -> 200, escreve', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ body: { stopLossUsd: null } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(storage.upsertUserSettings).toHaveBeenCalled();
  });
});

describe('PUT stops — QUENTE (sessão status="active"): trava RF-04', () => {
  beforeEach(() => {
    (storage.listGrindSessionsByUser as any).mockResolvedValue([
      grindSession('completed'),
      grindSession('active'),
    ]);
  });

  it('afrouxar (aumentar 300 -> 600) quente -> 409 STOP_LOOSEN_BLOCKED, NÃO escreve', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ body: { stopLossUsd: 600 } }) as any, res);
    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe('STOP_LOOSEN_BLOCKED');
    expect(typeof res.body?.message).toBe('string');
    expect(storage.upsertUserSettings).not.toHaveBeenCalled();
  });

  it('remover (300 -> null) quente -> 409 STOP_LOOSEN_BLOCKED, NÃO escreve', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ body: { stopLossUsd: null } }) as any, res);
    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe('STOP_LOOSEN_BLOCKED');
    expect(storage.upsertUserSettings).not.toHaveBeenCalled();
  });

  it('apertar (300 -> 100) quente -> 200, escreve', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ body: { stopLossUsd: 100 } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(storage.upsertUserSettings).toHaveBeenCalled();
  });

  it('criar (null -> valor) quente -> 200, escreve (criar proteção é OK)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLossUsd: null,
      stopWinUsd: '500',
      stopLockUntil: null,
      stopLockDurationHours: 12,
    });
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ body: { stopLossUsd: 200 } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(storage.upsertUserSettings).toHaveBeenCalled();
  });

  it('igual (300 -> 300) quente -> 200 (no-op permitido)', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ body: { stopLossUsd: 300 } }) as any, res);
    expect(res.statusCode).toBe(200);
  });

  it('re-consulta listGrindSessionsByUser no momento do write (anti-race)', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ body: { stopLossUsd: 600 } }) as any, res);
    expect(storage.listGrindSessionsByUser).toHaveBeenCalledWith('USER-0001');
  });
});

describe('PUT stops — trava NÃO afeta outros campos (RF-04 AC)', () => {
  beforeEach(() => {
    (storage.listGrindSessionsByUser as any).mockResolvedValue([grindSession('active')]);
  });

  it('quente + só stopWinUsd no body (sem stopLossUsd) -> 200, escreve', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ body: { stopWinUsd: 9999 } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(storage.upsertUserSettings).toHaveBeenCalled();
  });

  it('quente + só stopLockDurationHours no body -> 200, escreve', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ body: { stopLockDurationHours: 24 } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(storage.upsertUserSettings).toHaveBeenCalled();
  });

  it('quente + aumentar stopWinUsd (afrouxar WIN, fora do escopo) -> 200 (só loss trava)', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(
      makeReq({ body: { stopWinUsd: 99999, stopLossUsd: 100 } }) as any, // loss APERTANDO
      res,
    );
    expect(res.statusCode).toBe(200);
  });
});

describe('PUT stops — validação e auth (preservados)', () => {
  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('stopLossUsd negativo -> 400 (validação ANTES da trava)', async () => {
    (storage.listGrindSessionsByUser as any).mockResolvedValue([grindSession('active')]);
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ body: { stopLossUsd: -50 } }) as any, res);
    expect(res.statusCode).toBe(400);
    expect(storage.upsertUserSettings).not.toHaveBeenCalled();
  });

  it('stopLossUsd ausente do body (undefined) -> nunca bloqueia (não mexe no loss)', async () => {
    (storage.listGrindSessionsByUser as any).mockResolvedValue([grindSession('active')]);
    const res = makeRes();
    await handlePutUserSettingsStops(makeReq({ body: { stopWinUsd: 1000 } }) as any, res);
    expect(res.statusCode).toBe(200);
  });
});
