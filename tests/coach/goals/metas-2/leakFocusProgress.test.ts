import { describe, it, expect } from 'vitest';

// =============================================================================
// METAS-2 fatia-2 (ADR-234 / DEC-4) — leakFocusProgress: helper PURO de
// progresso de leak_focus (medicao HONESTA). RED phase — modulo NAO EXISTE.
//
// Modulo alvo:
//   server/coach/goals/leakFocusProgress.ts
//     export function evaluateLeakFocusProgress(input: LeakFocusInputs): LeakFocusProgress
//
// Contrato (ADR-234 D-3):
//   LeakFocusInputs { targetStatId, target, leaks: StatLeak[]|null, leaksErrored?,
//                     leakFocusStatus?, statAnalysisCountInWindow }
//   LeakFocusProgress { status: GoalStatus, compliancePct: number|null,
//                       dataSufficiency: 'ok'|'low', note }
//   * NOTA: a tarefa descreve `leakFocusStatus: string|null` e
//     `statAnalysisCountInWindow`+`target`. O ADR D-3 usa `leakFocusStatus?: string`
//     (undefined = nenhum) + `targetValue`. Como o modulo nao existe, os testes
//     usam os nomes do ADR D-3 (interface canonica) e tratam null≈undefined no
//     campo de status. INCONSISTENCIA documentada (lesson #25) — ver resumo.
//
// Regras (DEC-4 travada):
//   1. leakFocusStatus === 'resolved'              -> achieved, 100, ok, 'resolved'
//   2. leaksErrored                                 -> (neutro), null, low, 'source_error'  + log
//   3. leaks == null || leaks.length === 0          -> (neutro), null, low, 'source_stub'   + log
//   4. statId NAO esta em leaks (saiu do radar)     -> esforco>0 ? 'ahead' : 'on_track'; pct via esforco; ok; 'left_radar'
//   5. statId AINDA em leaks:
//        statAnalysisCountInWindow > 0              -> 'behind' (atacando); pct via esforco; ok; 'attacking'
//        senao                                       -> 'at_risk' (sem ataque); pct=null; ok; 'no_attack'
//   compliancePct = min(100, round(count/target*100)) quando target>0; null se degradado/target<=0/5b.
//   NUNCA usa severity/delta (value/delta sempre null no StatLeak). PURO: sem DB/new Date.
//
// SHAPES REAIS (lesson #3):
//   StatLeak: server/coach/leaks/types.ts:10 — { statId, statName, value:null,
//     benchmark:number|null, delta:null, severity:number>0, id?, type?, description? }.
//   match do statId contra StatLeak.statId / baselineStatKey / leak:<code>.
//   GoalStatus: shared/goals.ts:92 — 'ahead'|'on_track'|'behind'|'at_risk'|'achieved'.
// =============================================================================

async function loadHelper() {
  return await import('../../../../server/coach/goals/leakFocusProgress');
}

// StatLeak no shape REAL (value/delta SEMPRE null). leaks/types.ts:10.
function statLeak(over: Partial<any> = {}) {
  return {
    statId: over.statId ?? 'vpip',
    statName: over.statName ?? 'VPIP',
    value: null,
    benchmark: over.benchmark ?? 22.5,
    delta: null,
    severity: over.severity ?? 10,
    id: over.id ?? over.statId ?? 'vpip',
    type: 'stat_leak',
    description: over.description ?? 'VPIP muito alto',
  };
}

const GOAL_STATUSES = ['ahead', 'on_track', 'behind', 'at_risk', 'achieved'];

// =============================================================================
// Regra 1 — resolucao (coach_leak_focus.status='resolved')
// =============================================================================
describe('evaluateLeakFocusProgress — resolved (regra 1)', () => {
  it('leakFocusStatus="resolved" -> achieved, compliancePct=100, dataSufficiency=ok', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 5,
      leaks: [statLeak({ statId: 'vpip' })], // ainda no radar, mas resolved vence
      leakFocusStatus: 'resolved',
      statAnalysisCountInWindow: 2,
    });
    expect(out.status).toBe('achieved');
    expect(out.compliancePct).toBe(100);
    expect(out.dataSufficiency).toBe('ok');
    expect(out.note).toBe('resolved');
  });

  it('resolved vence mesmo com leaks vazio', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 5,
      leaks: [],
      leakFocusStatus: 'resolved',
      statAnalysisCountInWindow: 0,
    });
    expect(out.status).toBe('achieved');
    expect(out.compliancePct).toBe(100);
  });
});

