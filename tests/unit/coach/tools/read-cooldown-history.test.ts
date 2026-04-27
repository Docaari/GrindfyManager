import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-3 / RF-07 — Tool `coach.read_cooldown_history`
//
// Spec : Docs/specs/cooldown-refactor-plan.md (RF-07)
// ADR  : Docs/architecture/decisions/042-cooldown-coach-tool-registry.md
// Flow : Docs/architecture/flows/coach/sequence-cooldown-tool.mermaid (cenario A)
//
// Modulo a ser criado pelo Implementer:
//   server/coachTools/handlers/readCooldownHistory.ts
//
// Exporta:
//   readCooldownHistoryTool: CoachTool<{period}, ToolResult>
//
// Pattern:
//   - inputSchema = z.object({ period: z.enum(['7d','30d','90d']) })
//   - handler reusa storage methods Sprint 2 (compliance, distribution, lessons,
//     impact) em paralelo
//   - sanitizer agrega counts (NAO retorna notes/cGame/action/aGame/bGame/lesson)
//   - wrap ADR-024: { __type:'ToolResult', tool:'read_cooldown_history',
//                     ok:true, data:{...} } | { ok:false, code, message }
//   - top 10 lessons (truncado pelo handler — getTopLessons retorna mais)
//   - impact opcional: presente quando ha pelo menos 1 sessao com cooldown
//                      completo + 1 sem
//
// IMPORTANT: red phase — modulo NAO existe; testes falham por module-not-found.
// =============================================================================

const storageMock: any = {
  getCooldownComplianceMetrics: vi.fn(),
  getStarredHandsDistribution: vi.fn(),
  getTopLessons: vi.fn(),
  getCooldownImpactMetrics: vi.fn(),
};
vi.mock('../../../../server/storage', () => ({
  storage: storageMock,
}));

import { readCooldownHistoryTool } from '../../../../server/coachTools/handlers/readCooldownHistory';

const ctx = {
  userId: 'USER-0001',
  chatSessionId: 'sess_a',
  messageId: 'msg_1',
} as any;

beforeEach(() => {
  Object.values(storageMock).forEach((fn: any) => fn.mockReset?.());

  storageMock.getCooldownComplianceMetrics.mockResolvedValue({
    total: 10,
    completed: 6,
    complianceRate: 0.6,
  });
  storageMock.getStarredHandsDistribution.mockResolvedValue([
    { type: 'tilt', count: 8 },
    { type: 'leak', count: 4 },
    { type: 'mistake', count: 2 },
  ]);
  storageMock.getTopLessons.mockResolvedValue([
    { token: 'paciencia', count: 5 },
    { token: 'foco', count: 4 },
    { token: 'disciplina', count: 3 },
  ]);
  storageMock.getCooldownImpactMetrics.mockResolvedValue({
    withCooldown: { avgRoi: 0.18 },
    withoutCooldown: { avgRoi: 0.05 },
    delta: 0.13,
  });
});

// =============================================================================
// Schema / input validation
// =============================================================================

describe('readCooldownHistoryTool — input schema', () => {
  it('aceita period 7d', () => {
    const r = readCooldownHistoryTool.inputSchema.safeParse({ period: '7d' });
    expect(r.success).toBe(true);
  });

  it('aceita period 30d', () => {
    const r = readCooldownHistoryTool.inputSchema.safeParse({ period: '30d' });
    expect(r.success).toBe(true);
  });

  it('aceita period 90d', () => {
    const r = readCooldownHistoryTool.inputSchema.safeParse({ period: '90d' });
    expect(r.success).toBe(true);
  });

  it('rejeita period invalido (ex: 60d)', () => {
    const r = readCooldownHistoryTool.inputSchema.safeParse({ period: '60d' });
    expect(r.success).toBe(false);
  });

  it('rejeita period como 1y', () => {
    const r = readCooldownHistoryTool.inputSchema.safeParse({ period: '1y' });
    expect(r.success).toBe(false);
  });

  it('rejeita period ausente', () => {
    const r = readCooldownHistoryTool.inputSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejeita campos extras (strict)', () => {
    const r = readCooldownHistoryTool.inputSchema.safeParse({
      period: '30d',
      userId: 'USER-9999', // userId vem do ctx, nao do input
    });
    // Zod default eh strip em z.object — aceitamos pass se schema
    // remover ou rejeitar; criterio principal: a tool nao deve usar
    // input.userId. Garantido em outro teste.
    if (r.success) {
      expect((r.data as any).userId).toBeUndefined();
    } else {
      expect(r.success).toBe(false);
    }
  });
});

