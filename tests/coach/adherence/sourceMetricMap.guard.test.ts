import { describe, it, expect } from 'vitest';

// =============================================================================
// Motor de Aderência — Fase A (ADR-227) — RED phase
//
// Guard tests do mapa fonte-única (RF-02) + DIMENSION_KEY_BY_METRIC (RF-06) +
// vocabulário fechado AdherenceNote.
//
// Módulos alvo (AINDA NÃO EXISTEM):
//   server/coach/adherence/sourceMetricMap.ts -> SOURCE_METRIC_MAP, DIMENSION_KEY_BY_METRIC
//   server/coach/adherence/types.ts -> SourceMetric, DimensionKey, AdherenceNote, UnknownSourceMetricError
//
// Lesson #8 — NÃO validar length absoluta de enum; validar presença individual.
// Lesson #14/#26/#38 — await import.
// =============================================================================

async function loadMap() {
  return await import('../../../server/coach/adherence/sourceMetricMap');
}

// Métricas que DEVEM ter entrada no MAP (warmup_compliance OMITIDO — DEC-MA8 deferido).
const MAPPED_METRICS = [
  'grind_sessions_count',
  'grind_days',
  'planned_tournaments_count',
  'study_minutes',
  'study_sessions_count',
  'lessons_recommended_done',
  'themes_focus_studied',
] as const;

const VALID_DIMENSION_KEYS = ['grind', 'study', 'lessons', 'themes'];

describe('RF-02 SOURCE_METRIC_MAP — fonte única, sem entrada órfã', () => {
  it('exporta SOURCE_METRIC_MAP como objeto', async () => {
    const { SOURCE_METRIC_MAP } = await loadMap();
    expect(SOURCE_METRIC_MAP).toBeDefined();
    expect(typeof SOURCE_METRIC_MAP).toBe('object');
  });

  it('toda CHAVE do MAP resolve plannedSource + actualSource + dimensionKey + unit (sem órfã)', async () => {
    const { SOURCE_METRIC_MAP } = await loadMap();
    for (const key of Object.keys(SOURCE_METRIC_MAP)) {
      const spec = (SOURCE_METRIC_MAP as any)[key];
      expect(spec, `entrada ${key}`).toBeDefined();
      expect(typeof spec.plannedSource, `${key}.plannedSource`).toBe('string');
      expect(spec.plannedSource.length, `${key}.plannedSource não vazio`).toBeGreaterThan(0);
      expect(typeof spec.actualSource, `${key}.actualSource`).toBe('string');
      expect(spec.actualSource.length, `${key}.actualSource não vazio`).toBeGreaterThan(0);
      expect(VALID_DIMENSION_KEYS, `${key}.dimensionKey válido`).toContain(spec.dimensionKey);
      expect(typeof spec.unit, `${key}.unit`).toBe('string');
    }
  });

  it('cada métrica mapeada esperada está presente (presença individual, não length — lesson #8)', async () => {
    const { SOURCE_METRIC_MAP } = await loadMap();
    for (const m of MAPPED_METRICS) {
      expect(SOURCE_METRIC_MAP, `métrica ${m} deve estar no MAP`).toHaveProperty(m);
    }
  });

  it('warmup_compliance NÃO tem entrada no MAP (DEC-MA8 deferido — fica no union, fora do MAP)', async () => {
    const { SOURCE_METRIC_MAP } = await loadMap();
    expect((SOURCE_METRIC_MAP as any).warmup_compliance).toBeUndefined();
  });
});

describe('RF-06 DIMENSION_KEY_BY_METRIC — mapa EST-6 steps.<key> por métrica', () => {
  it('exporta DIMENSION_KEY_BY_METRIC com dimensão válida para cada métrica mapeada', async () => {
    const { DIMENSION_KEY_BY_METRIC } = await loadMap();
    expect(DIMENSION_KEY_BY_METRIC).toBeDefined();
    for (const m of MAPPED_METRICS) {
      expect(DIMENSION_KEY_BY_METRIC, `dimensão de ${m}`).toHaveProperty(m);
      expect(VALID_DIMENSION_KEYS).toContain((DIMENSION_KEY_BY_METRIC as any)[m]);
    }
  });

  it('mapeamento esperado: grind_* -> grind, study_* -> study, lessons_* -> lessons, themes_* -> themes (RF-06)', async () => {
    const { DIMENSION_KEY_BY_METRIC } = await loadMap();
    expect((DIMENSION_KEY_BY_METRIC as any).grind_sessions_count).toBe('grind');
    expect((DIMENSION_KEY_BY_METRIC as any).grind_days).toBe('grind');
    expect((DIMENSION_KEY_BY_METRIC as any).planned_tournaments_count).toBe('grind');
    expect((DIMENSION_KEY_BY_METRIC as any).study_minutes).toBe('study');
    expect((DIMENSION_KEY_BY_METRIC as any).study_sessions_count).toBe('study');
    expect((DIMENSION_KEY_BY_METRIC as any).lessons_recommended_done).toBe('lessons');
    expect((DIMENSION_KEY_BY_METRIC as any).themes_focus_studied).toBe('themes');
  });
});

describe('RF-01 UnknownSourceMetricError — erro nomeado', () => {
  it('types exporta UnknownSourceMetricError com code "unknown_source_metric"', async () => {
    const { UnknownSourceMetricError } = await import('../../../server/coach/adherence/types');
    const err = new UnknownSourceMetricError('foo');
    expect(err).toBeInstanceOf(Error);
    expect((err as any).code).toBe('unknown_source_metric');
    expect(err.name).toBe('UnknownSourceMetricError');
  });
});