// =============================================================================
// Regra 2 — getStatsLeaks lancou (source_error) — degrade + log no caller
// =============================================================================
describe('evaluateLeakFocusProgress — leaksErrored (regra 2)', () => {
  it('leaksErrored=true -> compliancePct=null, dataSufficiency=low, note=source_error', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 5,
      leaks: null,
      leaksErrored: true,
      statAnalysisCountInWindow: 3,
    });
    expect(out.compliancePct).toBeNull();
    expect(out.dataSufficiency).toBe('low');
    expect(out.note).toBe('source_error');
  });

  it('source_error NUNCA fabrica severity/delta — status e enum valido (lesson #11)', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 5,
      leaks: null,
      leaksErrored: true,
      statAnalysisCountInWindow: 3,
    });
    expect(GOAL_STATUSES).toContain(out.status);
  });
});

// =============================================================================
// Regra 3 — getStatsLeaks vazio/null (source_stub) — degrade + log no caller
// =============================================================================
describe('evaluateLeakFocusProgress — leaks vazio/null (regra 3)', () => {
  it('leaks=[] -> compliancePct=null, dataSufficiency=low, note=source_stub', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 5,
      leaks: [],
      statAnalysisCountInWindow: 0,
    });
    expect(out.compliancePct).toBeNull();
    expect(out.dataSufficiency).toBe('low');
    expect(out.note).toBe('source_stub');
  });

  it('leaks=null -> note=source_stub, dataSufficiency=low', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 5,
      leaks: null,
      statAnalysisCountInWindow: 0,
    });
    expect(out.note).toBe('source_stub');
    expect(out.dataSufficiency).toBe('low');
  });
});

// =============================================================================
// Regra 4 — statId saiu do radar (nao esta mais em leaks)
// =============================================================================
describe('evaluateLeakFocusProgress — saiu do radar (regra 4)', () => {
  it('statId fora do top-N + esforco>0 -> ahead, dataSufficiency=ok, note=left_radar', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 5,
      leaks: [statLeak({ statId: 'pfr' }), statLeak({ statId: 'threebet_pf' })], // vpip ausente
      statAnalysisCountInWindow: 3,
    });
    expect(out.status).toBe('ahead');
    expect(out.dataSufficiency).toBe('ok');
    expect(out.note).toBe('left_radar');
  });

  it('statId fora do top-N + esforco=0 -> on_track (saiu do radar sem ataque registrado)', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 5,
      leaks: [statLeak({ statId: 'pfr' })],
      statAnalysisCountInWindow: 0,
    });
    expect(out.status).toBe('on_track');
    expect(out.note).toBe('left_radar');
  });
});

// =============================================================================
// Regra 5 — statId ainda no radar
// =============================================================================
describe('evaluateLeakFocusProgress — ainda no radar (regra 5)', () => {
  it('no radar + stat_analysis na janela -> behind (atacando), note=attacking', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 5,
      leaks: [statLeak({ statId: 'vpip' })],
      statAnalysisCountInWindow: 2,
    });
    expect(out.status).toBe('behind');
    expect(out.dataSufficiency).toBe('ok');
    expect(out.note).toBe('attacking');
  });

  it('no radar + sem ataque -> at_risk, compliancePct=null, note=no_attack', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 5,
      leaks: [statLeak({ statId: 'vpip' })],
      statAnalysisCountInWindow: 0,
    });
    expect(out.status).toBe('at_risk');
    expect(out.compliancePct).toBeNull();
    expect(out.note).toBe('no_attack');
  });
});

