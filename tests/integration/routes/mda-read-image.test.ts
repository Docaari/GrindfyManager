import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint MDA-1 RF-04 (upload + serve)
//
// Spec: Docs/specs/sprint-mda-1-2026-06-01.md (RF-04, NFR Seguranca)
// ADR : Docs/architecture/decisions/230-mda-1-reference-cards-nn-tagging.md (D-2)
//
// Handlers (NOVOS) em server/routes/mda.ts:
//   handleUploadMdaReadImage(req, res, injectedStorage?)
//   handleServeMdaReadImage(req, res, injectedStorage?)
//   handleDeleteMdaReadImage(req, res, injectedStorage?)
//
// Storage de imagem DEDICADO (root private-uploads/mda) exportado em
//   server/services/mdaImageStorage  (modulo NOVO — D-2)
// com instancia `mdaImageStorage` (put/get/delete) + helper rollbackMdaImage.
//
// Lesson #34: injectedStorage 3o arg. Magic bytes (nao Content-Type). Imagens
// PRIVADAS — cross-user retorna 404 (nao 403). Cap 8 prints no upload.
// Espelha tests/integration/routes/est-3-stat-entry-image.test.ts.
// =============================================================================

vi.mock('../../../server/services/mdaImageStorage', () => ({
  mdaImageStorage: {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  },
  rollbackMdaImage: vi.fn(),
}));

// @ts-expect-error - handlers ainda nao existem (red phase)
import { handleUploadMdaReadImage, handleServeMdaReadImage, handleDeleteMdaReadImage } from '../../../server/routes/mda';
// @ts-expect-error - modulo NOVO (red phase)
import { mdaImageStorage } from '../../../server/services/mdaImageStorage';

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const GIF_BYTES = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x01, 0x00]);

function makeFile(buffer: Buffer, mimetype = 'image/png') {
  return { fieldname: 'file', originalname: 'p.png', encoding: '7bit', mimetype, buffer, size: buffer.length };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {}, sentBuffer: null as Buffer | null, ended: false };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.setHeader = (k: string, v: any) => { res.headers[k.toLowerCase()] = v; return res; };
  res.set = res.setHeader;
  res.end = (chunk?: Buffer) => { res.ended = true; if (chunk) res.sentBuffer = chunk; return res; };
  res.send = (chunk?: any) => { res.ended = true; if (Buffer.isBuffer(chunk)) res.sentBuffer = chunk; else res.body = chunk; return res; };
  return res;
}

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    params: { id: 'read_1' },
    query: {},
    body: {},
    file: makeFile(PNG_BYTES),
    ...overrides,
  };
}

function makeStorage(overrides: any = {}) {
  return {
    // read do user, com 1 imagem ja existente
    getMdaReadById: vi.fn(async () => ({
      id: 'read_1', userId: 'USER-0001', title: 'x',
      images: [{ id: 'img_1', key: 'USER-0001/read_1/old.png', caption: 'c' }],
    })),
    addMdaReadImage: vi.fn(async () => ({ id: 'img_NEW', key: 'USER-0001/read_1/new.png', caption: '' })),
    removeMdaReadImage: vi.fn(async () => ({ oldKey: 'USER-0001/read_1/old.png' })),
    getMdaReadImageKey: vi.fn(async () => 'USER-0001/read_1/img.png'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (mdaImageStorage.put as any).mockResolvedValue({ key: 'USER-0001/read_1/new.png', size: PNG_BYTES.length });
  (mdaImageStorage.get as any).mockResolvedValue({ buffer: PNG_BYTES, mime: 'image/png' });
  (mdaImageStorage.delete as any).mockResolvedValue(true);
});

// =============================================================================
// RF-04 — Upload de print
// =============================================================================

describe('MDA-1 upload — RF-04', () => {
  it('200/201 PNG valido -> put + addMdaReadImage', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleUploadMdaReadImage(makeReq(), res, storage);
    expect([200, 201]).toContain(res.statusCode);
    expect(mdaImageStorage.put).toHaveBeenCalledTimes(1);
    expect(storage.addMdaReadImage).toHaveBeenCalledTimes(1);
    // retorna { id, url }
    expect(typeof res.body.id).toBe('string');
    expect(typeof res.body.url).toBe('string');
  });

  it('400 invalid_mime quando file eh GIF (magic bytes, nao header)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleUploadMdaReadImage(makeReq({ file: makeFile(GIF_BYTES, 'image/png') }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(mdaImageStorage.put).not.toHaveBeenCalled();
  });

  it('413/400 file_too_large quando > 5MB', async () => {
    const storage = makeStorage();
    const res = makeRes();
    const big = Buffer.alloc(6 * 1024 * 1024);
    big.set(PNG_BYTES.slice(0, 8), 0);
    await handleUploadMdaReadImage(makeReq({ file: makeFile(big) }), res, storage);
    expect([400, 413]).toContain(res.statusCode);
    expect(mdaImageStorage.put).not.toHaveBeenCalled();
  });

  it('404 quando read eh de outro user (NAO confirma existencia)', async () => {
    const storage = makeStorage({ getMdaReadById: vi.fn(async () => null) });
    const res = makeRes();
    await handleUploadMdaReadImage(makeReq(), res, storage);
    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(403);
    expect(mdaImageStorage.put).not.toHaveBeenCalled();
  });

  it('400/409 do 9o print no mesmo MDA (cap 8)', async () => {
    const storage = makeStorage({
      getMdaReadById: vi.fn(async () => ({
        id: 'read_1', userId: 'USER-0001', title: 'x',
        images: Array.from({ length: 8 }, (_v, i) => ({ id: `img_${i}`, key: `k${i}`, caption: '' })),
      })),
    });
    const res = makeRes();
    await handleUploadMdaReadImage(makeReq(), res, storage);
    expect([400, 409]).toContain(res.statusCode);
    expect(storage.addMdaReadImage).not.toHaveBeenCalled();
  });

  it('rollback da key orfa quando addMdaReadImage falha no DB', async () => {
    const storage = makeStorage({
      addMdaReadImage: vi.fn(async () => { throw new Error('DB down'); }),
    });
    const res = makeRes();
    await handleUploadMdaReadImage(makeReq(), res, storage);
    expect(res.statusCode).toBe(500);
    // key recem-gravada removida (rollback best-effort)
    expect(mdaImageStorage.delete).toHaveBeenCalledWith('USER-0001/read_1/new.png');
  });
});

