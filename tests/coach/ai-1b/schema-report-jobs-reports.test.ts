import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint AI-1B / RF-01 + RF-02 + RF-04 + RF-10 + RF-11 — schema (migracao 0067)
//   shared/schema.ts deve exportar:
//     - reportJobs (pgTable), ReportJob/InsertReportJob, insertReportJobSchema
//     - reports (pgTable), Report/InsertReport, insertReportSchema, ReportContent (interface TS)
//     - updateCoachPreferencesSchema estendido (+ reportWeeklyEnabled/nudgeBGapcheck/nudgeBImport;
//       unfreezeCategory enum +B-GAPCHECK/+B-IMPORT)
//   server/coach/nudgeEngine.ts: NudgeCategory + CATEGORY_TOGGLE_MAP ganham B-GAPCHECK/B-IMPORT
//
// Fontes:
//   - Docs/specs/sprint-ai-1b.md (RF-01/02/04/10/11)
//   - Docs/architecture/decisions/155-...-runner-tz-aware.md (§3.1)
//   - Docs/architecture/decisions/157-...-bgapcheck-bimport.md (§3.4)
//   - Docs/architecture/data-model-index.md "Schema Delta — Sprint AI-1B"
//
// Lessons: #7 (schema gradual — colunas opcionais .optional()+.default()), #8
//   (validar presenca individual de enum — NUNCA length absoluta).
//
// Status esperado: TODOS FALHAM (exports nao existem; enum nao tem as categorias).
//
// Nota: NAO aplicamos a migracao — o implementer faz. Estes testes validam o
// shape do schema TS (drizzle/zod), nao o banco.
// =============================================================================

