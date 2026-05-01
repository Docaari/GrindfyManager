// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3 — PUT /api/stats-analyzer/snapshots/:id (RF-06 backend)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-06 inline edit hero value)
//
// Convencao: handler testado diretamente. Implementer ira criar
// `handleUpdateSnapshotValues` em `server/routes/statsAnalyzer.ts`.
//
// Comportamentos:
//   - PUT body { values: { [statId]: number } } -> 200
//   - Patch parcial: so statIds enviados sao atualizados
//   - 401 sem auth
//   - 403/404 quando snapshot nao pertence ao user
//   - 404 quando snapshot deletado
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    getHudStatSnapshot: vi.fn(),
    updateHudStatSnapshot: vi.fn(),
    deleteHudStatSnapshot: vi.fn(),
    // Reviewer R1 HIGH-3: handler agora valida values contra unit do stat
    // (catalog OU custom). Mock retorna layout vazio por padrao.
    getHudLayout: vi.fn(),
  },
}));

import { handleUpdateSnapshotValues } from '../../../server/routes/statsAnalyzer';
import { storage } from '../../../server/storage';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.send = (d: any) => { res.body = d; return res; };
  return res;
}

const baseSnapshot = {
  id: 'snap-1',
  userId: 'USER-0001',
  layoutId: 'lyt-1',
  capturedAt: new Date('2026-05-01T10:00:00Z'),
  source: 'manual',
  values: { vpip: 22, pfr: 18, wwsf_pct: 50 },
  sampleSize: 5400,
};

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getHudStatSnapshot as any).mockResolvedValue(baseSnapshot);
  (storage.updateHudStatSnapshot as any).mockImplementation(async (id: string, userId: string, patch: any) => ({
    ...baseSnapshot,
    values: { ...baseSnapshot.values, ...patch.values },
  }));
  // Default: layout vazio (catalog stats funcionam, customs nao definidos).
  (storage.getHudLayout as any).mockResolvedValue({
    id: 'lyt-1',
    userId: 'USER-0001',
    fields_json: [],
  });
});

describe('PUT /api/stats-analyzer/snapshots/:id — RF-06', () => {
  it('200 patch parcial atualiza somente os statIds enviados', async () => {
    const res = makeRes();
    await handleUpdateSnapshotValues(
      makeReq({
        params: { id: 'snap-1' },
        body: { values: { vpip: 24 } },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.updateHudStatSnapshot).toHaveBeenCalled();
    const patch = (storage.updateHudStatSnapshot as any).mock.calls[0][2];
    expect(patch.values.vpip).toBe(24);
    // pfr nao deve ser tocado no patch (apenas vpip)
    expect(Object.keys(patch.values).length).toBe(1);
  });

  it('401 sem req.user', async () => {
    const res = makeRes();
    await handleUpdateSnapshotValues(
      makeReq({
        user: undefined,
        params: { id: 'snap-1' },
        body: { values: { vpip: 24 } },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(storage.updateHudStatSnapshot).not.toHaveBeenCalled();
  });

  it('403/404 quando snapshot nao pertence ao user', async () => {
    (storage.getHudStatSnapshot as any).mockResolvedValue(undefined);
    const res = makeRes();
    await handleUpdateSnapshotValues(
      makeReq({
        params: { id: 'snap-other' },
        body: { values: { vpip: 24 } },
      }) as any,
      res,
    );
    expect([403, 404]).toContain(res.statusCode);
  });

  it('404 quando snapshot deletado durante request (race)', async () => {
    (storage.getHudStatSnapshot as any).mockResolvedValue(baseSnapshot);
    (storage.updateHudStatSnapshot as any).mockResolvedValue(undefined); // deletado durante operacao
    const res = makeRes();
    await handleUpdateSnapshotValues(
      makeReq({
        params: { id: 'snap-1' },
        body: { values: { vpip: 24 } },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('value pode ser null (limpa stat)', async () => {
    const res = makeRes();
    await handleUpdateSnapshotValues(
      makeReq({
        params: { id: 'snap-1' },
        body: { values: { vpip: null } },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    const patch = (storage.updateHudStatSnapshot as any).mock.calls[0][2];
    expect(patch.values.vpip).toBeNull();
  });
});

// =============================================================================
// Reviewer R1 HIGH-3 — validacao por unit (pct/bb/count)
// =============================================================================

describe('PUT /api/stats-analyzer/snapshots/:id — HIGH-3 unit validation', () => {
  it('rejeita 400 quando pct value > 100 (vpip eh pct cap 100)', async () => {
    const res = makeRes();
    await handleUpdateSnapshotValues(
      makeReq({
        params: { id: 'snap-1' },
        body: { values: { vpip: 150 } },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('invalidFields');
    expect(storage.updateHudStatSnapshot).not.toHaveBeenCalled();
  });

  it('rejeita 400 quando pct value < 0', async () => {
    const res = makeRes();
    await handleUpdateSnapshotValues(
      makeReq({
        params: { id: 'snap-1' },
        body: { values: { vpip: -5 } },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('aceita pct value=100 (boundary inclusive)', async () => {
    const res = makeRes();
    await handleUpdateSnapshotValues(
      makeReq({
        params: { id: 'snap-1' },
        body: { values: { vpip: 100 } },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
  });

  it('aceita custom bb stat com value > 100', async () => {
    (storage.getHudLayout as any).mockResolvedValue({
      id: 'lyt-1',
      userId: 'USER-0001',
      fields_json: [
        { id: 'custom_bbstack', isCustom: true, unit: 'bb', label: 'BB Stack' },
      ],
    });
    const res = makeRes();
    await handleUpdateSnapshotValues(
      makeReq({
        params: { id: 'snap-1' },
        body: { values: { custom_bbstack: 150 } },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
  });

  it('rejeita 400 quando custom bb stat value < 0', async () => {
    (storage.getHudLayout as any).mockResolvedValue({
      id: 'lyt-1',
      userId: 'USER-0001',
      fields_json: [
        { id: 'custom_bbstack', isCustom: true, unit: 'bb', label: 'BB Stack' },
      ],
    });
    const res = makeRes();
    await handleUpdateSnapshotValues(
      makeReq({
        params: { id: 'snap-1' },
        body: { values: { custom_bbstack: -10 } },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejeita 400 quando custom count stat tem decimal', async () => {
    (storage.getHudLayout as any).mockResolvedValue({
      id: 'lyt-1',
      userId: 'USER-0001',
      fields_json: [
        { id: 'custom_handcount', isCustom: true, unit: 'count', label: 'Hand Count' },
      ],
    });
    const res = makeRes();
    await handleUpdateSnapshotValues(
      makeReq({
        params: { id: 'snap-1' },
        body: { values: { custom_handcount: 100.5 } },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});
