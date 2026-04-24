import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: server/scoring/tournamentScorer.ts (modulo NAO existe ainda)
//
// Funcao pura `computeTournamentScore(tournament, bundle, options)` que cruza
// a oferta do dia com o bundle de analytics do jogador e produz:
//   { score, grade, confidence, rationale, signals, warnings }
//
// Decisoes incorporadas (Q1-Q10 do indice de arquitetura):
//   Q5. Cold start `<20`: heuristica fixa Speed x Field x TimeOfDay
//   Q6. Category desconhecida: peso `categoryRoi` vira null e redistribui
//
// Modo: TDD - todos os testes devem FALHAR ate Implementer criar o modulo.
// =============================================================================

// O Implementer deve criar esses paths exatos:
import {
  computeTournamentScore,
  type ScoringInputTournament,
  type PlayerAnalyticsBundle,
  type TournamentScoreResult,
} from '../../../server/scoring/tournamentScorer';
import {
  WEIGHTS,
  SHRINK_CONSTANT,
  GRADE_THRESHOLDS,
  COLD_START_PURE_THRESHOLD,
  COLD_START_PARTIAL_THRESHOLD,
} from '../../../server/scoring/scoringConstants';

// ---------------------------------------------------------------------------
// Helpers e fixtures inline (evita criar arquivo separado por enquanto)
// ---------------------------------------------------------------------------

function makeBundle(overrides: Partial<PlayerAnalyticsBundle> = {}): PlayerAnalyticsBundle {
  return {
    totalTournaments: 200,
    lookbackTournaments: 200,
    lookbackDays: 180,
    overallRoi: 12,
    bySite: [{ site: 'Suprema', sample: 120, roi: 14, profit: 500 }],
    byBuyIn: [{ range: '$11-21.99', sample: 134, roi: 16.8 }],
    byCategory: [{ category: 'PKO', sample: 87, roi: 18 }],
    bySpeed: [{ speed: 'Turbo', sample: 90, roi: 9 }],
    byDayOfWeek: [{ dayOfWeek: 4, sample: 78, roi: 22 }],
    byTimeOfDay: [{ bucket: 'noite-nobre', sample: 102, roi: 21 }],
    byField: [{ range: 'medio', sample: 188, roi: 11 }],
    ...overrides,
  };
}

function makeTournament(overrides: Partial<ScoringInputTournament> = {}): ScoringInputTournament {
  return {
    id: 'suprema-12345',
    source: 'suprema',
    name: 'Mystery KO $22',
    site: 'Suprema',
    buyIn: 22,
    buyInBucket: '$11-21.99',
    category: 'PKO',
    speed: 'Turbo',
    dayOfWeek: 4,
    time: '22:00',
    timeOfDayBucket: 'noite-nobre',
    fieldBucket: 'medio',
    fieldSizeEstimate: 280,
    ...overrides,
  };
}

// ===========================================================================
// Outputs basicos
// ===========================================================================

