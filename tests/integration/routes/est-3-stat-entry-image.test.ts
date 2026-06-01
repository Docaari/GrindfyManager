import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint EST-3 RF-04 / RF-05
// Upload + serve de imagem por entry de stat_analysis
//
// Spec: Docs/specs/estudo-ia-overhaul-2026-06-01/est-3-study-recording-stat-analysis.md (RF-04/05)
// ADR : Docs/architecture/decisions/222-est3-stat-analysis-study-sessions-v2.md (D-3/D-6)
// Diagrama: Docs/architecture/diagrams/est-3/sequence-stat-analysis.mermaid (fluxos 2 e 3)
//
// Handlers (NOVOS) em server/routes/study-sessions.ts:
//   handleUploadStatEntryImage(req, res, injectedStorage?)
//   handleServeStatEntryImage(req, res, injectedStorage?)
//
// Storage de imagem DEDICADO (root private-uploads/stat-analysis) exportado em
//   server/services/statAnalysisImageStorage  (modulo NOVO — D-3)
// com instancia `statImageStorage` (put/get/delete) e helper rollbackStatImage.
//
// Lesson #34: injectedStorage 3o arg. MIME magic bytes. Imagens PRIVADAS.
// =============================================================================

// Mock do storage de imagem dedicado (modulo NOVO — red phase).
vi.mock('../../../server/services/statAnalysisImageStorage', () => ({
  statImageStorage: {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  },
  rollbackStatImage: vi.fn(),
}));

// @ts-expect-error - handlers ainda nao existem (red phase)
import { handleUploadStatEntryImage, handleServeStatEntryImage } from '../../../server/routes/study-sessions';
// @ts-expect-error - modulo NOVO (red phase)
import { statImageStorage } from '../../../server/services/statAnalysisImageStorage';

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
    params: { id: 'sess_1', entryId: 'e1' },
    query: {},
    body: { slot: 'play' },
    file: makeFile(PNG_BYTES),
    ...overrides,
  };
}

