import { describe, it, expect } from 'vitest';

// =============================================================================
// Fase C #3 — getStatsLeaks: detecção real de leak (ADR-231) — RED phase
//
// Helper PURO (AINDA NÃO EXISTE):
//   server/coach/leaks/detectLeaks.ts
//     synthesizeLeaks(inputs, top): StatLeak[]
//   server/coach/leaks/types.ts        (StatLeak + interfaces de input)
//   server/coach/leaks/constants.ts    (pesos + janela exportados p/ assert sem mágica)
//
// Fontes:
//   - Docs/specs/sprint-fase-c-stats-leaks-2026-06-01.md (RF-01..RF-07)
//   - Docs/architecture/decisions/231-fase-c-stats-leaks-behavioral-synthesis.md (D-A1..D-A8)
//   - Docs/architecture/diagrams/fase-c-stats-leaks/synthesis-sequence.mermaid
//
// Lessons aplicadas:
//   #3   — fixtures usam SHAPE plano dos inputs do helper (interfaces próprias do
//          helper, NÃO drizzle). statIds reais do catálogo (vpip/pfr/threebet_pf/
//          wwsf_pct) com targetMin/targetMax VERIFICADOS em shared/hud-stat-catalog.ts.
//   #14/#26/#38 — `await import` (não require) para carregar o módulo.
//   #25  — qualquer inconsistência lógica documentada no resumo, NÃO "corrigida".
//
// Helper PURO: zero mock de DB, zero `new Date()` no helper (recebe currentMonth
// pronto). `.test.ts` roda no projeto "server" (node) — sem RTL.
//
// statIds REAIS do catálogo (verificados):
//   vpip        targetMin 20 targetMax 25  -> midpoint 22.5
//   pfr         targetMin 16 targetMax 20  -> midpoint 18
//   threebet_pf targetMin  6 targetMax  9  -> midpoint 7.5
//   wwsf_pct    targetMin 45 targetMax 55  -> midpoint 50
// =============================================================================

async function loadHelper() {
  return await import('../../../server/coach/leaks/detectLeaks');
}

async function loadConstants() {
  return await import('../../../server/coach/leaks/constants');
}

const MONTH = '2026-06';

// -----------------------------------------------------------------------------
// Construtores de input PLANO (shape do helper — não drizzle).
// CoachLeakInput  : { leakCode, description, baselineStatKey, status }
// StatAnalysisInput: { statId, statAnalysisEntries: {length}[] | null }
// FocusStatInput  : { statId }
// -----------------------------------------------------------------------------
function coachLeak(
  over: Partial<{ leakCode: string; description: string; baselineStatKey: string; status: string }> = {},
) {
  return {
    leakCode: over.leakCode ?? 'leak_x',
    description: over.description ?? 'descrição do leak',
    baselineStatKey: over.baselineStatKey ?? 'vpip',
    status: over.status ?? 'active',
  };
}

// entries: número de entries dessa sessão (cada entry = objeto com .length irrelevante,
// só conta o array.length). null = statAnalysisEntries ausente -> 0 entries.
function statAnalysisSession(statId: string | null, entries: number | null) {
  return {
    statId,
    statAnalysisEntries:
      entries === null ? null : Array.from({ length: entries }, (_, i) => ({ id: `e${i}` })),
  };
}

function focusStat(statId: string) {
  return { statId };
}

function emptyInputs(over: Partial<{
  coachLeaks: any[];
  statAnalysisSessions: any[];
  focusStats: any[];
  currentMonth: string;
}> = {}) {
  return {
    coachLeaks: over.coachLeaks ?? [],
    statAnalysisSessions: over.statAnalysisSessions ?? [],
    focusStats: over.focusStats ?? [],
    currentMonth: over.currentMonth ?? MONTH,
  };
}

