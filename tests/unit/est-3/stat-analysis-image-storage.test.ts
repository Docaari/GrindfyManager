import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint EST-3 RF-04 / D-3 / Q-OPEN-7
// Storage de imagem DEDICADO (root private-uploads/stat-analysis)
//
// Spec: Docs/specs/estudo-ia-overhaul-2026-06-01/est-3-study-recording-stat-analysis.md (RF-04, NFR Seguranca)
// ADR : Docs/architecture/decisions/222-est3-stat-analysis-study-sessions-v2.md (D-3)
//
// Modulo NOVO (red phase): server/services/statAnalysisImageStorage
//   - reusa LocalFsSpotImageStorage (ADR-057) mas com root DEDICADO
//     private-uploads/stat-analysis (NAO o singleton spotImageStorage cujo root
//     eh private-uploads/spots).
//   - exporta `statImageStorage` (instancia) + `rollbackStatImage(key)` helper.
//   - key layout: <userId>/<sessionId>/<nanoid>.<ext> (entryId/slot NO DB, nao na key).
//
// O comportamento de path-traversal / ext-whitelist da classe ja eh coberto por
// tests/unit/spot-screenshots/storage-local-fs.test.ts. Aqui validamos APENAS o
// wiring do root dedicado + rollback helper (segregacao de copyright GTO — D-3).
// =============================================================================

beforeEach(() => { vi.resetModules(); });

describe('EST-3 statAnalysisImageStorage — root dedicado (D-3)', () => {
  it('instancia statImageStorage com root private-uploads/stat-analysis (NAO spots)', async () => {
    // Capturamos o root passado ao construtor LocalFsSpotImageStorage.
    let capturedRoot: string | undefined;
    vi.doMock('../../../server/services/spotImageStorage/local', async () => {
      const actual = await vi.importActual<any>('../../../server/services/spotImageStorage/local');
      class SpyStorage extends actual.LocalFsSpotImageStorage {
        constructor(opts: any) {
          capturedRoot = opts?.root;
          super(opts);
        }
      }
      return { ...actual, LocalFsSpotImageStorage: SpyStorage };
    });

    const mod = await import('../../../server/services/statAnalysisImageStorage');
    expect(mod.statImageStorage).toBeDefined();
    expect(typeof (mod.statImageStorage as any).put).toBe('function');
    // Root dedicado — segregacao fisica do copyright GTO.
    expect(String(capturedRoot)).toContain(path.join('private-uploads', 'stat-analysis'));
    expect(String(capturedRoot)).not.toContain(path.join('private-uploads', 'spots'));
  });

  it('exporta rollbackStatImage(key) idempotente — no-op para key null', async () => {
    const mod = await import('../../../server/services/statAnalysisImageStorage');
    expect(typeof mod.rollbackStatImage).toBe('function');
    // null nao deve throw nem chamar delete.
    await expect(mod.rollbackStatImage(null as any)).resolves.not.toThrow();
  });

  it('rollbackStatImage delega para statImageStorage.delete quando key valida', async () => {
    const mod = await import('../../../server/services/statAnalysisImageStorage');
    const spy = vi.spyOn(mod.statImageStorage as any, 'delete').mockResolvedValue(true);
    await mod.rollbackStatImage('USER-0001/sess_1/abc.png');
    expect(spy).toHaveBeenCalledWith('USER-0001/sess_1/abc.png');
  });

  it('rollbackStatImage engole erro de delete (best-effort, D-6)', async () => {
    const mod = await import('../../../server/services/statAnalysisImageStorage');
    vi.spyOn(mod.statImageStorage as any, 'delete').mockRejectedValue(
      Object.assign(new Error('gone'), { code: 'ENOENT' }),
    );
    await expect(mod.rollbackStatImage('USER-0001/sess_1/abc.png')).resolves.not.toThrow();
  });
});
