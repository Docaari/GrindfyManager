import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-03 — Mux Integration Provider
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-03 + D8
// ADR: Docs/architecture/decisions/072-mux-video-integration.md
//
// Modulo target: server/services/muxMediaProvider.ts (AINDA NAO EXISTE)
//
// Surface esperada:
//   muxProvider.createPlaybackToken({ playbackId, userPlatformId })
//     => { url, expiresAt, watermarkText }
//   muxProvider.uploadAsset({ fileBuffer, mimeType })
//     => { assetId, playbackId }
//
// Lesson #5: vi.fn() nao eh constructor — Mux SDK usa `new Mux()`. O modulo
// real envolve em try/catch com fallback para chamada sem `new`. Mock SDK
// abaixo simula essa surface fornecendo class-like com `video.assets.create`
// e `jwt.signPlaybackId`.
//
// TTL = 4h (D8). Watermark text = userPlatformId.
// Sem env Mux -> 503 graceful (nao quebra dev).
// =============================================================================

// ---------------------------------------------------------------------------
// Mock @mux/mux-node — class real (constructible) com surface minima
// ---------------------------------------------------------------------------

const muxJwtSignSpy = vi.fn();
const muxAssetCreateSpy = vi.fn();

class MockMux {
  video: any;
  jwt: any;
  constructor(_opts: any) {
    this.video = {
      assets: {
        create: muxAssetCreateSpy,
      },
    };
    // Static-ish jwt (real SDK expoe Mux.JWT.signPlaybackId).
    this.jwt = {
      signPlaybackId: muxJwtSignSpy,
    };
  }
}

vi.mock('@mux/mux-node', () => ({
  default: MockMux,
  Mux: MockMux,
  // Permite tanto `import Mux from '@mux/mux-node'` quanto destructured.
}));

import {
  createMuxProvider,
  // @ts-expect-error - modulo nao existe (red phase)
} from '../../../server/services/muxMediaProvider';

beforeEach(() => {
  muxJwtSignSpy.mockReset();
  muxAssetCreateSpy.mockReset();
  process.env.MUX_TOKEN_ID = 'mux_id_test';
  process.env.MUX_TOKEN_SECRET = 'mux_secret_test';
  process.env.MUX_SIGNING_KEY = 'mux_signing_key_pem';
  process.env.MUX_SIGNING_KEY_ID = 'mux_signing_key_id';
});

afterEach(() => {
  delete process.env.MUX_TOKEN_ID;
  delete process.env.MUX_TOKEN_SECRET;
  delete process.env.MUX_SIGNING_KEY;
  delete process.env.MUX_SIGNING_KEY_ID;
});

// ---------------------------------------------------------------------------
// createPlaybackToken — TTL + watermark
// ---------------------------------------------------------------------------

describe('muxProvider.createPlaybackToken', () => {
  it('deve retornar URL signed + expiresAt + watermarkText', async () => {
    muxJwtSignSpy.mockReturnValue('signed-jwt-token-abc');
    const provider = createMuxProvider();
    const result = await provider.createPlaybackToken({
      playbackId: 'pb_abc',
      userPlatformId: 'USER-0001',
    });
    expect(result.url).toContain('pb_abc');
    expect(result.url).toContain('signed-jwt-token-abc');
    expect(result.watermarkText).toBe('USER-0001');
    expect(typeof result.expiresAt).toBe('string'); // ISO8601
    // Date parseable
    expect(Number.isNaN(Date.parse(result.expiresAt))).toBe(false);
  });

  it('TTL deve ser ~4h conforme D8', async () => {
    muxJwtSignSpy.mockReturnValue('jwt');
    const provider = createMuxProvider();
    const before = Date.now();
    const result = await provider.createPlaybackToken({
      playbackId: 'pb_x',
      userPlatformId: 'USER-1',
    });
    const after = Date.now();
    const expiresMs = Date.parse(result.expiresAt);
    const fourHoursMs = 4 * 60 * 60 * 1000;
    // Tolerancia 10s para latencia de teste
    expect(expiresMs - after).toBeLessThanOrEqual(fourHoursMs + 10_000);
    expect(expiresMs - before).toBeGreaterThanOrEqual(fourHoursMs - 10_000);
  });

  it('deve invocar signPlaybackId com playbackId + signing key', async () => {
    muxJwtSignSpy.mockReturnValue('jwt');
    const provider = createMuxProvider();
    await provider.createPlaybackToken({
      playbackId: 'pb_check',
      userPlatformId: 'USER-9',
    });
    expect(muxJwtSignSpy).toHaveBeenCalled();
    // Primeiro arg sempre playbackId
    const firstCall = muxJwtSignSpy.mock.calls[0];
    expect(firstCall[0]).toBe('pb_check');
  });

  it('deve lancar mux_not_configured se env MUX_SIGNING_KEY ausente', async () => {
    delete process.env.MUX_SIGNING_KEY;
    const provider = createMuxProvider();
    await expect(
      provider.createPlaybackToken({
        playbackId: 'pb_x',
        userPlatformId: 'USER-1',
      })
    ).rejects.toThrow(/mux_not_configured|configured/i);
  });
});

// ---------------------------------------------------------------------------
// uploadAsset (RF-11 manifest path)
// ---------------------------------------------------------------------------

describe('muxProvider.uploadAsset', () => {
  it('deve retornar { assetId, playbackId } apos create', async () => {
    muxAssetCreateSpy.mockResolvedValue({
      id: 'asset_xyz',
      playback_ids: [{ id: 'pb_xyz', policy: 'signed' }],
    });
    const provider = createMuxProvider();
    const result = await provider.uploadAsset({
      fileBuffer: Buffer.from('mp4-bytes'),
      mimeType: 'video/mp4',
    });
    expect(result.assetId).toBe('asset_xyz');
    expect(result.playbackId).toBe('pb_xyz');
  });

  it('deve lancar mux_not_configured se env MUX_TOKEN_ID ausente', async () => {
    delete process.env.MUX_TOKEN_ID;
    const provider = createMuxProvider();
    await expect(
      provider.uploadAsset({ fileBuffer: Buffer.from('x'), mimeType: 'video/mp4' })
    ).rejects.toThrow(/mux_not_configured|configured/i);
  });
});

// ---------------------------------------------------------------------------
// Lesson #5 — `vi.fn()` nao eh constructor; provider deve tolerar `new` fail
// ---------------------------------------------------------------------------

describe('muxProvider — Lesson #5 robustness', () => {
  it('deve instanciar SDK Mux mesmo quando env de teste limitada (no throws)', () => {
    expect(() => createMuxProvider()).not.toThrow();
  });
});