describe('computeTournamentScore - shape do retorno', () => {
  it('deve retornar { score, grade, confidence, rationale, signals, warnings }', () => {
    const result = computeTournamentScore(makeTournament(), makeBundle());
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('grade');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('rationale');
    expect(result).toHaveProperty('signals');
    expect(result).toHaveProperty('warnings');
  });

  it('deve retornar score numero inteiro entre 0 e 100', () => {
    const result = computeTournamentScore(makeTournament(), makeBundle());
    expect(Number.isInteger(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('deve retornar 7 sinais nomeados no signals', () => {
    const result = computeTournamentScore(makeTournament(), makeBundle());
    const keys = Object.keys(result.signals);
    expect(keys).toContain('siteRoi');
    expect(keys).toContain('buyInRoi');
    expect(keys).toContain('categoryRoi');
    expect(keys).toContain('speedRoi');
    expect(keys).toContain('dayOfWeekRoi');
    expect(keys).toContain('timeOfDayRoi');
    expect(keys).toContain('fieldRoi');
  });

  it('rationale nunca pode exceder 200 chars', () => {
    const result = computeTournamentScore(makeTournament(), makeBundle());
    expect(result.rationale.length).toBeLessThanOrEqual(200);
  });

  it('warnings deve ser array de strings', () => {
    const result = computeTournamentScore(makeTournament(), makeBundle());
    expect(Array.isArray(result.warnings)).toBe(true);
    result.warnings.forEach((w) => expect(typeof w).toBe('string'));
  });
});

// ===========================================================================
// Pureza
// ===========================================================================

describe('computeTournamentScore - pureza', () => {
  it('mesmo input retorna mesmo output (determinismo)', () => {
    const t = makeTournament();
    const b = makeBundle();
    const r1 = computeTournamentScore(t, b);
    const r2 = computeTournamentScore(t, b);
    expect(r1).toEqual(r2);
  });

  it('nao muta tournament input', () => {
    const t = makeTournament();
    const snap = JSON.stringify(t);
    computeTournamentScore(t, makeBundle());
    expect(JSON.stringify(t)).toBe(snap);
  });

  it('nao muta bundle input', () => {
    const b = makeBundle();
    const snap = JSON.stringify(b);
    computeTournamentScore(makeTournament(), b);
    expect(JSON.stringify(b)).toBe(snap);
  });
});

// ===========================================================================
// Calculo dos sinais individuais (bucket score + shrinkage)
// ===========================================================================

describe('computeTournamentScore - sinais (bucket score + shrinkage)', () => {
  it('bucket com sample=0 (no match) -> score do sinal tende para 50 (neutro)', () => {
    const bundle = makeBundle({
      byCategory: [], // nenhum match
    });
    const t = makeTournament({ category: 'Mystery' }); // categoria sem dados
    const result = computeTournamentScore(t, bundle);
    // Conforme spec: sample 0 → score 50 (apos shrinkage com prior 50)
    expect(result.signals.categoryRoi.score).toBe(50);
  });

  it('bucket com sample=30 e ROI=20% -> bucketScore 90, shrunkScore 70', () => {
    const bundle = makeBundle({
      byCategory: [{ category: 'PKO', sample: 30, roi: 20 }],
    });
    const result = computeTournamentScore(makeTournament(), bundle);
    // bucketScore = 50 + 20*2 = 90
    // shrunkScore = (90*30 + 50*30) / (30+30) = (2700+1500)/60 = 70
    expect(result.signals.categoryRoi.score).toBe(70);
    expect(result.signals.categoryRoi.sample).toBe(30);
  });

  it('bucket com sample=200 e ROI=20% -> shrunkScore proximo de 90', () => {
    const bundle = makeBundle({
      byBuyIn: [{ range: '$11-21.99', sample: 200, roi: 20 }],
    });
    const result = computeTournamentScore(makeTournament(), bundle);
    // bucketScore = 90; shrunkScore = (90*200 + 50*30) / 230 = 19500/230 = 84.78
    expect(result.signals.buyInRoi.score).toBeGreaterThanOrEqual(84);
    expect(result.signals.buyInRoi.score).toBeLessThanOrEqual(86);
  });

  it('bucket com sample=5 e ROI=50% (outlier) -> shrunkScore puxado para perto de 50-60', () => {
    const bundle = makeBundle({
      byCategory: [{ category: 'PKO', sample: 5, roi: 50 }],
    });
    const result = computeTournamentScore(makeTournament(), bundle);
    // bucketScore = 50+50*2=150 -> clamp 100
    // shrunkScore = (100*5 + 50*30) / 35 = (500+1500)/35 = 57.14
    expect(result.signals.categoryRoi.score).toBeGreaterThanOrEqual(56);
    expect(result.signals.categoryRoi.score).toBeLessThanOrEqual(58);
  });

  it('ROI -25% com sample 100 -> bucketScore 0, shrunkScore baixo', () => {
    const bundle = makeBundle({
      byCategory: [{ category: 'PKO', sample: 100, roi: -25 }],
    });
    const result = computeTournamentScore(makeTournament(), bundle);
    // bucketScore = clamp(50+(-50),0,100)=0
    // shrunkScore = (0*100 + 50*30)/130 = 1500/130 = 11.5
    expect(result.signals.categoryRoi.score).toBeLessThanOrEqual(13);
  });

  it('ROI alto +25% com sample 100 -> bucketScore 100, shrunkScore alto', () => {
    const bundle = makeBundle({
      byCategory: [{ category: 'PKO', sample: 100, roi: 25 }],
    });
    const result = computeTournamentScore(makeTournament(), bundle);
    // bucketScore = clamp(50+50,0,100)=100
    // shrunkScore = (100*100 + 50*30)/130 = 11500/130 = 88.46
    expect(result.signals.categoryRoi.score).toBeGreaterThanOrEqual(87);
  });

  it('clamp inferior: ROI extremo (-50%) com sample alto nao desce de 0', () => {
    const bundle = makeBundle({
      byBuyIn: [{ range: '$11-21.99', sample: 1000, roi: -50 }],
    });
    const result = computeTournamentScore(makeTournament(), bundle);
    expect(result.signals.buyInRoi.score).toBeGreaterThanOrEqual(0);
  });

  it('clamp superior: ROI extremo (+50%) com sample alto nao passa de 100', () => {
    const bundle = makeBundle({
      byBuyIn: [{ range: '$11-21.99', sample: 1000, roi: 50 }],
    });
    const result = computeTournamentScore(makeTournament(), bundle);
    expect(result.signals.buyInRoi.score).toBeLessThanOrEqual(100);
  });
});

// ===========================================================================
// Combinacao linear ponderada (score final)
// ===========================================================================

describe('computeTournamentScore - combinacao com pesos', () => {
  it('soma das contribuicoes dos sinais (shrunkScore * peso) deve igualar o score final', () => {
    const result = computeTournamentScore(makeTournament(), makeBundle());
    let sum = 0;
    for (const key of Object.keys(result.signals) as Array<keyof typeof result.signals>) {
      const s = result.signals[key];
      sum += s.score * s.weight;
    }
    expect(Math.round(sum)).toBe(result.score);
  });

  it('pesos no resultado refletem WEIGHTS de scoringConstants quando todos os sinais existem', () => {
    const result = computeTournamentScore(makeTournament(), makeBundle());
    expect(result.signals.siteRoi.weight).toBeCloseTo(WEIGHTS.siteRoi, 5);
    expect(result.signals.buyInRoi.weight).toBeCloseTo(WEIGHTS.buyInRoi, 5);
    expect(result.signals.categoryRoi.weight).toBeCloseTo(WEIGHTS.categoryRoi, 5);
    expect(result.signals.fieldRoi.weight).toBeCloseTo(WEIGHTS.fieldRoi, 5);
  });

  it('soma dos pesos no resultado deve ser 1.0 (com epsilon)', () => {
    const result = computeTournamentScore(makeTournament(), makeBundle());
    let sumW = 0;
    for (const key of Object.keys(result.signals) as Array<keyof typeof result.signals>) {
      sumW += result.signals[key].weight;
    }
    expect(sumW).toBeCloseTo(1.0, 5);
  });
});

// ===========================================================================
// Redistribuicao de peso quando sinal e null
// ===========================================================================

describe('computeTournamentScore - redistribuicao de peso', () => {
  it('fieldSizeEstimate=null: peso fieldRoi=0, redistribuido entre os outros 6', () => {
    const t = makeTournament({
      fieldSizeEstimate: null,
      fieldBucket: null,
    });
    const result = computeTournamentScore(t, makeBundle());
    expect(result.signals.fieldRoi.weight).toBe(0);
    let sumOthers = 0;
    for (const key of Object.keys(result.signals) as Array<keyof typeof result.signals>) {
      if (key !== 'fieldRoi') sumOthers += result.signals[key].weight;
    }
    expect(sumOthers).toBeCloseTo(1.0, 5);
  });

  it('category desconhecida (Q6) -> categoryRoi.weight=0, redistribuido', () => {
    const t = makeTournament({ category: null }); // Implementer: null se mapeamento falha
    const result = computeTournamentScore(t, makeBundle());
    expect(result.signals.categoryRoi.weight).toBe(0);
    let sumOthers = 0;
    for (const key of Object.keys(result.signals) as Array<keyof typeof result.signals>) {
      if (key !== 'categoryRoi') sumOthers += result.signals[key].weight;
    }
    expect(sumOthers).toBeCloseTo(1.0, 5);
  });

  it('quando 2 sinais nulos (field + category), peso 0.25 e redistribuido entre 5 restantes', () => {
    const t = makeTournament({
      fieldSizeEstimate: null,
      fieldBucket: null,
      category: null,
    });
    const result = computeTournamentScore(t, makeBundle());
    expect(result.signals.fieldRoi.weight).toBe(0);
    expect(result.signals.categoryRoi.weight).toBe(0);
    // soma dos restantes ainda e 1.0
    let sumOthers = 0;
    for (const key of Object.keys(result.signals) as Array<keyof typeof result.signals>) {
      if (key !== 'fieldRoi' && key !== 'categoryRoi') sumOthers += result.signals[key].weight;
    }
    expect(sumOthers).toBeCloseTo(1.0, 5);
  });
});

// ===========================================================================
// Grade
// ===========================================================================

describe('computeTournamentScore - grade', () => {
  it('score >= 85 -> grade "S"', () => {
    const bundle = makeBundle({
      bySite: [{ site: 'Suprema', sample: 1000, roi: 25, profit: 100 }],
      byBuyIn: [{ range: '$11-21.99', sample: 1000, roi: 25 }],
      byCategory: [{ category: 'PKO', sample: 1000, roi: 25 }],
      bySpeed: [{ speed: 'Turbo', sample: 1000, roi: 25 }],
      byDayOfWeek: [{ dayOfWeek: 4, sample: 1000, roi: 25 }],
      byTimeOfDay: [{ bucket: 'noite-nobre', sample: 1000, roi: 25 }],
      byField: [{ range: 'medio', sample: 1000, roi: 25 }],
    });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.score).toBeGreaterThanOrEqual(GRADE_THRESHOLDS.S);
    expect(r.grade).toBe('S');
  });

  it('score 70-84 -> grade "A"', () => {
    const bundle = makeBundle({
      bySite: [{ site: 'Suprema', sample: 200, roi: 12, profit: 100 }],
      byBuyIn: [{ range: '$11-21.99', sample: 200, roi: 12 }],
      byCategory: [{ category: 'PKO', sample: 200, roi: 12 }],
      bySpeed: [{ speed: 'Turbo', sample: 200, roi: 12 }],
      byDayOfWeek: [{ dayOfWeek: 4, sample: 200, roi: 12 }],
      byTimeOfDay: [{ bucket: 'noite-nobre', sample: 200, roi: 12 }],
      byField: [{ range: 'medio', sample: 200, roi: 12 }],
    });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.score).toBeGreaterThanOrEqual(GRADE_THRESHOLDS.A);
    expect(r.score).toBeLessThan(GRADE_THRESHOLDS.S);
    expect(r.grade).toBe('A');
  });

  it('score 55-69 -> grade "B"', () => {
    const bundle = makeBundle({
      bySite: [{ site: 'Suprema', sample: 200, roi: 5, profit: 100 }],
      byBuyIn: [{ range: '$11-21.99', sample: 200, roi: 5 }],
      byCategory: [{ category: 'PKO', sample: 200, roi: 5 }],
      bySpeed: [{ speed: 'Turbo', sample: 200, roi: 5 }],
      byDayOfWeek: [{ dayOfWeek: 4, sample: 200, roi: 5 }],
      byTimeOfDay: [{ bucket: 'noite-nobre', sample: 200, roi: 5 }],
      byField: [{ range: 'medio', sample: 200, roi: 5 }],
    });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.score).toBeGreaterThanOrEqual(GRADE_THRESHOLDS.B);
    expect(r.score).toBeLessThan(GRADE_THRESHOLDS.A);
    expect(r.grade).toBe('B');
  });

  it('score 40-54 -> grade "C"', () => {
    const bundle = makeBundle({
      bySite: [{ site: 'Suprema', sample: 200, roi: -3, profit: -10 }],
      byBuyIn: [{ range: '$11-21.99', sample: 200, roi: -3 }],
      byCategory: [{ category: 'PKO', sample: 200, roi: -3 }],
      bySpeed: [{ speed: 'Turbo', sample: 200, roi: -3 }],
      byDayOfWeek: [{ dayOfWeek: 4, sample: 200, roi: -3 }],
      byTimeOfDay: [{ bucket: 'noite-nobre', sample: 200, roi: -3 }],
      byField: [{ range: 'medio', sample: 200, roi: -3 }],
    });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.score).toBeGreaterThanOrEqual(GRADE_THRESHOLDS.C);
    expect(r.score).toBeLessThan(GRADE_THRESHOLDS.B);
    expect(r.grade).toBe('C');
  });

  it('score < 40 -> grade "D"', () => {
    const bundle = makeBundle({
      bySite: [{ site: 'Suprema', sample: 200, roi: -25, profit: -1000 }],
      byBuyIn: [{ range: '$11-21.99', sample: 200, roi: -25 }],
      byCategory: [{ category: 'PKO', sample: 200, roi: -25 }],
      bySpeed: [{ speed: 'Turbo', sample: 200, roi: -25 }],
      byDayOfWeek: [{ dayOfWeek: 4, sample: 200, roi: -25 }],
      byTimeOfDay: [{ bucket: 'noite-nobre', sample: 200, roi: -25 }],
      byField: [{ range: 'medio', sample: 200, roi: -25 }],
    });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.score).toBeLessThan(GRADE_THRESHOLDS.C);
    expect(r.grade).toBe('D');
  });
});

