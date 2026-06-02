import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Sprint Fase C #10 — storage.getMentalResultInsights
//
// Spec: Docs/specs/sprint-fase-c-10-mental-resultado-2026-06-02.md (RF-01/02/03/05)
// ADR : Docs/architecture/decisions/233-fase-c-10-mental-result-insights.md (D-1/D-2/D-3)
//
// Status RED: storage.getMentalResultInsights NAO existe ainda. Implementer
// (ADR D-2): 1 scan grind_sessions (eq userId + status completed + date>=cutoff)
// + 1 scan cooldown_logs por sessionIds + 1 scan opcional break_feedbacks por
// sessionIds; FX 1x; monta SessionPnlRow[] e chama o helper puro.
//
// Mock db roteado por TABELA (.from(table)) — espelha
// fase-b-warmup-compliance-storage.test.ts (lesson #3 shape real do scan).
//
// SHAPE REAL (verificado em shared/schema.ts):
//   grind_sessions:  { id, status, date, profit (decimal=string), focoMedio (decimal=string|null) }
//                    NAO tem currency/pnlNative — tests injetam via mock; helper
//                    de P&L faz `Number(row.pnlNative ?? profit ?? profitLoss ?? 0)`.
//   cooldown_logs:   { sessionId, completedAt, tiltSelfAssessment jsonb
//                      {feltTilt,keptTilting,tiltType,action}, abGameAnswers jsonb
//                      {aGame[],bGame[],cGame,lesson} }
//   break_feedbacks: { sessionId, foco (int 0-10) }
//
// FX: storage importa { FALLBACK_FX_RATES, convertToUSD, resolveExchangeRates }
//   de ./services/fxResolver (padrao getVarianceVsExpected storage.ts:13297).
//   resolveExchangeRates -> { rates: Record<string,number> } (lesson #3 shape).
//
// Lessons: #3 (shape real), #6 (FX->USD), #9 (console.warn antes do fallback),
//   #36 (drizzle-orm parcial precisa relations), #30 (.test.ts = node).
// =============================================================================

vi.mock('drizzle-orm', async () => {
  const actual: any = await vi.importActual('drizzle-orm');
  return { ...actual, relations: actual.relations ?? vi.fn(() => ({})) };
});

// FX resolver mockado (shape igual ao consumido por getVarianceVsExpected).
const fxState = vi.hoisted(() => ({
  // rates: USD=1; valores nativos / rate -> USD. Ex BRL 5 => 100 BRL = 20 USD.
  rates: { USD: 1, BRL: 5, EUR: 0.9 } as Record<string, number>,
  // simula falha do resolver (forca fallback + warn — lesson #9)
  throwOnResolve: false,
}));

vi.mock('../../../server/services/fxResolver', () => ({
  FALLBACK_FX_RATES: { USD: 1, BRL: 5, EUR: 0.9 },
  // converte nativo -> USD dividindo pela rate (USD por unidade nativa = 1/rate)
  convertToUSD: (amount: number, currency: string, rates: Record<string, number>) => {
    const rate = rates?.[currency];
    if (currency === 'USD') return amount;
    if (typeof rate !== 'number' || rate === 0) return amount; // sem cotacao -> nativo (lesson #6)
    return amount / rate;
  },
  resolveExchangeRates: vi.fn(async (_userId: string) => {
    if (fxState.throwOnResolve) throw new Error('fx down');
    return { rates: fxState.rates };
  }),
}));

// ---------------------------------------------------------------------------
// Mock db roteado por tabela
// ---------------------------------------------------------------------------
type Row = Record<string, any>;

const dbState = vi.hoisted(() => ({
  grindRows: [] as Row[],
  cooldownRows: [] as Row[],
  breakRows: [] as Row[],
  currentTable: null as null | 'grind' | 'cooldown' | 'break' | 'other',
  currentSelectShape: null as null | Record<string, any>,
}));