// =============================================================================
// Constantes (RF-03) — assertar valores travados na spec/ADR
// =============================================================================
describe('constantes de peso e janela (RF-03 / D-A2)', () => {
  it('exporta pesos e cap com os valores da spec', async () => {
    const c = await loadConstants();
    expect(c.WEIGHT_COACH_LEAK).toBe(10);
    expect(c.WEIGHT_STAT_ANALYSIS_SESSION).toBe(3);
    expect(c.WEIGHT_STAT_ANALYSIS_ENTRY).toBe(1);
    expect(c.WEIGHT_FOCUS_MARK).toBe(2);
    expect(c.CAP_STAT_ANALYSIS).toBe(30);
  });

  it('exporta STAT_ANALYSIS_WINDOW_DAYS = 60 (D-A2)', async () => {
    const c = await loadConstants();
    expect(c.STAT_ANALYSIS_WINDOW_DAYS).toBe(60);
  });
});

// =============================================================================
// RF-03 — severity isolado por fonte
// =============================================================================
describe('severity isolado por fonte (RF-03)', () => {
  it('só S1 ativo sobre statId catálogo -> severity = 10', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({ coachLeaks: [coachLeak({ baselineStatKey: 'vpip', status: 'active' })] }),
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].statId).toBe('vpip');
    expect(out[0].severity).toBe(10);
  });

  it('só S2 (1 sessão, 2 entries) -> severity = 3 + 2 = 5', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({ statAnalysisSessions: [statAnalysisSession('pfr', 2)] }),
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].statId).toBe('pfr');
    expect(out[0].severity).toBe(5);
  });

  it('só S3 (1 marca de foco no mês) -> severity = 2', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({ focusStats: [focusStat('threebet_pf')] }),
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].statId).toBe('threebet_pf');
    expect(out[0].severity).toBe(2);
  });

  it('S2 com 2 sessões distintas + 3 entries cada (6 total) -> scoreS2 = 3*2 + 6 = 12', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({
        statAnalysisSessions: [statAnalysisSession('pfr', 3), statAnalysisSession('pfr', 3)],
      }),
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe(12);
  });

  it('S2 com 3 sessões distintas + 15 entries total -> 3*3 + min(15,10) = 9 + 10 = 19', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({
        statAnalysisSessions: [
          statAnalysisSession('pfr', 5),
          statAnalysisSession('pfr', 5),
          statAnalysisSession('pfr', 5),
        ],
      }),
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe(19);
  });
});

// =============================================================================
// RF-03 — cap de scoreS2 em 30
// =============================================================================
describe('cap de scoreS2 (RF-03)', () => {
  it('20 sessões + 200 entries -> scoreS2 capado em 30 (não 60+10)', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const sessions = Array.from({ length: 20 }, () => statAnalysisSession('pfr', 10));
    const out = synthesizeLeaks(emptyInputs({ statAnalysisSessions: sessions }), 5);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe(30);
  });
});

// =============================================================================
// RF-02 / RF-03 — severity somado no mesmo statId nas 3 fontes
// =============================================================================
describe('consolidação somando sub-scores (RF-02 / RF-03)', () => {
  it('statId em S1(ativo) + S2(2 sessões,6 entries) + S3 -> 10 + 12 + 2 = 24 (1 item)', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({
        coachLeaks: [coachLeak({ baselineStatKey: 'pfr', status: 'active' })],
        statAnalysisSessions: [statAnalysisSession('pfr', 3), statAnalysisSession('pfr', 3)],
        focusStats: [focusStat('pfr')],
      }),
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].statId).toBe('pfr');
    expect(out[0].severity).toBe(24);
  });

  it('mesmo statId em S2 e S3 -> 1 item consolidado (dedup)', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({
        statAnalysisSessions: [statAnalysisSession('vpip', 1)],
        focusStats: [focusStat('vpip')],
      }),
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].statId).toBe('vpip');
    // scoreS2 = 3 + 1 = 4 ; scoreS3 = 2 ; total = 6
    expect(out[0].severity).toBe(6);
  });
});

