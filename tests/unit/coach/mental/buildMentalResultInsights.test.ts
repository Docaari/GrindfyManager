import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Sprint Fase C #10 — RF-05 helper PURO: buildMentalResultInsights
//
// Spec: Docs/specs/sprint-fase-c-10-mental-resultado-2026-06-02.md (RF-05)
// ADR : Docs/architecture/decisions/233-fase-c-10-mental-result-insights.md (D-4/D-7)
//
// Status RED: server/coach/mental/mentalResultInsights.ts NAO existe ainda.
//
// PUREZA (ADR D-4): o modulo NAO importa drizzle/schema/storage/db e NAO usa
// new Date(). Recebe SessionPnlRow[] ja normalizado (P&L em USD, sinais como
// buckets/null) e devolve MentalResultInsights. Este teste usa SO literais,
// ZERO mock (lesson #30: .test.ts = node).
//
// Contrato (ADR):
//   SessionPnlRow = { sessionId, pnlUsd:number, tiltType:TiltTypeId|null,
//                     focusValue:number|null, abGameBucket:"a_dominant"|"bc_present"|null }
//   MentalResultBuckets<K> = {
//     period, baseline:BucketStat,
//     buckets: Array<BucketStat & {key:K; deltaVsBaseline:number|null}>,
//     dataSufficiency:"ok"|"low" }
//   BucketStat = { n, avgPnlUsd:number|null, medianPnlUsd:number|null,
//                  dataSufficiency:"ok"|"low" }
//   MentalResultInsights = { tilt, focus, abgame }
//
// Constantes: MIN_SESSIONS_PER_BUCKET=4, MIN_SESSIONS_OVERALL=8,
//   FOCUS_BUCKETS alto(>=7.5)/medio(>=5)/baixo(<5).
//
// Lessons: #8 (presenca individual de bucket, nao length absoluta), #30 (node).
// =============================================================================

import {
  buildMentalResultInsights,
  MIN_SESSIONS_PER_BUCKET,
  MIN_SESSIONS_OVERALL,
} from '../../../../server/coach/mental/mentalResultInsights';

type AbBucket = 'a_dominant' | 'bc_present';

function r(
  sessionId: string,
  pnlUsd: number,
  opts: {
    tiltType?: string | null;
    focusValue?: number | null;
    abGameBucket?: AbBucket | null;
  } = {},
): any {
  return {
    sessionId,
    pnlUsd,
    tiltType: opts.tiltType ?? null,
    focusValue: opts.focusValue === undefined ? null : opts.focusValue,
    abGameBucket: opts.abGameBucket ?? null,
  };
}

// Helper: encontra um bucket por key dentro de um set (tilt/focus/abgame).
function findBucket(set: any, key: string): any {
  return set.buckets.find((b: any) => b.key === key);
}

// ===========================================================================
// Existencia / shape / constantes
// ===========================================================================

describe('buildMentalResultInsights — shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof buildMentalResultInsights).toBe('function');
  });

  it('constantes nomeadas exportadas com os valores travados', () => {
    expect(MIN_SESSIONS_PER_BUCKET).toBe(4);
    expect(MIN_SESSIONS_OVERALL).toBe(8);
  });

  it('retorna os 3 sub-blocos tilt/focus/abgame', () => {
    const out = buildMentalResultInsights([], '30d');
    expect(out).toHaveProperty('tilt');
    expect(out).toHaveProperty('focus');
    expect(out).toHaveProperty('abgame');
  });

  it('period ecoa em cada sub-bloco', () => {
    const out = buildMentalResultInsights([], '7d');
    expect(out.tilt.period).toBe('7d');
    expect(out.focus.period).toBe('7d');
    expect(out.abgame.period).toBe('7d');
  });
});

// ===========================================================================
// Lista vazia -> baseline n=0, avg/median null, set low
// ===========================================================================