function classifyTable(arg: any): 'grind' | 'cooldown' | 'break' | 'other' {
  const s = String(
    arg?.[Symbol.for?.('drizzle:Name')] ??
      arg?._?.name ??
      arg?.tableName ??
      arg?.name ??
      JSON.stringify(Object.keys(arg ?? {})),
  ).toLowerCase();
  if (s.includes('grind')) return 'grind';
  if (s.includes('cooldown')) return 'cooldown';
  if (s.includes('break')) return 'break';
  // fallback por colunas conhecidas
  if (arg?.tiltSelfAssessment || arg?.abGameAnswers || arg?.completedAt) return 'cooldown';
  if (arg?.foco) return 'break';
  if (arg?.profit || arg?.focoMedio || (arg?.status && arg?.date)) return 'grind';
  return 'other';
}

vi.mock('../../../server/db', () => {
  const make = () => vi.fn(() => chain);
  const chain: any = {};
  chain.select = vi.fn((shape?: any) => {
    dbState.currentSelectShape = shape ?? null;
    return chain;
  });
  chain.from = vi.fn((table: any) => {
    dbState.currentTable = classifyTable(table);
    return chain;
  });
  chain.where = make();
  chain.groupBy = make();
  chain.orderBy = make();
  chain.limit = make();
  chain.offset = make();
  chain.innerJoin = make();
  chain.leftJoin = make();
  chain.then = (resolve: any) => {
    const table = dbState.currentTable;
    let rows: Row[] = [];
    if (table === 'grind') rows = dbState.grindRows;
    else if (table === 'cooldown') rows = dbState.cooldownRows;
    else if (table === 'break') rows = dbState.breakRows;
    dbState.currentTable = null;
    dbState.currentSelectShape = null;
    return Promise.resolve(rows).then(resolve);
  };
  return { db: chain, pool: {} };
});

import { storage } from '../../../server/storage';

// --- builders de row (shape REAL) -----------------------------------------

function grind(
  id: string,
  profit: number | string | null,
  opts: { focoMedio?: number | string | null; currency?: string; pnlNative?: number | string } = {},
): Row {
  const row: Row = { id, status: 'completed', date: new Date('2026-05-15'), profit };
  if (opts.focoMedio !== undefined) row.focoMedio = opts.focoMedio;
  if (opts.currency !== undefined) row.currency = opts.currency;
  if (opts.pnlNative !== undefined) row.pnlNative = opts.pnlNative;
  return row;
}

function cooldown(
  sessionId: string,
  opts: {
    tilt?: Partial<{ feltTilt: number; keptTilting: number; tiltType: string | null; action: string }> | null;
    ab?: Partial<{ aGame: any; bGame: any; cGame: string; lesson: string }> | null;
  } = {},
): Row {
  return {
    sessionId,
    completedAt: new Date('2026-05-15'),
    tiltSelfAssessment: opts.tilt === undefined ? null : opts.tilt,
    abGameAnswers: opts.ab === undefined ? null : opts.ab,
  };
}

function brk(sessionId: string, foco: number): Row {
  return { sessionId, foco };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.grindRows = [];
  dbState.cooldownRows = [];
  dbState.breakRows = [];
  dbState.currentTable = null;
  dbState.currentSelectShape = null;
  fxState.rates = { USD: 1, BRL: 5, EUR: 0.9 };
  fxState.throwOnResolve = false;
});

// ===========================================================================
// Shape / existencia
// ===========================================================================

describe('storage.getMentalResultInsights — shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.getMentalResultInsights).toBe('function');
  });

  it('janela vazia -> tilt/focus/abgame com baseline n=0 e dataSufficiency low', async () => {
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out).toHaveProperty('tilt');
    expect(out).toHaveProperty('focus');
    expect(out).toHaveProperty('abgame');
    expect(out.tilt.baseline.n).toBe(0);
    expect(out.tilt.baseline.avgPnlUsd).toBeNull();
    expect(out.tilt.dataSufficiency).toBe('low');
  });

  it.each(['7d', '30d', '90d'] as const)('period=%s ecoa', async (p) => {
    const out = await storage.getMentalResultInsights('USER-0001', p);
    expect(out.tilt.period).toBe(p);
    expect(out.focus.period).toBe(p);
    expect(out.abgame.period).toBe(p);
  });
});

