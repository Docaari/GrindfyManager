import { describe, it, expect } from 'vitest';

// =============================================================================
// METAS-2 fatia-2 (ADR-234) — adherenceBridge: ponte de vocabulario + parser
// leak_focus. RED phase — modulo alvo AINDA NAO EXISTE.
//
// Modulo alvo:
//   server/coach/goals/adherenceBridge.ts
//     export const GOAL_METRIC_TO_ADHERENCE: Record<string, SourceMetric>
//     export function resolvesViaAdherence(sourceMetric: string): boolean
//     export function bridgedSourceMetric(sourceMetric: string): SourceMetric | null
//     export const LEAK_FOCUS_PREFIX = "leak_focus_progress"
//     export function isLeakFocusMetric(sourceMetric: string): boolean
//     export function parseLeakFocusStatId(sourceMetric: string): string | null
//
// Helper PURO: literais, zero mock, zero DB, zero new Date(). .test.ts -> node.
//
// Lessons aplicadas:
//   #8  — validar PRESENCA INDIVIDUAL de cada chave (NAO length absoluta).
//   #10 — fonte unica da decisao motor-vs-direto (este mapa).
//   #14/#26/#38 — await import (modulo carregado dinamicamente, RED-safe).
//
// SHAPES REAIS (lesson #3):
//   SourceMetric (motor): server/coach/adherence/types.ts:9-17 — union de 8 strings.
//   SOURCE_METRIC_MAP (motor): server/coach/adherence/sourceMetricMap.ts:25 —
//     7 chaves (warmup_compliance OMITIDA de proposito). Guard "sem orfao" valida
//     que cada valor da ponte e CHAVE deste MAP.
//   isValidStatId: server/coach/statId.ts:18 — catalog id OU custom_* shape.
//     Catalog ids reais: 'vpip','pfr','threebet_pf' (shared/hud-stat-catalog.ts:116+).
// =============================================================================

async function loadBridge() {
  return await import('../../../../server/coach/goals/adherenceBridge');
}

async function loadMotorMap() {
  return await import('../../../../server/coach/adherence/sourceMetricMap');
}