// ===========================================================================
// Confidence
// ===========================================================================

describe('computeTournamentScore - confidence', () => {
  it('buyIn sample >= 30 e category sample >= 30 -> confidence "high"', () => {
    const bundle = makeBundle({
      byBuyIn: [{ range: '$11-21.99', sample: 50, roi: 10 }],
      byCategory: [{ category: 'PKO', sample: 40, roi: 10 }],
    });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.confidence).toBe('high');
  });

  it('apenas um bucket primario com sample >= 15 -> confidence "medium"', () => {
    const bundle = makeBundle({
      byBuyIn: [{ range: '$11-21.99', sample: 20, roi: 10 }],
      byCategory: [{ category: 'PKO', sample: 5, roi: 10 }],
    });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.confidence).toBe('medium');
  });

  it('ambos buckets primarios sample < 15 -> confidence "low"', () => {
    const bundle = makeBundle({
      byBuyIn: [{ range: '$11-21.99', sample: 5, roi: 10 }],
      byCategory: [{ category: 'PKO', sample: 3, roi: 10 }],
    });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.confidence).toBe('low');
  });
});

// ===========================================================================
// Cold start (Q5)
// ===========================================================================

describe('computeTournamentScore - cold start <20 (heuristica fixa Q5)', () => {
  // Tabela esperada (Q5):
  //   base = 50
  //   Speed Normal:+15  Turbo:+5  Hyper:-10
  //   Field medio:+10   pequeno:+5  massivo:-5  grande:0
  //   TimeOfDay noite-nobre:+5  outros:0
  //   madrugada e modelado como 0 (nao ha bonus negativo de turno na spec original)
  //
  // 12 combinacoes minimas (matriz Speed x Field x TimeOfDay):
  const COLD_START_CASES: Array<{
    speed: 'Normal' | 'Turbo' | 'Hyper';
    fieldBucket: 'pequeno' | 'medio' | 'grande' | 'massivo';
    timeOfDayBucket: 'madrugada' | 'manha' | 'tarde' | 'noite-cedo' | 'noite-nobre';
    expected: number;
  }> = [
    // Caso "topo" da spec: Normal + medio + nobre = 75
    { speed: 'Normal', fieldBucket: 'medio', timeOfDayBucket: 'noite-nobre', expected: 75 },
    // Caso "fundo" da spec: Hyper + massivo + madrugada = 25 (50 - 10 - 5 + 0 - 10 floor? sem; clamp)
    { speed: 'Hyper', fieldBucket: 'massivo', timeOfDayBucket: 'madrugada', expected: 25 },
    // Combinacoes intermediarias
    { speed: 'Normal', fieldBucket: 'pequeno', timeOfDayBucket: 'noite-nobre', expected: 75 }, // 50+15+5+5
    { speed: 'Normal', fieldBucket: 'grande', timeOfDayBucket: 'tarde', expected: 65 },        // 50+15+0+0
    { speed: 'Normal', fieldBucket: 'medio', timeOfDayBucket: 'manha', expected: 75 },         // 50+15+10+0
    { speed: 'Turbo', fieldBucket: 'medio', timeOfDayBucket: 'noite-nobre', expected: 70 },    // 50+5+10+5
    { speed: 'Turbo', fieldBucket: 'pequeno', timeOfDayBucket: 'tarde', expected: 60 },        // 50+5+5+0
    { speed: 'Turbo', fieldBucket: 'grande', timeOfDayBucket: 'noite-cedo', expected: 55 },    // 50+5+0+0
    { speed: 'Hyper', fieldBucket: 'medio', timeOfDayBucket: 'noite-nobre', expected: 55 },    // 50-10+10+5
    { speed: 'Hyper', fieldBucket: 'pequeno', timeOfDayBucket: 'tarde', expected: 45 },        // 50-10+5+0
    { speed: 'Hyper', fieldBucket: 'grande', timeOfDayBucket: 'manha', expected: 40 },         // 50-10+0+0
    { speed: 'Normal', fieldBucket: 'massivo', timeOfDayBucket: 'noite-nobre', expected: 65 }, // 50+15-5+5
  ];

  for (const tc of COLD_START_CASES) {
    it(`Speed=${tc.speed} Field=${tc.fieldBucket} TimeOfDay=${tc.timeOfDayBucket} -> score ${tc.expected}`, () => {
      const bundle = makeBundle({ totalTournaments: 5, lookbackTournaments: 5, bySite: [], byBuyIn: [], byCategory: [], bySpeed: [], byDayOfWeek: [], byTimeOfDay: [], byField: [] });
      const t = makeTournament({
        speed: tc.speed,
        fieldBucket: tc.fieldBucket,
        timeOfDayBucket: tc.timeOfDayBucket,
      });
      const r = computeTournamentScore(t, bundle);
      expect(r.score).toBe(tc.expected);
    });
  }

  it('cold start <20 marca confidence="low" sempre', () => {
    const bundle = makeBundle({ totalTournaments: 10 });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.confidence).toBe('low');
  });

  it('cold start <20 retorna rationale fixo', () => {
    const bundle = makeBundle({ totalTournaments: 10 });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.rationale.toLowerCase()).toContain('importe');
  });

  it('totalTournaments=0 -> usa heuristica e retorna score [0,100]', () => {
    const bundle = makeBundle({ totalTournaments: 0, lookbackTournaments: 0 });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('totalTournaments=19 -> ainda usa cold start pure', () => {
    const bundle = makeBundle({ totalTournaments: 19 });
    const r = computeTournamentScore(makeTournament(), bundle);
    // Esperamos rationale "Score generico — importe..." (heuristica fixa)
    expect(r.rationale.toLowerCase()).toContain('importe');
  });
});