// =============================================================================
// compliancePct via esforco — min(100, round(count/target*100))
// =============================================================================
describe('evaluateLeakFocusProgress — compliancePct via esforco', () => {
  it('count=2, target=5 -> 40 (atacando, behind)', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 5,
      leaks: [statLeak({ statId: 'vpip' })],
      statAnalysisCountInWindow: 2,
    });
    expect(out.compliancePct).toBe(40);
  });

  it('count=3, target=4 -> 75 (saiu do radar, ahead)', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 4,
      leaks: [statLeak({ statId: 'pfr' })],
      statAnalysisCountInWindow: 3,
    });
    expect(out.compliancePct).toBe(75);
  });

  it('overachieved (count=10, target=5) -> clamp 100', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 5,
      leaks: [statLeak({ statId: 'vpip' })],
      statAnalysisCountInWindow: 10,
    });
    expect(out.compliancePct).toBe(100);
  });

  it('target<=0 -> compliancePct=null (nunca divide por zero / fabrica)', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 0,
      leaks: [statLeak({ statId: 'vpip' })],
      statAnalysisCountInWindow: 2,
    });
    expect(out.compliancePct).toBeNull();
  });

  it('arredonda (count=1, target=3 -> 33)', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 3,
      leaks: [statLeak({ statId: 'vpip' })],
      statAnalysisCountInWindow: 1,
    });
    expect(out.compliancePct).toBe(33);
  });
});

// =============================================================================
// Match do statId — StatLeak.statId / baselineStatKey / leak:<code>
// =============================================================================
describe('evaluateLeakFocusProgress — match do statId no leak', () => {
  it('casa por StatLeak.statId direto (no radar)', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'pfr',
      target: 5,
      leaks: [statLeak({ statId: 'pfr' })],
      statAnalysisCountInWindow: 1,
    });
    // pfr esta no radar -> regra 5 (atacando)
    expect(out.status).toBe('behind');
    expect(out.note).toBe('attacking');
  });

  it('casa por leak:<code> quando o StatLeak e orfao (statId="leak:vpip")', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const out = evaluateLeakFocusProgress({
      targetStatId: 'vpip',
      target: 5,
      // leak orfao: statId = "leak:vpip" (baselineStatKey cru, ADR-231)
      leaks: [statLeak({ statId: 'leak:vpip', statName: 'Stat personalizada' })],
      statAnalysisCountInWindow: 0,
    });
    // deve casar vpip <-> leak:vpip -> AINDA no radar -> at_risk (sem ataque)
    expect(out.status).toBe('at_risk');
    expect(out.note).toBe('no_attack');
  });
});

// =============================================================================
// Pureza — NUNCA usa value/delta (sempre null); status sempre enum valido
// =============================================================================
describe('evaluateLeakFocusProgress — pureza e contrato', () => {
  it('todos os ramos retornam status no enum GoalStatus (nunca inventa)', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const scenarios = [
      { targetStatId: 'vpip', target: 5, leaks: [statLeak({ statId: 'vpip' })], leakFocusStatus: 'resolved', statAnalysisCountInWindow: 0 },
      { targetStatId: 'vpip', target: 5, leaks: null, leaksErrored: true, statAnalysisCountInWindow: 0 },
      { targetStatId: 'vpip', target: 5, leaks: [], statAnalysisCountInWindow: 0 },
      { targetStatId: 'vpip', target: 5, leaks: [statLeak({ statId: 'pfr' })], statAnalysisCountInWindow: 2 },
      { targetStatId: 'vpip', target: 5, leaks: [statLeak({ statId: 'vpip' })], statAnalysisCountInWindow: 0 },
    ];
    for (const s of scenarios) {
      const out = evaluateLeakFocusProgress(s as any);
      expect(GOAL_STATUSES, `status para ${out.note}`).toContain(out.status);
    }
  });

  it('chamadas identicas -> resultado identico (sem estado interno)', async () => {
    const { evaluateLeakFocusProgress } = await loadHelper();
    const input = {
      targetStatId: 'vpip',
      target: 5,
      leaks: [statLeak({ statId: 'vpip' })],
      statAnalysisCountInWindow: 2,
    };
    const a = evaluateLeakFocusProgress(input as any);
    const b = evaluateLeakFocusProgress(input as any);
    expect(a).toEqual(b);
  });
});