describe('readCooldownHistoryTool — descriptor metadata', () => {
  it('tem name "read_cooldown_history"', () => {
    expect(readCooldownHistoryTool.name).toBe('read_cooldown_history');
  });

  it('tem description nao-vazia', () => {
    expect(typeof readCooldownHistoryTool.description).toBe('string');
    expect(readCooldownHistoryTool.description.length).toBeGreaterThan(10);
  });

  it('tem handler como funcao', () => {
    expect(typeof readCooldownHistoryTool.handler).toBe('function');
  });
});

// =============================================================================
// Handler — happy path (output shape + sanitizer + wrapping ADR-024)
// =============================================================================

describe('readCooldownHistoryTool — handler happy path', () => {
  it('retorna shape ADR-024 ok:true com data', async () => {
    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );

    expect(out.__type).toBe('ToolResult');
    expect(out.tool).toBe('read_cooldown_history');
    expect(out.ok).toBe(true);
    expect(out.data).toBeDefined();
  });

  it('chama storage com userId do ctx (NAO do input)', async () => {
    await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );

    expect(storageMock.getCooldownComplianceMetrics).toHaveBeenCalledWith(
      'USER-0001',
      '30d',
    );
    expect(storageMock.getStarredHandsDistribution).toHaveBeenCalledWith(
      'USER-0001',
      '30d',
    );
    expect(storageMock.getTopLessons).toHaveBeenCalledWith('USER-0001', '30d');
  });

  it('output.data contem totalSessions + cooldownCount', async () => {
    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );

    expect(out.data.totalSessions).toBe(10);
    expect(out.data.cooldownCount).toBe(6);
  });

  it('output.data.starredHands eh agregado por type + total', async () => {
    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );

    expect(out.data.starredHands).toBeDefined();
    expect(out.data.starredHands.byType).toBeDefined();
    expect(out.data.starredHands.byType.tilt).toBe(8);
    expect(out.data.starredHands.byType.leak).toBe(4);
    expect(out.data.starredHands.byType.mistake).toBe(2);
    expect(out.data.starredHands.total).toBe(8 + 4 + 2);
  });

  it('output.data.recentLessons eh array de string tokens', async () => {
    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );

    expect(Array.isArray(out.data.recentLessons)).toBe(true);
    expect(out.data.recentLessons).toContain('paciencia');
    expect(out.data.recentLessons).toContain('foco');
    expect(out.data.recentLessons.every((s: any) => typeof s === 'string')).toBe(
      true,
    );
  });

  it('aceita period 7d e propaga para storage', async () => {
    await readCooldownHistoryTool.handler(
      { period: '7d' } as any,
      ctx,
    );
    expect(storageMock.getCooldownComplianceMetrics).toHaveBeenCalledWith(
      'USER-0001',
      '7d',
    );
  });

  it('aceita period 90d e propaga para storage', async () => {
    await readCooldownHistoryTool.handler(
      { period: '90d' } as any,
      ctx,
    );
    expect(storageMock.getCooldownComplianceMetrics).toHaveBeenCalledWith(
      'USER-0001',
      '90d',
    );
  });
});

// =============================================================================
// Sanitizer — PII NUNCA aparece no output
// =============================================================================

describe('readCooldownHistoryTool — sanitizer PII-free', () => {
  it('output.data NAO contem campo "notes"', async () => {
    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );
    const json = JSON.stringify(out.data);
    expect(json).not.toMatch(/"notes"/);
  });

  it('output.data NAO contem campo "cGame"', async () => {
    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );
    const json = JSON.stringify(out.data);
    expect(json).not.toMatch(/"cGame"/);
  });

  it('output.data NAO contem campo "action"', async () => {
    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );
    const json = JSON.stringify(out.data);
    expect(json).not.toMatch(/"action"/);
  });

  it('output.data NAO contem campo "aGame" cru', async () => {
    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );
    const json = JSON.stringify(out.data);
    expect(json).not.toMatch(/"aGame"/);
  });

  it('output.data NAO contem campo "bGame" cru', async () => {
    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );
    const json = JSON.stringify(out.data);
    expect(json).not.toMatch(/"bGame"/);
  });

  it('output.data NAO contem campo "lesson" texto-livre', async () => {
    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );
    // Aceitavel: recentLessons (array de tokens). NAO aceitavel: campo
    // "lesson" como string solta.
    expect(out.data.lesson).toBeUndefined();
  });

  it('mesmo se storage retornar texto livre extra, output strip', async () => {
    storageMock.getStarredHandsDistribution.mockResolvedValue([
      { type: 'tilt', count: 1, notes: 'x' as any }, // hipotetico
    ]);
    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );
    const json = JSON.stringify(out.data);
    expect(json).not.toMatch(/"notes"/);
  });
});

// =============================================================================
// Top 10 lessons enforced
// =============================================================================

