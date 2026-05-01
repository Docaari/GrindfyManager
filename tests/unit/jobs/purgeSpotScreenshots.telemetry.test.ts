/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint F2 — W4: Telemetria do cron de purge (RF-Telemetria
 * `spot.expired_purged`).
 *
 * Spec : Docs/specs/sprint-f2-spot-screenshots.md (Telemetria — spot.expired_purged)
 * Flow : Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 3)
 *
 * Lessons aplicadas:
 *   #3  shape REAL — PurgeRow do storage.listSpotsForPurge
 *   #9  Try/catch nao engole erro — log antes de fallback (ENOENT warn vs DB error)
 *
 * NOTA: backend nao usa adapter `track()` client-side. Em vez disso, emite
 * `console.info("spot.expired_purged", payload)` log estruturado, conforme
 * pattern ja vigente em `console.info("spot.purge.summary", summary)` no
 * registerSpotScreenshotsCron (linha ~119). W4 acrescenta evento separado
 * `spot.expired_purged` com payload telemetria { purgedCount, errorCount,
 * durationMs } — distinto do log "summary" interno.
 *
 * Decisao: como `purgeSpotScreenshots()` retorna `PurgeSummary` para o caller
 * decidir o que fazer, o emit `spot.expired_purged` PODE ocorrer:
 *   (a) dentro da funcao `purgeSpotScreenshots()` antes de retornar, OU
 *   (b) no `registerSpotScreenshotsCron()` apos `await purgeSpotScreenshots()`.
 *
 * Spec deixa em aberto. Decisao do test: aceitar ambos — verificar que o emit
 * acontece exatamente UMA vez por execucao da funcao pura, com payload completo.
 * Implementer (W4 green) escolhe onde por; o teste apenas checa o sinal.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks (mesmo pattern de purgeSpotScreenshots.test.ts)
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    listSpotsForPurge: vi.fn(),
    deleteStarredHand: vi.fn(),
  },
}));

vi.mock('../../../server/lib/spotStorage', () => ({
  spotStorage: {
    delete: vi.fn(),
  },
}));

import { purgeSpotScreenshots } from '../../../server/jobs/purgeSpotScreenshots';
import { storage } from '../../../server/storage';
import { spotStorage } from '../../../server/lib/spotStorage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.listSpotsForPurge as any).mockResolvedValue([]);
  (storage.deleteStarredHand as any).mockResolvedValue(undefined);
  (spotStorage.delete as any).mockResolvedValue(undefined);
});

// Helper: encontra a chamada console.info com event 'spot.expired_purged'.
// Aceita 2 formatos:
//   console.info("spot.expired_purged", { purgedCount, errorCount, durationMs })
//   console.info({ event: "spot.expired_purged", purgedCount, ... })
function findExpiredPurgedCall(infoSpy: any): any {
  return infoSpy.mock.calls.find((args: any[]) => {
    const flat = JSON.stringify(args);
    return /spot\.expired_purged/.test(flat);
  });
}

// =============================================================================
// Cenario PT1: spot.expired_purged emit ao final do cron (run com purges)
// Cobre RF-Telemetria: "spot.expired_purged | Cron remove row expirada |
// { count, durationMs, errorCount }" (spec usa { purgedCount } no summary)
// =============================================================================