// ===========================================================================
// Baseline — todas as sessoes completed do periodo
// ===========================================================================

describe('storage.getMentalResultInsights — baseline', () => {
  it('baseline conta TODAS as sessoes completed (com ou sem sinal mental)', async () => {
    dbState.grindRows = [
      grind('s1', '10'),
      grind('s2', '20'),
      grind('s3', '30'),
      grind('s4', '-60'),
    ];
    // sem cooldown / sem break -> nenhum bucket, so baseline
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.tilt.baseline.n).toBe(4);
    // (10+20+30-60)/4 = 0
    expect(out.tilt.baseline.avgPnlUsd).toBeCloseTo(0, 6);
    expect(out.focus.baseline.n).toBe(4);
    expect(out.abgame.baseline.n).toBe(4);
  });

  it('profit decimal como string "-40.00" eh parseado via Number (lesson #3)', async () => {
    dbState.grindRows = [grind('s1', '-40.00'), grind('s2', '-40.00')];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.tilt.baseline.avgPnlUsd).toBeCloseTo(-40, 6);
  });

  it('profit null -> pnlUsd 0 (nao NaN); entra no conjunto com 0', async () => {
    dbState.grindRows = [grind('s1', null), grind('s2', '20')];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.tilt.baseline.n).toBe(2);
    // (0 + 20)/2 = 10
    expect(out.tilt.baseline.avgPnlUsd).toBeCloseTo(10, 6);
    expect(Number.isNaN(out.tilt.baseline.avgPnlUsd as number)).toBe(false);
  });

  it('profit "0" (string) -> 0, distinto de null (ambos = 0 numerico, sem NaN)', async () => {
    dbState.grindRows = [grind('s1', '0'), grind('s2', null)];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.tilt.baseline.avgPnlUsd).toBeCloseTo(0, 6);
  });
});

// ===========================================================================
// FX -> USD (lesson #6) + log antes do fallback (lesson #9)
// ===========================================================================

describe('storage.getMentalResultInsights — FX (lessons #6/#9)', () => {
  it('converte profit nativo (BRL) para USD usando a cotacao resolvida', async () => {
    // pnlNative 100 BRL com rate 5 -> 20 USD
    dbState.grindRows = [
      grind('s1', '0', { currency: 'BRL', pnlNative: '100' }),
      grind('s2', '0', { currency: 'BRL', pnlNative: '100' }),
    ];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.tilt.baseline.avgPnlUsd).toBeCloseTo(20, 6);
  });

  it('resolveExchangeRates lancando -> console.warn ANTES do fallback, sem crash (lesson #9)', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fxState.throwOnResolve = true;
    dbState.grindRows = [grind('s1', '0', { currency: 'BRL', pnlNative: '100' })];

    const out = await storage.getMentalResultInsights('USER-0001', '30d');

    // fallback FALLBACK_FX_RATES (BRL 5) -> 100/5 = 20 USD; nunca 500
    expect(out.tilt.baseline.avgPnlUsd).toBeCloseTo(20, 6);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('moeda sem cotacao (currency exotica) cai para nativo->USD sem zerar (lesson #6)', async () => {
    fxState.rates = { USD: 1 }; // sem CNY
    dbState.grindRows = [grind('s1', '0', { currency: 'CNY', pnlNative: '50' })];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    // convertToUSD do mock devolve o nativo quando nao ha rate -> 50
    expect(out.tilt.baseline.avgPnlUsd).toBeCloseTo(50, 6);
  });
});

// ===========================================================================
// TILT bucket — RF-01 (join cooldown_logs por sessionId)
// ===========================================================================