describe('buildMentalResultInsights — lista vazia', () => {
  it('baseline n=0 com avg/median null e dataSufficiency low em cada set', () => {
    const out = buildMentalResultInsights([], '30d');

    for (const set of [out.tilt, out.focus, out.abgame]) {
      expect(set.baseline.n).toBe(0);
      expect(set.baseline.avgPnlUsd).toBeNull();
      expect(set.baseline.medianPnlUsd).toBeNull();
      expect(set.dataSufficiency).toBe('low');
    }
  });

  it('focus sempre traz os 3 buckets na ordem fixa alto/medio/baixo mesmo vazio (lesson #8)', () => {
    const out = buildMentalResultInsights([], '30d');
    expect(out.focus.buckets.map((b: any) => b.key)).toEqual(['alto', 'medio', 'baixo']);
    for (const b of out.focus.buckets) {
      expect(b.n).toBe(0);
      expect(b.avgPnlUsd).toBeNull();
      expect(b.medianPnlUsd).toBeNull();
      expect(b.dataSufficiency).toBe('low');
      expect(b.deltaVsBaseline).toBeNull();
    }
  });

  it('abgame sempre traz os 2 buckets na ordem fixa a_dominant/bc_present mesmo vazio', () => {
    const out = buildMentalResultInsights([], '30d');
    expect(out.abgame.buckets.map((b: any) => b.key)).toEqual(['a_dominant', 'bc_present']);
    for (const b of out.abgame.buckets) {
      expect(b.n).toBe(0);
      expect(b.avgPnlUsd).toBeNull();
      expect(b.deltaVsBaseline).toBeNull();
    }
  });
});

// ===========================================================================
// Baseline = TODAS as sessoes do periodo (independente do sinal)
// ===========================================================================

describe('buildMentalResultInsights — baseline = conjunto total', () => {
  it('baseline usa todas as sessoes (mesmo as sem sinal mental)', () => {
    const rows = [
      r('s1', 10, { tiltType: 'injustice' }),
      r('s2', 20, { focusValue: 8 }),
      r('s3', 30), // sem sinal nenhum
      r('s4', -60), // sem sinal nenhum, P&L negativo
    ];
    const out = buildMentalResultInsights(rows, '30d');

    // media (10+20+30-60)/4 = 0
    expect(out.tilt.baseline.n).toBe(4);
    expect(out.tilt.baseline.avgPnlUsd).toBeCloseTo(0, 6);
    // focus e abgame compartilham o MESMO baseline (mesmo conjunto base)
    expect(out.focus.baseline.n).toBe(4);
    expect(out.abgame.baseline.n).toBe(4);
    expect(out.focus.baseline.avgPnlUsd).toBeCloseTo(0, 6);
  });

  it('mediana do baseline com N par = media dos 2 centrais', () => {
    // valores ordenados: -60, 10, 20, 30 -> 2 centrais 10 e 20 -> 15
    const rows = [r('s1', 10), r('s2', 20), r('s3', 30), r('s4', -60)];
    const out = buildMentalResultInsights(rows, '30d');
    expect(out.tilt.baseline.medianPnlUsd).toBeCloseTo(15, 6);
  });

  it('mediana do baseline com N impar = valor central', () => {
    // ordenados: -5, 10, 30 -> central 10
    const rows = [r('s1', 10), r('s2', 30), r('s3', -5)];
    const out = buildMentalResultInsights(rows, '30d');
    expect(out.tilt.baseline.medianPnlUsd).toBeCloseTo(10, 6);
  });
});

// ===========================================================================
// dataSufficiency do SET — baseline.n < MIN_SESSIONS_OVERALL (8)
// ===========================================================================

describe('buildMentalResultInsights — dataSufficiency do set', () => {
  it('baseline.n=7 -> set low', () => {
    const rows = Array.from({ length: 7 }, (_, i) => r(`s${i}`, 10));
    const out = buildMentalResultInsights(rows, '30d');
    expect(out.tilt.baseline.n).toBe(7);
    expect(out.tilt.dataSufficiency).toBe('low');
  });

  it('baseline.n=8 (exatamente o limiar) -> set ok', () => {
    const rows = Array.from({ length: 8 }, (_, i) => r(`s${i}`, 10));
    const out = buildMentalResultInsights(rows, '30d');
    expect(out.tilt.baseline.n).toBe(8);
    expect(out.tilt.dataSufficiency).toBe('ok');
  });
});