describe('computeTournamentScore - cold start parcial 20-49', () => {
  it('totalTournaments=20 -> usa algoritmo full + warning low_sample', () => {
    const bundle = makeBundle({
      totalTournaments: 20,
      lookbackTournaments: 20,
      byBuyIn: [{ range: '$11-21.99', sample: 5, roi: 10 }],
      byCategory: [{ category: 'PKO', sample: 5, roi: 10 }],
    });
    const r = computeTournamentScore(makeTournament(), bundle);
    // Algoritmo full roda: rationale NAO contem "importe pelo menos 50" fixo
    // Mas confidence sera "low" porque os buckets primarios sample<15
    expect(r.confidence).toBe('low');
    expect(r.warnings).toContain('low_sample');
  });

  it('totalTournaments=49 -> ainda em modo parcial (algoritmo full)', () => {
    const bundle = makeBundle({
      totalTournaments: 49,
      lookbackTournaments: 49,
      byBuyIn: [{ range: '$11-21.99', sample: 30, roi: 12 }],
      byCategory: [{ category: 'PKO', sample: 30, roi: 12 }],
    });
    const r = computeTournamentScore(makeTournament(), bundle);
    // Confidence pode ser high (sample suficiente nos buckets primarios), mas o flag de cold start parcial
    // deve ser visivel via lowConfidence (responsabilidade do scorer expor flag, nao apenas confidence)
    expect(r.score).toBeGreaterThan(0);
  });

  it('boundary: totalTournaments=50 -> NAO retorna rationale fixo de cold start', () => {
    const bundle = makeBundle({ totalTournaments: 50, lookbackTournaments: 50 });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.rationale.toLowerCase()).not.toContain('importe pelo menos 50');
  });
});

