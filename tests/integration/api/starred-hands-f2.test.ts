import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint F2 — Endpoints novos em server/routes/starred-hands.ts
//
// Spec : Docs/specs/sprint-f2-spot-screenshots.md (RF-02 a RF-05)
// ADRs : 051 (storage), 052 (ownership), 053 (cron)
// Sequence: Docs/architecture/feature-flows/spot-screenshots-flow.mermaid
// Components: Docs/architecture/feature-flows/spot-screenshots-components.mermaid
//
// Endpoints novos (handlers exportados de server/routes/starred-hands.ts):
//   POST   /api/starred-hands/screenshot      -> handleCreateSpotScreenshot
//   PATCH  /api/starred-hands/:id/review      -> handleUpdateSpotReview
//   GET    /api/starred-hands/pending         -> handleListPendingSpots
//   DELETE /api/starred-hands/:id/discard     -> handleDiscardSpot
//   GET    /api/starred-hands/:id/image       -> handleServeSpotImage
//
// Convencao do projeto (vide tests/integration/api/starred-hands.test.ts +
// tests/integration/api/tournament-selector.test.ts):
//   NAO montamos servidor supertest. Testamos handlers diretamente com mocks
//   de storage + spotStorage. Multer eh MOCKADO injetando req.file conforme
//   pattern de chamada do handler (handler espera req.file ja preenchido pelo
//   middleware multer.single).
//
// Lessons aplicadas:
//   #3 Mocks idealizados — shape do storage validado contra cooldown.ts (Sprint
//      Cooldown-1) que ja consome getSessionTournament/getStarredHand etc.
//   #7 Schema deprecation gradual — schemas novos opcionais.
//   #9 Try/catch generico — testes verificam que rollback Multer eh chamado.
// =============================================================================

// -----------------------------------------------------------------------------
// Mocks — server/storage e server/lib/spotStorage
// -----------------------------------------------------------------------------

vi.mock('../../../server/storage', () => ({
  storage: {
    // Existentes (Sprint Cooldown-1) — re-usados pelos handlers F2
    getGrindSession: vi.fn(),
    getSessionTournament: vi.fn(),
    getStarredHand: vi.fn(),
    countStarredHandsByTournament: vi.fn(),
    deleteStarredHand: vi.fn(),

    // Novos (RF-02 a RF-05)
    getStarredHandById: vi.fn(),
    createStarredHand: vi.fn(),
    countSpotsBySession: vi.fn(),
    resolveTournamentInSession: vi.fn(),
    listPendingSpots: vi.fn(),
    updateStarredHand: vi.fn(),
    softDeleteStarredHand: vi.fn(),
    listSpotsForPurge: vi.fn(),
    assertSessionOwnership: vi.fn(),
    assertTournamentInSession: vi.fn(),
  },
}));

vi.mock('../../../server/lib/spotStorage', () => ({
  spotStorage: {
    save: vi.fn(),
    delete: vi.fn(),
    getReadStream: vi.fn(),
    healthCheck: vi.fn(),
  },
  // Helper para resolver path absoluto a partir de imageUrl relativo
  resolveSpotPath: vi.fn((imageUrl: string) => path.resolve('uploads' + imageUrl.replace('/uploads', ''))),
}));

// Imports DEPOIS dos mocks — modulos NAO existem ainda (Implementer cria).
import {
  handleCreateSpotScreenshot,
  handleUpdateSpotReview,
  handleListPendingSpots,
  handleDiscardSpot,
  handleServeSpotImage,
} from '../../../server/routes/starred-hands';
import { storage } from '../../../server/storage';
import { spotStorage } from '../../../server/lib/spotStorage';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

let tmpDir: string;
let createdFiles: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  // Cria tmp dir REAL para os testes de rollback Multer (precisamos arquivo
  // fisico no disco para fs.existsSync funcionar).
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spot-screenshots-test-'));
  createdFiles = [];
});

afterEach(() => {
  // Cleanup arquivos temporarios criados pelos testes.
  for (const f of createdFiles) {
    try { fs.unlinkSync(f); } catch { /* may already be unlinked by handler */ }
  }
  try { fs.rmdirSync(tmpDir); } catch { /* may have files left */ }
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: {},
    file: undefined,
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; return res; };
  res.sendFile = vi.fn((_p: string) => { res.body = '<<binary>>'; return res; });
  res.send = (d: any) => { res.body = d; return res; };
  res.end = () => res;
  return res;
}