describe('storage.getMentalResultInsights — tilt (RF-01)', () => {
  it('sessao com tiltType explicito + tilt declarado vira bucket; baseline inclui todas', async () => {
    dbState.grindRows = [
      grind('s1', '-40'),
      grind('s2', '-40'),
      grind('s3', '-40'),
      grind('s4', '-40'),
      grind('s5', '20'),
      grind('s6', '20'),
      grind('s7', '20'),
      grind('s8', '20'),
    ];
    dbState.cooldownRows = [
      cooldown('s1', { tilt: { feltTilt: 7, keptTilting: 3, tiltType: 'injustice', action: 'segredo' } }),
      cooldown('s2', { tilt: { feltTilt: 7, keptTilting: 3, tiltType: 'injustice', action: 'segredo' } }),
      cooldown('s3', { tilt: { feltTilt: 7, keptTilting: 3, tiltType: 'injustice', action: 'segredo' } }),
      cooldown('s4', { tilt: { feltTilt: 7, keptTilting: 3, tiltType: 'injustice', action: 'segredo' } }),
    ];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');

    const inj = out.tilt.buckets.find((b: any) => b.key === 'injustice');
    expect(inj).toBeTruthy();
    expect(inj!.n).toBe(4);
    expect(inj!.avgPnlUsd).toBeCloseTo(-40, 6);
    expect(out.tilt.baseline.n).toBe(8);
    // baseline avg = (4*-40 + 4*20)/8 = -10 -> delta = -40-(-10) = -30
    expect(inj!.deltaVsBaseline).toBeCloseTo(-30, 6);
  });

  it('cooldown sem tiltType explicito -> sessao so no baseline, fora de bucket de tilt', async () => {
    dbState.grindRows = [grind('s1', '-40'), grind('s2', '10')];
    dbState.cooldownRows = [
      // tilt declarado mas SEM tiltType (legado) -> nao bucketiza (D-4)
      cooldown('s1', { tilt: { feltTilt: 6, keptTilting: 2, action: 'x' } }),
    ];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    // nenhum bucket de tilt com n>0
    const nonEmpty = out.tilt.buckets.filter((b: any) => b.n > 0);
    expect(nonEmpty).toEqual([]);
    // mas baseline conta as 2
    expect(out.tilt.baseline.n).toBe(2);
  });

  it('feltTilt=0 && keptTilting=0 (sem tilt declarado) NAO bucketiza mesmo com tiltType', async () => {
    dbState.grindRows = [grind('s1', '-40'), grind('s2', '10')];
    dbState.cooldownRows = [
      cooldown('s1', { tilt: { feltTilt: 0, keptTilting: 0, tiltType: 'injustice' } }),
    ];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    const nonEmpty = out.tilt.buckets.filter((b: any) => b.n > 0);
    expect(nonEmpty).toEqual([]);
    expect(out.tilt.baseline.n).toBe(2);
  });

  it('tiltType invalido (corrompido) NAO bucketiza', async () => {
    dbState.grindRows = [grind('s1', '-40')];
    dbState.cooldownRows = [
      cooldown('s1', { tilt: { feltTilt: 6, keptTilting: 2, tiltType: 'lixo_invalido' } }),
    ];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    const nonEmpty = out.tilt.buckets.filter((b: any) => b.n > 0);
    expect(nonEmpty).toEqual([]);
  });

  it('sessao sem cooldown_log -> so baseline, fora de tilt', async () => {
    dbState.grindRows = [grind('s1', '-40'), grind('s2', '10')];
    dbState.cooldownRows = []; // nenhum cooldown
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.tilt.baseline.n).toBe(2);
    expect(out.tilt.buckets.filter((b: any) => b.n > 0)).toEqual([]);
  });
});

// ===========================================================================
// FOCUS bucket — RF-02 (focoMedio OU break_feedbacks)
// ===========================================================================

