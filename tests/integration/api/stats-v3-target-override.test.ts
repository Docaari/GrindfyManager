// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3 — PUT /api/hud-layouts/:id/target-override (RF-05 backend)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-05 inline edit de target)
// ADR  : 064 (grouped layout — secao "Custom stats por grupo")
//
// Convencao: handler testado diretamente. Implementer ira criar
// `handleSetTargetOverride` em `server/routes/statsAnalyzer.ts`.
//
// Comportamentos:
//   - PUT body { statId, min, max } -> 200
//   - Persiste em hud_layouts.fields_json[i].targetOverride
//   - Validacao min<max, 0-100 range (pct)
//   - 401 sem auth
//   - 403 quando layout nao pertence ao user
//   - DELETE/min=null restaura catalog default
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    getHudLayout: vi.fn(),
    updateHudLayout: vi.fn(),
  },
}));

// Modulo NAO existe ainda — red phase
import { handleSetTargetOverride } from '../../../server/routes/statsAnalyzer';
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

const baseLayout = {
  id: 'lyt-1',
  userId: 'USER-0001',
  name: 'PT4 V3',
  isDefault: true,
  sections: [],
  fields_json: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getHudLayout as any).mockResolvedValue(baseLayout);
  (storage.updateHudLayout as any).mockImplementation(async (id: string, userId: string, patch: any) => ({
    ...baseLayout,
    ...patch,
  }));
});

describe('PUT /api/hud-layouts/:id/target-override — RF-05', () => {
  it('200 com body { statId, min, max } valido persiste targetOverride', async () => {
    const res = makeRes();
    await handleSetTargetOverride(
      makeReq({
        params: { id: 'lyt-1' },
        body: { statId: 'vpip', min: 25, max: 32 },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.updateHudLayout).toHaveBeenCalled();
    const patch = (storage.updateHudLayout as any).mock.calls[0][2];
    // patch deve conter fields_json com targetOverride para vpip
    const fields = patch.fields_json ?? [];
    const vpipField = fields.find((f: any) => f.id === 'vpip' || f.statId === 'vpip');
    expect(vpipField).toBeDefined();
    expect(vpipField.targetOverride).toEqual({ min: 25, max: 32 });
  });

  it('rejeita 400 quando min >= max', async () => {
    const res = makeRes();
    await handleSetTargetOverride(
      makeReq({
        params: { id: 'lyt-1' },
        body: { statId: 'vpip', min: 30, max: 25 },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(storage.updateHudLayout).not.toHaveBeenCalled();
  });

  it('rejeita 400 quando max > 100 (pct cap)', async () => {
    const res = makeRes();
    await handleSetTargetOverride(
      makeReq({
        params: { id: 'lyt-1' },
        body: { statId: 'vpip', min: 25, max: 150 },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('401 sem req.user', async () => {
    const res = makeRes();
    await handleSetTargetOverride(
      makeReq({
        user: undefined,
        params: { id: 'lyt-1' },
        body: { statId: 'vpip', min: 25, max: 32 },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
  });

  it('403/404 quando layout nao pertence ao user', async () => {
    (storage.getHudLayout as any).mockResolvedValue(undefined);
    const res = makeRes();
    await handleSetTargetOverride(
      makeReq({
        params: { id: 'lyt-other' },
        body: { statId: 'vpip', min: 25, max: 32 },
      }) as any,
      res,
    );
    expect([403, 404]).toContain(res.statusCode);
  });

  it('DELETE override (min=null OR explicit DELETE) restaura catalog default', async () => {
    // Layout ja tem override em vpip
    (storage.getHudLayout as any).mockResolvedValue({
      ...baseLayout,
      fields_json: [{ id: 'vpip', targetOverride: { min: 25, max: 32 } }],
    });
    const res = makeRes();
    await handleSetTargetOverride(
      makeReq({
        params: { id: 'lyt-1' },
        body: { statId: 'vpip', min: null, max: null },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    const patch = (storage.updateHudLayout as any).mock.calls[0][2];
    // override deve ter sido removido do field
    const fields = patch.fields_json ?? [];
    const vpipField = fields.find((f: any) => f.id === 'vpip');
    if (vpipField) {
      expect(vpipField.targetOverride === undefined || vpipField.targetOverride === null).toBe(true);
    }
  });
});