// ---------------------------------------------------------------------------
// reportJobs / ReportJob / insertReportJobSchema
// ---------------------------------------------------------------------------
describe('schema — reportJobs (pgTable + zod)', () => {
  it('exporta reportJobs (pgTable)', async () => {
    const schema: any = await import('../../../shared/schema');
    expect(schema.reportJobs).toBeTruthy();
  });

  it('exporta insertReportJobSchema (zod) — aceita uma row minima valida; status default pending', async () => {
    const schema: any = await import('../../../shared/schema');
    expect(schema.insertReportJobSchema).toBeTruthy();
    const parsed = schema.insertReportJobSchema.parse({
      id: 'job-1',
      userId: 'USER-0001',
      reportType: 'weekly',
      periodStart: '2026-05-04',
      periodEnd: '2026-05-10',
      scheduledFor: new Date('2026-05-11T10:00:00Z'),
    });
    expect(parsed).toBeTruthy();
    // status / attempts / max_attempts tem defaults (lesson #7).
    expect(parsed.status ?? 'pending').toBe('pending');
  });

  it('reportType aceita "weekly" (validacao rigida do conjunto reservado eh no service, nao na coluna)', async () => {
    const schema: any = await import('../../../shared/schema');
    expect(() => schema.insertReportJobSchema.parse({
      id: 'job-2', userId: 'USER-0001', reportType: 'weekly',
      periodStart: '2026-05-04', periodEnd: '2026-05-10', scheduledFor: new Date(),
    })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// reports / Report / insertReportSchema / ReportContent
// ---------------------------------------------------------------------------
describe('schema — reports (pgTable + zod) + ReportContent', () => {
  it('exporta reports (pgTable)', async () => {
    const schema: any = await import('../../../shared/schema');
    expect(schema.reports).toBeTruthy();
  });

  it('exporta insertReportSchema (zod) — aceita uma row minima; status default ready; content default {}', async () => {
    const schema: any = await import('../../../shared/schema');
    expect(schema.insertReportSchema).toBeTruthy();
    const parsed = schema.insertReportSchema.parse({
      id: 'report-1',
      userId: 'USER-0001',
      reportType: 'weekly',
      periodStart: '2026-05-04',
      periodEnd: '2026-05-10',
    });
    expect(parsed).toBeTruthy();
    expect(parsed.status ?? 'ready').toBe('ready');
  });

  it('aceita uma row fail-soft — status degraded, model_used null, cost_usd_estimate 0, degraded_reason preenchido', async () => {
    const schema: any = await import('../../../shared/schema');
    expect(() => schema.insertReportSchema.parse({
      id: 'report-2', userId: 'USER-0001', reportType: 'weekly',
      periodStart: '2026-05-04', periodEnd: '2026-05-10',
      status: 'degraded', modelUsed: null, costUsdEstimate: 0, degradedReason: 'llm_failed_3x',
      content: { schemaVersion: 1 },
    })).not.toThrow();
  });

  it('ReportContent — type/interface existe e um objeto bem formado satisfaz o shape esperado', async () => {
    const schema: any = await import('../../../shared/schema');
    // ReportContent eh interface TS (nao runtime) — verificamos via um valueguard:
    // se houver um schema zod auxiliar, usamos; senao apenas garantimos que um
    // objeto com o shape documentado eh aceito pelo content do insertReportSchema.
    const sample = {
      schemaVersion: 1,
      reportType: 'weekly',
      periodStart: '2026-05-04',
      periodEnd: '2026-05-10',
      dataSufficiency: 'ok',
      level: 'intermediario',
      tone: 'gentle',
      header: { title: 'Sua semana', summaryLine: 'Voce jogou 42 torneios.', comparison: 'acima da media' },
      sections: {
        volumeResults: { sessionsCompleted: 5, sessionsPlanned: 6, tournaments: 42, itmPct: 19, finalTables: 2, wins: 1, roiWeek: 12, roi30d: 10 },
        bankroll: { profitByCurrency: [{ currency: 'USD', native: 1234, usd: 1234 }], bankrollStart: 2800, bankrollNow: 3000, transfers: 0, withdrawals: 100 },
        selection: { ranThisWeek: true, adherencePct: 80, topCategories: [{ label: 'Regular', roi: 0.2, n: 80 }], bottomCategories: [{ label: 'Hyper', roi: -0.08, n: 120, suggestBlock: true }] },
        study: { minutesLogged: 90, topicsCovered: ['ICM'], focusOfMonth: 'ICM', focusCoveragePct: 50, recommendedLesson: { lessonId: 'l1', title: 'ICM', reason: 'leak', ctaHref: '/biblioteca/curso/x/y/play' } },
        mentalOps: { hasWarmupData: true, warmupSessions: 3, tiltSessions: 1, avgFocusRating: 4 },
      },
      insights: [
        { text: 'a', citations: ['fonte: x'], confidence: 'high' },
        { text: 'b', citations: ['fonte: y'] },
        { text: 'c', citations: ['fonte: z'], confidence: 'low' },
      ],
      nextWeekPlan: { gradeSuggestionHref: '/grade-planner', studyFocus: 'ICM', recommendedAction: 'Bloquear hypers.', weeklyStudyPlanRef: { weekStartDate: '2026-05-04' } },
      cta: [
        { label: 'Registrar torneio na grade', kind: 'tool', toolName: 'register_tournament_in_grade' },
        { label: 'Importar histórico', kind: 'link', href: '/upload' },
      ],
      generation: { model: 'claude-sonnet-4-6', summarizerModel: null, degraded: false, degradedReason: null },
    };
    // o content do insertReportSchema deve aceitar esse objeto.
    expect(() => schema.insertReportSchema.parse({
      id: 'report-3', userId: 'USER-0001', reportType: 'weekly',
      periodStart: '2026-05-04', periodEnd: '2026-05-10', content: sample,
    })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// updateCoachPreferencesSchema estendido
// ---------------------------------------------------------------------------
describe('schema — updateCoachPreferencesSchema estendido AI-1B', () => {
  it('aceita { reportWeeklyEnabled: true }', async () => {
    const schema: any = await import('../../../shared/schema');
    expect(() => schema.updateCoachPreferencesSchema.parse({ reportWeeklyEnabled: true })).not.toThrow();
  });

  it('aceita { nudgeBGapcheck: false, nudgeBImport: false }', async () => {
    const schema: any = await import('../../../shared/schema');
    expect(() => schema.updateCoachPreferencesSchema.parse({ nudgeBGapcheck: false, nudgeBImport: false })).not.toThrow();
  });

  it('unfreezeCategory aceita "B-GAPCHECK"', async () => {
    const schema: any = await import('../../../shared/schema');
    expect(() => schema.updateCoachPreferencesSchema.parse({ unfreezeCategory: 'B-GAPCHECK' })).not.toThrow();
  });

  it('unfreezeCategory aceita "B-IMPORT"', async () => {
    const schema: any = await import('../../../shared/schema');
    expect(() => schema.updateCoachPreferencesSchema.parse({ unfreezeCategory: 'B-IMPORT' })).not.toThrow();
  });

  it('ainda rejeita campo cru frozenCategories (.strict() mantido)', async () => {
    const schema: any = await import('../../../shared/schema');
    expect(() => schema.updateCoachPreferencesSchema.parse({ frozenCategories: { 'B-GAPCHECK': {} } })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// nudgeEngine — NudgeCategory + CATEGORY_TOGGLE_MAP
// ---------------------------------------------------------------------------
describe('nudgeEngine — categorias B-GAPCHECK / B-IMPORT', () => {
  it('categoryToToggle("B-GAPCHECK") -> "nudgeBGapcheck"', async () => {
    const engine: any = await import('../../../server/coach/nudgeEngine');
    expect(engine.categoryToToggle('B-GAPCHECK')).toBe('nudgeBGapcheck');
  });

  it('categoryToToggle("B-IMPORT") -> "nudgeBImport"', async () => {
    const engine: any = await import('../../../server/coach/nudgeEngine');
    expect(engine.categoryToToggle('B-IMPORT')).toBe('nudgeBImport');
  });

  it('categorias antigas continuam mapeadas (regressao — lesson #8: validar presenca individual)', async () => {
    const engine: any = await import('../../../server/coach/nudgeEngine');
    expect(engine.categoryToToggle('B-SNAPSHOT')).toBe('nudgeBSnapshot');
    expect(engine.categoryToToggle('B-STUDY')).toBe('nudgeBStudy');
  });
});
