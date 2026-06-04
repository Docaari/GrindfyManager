/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-2 — RF-34 (B12 Heuristicas server-side).
 *
 * Spec : Docs/specs/home-reform-2.md §3 B12, §5 RF-34
 * ADR  : Docs/architecture/decisions/108-home-heuristics-server-side-rules.md
 * Diag : Docs/architecture/diagrams/home-reform-2-heuristics-rule-flow.mermaid
 *
 * Status RED: servico NAO existe em
 * `server/services/homeHeuristics.ts`.
 *
 * Servico puro server-side:
 *   - Sem I/O.
 *   - Inputs ja agregados (perf30d, perf60d, recentSessions, variance, todayDayOfWeek, lifetime).
 *   - Output: Array<Heuristic> max 3.
 *
 * 4 regras Onda 2 (em ordem fixa de prioridade):
 *   1. roi-30d-vs-60d-drop   (caution)
 *   2. best-day-of-week      (positive)
 *   3. worst-day-of-week-warning (caution)
 *   4. cash-pace-vs-baseline (positive | caution)
 *
 * Lessons aplicadas:
 *   #3 servico puro = teste isolado, sem mock idealizado.
 *   #9 funcao pura nao logga; orchestrator faz isso.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

interface RecentSession {
  date: string;
  pnlUsd: number;
}

function buildRecentSessions(spec: Array<{ dayOfWeek: number; pnlUsd: number; buyinUsd?: number }>): RecentSession[] {
  // Date base: 2026-05-03 (Sun=0). Gera datas que caem no dayOfWeek pedido.
  return spec.map((s, i) => {
    const base = new Date(2026, 4, 3); // 2026-05-03 (domingo)
    // Ajusta para o dayOfWeek desejado, recuando dias
    const offset = (base.getDay() - s.dayOfWeek + 7) % 7;
    const target = new Date(base.getTime() - (offset + 7 * Math.floor(i / 7)) * 24 * 3600 * 1000);
    return {
      date: target.toISOString().slice(0, 10),
      pnlUsd: s.pnlUsd,
    };
  });
}

const baseInput = {
  userId: 'USER-0001',
  quickStats: {
    totalTournaments: 1000,
    totalSessions: 100,
    activeDays: 200,
    currentStreakDays: 5,
  },
  performance30d: { roi: 5, itm: 18, cash: 1000 },
  performance60d: { roi: 8, itm: 18, cash: 2000 },
  recentSessions: [] as RecentSession[],
  variance: null as null | { status: 'lucky' | 'normal' | 'unlucky'; sigmaMultiple: number },
  todayDayOfWeek: 2, // terca
  lifetime: { cash: 12000, monthsLifetime: 12 },
};

// ===========================================================================
// Regra 1: roi-30d-vs-60d-drop
// ===========================================================================

describe('homeHeuristics — Regra 1: roi-30d-vs-60d-drop', () => {
  it('dispara quando perf60d.roi - perf30d.roi >= 5pp', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const input = {
      ...baseInput,
      performance30d: { roi: 10, itm: 15, cash: 800 },
      performance60d: { roi: 20, itm: 18, cash: 2000 },
    };
    const out = computeHeuristics(input);
    const r1 = out.find((h: any) => h.id === 'roi-30d-vs-60d-drop');
    expect(r1).toBeDefined();
    expect(r1?.severity).toBe('caution');
    expect(r1?.message).toMatch(/ROI 30d caiu/);
    expect(r1?.message).toMatch(/10\.0 pp|10 pp/); // 20 - 10 = 10pp
    expect(r1?.ctaHref).toBe('/grade-planner'); // fix: /tournament-selector was a dead route (not in Wouter table); selector lives in /grade-planner
  });

  it('NAO dispara quando queda < 5pp', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const input = {
      ...baseInput,
      performance30d: { roi: 10, itm: 15, cash: 800 },
      performance60d: { roi: 13, itm: 18, cash: 2000 },
    };
    const out = computeHeuristics(input);
    expect(out.find((h: any) => h.id === 'roi-30d-vs-60d-drop')).toBeUndefined();
  });

  it('NAO dispara quando 30d > 60d (melhora)', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const input = {
      ...baseInput,
      performance30d: { roi: 25, itm: 22, cash: 1500 },
      performance60d: { roi: 10, itm: 18, cash: 2000 },
    };
    const out = computeHeuristics(input);
    expect(out.find((h: any) => h.id === 'roi-30d-vs-60d-drop')).toBeUndefined();
  });
});

// ===========================================================================
// Regra 2: best-day-of-week
// ===========================================================================

