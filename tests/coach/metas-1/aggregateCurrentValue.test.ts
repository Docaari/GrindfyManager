import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// METAS-1 fatia-1 (ADR-229) — aggregateCurrentValue.ts — RED phase
//
// Modulo alvo (AINDA NAO EXISTE):
//   server/coach/goals/aggregateCurrentValue.ts
//     aggregateCurrentValue(userId, sourceMetric, window, deps?)
//       -> { value: number | null; dataSufficiency: 'ok' | 'low'; note?: string }
//
// Despacho por sourceMetric (mapa RF-05):
//   - financeira (bankroll_usd): FX -> USD ANTES de comparar (#6); FX ausente
//     NAO zera -> fallback nativo + log (#9).
//   - performance (roi_pct/abi/itm_pct): getPerformanceByPeriod, filtra
//     grind_session_id IS NULL (SS6.1).
//   - volume (sessions_per_week/grind_days): count(grind_sessions completed).
//   - estudo (study_minutes_week/study_sessions_count): sum/count study_sessions_v2.
//   - numeric da coluna parseado via parseFloat na boundary (string "12.5" -> 12.5),
//     NUNCA Number() cego.
//
// Convencoes:
//   - storage/fx injetados por COMPOSICAO via `deps` (lessons #34) — SEM
//     vi.mock('../storage') global.
//   - await import (lessons #14/#26/#38).
//   - mocks espelham shape REAL (lesson #3): getPerformanceByPeriod retorna
//     metricas de historico; getGrindSessions retorna rows com status; wallets
//     com balance numeric STRING + currency.
//
// Suposicoes documentadas (ADR ambiguo sobre o shape exato de `deps`):
//   - deps expoe as fontes como funcoes nomeadas. Ramo escolhido (mais provavel):
//       deps.getPerformanceByPeriod(userId, window)
//       deps.getGrindSessions(userId, window)  -> rows {status,date}
//       deps.getStudySessionsV2(userId, window) -> rows {durationMinutes,deletedAt}
//       deps.getWallets(userId) -> rows {balance(string),currency}
//       deps.fxToUsd(amountNative, currency) -> number | null  (null = FX ausente)
//     Se o implementer escolher outro shape, ele NAO modifica o teste — documenta
//     o impedimento (regra TDD da casa).
//   - `window` = { weekStartDate: 'YYYY-MM-DD' } (chave UTC). O teste so passa o
//     objeto; a forma interna nao e exercitada aqui.
//
// .test.ts roda no projeto "server" (node).
// =============================================================================

async function loadAgg() {
  return await import('../../../server/coach/goals/aggregateCurrentValue');
}

const WINDOW = { weekStartDate: '2026-06-01' };

beforeEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Volume — count(grind_sessions status='completed')
// -----------------------------------------------------------------------------
describe('aggregateCurrentValue — volume (sessions_per_week)', () => {
  it('conta apenas grind_sessions com status="completed" na janela', async () => {
    const { aggregateCurrentValue } = await loadAgg();
    const deps: any = {
      getGrindSessions: vi.fn(async () => [
        { id: 's1', status: 'completed', date: new Date('2026-06-02') },
        { id: 's2', status: 'completed', date: new Date('2026-06-03') },
        { id: 's3', status: 'planned', date: new Date('2026-06-04') }, // nao conta
      ]),
    };
    const r = await aggregateCurrentValue('USER-1', 'sessions_per_week', WINDOW, deps);
    expect(r.value).toBe(2);
  });
});