// -----------------------------------------------------------------------------
// RF-01 / DEC-1 — a ponte cobre EXATAMENTE as 4 metas de volume/estudo.
// -----------------------------------------------------------------------------
describe('GOAL_METRIC_TO_ADHERENCE — presenca individual (lesson #8)', () => {
  it('mapeia sessions_per_week -> grind_sessions_count', async () => {
    const { GOAL_METRIC_TO_ADHERENCE } = await loadBridge();
    expect(GOAL_METRIC_TO_ADHERENCE.sessions_per_week).toBe('grind_sessions_count');
  });

  it('mapeia grind_days -> grind_days', async () => {
    const { GOAL_METRIC_TO_ADHERENCE } = await loadBridge();
    expect(GOAL_METRIC_TO_ADHERENCE.grind_days).toBe('grind_days');
  });

  it('mapeia study_minutes_week -> study_minutes', async () => {
    const { GOAL_METRIC_TO_ADHERENCE } = await loadBridge();
    expect(GOAL_METRIC_TO_ADHERENCE.study_minutes_week).toBe('study_minutes');
  });

  it('mapeia study_sessions_count -> study_sessions_count', async () => {
    const { GOAL_METRIC_TO_ADHERENCE } = await loadBridge();
    expect(GOAL_METRIC_TO_ADHERENCE.study_sessions_count).toBe('study_sessions_count');
  });

  it('NAO mapeia metricas de performance (roi_pct/abi/itm_pct) — caem em agregacao direta', async () => {
    const { GOAL_METRIC_TO_ADHERENCE } = await loadBridge();
    expect('roi_pct' in GOAL_METRIC_TO_ADHERENCE).toBe(false);
    expect('abi' in GOAL_METRIC_TO_ADHERENCE).toBe(false);
    expect('itm_pct' in GOAL_METRIC_TO_ADHERENCE).toBe(false);
  });

  it('NAO mapeia metrica financeira (bankroll_usd) — cai em agregacao direta', async () => {
    const { GOAL_METRIC_TO_ADHERENCE } = await loadBridge();
    expect('bankroll_usd' in GOAL_METRIC_TO_ADHERENCE).toBe(false);
  });

  it('NAO inclui a raiz leak_focus_progress (tem resolucao dedicada, nao ponte simples)', async () => {
    const { GOAL_METRIC_TO_ADHERENCE } = await loadBridge();
    expect('leak_focus_progress' in GOAL_METRIC_TO_ADHERENCE).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// RF-01 — resolvesViaAdherence / bridgedSourceMetric
// -----------------------------------------------------------------------------
describe('resolvesViaAdherence', () => {
  it('true para as 4 metas de volume/estudo', async () => {
    const { resolvesViaAdherence } = await loadBridge();
    expect(resolvesViaAdherence('sessions_per_week')).toBe(true);
    expect(resolvesViaAdherence('grind_days')).toBe(true);
    expect(resolvesViaAdherence('study_minutes_week')).toBe(true);
    expect(resolvesViaAdherence('study_sessions_count')).toBe(true);
  });

  it('false para performance/financeira (agregacao direta)', async () => {
    const { resolvesViaAdherence } = await loadBridge();
    expect(resolvesViaAdherence('roi_pct')).toBe(false);
    expect(resolvesViaAdherence('abi')).toBe(false);
    expect(resolvesViaAdherence('itm_pct')).toBe(false);
    expect(resolvesViaAdherence('bankroll_usd')).toBe(false);
  });

  it('false para sourceMetric desconhecido', async () => {
    const { resolvesViaAdherence } = await loadBridge();
    expect(resolvesViaAdherence('metrica_inexistente_xyz')).toBe(false);
  });

  it('false para leak_focus_progress (com ou sem statId) — nao e ponte simples', async () => {
    const { resolvesViaAdherence } = await loadBridge();
    expect(resolvesViaAdherence('leak_focus_progress')).toBe(false);
    expect(resolvesViaAdherence('leak_focus_progress:vpip')).toBe(false);
  });
});

describe('bridgedSourceMetric', () => {
  it('retorna o SourceMetric do motor para meta mapeada', async () => {
    const { bridgedSourceMetric } = await loadBridge();
    expect(bridgedSourceMetric('sessions_per_week')).toBe('grind_sessions_count');
    expect(bridgedSourceMetric('study_minutes_week')).toBe('study_minutes');
  });

  it('retorna null para meta NAO mapeada (agregacao direta)', async () => {
    const { bridgedSourceMetric } = await loadBridge();
    expect(bridgedSourceMetric('roi_pct')).toBeNull();
    expect(bridgedSourceMetric('bankroll_usd')).toBeNull();
    expect(bridgedSourceMetric('metrica_inexistente_xyz')).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// RF-01 — guard: cada valor da ponte e CHAVE do SOURCE_METRIC_MAP do motor.
// (sem entrada orfa — lesson #8 presenca individual, nao length).
// -----------------------------------------------------------------------------
describe('guard — ponte sem orfao (cada valor in SOURCE_METRIC_MAP do motor)', () => {
  it('todo valor de GOAL_METRIC_TO_ADHERENCE e chave de SOURCE_METRIC_MAP', async () => {
    const { GOAL_METRIC_TO_ADHERENCE } = await loadBridge();
    const { SOURCE_METRIC_MAP } = await loadMotorMap();
    for (const [goalMetric, motorMetric] of Object.entries(GOAL_METRIC_TO_ADHERENCE)) {
      expect(
        Object.prototype.hasOwnProperty.call(SOURCE_METRIC_MAP, motorMetric),
        `valor "${motorMetric}" (de "${goalMetric}") deve existir em SOURCE_METRIC_MAP do motor`,
      ).toBe(true);
    }
  });

  it('NAO mapeia para warmup_compliance (omitido do MAP do motor — DEC-MA8 deferido)', async () => {
    const { GOAL_METRIC_TO_ADHERENCE } = await loadBridge();
    const values = Object.values(GOAL_METRIC_TO_ADHERENCE);
    expect(values).not.toContain('warmup_compliance');
  });
});

// -----------------------------------------------------------------------------
// RF-02 / D-4 — parser leak_focus (convencao de sufixo, sem coluna nova).
// -----------------------------------------------------------------------------
describe('LEAK_FOCUS_PREFIX', () => {
  it('e exatamente "leak_focus_progress"', async () => {
    const { LEAK_FOCUS_PREFIX } = await loadBridge();
    expect(LEAK_FOCUS_PREFIX).toBe('leak_focus_progress');
  });
});

describe('isLeakFocusMetric', () => {
  it('true para a raiz leak_focus_progress', async () => {
    const { isLeakFocusMetric } = await loadBridge();
    expect(isLeakFocusMetric('leak_focus_progress')).toBe(true);
  });

  it('true para leak_focus_progress:<statId>', async () => {
    const { isLeakFocusMetric } = await loadBridge();
    expect(isLeakFocusMetric('leak_focus_progress:vpip')).toBe(true);
    expect(isLeakFocusMetric('leak_focus_progress:custom_meuleak')).toBe(true);
  });

  it('false para sourceMetrics da fatia-1 (nenhum comeca com leak_focus_progress)', async () => {
    const { isLeakFocusMetric } = await loadBridge();
    expect(isLeakFocusMetric('sessions_per_week')).toBe(false);
    expect(isLeakFocusMetric('roi_pct')).toBe(false);
    expect(isLeakFocusMetric('bankroll_usd')).toBe(false);
  });

  it('false para string vazia', async () => {
    const { isLeakFocusMetric } = await loadBridge();
    expect(isLeakFocusMetric('')).toBe(false);
  });
});

describe('parseLeakFocusStatId', () => {
  it('extrai catalog statId valido (vpip)', async () => {
    const { parseLeakFocusStatId } = await loadBridge();
    expect(parseLeakFocusStatId('leak_focus_progress:vpip')).toBe('vpip');
  });

  it('extrai outro catalog statId valido (threebet_pf)', async () => {
    const { parseLeakFocusStatId } = await loadBridge();
    expect(parseLeakFocusStatId('leak_focus_progress:threebet_pf')).toBe('threebet_pf');
  });

  it('extrai custom_* valido', async () => {
    const { parseLeakFocusStatId } = await loadBridge();
    expect(parseLeakFocusStatId('leak_focus_progress:custom_meuleak')).toBe('custom_meuleak');
  });

  it('statId INVALIDO (nao catalog, nao custom_) -> null (validado via isValidStatId)', async () => {
    const { parseLeakFocusStatId } = await loadBridge();
    expect(parseLeakFocusStatId('leak_focus_progress:nao_existe_xyz')).toBeNull();
  });

  it('sem statId (so a raiz) -> null', async () => {
    const { parseLeakFocusStatId } = await loadBridge();
    expect(parseLeakFocusStatId('leak_focus_progress')).toBeNull();
  });

  it('sufixo vazio (leak_focus_progress:) -> null', async () => {
    const { parseLeakFocusStatId } = await loadBridge();
    expect(parseLeakFocusStatId('leak_focus_progress:')).toBeNull();
  });

  it('sourceMetric que nao e leak_focus -> null', async () => {
    const { parseLeakFocusStatId } = await loadBridge();
    expect(parseLeakFocusStatId('sessions_per_week')).toBeNull();
  });
});
