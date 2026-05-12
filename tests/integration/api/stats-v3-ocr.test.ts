// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3 — POST /api/stats-analyzer/ocr-extract (RF-08, RF-09, RF-12)
//
// Spec : docs/specs/sprint-stats-v3.md
//        - RF-08 endpoint OCR upload + magic bytes
//        - RF-09 Anthropic Haiku 4.5 + cache SHA256 + retry
//        - RF-12 rate limit 10/h
// ADR  : 065 (OCR via Claude Vision)
//
// Convencao do projeto: handlers testados diretamente com mocks (nao supertest).
// O Implementer ira criar handler exportado em
// `server/routes/statsAnalyzer.ts` (extensao do modulo V2).
//
// Modulos NAO existem ainda — red phase:
//   - handleOcrExtract (handler)
//   - server/services/hudOcrService.ts (extractStatsFromImage, cache lookup)
//
// Mocks:
//   - storage.getHudLayout (verificar layout pertence ao user)
//   - storage.getHudStatSnapshots (cache lookup por SHA256)
//   - storage.createHudStatSnapshot (persist raw response)
//   - server/services/spotImageStorage (put)
//   - @anthropic-ai/sdk (messages.create)
//
// Lessons aplicadas:
//   #3 mocks idealizados — assert shape REAL do storage
//   #5 vi.fn() nao eh constructor — Anthropic SDK class via env-gated mock
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

vi.mock('../../../server/storage', () => ({
  storage: {
    getHudLayout: vi.fn(),
    getHudStatSnapshots: vi.fn(),
    getHudStatSnapshot: vi.fn(),
    createHudStatSnapshot: vi.fn(),
    deleteHudStatSnapshot: vi.fn(),
    updateHudStatSnapshot: vi.fn(),
    findHudStatSnapshotByImageSha256: vi.fn(),
  },
}));

const spotImageStorageMock = {
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  exists: vi.fn(),
};

vi.mock('../../../server/services/spotImageStorage', () => ({
  spotImageStorage: spotImageStorageMock,
  createSpotImageStorage: () => spotImageStorageMock,
}));

// Mock @anthropic-ai/sdk — class constructor pattern (lesson #5)
const messagesCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: messagesCreateMock,
    },
  })),
}));

// -----------------------------------------------------------------------------
// Imports (handlers + service NAO existem ainda — red phase)
// -----------------------------------------------------------------------------

import { handleOcrExtract, handleSaveOcrSnapshot } from '../../../server/routes/statsAnalyzer';
import { storage } from '../../../server/storage';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001', subscriptionPlan: 'pro' },
    body: {},
    query: {},
    params: {},
    file: undefined,
    headers: {},
    rateLimit: undefined,
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; return res; };
  res.header = (k: string, v: string) => { res.headers[k] = v; return res; };
  res.send = (d: any) => { res.body = d; return res; };
  return res;
}

// PNG magic bytes (8 bytes: 89 50 4E 47 0D 0A 1A 0A)
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// JPEG magic bytes (FF D8 FF)
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
// WEBP — RIFF....WEBP
const WEBP_MAGIC = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
]);
// GIF (rejeitado)
const GIF_MAGIC = Buffer.from('GIF87a');
// SVG (rejeitado — text)
const SVG_BUF = Buffer.from('<?xml version="1.0"?><svg></svg>');

function pngBuffer(sizeBytes = 1024): Buffer {
  const padding = Buffer.alloc(Math.max(0, sizeBytes - PNG_MAGIC.length));
  return Buffer.concat([PNG_MAGIC, padding]);
}

function multerFile(buffer: Buffer, mimetype = 'image/png'): any {
  return {
    fieldname: 'image',
    originalname: 'screenshot.png',
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  };
}

// -----------------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: ANTHROPIC_API_KEY presente
  process.env.ANTHROPIC_API_KEY = 'test-key';
  // Default: layout do user existe
  (storage.getHudLayout as any).mockResolvedValue({
    id: 'lyt-1',
    userId: 'USER-0001',
    name: 'PT4',
    sections: [],
  });
  // Default: cache miss (sem snapshot anterior com mesma sha)
  (storage.getHudStatSnapshots as any).mockResolvedValue([]);
  // Default: spotImageStorage.put retorna key
  spotImageStorageMock.put.mockResolvedValue({
    key: 'USER-0001/hud-snapshots/abc.png',
    size: 1024,
  });
  // Default: createHudStatSnapshot retorna row
  (storage.createHudStatSnapshot as any).mockResolvedValue({
    id: 'snap-new',
    layoutId: 'lyt-1',
  });
  // Default: updateHudStatSnapshot patch path retorna row patched
  (storage.updateHudStatSnapshot as any).mockResolvedValue({
    id: 'snap-new',
    layoutId: 'lyt-1',
    captureMethod: 'ocr',
  });
  // Default: cache miss via index parcial INFO-6
  (storage.findHudStatSnapshotByImageSha256 as any).mockResolvedValue(undefined);
  // Default: messages.create retorna JSON valido
  messagesCreateMock.mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          stats: [
            { label: 'VPIP', value: 22.5, confidence: 0.94 },
            { label: 'PFR', value: 18.0, confidence: 0.92 },
          ],
        }),
      },
    ],
  });
});