// =============================================================================
// RF-04 — Servir print com ownership
// =============================================================================

describe('MDA-1 serve — RF-04 ownership', () => {
  it('200 + binario + Cache-Control private, max-age=300 para owner', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleServeMdaReadImage(
      makeReq({ params: { id: 'read_1', imageId: 'img_1' }, file: undefined }),
      res, storage,
    );
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['cache-control'])).toContain('private');
    expect(String(res.headers['cache-control'])).toContain('max-age=300');
    expect(res.sentBuffer && res.sentBuffer.equals(PNG_BYTES)).toBe(true);
  });

  it('Content-Type setado a partir do mime do storage', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleServeMdaReadImage(
      makeReq({ params: { id: 'read_1', imageId: 'img_1' }, file: undefined }),
      res, storage,
    );
    expect(String(res.headers['content-type'])).toContain('image/png');
  });

  it('404 quando read eh de outro user (getMdaReadImageKey null) — NAO 403', async () => {
    const storage = makeStorage({ getMdaReadImageKey: vi.fn(async () => null) });
    const res = makeRes();
    await handleServeMdaReadImage(
      makeReq({ params: { id: 'read_1', imageId: 'img_1' }, file: undefined }),
      res, storage,
    );
    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(403);
    expect(mdaImageStorage.get).not.toHaveBeenCalled();
  });

  it('404 quando imageId nao tem imagem (key null)', async () => {
    const storage = makeStorage({ getMdaReadImageKey: vi.fn(async () => null) });
    const res = makeRes();
    await handleServeMdaReadImage(
      makeReq({ params: { id: 'read_1', imageId: 'NOPE' }, file: undefined }),
      res, storage,
    );
    expect(res.statusCode).toBe(404);
    expect(mdaImageStorage.get).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-04 — DELETE de print (best-effort delete)
// =============================================================================

describe('MDA-1 delete print — RF-04', () => {
  it('200 remove do array jsonb + best-effort delete do storage (oldKey)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleDeleteMdaReadImage(
      makeReq({ params: { id: 'read_1', imageId: 'img_1' }, file: undefined }),
      res, storage,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.removeMdaReadImage).toHaveBeenCalledWith('read_1', 'USER-0001', 'img_1');
    expect(mdaImageStorage.delete).toHaveBeenCalledWith('USER-0001/read_1/old.png');
  });

  it('200 mesmo se o storage delete falhar (best-effort, operacao principal nao falha)', async () => {
    const storage = makeStorage();
    (mdaImageStorage.delete as any).mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'ENOENT' }));
    const res = makeRes();
    await handleDeleteMdaReadImage(
      makeReq({ params: { id: 'read_1', imageId: 'img_1' }, file: undefined }),
      res, storage,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.removeMdaReadImage).toHaveBeenCalledTimes(1);
  });

  it('404 quando read eh de outro user (removeMdaReadImage retorna null)', async () => {
    const storage = makeStorage({ removeMdaReadImage: vi.fn(async () => null) });
    const res = makeRes();
    await handleDeleteMdaReadImage(
      makeReq({ params: { id: 'read_1', imageId: 'img_1' }, file: undefined }),
      res, storage,
    );
    expect(res.statusCode).toBe(404);
  });
});