// =============================================================================
// RF-02 / RF-05 — fusão S1↔S2 e S1 órfão
// =============================================================================
describe('match baselineStatKey -> catálogo (RF-05 / D-A7)', () => {
  it('S1 baselineStatKey="vpip" (casa) funde com S2 do mesmo statId (1 item, benchmark catálogo)', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({
        coachLeaks: [coachLeak({ baselineStatKey: 'vpip', status: 'active' })],
        statAnalysisSessions: [statAnalysisSession('vpip', 2)],
      }),
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].statId).toBe('vpip');
    // S1 = 10 ; S2 = 3 + 2 = 5 ; total = 15
    expect(out[0].severity).toBe(15);
    // benchmark = (20+25)/2 = 22.5
    expect(out[0].benchmark).toBe(22.5);
    // statName vem do catálogo (label), não da description
    expect(out[0].statName).toBe('VPIP');
  });

  it('S1 baselineStatKey=" VPIP " (trim+lowercase) ainda casa o catálogo (D-A7)', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({
        coachLeaks: [coachLeak({ baselineStatKey: ' VPIP ', status: 'active' })],
      }),
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].statId).toBe('vpip');
    expect(out[0].benchmark).toBe(22.5);
  });

  it('S1 órfão (baselineStatKey não casa) -> statId="leak:<code>", benchmark null, statName=description', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({
        coachLeaks: [
          coachLeak({
            leakCode: 'def_bb_vs_co',
            description: '3bet defesa BB vs CO',
            baselineStatKey: '3bet defesa BB vs CO',
            status: 'active',
          }),
        ],
      }),
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].statId).toBe('leak:def_bb_vs_co');
    expect(out[0].benchmark).toBeNull();
    expect(out[0].statName).toBe('3bet defesa BB vs CO');
    expect(out[0].severity).toBe(10);
  });

  it('S1 órfão NÃO se funde com S2 que tem statId diferente (2 itens distintos)', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({
        coachLeaks: [
          coachLeak({ leakCode: 'c1', description: 'leak custom', baselineStatKey: 'algo livre', status: 'active' }),
        ],
        statAnalysisSessions: [statAnalysisSession('pfr', 1)],
      }),
      5,
    );
    expect(out).toHaveLength(2);
    const ids = out.map((l) => l.statId).sort();
    expect(ids).toEqual(['leak:c1', 'pfr']);
  });
});

// =============================================================================
// RF-04 (gate de status no helper) — S1 só active
// =============================================================================
describe('S1 status (RF-04) — helper só soma os já-active recebidos', () => {
  it('coach_leak com status="resolved" NÃO contribui (severity)', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({
        coachLeaks: [coachLeak({ baselineStatKey: 'vpip', status: 'resolved' })],
      }),
      5,
    );
    // helper só pontua status==='active'; resolved não vira leak -> severity 0 -> não aparece
    expect(out).toHaveLength(0);
  });
});

// =============================================================================
// RF-03 — severity 0 não aparece
// =============================================================================
describe('severity 0 não entra no resultado (RF-03)', () => {
  it('todas as fontes vazias -> []', async () => {
    const { synthesizeLeaks } = await loadHelper();
    expect(synthesizeLeaks(emptyInputs(), 5)).toEqual([]);
  });

  it('statId que aparece mas sem nenhum sinal pontuável (resolved + sem S2/S3) -> []', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({ coachLeaks: [coachLeak({ baselineStatKey: 'vpip', status: 'resolved' })] }),
      5,
    );
    expect(out).toEqual([]);
  });
});

// =============================================================================
// RF-01 — ordenação determinística
// =============================================================================
describe('ordenação determinística (RF-01)', () => {
  it('ordena por severity desc', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({
        // pfr: S1 active = 10 ; vpip: só S3 = 2 ; threebet_pf: S2 1 sessão 1 entry = 4
        coachLeaks: [coachLeak({ baselineStatKey: 'pfr', status: 'active' })],
        statAnalysisSessions: [statAnalysisSession('threebet_pf', 1)],
        focusStats: [focusStat('vpip')],
      }),
      5,
    );
    expect(out.map((l) => l.statId)).toEqual(['pfr', 'threebet_pf', 'vpip']);
    expect(out.map((l) => l.severity)).toEqual([10, 4, 2]);
  });

  it('empate de severity -> desempate por chave (statId) ascendente', async () => {
    const { synthesizeLeaks } = await loadHelper();
    // pfr e vpip ambos via S3 isolado -> severity 2 cada. statId asc: pfr < vpip
    const out = synthesizeLeaks(
      emptyInputs({ focusStats: [focusStat('vpip'), focusStat('pfr')] }),
      5,
    );
    expect(out.map((l) => l.statId)).toEqual(['pfr', 'vpip']);
  });

  it('mesma entrada -> mesma saída e ordem (determinismo)', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const inputs = emptyInputs({
      coachLeaks: [coachLeak({ baselineStatKey: 'pfr', status: 'active' })],
      statAnalysisSessions: [statAnalysisSession('vpip', 2), statAnalysisSession('threebet_pf', 1)],
      focusStats: [focusStat('wwsf_pct')],
    });
    const a = synthesizeLeaks(inputs, 5);
    const b = synthesizeLeaks(inputs, 5);
    expect(a).toEqual(b);
  });
});

