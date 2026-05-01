import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Spot-Screenshots — POST /api/starred-hands com imagem (multipart)
//
// Spec: Docs/specs/spot-screenshots.md (RF-01..05, RF-08, EC-*, decisoes founder)
// ADR : Docs/architecture/decisions/057-spot-image-storage-abstraction.md
// Sequence: Docs/architecture/diagrams/spot-screenshots-sequences.mermaid
//
// Handler exportado de server/routes/cooldown.ts:
//   handleCreateStarredHand(req, res)
//
// Quando body tem `req.file` (multer.memoryStorage parseou multipart) e mime real
// for valido (magic bytes), o handler:
//   1. Auth (req.user)
//   2. Zod parse do body (sem o file)
//   3. Ownership do session_tournament + FK consistency
//   4. RF-08: bloqueia se sessao status === 'completed' (decisao founder #1)
//   5. Cap 3/torneio (existente)
//   6. Cap 10/sessao cross-tournament (NOVO — countStarredHandsBySession)
//   7. Magic bytes -> mime real (decisao founder #2 — overrides Content-Type)
//   8. SpotImageStorage.put -> { key, size }
//   9. INSERT row com image_key, image_mime, image_size, image_width=null,
//      image_height=null, captured_during
//  10. Em caso de INSERT falhar -> Storage.delete(key) cleanup
//
// Pattern espelha tests/integration/api/starred-hands.test.ts mas estende com
// imagens. Mockamos storage + spotImageStorage.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getGrindSession: vi.fn(),
    getSessionTournament: vi.fn(),
    createStarredHand: vi.fn(),
    getStarredHand: vi.fn(),
    listStarredHands: vi.fn(),
    deleteStarredHand: vi.fn(),
    countStarredHandsByTournament: vi.fn(),
    countStarredHandsBySession: vi.fn(),
  },
}));

// Service de storage de imagens — modulo NAO existe ainda.
vi.mock('../../../server/services/spotImageStorage', () => ({
  createSpotImageStorage: vi.fn(),
  spotImageStorage: {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  },
}));

// @ts-expect-error - export pode nao existir ainda
import { handleCreateStarredHand } from '../../../server/routes/cooldown';
import { storage } from '../../../server/storage';
// @ts-expect-error - modulo nao existe ainda (red phase)
import { spotImageStorage } from '../../../server/services/spotImageStorage';

beforeEach(() => {
  vi.clearAllMocks();

  // Defaults: sessao ativa (nao completed), session_tournament valido,
  // caps zerados, storage.put funciona.
  (storage.getGrindSession as any).mockResolvedValue({
    id: 'ses_1',
    userId: 'USER-0001',
    status: 'active',
  });
  (storage.getSessionTournament as any).mockResolvedValue({
    id: 'st_1',
    sessionId: 'ses_1',
    userId: 'USER-0001',
  });
  (storage.countStarredHandsByTournament as any).mockResolvedValue(0);
  (storage.countStarredHandsBySession as any).mockResolvedValue(0);
  (spotImageStorage.put as any).mockResolvedValue({
    key: 'USER-0001/ses_1/abc123.png',
    size: 1024,
  });
  (storage.createStarredHand as any).mockImplementation(async (input: any) => ({
    id: 'sh_NEW',
    ...input,
    createdAt: new Date().toISOString(),
  }));
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    file: undefined,
    query: {},
    params: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  res.setHeader = (k: string, v: any) => {
    res.headers[k] = v;
    return res;
  };
  return res;
}

const validBody = {
  sessionId: 'ses_1',
  sessionTournamentId: 'st_1',
  cooldownLogId: null,
  type: 'tilt',
  spot: 'river',
  notes: 'AKs vs JJ no river',
};

// PNG magic bytes valido
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00,
]);

const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
  0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00, 0xff, 0xd9,
]);

const WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  0x18, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d,
]);

const GIF_BYTES = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x37, 0x61,
  0x01, 0x00, 0x01, 0x00,
]);

