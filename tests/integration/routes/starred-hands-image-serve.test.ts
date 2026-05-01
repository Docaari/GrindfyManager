import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Spot-Screenshots — GET /api/starred-hands/:id/image
//
// Spec: Docs/specs/spot-screenshots.md (RF-10, EC-07/08/09)
// ADR : Docs/architecture/decisions/057-spot-image-storage-abstraction.md
// Sequence: Docs/architecture/diagrams/spot-screenshots-sequences.mermaid (Fluxo 2)
//
// Handler exportado de server/routes/cooldown.ts (NAO existe ainda):
//   handleGetStarredHandImage(req, res)
//
// Comportamento:
//   1. Auth (req.user)
//   2. SELECT row de starred_hands
//   3. row null OR row.userId !== req.user.userPlatformId -> 404 (nao 403)
//   4. row.imageKey null -> 404 (spot legado sem imagem)
//   5. Validar key (regex !contains '..' && !startsWith '/' && !contains '\\')
//   6. spotImageStorage.get(key)
//      - retornou null (FS sumiu): caller deve responder 500 com log
//        (lessons-learned: distingue "no rows" de "DB explodiu" — aqui FS sumiu;
//         a especificacao do test-writer pede 500 quando "Storage.get retornou null
//         mas row existe" — interpretacao: backend nao deve mascarar como 404 nem
//         como sucesso. Se a spec preferir 404 graciosa (RF-10 EC-09), ajustar
//         no implementer)
//   7. Headers: Content-Type, Cache-Control: private, max-age=86400, Content-Length
//   8. Body: buffer.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getStarredHand: vi.fn(),
  },
}));

vi.mock('../../../server/services/spotImageStorage', () => ({
  spotImageStorage: {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  },
}));

// @ts-expect-error - export pode nao existir ainda (red phase)
import { handleGetStarredHandImage } from '../../../server/routes/cooldown';
import { storage } from '../../../server/storage';
// @ts-expect-error
import { spotImageStorage } from '../../../server/services/spotImageStorage';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    params: { id: 'sh_1' },
    query: {},
    body: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    headers: {},
    ended: false,
    sentBuffer: null as Buffer | null,
  };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  res.setHeader = (k: string, v: any) => {
    res.headers[k.toLowerCase()] = v;
    return res;
  };
  res.set = res.setHeader; // alias Express
  res.end = (chunk?: Buffer) => {
    res.ended = true;
    if (chunk) res.sentBuffer = chunk;
    return res;
  };
  res.send = (chunk?: any) => {
    res.ended = true;
    if (Buffer.isBuffer(chunk)) res.sentBuffer = chunk;
    else res.body = chunk;
    return res;
  };
  return res;
}

const PNG_FIXTURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

const validRow = {
  id: 'sh_1',
  userId: 'USER-0001',
  sessionId: 'ses_1',
  sessionTournamentId: 'st_1',
  type: 'tilt',
  spot: 'river',
  imageKey: 'USER-0001/ses_1/abc.png',
  imageMime: 'image/png',
  imageSize: PNG_FIXTURE.length,
  imageWidth: null,
  imageHeight: null,
  capturedDuring: 'cooldown',
};

// =============================================================================
// Auth
// =============================================================================

describe('GET /api/starred-hands/:id/image - auth', () => {
  it('401 sem req.user', async () => {
    const res = makeRes();
    await handleGetStarredHandImage(
      makeReq({ user: undefined }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(spotImageStorage.get).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Happy path
// =============================================================================

describe('GET /api/starred-hands/:id/image - happy path', () => {
  beforeEach(() => {
    (storage.getStarredHand as any).mockResolvedValue(validRow);
    (spotImageStorage.get as any).mockResolvedValue({
      buffer: PNG_FIXTURE,
      mime: 'image/png',
    });
  });

  it('200 + Content-Type correto + Cache-Control private', async () => {
    const res = makeRes();
    await handleGetStarredHandImage(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toMatch(/image\/png/i);
    // RF-10: Cache-Control private, max-age=86400
    expect(String(res.headers['cache-control'])).toContain('private');
    expect(String(res.headers['cache-control'])).toContain('max-age=86400');
  });

  it('200 + body com bytes exatos do fixture (Buffer.equals)', async () => {
    const res = makeRes();
    await handleGetStarredHandImage(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.sentBuffer).not.toBeNull();
    expect(Buffer.isBuffer(res.sentBuffer!)).toBe(true);
    expect(res.sentBuffer!.equals(PNG_FIXTURE)).toBe(true);
  });

  it('chama spotImageStorage.get(key) com a key da row', async () => {
    const res = makeRes();
    await handleGetStarredHandImage(makeReq() as any, res);
    expect(spotImageStorage.get).toHaveBeenCalledWith(
      'USER-0001/ses_1/abc.png',
    );
  });
});

// =============================================================================
// Not found / Ownership
// =============================================================================

describe('GET /api/starred-hands/:id/image - not found', () => {
  it('404 quando spot nao existe', async () => {
    (storage.getStarredHand as any).mockResolvedValue(null);

    const res = makeRes();
    await handleGetStarredHandImage(makeReq() as any, res);
    expect(res.statusCode).toBe(404);
    expect(spotImageStorage.get).not.toHaveBeenCalled();
  });

  it('404 quando spot existe mas pertence a outro user (NAO 403 — evita enumeration)', async () => {
    // RF-10 spec: sempre 404. Lessons-learned ponto 6.
    (storage.getStarredHand as any).mockResolvedValue({
      ...validRow,
      userId: 'USER-OTHER',
    });

    const res = makeRes();
    await handleGetStarredHandImage(makeReq() as any, res);
    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(403);
    expect(spotImageStorage.get).not.toHaveBeenCalled();
  });

  it('404 quando spot existe mas imageKey eh null (spot legado sem imagem)', async () => {
    (storage.getStarredHand as any).mockResolvedValue({
      ...validRow,
      imageKey: null,
      imageMime: null,
      imageSize: null,
    });

    const res = makeRes();
    await handleGetStarredHandImage(makeReq() as any, res);
    expect(res.statusCode).toBe(404);
    expect(spotImageStorage.get).not.toHaveBeenCalled();
  });
});

// =============================================================================
// FS missing — row existe mas arquivo sumiu
// =============================================================================

describe('GET /api/starred-hands/:id/image - FS inconsistente', () => {
  it('500 quando Storage.get retornou null mas row existe (FS sumiu — log error)', async () => {
    // O test-writer prompt pede 500 explicito (distinguir "no rows" de "DB
    // explodiu"; aqui FS sumiu). A spec RF-10 EC-09 sugere 404 graciosa, mas o
    // contrato pedido pelo test-writer eh 500. Implementer pode escolher 404
    // mais gracioso e atualizar este teste no review se preferir alinhar com spec.
    (storage.getStarredHand as any).mockResolvedValue(validRow);
    (spotImageStorage.get as any).mockResolvedValue(null);

    const res = makeRes();
    await handleGetStarredHandImage(makeReq() as any, res);

    // Aceita 500 (test-writer prompt) OU 404 (spec EC-09) — mas NUNCA 200.
    expect([404, 500]).toContain(res.statusCode);
    expect(res.statusCode).not.toBe(200);
  });
});