// =============================================================================
// RF-06 — shape de retorno
// =============================================================================
describe('shape de retorno (RF-06)', () => {
  it('value e delta sempre null; benchmark midpoint quando casa catálogo', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({ statAnalysisSessions: [statAnalysisSession('threebet_pf', 1)] }),
      5,
    );
    expect(out[0].value).toBeNull();
    expect(out[0].delta).toBeNull();
    // (6+9)/2 = 7.5
    expect(out[0].benchmark).toBe(7.5);
  });

  it('baselineValue do coach_leak NÃO vira value (value continua null)', async () => {
    const { synthesizeLeaks } = await loadHelper();
    // baselineValue não está no input do helper (storage não passa) — garantia de design:
    // mesmo que viesse, o contrato é value=null. Aqui asseguramos via S1 puro.
    const out = synthesizeLeaks(
      emptyInputs({ coachLeaks: [coachLeak({ baselineStatKey: 'vpip', status: 'active' })] }),
      5,
    );
    expect(out[0].value).toBeNull();
    expect(out[0].delta).toBeNull();
  });

  it('statName nunca vazio', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({
        coachLeaks: [
          coachLeak({ leakCode: 'c1', description: 'meu leak', baselineStatKey: 'livre', status: 'active' }),
        ],
        statAnalysisSessions: [statAnalysisSession('vpip', 1), statAnalysisSession('custom_river_call', 1)],
        focusStats: [focusStat('pfr')],
      }),
      10,
    );
    for (const leak of out) {
      expect(typeof leak.statName).toBe('string');
      expect(leak.statName.length).toBeGreaterThan(0);
    }
  });

  it('benchmark null quando statId não casa catálogo (custom_*)', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({ statAnalysisSessions: [statAnalysisSession('custom_river_call', 1)] }),
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].statId).toBe('custom_river_call');
    expect(out[0].benchmark).toBeNull();
  });
});

// =============================================================================
// RF-06 — leitura pelos consumers (subsets do shape)
// =============================================================================
describe('contrato lido pelos consumers (RF-06)', () => {
  it('auto-suggest consegue ler { statId, severity } e ordenar', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({
        coachLeaks: [coachLeak({ baselineStatKey: 'pfr', status: 'active' })],
        focusStats: [focusStat('vpip')],
      }),
      3,
    );
    const projected = out.map((l) => ({ statId: l.statId, severity: l.severity }));
    expect(projected[0]).toEqual({ statId: 'pfr', severity: 10 });
    expect(projected[1]).toEqual({ statId: 'vpip', severity: 2 });
  });

  it('biblioteca consegue ler os 6 campos sem undefined', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({ statAnalysisSessions: [statAnalysisSession('vpip', 2)] }),
      3,
    );
    const leak = out[0];
    for (const k of ['statId', 'statName', 'value', 'benchmark', 'delta', 'severity'] as const) {
      expect(leak).toHaveProperty(k);
      expect(leak[k]).not.toBeUndefined();
    }
  });
});

