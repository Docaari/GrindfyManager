/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint Fase D #5 (Stop-loss cold-commit)
 *
 * Spec: Docs/specs/sprint-fase-d-stop-loss-2026-06-02.md (RF-01, RF-05)
 * ADR:  Docs/architecture/decisions/235-fase-d-stop-loss-cold-commit.md (D-3)
 *
 * Estende sessionIntention (jsonb) com sub-objeto OPCIONAL coldStopCommit:
 *   { committedUsd: number>0, basis: 'bi'|'manual', nBI?: 3|4|5,
 *     abiUsdAtCommit?: number, committedAt: string ISO }
 *
 * DOIS Zod em LOCKSTEP (ADR D-3, recomendado extrair p/ shared coldStopCommitZod):
 *   1) server/routes/warmup-rituals.ts:48  (objeto FECHADO — se não estender, STRIP-a o campo)
 *   2) shared/schema.ts:1964 insertWarmupRitualSchema.sessionIntention
 *
 * Lessons:
 *   - #7 aditivo opcional (sessionIntention NÃO vira required; coldStopCommit .optional().nullable()).
 *   - #28 mock por path — warmupService mockado; verificamos o que o handler PASSA pra createRitual.
 *
 * RED esperado:
 *   - Os Zod atuais (route + schema) NÃO conhecem coldStopCommit -> o objeto FECHADO o STRIP-a.
 *     Os testes "coldStopCommit persistido / NÃO stripado" falham (campo ausente em createRitual).
 *   - O schema-level (insertWarmupRitualSchema) idem: parse remove coldStopCommit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../server/services/warmupService', () => ({
  warmupService: {
    createRitual: vi.fn(),
    getLatestRitual: vi.fn(),
    listRituals: vi.fn(),
  },
}));

import { handleCreateWarmupRitual } from '../../../../server/routes/warmup-rituals';
import { warmupService } from '../../../../server/services/warmupService';
// Schema-level Zod (lockstep #2) — testa parse direto.
import { insertWarmupRitualSchema } from '../../../../shared/schema';

beforeEach(() => {
  vi.clearAllMocks();
  (warmupService.createRitual as any).mockResolvedValue({ id: 'WR-1' });
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001', permissions: ['mental_prep_access'] },
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

const baseFullBody = {
  startedAt: new Date('2026-06-02T18:00:00Z').toISOString(),
  completedAt: new Date('2026-06-02T18:10:00Z').toISOString(),
  durationMinutes: 10,
  version: 'full',
  emotionalCheckScore: 8,
  decisionToPlay: true,
  overrideUsed: false,
  blocksCompleted: [],
};

const validColdStopCommitBI = {
  committedUsd: 150,
  basis: 'bi',
  nBI: 3,
  abiUsdAtCommit: 50,
  committedAt: new Date('2026-06-02T18:05:00Z').toISOString(),
};

const validColdStopCommitManual = {
  committedUsd: 200,
  basis: 'manual',
  committedAt: new Date('2026-06-02T18:06:00Z').toISOString(),
};

describe('POST /api/warmup-rituals — coldStopCommit aceito e PERSISTIDO (NÃO stripado)', () => {
  it('basis="bi" válido -> 201 e coldStopCommit chega em createRitual', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({
        body: {
          ...baseFullBody,
          sessionIntention: {
            focus: 'foco',
            tiltPlan: 'tilt',
            stopCriteria: 'stop',
            coldStopCommit: validColdStopCommitBI,
          },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    const passed = (warmupService.createRitual as any).mock.calls[0]?.[1];
    expect(passed?.sessionIntention?.coldStopCommit).toEqual(validColdStopCommitBI);
  });

  it('basis="manual" válido -> 201 e coldStopCommit chega em createRitual', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({
        body: {
          ...baseFullBody,
          sessionIntention: {
            focus: 'foco',
            tiltPlan: 'tilt',
            stopCriteria: 'stop',
            coldStopCommit: validColdStopCommitManual,
          },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    const passed = (warmupService.createRitual as any).mock.calls[0]?.[1];
    expect(passed?.sessionIntention?.coldStopCommit).toEqual(validColdStopCommitManual);
  });
});

describe('POST /api/warmup-rituals — back-compat e validação', () => {
  it('sessionIntention sem coldStopCommit -> 201 (back-compat)', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({
        body: {
          ...baseFullBody,
          sessionIntention: { focus: 'foco', tiltPlan: 'tilt', stopCriteria: 'stop' },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
  });

  it('sessionIntention=null -> 201 (back-compat)', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({ body: { ...baseFullBody, sessionIntention: null } }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
  });

  it('committedUsd <= 0 -> 400 (rejeitado pelo Zod), createRitual não chamado', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({
        body: {
          ...baseFullBody,
          sessionIntention: {
            focus: 'foco',
            tiltPlan: 'tilt',
            stopCriteria: 'stop',
            coldStopCommit: { ...validColdStopCommitManual, committedUsd: 0 },
          },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(warmupService.createRitual).not.toHaveBeenCalled();
  });

  it('basis inválido ("auto") -> 400', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({
        body: {
          ...baseFullBody,
          sessionIntention: {
            focus: 'foco',
            tiltPlan: 'tilt',
            stopCriteria: 'stop',
            coldStopCommit: { ...validColdStopCommitManual, basis: 'auto' },
          },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(warmupService.createRitual).not.toHaveBeenCalled();
  });
});

describe('insertWarmupRitualSchema (shared/schema.ts) — Zod lockstep #2', () => {
  it('preserva coldStopCommit válido (basis="bi") após parse', () => {
    const parsed = insertWarmupRitualSchema.parse({
      ...baseFullBody,
      userId: 'USER-0001',
      sessionIntention: {
        focus: 'foco',
        tiltPlan: 'tilt',
        stopCriteria: 'stop',
        coldStopCommit: validColdStopCommitBI,
      },
    } as any);
    expect((parsed.sessionIntention as any)?.coldStopCommit).toEqual(validColdStopCommitBI);
  });

  it('rejeita committedUsd <= 0', () => {
    const result = insertWarmupRitualSchema.safeParse({
      ...baseFullBody,
      userId: 'USER-0001',
      sessionIntention: {
        focus: 'foco',
        tiltPlan: 'tilt',
        stopCriteria: 'stop',
        coldStopCommit: { ...validColdStopCommitManual, committedUsd: -10 },
      },
    } as any);
    expect(result.success).toBe(false);
  });

  it('aceita sessionIntention sem coldStopCommit (back-compat)', () => {
    const result = insertWarmupRitualSchema.safeParse({
      ...baseFullBody,
      userId: 'USER-0001',
      sessionIntention: { focus: 'foco', tiltPlan: 'tilt', stopCriteria: 'stop' },
    } as any);
    expect(result.success).toBe(true);
  });
});