// ===========================================================================
// Warnings
// ===========================================================================

describe('computeTournamentScore - warnings', () => {
  it('confidence "low" -> warning "low_sample"', () => {
    const bundle = makeBundle({
      byBuyIn: [{ range: '$11-21.99', sample: 5, roi: 10 }],
      byCategory: [{ category: 'PKO', sample: 5, roi: 10 }],
    });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.warnings).toContain('low_sample');
  });

  it('site sample < 10 -> warning "unfamiliar_site"', () => {
    const bundle = makeBundle({
      bySite: [{ site: 'Suprema', sample: 5, roi: 10, profit: 50 }],
    });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.warnings).toContain('unfamiliar_site');
  });

  it('category sample == 0 (sem dados na categoria) -> warning "never_played_category"', () => {
    const bundle = makeBundle({
      byCategory: [{ category: 'Vanilla', sample: 200, roi: 5 }],
    });
    const t = makeTournament({ category: 'PKO' }); // PKO nao esta no bundle
    const r = computeTournamentScore(t, bundle);
    expect(r.warnings).toContain('never_played_category');
  });

  it('confidence high + site conhecido + category jogada -> warnings vazias', () => {
    const r = computeTournamentScore(makeTournament(), makeBundle());
    expect(r.warnings).not.toContain('low_sample');
    expect(r.warnings).not.toContain('unfamiliar_site');
    expect(r.warnings).not.toContain('never_played_category');
  });
});

