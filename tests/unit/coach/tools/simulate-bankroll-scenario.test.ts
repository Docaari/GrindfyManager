import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Sprint Coach-2A / RF-03 Tool 5 — simulate_bankroll_scenario
//
// Modulo a ser criado pelo Implementer:
//   server/coachTools/handlers/simulateBankrollScenario.ts
//
// Input com superRefine: lose_n_buyins | win_streak | lose_streak exigem buyInUSD.
// Le bankroll_amount + bankroll_rule de user_settings, calcula novo saldo,
// avalia se hard limit (1.5x da regra) seria violado.
//
// Output: { scenario, currentAmount, newAmount, percentChange, ruleViolated,
//           alertLevel: 'safe'|'warning'|'danger', recommendation: string }
//
// Spec RF-03 Tool 5 + Bankroll Management spec (tolerancia 1.5x).
// =============================================================================

const getBankrollMock = vi.fn();
vi.mock('../../../../server/services/bankrollService', () => ({
  getBankrollState: (...args: any[]) => getBankrollMock(...args),
}));

import { simulateBankrollScenarioTool } from '../../../../server/coachTools/handlers/simulateBankrollScenario';

const ctx = { userId: 'USER-0001', chatSessionId: 'sess', messageId: 'm1' } as any;

beforeEach(() => {
  getBankrollMock.mockReset();
});

describe('simulateBankrollScenarioTool — schema', () => {
  it('rejeita scenario invalido', () => {
    expect(
      simulateBankrollScenarioTool.inputSchema.safeParse({
        scenario: 'unknown',
        value: 1,
      }).success,
    ).toBe(false);
  });

  it('rejeita lose_n_buyins SEM buyInUSD', () => {
    expect(
      simulateBankrollScenarioTool.inputSchema.safeParse({
        scenario: 'lose_n_buyins',
        value: 5,
      }).success,
    ).toBe(false);
  });

  it('aceita lose_n_buyins COM buyInUSD', () => {
    expect(
      simulateBankrollScenarioTool.inputSchema.safeParse({
        scenario: 'lose_n_buyins',
        value: 5,
        buyInUSD: 22,
      }).success,
    ).toBe(true);
  });

  it('aceita profit_amount SEM buyInUSD (so cenarios de buy-ins exigem)', () => {
    expect(
      simulateBankrollScenarioTool.inputSchema.safeParse({
        scenario: 'profit_amount',
        value: 100,
      }).success,
    ).toBe(true);
  });
});

describe('simulateBankrollScenarioTool — handler / cenarios', () => {
  it('lose_n_buyins=5 buyInUSD=$22 com banca $1100 e regra 1pct -> percentChange=-10%', async () => {
    getBankrollMock.mockResolvedValue({
      configured: true,
      amount: 1100,
      rule: '1pct',
      rulePct: 1.0,
      tolerance: 1.5,
      maxBuyInUSD: 16.5,
    });
    const out: any = await simulateBankrollScenarioTool.handler(
      { scenario: 'lose_n_buyins', value: 5, buyInUSD: 22 } as any,
      ctx,
    );
    expect(out.currentAmount).toBe(1100);
    expect(out.newAmount).toBeCloseTo(990, 5);
    expect(out.percentChange).toBeCloseTo(-10, 1);
    expect(out.ruleViolated).toBe(true);
    expect(out.alertLevel).toBe('danger');
    expect(typeof out.recommendation).toBe('string');
    expect(out.recommendation.length).toBeGreaterThan(0);
  });

  it('profit_amount positivo nao viola regra -> alertLevel=safe', async () => {
    getBankrollMock.mockResolvedValue({
      configured: true,
      amount: 1000,
      rule: '1pct',
      rulePct: 1.0,
      tolerance: 1.5,
      maxBuyInUSD: 15,
    });
    const out: any = await simulateBankrollScenarioTool.handler(
      { scenario: 'profit_amount', value: 200 } as any,
      ctx,
    );
    expect(out.newAmount).toBe(1200);
    expect(out.percentChange).toBeCloseTo(20, 1);
    expect(out.ruleViolated).toBe(false);
    expect(out.alertLevel).toBe('safe');
  });

  it('lose_streak gera percentChange negativo', async () => {
    getBankrollMock.mockResolvedValue({
      configured: true,
      amount: 2000,
      rule: '2pct',
      rulePct: 2.0,
      tolerance: 1.5,
      maxBuyInUSD: 60,
    });
    const out: any = await simulateBankrollScenarioTool.handler(
      { scenario: 'lose_streak', value: 3, buyInUSD: 22 } as any,
      ctx,
    );
    expect(out.percentChange).toBeLessThan(0);
  });

  it('win_streak gera percentChange positivo', async () => {
    getBankrollMock.mockResolvedValue({
      configured: true,
      amount: 2000,
      rule: '2pct',
      rulePct: 2.0,
      tolerance: 1.5,
      maxBuyInUSD: 60,
    });
    const out: any = await simulateBankrollScenarioTool.handler(
      { scenario: 'win_streak', value: 4, buyInUSD: 22 } as any,
      ctx,
    );
    expect(out.percentChange).toBeGreaterThan(0);
  });
});

describe('simulateBankrollScenarioTool — alertLevel thresholds', () => {
  it('queda pequena (<5%) sem violar regra -> safe', async () => {
    getBankrollMock.mockResolvedValue({
      configured: true,
      amount: 10000,
      rule: '1pct',
      rulePct: 1.0,
      tolerance: 1.5,
      maxBuyInUSD: 150,
    });
    const out: any = await simulateBankrollScenarioTool.handler(
      { scenario: 'profit_amount', value: -100 } as any,
      ctx,
    );
    expect(out.alertLevel).toBe('safe');
  });

  it('queda moderada (~5-10%) -> warning', async () => {
    getBankrollMock.mockResolvedValue({
      configured: true,
      amount: 1000,
      rule: '1pct',
      rulePct: 1.0,
      tolerance: 1.5,
      maxBuyInUSD: 15,
    });
    const out: any = await simulateBankrollScenarioTool.handler(
      { scenario: 'profit_amount', value: -70 } as any,
      ctx,
    );
    expect(['warning', 'danger']).toContain(out.alertLevel);
  });
});

describe('simulateBankrollScenarioTool — edge cases', () => {
  it('bankroll nao configurado -> note + recommendation orienta a configurar', async () => {
    getBankrollMock.mockResolvedValue({
      configured: false,
      amount: 0,
    });
    const out: any = await simulateBankrollScenarioTool.handler(
      { scenario: 'lose_n_buyins', value: 5, buyInUSD: 22 } as any,
      ctx,
    );
    expect(out.note || '').toMatch(/banca/i);
    expect(out.recommendation).toMatch(/configur/i);
  });
});
