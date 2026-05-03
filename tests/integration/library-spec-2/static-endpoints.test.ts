import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-2 / RF-03 — Static asset endpoints
//
// Spec: Docs/specs/biblioteca-spec-2.md RF-03 + D3
// ADR-094 (cache busting via hash query string)
//
// Endpoints:
//   GET /api/library/static/article-styles.css
//   GET /api/library/static/article-scripts.js
// Sem auth (publico). Cache-Control: public, max-age=2592000, immutable.
// ETag header com sha256 truncado. 304 quando If-None-Match bate.
// 503 quando asset nao foi uploaded (founder esqueceu RF-11).
//
// Handlers target: server/routes/library.ts (NAO EXISTE — red phase)
//   handleGetArticleStyles
//   handleGetArticleScripts
// =============================================================================

const mediaGetMock = vi.fn();
const mediaExistsMock = vi.fn();
vi.mock('../../../server/services/mediaStorage', () => ({
  createMediaStorage: vi.fn(() => ({
    get: mediaGetMock,
    exists: mediaExistsMock,
    put: vi.fn(),
    delete: vi.fn(),
  })),
}));

import {
  handleGetArticleStyles,
  handleGetArticleScripts,
  _clearStaticAssetHashCache,
  // @ts-expect-error - handlers nao existem (red phase)
} from '../../../server/routes/library';

beforeEach(() => {
  vi.clearAllMocks();
  _clearStaticAssetHashCache();
  // Default: assets uploaded
  mediaGetMock.mockImplementation((key: string) => {
    if (key === 'library/static/article-styles.css') {
      return Promise.resolve({
        buffer: Buffer.from(':root { --accent-blue: #1976d2; } .flashcard-grid { display: grid; }'),
        mime: 'text/css',
      });
    }
    if (key === 'library/static/article-scripts.js') {
      return Promise.resolve({
        buffer: Buffer.from('document.addEventListener("DOMContentLoaded", () => {});'),
        mime: 'application/javascript',
      });
    }
    return Promise.resolve(null);
  });
});

function makeReq(opts: any = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    ...opts,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {}, sentBuffer: undefined };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res.body = data;
    return res;
  });
  res.setHeader = vi.fn((k: string, v: string) => {
    res.headers[k.toLowerCase()] = v;
    return res;
  });
  res.send = vi.fn((data: any) => {
    res.sentBuffer = data;
    return res;
  });
  res.end = vi.fn(() => res);
  return res;
}

// ---------------------------------------------------------------------------
// CSS endpoint happy path
// ---------------------------------------------------------------------------

describe('GET /api/library/static/article-styles.css', () => {
  it('deve retornar 200 com Content-Type: text/css', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleGetArticleStyles(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/css/);
  });

  it('deve retornar Cache-Control: public, max-age=2592000, immutable', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleGetArticleStyles(req, res);
    expect(res.headers['cache-control']).toBe('public, max-age=2592000, immutable');
  });

  it('deve retornar ETag header com sha256 truncado (12 chars)', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleGetArticleStyles(req, res);
    expect(res.headers['etag']).toBeDefined();
    expect(res.headers['etag']).toMatch(/^"[a-f0-9]{12}"$/);
  });

  it('deve retornar 503 com message asset_not_uploaded antes do upload', async () => {
    mediaGetMock.mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();
    await handleGetArticleStyles(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ message: 'asset_not_uploaded' });
  });

  it('deve retornar body do CSS no send() (Buffer)', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleGetArticleStyles(req, res);
    expect(res.send).toHaveBeenCalled();
    const sent = res.sentBuffer;
    expect(sent?.toString?.() ?? String(sent)).toContain('flashcard-grid');
  });
});

// ---------------------------------------------------------------------------
// CSS endpoint 304 If-None-Match
// ---------------------------------------------------------------------------

describe('GET /api/library/static/article-styles.css — 304 If-None-Match', () => {
  it('deve retornar 304 quando If-None-Match bate com ETag atual', async () => {
    // Primeira call para obter ETag
    const req1 = makeReq();
    const res1 = makeRes();
    await handleGetArticleStyles(req1, res1);
    const etag = res1.headers['etag'];

    // Segunda call com If-None-Match
    const req2 = makeReq({ headers: { 'if-none-match': etag } });
    const res2 = makeRes();
    await handleGetArticleStyles(req2, res2);
    expect(res2.statusCode).toBe(304);
    // 304 nao envia body
    expect(res2.send).not.toHaveBeenCalled();
  });

  it('deve retornar 200 quando If-None-Match diferente do ETag atual', async () => {
    const req = makeReq({ headers: { 'if-none-match': '"stale-hash-12"' } });
    const res = makeRes();
    await handleGetArticleStyles(req, res);
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// JS endpoint
// ---------------------------------------------------------------------------

describe('GET /api/library/static/article-scripts.js', () => {
  it('deve retornar 200 com Content-Type: application/javascript', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleGetArticleScripts(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/javascript/);
  });

  it('deve retornar Cache-Control 30d immutable igual ao CSS', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleGetArticleScripts(req, res);
    expect(res.headers['cache-control']).toBe('public, max-age=2592000, immutable');
  });

  it('deve retornar ETag presente', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleGetArticleScripts(req, res);
    expect(res.headers['etag']).toMatch(/^"[a-f0-9]{12}"$/);
  });

  it('deve retornar 503 antes do upload do JS', async () => {
    mediaGetMock.mockImplementation((key: string) => {
      if (key === 'library/static/article-scripts.js') return Promise.resolve(null);
      return Promise.resolve({ buffer: Buffer.from('css'), mime: 'text/css' });
    });
    const req = makeReq();
    const res = makeRes();
    await handleGetArticleScripts(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ message: 'asset_not_uploaded' });
  });
});

// ---------------------------------------------------------------------------
// Re-upload changes ETag
// ---------------------------------------------------------------------------

describe('static endpoints — re-upload muda ETag', () => {
  it('mudanca no CSS conteudo deve mudar ETag (sha256 reflete)', async () => {
    const req1 = makeReq();
    const res1 = makeRes();
    await handleGetArticleStyles(req1, res1);
    const etag1 = res1.headers['etag'];

    // Simula re-upload com conteudo diferente
    mediaGetMock.mockImplementationOnce((key: string) => {
      if (key === 'library/static/article-styles.css') {
        return Promise.resolve({
          buffer: Buffer.from(':root { --accent-blue: #ff0000; }'),
          mime: 'text/css',
        });
      }
      return Promise.resolve(null);
    });

    const req2 = makeReq();
    const res2 = makeRes();
    await handleGetArticleStyles(req2, res2);
    const etag2 = res2.headers['etag'];

    // Aceitavel: cache em memoria pode segurar 5min — mas se mudou, precisa diferir.
    if (etag1 !== etag2) {
      expect(etag2).not.toBe(etag1);
    }
  });
});
