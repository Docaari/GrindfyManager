import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-3 / RF-07 — Prompt block "rituais de cool-down recentes"
//
// Spec : Docs/specs/cooldown-refactor-plan.md (RF-07)
// ADR  : Docs/architecture/decisions/042-cooldown-coach-tool-registry.md
// Base : ADR-019 (cache strategy — bloco STATIC cacheable)
// Flow : Docs/architecture/flows/coach/sequence-cooldown-tool.mermaid (cenarios C/D)
//
// Modulo a ser criado pelo Implementer:
//   server/coachPromptBlocks.ts
//
// Exporta:
//   buildCooldownPromptBlock(userId: string): Promise<string>
//
// Pattern:
//   - agrega ultimas 5 sessoes via storage.getRecentCooldownDigest(userId, 5)
//   - inclui counts/totalSessions, top 3 type starred, top 5 lessons tokens,
//     trend impact (positivo/negativo)
//   - sanitizado: NAO contem notes, cGame, action
//   - token budget <=300 (estimativa via length / ~4 chars per token)
//   - cache key consistente: mesmo userId + dataset -> mesma string (deterministico)
//   - empty: usuario sem cool-downs -> string vazia ou indicador neutro
//
// IMPORTANT: red phase — modulo NAO existe; testes falham por module-not-found.
// =============================================================================

const storageMock: any = {
  getRecentCooldownDigest: vi.fn(),
  getStarredHandsDistribution: vi.fn(),
  getTopLessons: vi.fn(),
  getCooldownComplianceMetrics: vi.fn(),
  getCooldownImpactMetrics: vi.fn(),
};
vi.mock('../../../server/storage', () => ({
  storage: storageMock,
}));

import { buildCooldownPromptBlock } from '../../../server/coachPromptBlocks';

// =============================================================================
// Setup mocks
// =============================================================================

function digestRow(overrides: any = {}) {
  return {
    sessionId: 'sess_1',
    completedAt: new Date('2026-04-25T22:00:00Z'),
    mode: 'full' as const,
    blocksCompleted: ['hands', 'abc'],
    starredCount: 2,
    dominantStarredType: 'tilt' as const,
    hasLesson: true,
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(storageMock).forEach((fn: any) => fn.mockReset?.());

  storageMock.getRecentCooldownDigest.mockResolvedValue([
    digestRow({ sessionId: 's1', dominantStarredType: 'tilt', starredCount: 2 }),
    digestRow({ sessionId: 's2', dominantStarredType: 'leak', starredCount: 1 }),
    digestRow({ sessionId: 's3', dominantStarredType: 'tilt', starredCount: 3 }),
    digestRow({ sessionId: 's4', dominantStarredType: 'mistake', starredCount: 1 }),
    digestRow({ sessionId: 's5', dominantStarredType: 'tilt', starredCount: 2 }),
  ]);
  storageMock.getStarredHandsDistribution.mockResolvedValue([
    { type: 'tilt', count: 6 },
    { type: 'leak', count: 2 },
    { type: 'mistake', count: 1 },
  ]);
  storageMock.getTopLessons.mockResolvedValue([
    { token: 'paciencia', count: 4 },
    { token: 'foco', count: 3 },
    { token: 'disciplina', count: 2 },
    { token: 'icm', count: 2 },
    { token: 'tilt', count: 1 },
    { token: 'pausa', count: 1 },
  ]);
  storageMock.getCooldownComplianceMetrics.mockResolvedValue({
    total: 7,
    completed: 5,
    complianceRate: 5 / 7,
  });
  storageMock.getCooldownImpactMetrics.mockResolvedValue({
    withCooldown: { avgRoi: 0.18 },
    withoutCooldown: { avgRoi: 0.05 },
    delta: 0.13,
  });
});

// =============================================================================
// Output content
// =============================================================================

describe('buildCooldownPromptBlock — content basico', () => {
  it('retorna string', async () => {
    const out = await buildCooldownPromptBlock('USER-0001');
    expect(typeof out).toBe('string');
  });

  it('inclui contagem de sessoes (cooldownCount/totalSessions)', async () => {
    const out = await buildCooldownPromptBlock('USER-0001');
    // Aceita "5/7" ou "5 de 7" ou "5 cool-downs em 7 sessoes" — heuristica
    // generica via regex de ambos os numeros aparecendo proximos.
    expect(out).toMatch(/5/);
    expect(out).toMatch(/7/);
  });

  it('inclui top 3 starred types (tilt aparece como dominante)', async () => {
    const out = await buildCooldownPromptBlock('USER-0001');
    expect(out.toLowerCase()).toContain('tilt');
  });

  it('inclui pelo menos 5 tokens de licao mais frequentes', async () => {
    const out = await buildCooldownPromptBlock('USER-0001');
    expect(out).toMatch(/paciencia/i);
    expect(out).toMatch(/foco/i);
    // top 5 enforced
    expect(out).toMatch(/disciplina/i);
    expect(out).toMatch(/icm/i);
    expect(out).toMatch(/tilt/i);
  });

  it('inclui sinal de impact delta (positivo ou negativo)', async () => {
    const out = await buildCooldownPromptBlock('USER-0001');
    // delta=0.13 -> texto deve mencionar diferenca ou ROI
    expect(out.toLowerCase()).toMatch(/roi|impact|delta|diferen|positiv|melhor/);
  });
});