describe('purgeSpotScreenshots() — telemetria spot.expired_purged (W4)', () => {
  it('emit "spot.expired_purged" via console.info ao final do run com purges', async () => {
    // Cobre RF-Telemetria: cron emite evento estruturado para dashboards.
    (storage.listSpotsForPurge as any).mockImplementation(async (opts: any) => {
      if (opts?.kind === 'expired') {
        return [
          { id: 'sh_1', imageUrl: '/uploads/spot-screenshots/1.png' },
          { id: 'sh_2', imageUrl: '/uploads/spot-screenshots/2.png' },
        ];
      }
      return [];
    });

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await purgeSpotScreenshots();

    const call = findExpiredPurgedCall(infoSpy);
    expect(call).toBeDefined();

    infoSpy.mockRestore();
  });

  it('payload contem purgedCount, errorCount e durationMs', async () => {
    // Cobre RF-Telemetria payload shape (specta dashboard taxa expirados)
    (storage.listSpotsForPurge as any).mockImplementation(async (opts: any) => {
      if (opts?.kind === 'expired') {
        return [{ id: 'sh_1', imageUrl: '/uploads/spot-screenshots/1.png' }];
      }
      return [];
    });

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await purgeSpotScreenshots();

    const call = findExpiredPurgedCall(infoSpy);
    expect(call).toBeDefined();

    // Procura o payload (objeto) entre os args — pode ser arg[1] ou arg[0]
    // dependendo de qual formato o implementer escolher.
    const payload = call!.find(
      (a: any) =>
        a &&
        typeof a === 'object' &&
        ('purgedCount' in a || 'count' in a),
    );
    expect(payload).toBeDefined();
    expect(typeof payload.purgedCount === 'number' || typeof payload.count === 'number').toBe(true);
    expect(typeof payload.errorCount).toBe('number');
    expect(typeof payload.durationMs).toBe('number');
    expect(payload.durationMs).toBeGreaterThanOrEqual(0);

    infoSpy.mockRestore();
  });

  it('emit acontece UMA UNICA VEZ por run (idempotencia em mesma execucao)', async () => {
    // Cobre garantia: nao emite uma vez por row purgada (so um summary final).
    (storage.listSpotsForPurge as any).mockImplementation(async (opts: any) => {
      if (opts?.kind === 'expired') {
        return [
          { id: 'sh_1', imageUrl: '/uploads/spot-screenshots/1.png' },
          { id: 'sh_2', imageUrl: '/uploads/spot-screenshots/2.png' },
          { id: 'sh_3', imageUrl: '/uploads/spot-screenshots/3.png' },
        ];
      }
      return [];
    });

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await purgeSpotScreenshots();

    const calls = infoSpy.mock.calls.filter((args: any[]) => {
      const flat = JSON.stringify(args);
      return /spot\.expired_purged/.test(flat);
    });
    expect(calls.length).toBe(1);

    infoSpy.mockRestore();
  });

  it('emit acontece mesmo quando NAO ha rows para purgar (run silencioso)', async () => {
    // Cobre garantia: dashboards precisam saber que cron rodou e nao achou nada
    // (signal de saude). Spec implicita: durationMs sempre presente.
    (storage.listSpotsForPurge as any).mockResolvedValue([]);

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const summary = await purgeSpotScreenshots();
    expect(summary.purgedCount).toBe(0);

    const call = findExpiredPurgedCall(infoSpy);
    expect(call).toBeDefined();

    infoSpy.mockRestore();
  });
});

// =============================================================================
// Cenario PT2: payload reflete contagem em runs com erros parciais
// Cobre RF-06: "Falha de unlink nao trava o cron" + telemetria
// =============================================================================

describe('purgeSpotScreenshots() — telemetria reflete erros parciais', () => {
  it('errorCount > 0 quando DB falha em delete row', async () => {
    (storage.listSpotsForPurge as any).mockImplementation(async (opts: any) => {
      if (opts?.kind === 'expired') {
        return [
          { id: 'sh_a', imageUrl: '/uploads/spot-screenshots/a.png' },
          { id: 'sh_b', imageUrl: '/uploads/spot-screenshots/b.png' },
        ];
      }
      return [];
    });
    let counter = 0;
    (storage.deleteStarredHand as any).mockImplementation(async () => {
      counter++;
      if (counter === 2) throw new Error('DB connection timeout');
    });

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await purgeSpotScreenshots();

    const call = findExpiredPurgedCall(infoSpy);
    expect(call).toBeDefined();
    const payload = call!.find(
      (a: any) =>
        a &&
        typeof a === 'object' &&
        ('purgedCount' in a || 'count' in a),
    );
    const purged = payload.purgedCount ?? payload.count;
    expect(purged).toBe(1);
    expect(payload.errorCount).toBe(1);

    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