// Helper para construir multer-style req.file
function makeFile(buffer: Buffer, mimeFromMulter: string, filename = 'screenshot.png') {
  return {
    fieldname: 'file',
    originalname: filename,
    encoding: '7bit',
    mimetype: mimeFromMulter, // Vem do multer (Content-Type do cliente)
    buffer,
    size: buffer.length,
  };
}

// =============================================================================
// Auth
// =============================================================================

describe('POST /api/starred-hands com imagem - auth', () => {
  it('401 sem req.user', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        user: undefined,
        body: validBody,
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(spotImageStorage.put).not.toHaveBeenCalled();
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Backward-compat: body sem imagem
// =============================================================================

describe('POST /api/starred-hands - body sem imagem (legacy compat)', () => {
  it('201 quando nenhum file presente — fluxo legado preservado', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({ body: validBody, file: undefined }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    // Storage de imagem NAO chamado quando sem file
    expect(spotImageStorage.put).not.toHaveBeenCalled();
    // createStarredHand chamado SEM image_key
    const call = (storage.createStarredHand as any).mock.calls[0][0];
    expect(call.imageKey ?? null).toBeNull();
  });
});

// =============================================================================
// Happy paths com imagem
// =============================================================================

describe('POST /api/starred-hands com imagem - happy paths', () => {
  it('201 com PNG valido — persiste image_key/mime/size', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(spotImageStorage.put).toHaveBeenCalledTimes(1);

    const putCall = (spotImageStorage.put as any).mock.calls[0][0];
    expect(putCall.userId).toBe('USER-0001');
    expect(putCall.sessionId).toBe('ses_1');
    expect(putCall.ext).toBe('png');
    expect(Buffer.isBuffer(putCall.buffer)).toBe(true);
    expect(putCall.mime).toBe('image/png');

    const insertCall = (storage.createStarredHand as any).mock.calls[0][0];
    expect(insertCall.imageKey).toBe('USER-0001/ses_1/abc123.png');
    expect(insertCall.imageMime).toBe('image/png');
    expect(insertCall.imageSize).toBe(1024);
    // Decisao founder #3: width/height sempre null fase 1.
    expect(insertCall.imageWidth ?? null).toBeNull();
    expect(insertCall.imageHeight ?? null).toBeNull();
  });

  it('201 com JPEG valido', async () => {
    (spotImageStorage.put as any).mockResolvedValue({
      key: 'USER-0001/ses_1/xyz.jpeg',
      size: JPEG_BYTES.length,
    });

    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        file: makeFile(JPEG_BYTES, 'image/jpeg'),
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    const insertCall = (storage.createStarredHand as any).mock.calls[0][0];
    expect(insertCall.imageMime).toBe('image/jpeg');
  });

  it('201 com WebP valido', async () => {
    (spotImageStorage.put as any).mockResolvedValue({
      key: 'USER-0001/ses_1/wbp.webp',
      size: WEBP_BYTES.length,
    });

    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        file: makeFile(WEBP_BYTES, 'image/webp'),
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    const insertCall = (storage.createStarredHand as any).mock.calls[0][0];
    expect(insertCall.imageMime).toBe('image/webp');
  });
});

// =============================================================================
// Validacao MIME — magic bytes overrides Content-Type
// =============================================================================

describe('POST /api/starred-hands com imagem - magic bytes validacao', () => {
  it('400 quando file eh GIF (nao whitelisted), independente do Content-Type', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        // Cliente mente: manda Content-Type image/png em arquivo GIF.
        // Magic bytes pegam — rejeita 400.
        file: makeFile(GIF_BYTES, 'image/png', 'fake.png'),
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(spotImageStorage.put).not.toHaveBeenCalled();
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });

  it('400 quando file eh texto puro (Content-Type image/png mentiroso)', async () => {
    const TEXT = Buffer.from('Lorem ipsum sem qualquer magic byte de imagem');
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        file: makeFile(TEXT, 'image/png', 'definitely-not-image.png'),
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 quando Content-Type explicito text/plain (multer fileFilter rejeitaria primeiro, mas backup defesa)', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        file: makeFile(Buffer.from('hello world'), 'text/plain', 'notes.txt'),
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(spotImageStorage.put).not.toHaveBeenCalled();
  });

  it(
    '201 quando Content-Type cliente diz image/png mas magic bytes sao JPEG — usa magic bytes (decisao founder #2)',
    async () => {
      // Cliente envia .png mas o conteudo eh JPEG (caso comum: usuario renomeou).
      // Servidor confia em magic bytes e persiste image_mime: "image/jpeg".
      (spotImageStorage.put as any).mockResolvedValue({
        key: 'USER-0001/ses_1/realjpeg.jpeg',
        size: JPEG_BYTES.length,
      });

      const res = makeRes();
      await handleCreateStarredHand(
        makeReq({
          body: validBody,
          file: makeFile(JPEG_BYTES, 'image/png', 'fake.png'),
        }) as any,
        res,
      );

      expect(res.statusCode).toBe(201);
      const insertCall = (storage.createStarredHand as any).mock.calls[0][0];
      // MIME persistido eh o REAL (do magic bytes), nao o do cliente
      expect(insertCall.imageMime).toBe('image/jpeg');

      // Storage.put recebeu ext alinhado com magic bytes
      const putCall = (spotImageStorage.put as any).mock.calls[0][0];
      expect(putCall.ext).toBe('jpeg');
      expect(putCall.mime).toBe('image/jpeg');
    },
  );
});

// =============================================================================
// Validacao tamanho
// =============================================================================

describe('POST /api/starred-hands com imagem - tamanho', () => {
  it('413 quando imagem > 5MB (caso multer nao tenha cortado antes)', async () => {
    // Multer normalmente rejeita pelo limits.fileSize (5MB) e middleware
    // retorna 413. Se passar (config errada), handler ainda rejeita.
    const oversized = Buffer.alloc(6 * 1024 * 1024); // 6MB
    // Preenche com PNG magic bytes para passar o magic bytes check
    oversized.set(PNG_BYTES.slice(0, 8), 0);

    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        file: makeFile(oversized, 'image/png'),
      }) as any,
      res,
    );

    // 413 (Payload Too Large) eh o canonico; 400 tambem aceitavel.
    expect([400, 413]).toContain(res.statusCode);
    expect(spotImageStorage.put).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-08: sessao completed bloqueia (decisao founder #1)
// =============================================================================

describe('POST /api/starred-hands com imagem - sessao completed (RF-08)', () => {
  it('409 com code "session_completed" quando session.status === "completed"', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
      status: 'completed', // sessao concluida
    });

    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('session_completed');
    expect(spotImageStorage.put).not.toHaveBeenCalled();
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });

  it('409 tambem para body sem imagem em sessao completed', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
      status: 'completed',
    });

    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({ body: validBody, file: undefined }) as any,
      res,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('session_completed');
  });
});