// ===========================================================================
// Sinais sample/roi/value preenchidos
// ===========================================================================

describe('computeTournamentScore - sinais detalhados', () => {
  it('signal.value reflete o ROI bruto bruto do bucket (nao normalizado)', () => {
    const bundle = makeBundle({
      byCategory: [{ category: 'PKO', sample: 87, roi: 18.1 }],
    });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.signals.categoryRoi.value).toBeCloseTo(18.1, 5);
    expect(r.signals.categoryRoi.sample).toBe(87);
  });

  it('signal sem match no bundle: value=0, sample=0, score=50 (apos shrinkage com prior)', () => {
    const bundle = makeBundle({ bySite: [] });
    const r = computeTournamentScore(makeTournament(), bundle);
    expect(r.signals.siteRoi.sample).toBe(0);
    expect(r.signals.siteRoi.score).toBe(50);
  });
});

// ===========================================================================
// Performance benchmark
// ===========================================================================

describe('computeTournamentScore - performance', () => {
  it('roda em menos de 2ms por torneio (benchmark)', () => {
    const bundle = makeBundle();
    const t = makeTournament();
    // warm-up
    for (let i = 0; i < 10; i++) computeTournamentScore(t, bundle);
    const N = 200;
    const start = performance.now();
    for (let i = 0; i < N; i++) computeTournamentScore(t, bundle);
    const elapsed = performance.now() - start;
    const perCall = elapsed / N;
    expect(perCall).toBeLessThan(2);
  });
});

// ===========================================================================
// Sanity check em constants
// ===========================================================================

describe('computeTournamentScore - integracao com constants', () => {
  it('SHRINK_CONSTANT do modulo == 30 (per spec)', () => {
    expect(SHRINK_CONSTANT).toBe(30);
  });

  it('COLD_START_PURE_THRESHOLD == 20 (Q5)', () => {
    expect(COLD_START_PURE_THRESHOLD).toBe(20);
  });

  it('COLD_START_PARTIAL_THRESHOLD == 50', () => {
    expect(COLD_START_PARTIAL_THRESHOLD).toBe(50);
  });
});
