import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint F2 — Cron de purge de spot screenshots
//
// Spec : Docs/specs/sprint-f2-spot-screenshots.md (RF-06)
// ADR  : Docs/architecture/decisions/053-spot-screenshots-cron.md
// Sequence: Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 3)
//
// Modulo NAO existe ainda — Implementer cria em
// server/jobs/purgeSpotScreenshots.ts:
//   export async function purgeSpotScreenshots(deps?): Promise<PurgeSummary>
//   export function registerSpotScreenshotsCron(): void
//
// PurgeSummary = { purgedCount: number, errorCount: number, durationMs: number }
//
// Esta suite testa SOMENTE a funcao pura `purgeSpotScreenshots()`. O scheduler
// (cron.schedule trigger) NAO eh testado — ADR-053: "Sem teste para o
// cron.schedule em si — lib confiavel; testar trigger eh redundante."
//
// Lessons aplicadas:
//   #9 Try/catch generico engole erros: log antes de fallback. ENOENT (warn),
//      DB error (error log + errorCount++).
//   #3 Mocks idealizados — shape do storage validado contra ADR-053 detalhes-chave.
// =============================================================================

// -----------------------------------------------------------------------------
// Mocks — server/storage e server/lib/spotStorage
// -----------------------------------------------------------------------------

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

// Imports DEPOIS dos mocks — modulo NAO existe ainda.
import { purgeSpotScreenshots } from '../../../server/jobs/purgeSpotScreenshots';
import { storage } from '../../../server/storage';
import { spotStorage } from '../../../server/lib/spotStorage';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: listSpotsForPurge retorna array vazio (override em cada teste).
  (storage.listSpotsForPurge as any).mockResolvedValue([]);
  (storage.deleteStarredHand as any).mockResolvedValue(undefined);
  (spotStorage.delete as any).mockResolvedValue(undefined);
});

// =============================================================================
// Shape do retorno — PurgeSummary
// =============================================================================