// =============================================================================
// Caps
// =============================================================================

describe('POST /api/starred-hands com imagem - cap 3/torneio', () => {
  it('409 quando sessionTournament ja tem 3 stars', async () => {
    (storage.countStarredHandsByTournament as any).mockResolvedValue(3);

    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );

    // Spec usa "star_limit_reached" (existente). Founder pediu 409 cap.
    // Aceitamos 400 OU 409 com code correto — Implementer alinha com endpoints-index.md.
    expect([400, 409]).toContain(res.statusCode);
    expect(res.body.code).toBe('star_limit_reached');
    expect(spotImageStorage.put).not.toHaveBeenCalled();
  });
});

describe('POST /api/starred-hands com imagem - cap 10/sessao cross-tournament', () => {
  it('409 quando sessao ja tem 10 stars (somando todos os torneios)', async () => {
    // 0 no torneio especifico, 10 na sessao total — bloqueia
    (storage.countStarredHandsByTournament as any).mockResolvedValue(0);
    (storage.countStarredHandsBySession as any).mockResolvedValue(10);

    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );

    expect([400, 409]).toContain(res.statusCode);
    expect(res.body.code).toBe('session_spot_limit_reached');
    expect(spotImageStorage.put).not.toHaveBeenCalled();
  });

  it('201 quando sessao tem 9 stars (cap 10 ainda nao atingido)', async () => {
    (storage.countStarredHandsByTournament as any).mockResolvedValue(0);
    (storage.countStarredHandsBySession as any).mockResolvedValue(9);

    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
  });
});

