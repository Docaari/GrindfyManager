/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint D / Grind Live + Tickets cluster
 *   RF-03.1 cron expiracao tickets + RF-03.2 notifs in-app
 *
 * Spec: Docs/specs/sprint-grind-live-cluster.md §RF-03.1 + §RF-03.2
 * ADR:  Docs/architecture/decisions/184-tickets-cron-expiracao-e-notifs.md
 * Diagrama: Docs/architecture/diagrams/sprint-grind-live-cluster/tickets-cron-flow.mermaid
 *
 * Cenarios cobertos:
 *   1) `startCoachCrons()` registra `0 3 * * *` para expire-tickets — SEM gate
 *      por COACH_NUDGES_ENABLED (housekeeping; ADR-184 §2.1).
 *   2) `expireTicketsTick({ now })` UPDATE em batch idempotente (re-run = no-op).
 *   3) INSERT notif `ticket_expiring` quando ticket esta em janela <=48h e ainda
 *      nao expirou (passa do limiar nesse run).
 *   4) INSERT notif `ticket_expired` ao virar `status='expired'`.
 *   5) Dedupe 7d: nao recria notif do mesmo `(user_id, ticket_id, type)` em
 *      menos de 7 dias (`hasRecentNotif`).
 *   6) Telemetria `ticket_expired` em `user_activity` (RF-03.5 / ADR-184 §2.5).
 *   7) Zero wallet side-effect (sem call em createWalletTransaction).
 *   8) Race cron x user "pagar com ticket" — UPDATE guard `AND status='available'`
 *      mais SELECT re-confirmacao pre-fase 4 (ADR-184 §2.7).
 *   9) Advisory lock `cron:expire-tickets` envolvendo tick (ADR-184 §2.1).
 *
 * Lessons aplicadas:
 *   - #3 mocks validados contra storage real (getActiveTicketsByUser shape +
 *     getTicketsByUser filters reais). createNotification mockada com mesma
 *     assinatura de `insertNotification` (storage).
 *   - #9 cada batch envolvido em try/catch granular (verificado: 1 INSERT
 *     falhando NAO bloqueia os outros — `result.errors++`).
 *   - #37 `node-cron` mockado via `vi.doMock` exige import ESTATICO
 *     `import nodeCron from "node-cron"` em cronRunner. Confirmado em
 *     `server/coach/cronRunner.ts:18`.
 *   - #36 modulo `server/jobs/expireTickets.ts` evita import top-level de
 *     `@shared/schema` quando mockar drizzle parcial.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_NUDGES = process.env.COACH_NUDGES_ENABLED;
const ORIGINAL_CRON = process.env.COACH_CRON_ENABLED;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  if (ORIGINAL_NUDGES === undefined) delete process.env.COACH_NUDGES_ENABLED;
  else process.env.COACH_NUDGES_ENABLED = ORIGINAL_NUDGES;
  if (ORIGINAL_CRON === undefined) delete process.env.COACH_CRON_ENABLED;
  else process.env.COACH_CRON_ENABLED = ORIGINAL_CRON;
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  vi.useRealTimers();
  vi.resetModules();
  // Sprint D fix-wave reviewer MEDIUM-1 — vi.doMock('../../server/jobs/expireTickets')
  // do cenario "advisory lock" (linha ~144) persiste no registry do vitest 4
  // mesmo apos `vi.resetModules()`. Sem doUnmock aqui, cenarios 2-9 importavam
  // o spy ao inves do modulo real. Antes vivia em tests/setup.ts (global) —
  // vazava pra 8000+ testes. Agora escopado neste arquivo. Justificativa para
  // modificar test (regra anti-modificar exception): bleed inter-test eh bug
  // de setup, nao logica de teste — analogo a lesson #31 (typo de sintaxe).
  try {
    vi.doUnmock('../../server/jobs/expireTickets');
  } catch {
    // ignore
  }
});

