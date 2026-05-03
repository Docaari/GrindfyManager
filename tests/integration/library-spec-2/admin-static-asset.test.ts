import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-2 / RF-11 — POST /api/admin/library/static-asset
//
// Spec: Docs/specs/biblioteca-spec-2.md RF-11
//
// Endpoint:
//   POST /api/admin/library/static-asset
//   Auth: requireAuth + requirePermission('admin_full')
//   Content-Type: multipart/form-data
//   Fields:
//     - kind: 'styles' | 'scripts'
//     - file: File (CSS ou JS)
//   Response 200: { kind, key, size, sha256 }
//   Response 400: invalid_kind
//   Response 413: arquivo > 5MB
//
// Helper novo no mediaStorage:
//   putAtFixedKey(key: string, buffer: Buffer, mime: string): Promise<{ size, sha256 }>
//
// Handler target: handleAdminUploadStaticAsset em routes/library.ts (NAO EXISTE)
// =============================================================================

const putAtFixedKeyMock = vi.fn();

vi.mock('../../../server/services/mediaStorage', () => ({
  createMediaStorage: vi.fn(() => ({
    putAtFixedKey: putAtFixedKeyMock,
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  })),
}));

import {
  handleAdminUploadStaticAsset,
  // @ts-expect-error - handler nao existe (red phase)
} from '../../../server/routes/library';

beforeEach(() => {
  vi.clearAllMocks();
  putAtFixedKeyMock.mockResolvedValue({
    size: 1024,
    sha256: 'abc123def456789012345678901234567890123456789012345678901234abcd',
  });
});

function makeReq(opts: any = {}) {
  return {
    user: { userPlatformId: 'USER-ADMIN' },
    body: {},
    file: undefined,
    files: undefined,
    headers: {},
    ...opts,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res.body = data;
    return res;
  });
  return res;
}

// ---------------------------------------------------------------------------
// kind validation
// ---------------------------------------------------------------------------

describe('POST /api/admin/library/static-asset — kind validation', () => {
  it('deve retornar 400 invalid_kind quando kind nao eh styles nem scripts', async () => {
    const req = makeReq({
      body: { kind: 'fonts' },
      file: { buffer: Buffer.from('x'), mimetype: 'application/octet-stream' },
    });
    const res = makeRes();
    await handleAdminUploadStaticAsset(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.message).toBe('invalid_kind');
  });

  it('deve aceitar kind=styles', async () => {
    const req = makeReq({
      body: { kind: 'styles' },
      file: { buffer: Buffer.from('.foo { color: red; }'), mimetype: 'text/css' },
    });
    const res = makeRes();
    await handleAdminUploadStaticAsset(req, res);
    expect(res.statusCode).toBe(200);
  });

  it('deve aceitar kind=scripts', async () => {
    const req = makeReq({
      body: { kind: 'scripts' },
      file: { buffer: Buffer.from('console.log(1)'), mimetype: 'application/javascript' },
    });
    const res = makeRes();
    await handleAdminUploadStaticAsset(req, res);
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Storage put: key fixa
// ---------------------------------------------------------------------------

describe('POST /api/admin/library/static-asset — putAtFixedKey', () => {
  it('kind=styles -> key library/static/article-styles.css', async () => {
    const req = makeReq({
      body: { kind: 'styles' },
      file: { buffer: Buffer.from('.foo {}'), mimetype: 'text/css' },
    });
    const res = makeRes();
    await handleAdminUploadStaticAsset(req, res);
    expect(putAtFixedKeyMock).toHaveBeenCalledWith(
      'library/static/article-styles.css',
      expect.any(Buffer),
      expect.stringMatching(/text\/css/)
    );
  });

  it('kind=scripts -> key library/static/article-scripts.js', async () => {
    const req = makeReq({
      body: { kind: 'scripts' },
      file: { buffer: Buffer.from('1+1'), mimetype: 'application/javascript' },
    });
    const res = makeRes();
    await handleAdminUploadStaticAsset(req, res);
    expect(putAtFixedKeyMock).toHaveBeenCalledWith(
      'library/static/article-scripts.js',
      expect.any(Buffer),
      expect.stringMatching(/application\/javascript/)
    );
  });
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe('POST /api/admin/library/static-asset — response shape', () => {
  it('deve retornar { kind, key, size, sha256 }', async () => {
    const req = makeReq({
      body: { kind: 'styles' },
      file: { buffer: Buffer.from('.foo {}'), mimetype: 'text/css' },
    });
    const res = makeRes();
    await handleAdminUploadStaticAsset(req, res);
    expect(res.body).toHaveProperty('kind', 'styles');
    expect(res.body).toHaveProperty('key', 'library/static/article-styles.css');
    expect(res.body).toHaveProperty('size');
    expect(res.body).toHaveProperty('sha256');
    expect(typeof res.body.sha256).toBe('string');
    expect(res.body.sha256.length).toBeGreaterThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// Re-upload sobrescreve
// ---------------------------------------------------------------------------

describe('POST /api/admin/library/static-asset — re-upload sobrescreve key fixa', () => {
  it('chamada repetida com key existente NAO duplica + retorna novo hash', async () => {
    putAtFixedKeyMock.mockResolvedValueOnce({
      size: 100,
      sha256: 'aaa111bbb222ccc333ddd444eee555fff666',
    });
    putAtFixedKeyMock.mockResolvedValueOnce({
      size: 200,
      sha256: 'fff999eee888ddd777ccc666bbb555aaa444',
    });

    const req1 = makeReq({
      body: { kind: 'styles' },
      file: { buffer: Buffer.from('.v1 {}'), mimetype: 'text/css' },
    });
    const res1 = makeRes();
    await handleAdminUploadStaticAsset(req1, res1);
    const sha1 = res1.body.sha256;

    const req2 = makeReq({
      body: { kind: 'styles' },
      file: { buffer: Buffer.from('.v2 { color: blue; }'), mimetype: 'text/css' },
    });
    const res2 = makeRes();
    await handleAdminUploadStaticAsset(req2, res2);
    const sha2 = res2.body.sha256;

    expect(sha1).not.toBe(sha2);
    expect(putAtFixedKeyMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// File missing / cap multer
// ---------------------------------------------------------------------------

describe('POST /api/admin/library/static-asset — file edge cases', () => {
  it('deve retornar 400 quando file ausente (multer nao capturou)', async () => {
    const req = makeReq({ body: { kind: 'styles' }, file: undefined });
    const res = makeRes();
    await handleAdminUploadStaticAsset(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.message).toMatch(/file_required|missing|invalid/i);
  });
});