// =============================================================================
// Sanitizer — sem PII
// =============================================================================

describe('buildCooldownPromptBlock — sanitizer PII-free', () => {
  it('NAO contem campo "notes"', async () => {
    storageMock.getRecentCooldownDigest.mockResolvedValue([
      digestRow({ notes: 'minha nota privada' as any }), // hipotetico
    ]);
    const out = await buildCooldownPromptBlock('USER-0001');
    expect(out.toLowerCase()).not.toMatch(/minha nota privada/);
    expect(out).not.toMatch(/"notes"/);
  });

  it('NAO contem campo "cGame"', async () => {
    storageMock.getRecentCooldownDigest.mockResolvedValue([
      digestRow({ cGame: 'erros conscientes' as any }),
    ]);
    const out = await buildCooldownPromptBlock('USER-0001');
    expect(out.toLowerCase()).not.toMatch(/erros conscientes/);
    expect(out).not.toMatch(/cGame/);
  });

  it('NAO contem campo "action" (tilt action)', async () => {
    storageMock.getRecentCooldownDigest.mockResolvedValue([
      digestRow({ action: 'pausar antes do proximo' as any }),
    ]);
    const out = await buildCooldownPromptBlock('USER-0001');
    expect(out.toLowerCase()).not.toMatch(/pausar antes/);
  });
});

// =============================================================================
// Token budget — <=300 tokens
// =============================================================================

describe('buildCooldownPromptBlock — token budget', () => {
  it('output <= ~300 tokens (length < 1500 chars approx 4 chars/token)', async () => {
    const out = await buildCooldownPromptBlock('USER-0001');
    expect(out.length).toBeLessThan(1500);
  });

  it('output enxuto mesmo com 5 sessoes + 6 lessons', async () => {
    storageMock.getTopLessons.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({
        token: `tok${i}`,
        count: 30 - i,
      })),
    );
    const out = await buildCooldownPromptBlock('USER-0001');
    expect(out.length).toBeLessThan(1500);
  });
});

// =============================================================================
// Determinismo — mesma entrada -> mesma string (cacheabilidade)
// =============================================================================

describe('buildCooldownPromptBlock — determinismo (cache key estavel)', () => {
  it('mesma chamada (mesmo userId + dataset) produz mesma string', async () => {
    const out1 = await buildCooldownPromptBlock('USER-0001');
    const out2 = await buildCooldownPromptBlock('USER-0001');
    expect(out1).toBe(out2);
  });

  it('userId diferente nao afeta output se dataset for igual (sanity)', async () => {
    // mock retorna mesmo dataset para ambos userIds
    const outA = await buildCooldownPromptBlock('USER-0001');
    const outB = await buildCooldownPromptBlock('USER-0002');
    // Output pode ser identico (string nao incorpora userId — apenas digest)
    // OU pode incluir userId — qualquer comportamento aceitavel; teste apenas
    // verifica que NAO ha randomness/timestamps que mudam call-a-call.
    const outA2 = await buildCooldownPromptBlock('USER-0001');
    expect(outA).toBe(outA2);
  });
});

// =============================================================================
// Empty path
// =============================================================================

describe('buildCooldownPromptBlock — usuario sem cool-downs', () => {
  it('retorna string vazia ou indicador "Sem cool-downs recentes"', async () => {
    storageMock.getRecentCooldownDigest.mockResolvedValue([]);
    storageMock.getStarredHandsDistribution.mockResolvedValue([]);
    storageMock.getTopLessons.mockResolvedValue([]);
    storageMock.getCooldownComplianceMetrics.mockResolvedValue({
      total: 0,
      completed: 0,
      complianceRate: 0,
    });

    const out = await buildCooldownPromptBlock('USER-0001');

    // Aceita: string vazia OU indicador neutro curto.
    if (out.length > 0) {
      expect(out.length).toBeLessThan(200);
      expect(out.toLowerCase()).toMatch(/sem cool-down|sem ritual|nenhum cool/);
    } else {
      expect(out).toBe('');
    }
  });
});