// =============================================================================
// RF-05 / D-A5 — custom_* válido vs inválido
// =============================================================================
describe('custom_* (RF-05 / D-A5)', () => {
  it('custom_* válido (passa regex) incluído com statName genérico + benchmark null', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({ statAnalysisSessions: [statAnalysisSession('custom_meu_leak', 1)] }),
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].statId).toBe('custom_meu_leak');
    expect(out[0].benchmark).toBeNull();
    expect(out[0].statName.length).toBeGreaterThan(0);
  });

  it('custom_* path traversal (custom_../../x) EXCLUÍDO', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({ statAnalysisSessions: [statAnalysisSession('custom_../../x', 1)] }),
      5,
    );
    expect(out).toHaveLength(0);
  });

  it('statId não-catálogo e não-custom-válido em S2 -> EXCLUÍDO', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({ statAnalysisSessions: [statAnalysisSession('chave_aleatoria_invalida', 1)] }),
      5,
    );
    expect(out).toHaveLength(0);
  });

  it('statId não-catálogo e não-custom-válido em S3 -> EXCLUÍDO', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({ focusStats: [focusStat('xyz_invalida')] }),
      5,
    );
    expect(out).toHaveLength(0);
  });

  it('statId null em S2 -> EXCLUÍDO (sem throw)', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({ statAnalysisSessions: [statAnalysisSession(null, 3)] }),
      5,
    );
    expect(out).toHaveLength(0);
  });
});

// =============================================================================
// Edge — statAnalysisEntries null -> 0 entries (sem NaN)
// =============================================================================
describe('statAnalysisEntries null -> 0 entries (sem NaN)', () => {
  it('sessão S2 com entries null conta como 1 sessão + 0 entries -> scoreS2 = 3', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({ statAnalysisSessions: [statAnalysisSession('pfr', null)] }),
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe(3);
    expect(Number.isNaN(out[0].severity)).toBe(false);
  });
});

// =============================================================================
// D-A4 — semântica de top
// =============================================================================
describe('semântica de top (D-A4)', () => {
  function richInputs() {
    return emptyInputs({
      coachLeaks: [coachLeak({ baselineStatKey: 'pfr', status: 'active' })], // 10
      statAnalysisSessions: [statAnalysisSession('vpip', 2)], // 5
      focusStats: [focusStat('threebet_pf')], // 2
    });
  }

  it('top = 0 -> []', async () => {
    const { synthesizeLeaks } = await loadHelper();
    expect(synthesizeLeaks(richInputs(), 0)).toEqual([]);
  });

  it('top = -1 -> []', async () => {
    const { synthesizeLeaks } = await loadHelper();
    expect(synthesizeLeaks(richInputs(), -1)).toEqual([]);
  });

  it('top = NaN -> []', async () => {
    const { synthesizeLeaks } = await loadHelper();
    expect(synthesizeLeaks(richInputs(), Number.NaN)).toEqual([]);
  });

  it('top = 2.7 -> Math.floor = 2 itens', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(richInputs(), 2.7);
    expect(out).toHaveLength(2);
    // top severities (10, 5)
    expect(out.map((l) => l.severity)).toEqual([10, 5]);
  });

  it('top maior que itens -> todos', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(richInputs(), 99);
    expect(out).toHaveLength(3);
  });

  it('top menor que nº de leaks -> trunca após ordenar (mantém os mais severos)', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(richInputs(), 1);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe(10);
  });
});

// =============================================================================
// Happy path completo (RF-01)
// =============================================================================
describe('happy path (RF-01)', () => {
  it('3 sinais em statIds distintos -> array ordenado por severity desc, <= top', async () => {
    const { synthesizeLeaks } = await loadHelper();
    const out = synthesizeLeaks(
      emptyInputs({
        coachLeaks: [coachLeak({ baselineStatKey: 'pfr', status: 'active' })], // 10
        statAnalysisSessions: [statAnalysisSession('vpip', 5)], // 3 + 5 = 8
        focusStats: [focusStat('threebet_pf')], // 2
      }),
      3,
    );
    expect(out.map((l) => l.statId)).toEqual(['pfr', 'vpip', 'threebet_pf']);
    expect(out.map((l) => l.severity)).toEqual([10, 8, 2]);
    expect(out.length).toBeLessThanOrEqual(3);
  });
});
