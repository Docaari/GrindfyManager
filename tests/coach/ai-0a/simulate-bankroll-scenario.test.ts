import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-0A — RF-05: simulate_bankroll_scenario (read tool — substituir stub)
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-05)
// ADR  : 147 §2 — fonte canonica de banca = walletService.getConsolidatedBalance
//                 (USD, FX-aware), com fallback interno p/ user_settings.bankroll_amount
//        Lesson #6 — normalizar p/ USD ANTES de comparar com thresholds USD
//
// TDD red-phase: hoje simulate_bankroll_scenario e um STUB { code:'not_implemented' }
// com inputSchema diferente (abi/targetRoi/sampleSize). O handler real
// `server/coachTools/handlers/simulateBankrollScenario.ts` nao existe.
// =============================================================================

const getConsolidatedBalanceMock = vi.fn();

vi.mock('../../../server/services/walletService', async () => {
  const actual = await vi.importActual<any>('../../../server/services/walletService');
  return {
    ...actual,
    walletService: {
      ...((actual as any).walletService ?? {}),
      getConsolidatedBalance: getConsolidatedBalanceMock,
    },
  };
});

const ctx = { userId: 'USER-0001', chatSessionId: 's', messageId: 'm', actionId: 'a' };

// Shape REAL de ConsolidatedBalance (server/services/walletService.ts).
function fakeBalance(overrides: any = {}): any {
  return {
    aggregationMode: 'global',
    displayCurrency: 'USD',
    totalUSD: '5000.00',
    totalDisplayCurrency: '5000.00',
    rule: '1pct',
    rulePct: 1.0,
    tolerance: 1.5,
    softLimitUSD: '50.00',
    hardLimitUSD: '75.00',
    byWallet: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConsolidatedBalanceMock.mockResolvedValue(fakeBalance());
});

async function loadTool() {
  const { getTool, _resetRegistry } = await import('../../../server/coachTools/registry');
  _resetRegistry();
  await import('../../../server/coachTools/index');
  const tool = getTool('simulate_bankroll_scenario');
  if (!tool) throw new Error('simulate_bankroll_scenario nao registrada');
  return tool;
}

describe('simulate_bankroll_scenario · inputSchema (RF-05 — novo schema, NAO o do stub)', () => {
  it('aceita scenario "lose_n_buyins" com value + buyInUSD', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ scenario: 'lose_n_buyins', value: 10, buyInUSD: 22 }).success).toBe(true);
  });

  it('aceita scenario "profit_amount" sem buyInUSD', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ scenario: 'profit_amount', value: 500 }).success).toBe(true);
  });

  it('rejeita scenario "lose_n_buyins" SEM buyInUSD (superRefine)', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ scenario: 'lose_n_buyins', value: 10 }).success).toBe(false);
  });

  it('rejeita scenario "win_streak" / "lose_streak" sem buyInUSD', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ scenario: 'win_streak', value: 5 }).success).toBe(false);
    expect(tool.inputSchema.safeParse({ scenario: 'lose_streak', value: 5 }).success).toBe(false);
  });

  it('rejeita scenario fora do enum', async () => {
    const tool = await loadTool();
    expect(tool.inputSchema.safeParse({ scenario: 'go_broke', value: 1 }).success).toBe(false);
  });

  it('NAO aceita mais o schema antigo do stub (abi/targetRoi/sampleSize)', async () => {
    const tool = await loadTool();
    // O schema mudou (RF-05). O input antigo do stub nao deve mais validar.
    expect(tool.inputSchema.safeParse({ abi: 22, targetRoi: 5, sampleSize: 1000 }).success).toBe(false);
  });
});

