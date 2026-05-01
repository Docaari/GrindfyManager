// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3 — POST/DELETE /api/hud-layouts/:id/custom-stats (RF-07 backend)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-07 adicionar stat custom)
// ADR  : 064 (grouped layout — secao "Custom stats por grupo")
//
// Convencao: handler testado diretamente. Implementer ira criar
// `handleCreateCustomStat`, `handleDeleteCustomStat` em statsAnalyzer.ts.
//
// Comportamentos:
//   - POST body { groupId, label, targetMin, targetMax, direction, unit } -> 201
//   - id formato custom_${nanoid(8)} ([a-z0-9]{8})
//   - isCustom=true
//   - Persiste em hud_layouts.fields_json[]
//   - Label validation 3-60 chars (spec D60, ADR-064)
//   - DELETE /:customId remove field
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    getHudLayout: vi.fn(),
    updateHudLayout: vi.fn(),
  },
}));

import { handleCreateCustomStat, handleDeleteCustomStat } from '../../../server/routes/statsAnalyzer';
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

describe('POST /api/hud-layouts/:id/custom-stats — RF-07', () => {
  it('201 cria custom field com id custom_[a-z0-9]{8}', async () => {
    const res = makeRes();
    await handleCreateCustomStat(
      makeReq({
        params: { id: 'lyt-1' },
        body: {
          groupId: 'basics',
          label: 'Avg Stack BB',
          targetMin: 20,
          targetMax: 100,
          direction: 'context',
          unit: 'bb',
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(storage.updateHudLayout).toHaveBeenCalled();
    const patch = (storage.updateHudLayout as any).mock.calls[0][2];
    const fields = patch.fields_json ?? [];
    const newField = fields.find((f: any) => f.isCustom === true);
    expect(newField).toBeDefined();
    expect(newField.id).toMatch(/^custom_[a-z0-9]{8}$/);
    expect(newField.isCustom).toBe(true);
    expect(newField.label).toBe('Avg Stack BB');
  });

  it('persiste em hud_layouts.fields_json[]', async () => {
    const res = makeRes();
    await handleCreateCustomStat(
      makeReq({
        params: { id: 'lyt-1' },
        body: {
          groupId: 'basics',
          label: 'Custom Stat',
          targetMin: 0,
          targetMax: 100,
          direction: 'context',
          unit: 'pct',
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    const patch = (storage.updateHudLayout as any).mock.calls[0][2];
    expect(Array.isArray(patch.fields_json)).toBe(true);
    expect(patch.fields_json.length).toBeGreaterThanOrEqual(1);
  });

  it('rejeita label menor que 3 chars com 400', async () => {
    const res = makeRes();
    await handleCreateCustomStat(
      makeReq({
        params: { id: 'lyt-1' },
        body: {
          groupId: 'basics',
          label: 'AB',
          targetMin: 0,
          targetMax: 100,
          direction: 'context',
          unit: 'pct',
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejeita label maior que 60 chars com 400', async () => {
    const res = makeRes();
    await handleCreateCustomStat(
      makeReq({
        params: { id: 'lyt-1' },
        body: {
          groupId: 'basics',
          label: 'X'.repeat(61),
          targetMin: 0,
          targetMax: 100,
          direction: 'context',
          unit: 'pct',
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/hud-layouts/:id/custom-stats/:customId — RF-07', () => {
  it('remove custom field do fields_json', async () => {
    (storage.getHudLayout as any).mockResolvedValue({
      ...baseLayout,
      fields_json: [
        { id: 'custom_a8b3c9d1', label: 'Custom 1', isCustom: true },
        { id: 'custom_x9z2y4w0', label: 'Custom 2', isCustom: true },
      ],
    });
    const res = makeRes();
    await handleDeleteCustomStat(
      makeReq({ params: { id: 'lyt-1', customId: 'custom_a8b3c9d1' } }) as any,
      res,
    );
    expect([200, 204]).toContain(res.statusCode);
    const patch = (storage.updateHudLayout as any).mock.calls[0][2];
    const fields = patch.fields_json ?? [];
    const removed = fields.find((f: any) => f.id === 'custom_a8b3c9d1');
    expect(removed).toBeUndefined();
    // outro custom continua
    const kept = fields.find((f: any) => f.id === 'custom_x9z2y4w0');
    expect(kept).toBeDefined();
  });
});
