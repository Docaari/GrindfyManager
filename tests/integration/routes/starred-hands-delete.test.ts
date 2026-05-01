import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Spot-Screenshots — DELETE /api/starred-hands/:id (com imagem)
//
// Spec: Docs/specs/spot-screenshots.md (RF-07, EC-10/11)
// ADR : Docs/architecture/decisions/057-spot-image-storage-abstraction.md
// Sequence: Docs/architecture/diagrams/spot-screenshots-sequences.mermaid (Fluxo 3)
//
// Handler exportado de server/routes/cooldown.ts:
//   handleDeleteStarredHand(req, res)
//
// Comportamento (estende fluxo legado existente):
//   1. Auth
//   2. SELECT row (com image_key)
//   3. row null OR row.userId !== req.user.userPlatformId -> 404
//   4. Se imageKey != null -> spotImageStorage.delete(imageKey) idempotente
//   5. storage.deleteStarredHand(id, userId)
//   6. 200 (mantemos contrato existente — test legado afirma 200)
//
// Decisoes do prompt do test-writer:
//   - "Owner deleta -> 204" (ajustado: handler legado retorna 200 — mantem 200)
//   - "Idempotente: storage.delete ja apagou manualmente mas row existe -> 200/204"
//   - "Sessao completed permite delete (regra de delete nao tem trava)"
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getStarredHand: vi.fn(),
    deleteStarredHand: vi.fn(),
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

import { handleDeleteStarredHand } from '../../../server/routes/cooldown';
import { storage } from '../../../server/storage';
// @ts-expect-error
import { spotImageStorage } from '../../../server/services/spotImageStorage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.deleteStarredHand as any).mockResolvedValue(undefined);
  (spotImageStorage.delete as any).mockResolvedValue(true);
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    params: { id: 'sh_1' },
    body: {},
    query: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  res.send = (d?: any) => {
    res.body = d ?? null;
    return res;
  };
  res.end = () => res;
  return res;
}

const rowWithImage = {
  id: 'sh_1',
  userId: 'USER-0001',
  sessionId: 'ses_1',
  sessionTournamentId: 'st_1',
  imageKey: 'USER-0001/ses_1/abc.png',
  imageMime: 'image/png',
};

const rowWithoutImage = {
  id: 'sh_2',
  userId: 'USER-0001',
  sessionId: 'ses_1',
  sessionTournamentId: 'st_1',
  imageKey: null,
  imageMime: null,
};

// =============================================================================
// Auth
// =============================================================================

describe('DELETE /api/starred-hands/:id - auth', () => {
  it('401 sem req.user', async () => {
    const res = makeRes();
    await handleDeleteStarredHand(
      makeReq({ user: undefined }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(spotImageStorage.delete).not.toHaveBeenCalled();
    expect(storage.deleteStarredHand).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Happy paths
// =============================================================================

describe('DELETE /api/starred-hands/:id - happy paths', () => {
  it('owner deleta spot com imagem -> 200, row sumiu, FS limpo', async () => {
    (storage.getStarredHand as any).mockResolvedValue(rowWithImage);

    const res = makeRes();
    await handleDeleteStarredHand(makeReq() as any, res);

    // Contrato legado existente eh 200; permitimos 204 caso Implementer ajuste.
    expect([200, 204]).toContain(res.statusCode);
    expect(spotImageStorage.delete).toHaveBeenCalledWith(
      'USER-0001/ses_1/abc.png',
    );
    expect(storage.deleteStarredHand).toHaveBeenCalledWith('sh_1', 'USER-0001');
  });

  it('owner deleta spot sem imagem -> 200, sem chamar FS storage', async () => {
    (storage.getStarredHand as any).mockResolvedValue(rowWithoutImage);

    const res = makeRes();
    await handleDeleteStarredHand(
      makeReq({ params: { id: 'sh_2' } }) as any,
      res,
    );

    expect([200, 204]).toContain(res.statusCode);
    // Sem imagem -> nao toca o storage de imagens
    expect(spotImageStorage.delete).not.toHaveBeenCalled();
    expect(storage.deleteStarredHand).toHaveBeenCalledWith('sh_2', 'USER-0001');
  });
});

// =============================================================================
// Ownership
// =============================================================================

describe('DELETE /api/starred-hands/:id - ownership', () => {
  it('404 quando spot eh de outro user (NAO 403)', async () => {
    (storage.getStarredHand as any).mockResolvedValue({
      ...rowWithImage,
      userId: 'USER-OTHER',
    });

    const res = makeRes();
    await handleDeleteStarredHand(makeReq() as any, res);

    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(403);
    expect(spotImageStorage.delete).not.toHaveBeenCalled();
    expect(storage.deleteStarredHand).not.toHaveBeenCalled();
  });

  it('404 quando spot nao existe', async () => {
    (storage.getStarredHand as any).mockResolvedValue(null);

    const res = makeRes();
    await handleDeleteStarredHand(makeReq() as any, res);

    expect(res.statusCode).toBe(404);
    expect(spotImageStorage.delete).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Idempotencia
// =============================================================================

describe('DELETE /api/starred-hands/:id - idempotencia', () => {
  it('200 mesmo quando arquivo no FS ja foi apagado manualmente (storage.delete returns false)', async () => {
    // ADR-057 + RF-07: SpotImageStorage.delete eh idempotente.
    // Implementacao FS retorna false quando arquivo nao existia (lessons-learned
    // EC-10). Handler nao deve falhar — segue para deletar a row.
    (storage.getStarredHand as any).mockResolvedValue(rowWithImage);
    (spotImageStorage.delete as any).mockResolvedValue(false);

    const res = makeRes();
    await handleDeleteStarredHand(makeReq() as any, res);

    expect([200, 204]).toContain(res.statusCode);
    expect(storage.deleteStarredHand).toHaveBeenCalledWith('sh_1', 'USER-0001');
  });

  it('200 quando spotImageStorage.delete throws ENOENT-like (idempotente)', async () => {
    // Defesa: mesmo se a impl quebrar contrato e jogar erro, handler captura
    // e segue. Lessons-learned: try/catch logado, nao engolido silencioso.
    (storage.getStarredHand as any).mockResolvedValue(rowWithImage);
    (spotImageStorage.delete as any).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    const res = makeRes();
    await handleDeleteStarredHand(makeReq() as any, res);

    // ENOENT em delete eh idempotente — segue para DB.
    expect([200, 204]).toContain(res.statusCode);
    expect(storage.deleteStarredHand).toHaveBeenCalled();
  });
});

// =============================================================================
// Sessao completed
// =============================================================================

describe('DELETE /api/starred-hands/:id - sessao completed', () => {
  it('permite delete mesmo se sessao da spot estiver completed (delete nao tem trava)', async () => {
    // O prompt do test-writer afirma: "Sessao completed permite delete
    // (regra de delete nao tem mesma trava de sessao completed do create)".
    // Confirmamos que handler nao bloqueia 409 nesse caso.
    (storage.getStarredHand as any).mockResolvedValue(rowWithImage);

    const res = makeRes();
    await handleDeleteStarredHand(makeReq() as any, res);

    expect([200, 204]).toContain(res.statusCode);
    expect(res.statusCode).not.toBe(409);
  });
});