describe('storage.getMentalResultInsights — focus (RF-02)', () => {
  it('usa focoMedio (decimal string) quando finito', async () => {
    dbState.grindRows = [
      grind('s1', '30', { focoMedio: '9' }),   // alto
      grind('s2', '10', { focoMedio: '6' }),   // medio
      grind('s3', '-20', { focoMedio: '2' }),  // baixo
    ];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.focus.buckets.find((b: any) => b.key === 'alto')!.n).toBe(1);
    expect(out.focus.buckets.find((b: any) => b.key === 'medio')!.n).toBe(1);
    expect(out.focus.buckets.find((b: any) => b.key === 'baixo')!.n).toBe(1);
  });

  it('focoMedio = "0" (string decimal valida) -> bucket baixo (NAO ausente)', async () => {
    dbState.grindRows = [grind('s1', '10', { focoMedio: '0' })];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.focus.buckets.find((b: any) => b.key === 'baixo')!.n).toBe(1);
  });

  it('focoMedio null -> cai para media de break_feedbacks.foco da sessao', async () => {
    dbState.grindRows = [grind('s1', '10', { focoMedio: null })];
    // media foco = (8+8)/2 = 8 -> alto
    dbState.breakRows = [brk('s1', 8), brk('s1', 8)];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.focus.buckets.find((b: any) => b.key === 'alto')!.n).toBe(1);
  });

  it('focoMedio ausente E sem break_feedbacks -> sessao fora dos buckets de foco mas no baseline', async () => {
    dbState.grindRows = [grind('s1', '10', { focoMedio: null }), grind('s2', '20', { focoMedio: null })];
    dbState.breakRows = [];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    const focusBucketed = out.focus.buckets.reduce((a: number, b: any) => a + b.n, 0);
    expect(focusBucketed).toBe(0);
    expect(out.focus.baseline.n).toBe(2);
  });

  it('os 3 buckets de foco sempre presentes na ordem fixa (lesson #8)', async () => {
    dbState.grindRows = [grind('s1', '10', { focoMedio: '6' })];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.focus.buckets.map((b: any) => b.key)).toEqual(['alto', 'medio', 'baixo']);
  });
});

// ===========================================================================
// ABGAME bucket — RF-03 (countItems + prioridade bc_present)
// ===========================================================================

describe('storage.getMentalResultInsights — abgame (RF-03)', () => {
  it('aGame predominante e sem C -> a_dominant', async () => {
    dbState.grindRows = [grind('s1', '40')];
    dbState.cooldownRows = [
      cooldown('s1', { ab: { aGame: ['foco', 'paciencia', 'leitura'], bGame: [], cGame: '', lesson: '' } }),
    ];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.abgame.buckets.find((b: any) => b.key === 'a_dominant')!.n).toBe(1);
    expect(out.abgame.buckets.find((b: any) => b.key === 'bc_present')!.n).toBe(0);
  });

  it('PRIORIDADE: aCount=3 bCount=1 -> bc_present (B-game presente domina)', async () => {
    dbState.grindRows = [grind('s1', '-20')];
    dbState.cooldownRows = [
      cooldown('s1', { ab: { aGame: ['a', 'b', 'c'], bGame: ['ruim'], cGame: '', lesson: '' } }),
    ];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.abgame.buckets.find((b: any) => b.key === 'bc_present')!.n).toBe(1);
    expect(out.abgame.buckets.find((b: any) => b.key === 'a_dominant')!.n).toBe(0);
  });

  it('cGame presente (sem bGame) -> bc_present', async () => {
    dbState.grindRows = [grind('s1', '-10')];
    dbState.cooldownRows = [
      cooldown('s1', { ab: { aGame: ['x', 'y'], bGame: [], cGame: 'joguei desesperado', lesson: '' } }),
    ];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.abgame.buckets.find((b: any) => b.key === 'bc_present')!.n).toBe(1);
  });

  it('journal totalmente vazio -> fora dos buckets, so no baseline', async () => {
    dbState.grindRows = [grind('s1', '10'), grind('s2', '20')];
    dbState.cooldownRows = [
      cooldown('s1', { ab: { aGame: [], bGame: [], cGame: '', lesson: '' } }),
    ];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    const bucketed = out.abgame.buckets.reduce((a: number, b: any) => a + b.n, 0);
    expect(bucketed).toBe(0);
    expect(out.abgame.baseline.n).toBe(2);
  });

  it('aGame NAO-array (lixo) conta 0 itens, sem quebrar (lesson #11)', async () => {
    dbState.grindRows = [grind('s1', '10')];
    dbState.cooldownRows = [
      cooldown('s1', { ab: { aGame: 'nao-array' as any, bGame: [], cGame: '', lesson: '' } }),
    ];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    // aCount=0 -> nao a_dominant; sem b/c -> nao bc_present -> fora dos buckets
    const bucketed = out.abgame.buckets.reduce((a: number, b: any) => a + b.n, 0);
    expect(bucketed).toBe(0);
    expect(out.abgame.baseline.n).toBe(1);
  });

  it('abGameAnswers null -> sessao so no baseline', async () => {
    dbState.grindRows = [grind('s1', '10')];
    dbState.cooldownRows = [cooldown('s1', { ab: null })];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.abgame.buckets.reduce((a: number, b: any) => a + b.n, 0)).toBe(0);
    expect(out.abgame.baseline.n).toBe(1);
  });
});