// ===========================================================================
// TILT — bucket por tiltType, delta vs baseline, ordenacao
// ===========================================================================

describe('buildMentalResultInsights — tilt buckets', () => {
  it('bucketiza por tiltType; sessao sem tiltType so no baseline', () => {
    const rows = [
      r('s1', -40, { tiltType: 'injustice' }),
      r('s2', -40, { tiltType: 'injustice' }),
      r('s3', -40, { tiltType: 'injustice' }),
      r('s4', -40, { tiltType: 'injustice' }),
      r('s5', 20), // sem tilt -> so baseline
      r('s6', 20),
      r('s7', 20),
      r('s8', 20),
    ];
    const out = buildMentalResultInsights(rows, '30d');

    const inj = findBucket(out.tilt, 'injustice');
    expect(inj).toBeTruthy();
    expect(inj.n).toBe(4);
    expect(inj.avgPnlUsd).toBeCloseTo(-40, 6);
    // baseline media = (4*-40 + 4*20)/8 = (-160+80)/8 = -10
    expect(out.tilt.baseline.avgPnlUsd).toBeCloseTo(-10, 6);
    // delta = bucket.avg - baseline.avg = -40 - (-10) = -30
    expect(inj.deltaVsBaseline).toBeCloseTo(-30, 6);
    expect(inj.dataSufficiency).toBe('ok'); // n=4 == MIN_SESSIONS_PER_BUCKET
  });

  it('bucket de tilt com n < 4 -> dataSufficiency low', () => {
    const rows = [
      r('s1', -40, { tiltType: 'revenge' }),
      r('s2', -40, { tiltType: 'revenge' }),
      // baseline so com esses 2 -> set tambem low, mas bucket tambem low
    ];
    const out = buildMentalResultInsights(rows, '30d');
    const rev = findBucket(out.tilt, 'revenge');
    expect(rev.n).toBe(2);
    expect(rev.dataSufficiency).toBe('low');
  });

  it('ordenacao tilt: deltaVsBaseline ASC (pior/mais caro no topo)', () => {
    const rows = [
      // injustice muito negativo (delta mais negativo)
      r('a1', -100, { tiltType: 'injustice' }),
      r('a2', -100, { tiltType: 'injustice' }),
      r('a3', -100, { tiltType: 'injustice' }),
      r('a4', -100, { tiltType: 'injustice' }),
      // mistake levemente negativo
      r('b1', -10, { tiltType: 'mistake' }),
      r('b2', -10, { tiltType: 'mistake' }),
      r('b3', -10, { tiltType: 'mistake' }),
      r('b4', -10, { tiltType: 'mistake' }),
    ];
    const out = buildMentalResultInsights(rows, '30d');
    // primeiro bucket deve ser o de delta mais negativo (injustice)
    expect(out.tilt.buckets[0].key).toBe('injustice');
    // delta de injustice < delta de mistake
    const inj = findBucket(out.tilt, 'injustice');
    const mis = findBucket(out.tilt, 'mistake');
    expect(inj.deltaVsBaseline).toBeLessThan(mis.deltaVsBaseline);
  });

  it('desempate determinista por tiltType ASC quando deltaVsBaseline igual', () => {
    // hate_losing e injustice com MESMO P&L -> mesmo delta -> ordena por key asc
    const rows = [
      r('h1', -50, { tiltType: 'hate_losing' }),
      r('h2', -50, { tiltType: 'hate_losing' }),
      r('h3', -50, { tiltType: 'hate_losing' }),
      r('h4', -50, { tiltType: 'hate_losing' }),
      r('i1', -50, { tiltType: 'injustice' }),
      r('i2', -50, { tiltType: 'injustice' }),
      r('i3', -50, { tiltType: 'injustice' }),
      r('i4', -50, { tiltType: 'injustice' }),
    ];
    const out = buildMentalResultInsights(rows, '30d');
    const keys = out.tilt.buckets.map((b: any) => b.key);
    // 'hate_losing' < 'injustice' alfabeticamente
    expect(keys.indexOf('hate_losing')).toBeLessThan(keys.indexOf('injustice'));
  });

  it('deltaVsBaseline = 0 quando bucket.avg === baseline.avg (empate, NAO null)', () => {
    // todas as sessoes mesmo P&L e mesmo tipo -> bucket.avg == baseline.avg
    const rows = Array.from({ length: 8 }, (_, i) => r(`s${i}`, 25, { tiltType: 'mistake' }));
    const out = buildMentalResultInsights(rows, '30d');
    const mis = findBucket(out.tilt, 'mistake');
    expect(mis.avgPnlUsd).toBeCloseTo(25, 6);
    expect(out.tilt.baseline.avgPnlUsd).toBeCloseTo(25, 6);
    expect(mis.deltaVsBaseline).toBe(0);
  });
});