describe('purgeSpotScreenshots() — retorno (PurgeSummary shape)', () => {
  it('retorna { purgedCount, errorCount, durationMs } com nada para purgar', async () => {
    // Cobre ADR-053: "Retorna { purged: number, errors: number } para telemetria"
    // (spec usa { purgedCount, errorCount, durationMs })
    const summary = await purgeSpotScreenshots();
    expect(summary).toBeDefined();
    expect(typeof summary.purgedCount).toBe('number');
    expect(typeof summary.errorCount).toBe('number');
    expect(typeof summary.durationMs).toBe('number');
    expect(summary.purgedCount).toBe(0);
    expect(summary.errorCount).toBe(0);
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Where clause — listSpotsForPurge filtros
// =============================================================================

describe('purgeSpotScreenshots() — criterios SQL (listSpotsForPurge)', () => {
  it('chama storage.listSpotsForPurge para "discarded" (qualquer idade)', async () => {
    // Cobre RF-06: "status='discarded' (qualquer idade) -> hard delete row + unlink arquivo"
    await purgeSpotScreenshots();
    const calls = (storage.listSpotsForPurge as any).mock.calls;
    const flat = JSON.stringify(calls);
    expect(flat).toContain('discarded');
  });

  it('chama storage.listSpotsForPurge para "expired" (status=pending + expired + nao reviewLater + nao reviewed)', async () => {
    // Cobre RF-06 / Sequence FLUXO 3:
    // "WHERE status='pending' AND expiresAt < NOW() AND reviewedAt IS NULL
    //  AND reviewLater = false"
    await purgeSpotScreenshots();
    const calls = (storage.listSpotsForPurge as any).mock.calls;
    const flat = JSON.stringify(calls);
    expect(flat).toContain('expired');
  });
});

// =============================================================================
// Loop por row — comportamento normal
// =============================================================================

describe('purgeSpotScreenshots() — purga discarded e expired (happy path)', () => {
  it('purga rows discarded: spotStorage.delete + storage.deleteStarredHand', async () => {
    // Cobre RF-06 AC: "Row com expiresAt no passado e nao revisada eh purgada
    // (row + file)" (variante para discarded)
    (storage.listSpotsForPurge as any).mockImplementation(async (opts: any) => {
      if (opts?.kind === 'discarded') {
        return [{ id: 'sh_1', imageUrl: '/uploads/spot-screenshots/abc.png' }];
      }
      return [];
    });

    const summary = await purgeSpotScreenshots();
    expect(summary.purgedCount).toBe(1);
    expect(summary.errorCount).toBe(0);
    expect(spotStorage.delete).toHaveBeenCalledWith('/uploads/spot-screenshots/abc.png');
    expect(storage.deleteStarredHand).toHaveBeenCalled();
  });

  it('purga rows expired: spotStorage.delete + storage.deleteStarredHand', async () => {
    // Cobre RF-06 AC: "Row com expiresAt no passado e nao revisada eh purgada"
    (storage.listSpotsForPurge as any).mockImplementation(async (opts: any) => {
      if (opts?.kind === 'expired') {
        return [
          { id: 'sh_2', imageUrl: '/uploads/spot-screenshots/def.png' },
          { id: 'sh_3', imageUrl: '/uploads/spot-screenshots/ghi.png' },
        ];
      }
      return [];
    });

    const summary = await purgeSpotScreenshots();
    expect(summary.purgedCount).toBe(2);
    expect(spotStorage.delete).toHaveBeenCalledTimes(2);
    expect(storage.deleteStarredHand).toHaveBeenCalledTimes(2);
  });

  it('purga AMBOS discarded e expired no mesmo run (combina os arrays)', async () => {
    (storage.listSpotsForPurge as any).mockImplementation(async (opts: any) => {
      if (opts?.kind === 'discarded') {
        return [{ id: 'sh_d1', imageUrl: '/uploads/spot-screenshots/d1.png' }];
      }
      if (opts?.kind === 'expired') {
        return [
          { id: 'sh_e1', imageUrl: '/uploads/spot-screenshots/e1.png' },
          { id: 'sh_e2', imageUrl: '/uploads/spot-screenshots/e2.png' },
        ];
      }
      return [];
    });

    const summary = await purgeSpotScreenshots();
    expect(summary.purgedCount).toBe(3);
    expect(summary.errorCount).toBe(0);
  });
});

// =============================================================================
// Idempotencia — re-execucao no mesmo run
// =============================================================================

describe('purgeSpotScreenshots() — idempotencia', () => {
  it('rodar 2x consecutivo: segunda execucao retorna purgedCount=0', async () => {
    // Cobre RF-06 AC: "Idempotente: re-execucao no mesmo dia eh segura"
    // Primeira call: array nao-vazio. Segunda: array vazio (rows ja deletadas).
    let callCount = 0;
    (storage.listSpotsForPurge as any).mockImplementation(async (opts: any) => {
      callCount++;
      // Primeiras 2 chamadas (discarded + expired do run 1) retornam dados
      if (callCount <= 2) {
        return opts?.kind === 'discarded'
          ? [{ id: 'sh_1', imageUrl: '/uploads/spot-screenshots/x.png' }]
          : [];
      }
      // Run 2 — todas vazias
      return [];
    });

    const first = await purgeSpotScreenshots();
    expect(first.purgedCount).toBe(1);

    const second = await purgeSpotScreenshots();
    expect(second.purgedCount).toBe(0);
    expect(second.errorCount).toBe(0);
  });
});

// =============================================================================
// Erro handling — ENOENT (arquivo ja sumiu)
// =============================================================================

describe('purgeSpotScreenshots() — ENOENT em fs.unlink (arquivo ja sumiu)', () => {
  it('NAO trava o cron: deleta row mesmo assim, loga warning, NAO incrementa errorCount', async () => {
    // Cobre RF-06 AC: "Erro de unlink (arquivo ja sumiu) eh logado mas nao
    // bloqueia delete da row" + ADR-053 lesson #9 distinction "ENOENT (warn)"
    const enoentErr: any = new Error('ENOENT: no such file');
    enoentErr.code = 'ENOENT';
    (storage.listSpotsForPurge as any).mockImplementation(async (opts: any) => {
      if (opts?.kind === 'expired') {
        return [{ id: 'sh_orphan', imageUrl: '/uploads/spot-screenshots/missing.png' }];
      }
      return [];
    });
    (spotStorage.delete as any).mockRejectedValue(enoentErr);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const summary = await purgeSpotScreenshots();

    // Row foi deletada mesmo com ENOENT
    expect(storage.deleteStarredHand).toHaveBeenCalled();
    // ENOENT NAO incrementa errorCount (eh esperado/benigno)
    expect(summary.errorCount).toBe(0);
    // Warn foi logado
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

// =============================================================================
// Erro handling — DB error (atomicity: row primeiro, depois unlink)
// =============================================================================

describe('purgeSpotScreenshots() — erro de DB (storage.deleteStarredHand)', () => {
  it('errorCount incrementa quando DB falha em delete row', async () => {
    // Cobre ADR-053: "Outros erros (EACCES, DB error): error log + errorCount++"
    (storage.listSpotsForPurge as any).mockImplementation(async (opts: any) => {
      if (opts?.kind === 'expired') {
        return [
          { id: 'sh_ok', imageUrl: '/uploads/spot-screenshots/ok.png' },
          { id: 'sh_fail', imageUrl: '/uploads/spot-screenshots/fail.png' },
        ];
      }
      return [];
    });

    let callCount = 0;
    (storage.deleteStarredHand as any).mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error('DB connection timeout');
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const summary = await purgeSpotScreenshots();
    expect(summary.purgedCount).toBe(1);
    expect(summary.errorCount).toBe(1);
    // Error logado antes de fallback (lesson #9)
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('try/catch granular por row: 1 erro nao trava o loop inteiro', async () => {
    // Cobre ADR-053: "Try/catch por row (loop nao para inteiro por 1 erro)"
    (storage.listSpotsForPurge as any).mockImplementation(async (opts: any) => {
      if (opts?.kind === 'expired') {
        return [
          { id: 'sh_a', imageUrl: '/uploads/spot-screenshots/a.png' },
          { id: 'sh_b', imageUrl: '/uploads/spot-screenshots/b.png' },
          { id: 'sh_c', imageUrl: '/uploads/spot-screenshots/c.png' },
        ];
      }
      return [];
    });
    let counter = 0;
    (storage.deleteStarredHand as any).mockImplementation(async () => {
      counter++;
      if (counter === 2) throw new Error('Conn reset');
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const summary = await purgeSpotScreenshots();
    // 3 rows tentadas: 1ª e 3ª passam, 2ª erra
    expect(summary.purgedCount).toBe(2);
    expect(summary.errorCount).toBe(1);

    errorSpy.mockRestore();
  });
});

// =============================================================================
// Atomicity — row primeiro, depois unlink (ou ordem inversa segura)
// =============================================================================

describe('purgeSpotScreenshots() — atomicity', () => {
  it('NAO apaga arquivo quando ha imageUrl=null (row sem imagem)', async () => {
    // Defesa contra spotStorage.delete(null) — algumas rows legadas (back-fill
    // do cooldown classico) tem imageUrl null.
    (storage.listSpotsForPurge as any).mockImplementation(async (opts: any) => {
      if (opts?.kind === 'discarded') {
        return [{ id: 'sh_legacy', imageUrl: null }];
      }
      return [];
    });

    const summary = await purgeSpotScreenshots();
    // Row deletada mesmo sem imagem
    expect(storage.deleteStarredHand).toHaveBeenCalled();
    // spotStorage.delete NAO chamado pq nao ha arquivo
    expect(spotStorage.delete).not.toHaveBeenCalled();
    expect(summary.purgedCount).toBe(1);
  });
});

// =============================================================================
// Telemetria summary
// =============================================================================

describe('purgeSpotScreenshots() — telemetria summary', () => {
  it('durationMs eh um numero >= 0', async () => {
    const summary = await purgeSpotScreenshots();
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(summary.durationMs)).toBe(true);
  });

  it('purgedCount + errorCount = total de rows tentadas', async () => {
    (storage.listSpotsForPurge as any).mockImplementation(async (opts: any) => {
      if (opts?.kind === 'expired') {
        return [
          { id: 'sh_1', imageUrl: '/uploads/spot-screenshots/1.png' },
          { id: 'sh_2', imageUrl: '/uploads/spot-screenshots/2.png' },
          { id: 'sh_3', imageUrl: '/uploads/spot-screenshots/3.png' },
          { id: 'sh_4', imageUrl: '/uploads/spot-screenshots/4.png' },
        ];
      }
      return [];
    });
    let counter = 0;
    (storage.deleteStarredHand as any).mockImplementation(async () => {
      counter++;
      if (counter === 3) throw new Error('Random fail');
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const summary = await purgeSpotScreenshots();
    expect(summary.purgedCount + summary.errorCount).toBe(4);

    errorSpy.mockRestore();
  });
});