describe('simulate_bankroll_scenario · handler (RF-05)', () => {
  it('le a banca via walletService.getConsolidatedBalance (userId do ctx)', async () => {
    getConsolidatedBalanceMock.mockResolvedValue(fakeBalance());
    const tool = await loadTool();
    await tool.handler({ scenario: 'lose_n_buyins', value: 10, buyInUSD: 22 }, ctx as any);
    expect(getConsolidatedBalanceMock).toHaveBeenCalled();
    expect(getConsolidatedBalanceMock.mock.calls[0][0]).toBe('USER-0001');
  });

  it('output: {scenario, currency:"USD", currentAmount, newAmount, percentChange, ruleViolated, alertLevel, recommendation}', async () => {
    getConsolidatedBalanceMock.mockResolvedValue(fakeBalance({ totalUSD: '5000.00' }));
    const tool = await loadTool();
    const out: any = await tool.handler({ scenario: 'lose_n_buyins', value: 10, buyInUSD: 22 }, ctx as any);
    const data = out.data ?? out;
    expect(data.scenario).toBe('lose_n_buyins');
    expect(data.currency).toBe('USD');
    expect(typeof data.currentAmount).toBe('number');
    expect(typeof data.newAmount).toBe('number');
    expect(typeof data.percentChange).toBe('number');
    expect(typeof data.ruleViolated).toBe('boolean');
    expect(['safe', 'warning', 'danger']).toContain(data.alertLevel);
    expect(typeof data.recommendation).toBe('string');
  });

  it('cenario que leva banca abaixo do hard limit => ruleViolated:true, alertLevel:"danger"', async () => {
    // Banca tiny + 1pct => hard limit ~ tiny. Perder 50 buy-ins de $22 = -$1100,
    // bem abaixo de qualquer hard limit razoavel.
    getConsolidatedBalanceMock.mockResolvedValue(
      fakeBalance({ totalUSD: '1000.00', softLimitUSD: '10.00', hardLimitUSD: '15.00' }),
    );
    const tool = await loadTool();
    const out: any = await tool.handler({ scenario: 'lose_n_buyins', value: 50, buyInUSD: 22 }, ctx as any);
    const data = out.data ?? out;
    expect(data.ruleViolated).toBe(true);
    expect(data.alertLevel).toBe('danger');
  });

  it('conversao de moeda: getConsolidatedBalance ja entrega totalUSD; handler nao re-converte errado', async () => {
    // O contrato e: o handler usa totalUSD direto (lesson #6 — a normalizacao
    // p/ USD acontece no walletService). currentAmount deve bater com totalUSD.
    getConsolidatedBalanceMock.mockResolvedValue(fakeBalance({ totalUSD: '3333.33' }));
    const tool = await loadTool();
    const out: any = await tool.handler({ scenario: 'profit_amount', value: 100 }, ctx as any);
    const data = out.data ?? out;
    expect(data.currentAmount).toBeCloseTo(3333.33, 2);
  });

  it('recommendation usa tom condicional (poderia/considerar) e NAO conselho financeiro/fiscal', async () => {
    getConsolidatedBalanceMock.mockResolvedValue(fakeBalance());
    const tool = await loadTool();
    const out: any = await tool.handler({ scenario: 'lose_n_buyins', value: 10, buyInUSD: 22 }, ctx as any);
    const data = out.data ?? out;
    const rec = String(data.recommendation).toLowerCase();
    // Tom condicional: alguma forma de "poderia", "considerar", "talvez", "pode".
    expect(rec).toMatch(/poder|consider|talvez/);
    // Nao usa imperativo "voce deve".
    expect(rec).not.toMatch(/voc[êe]\s+deve\b/);
  });
});

describe('simulate_bankroll_scenario · banca nao configurada (RF-05 — edge)', () => {
  it('banca zero / nao configurada => note:"bankroll_nao_configurado", alertLevel:"safe", sem throw', async () => {
    getConsolidatedBalanceMock.mockResolvedValue(
      fakeBalance({ totalUSD: '0.00', softLimitUSD: null, hardLimitUSD: null }),
    );
    const tool = await loadTool();
    const out: any = await tool.handler({ scenario: 'profit_amount', value: 100 }, ctx as any);
    const data = out.data ?? out;
    expect(data.note).toBe('bankroll_nao_configurado');
    expect(data.currentAmount).toBe(0);
    expect(data.newAmount).toBe(0);
    expect(data.ruleViolated).toBe(false);
    expect(data.alertLevel).toBe('safe');
  });

  it('walletService que EXPLODE => loga + handler_error (lesson #9)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getConsolidatedBalanceMock.mockRejectedValue(new Error('fx resolver down'));
    const tool = await loadTool();
    const out: any = await tool.handler({ scenario: 'profit_amount', value: 100 }, ctx as any);
    expect(out.ok).toBe(false);
    expect(out.error ?? out.code).toMatch(/handler_error/);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('simulate_bankroll_scenario · descriptor (RF-05)', () => {
  it('nao e mais stub; requiresConfirmation false; auditLevel log; gateByTier Pro+', async () => {
    const tool = await loadTool();
    expect((tool as any).__stub).toBeUndefined();
    expect(tool.requiresConfirmation).toBeFalsy();
    expect(tool.auditLevel).toBe('log');
    expect(tool.gateByTier).toEqual(expect.arrayContaining(['pro', 'premium', 'admin']));
  });
});