// ===========================================================================
// FOCUS — faixas alto(>=7.5)/medio(>=5)/baixo(<5), boundaries
// ===========================================================================

describe('buildMentalResultInsights — focus faixas', () => {
  it('foco >= 7.5 -> alto; 5 <= foco < 7.5 -> medio; foco < 5 -> baixo', () => {
    const rows = [
      r('s1', 10, { focusValue: 9 }),    // alto
      r('s2', 10, { focusValue: 6 }),    // medio
      r('s3', 10, { focusValue: 2 }),    // baixo
    ];
    const out = buildMentalResultInsights(rows, '30d');
    expect(findBucket(out.focus, 'alto').n).toBe(1);
    expect(findBucket(out.focus, 'medio').n).toBe(1);
    expect(findBucket(out.focus, 'baixo').n).toBe(1);
  });

  it('foco exatamente 7.5 -> alto (boundary inclusivo)', () => {
    const out = buildMentalResultInsights([r('s1', 10, { focusValue: 7.5 })], '30d');
    expect(findBucket(out.focus, 'alto').n).toBe(1);
    expect(findBucket(out.focus, 'medio').n).toBe(0);
  });

  it('foco exatamente 5 -> medio (boundary inclusivo)', () => {
    const out = buildMentalResultInsights([r('s1', 10, { focusValue: 5 })], '30d');
    expect(findBucket(out.focus, 'medio').n).toBe(1);
    expect(findBucket(out.focus, 'baixo').n).toBe(0);
  });

  it('foco 4.99 -> baixo', () => {
    const out = buildMentalResultInsights([r('s1', 10, { focusValue: 4.99 })], '30d');
    expect(findBucket(out.focus, 'baixo').n).toBe(1);
    expect(findBucket(out.focus, 'medio').n).toBe(0);
  });

  it('foco 0 -> baixo (foco real baixo, nao "ausente")', () => {
    const out = buildMentalResultInsights([r('s1', 10, { focusValue: 0 })], '30d');
    expect(findBucket(out.focus, 'baixo').n).toBe(1);
  });

  it('focusValue null -> nao entra em nenhum bucket de foco mas conta no baseline', () => {
    const rows = [
      r('s1', 10, { focusValue: null }),
      r('s2', 20, { focusValue: null }),
    ];
    const out = buildMentalResultInsights(rows, '30d');
    expect(findBucket(out.focus, 'alto').n).toBe(0);
    expect(findBucket(out.focus, 'medio').n).toBe(0);
    expect(findBucket(out.focus, 'baixo').n).toBe(0);
    expect(out.focus.baseline.n).toBe(2);
  });

  it('ordem fixa dos buckets de foco alto/medio/baixo', () => {
    const out = buildMentalResultInsights([r('s1', 10, { focusValue: 2 })], '30d');
    expect(out.focus.buckets.map((b: any) => b.key)).toEqual(['alto', 'medio', 'baixo']);
  });
});

// ===========================================================================
// ABGAME — buckets a_dominant / bc_present
// ===========================================================================