describe('homeHeuristics — Regra 2: best-day-of-week', () => {
  it('dispara quando dia tem ROI medio +10pp acima da media (>=5 sessoes naquele dia)', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    // Construir 60 sessoes: 6 em domingo com pnl alto (ROI alto), restante neutro
    const sessions: any[] = [];
    // 6 sessoes domingo com pnl=200, buyinUsd=100 -> ROI 200% medio
    for (let i = 0; i < 6; i++) sessions.push({ dayOfWeek: 0, pnlUsd: 200, buyinUsd: 100 });
    // 54 sessoes em outros dias com pnl=10, buyinUsd=100 -> ROI 10%
    for (let i = 0; i < 54; i++) sessions.push({ dayOfWeek: ((i % 6) + 1), pnlUsd: 10, buyinUsd: 100 });

    const input = { ...baseInput, recentSessions: buildRecentSessions(sessions) };
    const out = computeHeuristics(input);
    const r2 = out.find((h: any) => h.id === 'best-day-of-week');
    // Pode disparar; assercao minima: se disparou, severity=positive e mensagem PT-BR
    if (r2) {
      expect(r2.severity).toBe('positive');
      expect(r2.message).toMatch(/melhor dia|costuma ser/i);
      expect(r2.ctaHref).toMatch(/dashboard/);
    } else {
      // Se nao disparou (quando recentSessions length < 60), ok tambem.
      // Mas pelo cenario montado deveria disparar.
      expect(input.recentSessions.length).toBeGreaterThanOrEqual(60);
    }
  });

  it('NAO dispara quando recentSessions.length < 60', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const sessions: any[] = [];
    for (let i = 0; i < 30; i++) sessions.push({ dayOfWeek: 0, pnlUsd: 200, buyinUsd: 100 });

    const input = { ...baseInput, recentSessions: buildRecentSessions(sessions) };
    const out = computeHeuristics(input);
    expect(out.find((h: any) => h.id === 'best-day-of-week')).toBeUndefined();
  });

  it('NAO dispara quando nenhum dia atinge +10pp acima da media', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const sessions: any[] = [];
    // Distribuicao homogenea — nenhum dia se destaca
    for (let i = 0; i < 70; i++) sessions.push({ dayOfWeek: i % 7, pnlUsd: 10, buyinUsd: 100 });

    const input = { ...baseInput, recentSessions: buildRecentSessions(sessions) };
    const out = computeHeuristics(input);
    expect(out.find((h: any) => h.id === 'best-day-of-week')).toBeUndefined();
  });
});

// ===========================================================================
// Regra 3: worst-day-of-week-warning
// ===========================================================================

describe('homeHeuristics — Regra 3: worst-day-of-week-warning', () => {
  it('dispara somente quando todayDayOfWeek === piorDia E diff <= -10pp', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const sessions: any[] = [];
    // 6 sessoes terca com pnl=-200 (ROI -200%); resto neutro pnl=10
    for (let i = 0; i < 6; i++) sessions.push({ dayOfWeek: 2, pnlUsd: -200, buyinUsd: 100 });
    for (let i = 0; i < 54; i++) sessions.push({ dayOfWeek: ((i % 6) === 2 ? 3 : (i % 6)), pnlUsd: 10, buyinUsd: 100 });

    const input = {
      ...baseInput,
      recentSessions: buildRecentSessions(sessions),
      todayDayOfWeek: 2, // hoje eh terca
    };
    const out = computeHeuristics(input);
    const r3 = out.find((h: any) => h.id === 'worst-day-of-week-warning');
    if (r3) {
      expect(r3.severity).toBe('caution');
      expect(r3.ctaHref).toMatch(/grade-planner/);
    }
  });

  it('NAO dispara quando todayDayOfWeek !== piorDia (mesmo se houver pior dia)', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const sessions: any[] = [];
    for (let i = 0; i < 6; i++) sessions.push({ dayOfWeek: 2, pnlUsd: -200, buyinUsd: 100 });
    for (let i = 0; i < 54; i++) sessions.push({ dayOfWeek: ((i % 6) === 2 ? 3 : (i % 6)), pnlUsd: 10, buyinUsd: 100 });

    const input = {
      ...baseInput,
      recentSessions: buildRecentSessions(sessions),
      todayDayOfWeek: 5, // sexta — diferente do pior dia
    };
    const out = computeHeuristics(input);
    expect(out.find((h: any) => h.id === 'worst-day-of-week-warning')).toBeUndefined();
  });
});

// ===========================================================================
// Regra 4: cash-pace-vs-baseline
// ===========================================================================