function makeStorage(overrides: any = {}) {
  return {
    // sessao do user, stat_analysis, com a entry e1 existente
    getStudySessionV2ById: vi.fn(async () => ({
      id: 'sess_1', userId: 'USER-0001', mode: 'stat_analysis', statId: 'vpip',
      statAnalysisEntries: [{ id: 'e1', filters: 'f', errorText: 'e', learnedText: 'l', playImageKey: null, solutionImageKey: null }],
    })),
    updateStatEntryImage: vi.fn(async () => ({ oldKey: null })),
    getStatEntryImageKey: vi.fn(async () => 'USER-0001/sess_1/img.png'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (statImageStorage.put as any).mockResolvedValue({ key: 'USER-0001/sess_1/new.png', size: PNG_BYTES.length });
  (statImageStorage.get as any).mockResolvedValue({ buffer: PNG_BYTES, mime: 'image/png' });
  (statImageStorage.delete as any).mockResolvedValue(true);
});

// =============================================================================
// RF-04 — Upload (slot play / solution)
// =============================================================================

describe('EST-3 upload — RF-04 slot play/solution', () => {
  it('200/201 PNG valido em slot play -> updateStatEntryImage(slot=play)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleUploadStatEntryImage(makeReq({ body: { slot: 'play' } }), res, storage);
    expect([200, 201]).toContain(res.statusCode);
    expect(statImageStorage.put).toHaveBeenCalledTimes(1);
    const args = storage.updateStatEntryImage.mock.calls[0];
    // (sessionId, userId, entryId, slot, key)
    expect(args[2]).toBe('e1');
    expect(args[3]).toBe('play');
    expect(args[4]).toBe('USER-0001/sess_1/new.png');
  });

  it('200/201 em slot solution -> updateStatEntryImage(slot=solution)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleUploadStatEntryImage(makeReq({ body: { slot: 'solution' } }), res, storage);
    expect([200, 201]).toContain(res.statusCode);
    expect(storage.updateStatEntryImage.mock.calls[0][3]).toBe('solution');
  });

  it('400 invalid_mime quando file eh GIF (magic bytes, nao header)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleUploadStatEntryImage(makeReq({ file: makeFile(GIF_BYTES, 'image/png') }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('invalid_mime');
    expect(statImageStorage.put).not.toHaveBeenCalled();
  });

  it('413 file_too_large quando > 5MB', async () => {
    const storage = makeStorage();
    const res = makeRes();
    const big = Buffer.alloc(6 * 1024 * 1024);
    big.set(PNG_BYTES.slice(0, 8), 0);
    await handleUploadStatEntryImage(makeReq({ file: makeFile(big) }), res, storage);
    expect([400, 413]).toContain(res.statusCode);
    expect(statImageStorage.put).not.toHaveBeenCalled();
  });

  it('404 quando sessao eh de outro user (NAO confirma existencia)', async () => {
    const storage = makeStorage({ getStudySessionV2ById: vi.fn(async () => null) });
    const res = makeRes();
    await handleUploadStatEntryImage(makeReq(), res, storage);
    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(403);
    expect(statImageStorage.put).not.toHaveBeenCalled();
  });

  it('409 STAT_ENTRIES_WRONG_MODE quando sessao nao eh stat_analysis', async () => {
    const storage = makeStorage({
      getStudySessionV2ById: vi.fn(async () => ({
        id: 'sess_1', userId: 'USER-0001', mode: 'drill_gto', statAnalysisEntries: [],
      })),
    });
    const res = makeRes();
    await handleUploadStatEntryImage(makeReq(), res, storage);
    expect(res.statusCode).toBe(409);
    expect(res.body.error ?? res.body.code).toBe('STAT_ENTRIES_WRONG_MODE');
  });

  it('404 ENTRY_NOT_FOUND quando entryId nao existe na sessao', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleUploadStatEntryImage(makeReq({ params: { id: 'sess_1', entryId: 'NOPE' } }), res, storage);
    expect(res.statusCode).toBe(404);
    expect(res.body.error ?? res.body.code).toBe('ENTRY_NOT_FOUND');
  });

  it('re-upload no mesmo slot deleta a key antiga (D-6.1)', async () => {
    const storage = makeStorage({
      updateStatEntryImage: vi.fn(async () => ({ oldKey: 'USER-0001/sess_1/old.png' })),
    });
    const res = makeRes();
    await handleUploadStatEntryImage(makeReq({ body: { slot: 'play' } }), res, storage);
    expect([200, 201]).toContain(res.statusCode);
    expect(statImageStorage.delete).toHaveBeenCalledWith('USER-0001/sess_1/old.png');
  });

  it('rollback da key orfa quando updateStatEntryImage falha no DB', async () => {
    const storage = makeStorage({
      updateStatEntryImage: vi.fn(async () => { throw new Error('DB down'); }),
    });
    const res = makeRes();
    await handleUploadStatEntryImage(makeReq(), res, storage);
    expect(res.statusCode).toBe(500);
    // key recem-gravada removida (rollback best-effort)
    expect(statImageStorage.delete).toHaveBeenCalledWith('USER-0001/sess_1/new.png');
  });

  it('400 slot invalido (nem play nem solution)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleUploadStatEntryImage(makeReq({ body: { slot: 'turbo' } }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(statImageStorage.put).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-05 — Servir imagem com ownership
// =============================================================================

describe('EST-3 serve — RF-05 ownership', () => {
  it('200 + binario + Cache-Control private, max-age=300 para owner', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleServeStatEntryImage(
      makeReq({ params: { id: 'sess_1', entryId: 'e1', slot: 'play' }, file: undefined }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['cache-control'])).toContain('private');
    expect(String(res.headers['cache-control'])).toContain('max-age=300');
    expect(res.sentBuffer && res.sentBuffer.equals(PNG_BYTES)).toBe(true);
  });

  it('404 quando sessao eh de outro user (NAO 403)', async () => {
    const storage = makeStorage({ getStudySessionV2ById: vi.fn(async () => null), getStatEntryImageKey: vi.fn(async () => null) });
    const res = makeRes();
    await handleServeStatEntryImage(
      makeReq({ params: { id: 'sess_1', entryId: 'e1', slot: 'play' }, file: undefined }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(403);
    expect(statImageStorage.get).not.toHaveBeenCalled();
  });

  it('404 quando slot/entry sem imagem (getStatEntryImageKey null)', async () => {
    const storage = makeStorage({ getStatEntryImageKey: vi.fn(async () => null) });
    const res = makeRes();
    await handleServeStatEntryImage(
      makeReq({ params: { id: 'sess_1', entryId: 'e1', slot: 'solution' }, file: undefined }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(404);
    expect(statImageStorage.get).not.toHaveBeenCalled();
  });
});