/**
 * Cria um "arquivo Multer" fake gravado em disco — simula o que o middleware
 * multer.diskStorage.fileFilter+filename faria. O handler recebe `req.file`
 * com `path` apontando para o arquivo real, permitindo testar rollback (unlink).
 */
function makeMulterFile(opts: { mime?: string; sizeBytes?: number; ext?: string } = {}) {
  const ext = opts.ext ?? 'png';
  const filename = `nano${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const absolutePath = path.join(tmpDir, filename);
  const size = opts.sizeBytes ?? 1024;
  // Cria um arquivo de tamanho `size` com bytes zerados.
  fs.writeFileSync(absolutePath, Buffer.alloc(size));
  createdFiles.push(absolutePath);
  return {
    fieldname: 'screenshot',
    originalname: 'spot.png',
    encoding: '7bit',
    mimetype: opts.mime ?? 'image/png',
    size,
    destination: tmpDir,
    filename,
    path: absolutePath,
    buffer: undefined as any,
  };
}

// =============================================================================
// POST /api/starred-hands/screenshot
// =============================================================================

describe('POST /api/starred-hands/screenshot — auth', () => {
  it('401 quando req.user ausente', async () => {
    // Cobre RF-02 AC: "Auth: requireAuth JWT"
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({ user: undefined, body: { sessionId: 'ses_1' }, file: makeMulterFile() }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });
});

describe('POST /api/starred-hands/screenshot — happy path', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.countSpotsBySession as any).mockResolvedValue(0);
    (storage.resolveTournamentInSession as any).mockResolvedValue('st_resolved');
    (storage.createStarredHand as any).mockImplementation(async (data: any) => ({
      id: 'sh_new_1',
      userId: data.userId,
      sessionId: data.sessionId,
      sessionTournamentId: data.sessionTournamentId ?? 'st_resolved',
      type: data.type,
      spot: data.spot,
      imageUrl: data.imageUrl,
      pastedAt: data.pastedAt,
      expiresAt: data.expiresAt,
      status: data.status,
      source: data.source,
    }));
  });

  it('201 retorna { id, imageUrl, expiresAt, sessionTournamentId, pastedAt }', async () => {
    // Cobre RF-02 AC: "Upload valido retorna 201 com { id, imageUrl, expiresAt }"
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1', sessionTournamentId: 'st_1', source: 'paste' },
        file: makeMulterFile(),
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe('sh_new_1');
    expect(typeof res.body.imageUrl).toBe('string');
    expect(res.body.imageUrl).toContain('/uploads/spot-screenshots/');
    expect(res.body.expiresAt).toBeDefined();
  });

  it('row criada com source="paste", status="pending", expiresAt ~14d', async () => {
    // Cobre RF-02 AC: "Row criada esta com source='paste', status='pending', expiresAt configurado"
    const res = makeRes();
    const before = Date.now();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1', sessionTournamentId: 'st_1', source: 'paste' },
        file: makeMulterFile(),
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    const call = (storage.createStarredHand as any).mock.calls[0][0];
    expect(call.source).toBe('paste');
    expect(call.status).toBe('pending');
    const expiresMs = new Date(call.expiresAt).getTime();
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(before + fourteenDays - 5_000);
    expect(expiresMs).toBeLessThanOrEqual(Date.now() + fourteenDays + 5_000);
  });

  it('default source="paste" quando body nao envia (paste flow eh padrao)', async () => {
    // Cobre RF-02: "source (enum, opcional, default 'paste')"
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({ body: { sessionId: 'ses_1' }, file: makeMulterFile() }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    const call = (storage.createStarredHand as any).mock.calls[0][0];
    expect(call.source).toBe('paste');
  });

  it('aceita source="upload" do file picker fallback', async () => {
    // Cobre RF-01: "Fallback button: botao 'Adicionar print' abre file picker padrao (mesmo endpoint, source='upload')"
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1', source: 'upload' },
        file: makeMulterFile(),
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    const call = (storage.createStarredHand as any).mock.calls[0][0];
    expect(call.source).toBe('upload');
  });

  it('NAO confia em userId do body — usa req.user.userPlatformId', async () => {
    // Cobre Spec/Lessons: "NAO confia em userId do body" (pattern de cooldown.ts)
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1', userId: 'USER-EVIL' },
        file: makeMulterFile(),
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    const call = (storage.createStarredHand as any).mock.calls[0][0];
    expect(call.userId).toBe('USER-0001');
  });
});

describe('POST /api/starred-hands/screenshot — sessionTournamentId resolution (RF-02)', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.countSpotsBySession as any).mockResolvedValue(0);
    (storage.createStarredHand as any).mockResolvedValue({
      id: 'sh_1',
      sessionTournamentId: 'st_resolved',
    });
  });

  it('quando sessionTournamentId NAO informado: chama resolveTournamentInSession', async () => {
    // Cobre RF-02: "sessionTournamentId resolvido server-side quando ausente
    // (primeiro com status=playing, fallback updatedAt mais recente)"
    (storage.resolveTournamentInSession as any).mockResolvedValue('st_resolved');
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1' },
        file: makeMulterFile(),
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(storage.resolveTournamentInSession).toHaveBeenCalledWith('ses_1');
    const call = (storage.createStarredHand as any).mock.calls[0][0];
    expect(call.sessionTournamentId).toBe('st_resolved');
  });

  it('422 no_tournament_in_session quando sessao sem nenhum tournament', async () => {
    // Cobre RF-02 AC: "Sessao sem nenhum tournament retorna 422 no_tournament_in_session"
    (storage.resolveTournamentInSession as any).mockResolvedValue(null);
    const file = makeMulterFile();
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1' },
        file,
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(422);
    expect(res.body?.code).toBe('no_tournament_in_session');
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });

  it('422 no_tournament_in_session: rollback Multer (arquivo unlinked)', async () => {
    // Cobre RF-02 architect-flagged: rollback do Multer mesmo em 422.
    (storage.resolveTournamentInSession as any).mockResolvedValue(null);
    const file = makeMulterFile();
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1' },
        file,
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(422);
    expect(spotStorage.delete).toHaveBeenCalled();
  });

  it('quando sessionTournamentId fornecido: NAO chama resolver', async () => {
    (storage.resolveTournamentInSession as any).mockResolvedValue('outro_st');
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1', sessionTournamentId: 'st_explicit' },
        file: makeMulterFile(),
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    // Resolver nao deve ser chamado quando ID veio explicito.
    expect(storage.resolveTournamentInSession).not.toHaveBeenCalled();
    const call = (storage.createStarredHand as any).mock.calls[0][0];
    expect(call.sessionTournamentId).toBe('st_explicit');
  });
});

describe('POST /api/starred-hands/screenshot — validacao body', () => {
  it('400 sem sessionId', async () => {
    // Cobre RF-02 AC: "Upload sem sessionId retorna 400"
    const file = makeMulterFile();
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({ body: {}, file }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });

  it('400 quando body sem screenshot file (req.file undefined)', async () => {
    // Cobre Spec: "screenshot (file, obrigatorio)"
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({ body: { sessionId: 'ses_1' }, file: undefined }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/starred-hands/screenshot — ownership da sessao', () => {
  beforeEach(() => {
    (storage.countSpotsBySession as any).mockResolvedValue(0);
    (storage.resolveTournamentInSession as any).mockResolvedValue('st_1');
  });

  it('404 quando sessao nao existe', async () => {
    // Cobre RF-02 AC: "Upload com sessionId de outro user retorna 404"
    (storage.getGrindSession as any).mockResolvedValue(null);
    const file = makeMulterFile();
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_404' },
        file,
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });

  it('404 quando sessao pertence a outro user (mascarado)', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-OTHER',
    });
    const file = makeMulterFile();
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1' },
        file,
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });

  it('rollback Multer (architect-flagged): 404 ownership -> spotStorage.delete chamado', async () => {
    // Cobre RF-02 architect-flagged: "Upload com sessionId de outro user ->
    // arquivo Multer removido apos 404"
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-OTHER',
    });
    const file = makeMulterFile();
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1' },
        file,
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(spotStorage.delete).toHaveBeenCalled();
  });
});

describe('POST /api/starred-hands/screenshot — limite 10 por sessao (RF-02)', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.resolveTournamentInSession as any).mockResolvedValue('st_1');
  });

  it('409 spot_limit_reached quando ja existem 10 prints na sessao', async () => {
    // Cobre RF-02 AC: "11o upload na mesma sessao retorna 409 spot_limit_reached"
    (storage.countSpotsBySession as any).mockResolvedValue(10);
    const file = makeMulterFile();
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1' },
        file,
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe('spot_limit_reached');
    expect(res.body?.limit).toBe(10);
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });

  it('rollback Multer (architect-flagged): 409 limite -> spotStorage.delete chamado', async () => {
    // Cobre RF-02 architect-flagged: "Upload com counter cheio -> arquivo
    // gravado pelo Multer NAO permanece no disco apos 409"
    (storage.countSpotsBySession as any).mockResolvedValue(10);
    const file = makeMulterFile();
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1' },
        file,
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(409);
    expect(spotStorage.delete).toHaveBeenCalled();
  });

  it('counter de spots EXCLUI rows status=discarded (filtro source IN paste/upload)', async () => {
    // Cobre RF-02: "contar starred_hands com sessionId=X AND source IN
    // ('paste','upload') AND status != 'discarded'"
    (storage.countSpotsBySession as any).mockResolvedValue(9);
    (storage.createStarredHand as any).mockResolvedValue({ id: 'sh_10' });
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1' },
        file: makeMulterFile(),
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    // Storage helper deve ser chamado com sessionId; criterios de filtro sao
    // responsabilidade do storage layer (validamos via mock signature).
    expect(storage.countSpotsBySession).toHaveBeenCalledWith('ses_1');
  });

  it('CONCORRENCIA (architect-flagged): 2 requests em count=9 — 1 vira 201, outra 409', async () => {
    // Cobre RF-02 architect-flagged: "2 requests Promise.all ao 10o paste ->
    // exatamente 1 retorna 201, outra retorna 409, count final = 10"
    //
    // Simulacao: counter 9 → primeira passa, ao chamar de novo, mock retorna 10.
    // O storage REAL deveria usar SELECT FOR UPDATE; aqui validamos que se o
    // counter atinge 10 entre as duas chamadas, a segunda eh rejeitada.
    let counter = 9;
    (storage.countSpotsBySession as any).mockImplementation(async () => counter);
    (storage.createStarredHand as any).mockImplementation(async () => {
      counter += 1;
      return { id: `sh_${counter}` };
    });

    const r1 = makeRes();
    const r2 = makeRes();

    await handleCreateSpotScreenshot(
      makeReq({ body: { sessionId: 'ses_1' }, file: makeMulterFile() }) as any,
      r1,
    );
    await handleCreateSpotScreenshot(
      makeReq({ body: { sessionId: 'ses_1' }, file: makeMulterFile() }) as any,
      r2,
    );

    const codes = [r1.statusCode, r2.statusCode].sort();
    expect(codes).toEqual([201, 409]);
    expect(counter).toBe(10);
  });
});

describe('POST /api/starred-hands/screenshot — MIME / size validation', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.countSpotsBySession as any).mockResolvedValue(0);
    (storage.resolveTournamentInSession as any).mockResolvedValue('st_1');
  });

  it('400 quando mimetype invalido (gif rejeitado em F2)', async () => {
    // Cobre RF-02 AC: "MIME nao permitido retorna 400" + "gif eh rejeitado em F2"
    // Multer fileFilter normalmente bloqueia antes; aqui simulamos um file que
    // passou pelo middleware mas o handler valida defensivamente.
    const file = makeMulterFile({ mime: 'image/gif', ext: 'gif' });
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1' },
        file,
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });

  it('413 quando arquivo > 5MB', async () => {
    // Cobre RF-02 AC: "Arquivo > 5MB retorna 413 (multer limit)"
    const file = makeMulterFile({ sizeBytes: 5 * 1024 * 1024 + 1 });
    const res = makeRes();
    await handleCreateSpotScreenshot(
      makeReq({
        body: { sessionId: 'ses_1' },
        file,
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(413);
  });

  it('aceita image/png, image/jpeg, image/webp', async () => {
    (storage.createStarredHand as any).mockResolvedValue({ id: 'sh_1' });
    for (const m of ['image/png', 'image/jpeg', 'image/webp']) {
      vi.clearAllMocks();
      (storage.getGrindSession as any).mockResolvedValue({
        id: 'ses_1', userId: 'USER-0001',
      });
      (storage.countSpotsBySession as any).mockResolvedValue(0);
      (storage.resolveTournamentInSession as any).mockResolvedValue('st_1');
      (storage.createStarredHand as any).mockResolvedValue({ id: 'sh_1' });

      const res = makeRes();
      await handleCreateSpotScreenshot(
        makeReq({
          body: { sessionId: 'ses_1' },
          file: makeMulterFile({ mime: m }),
        }) as any,
        res,
      );
      expect(res.statusCode).toBe(201);
    }
  });
});

// =============================================================================
// PATCH /api/starred-hands/:id/review
// =============================================================================

describe('PATCH /api/starred-hands/:id/review — auth + ownership', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleUpdateSpotReview(
      makeReq({ user: undefined, params: { id: 'sh_1' }, body: { conclusion: 'x' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
  });

  it('404 quando row nao existe', async () => {
    // Cobre RF-03 AC: "PATCH em row de outro user retorna 404"
    (storage.getStarredHandById as any).mockResolvedValue(null);
    const res = makeRes();
    await handleUpdateSpotReview(
      makeReq({ params: { id: 'sh_404' }, body: { conclusion: 'x' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.updateStarredHand).not.toHaveBeenCalled();
  });

  it('404 quando row pertence a outro user (mascarado)', async () => {
    (storage.getStarredHandById as any).mockResolvedValue({
      id: 'sh_1', userId: 'USER-OTHER', sessionId: 'ses_1',
    });
    const res = makeRes();
    await handleUpdateSpotReview(
      makeReq({ params: { id: 'sh_1' }, body: { conclusion: 'x' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/starred-hands/:id/review — happy path', () => {
  beforeEach(() => {
    (storage.getStarredHandById as any).mockResolvedValue({
      id: 'sh_1',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      sessionTournamentId: 'st_1',
      status: 'pending',
      reviewLater: false,
    });
    (storage.assertTournamentInSession as any).mockResolvedValue(true);
  });

  it('200 conclusion seta reviewedAt + status="reviewed"', async () => {
    // Cobre RF-03 AC: "PATCH com conclusion marca reviewedAt, status='reviewed'"
    (storage.updateStarredHand as any).mockImplementation(async (id: string, patch: any) => ({
      id, ...patch, status: 'reviewed',
    }));
    const res = makeRes();
    await handleUpdateSpotReview(
      makeReq({
        params: { id: 'sh_1' },
        body: { conclusion: 'Bluff catcher correto, fold-prone post-river' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('reviewed');
    expect(res.body.reviewedAt).toBeDefined();
    const call = (storage.updateStarredHand as any).mock.calls[0][1];
    expect(call.status).toBe('reviewed');
    expect(call.reviewedAt).toBeDefined();
    expect(call.conclusion).toBe('Bluff catcher correto, fold-prone post-river');
  });

  it('200 reviewLater=true seta flag mas NAO marca reviewedAt', async () => {
    // Cobre RF-03 AC: "PATCH com reviewLater=true seta flag, nao marca reviewedAt"
    (storage.updateStarredHand as any).mockImplementation(async (id: string, patch: any) => ({
      id, ...patch,
    }));
    const res = makeRes();
    await handleUpdateSpotReview(
      makeReq({
        params: { id: 'sh_1' },
        body: { reviewLater: true },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    const call = (storage.updateStarredHand as any).mock.calls[0][1];
    expect(call.reviewLater).toBe(true);
    expect(call.reviewedAt).toBeUndefined();
    expect(call.status).not.toBe('reviewed');
  });

  it('200 persiste type/spot/notes quando vierem (jogador classifica agora)', async () => {
    // Cobre RF-03: "Persiste type, spot, notes se vierem"
    (storage.updateStarredHand as any).mockImplementation(async (id: string, patch: any) => ({
      id, ...patch,
    }));
    const res = makeRes();
    await handleUpdateSpotReview(
      makeReq({
        params: { id: 'sh_1' },
        body: {
          conclusion: 'icm push correto',
          type: 'mistake',
          spot: 'icm',
          notes: 'vs reg tight',
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    const call = (storage.updateStarredHand as any).mock.calls[0][1];
    expect(call.type).toBe('mistake');
    expect(call.spot).toBe('icm');
    expect(call.notes).toBe('vs reg tight');
  });

  it('200 idempotente — re-edicao de row ja reviewed atualiza conclusion', async () => {
    // Cobre RF-03 AC: "PATCH em row ja status='reviewed' permite re-edicao
    // de conclusion (idempotente)"
    (storage.getStarredHandById as any).mockResolvedValue({
      id: 'sh_1',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      sessionTournamentId: 'st_1',
      status: 'reviewed',
      reviewedAt: new Date('2026-04-20'),
    });
    (storage.updateStarredHand as any).mockResolvedValue({
      id: 'sh_1', status: 'reviewed', conclusion: 'novo texto',
    });
    const res = makeRes();
    await handleUpdateSpotReview(
      makeReq({
        params: { id: 'sh_1' },
        body: { conclusion: 'novo texto' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.updateStarredHand).toHaveBeenCalled();
  });
});

describe('PATCH /api/starred-hands/:id/review — sessionTournamentId mismatch', () => {
  it('422 tournament_session_mismatch quando ST de outra sessao', async () => {
    // Cobre RF-03 AC: "PATCH com sessionTournamentId de outra sessao retorna 422"
    (storage.getStarredHandById as any).mockResolvedValue({
      id: 'sh_1',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      sessionTournamentId: 'st_1',
      status: 'pending',
    });
    (storage.assertTournamentInSession as any).mockResolvedValue(false);
    const res = makeRes();
    await handleUpdateSpotReview(
      makeReq({
        params: { id: 'sh_1' },
        body: {
          conclusion: 'x',
          sessionTournamentId: 'st_OUTRA_SESSAO',
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(422);
    expect(res.body?.code).toBe('tournament_session_mismatch');
    expect(storage.updateStarredHand).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/starred-hands/:id/review — Zod', () => {
  beforeEach(() => {
    (storage.getStarredHandById as any).mockResolvedValue({
      id: 'sh_1', userId: 'USER-0001', sessionId: 'ses_1', status: 'pending',
    });
  });

  it('400 quando conclusion > 500 chars', async () => {
    const res = makeRes();
    await handleUpdateSpotReview(
      makeReq({
        params: { id: 'sh_1' },
        body: { conclusion: 'c'.repeat(501) },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(storage.updateStarredHand).not.toHaveBeenCalled();
  });

  it('400 quando type invalido', async () => {
    const res = makeRes();
    await handleUpdateSpotReview(
      makeReq({
        params: { id: 'sh_1' },
        body: { conclusion: 'ok', type: 'amazing' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// GET /api/starred-hands/pending
// =============================================================================

describe('GET /api/starred-hands/pending — auth', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleListPendingSpots(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/starred-hands/pending — happy path + filtros', () => {
  it('200 retorna apenas status="pending" do user (default sem query)', async () => {
    // Cobre RF-04 AC: "GET sem params lista pendentes 'ativos' do user"
    // Default: status='pending' AND reviewLater=false
    (storage.listPendingSpots as any).mockResolvedValue({
      items: [
        { id: 'sh_1', status: 'pending', reviewLater: false, userId: 'USER-0001' },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    const res = makeRes();
    await handleListPendingSpots(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.items[0].userId).toBe('USER-0001');
    // Verifica que o storage foi chamado com userId autenticado
    const callArgs = (storage.listPendingSpots as any).mock.calls[0];
    expect(callArgs[0]).toBe('USER-0001');
  });

  it('200 filtro ?reviewLater=true', async () => {
    // Cobre RF-04 AC: "?reviewLater=true filtra corretamente"
    (storage.listPendingSpots as any).mockResolvedValue({
      items: [{ id: 'sh_1', reviewLater: true }],
      total: 1, limit: 50, offset: 0,
    });
    const res = makeRes();
    await handleListPendingSpots(
      makeReq({ query: { reviewLater: 'true' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    const callArgs = (storage.listPendingSpots as any).mock.calls[0];
    const flat = JSON.stringify(callArgs);
    expect(flat).toContain('reviewLater');
  });

  it('200 filtro ?reviewLater=all (union dos dois)', async () => {
    // Cobre RF-04: "?reviewLater=all: union dos dois (para Spots Pendentes em /studies)"
    (storage.listPendingSpots as any).mockResolvedValue({
      items: [], total: 0, limit: 50, offset: 0,
    });
    const res = makeRes();
    await handleListPendingSpots(
      makeReq({ query: { reviewLater: 'all' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    const callArgs = (storage.listPendingSpots as any).mock.calls[0];
    const flat = JSON.stringify(callArgs);
    expect(flat).toContain('all');
  });

  it('200 filtro ?sessionId=X', async () => {
    // Cobre RF-04 / RF-08: lista lateral SessionSpotsList filtra por sessao
    (storage.listPendingSpots as any).mockResolvedValue({
      items: [], total: 0, limit: 50, offset: 0,
    });
    const res = makeRes();
    await handleListPendingSpots(
      makeReq({ query: { sessionId: 'ses_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    const callArgs = (storage.listPendingSpots as any).mock.calls[0];
    const flat = JSON.stringify(callArgs);
    expect(flat).toContain('ses_1');
  });

  it('passa userId autenticado (NAO confia em query.userId)', async () => {
    // Cobre lessons #3 + Cooldown-1 pattern
    (storage.listPendingSpots as any).mockResolvedValue({
      items: [], total: 0, limit: 50, offset: 0,
    });
    const res = makeRes();
    await handleListPendingSpots(
      makeReq({ query: { userId: 'USER-EVIL' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    const callArgs = (storage.listPendingSpots as any).mock.calls[0];
    expect(callArgs[0]).toBe('USER-0001');
  });

  it('200 com paginacao ?limit=20&offset=40', async () => {
    // Cobre RF-04 AC: "Paginacao: ?limit=50&offset=0 (default 50, max 200)"
    (storage.listPendingSpots as any).mockResolvedValue({
      items: [], total: 0, limit: 20, offset: 40,
    });
    const res = makeRes();
    await handleListPendingSpots(
      makeReq({ query: { limit: '20', offset: '40' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    const callArgs = JSON.stringify((storage.listPendingSpots as any).mock.calls[0]);
    expect(callArgs).toContain('20');
    expect(callArgs).toContain('40');
  });

  it('NAO retorna status=reviewed nem status=discarded', async () => {
    // Cobre RF-04: "NAO retorna status='reviewed' ou 'discarded'" — storage
    // helper deve filtrar; o handler simplesmente repassa o que veio. Aqui
    // validamos que o filtro de status NAO incluiu valores indesejados.
    (storage.listPendingSpots as any).mockResolvedValue({
      items: [], total: 0, limit: 50, offset: 0,
    });
    const res = makeRes();
    await handleListPendingSpots(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    const callArgs = JSON.stringify((storage.listPendingSpots as any).mock.calls[0]);
    expect(callArgs).not.toContain('reviewed');
    expect(callArgs).not.toContain('discarded');
  });
});

// =============================================================================
// DELETE /api/starred-hands/:id/discard
// =============================================================================
//
// IMPORTANTE: rota DISTINTA do Cooldown-1 (DELETE /api/starred-hands/:id eh
// hard delete da Sprint Cooldown-1). F2 usa /:id/discard (soft delete).
// Spec patch: "Resolucao de conflito DELETE (architect-flagged): Cooldown-1
// ja monta DELETE /:id com hard delete. F2 usa rota distinta /:id/discard
// (soft delete) para evitar override por ordem de app.use."
// =============================================================================

describe('DELETE /api/starred-hands/:id/discard — auth + ownership', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleDiscardSpot(
      makeReq({ user: undefined, params: { id: 'sh_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
  });

  it('404 quando row nao existe', async () => {
    // Cobre RF-05 AC: "DELETE em row de outro user retorna 404"
    (storage.getStarredHandById as any).mockResolvedValue(null);
    const res = makeRes();
    await handleDiscardSpot(
      makeReq({ params: { id: 'sh_404' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.softDeleteStarredHand).not.toHaveBeenCalled();
  });

  it('404 quando row pertence a outro user (mascarado)', async () => {
    (storage.getStarredHandById as any).mockResolvedValue({
      id: 'sh_1', userId: 'USER-OTHER',
    });
    const res = makeRes();
    await handleDiscardSpot(
      makeReq({ params: { id: 'sh_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.softDeleteStarredHand).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/starred-hands/:id/discard — soft delete (RF-05)', () => {
  beforeEach(() => {
    (storage.getStarredHandById as any).mockResolvedValue({
      id: 'sh_1', userId: 'USER-0001', status: 'pending',
    });
  });

  it('204 marca como discarded (NAO remove row do banco)', async () => {
    // Cobre RF-05 AC: "DELETE marca como discarded, retorna 204" + Spec:
    // "soft delete (status='discarded'), nao remove arquivo de disco
    // imediatamente (cron decide)"
    (storage.softDeleteStarredHand as any).mockResolvedValue(undefined);
    const res = makeRes();
    await handleDiscardSpot(
      makeReq({ params: { id: 'sh_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(204);
    expect(storage.softDeleteStarredHand).toHaveBeenCalledTimes(1);
    // NAO deve usar o hard delete da Cooldown-1
    expect(storage.deleteStarredHand).not.toHaveBeenCalled();
  });

  it('204 idempotente — re-DELETE em row ja discarded', async () => {
    // Cobre RF-05 AC: "DELETE idempotente"
    (storage.getStarredHandById as any).mockResolvedValue({
      id: 'sh_1', userId: 'USER-0001', status: 'discarded',
    });
    (storage.softDeleteStarredHand as any).mockResolvedValue(undefined);
    const res = makeRes();
    await handleDiscardSpot(
      makeReq({ params: { id: 'sh_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(204);
  });

  it('NAO afeta hard delete da rota Cooldown-1 (DELETE /api/starred-hands/:id)', async () => {
    // Cobre architect patch: rotas DISTINTAS, sem override.
    // Validacao: o handler de discard chama softDeleteStarredHand, nao deleteStarredHand.
    (storage.softDeleteStarredHand as any).mockResolvedValue(undefined);
    const res = makeRes();
    await handleDiscardSpot(
      makeReq({ params: { id: 'sh_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(204);
    expect(storage.deleteStarredHand).not.toHaveBeenCalled();
  });
});

// =============================================================================
// GET /api/starred-hands/:id/image — ADR-052 (ownership middleware)
// =============================================================================
//
// IMPORTANTE: Spec patch: "Servir imagem (architect-flagged): abandona
// /uploads/spot-screenshots/:file (path direto = leak de filename). Usa
// GET /api/starred-hands/:id/image com requireAuth + valida userId === req.user.userPlatformId"
// =============================================================================

describe('GET /api/starred-hands/:id/image — auth + ownership (ADR-052)', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleServeSpotImage(
      makeReq({ user: undefined, params: { id: 'sh_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
  });

  it('404 quando row nao existe', async () => {
    (storage.getStarredHandById as any).mockResolvedValue(null);
    const res = makeRes();
    await handleServeSpotImage(
      makeReq({ params: { id: 'sh_404' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('404 quando row pertence a outro user (NAO 403, evita confirmar existencia)', async () => {
    // Cobre ADR-052: "404 (nao 403) para nao confirmar existencia"
    (storage.getStarredHandById as any).mockResolvedValue({
      id: 'sh_1', userId: 'USER-OTHER', imageUrl: '/uploads/spot-screenshots/x.png',
    });
    const res = makeRes();
    await handleServeSpotImage(
      makeReq({ params: { id: 'sh_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('404 quando imageUrl eh null (row sem imagem associada)', async () => {
    // Cobre ADR-052: "Se row.imageUrl for null: 404 (sem imagem)"
    (storage.getStarredHandById as any).mockResolvedValue({
      id: 'sh_1', userId: 'USER-0001', imageUrl: null,
    });
    const res = makeRes();
    await handleServeSpotImage(
      makeReq({ params: { id: 'sh_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('200 sendFile + headers Cache-Control private quando ownership OK', async () => {
    // Cobre ADR-052: "res.setHeader('Cache-Control', 'private, max-age=300')"
    (storage.getStarredHandById as any).mockResolvedValue({
      id: 'sh_1',
      userId: 'USER-0001',
      imageUrl: '/uploads/spot-screenshots/abc123.png',
    });
    const res = makeRes();
    await handleServeSpotImage(
      makeReq({ params: { id: 'sh_1' } }) as any,
      res,
    );
    // Handler ou usa res.sendFile (F2) ou res.redirect (F3 com S3) — ambos OK
    // mas em F2 esperamos sendFile.
    expect(res.sendFile).toHaveBeenCalled();
    // Cache-Control private (privacidade)
    expect(res.headers['Cache-Control'] || res.headers['cache-control']).toMatch(/private/i);
  });
});