describe('buildMentalResultInsights — abgame buckets', () => {
  it('bucketiza por abGameBucket; journal vazio (null) so no baseline', () => {
    const rows = [
      r('s1', 30, { abGameBucket: 'a_dominant' }),
      r('s2', 30, { abGameBucket: 'a_dominant' }),
      r('s3', -20, { abGameBucket: 'bc_present' }),
      r('s4', -20, { abGameBucket: 'bc_present' }),
      r('s5', 5, { abGameBucket: null }), // journal vazio -> so baseline
    ];
    const out = buildMentalResultInsights(rows, '30d');
    expect(findBucket(out.abgame, 'a_dominant').n).toBe(2);
    expect(findBucket(out.abgame, 'bc_present').n).toBe(2);
    expect(out.abgame.baseline.n).toBe(5);
  });

  it('a_dominant com P&L > bc_present -> delta positivo em a_dominant', () => {
    const rows = [
      r('a1', 40, { abGameBucket: 'a_dominant' }),
      r('a2', 40, { abGameBucket: 'a_dominant' }),
      r('b1', -40, { abGameBucket: 'bc_present' }),
      r('b2', -40, { abGameBucket: 'bc_present' }),
    ];
    const out = buildMentalResultInsights(rows, '30d');
    const aDom = findBucket(out.abgame, 'a_dominant');
    // baseline media = 0; a_dominant avg = 40 -> delta +40
    expect(aDom.deltaVsBaseline).toBeCloseTo(40, 6);
  });

  it('ordem fixa a_dominant/bc_present', () => {
    const out = buildMentalResultInsights(
      [r('s1', 10, { abGameBucket: 'bc_present' })],
      '30d',
    );
    expect(out.abgame.buckets.map((b: any) => b.key)).toEqual(['a_dominant', 'bc_present']);
  });
});

// ===========================================================================
// delta = null quando um lado eh null (bucket vazio OU baseline vazio)
// ===========================================================================

describe('buildMentalResultInsights — delta null quando algum lado null', () => {
  it('bucket vazio -> deltaVsBaseline null (avg do bucket eh null)', () => {
    // 1 sessao a_dominant, nenhuma bc_present -> bc_present.avg null -> delta null
    const out = buildMentalResultInsights(
      [r('s1', 10, { abGameBucket: 'a_dominant' })],
      '30d',
    );
    const bc = findBucket(out.abgame, 'bc_present');
    expect(bc.avgPnlUsd).toBeNull();
    expect(bc.deltaVsBaseline).toBeNull();
  });

  it('baseline vazio -> todos os deltas null mesmo com bucket preenchido (impossivel na pratica, mas robusto)', () => {
    // lista totalmente vazia: baseline null -> qualquer bucket delta null
    const out = buildMentalResultInsights([], '30d');
    for (const b of out.focus.buckets) {
      expect(b.deltaVsBaseline).toBeNull();
    }
  });
});

// ===========================================================================
// Determinismo — mesma entrada, mesma saida (ordem de input nao importa)
// ===========================================================================

describe('buildMentalResultInsights — determinismo', () => {
  it('reordenar o input nao muda a saida serializada', () => {
    const rows = [
      r('s1', -40, { tiltType: 'injustice', focusValue: 3, abGameBucket: 'bc_present' }),
      r('s2', 50, { tiltType: 'mistake', focusValue: 8, abGameBucket: 'a_dominant' }),
      r('s3', 10, { tiltType: 'injustice', focusValue: 6, abGameBucket: 'bc_present' }),
      r('s4', 20, { focusValue: 9, abGameBucket: 'a_dominant' }),
    ];
    const a = buildMentalResultInsights(rows, '30d');
    const b = buildMentalResultInsights([...rows].reverse(), '30d');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ===========================================================================
// P&L zero / negativo nao quebra media (sem NaN)
// ===========================================================================

describe('buildMentalResultInsights — P&L numerico robusto', () => {
  it('pnlUsd 0 entra no calculo (nao vira NaN, nao some)', () => {
    const rows = [
      r('s1', 0, { tiltType: 'injustice' }),
      r('s2', 0, { tiltType: 'injustice' }),
      r('s3', 0, { tiltType: 'injustice' }),
      r('s4', 0, { tiltType: 'injustice' }),
    ];
    const out = buildMentalResultInsights(rows, '30d');
    const inj = findBucket(out.tilt, 'injustice');
    expect(inj.n).toBe(4);
    expect(inj.avgPnlUsd).toBe(0);
    expect(Number.isNaN(inj.avgPnlUsd)).toBe(false);
  });
});