// -----------------------------------------------------------------------------
// Performance — getPerformanceByPeriod, filtra grind_session_id IS NULL (SS6.1)
// -----------------------------------------------------------------------------
describe('aggregateCurrentValue — performance (roi_pct/abi)', () => {
  it('roi_pct usa getPerformanceByPeriod (historico, grind_session_id IS NULL)', async () => {
    const { aggregateCurrentValue } = await loadAgg();
    const getPerformanceByPeriod = vi.fn(async () => ({ roi: 22.5, abi: 11, itmPct: 18, totalTournaments: 50 }));
    const deps: any = { getPerformanceByPeriod };
    const r = await aggregateCurrentValue('USER-1', 'roi_pct', WINDOW, deps);
    expect(getPerformanceByPeriod).toHaveBeenCalled();
    expect(typeof r.value).toBe('number');
    expect(r.value).toBeCloseTo(22.5, 5);
  });

  it('performance NUNCA agrega session_tournaments (SS6.1) — usa a fonte de historico injetada', async () => {
    const { aggregateCurrentValue } = await loadAgg();
    const getPerformanceByPeriod = vi.fn(async () => ({ roi: 5, abi: 9, itmPct: 12, totalTournaments: 30 }));
    const getSessionTournaments = vi.fn(async () => [{ id: 'st1', buyIn: '5.5' }]); // NAO deve ser tocado
    const deps: any = { getPerformanceByPeriod, getSessionTournaments };
    await aggregateCurrentValue('USER-1', 'abi', WINDOW, deps);
    expect(getSessionTournaments).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Financeira — FX -> USD antes de comparar (#6); FX ausente nao zera (#9)
// -----------------------------------------------------------------------------
describe('aggregateCurrentValue — financeira (bankroll_usd)', () => {
  it('carteira BRL convertida para USD antes de comparar (lesson #6)', async () => {
    const { aggregateCurrentValue } = await loadAgg();
    const deps: any = {
      getWallets: vi.fn(async () => [{ balance: '5000.00', currency: 'BRL' }]),
      // 5000 BRL / 5 = 1000 USD (rate 0.2 USD por BRL)
      fxToUsd: vi.fn(async (amount: number, currency: string) =>
        currency === 'BRL' ? amount * 0.2 : amount,
      ),
    };
    const r = await aggregateCurrentValue('USER-1', 'bankroll_usd', WINDOW, deps);
    expect(deps.fxToUsd).toHaveBeenCalled();
    expect(r.value).toBeCloseTo(1000, 5);
  });

  it('FX ausente (fxToUsd -> null) NAO zera: fallback nativo + nota/log (lesson #9)', async () => {
    const { aggregateCurrentValue } = await loadAgg();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const deps: any = {
      getWallets: vi.fn(async () => [{ balance: '3000.00', currency: 'BRL' }]),
      fxToUsd: vi.fn(async () => null), // FX indisponivel
    };
    const r = await aggregateCurrentValue('USER-1', 'bankroll_usd', WINDOW, deps);
    // NAO zera — usa o nativo como fallback (3000), nunca 0.
    expect(r.value).not.toBe(0);
    expect(r.value).toBeCloseTo(3000, 5);
    // logou antes do fallback (lesson #9) — aceita console.error OU console.warn.
    expect(errSpy.mock.calls.length + warnSpy.mock.calls.length).toBeGreaterThan(0);
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('balance numeric STRING parseado via parseFloat ("12.5" -> 12.5), nunca Number() cego', async () => {
    const { aggregateCurrentValue } = await loadAgg();
    const deps: any = {
      getWallets: vi.fn(async () => [{ balance: '12.5', currency: 'USD' }]),
      fxToUsd: vi.fn(async (amount: number) => amount), // USD passthrough
    };
    const r = await aggregateCurrentValue('USER-1', 'bankroll_usd', WINDOW, deps);
    expect(r.value).toBeCloseTo(12.5, 5);
  });
});

// -----------------------------------------------------------------------------
// dataSufficiency — amostra pequena marca 'low' (D9)
// -----------------------------------------------------------------------------
describe('aggregateCurrentValue — dataSufficiency', () => {
  it('retorna sempre o campo dataSufficiency in {ok, low}', async () => {
    const { aggregateCurrentValue } = await loadAgg();
    const deps: any = {
      getGrindSessions: vi.fn(async () => [{ id: 's1', status: 'completed', date: new Date('2026-06-02') }]),
    };
    const r = await aggregateCurrentValue('USER-1', 'sessions_per_week', WINDOW, deps);
    expect(['ok', 'low']).toContain(r.dataSufficiency);
  });
});