// ===========================================================================
// PII (D5) — texto livre NUNCA na resposta
// ===========================================================================

describe('storage.getMentalResultInsights — PII (D5)', () => {
  it('action do tilt e cGame/lesson do journal NUNCA aparecem na resposta serializada', async () => {
    const segredoTilt = 'tomei tilt depois da bad beat na bolha do high roller';
    const segredoC = 'joguei desesperado para recuperar o dia inteiro';
    const segredoLesson = 'preciso parar de fazer late reg fora do schedule';
    dbState.grindRows = [grind('s1', '-40'), grind('s2', '-30')];
    dbState.cooldownRows = [
      cooldown('s1', {
        tilt: { feltTilt: 8, keptTilting: 6, tiltType: 'injustice', action: segredoTilt },
        ab: { aGame: ['x'], bGame: ['y'], cGame: segredoC, lesson: segredoLesson },
      }),
    ];

    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    const serialized = JSON.stringify(out);

    expect(serialized).not.toContain(segredoTilt);
    expect(serialized).not.toContain(segredoC);
    expect(serialized).not.toContain(segredoLesson);
    expect(serialized).not.toContain('action');
    expect(serialized).not.toContain('cGame');
    expect(serialized).not.toContain('lesson');
  });
});

// ===========================================================================
// dataSufficiency — limiares MIN_SESSIONS_OVERALL / MIN_SESSIONS_PER_BUCKET
// ===========================================================================

describe('storage.getMentalResultInsights — dataSufficiency', () => {
  it('baseline.n < 8 -> set low; bucket.n < 4 -> bucket low', async () => {
    dbState.grindRows = [grind('s1', '-40'), grind('s2', '-40')];
    dbState.cooldownRows = [
      cooldown('s1', { tilt: { feltTilt: 6, keptTilting: 1, tiltType: 'revenge' } }),
      cooldown('s2', { tilt: { feltTilt: 6, keptTilting: 1, tiltType: 'revenge' } }),
    ];
    const out = await storage.getMentalResultInsights('USER-0001', '30d');
    expect(out.tilt.dataSufficiency).toBe('low'); // baseline.n=2 < 8
    const rev = out.tilt.buckets.find((b: any) => b.key === 'revenge')!;
    expect(rev.n).toBe(2);
    expect(rev.dataSufficiency).toBe('low'); // < 4
  });
});

// ===========================================================================
// Ownership — userId repassado a toda query
// ===========================================================================

describe('storage.getMentalResultInsights — ownership', () => {
  it('nao quebra quando o user nao tem nenhuma sessao (datasets vazios)', async () => {
    const out = await storage.getMentalResultInsights('USER-SEM-NADA', '30d');
    expect(out.tilt.baseline.n).toBe(0);
    expect(out.focus.baseline.n).toBe(0);
    expect(out.abgame.baseline.n).toBe(0);
  });
});