// ---------------------------------------------------------------------------
// Cenario 1 — Cron schedule registrado SEM gate por COACH_NUDGES_ENABLED
// ---------------------------------------------------------------------------
describe('cronRunner — expire-tickets schedule', () => {
  it('registra `0 3 * * *` para expire-tickets MESMO com COACH_NUDGES_ENABLED=false', async () => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    process.env.COACH_CRON_ENABLED = 'true';
    process.env.COACH_NUDGES_ENABLED = 'false';

    const scheduled: string[] = [];
    vi.doMock('node-cron', () => ({
      default: {
        schedule: (expr: string, _fn: any) => {
          scheduled.push(expr);
          return { stop: vi.fn() };
        },
      },
      schedule: (expr: string, _fn: any) => {
        scheduled.push(expr);
        return { stop: vi.fn() };
      },
    }));

    const { startCoachCrons } = await import('../../server/coach/cronRunner');
    startCoachCrons();

    // ADR-184 §2.1 — housekeeping fora do kill switch
    expect(scheduled).toContain('0 3 * * *');
    // cleanup tambem permanece
    expect(scheduled).toContain('* * * * *');
    // nudges nao registrados (porque kill switch ON)
    expect(scheduled).not.toContain('0 * 28 * *');
  });

  it('registra `0 3 * * *` para expire-tickets quando nudges ON', async () => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    process.env.COACH_CRON_ENABLED = 'true';
    delete process.env.COACH_NUDGES_ENABLED;

    const scheduled: string[] = [];
    vi.doMock('node-cron', () => ({
      default: {
        schedule: (expr: string, _fn: any) => {
          scheduled.push(expr);
          return { stop: vi.fn() };
        },
      },
      schedule: (expr: string, _fn: any) => {
        scheduled.push(expr);
        return { stop: vi.fn() };
      },
    }));

    const { startCoachCrons } = await import('../../server/coach/cronRunner');
    startCoachCrons();

    expect(scheduled).toContain('0 3 * * *');
  });

  it('envolve o tick com withAdvisoryLock(`cron:expire-tickets`)', async () => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    process.env.COACH_CRON_ENABLED = 'true';
    delete process.env.COACH_NUDGES_ENABLED;

    const scheduledHandlers: Record<string, () => Promise<void>> = {};
    vi.doMock('node-cron', () => ({
      default: {
        schedule: (expr: string, fn: any) => {
          scheduledHandlers[expr] = fn;
          return { stop: vi.fn() };
        },
      },
      schedule: (expr: string, fn: any) => {
        scheduledHandlers[expr] = fn;
        return { stop: vi.fn() };
      },
    }));

    const lockCalls: Array<{ key: string }> = [];
    vi.doMock('../../server/lib/advisoryLock', () => ({
      withAdvisoryLock: async (key: string, fn: any) => {
        lockCalls.push({ key });
        await fn();
      },
    }));

    const tickSpy = vi.fn(async () => ({ expired: 0, notif_expiring: 0, notif_expired: 0, errors: 0 }));
    vi.doMock('../../server/jobs/expireTickets', () => ({
      expireTicketsTick: tickSpy,
    }));

    const { startCoachCrons } = await import('../../server/coach/cronRunner');
    startCoachCrons();

    const handler = scheduledHandlers['0 3 * * *'];
    expect(handler).toBeDefined();
    await handler!();

    expect(lockCalls.some((c) => c.key === 'cron:expire-tickets')).toBe(true);
    expect(tickSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cenario 2-9 — expireTicketsTick comportamento
// ---------------------------------------------------------------------------
describe('expireTicketsTick — pipeline', () => {
  const NOW = new Date('2026-05-22T03:00:00Z');

  function setupMocks(opts: {
    expiringSoon?: any[];
    justExpired?: any[];
    updateCount?: number;
    recentNotifByKey?: Record<string, boolean>;
    insertNotificationImpl?: (n: any) => Promise<any>;
  } = {}) {
    const getExpiringSoon = vi.fn(async () => opts.expiringSoon ?? []);
    const getJustExpired = vi.fn(async () => opts.justExpired ?? []);
    const markTicketsExpired = vi.fn(async () => opts.updateCount ?? (opts.justExpired?.length ?? 0));
    const reconfirmExpired = vi.fn(async (ids: string[]) => ids); // race protection — default sem perdas
    const hasRecentNotif = vi.fn(async (userId: string, ticketId: string, type: string) => {
      const key = `${userId}|${ticketId}|${type}`;
      return opts.recentNotifByKey?.[key] === true;
    });
    const createNotification = vi.fn(opts.insertNotificationImpl ?? (async (n: any) => ({ id: 'notif-' + Math.random().toString(36).slice(2, 8), ...n })));
    const recordUserActivity = vi.fn(async () => ({ id: 'ua-1' }));
    const createWalletTransaction = vi.fn();

    vi.doMock('../../server/storage', () => ({
      storage: {
        // shape RF-03.1 ADR-184 §2.2 — exigidos pelo job
        getTicketsExpiringSoon: getExpiringSoon, // janela ]now, now+48h]
        getTicketsJustExpired: getJustExpired,   // expires_at <= now AND status='available'
        markTicketsExpired,
        reconfirmExpiredTicketIds: reconfirmExpired, // race-protection §2.7
        hasRecentTicketNotif: hasRecentNotif,
        createNotification,
        recordUserActivity,
        // guard cenario 7: NUNCA chamado pelo job
        createWalletTransaction,
      },
    }));

    return {
      getExpiringSoon,
      getJustExpired,
      markTicketsExpired,
      reconfirmExpired,
      hasRecentNotif,
      createNotification,
      recordUserActivity,
      createWalletTransaction,
    };
  }

  // ---------- Cenario 2 — idempotencia ----------
  it('re-run no mesmo dia eh no-op (result.expired=0, result.notif_*=0)', async () => {
    vi.resetModules();
    const mocks = setupMocks({
      expiringSoon: [],
      justExpired: [],
      updateCount: 0,
    });
    const { expireTicketsTick } = await import('../../server/jobs/expireTickets');
    const result = await expireTicketsTick({ now: NOW });

    expect(result.expired).toBe(0);
    expect(result.notif_expiring).toBe(0);
    expect(result.notif_expired).toBe(0);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  // ---------- Cenario 3 — INSERT ticket_expiring ----------
  it('cria notif `ticket_expiring` para ticket em janela <=48h', async () => {
    vi.resetModules();
    const expiring = [{
      id: 't-1',
      userId: 'USER-AA',
      sourceName: 'Sunday Million',
      valueUsd: '215',
      expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000), // +24h
    }];
    const mocks = setupMocks({ expiringSoon: expiring, justExpired: [], updateCount: 0 });
    const { expireTicketsTick } = await import('../../server/jobs/expireTickets');
    const result = await expireTicketsTick({ now: NOW });

    expect(result.notif_expiring).toBe(1);
    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
    const arg = mocks.createNotification.mock.calls[0][0];
    expect(arg.userId).toBe('USER-AA');
    expect(arg.type).toBe('ticket_expiring');
    expect(arg.priority).toBe('medium');
    // deep_link carrega ticket_id (dedupe via LIKE — ADR-184 §2.3)
    expect(String(arg.deepLink ?? arg.deep_link ?? '')).toContain('ticket_id=t-1');
  });

  // ---------- Cenario 4 — INSERT ticket_expired ----------
  it('cria notif `ticket_expired` + UPDATE status=expired', async () => {
    vi.resetModules();
    const justExpired = [{
      id: 't-2',
      userId: 'USER-BB',
      sourceName: 'Qualifier WSOP',
      valueUsd: '50',
      expiresAt: new Date(NOW.getTime() - 3600 * 1000), // -1h
    }];
    const mocks = setupMocks({ expiringSoon: [], justExpired, updateCount: 1 });
    const { expireTicketsTick } = await import('../../server/jobs/expireTickets');
    const result = await expireTicketsTick({ now: NOW });

    expect(result.expired).toBe(1);
    expect(result.notif_expired).toBe(1);
    expect(mocks.markTicketsExpired).toHaveBeenCalledTimes(1);
    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
    const arg = mocks.createNotification.mock.calls[0][0];
    expect(arg.type).toBe('ticket_expired');
  });

  // ---------- Cenario 5 — dedupe 7d ----------
  it('dedupe 7d — NAO recria notif quando hasRecentTicketNotif retorna true', async () => {
    vi.resetModules();
    const expiring = [{
      id: 't-3',
      userId: 'USER-CC',
      sourceName: 'X',
      valueUsd: '30',
      expiresAt: new Date(NOW.getTime() + 6 * 60 * 60 * 1000),
    }];
    const mocks = setupMocks({
      expiringSoon: expiring,
      justExpired: [],
      updateCount: 0,
      recentNotifByKey: { 'USER-CC|t-3|ticket_expiring': true },
    });
    const { expireTicketsTick } = await import('../../server/jobs/expireTickets');
    const result = await expireTicketsTick({ now: NOW });

    expect(mocks.hasRecentNotif).toHaveBeenCalled();
    expect(result.notif_expiring).toBe(0);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  // ---------- Cenario 6 — telemetria ticket_expired ----------
  it('registra evento `ticket_expired` em user_activity (RF-03.5)', async () => {
    vi.resetModules();
    const justExpired = [{
      id: 't-4',
      userId: 'USER-DD',
      sourceName: 'Daily',
      valueUsd: '10',
      expiresAt: new Date(NOW.getTime() - 60 * 1000),
    }];
    const mocks = setupMocks({ expiringSoon: [], justExpired, updateCount: 1 });
    const { expireTicketsTick } = await import('../../server/jobs/expireTickets');
    await expireTicketsTick({ now: NOW });

    expect(mocks.recordUserActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'USER-DD',
        eventType: 'ticket_expired',
      }),
    );
    const arg = mocks.recordUserActivity.mock.calls[0][0];
    expect(arg.payload?.ticket_id ?? arg.payload?.ticketId).toBe('t-4');
  });

  // ---------- Cenario 7 — zero wallet side-effect ----------
  it('NUNCA invoca createWalletTransaction (housekeeping puro)', async () => {
    vi.resetModules();
    const mocks = setupMocks({
      justExpired: [{ id: 't-x', userId: 'USER-EE', sourceName: 'Y', valueUsd: '5', expiresAt: NOW }],
      updateCount: 1,
    });
    const { expireTicketsTick } = await import('../../server/jobs/expireTickets');
    await expireTicketsTick({ now: NOW });
    expect(mocks.createWalletTransaction).not.toHaveBeenCalled();
  });

  // ---------- Cenario 8 — race protection ----------
  it('race: user usou ticket DURANTE o tick — reconfirmExpiredTicketIds remove o id antes do INSERT', async () => {
    vi.resetModules();
    const justExpired = [
      { id: 't-race-1', userId: 'USER-FF', sourceName: 'A', valueUsd: '10', expiresAt: NOW },
      { id: 't-race-2', userId: 'USER-FF', sourceName: 'B', valueUsd: '20', expiresAt: NOW },
    ];
    const mocks = setupMocks({ expiringSoon: [], justExpired, updateCount: 1 });
    // Simula que t-race-1 virou 'used' (entre SELECT e UPDATE) e NAO esta mais expirado
    mocks.reconfirmExpired.mockResolvedValueOnce(['t-race-2']);
    const { expireTicketsTick } = await import('../../server/jobs/expireTickets');
    const result = await expireTicketsTick({ now: NOW });

    expect(mocks.reconfirmExpired).toHaveBeenCalled();
    // Apenas t-race-2 gera notif (race protection §2.7)
    expect(result.notif_expired).toBe(1);
    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
    const arg = mocks.createNotification.mock.calls[0][0];
    expect(String(arg.deepLink ?? arg.deep_link ?? '')).toContain('ticket_id=t-race-2');
  });

  // ---------- Cenario 9 — erro em 1 INSERT nao trava os outros (lesson #9) ----------
  it('erro em 1 INSERT (lesson #9) — errors++, demais continuam', async () => {
    vi.resetModules();
    const justExpired = [
      { id: 't-ok', userId: 'USER-GG', sourceName: 'A', valueUsd: '10', expiresAt: NOW },
      { id: 't-fail', userId: 'USER-GG', sourceName: 'B', valueUsd: '20', expiresAt: NOW },
    ];
    const mocks = setupMocks({
      expiringSoon: [],
      justExpired,
      updateCount: 2,
      insertNotificationImpl: async (n: any) => {
        if (String(n.deepLink ?? n.deep_link ?? '').includes('t-fail')) {
          throw new Error('boom');
        }
        return { id: 'notif-' + Math.random().toString(36).slice(2, 8), ...n };
      },
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { expireTicketsTick } = await import('../../server/jobs/expireTickets');
    const result = await expireTicketsTick({ now: NOW });

    expect(result.notif_expired).toBe(1);
    expect(result.errors).toBeGreaterThanOrEqual(1);
    // 2 tentativas, 1 sucesso, 1 erro
    expect(mocks.createNotification).toHaveBeenCalledTimes(2);
    errSpy.mockRestore();
  });
});