// =============================================================================
// Auth + permission
// =============================================================================

describe('POST /api/stats-analyzer/ocr-extract — auth/permission', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleOcrExtract(
      makeReq({ user: undefined, file: multerFile(pngBuffer()), body: { layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('403 quando usuario nao eh tier pro+ e OCR_REQUIRE_PRO=true', async () => {
    // Por padrao o gate de tier mora no route middleware (requirePermission("studies"));
    // o handler so re-checa quando OCR_REQUIRE_PRO=true (HIGH-5 — opt-in extra).
    const prev = process.env.OCR_REQUIRE_PRO;
    process.env.OCR_REQUIRE_PRO = 'true';
    try {
      const res = makeRes();
      await handleOcrExtract(
        makeReq({
          user: { userPlatformId: 'USER-0001', subscriptionPlan: 'free' },
          file: multerFile(pngBuffer()),
          body: { layoutId: 'lyt-1' },
        }) as any,
        res,
      );
      expect(res.statusCode).toBe(403);
    } finally {
      if (prev === undefined) delete process.env.OCR_REQUIRE_PRO;
      else process.env.OCR_REQUIRE_PRO = prev;
    }
  });
});

// =============================================================================
// Magic bytes / size validation
// =============================================================================

describe('POST /api/stats-analyzer/ocr-extract — magic bytes', () => {
  it('PNG aceito -> 200', async () => {
    const res = makeRes();
    await handleOcrExtract(
      makeReq({ file: multerFile(pngBuffer()), body: { layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('stats');
  });

  it('JPEG aceito -> 200', async () => {
    const res = makeRes();
    await handleOcrExtract(
      makeReq({
        file: multerFile(JPEG_MAGIC, 'image/jpeg'),
        body: { layoutId: 'lyt-1' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
  });

  it('WEBP aceito -> 200', async () => {
    const res = makeRes();
    await handleOcrExtract(
      makeReq({
        file: multerFile(WEBP_MAGIC, 'image/webp'),
        body: { layoutId: 'lyt-1' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
  });

  it('GIF rejeitado -> 422', async () => {
    const res = makeRes();
    await handleOcrExtract(
      makeReq({
        file: multerFile(GIF_MAGIC, 'image/gif'),
        body: { layoutId: 'lyt-1' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(422);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('SVG rejeitado -> 422 (magic bytes invalido)', async () => {
    const res = makeRes();
    await handleOcrExtract(
      makeReq({
        file: multerFile(SVG_BUF, 'image/svg+xml'),
        body: { layoutId: 'lyt-1' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(422);
  });

  it('arquivo >10MB rejeitado -> 413', async () => {
    const big = Buffer.concat([PNG_MAGIC, Buffer.alloc(11 * 1024 * 1024)]);
    const res = makeRes();
    await handleOcrExtract(
      makeReq({ file: multerFile(big), body: { layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(413);
  });
});

// =============================================================================
// ANTHROPIC_API_KEY missing -> 503
// =============================================================================

describe('POST /api/stats-analyzer/ocr-extract — ANTHROPIC_API_KEY ausente', () => {
  it('503 com mensagem PT-BR quando ANTHROPIC_API_KEY ausente', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = makeRes();
    await handleOcrExtract(
      makeReq({ file: multerFile(pngBuffer()), body: { layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).toMatch(/Coach|configurad|indisponiv/i);
  });
});

// =============================================================================
// Cache SHA256
// =============================================================================

describe('POST /api/stats-analyzer/ocr-extract — cache SHA256', () => {
  it('cache HIT por SHA256 retorna sem chamar Anthropic', async () => {
    const buf = pngBuffer();
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    // Reviewer R1 INFO-6: cache lookup agora usa findHudStatSnapshotByImageSha256
    // (index parcial expression). Mock retorna snapshot com matching SHA.
    (storage.findHudStatSnapshotByImageSha256 as any).mockResolvedValue({
      id: 'snap-cached',
      userId: 'USER-0001',
      layoutId: 'lyt-1',
      ocr_raw_response: {
        image_sha256: sha,
        raw_stats: [{ label: 'VPIP', value: 22.5, confidence: 0.94 }],
        matched_stats: [{ id: 'vpip', label: 'VPIP', value: 22.5, confidence: 0.94, matchedBy: 'exact' }],
        unmatched_stats: [],
      },
      source_image_key: 'USER-0001/hud-snapshots/old.png',
    });
    const res = makeRes();
    await handleOcrExtract(
      makeReq({ file: multerFile(buf), body: { layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('cache HIT via fallback legacy (storage sem findHudStatSnapshotByImageSha256)', async () => {
    // Compat: se storage nao expoe finder, usa scan via getHudStatSnapshots.
    const buf = pngBuffer();
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    // Remove o finder para forcar fallback
    const origFinder = (storage as any).findHudStatSnapshotByImageSha256;
    (storage as any).findHudStatSnapshotByImageSha256 = undefined;
    (storage.getHudStatSnapshots as any).mockResolvedValue([
      {
        id: 'snap-cached',
        userId: 'USER-0001',
        layoutId: 'lyt-1',
        ocr_raw_response: {
          image_sha256: sha,
          raw_stats: [{ label: 'VPIP', value: 22.5, confidence: 0.94 }],
          matched_stats: [{ id: 'vpip', label: 'VPIP', value: 22.5, confidence: 0.94, matchedBy: 'exact' }],
          unmatched_stats: [],
        },
        source_image_key: 'USER-0001/hud-snapshots/old.png',
      },
    ]);
    try {
      const res = makeRes();
      await handleOcrExtract(
        makeReq({ file: multerFile(buf), body: { layoutId: 'lyt-1' } }) as any,
        res,
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.cached).toBe(true);
      expect(messagesCreateMock).not.toHaveBeenCalled();
    } finally {
      (storage as any).findHudStatSnapshotByImageSha256 = origFinder;
    }
  });

  it('cache MISS chama Anthropic e devolve resultado SEM criar snapshot orfao', async () => {
    // Reviewer R1 CRITICAL-1: handleOcrExtract NAO persiste snapshot.
    // Apenas handleSaveOcrSnapshot (from-ocr endpoint) cria snapshot final
    // com captureMethod='ocr', sourceImageKey, ocrRawResponse com image_sha256.
    const res = makeRes();
    await handleOcrExtract(
      makeReq({ file: multerFile(pngBuffer()), body: { layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    // Invariante CRITICAL-1: extract NUNCA cria snapshot. Frontend recebe
    // preview, user revisa e dispara from-ocr para salvar definitivamente.
    expect(storage.createHudStatSnapshot).not.toHaveBeenCalled();
    // Resposta inclui rawResponse com image_sha256 para o from-ocr usar.
    expect(res.body).toHaveProperty('imageSha256');
    expect(res.body).toHaveProperty('rawResponse');
    expect(res.body.rawResponse.image_sha256).toBe(res.body.imageSha256);
  });

  it('SHA256 hash determinismo: mesmo buffer = mesma key', async () => {
    const buf1 = pngBuffer(2048);
    const buf2 = pngBuffer(2048);
    const sha1 = crypto.createHash('sha256').update(buf1).digest('hex');
    const sha2 = crypto.createHash('sha256').update(buf2).digest('hex');
    expect(sha1).toBe(sha2);
  });
});

// =============================================================================
// Anthropic 5xx retry
// =============================================================================

describe('POST /api/stats-analyzer/ocr-extract — retry policy', () => {
  it('Anthropic 5xx -> retry 1x -> 503 final apos 2 falhas', async () => {
    messagesCreateMock
      .mockRejectedValueOnce({ status: 503, message: 'overloaded' })
      .mockRejectedValueOnce({ status: 503, message: 'overloaded' });
    const res = makeRes();
    await handleOcrExtract(
      makeReq({ file: multerFile(pngBuffer()), body: { layoutId: 'lyt-1' } }) as any,
      res,
    );
    // 502 ou 503 (spec menciona ambos)
    expect([502, 503]).toContain(res.statusCode);
    expect(messagesCreateMock).toHaveBeenCalledTimes(2);
  });

  it('Anthropic 5xx + retry success -> 200', async () => {
    messagesCreateMock
      .mockRejectedValueOnce({ status: 503, message: 'overloaded' })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({ stats: [{ label: 'VPIP', value: 22, confidence: 0.9 }] }) }],
      });
    const res = makeRes();
    await handleOcrExtract(
      makeReq({ file: multerFile(pngBuffer()), body: { layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(messagesCreateMock).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// Body parsing robust
// =============================================================================

describe('POST /api/stats-analyzer/ocr-extract — body parsing', () => {
  it('JSON wrappado em markdown eh extraido com regex fallback', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n' + JSON.stringify({ stats: [{ label: 'VPIP', value: 22, confidence: 0.9 }] }) + '\n```',
        },
      ],
    });
    const res = makeRes();
    await handleOcrExtract(
      makeReq({ file: multerFile(pngBuffer()), body: { layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.stats.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// SpotImageStorage prefix
// =============================================================================

describe('POST /api/stats-analyzer/ocr-extract — SpotImageStorage', () => {
  it('chama spotImageStorage.put com sessionId="hud-snapshots"', async () => {
    const res = makeRes();
    await handleOcrExtract(
      makeReq({ file: multerFile(pngBuffer()), body: { layoutId: 'lyt-1' } }) as any,
      res,
    );
    expect(spotImageStorageMock.put).toHaveBeenCalled();
    const putArg = spotImageStorageMock.put.mock.calls[0][0];
    expect(putArg.userId).toBe('USER-0001');
    expect(putArg.sessionId).toBe('hud-snapshots');
    expect(['png', 'jpeg', 'webp']).toContain(putArg.ext);
  });
});

// =============================================================================
// Reviewer R1 CRITICAL-2 — IDOR em from-ocr imageKey
// =============================================================================

describe('POST /api/stats-analyzer/snapshots/from-ocr — IDOR / imageKey', () => {
  it('403 quando imageKey nao comeca com `${userPlatformId}/hud-snapshots/`', async () => {
    const res = makeRes();
    await handleSaveOcrSnapshot(
      makeReq({
        body: {
          layoutId: 'lyt-1',
          imageKey: 'USER-9999/hud-snapshots/stolen.png', // outro user
          values: { vpip: 22 },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(storage.createHudStatSnapshot).not.toHaveBeenCalled();
  });

  it('403 quando imageKey aponta para outro sessionId (path traversal classico)', async () => {
    const res = makeRes();
    await handleSaveOcrSnapshot(
      makeReq({
        body: {
          layoutId: 'lyt-1',
          imageKey: 'USER-0001/spot-screenshots/sneaky.png',
          values: { vpip: 22 },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(storage.createHudStatSnapshot).not.toHaveBeenCalled();
  });

  it('201 quando imageKey casa o prefixo correto', async () => {
    const res = makeRes();
    await handleSaveOcrSnapshot(
      makeReq({
        body: {
          layoutId: 'lyt-1',
          imageKey: 'USER-0001/hud-snapshots/legit.png',
          values: { vpip: 22 },
          ocrRawResponse: { image_sha256: 'abc' },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(storage.createHudStatSnapshot).toHaveBeenCalled();
  });

  it('201 quando imageKey ausente (frontend pode salvar manual sem upload)', async () => {
    const res = makeRes();
    await handleSaveOcrSnapshot(
      makeReq({
        body: {
          layoutId: 'lyt-1',
          values: { vpip: 22 },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
  });
});

// =============================================================================
// Reviewer R1 HIGH-4 — from-ocr rejeita statIds desconhecidos
// =============================================================================

describe('POST /api/stats-analyzer/snapshots/from-ocr — unknown statIds', () => {
  it('400 com unknownStatIds list quando values contem statId fora do catalog', async () => {
    const res = makeRes();
    await handleSaveOcrSnapshot(
      makeReq({
        body: {
          layoutId: 'lyt-1',
          imageKey: 'USER-0001/hud-snapshots/x.png',
          values: { vpip: 22, totally_made_up_stat: 99 },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('unknownStatIds');
    expect(res.body.unknownStatIds).toContain('totally_made_up_stat');
    expect(storage.createHudStatSnapshot).not.toHaveBeenCalled();
  });

  it('aceita statId custom_* declarado no layout fields_json', async () => {
    (storage.getHudLayout as any).mockResolvedValue({
      id: 'lyt-1',
      userId: 'USER-0001',
      fields_json: [
        { id: 'custom_a8b3c9d1', isCustom: true, label: 'Avg Stack BB', unit: 'bb' },
      ],
    });
    const res = makeRes();
    await handleSaveOcrSnapshot(
      makeReq({
        body: {
          layoutId: 'lyt-1',
          imageKey: 'USER-0001/hud-snapshots/x.png',
          values: { vpip: 22, custom_a8b3c9d1: 50 },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
  });
});