describe('readCooldownHistoryTool — top 10 lessons cap', () => {
  it('trunca recentLessons a 10 entries quando storage retorna >10', async () => {
    storageMock.getTopLessons.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => ({
        token: `licao${i}`,
        count: 25 - i,
      })),
    );

    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );

    expect(out.data.recentLessons).toHaveLength(10);
    expect(out.data.recentLessons[0]).toBe('licao0'); // top em count
  });

  it('retorna array vazio quando storage retorna []', async () => {
    storageMock.getTopLessons.mockResolvedValue([]);
    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );
    expect(out.data.recentLessons).toEqual([]);
  });
});

// =============================================================================
// Empty data — usuario sem cool-down
// =============================================================================

describe('readCooldownHistoryTool — empty data', () => {
  it('retorna shape valido com cooldownCount=0 e starredHands.total=0', async () => {
    storageMock.getCooldownComplianceMetrics.mockResolvedValue({
      total: 0,
      completed: 0,
      complianceRate: 0,
    });
    storageMock.getStarredHandsDistribution.mockResolvedValue([]);
    storageMock.getTopLessons.mockResolvedValue([]);
    storageMock.getCooldownImpactMetrics.mockResolvedValue({
      withCooldown: { avgRoi: 0 },
      withoutCooldown: { avgRoi: 0 },
      delta: 0,
    });

    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );

    expect(out.ok).toBe(true);
    expect(out.data.cooldownCount).toBe(0);
    expect(out.data.starredHands.total).toBe(0);
    expect(out.data.starredHands.byType).toEqual({});
    expect(out.data.recentLessons).toEqual([]);
  });
});

// =============================================================================
// impact field — opcional baseado em dados
// =============================================================================

describe('readCooldownHistoryTool — impact opcional', () => {
  it('inclui impact quando withCount>0 e withoutCount>0 (Q-Arch-1 ADR-042)', async () => {
    // 6 sessoes com cool-down, 4 sem (10 total - 6 completed)
    storageMock.getCooldownComplianceMetrics.mockResolvedValue({
      total: 10,
      completed: 6,
      complianceRate: 0.6,
    });
    storageMock.getCooldownImpactMetrics.mockResolvedValue({
      withCooldown: { avgRoi: 0.2 },
      withoutCooldown: { avgRoi: 0.05 },
      delta: 0.15,
    });

    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );

    expect(out.data.impact).toBeDefined();
    expect(out.data.impact.withCooldownAvgRoi).toBe(0.2);
    expect(out.data.impact.withoutCooldownAvgRoi).toBe(0.05);
    expect(out.data.impact.delta).toBe(0.15);
    expect(typeof out.data.impact.withCount).toBe('number');
    expect(typeof out.data.impact.withoutCount).toBe('number');
  });

  it('omite impact quando todas as sessoes tem cool-down (sem grupo controle)', async () => {
    storageMock.getCooldownComplianceMetrics.mockResolvedValue({
      total: 5,
      completed: 5, // 100% cooldown
      complianceRate: 1.0,
    });
    storageMock.getCooldownImpactMetrics.mockResolvedValue({
      withCooldown: { avgRoi: 0.2 },
      withoutCooldown: { avgRoi: 0 },
      delta: 0.2,
    });

    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );

    // sem grupo without -> impact omitido
    expect(out.data.impact).toBeUndefined();
  });

  it('omite impact quando nenhuma sessao tem cool-down', async () => {
    storageMock.getCooldownComplianceMetrics.mockResolvedValue({
      total: 5,
      completed: 0,
      complianceRate: 0,
    });

    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );

    expect(out.data.impact).toBeUndefined();
  });
});

// =============================================================================
// Error path — storage lanca
// =============================================================================

describe('readCooldownHistoryTool — error path', () => {
  it('storage lanca -> wrap ok:false code:storage_error', async () => {
    storageMock.getCooldownComplianceMetrics.mockRejectedValue(
      new Error('db connection lost'),
    );

    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );

    expect(out.__type).toBe('ToolResult');
    expect(out.tool).toBe('read_cooldown_history');
    expect(out.ok).toBe(false);
    expect(out.code).toBe('storage_error');
    expect(typeof out.message).toBe('string');
    // mensagem NAO deve vazar stack trace ou conteudo de erro DB completo
    expect(out.message.length).toBeLessThan(500);
  });

  it('storage lanca em getStarredHandsDistribution -> ok:false', async () => {
    storageMock.getStarredHandsDistribution.mockRejectedValue(
      new Error('boom'),
    );
    const out: any = await readCooldownHistoryTool.handler(
      { period: '30d' } as any,
      ctx,
    );
    expect(out.ok).toBe(false);
  });
});
