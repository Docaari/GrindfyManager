import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint MDA-1 RF-04 / D-2
// Storage de imagem DEDICADO (root private-uploads/mda)
//
// Spec: Docs/specs/sprint-mda-1-2026-06-01.md (RF-04, NFR Seguranca)
// ADR : Docs/architecture/decisions/230-mda-1-reference-cards-nn-tagging.md (D-2)
//
// Modulo NOVO (red phase): server/services/mdaImageStorage
//   - reusa createSpotImageStorage(rootSubdir) (ADR-057) com root DEDICADO
//     private-uploads/mda (NAO o singleton spotImageStorage cujo root eh
//     private-uploads/spots, NAO o stat-analysis).
//   - exporta `mdaImageStorage` (instancia) + `rollbackMdaImage(key)` helper.
//   - key layout: <userId>/<readId>/<nanoid>.<ext> (imageId/caption NO DB jsonb).
//
// O comportamento de path-traversal / ext-whitelist da classe ja eh coberto por
// tests/unit/spot-screenshots/storage-local-fs.test.ts. Aqui validamos APENAS o
// wiring do root dedicado + rollback helper (segregacao de copyright — D-2),
// espelhando tests/unit/est-3/stat-analysis-image-storage.test.ts.
// =============================================================================

beforeEach(() => { vi.resetModules(); });

describe('MDA-1 mdaImageStorage — root dedicado (D-2)', () => {
  it('instancia mdaImageStorage com root private-uploads/mda (NAO spots, NAO stat-analysis)', async () => {
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

    const mod = await import('../../../server/services/mdaImageStorage');
    expect(mod.mdaImageStorage).toBeDefined();
    expect(typeof (mod.mdaImageStorage as any).put).toBe('function');
    // Root dedicado — segregacao fisica do copyright (stats da populacao).
    expect(String(capturedRoot)).toContain(path.join('private-uploads', 'mda'));
    expect(String(capturedRoot)).not.toContain(path.join('private-uploads', 'spots'));
    expect(String(capturedRoot)).not.toContain(path.join('private-uploads', 'stat-analysis'));
  });

  it('exporta rollbackMdaImage(key) idempotente — no-op para key null', async () => {
    const mod = await import('../../../server/services/mdaImageStorage');
    expect(typeof mod.rollbackMdaImage).toBe('function');
    await expect(mod.rollbackMdaImage(null as any)).resolves.not.toThrow();
  });

  it('rollbackMdaImage delega para mdaImageStorage.delete quando key valida', async () => {
    const mod = await import('../../../server/services/mdaImageStorage');
    const spy = vi.spyOn(mod.mdaImageStorage as any, 'delete').mockResolvedValue(true);
    await mod.rollbackMdaImage('USER-0001/read_1/abc.png');
    expect(spy).toHaveBeenCalledWith('USER-0001/read_1/abc.png');
  });

  it('rollbackMdaImage engole erro de delete (best-effort, D-2)', async () => {
    const mod = await import('../../../server/services/mdaImageStorage');
    vi.spyOn(mod.mdaImageStorage as any, 'delete').mockRejectedValue(
      Object.assign(new Error('gone'), { code: 'ENOENT' }),
    );
    await expect(mod.rollbackMdaImage('USER-0001/read_1/abc.png')).resolves.not.toThrow();
  });
});
