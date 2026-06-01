import { describe, it, expect } from 'vitest';

// =============================================================================
// METAS-1 fatia-1 (ADR-229) — sourceMetricMap.ts — RED phase
//
// Modulo alvo (AINDA NAO EXISTE):
//   server/coach/goals/sourceMetricMap.ts
//     GOALS_SOURCE_METRIC_MAP — allowlist controlavel (RF-04) + fonte (RF-05).
//     Guard "sem entrada orfa" (toda entrada do mapa resolve uma fonte) +
//     "nao-controlaveis recusadas" (profit_short_term/win_a_tournament/
//      beat_specific_player NAO estao na allowlist controlavel).
//
// Contrato congelado (drizzle-snippet.md):
//   CONTROLLABLE_SOURCE_METRICS = [
//     sessions_per_week, grind_days, study_minutes_week, study_sessions_count,
//     bankroll_usd, roi_pct, abi, itm_pct ]
//   NON_CONTROLLABLE_SOURCE_METRICS = [
//     profit_short_term, win_a_tournament, beat_specific_player ]
//
// Lessons aplicadas:
//   #8  — NAO validar length absoluta de enum; validar presenca individual.
//   #14/#26/#38 — await import.
//
// Suposicao documentada (ADR ambiguo): o helper exporta um MAP cujas chaves sao
//   as sourceMetric controlaveis; cada valor tem ao menos um campo de "fonte"
//   (testo presenca de UMA propriedade nao-vazia, sem cravar o nome — o ADR diz
//   "resolve fonte" mas nao fixa o shape exato do valor). Ramo mais provavel:
//   { source: string } ou { kind: string }. Testo "tem alguma string nao-vazia".
//
// .test.ts roda no projeto "server" (node).
// =============================================================================

async function loadMap() {
  return await import('../../../server/coach/goals/sourceMetricMap');
}

// Importadas do contrato congelado (shared/goals.ts), nao re-declaradas aqui.
async function loadShared() {
  return await import('@shared/goals');
}

const EXPECTED_CONTROLLABLE = [
  'sessions_per_week',
  'grind_days',
  'study_minutes_week',
  'study_sessions_count',
  'bankroll_usd',
  'roi_pct',
  'abi',
  'itm_pct',
] as const;

const EXPECTED_NON_CONTROLLABLE = [
  'profit_short_term',
  'win_a_tournament',
  'beat_specific_player',
] as const;

describe('shared/goals — allowlists congeladas (presenca individual, lesson #8)', () => {
  it('CONTROLLABLE_SOURCE_METRICS contem cada metrica controlavel esperada', async () => {
    const { CONTROLLABLE_SOURCE_METRICS } = await loadShared();
    for (const m of EXPECTED_CONTROLLABLE) {
      expect(CONTROLLABLE_SOURCE_METRICS as readonly string[], `controlavel ${m}`).toContain(m);
    }
  });

  it('NON_CONTROLLABLE_SOURCE_METRICS contem cada metrica recusada esperada', async () => {
    const { NON_CONTROLLABLE_SOURCE_METRICS } = await loadShared();
    for (const m of EXPECTED_NON_CONTROLLABLE) {
      expect(NON_CONTROLLABLE_SOURCE_METRICS as readonly string[], `recusada ${m}`).toContain(m);
    }
  });

  it('nenhuma metrica controlavel aparece na lista de recusadas (disjuntas)', async () => {
    const { CONTROLLABLE_SOURCE_METRICS, NON_CONTROLLABLE_SOURCE_METRICS } = await loadShared();
    const recusadas = new Set(NON_CONTROLLABLE_SOURCE_METRICS as readonly string[]);
    for (const m of CONTROLLABLE_SOURCE_METRICS as readonly string[]) {
      expect(recusadas.has(m), `${m} nao pode ser controlavel E recusada`).toBe(false);
    }
  });
});

describe('GOALS_SOURCE_METRIC_MAP — sem entrada orfa (RF-05)', () => {
  it('exporta GOALS_SOURCE_METRIC_MAP como objeto', async () => {
    const { GOALS_SOURCE_METRIC_MAP } = await loadMap();
    expect(GOALS_SOURCE_METRIC_MAP).toBeDefined();
    expect(typeof GOALS_SOURCE_METRIC_MAP).toBe('object');
  });

  it('toda CHAVE do MAP resolve uma fonte de dado (valor com pelo menos uma string nao-vazia)', async () => {
    const { GOALS_SOURCE_METRIC_MAP } = await loadMap();
    const keys = Object.keys(GOALS_SOURCE_METRIC_MAP as any);
    expect(keys.length, 'MAP nao pode estar vazio').toBeGreaterThan(0);
    for (const key of keys) {
      const spec = (GOALS_SOURCE_METRIC_MAP as any)[key];
      expect(spec, `entrada ${key} definida`).toBeDefined();
      const hasNonEmptyString = Object.values(spec).some(
        (v) => typeof v === 'string' && (v as string).length > 0,
      );
      expect(hasNonEmptyString, `entrada ${key} resolve alguma fonte (string nao-vazia)`).toBe(true);
    }
  });

  it('cada sourceMetric CONTROLAVEL esperada tem entrada no MAP (RF-04a/RF-05)', async () => {
    const { GOALS_SOURCE_METRIC_MAP } = await loadMap();
    for (const m of EXPECTED_CONTROLLABLE) {
      expect(GOALS_SOURCE_METRIC_MAP as any, `MAP deve mapear ${m}`).toHaveProperty(m);
    }
  });
});

describe('GOALS_SOURCE_METRIC_MAP — nao-controlaveis recusadas (RF-04b)', () => {
  it('profit_short_term NAO esta no MAP (sem fonte controlavel -> lead_not_controllable)', async () => {
    const { GOALS_SOURCE_METRIC_MAP } = await loadMap();
    expect((GOALS_SOURCE_METRIC_MAP as any).profit_short_term).toBeUndefined();
  });

  it('win_a_tournament NAO esta no MAP', async () => {
    const { GOALS_SOURCE_METRIC_MAP } = await loadMap();
    expect((GOALS_SOURCE_METRIC_MAP as any).win_a_tournament).toBeUndefined();
  });

  it('beat_specific_player NAO esta no MAP', async () => {
    const { GOALS_SOURCE_METRIC_MAP } = await loadMap();
    expect((GOALS_SOURCE_METRIC_MAP as any).beat_specific_player).toBeUndefined();
  });
});