// =============================================================================
// Ownership / 404
// =============================================================================

describe('POST /api/starred-hands com imagem - ownership', () => {
  it('404 quando session_tournament eh de outro user (mascarado, nao 403)', async () => {
    // Lessons learned ponto 6 + Spec RF-10: sempre 404 para evitar enumeration.
    (storage.getSessionTournament as any).mockResolvedValue({
      id: 'st_1',
      sessionId: 'ses_1',
      userId: 'USER-OTHER',
    });

    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(403);
  });

  it('404 quando sessionTournamentId nao existe', async () => {
    (storage.getSessionTournament as any).mockResolvedValue(null);

    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(404);
  });
});

// =============================================================================
// Path traversal em form fields (defesa em profundidade)
// =============================================================================

describe('POST /api/starred-hands com imagem - sanitizacao de form fields', () => {
  it('400 quando sessionId tem .. (path traversal injetado)', async () => {
    // O sessionId vai ate o storage.put({sessionId, ...}) que constroi path.
    // Defesa em profundidade: rejeitar antes de chegar ao FS.
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: { ...validBody, sessionId: '../../etc' },
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(spotImageStorage.put).not.toHaveBeenCalled();
  });
});

// =============================================================================
// captured_during
// =============================================================================

describe('POST /api/starred-hands com imagem - captured_during', () => {
  it('persiste capturedDuring="grind-live" quando body envia esse valor', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: { ...validBody, capturedDuring: 'grind-live' },
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    const insertCall = (storage.createStarredHand as any).mock.calls[0][0];
    expect(insertCall.capturedDuring).toBe('grind-live');
  });

  it('persiste capturedDuring="cooldown" quando body envia esse valor', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: { ...validBody, capturedDuring: 'cooldown' },
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    const insertCall = (storage.createStarredHand as any).mock.calls[0][0];
    expect(insertCall.capturedDuring).toBe('cooldown');
  });

  it('default capturedDuring="cooldown" quando ausente do body (back-compat)', async () => {
    // Decisao founder #4: backfill row existente para 'cooldown'.
    // Default Zod tambem aplica para body novo sem campo (deprecation gradual).
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody, // sem capturedDuring
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    const insertCall = (storage.createStarredHand as any).mock.calls[0][0];
    expect(insertCall.capturedDuring).toBe('cooldown');
  });

  it('400 para capturedDuring fora do enum (ex: "warmup")', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: { ...validBody, capturedDuring: 'warmup' },
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(spotImageStorage.put).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Cleanup transacional
// =============================================================================

describe('POST /api/starred-hands com imagem - cleanup transacional', () => {
  it('chama Storage.delete(key) quando INSERT row falha (NFR Disponibilidade)', async () => {
    // ADR-057 secao Detalhes 6: salvar arquivo PRIMEIRO; se INSERT falhar,
    // delete arquivo em catch.
    (storage.createStarredHand as any).mockRejectedValue(
      new Error('DB connection lost'),
    );

    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({
        body: validBody,
        file: makeFile(PNG_BYTES, 'image/png'),
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(500);
    // Cleanup chamado — arquivo orfao removido
    expect(spotImageStorage.delete).toHaveBeenCalledWith(
      'USER-0001/ses_1/abc123.png',
    );
  });
});