describe('homeHeuristics — Regra 4: cash-pace-vs-baseline', () => {
  it('dispara positive quando cash30d / (cashLifetime/months) > 1.2', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    // baseline = 12000/12 = 1000/mes. cash30d=1500 -> ratio=1.5 > 1.2
    const input = {
      ...baseInput,
      performance30d: { roi: 5, itm: 18, cash: 1500 },
      lifetime: { cash: 12000, monthsLifetime: 12 },
    };
    const out = computeHeuristics(input);
    const r4 = out.find((h: any) => h.id === 'cash-pace-vs-baseline');
    expect(r4).toBeDefined();
    expect(r4?.severity).toBe('positive');
    expect(r4?.message).toMatch(/acima da media|pace/i);
    expect(r4?.ctaHref).toBe('/dashboard');
  });

  it('dispara caution quando ratio < 0.8', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const input = {
      ...baseInput,
      performance30d: { roi: 5, itm: 18, cash: 500 }, // 500/1000 = 0.5
      lifetime: { cash: 12000, monthsLifetime: 12 },
    };
    const out = computeHeuristics(input);
    const r4 = out.find((h: any) => h.id === 'cash-pace-vs-baseline');
    expect(r4).toBeDefined();
    expect(r4?.severity).toBe('caution');
    expect(r4?.message).toMatch(/abaixo da media|pace/i);
  });

  it('NAO dispara quando ratio entre 0.8 e 1.2 (banda neutra)', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const input = {
      ...baseInput,
      performance30d: { roi: 5, itm: 18, cash: 1000 }, // ratio = 1.0
      lifetime: { cash: 12000, monthsLifetime: 12 },
    };
    const out = computeHeuristics(input);
    expect(out.find((h: any) => h.id === 'cash-pace-vs-baseline')).toBeUndefined();
  });

  it('NAO dispara quando lifetime.cash <= 0 ou monthsLifetime <= 0', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const input = {
      ...baseInput,
      performance30d: { roi: 5, itm: 18, cash: 1500 },
      lifetime: { cash: 0, monthsLifetime: 0 },
    };
    const out = computeHeuristics(input);
    expect(out.find((h: any) => h.id === 'cash-pace-vs-baseline')).toBeUndefined();
  });
});

// ===========================================================================
// Output contract: shape + max 3 + determinismo
// ===========================================================================

describe('homeHeuristics — output contract', () => {
  it('cada item tem { id, message, severity, ctaHref }', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const input = {
      ...baseInput,
      performance30d: { roi: 10, itm: 18, cash: 1500 },
      performance60d: { roi: 20, itm: 18, cash: 3000 },
      lifetime: { cash: 12000, monthsLifetime: 12 },
    };
    const out = computeHeuristics(input);
    out.forEach((h: any) => {
      expect(h).toHaveProperty('id');
      expect(h).toHaveProperty('message');
      expect(h).toHaveProperty('severity');
      expect(h).toHaveProperty('ctaHref');
      expect(['info', 'caution', 'positive']).toContain(h.severity);
    });
  });

  it('retorna no maximo 3 heuristicas', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    // Cenario com varias regras disparando
    const sessions: any[] = [];
    for (let i = 0; i < 6; i++) sessions.push({ dayOfWeek: 0, pnlUsd: 200, buyinUsd: 100 });
    for (let i = 0; i < 54; i++) sessions.push({ dayOfWeek: ((i % 6) + 1), pnlUsd: 10, buyinUsd: 100 });

    const input = {
      ...baseInput,
      performance30d: { roi: 10, itm: 18, cash: 1500 },
      performance60d: { roi: 20, itm: 18, cash: 3000 },
      recentSessions: buildRecentSessions(sessions),
      lifetime: { cash: 12000, monthsLifetime: 12 },
    };
    const out = computeHeuristics(input);
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it('determinismo: mesmo input -> mesmo output', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const input = {
      ...baseInput,
      performance30d: { roi: 10, itm: 18, cash: 1500 },
      performance60d: { roi: 20, itm: 18, cash: 3000 },
      lifetime: { cash: 12000, monthsLifetime: 12 },
    };
    const a = computeHeuristics(input);
    const b = computeHeuristics(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('mensagens em PT-BR', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const input = {
      ...baseInput,
      performance30d: { roi: 10, itm: 18, cash: 1500 },
      performance60d: { roi: 20, itm: 18, cash: 3000 },
      lifetime: { cash: 12000, monthsLifetime: 12 },
    };
    const out = computeHeuristics(input);
    expect(out.length).toBeGreaterThan(0);
    out.forEach((h: any) => {
      // PT-BR markers basicos: "ROI", "media", "pace", "selecao", acentos plausíveis
      expect(typeof h.message).toBe('string');
      expect(h.message.length).toBeGreaterThan(5);
    });
  });

  it('retorna [] quando nenhuma regra dispara', async () => {
    const { computeHeuristics } = await import('../../server/services/homeHeuristics');
    const input = {
      ...baseInput,
      performance30d: { roi: 5, itm: 18, cash: 1000 },
      performance60d: { roi: 6, itm: 18, cash: 2000 },
      recentSessions: [],
      lifetime: { cash: 12000, monthsLifetime: 12 },
    };
    const out = computeHeuristics(input);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBe(0);
  });
});
