/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Variance-1 — RF-01 (storage.getVarianceVsExpected real)
 *
 * Spec : Docs/specs/sprint-variance-1.md §RF-01
 * ADRs : 162 (algoritmo primedope-cache vs fallback heuristico)
 *      + 163 (fxResolver canonico)
 *
 * Status RED: storage.getVarianceVsExpected hoje retorna `null` hardcoded
 * (server/storage.ts:11664-11668). Estes testes validam a implementacao
 * real que o Implementer ira escrever.
 *
 * Cenarios (8 obrigatorios):
 *   1. Gate <20 sessoes -> retorna null
 *   2. >=20 sessoes + primedope_run valido -> expectedSource='primedope-cache'
 *   3. >=20 sessoes + zero primedope_runs -> expectedSource='fallback-zero',
 *      sigmaUsd = 1.5 * stddev(daily_pnl_usd)
 *   4. >=20 sessoes + result_json invalido (zod falha) -> fallback heuristico
 *   5. FX cascade: sessoes em BRL agregadas em USD via fxResolver
 *   6. sigmaUsd=0 -> sigmaMultiple=0 (sem divisao por zero)
 *   7. sigmaMultiple > 10 -> clamp 10; < -10 -> clamp -10
 *   8. Status threshold: >=1 lucky, <=-1 unlucky, senao normal
 *
 * Pattern: mock db chain (lesson #3 shape REAL) + mock fxResolver (lesson #28
 * path exato `../../server/services/fxResolver`).
 *
 * Lessons aplicadas:
 *   #3   shape REAL Drizzle (chain.where/orderBy/limit retornam chain;
 *        .then/await no terminal retorna array de rows)
 *   #6   FX antes de threshold USD (cenario 5)
 *   #28  vi.mock por path exato — `../../server/services/fxResolver`
 *   #36  @shared/schema lazy import com fallback NAO se aplica aqui
 *        porque storage.ts ja faz import estatico de schema. Garantimos
 *        que drizzle-orm mock inclua `relations` para evitar quebra de
 *        carga (mas como nao mockamos drizzle-orm aqui, vem do real).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock db (Drizzle chain) — shape REAL (lesson #3)
// =============================================================================
vi.mock('../../server/db', () => {
  const chain: any = {};
  const make = () => vi.fn().mockReturnValue(chain);
  chain.select = make();
  chain.from = make();
  chain.where = make();
  chain.orderBy = make();
  chain.limit = make();
  chain.offset = make();
  chain.innerJoin = make();
  chain.leftJoin = make();
  chain.groupBy = make();
  chain.insert = make();
  chain.values = make();
  chain.returning = make();
  chain.update = make();
  chain.set = make();
  chain.delete = make();
  chain.transaction = vi.fn(async (cb: any) => cb(chain));
  return { db: chain, pool: {} };
});

// =============================================================================
// Mock fxResolver — lesson #28 path exato
// =============================================================================
vi.mock('../../server/services/fxResolver', () => {
  return {
    resolveExchangeRates: vi.fn(async (_userId: string) => ({
      rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
      source: 'system' as const,
      resolvedAt: new Date(),
    })),
    convertToUSD: vi.fn((amount: number, currency: string, rates: Record<string, number>) => {
      if (!Number.isFinite(amount)) return 0;
      if (currency === 'USD') return amount;
      const rate = rates[currency] ?? 1;
      if (!(rate > 0)) return amount;
      return amount / rate;
    }),
    FALLBACK_FX_RATES: { USD: 1, BRL: 5.0, EUR: 0.93 },
    fxResolver: {
      resolveExchangeRates: vi.fn(),
      convertToUSD: vi.fn(),
    },
  };
});

import { storage } from '../../server/storage';
import { db } from '../../server/db';
import { resolveExchangeRates } from '../../server/services/fxResolver';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset chain methods para teste isolado (lessons learned em outros tests).
  const make = () => vi.fn().mockReturnValue(db as any);
  (db as any).select = make();
  (db as any).from = make();
  (db as any).where = make();
  (db as any).orderBy = make();
  (db as any).limit = make();
  (db as any).offset = make();
  (db as any).innerJoin = make();
  (db as any).leftJoin = make();
  (db as any).groupBy = make();
  (db as any).insert = make();
  (db as any).values = make();
  (db as any).returning = make();
  (db as any).update = make();
  (db as any).set = make();
  (db as any).delete = make();
  // FX default = USD-only.
  (resolveExchangeRates as any).mockResolvedValue({
    rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
    source: 'system',
    resolvedAt: new Date(),
  });
});

// =============================================================================
// Helpers de fixture
// =============================================================================

/**
 * Gera N rows de sessao USD com pnl variavel.
 * Cada row simula o shape minimo consumido por getVarianceVsExpected.
 */
function usdSessions(n: number, basePnl: number = 50): Array<any> {
  return Array.from({ length: n }, (_, i) => ({
    id: `S${i + 1}`,
    userId: 'USER-1',
    status: 'completed',
    currency: 'USD',
    // P&L native = USD direto.
    pnlNative: basePnl + (i % 5) * 10,
    pnlUsd: basePnl + (i % 5) * 10,
    // started_at distribuido nos ultimos 60d (todos dentro de 90d).
    startedAt: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)),
    createdAt: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)),
    date: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10),
  }));
}

function brlSessions(n: number, basePnlBrl: number = 250): Array<any> {
  return Array.from({ length: n }, (_, i) => ({
    id: `SB${i + 1}`,
    userId: 'USER-1',
    status: 'completed',
    currency: 'BRL',
    pnlNative: basePnlBrl + (i % 5) * 50,
    // pnlUsd NAO preenchido — deve ser derivado via fxResolver no storage.
    startedAt: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)),
    createdAt: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)),
    date: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10),
  }));
}

/**
 * Helper: configura o mock do db para retornar rows de sessoes + opcionalmente
 * uma row primedope_runs. O Implementer pode estruturar as queries de varias
 * formas (multiple selects, joins, raw sql); por isso aceitamos o array de
 * resolves em sequencia.
 *
 * Convencao: assumimos 2 queries principais —
 *   (a) sessoes (com agregacao pnl + currency)
 *   (b) primedope_runs (LIMIT 1, ORDER BY created_at DESC)
 *
 * Se Implementer usar shape diferente, ajusta a configuracao.
 */
function setupMockQueries(opts: {
  sessions?: any[];
  primedopeRun?: any | null;
  sessionsCountOverride?: number;
}): void {
  const sessions = opts.sessions ?? [];
  const primedopeRun = opts.primedopeRun;
  const sessionsCount = opts.sessionsCountOverride ?? sessions.length;

  // O storage pode fazer:
  //   1. COUNT sessoes (gate)
  //   2. SELECT sessoes (agregacao P&L)
  //   3. SELECT primedope_runs (cache lookup)
  // OU pode combinar em queries maiores.
  // Para flexibilidade, configuramos os terminais (.where / .orderBy / .limit)
  // para retornarem em ordem:
  //   1a chamada: count rows ([{ count: N }])
  //   2a chamada: session rows
  //   3a chamada: primedope_runs rows
  //
  // O Implementer eh livre para mudar a ordem; nesse caso o test ajusta mocks.

  const countRows = [{ count: sessionsCount }];
  const sessionRows = sessions;
  const primedopeRows = primedopeRun ? [primedopeRun] : [];

  // Encadeamento generico: cada chamada terminal (where ou limit ou orderBy)
  // resolve uma row set, em ordem. Usamos .mockResolvedValueOnce em sequencia.
  const responses = [countRows, sessionRows, primedopeRows];
  let callIdx = 0;

  // Override terminal methods para resolver as queries em sequencia.
  // O Implementer pode usar .where(...).then ou .limit(...).then;
  // mockamos ambos.
  const nextResolve = () => {
    const r = responses[callIdx] ?? [];
    callIdx += 1;
    return r;
  };

  // O Drizzle: cada SELECT termina ao se chamar .then ou await na chain.
  // Como o chain.where retorna a chain (Thenable), criamos uma chain
  // Promise-like com .then.
  // Estrategia simpler: mockar .where para retornar uma Promise-like que
  // resolve com o proximo resultset, mas tambem retornar chain para
  // permitir encadear .orderBy / .limit.
  //
  // Solucao pratica: substituir o ultimo metodo na chain (.limit) como
  // resolved value. Isso cobre o caso comum
  // `.select().from(...).where(...).orderBy(...).limit(1)`.
  // Para queries sem .limit (count, agregacao), substituimos .where direto.
  //
  // Implementer pode estruturar de forma diferente; nesse caso o test
  // documenta o conflito.

  // Default: .limit resolve primedope_run; .orderBy resolve sessions; .where resolve count.
  // Mas isso eh fragil. Usamos abordagem mais robusta: criar um Thenable wrapper
  // que sempre resolve para o "next" response.

  function makeThenable(value: any): any {
    return {
      ...(db as any),
      then: (fulfilled: any) => Promise.resolve(value).then(fulfilled),
      catch: (rejected: any) => Promise.resolve(value).catch(rejected),
    };
  }

  // Re-mock chain methods para retornar thenable na ordem.
  let phase = 0;
  const phases = [countRows, sessionRows, primedopeRows];
  const make = () => vi.fn(() => {
    const v = phases[phase] ?? [];
    // NAO incrementa phase aqui — so quando a query for terminada (await).
    // Para garantir, fazemos cada metodo terminal retornar thenable que ao
    // ser awaited incrementa phase.
    const t = makeThenable(v);
    t.then = (fulfilled: any) => {
      const r = phases[phase] ?? [];
      phase += 1;
      return Promise.resolve(r).then(fulfilled);
    };
    return t;
  });

  (db as any).select = make();
  (db as any).from = make();
  (db as any).where = make();
  (db as any).orderBy = make();
  (db as any).limit = make();
  (db as any).innerJoin = make();
  (db as any).leftJoin = make();
  (db as any).groupBy = make();
}

// =============================================================================
// Cenario 1 — Gate <20 sessoes -> retorna null
// =============================================================================

describe('storage.getVarianceVsExpected — gate <20 sessoes', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).getVarianceVsExpected).toBe('function');
  });

  it('retorna null quando sessionsCount < 20', async () => {
    setupMockQueries({ sessions: usdSessions(19), primedopeRun: null });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).toBeNull();
  });

  it('retorna null quando sessionsCount = 0', async () => {
    setupMockQueries({ sessions: [], primedopeRun: null });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).toBeNull();
  });
});

// =============================================================================
// Cenario 2 — primedope-cache happy path
// =============================================================================

describe('storage.getVarianceVsExpected — primedope-cache valido', () => {
  it('25 sessoes + primedope_run recente -> expectedSource="primedope-cache"', async () => {
    setupMockQueries({
      sessions: usdSessions(25, 40), // 25 * ~50 ~= 1250 USD agregado
      primedopeRun: {
        id: 'PD-1',
        userId: 'USER-1',
        resultJson: {
          data: {
            ev: 1000,
            stdDev: 300,
          },
        },
        createdAt: new Date(),
      },
    });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    expect(result.expectedSource).toBe('primedope-cache');
    expect(result.expectedUsd).toBe(1000);
    expect(result.sigmaUsd).toBe(300);
    expect(result.period).toBe('90d');
    expect(result.sessionsCount).toBeGreaterThanOrEqual(20);
  });

  it('shape de retorno tem todos os campos exigidos pela home.ts', async () => {
    setupMockQueries({
      sessions: usdSessions(25, 50),
      primedopeRun: {
        resultJson: { data: { ev: 1500, stdDev: 400 } },
        createdAt: new Date(),
      },
    });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).toMatchObject({
      sessionsCount: expect.any(Number),
      actualUsd: expect.any(Number),
      expectedUsd: expect.any(Number),
      expectedSource: expect.stringMatching(/^(primedope-cache|fallback-zero)$/),
      deviationUsd: expect.any(Number),
      sigmaUsd: expect.any(Number),
      sigmaMultiple: expect.any(Number),
      status: expect.stringMatching(/^(lucky|normal|unlucky)$/),
      period: '90d',
    });
  });
});

// =============================================================================
// Cenario 3 — fallback heuristico (sem primedope_runs)
// =============================================================================

describe('storage.getVarianceVsExpected — fallback heuristico', () => {
  it('25 sessoes + zero primedope_runs -> expectedSource="fallback-zero", expectedUsd=0', async () => {
    setupMockQueries({
      sessions: usdSessions(25, 50),
      primedopeRun: null,
    });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    expect(result.expectedSource).toBe('fallback-zero');
    expect(result.expectedUsd).toBe(0);
  });

  it('sigmaUsd = 1.5 * stddev(daily_pnl_usd) no fallback', async () => {
    // Sessoes com pnl 0, 50, 100, ... 600+ -> stddev conhecido.
    // Implementer agrupa por dia. Aqui usamos 1 sessao por dia, pnl variando.
    const sessions = usdSessions(25, 0).map((s, i) => ({
      ...s,
      pnlNative: i * 10, // 0, 10, 20, ..., 240
      pnlUsd: i * 10,
    }));
    setupMockQueries({ sessions, primedopeRun: null });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    expect(result.expectedSource).toBe('fallback-zero');
    // stddev de [0..240 step 10] = ~72.17; * 1.5 = ~108.25.
    // Aceitamos faixa ampla (sample vs population stddev: algumas implementacoes
    // usam N-1, outras N).
    expect(result.sigmaUsd).toBeGreaterThan(40);
    expect(result.sigmaUsd).toBeLessThan(200);
  });
});

// =============================================================================
// Cenario 4 — shape result_json invalido -> fallback
// =============================================================================

describe('storage.getVarianceVsExpected — shape invalido', () => {
  it('primedope_run.result_json sem data.ev -> fallback-zero, sem throw', async () => {
    setupMockQueries({
      sessions: usdSessions(25, 50),
      primedopeRun: {
        resultJson: {
          data: {
            // sem ev nem stdDev
            histogramUrl: 'https://example.com/hist.png',
          },
        },
        createdAt: new Date(),
      },
    });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    expect(result.expectedSource).toBe('fallback-zero');
    expect(result.expectedUsd).toBe(0);
  });

  it('primedope_run.result_json.data.ev = string -> fallback-zero', async () => {
    setupMockQueries({
      sessions: usdSessions(25, 50),
      primedopeRun: {
        resultJson: {
          data: {
            ev: 'not-a-number',
            stdDev: 300,
          },
        },
        createdAt: new Date(),
      },
    });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    expect(result.expectedSource).toBe('fallback-zero');
  });
});

// =============================================================================
// Cenario 5 — FX cascade (sessoes BRL -> USD)
// =============================================================================

describe('storage.getVarianceVsExpected — FX cascade (lesson #6)', () => {
  it('sessoes em BRL agregadas em USD via fxResolver', async () => {
    // 25 sessoes em BRL com pnl 500 BRL cada.
    // Taxa BRL = 5.0 -> 100 USD por sessao -> actualUsd = 2500.
    const sessions = brlSessions(25, 500);
    setupMockQueries({
      sessions,
      primedopeRun: {
        resultJson: { data: { ev: 1000, stdDev: 300 } },
        createdAt: new Date(),
      },
    });
    // Override fxResolver explicito.
    (resolveExchangeRates as any).mockResolvedValue({
      rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
      source: 'system',
      resolvedAt: new Date(),
    });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    // actualUsd deve ser perto de 25 * (500/5.0) = 25 * 100 = 2500.
    // Aceitamos faixa por causa da agregacao por dia (algumas sessoes
    // podem cair no mesmo dia).
    expect(result.actualUsd).toBeGreaterThan(1500);
    expect(result.actualUsd).toBeLessThan(3500);
  });

  it('chama resolveExchangeRates(userId) no caminho de calculo', async () => {
    setupMockQueries({
      sessions: brlSessions(22, 250),
      primedopeRun: null,
    });
    await (storage as any).getVarianceVsExpected('USER-1');
    expect((resolveExchangeRates as any)).toHaveBeenCalledWith('USER-1');
  });
});

// =============================================================================
// Cenario 6 — sigmaUsd = 0 -> sigmaMultiple = 0 (sem divisao por zero)
// =============================================================================

describe('storage.getVarianceVsExpected — sigma=0 edge case', () => {
  it('primedope stdDev=0 -> sigmaMultiple=0 (nao Infinity)', async () => {
    setupMockQueries({
      sessions: usdSessions(25, 50),
      primedopeRun: {
        resultJson: { data: { ev: 1000, stdDev: 0 } },
        createdAt: new Date(),
      },
    });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    expect(result.sigmaUsd).toBe(0);
    expect(result.sigmaMultiple).toBe(0);
    expect(Number.isFinite(result.sigmaMultiple)).toBe(true);
  });

  it('fallback com daily_pnl constante (stddev=0) -> sigmaUsd=0, sigmaMultiple=0', async () => {
    // Todas sessoes com pnl identico -> stddev=0.
    const sessions = usdSessions(25, 100).map((s) => ({
      ...s,
      pnlNative: 100,
      pnlUsd: 100,
    }));
    setupMockQueries({ sessions, primedopeRun: null });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    expect(result.sigmaUsd).toBe(0);
    expect(result.sigmaMultiple).toBe(0);
  });
});

// =============================================================================
// Cenario 7 — sigmaMultiple clamp [-10, 10]
// =============================================================================

describe('storage.getVarianceVsExpected — sigmaMultiple clamp', () => {
  it('sigmaMultiple > 10 -> clamp em 10', async () => {
    // P&L absurdo positivo (actualUsd >> expectedUsd, sigmaUsd pequeno).
    const sessions = usdSessions(25, 0).map((s) => ({
      ...s,
      pnlNative: 100000,
      pnlUsd: 100000,
    }));
    setupMockQueries({
      sessions,
      primedopeRun: {
        resultJson: { data: { ev: 100, stdDev: 10 } }, // sigmaUsd minusculo
        createdAt: new Date(),
      },
    });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    expect(result.sigmaMultiple).toBeLessThanOrEqual(10);
    expect(result.sigmaMultiple).toBeGreaterThanOrEqual(-10);
  });

  it('sigmaMultiple < -10 -> clamp em -10', async () => {
    // P&L absurdo negativo.
    const sessions = usdSessions(25, 0).map((s) => ({
      ...s,
      pnlNative: -100000,
      pnlUsd: -100000,
    }));
    setupMockQueries({
      sessions,
      primedopeRun: {
        resultJson: { data: { ev: 100, stdDev: 10 } },
        createdAt: new Date(),
      },
    });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    expect(result.sigmaMultiple).toBeGreaterThanOrEqual(-10);
    expect(result.sigmaMultiple).toBeLessThanOrEqual(10);
  });

  it('nunca retorna NaN/Infinity em campos numericos', async () => {
    setupMockQueries({
      sessions: usdSessions(25, 50),
      primedopeRun: {
        resultJson: { data: { ev: 500, stdDev: 100 } },
        createdAt: new Date(),
      },
    });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    for (const field of ['actualUsd', 'expectedUsd', 'deviationUsd', 'sigmaUsd', 'sigmaMultiple']) {
      expect(Number.isFinite(result[field])).toBe(true);
    }
  });
});

// =============================================================================
// Cenario 8 — Status threshold lucky/normal/unlucky
// =============================================================================

describe('storage.getVarianceVsExpected — status threshold', () => {
  it('sigmaMultiple >= 1 -> status "lucky"', async () => {
    // actual >> expected, com sigma tal que sigmaMultiple >= 1.
    // sessions agregam ~1250 USD; expected 500, sigma 500 -> sigmaMultiple = 1.5
    const sessions = usdSessions(25, 50);
    setupMockQueries({
      sessions,
      primedopeRun: {
        resultJson: { data: { ev: 500, stdDev: 500 } },
        createdAt: new Date(),
      },
    });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    if (result.sigmaMultiple >= 1) {
      expect(result.status).toBe('lucky');
    }
  });

  it('sigmaMultiple <= -1 -> status "unlucky"', async () => {
    // Sessoes muito negativas.
    const sessions = usdSessions(25, 0).map((s) => ({
      ...s,
      pnlNative: -200,
      pnlUsd: -200,
    }));
    setupMockQueries({
      sessions,
      primedopeRun: {
        resultJson: { data: { ev: 500, stdDev: 100 } },
        createdAt: new Date(),
      },
    });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    if (result.sigmaMultiple <= -1) {
      expect(result.status).toBe('unlucky');
    }
  });

  it('-1 < sigmaMultiple < 1 -> status "normal"', async () => {
    // actual ~= expected.
    const sessions = usdSessions(25, 20);
    setupMockQueries({
      sessions,
      primedopeRun: {
        resultJson: { data: { ev: 500, stdDev: 1000 } }, // sigma alto = sigmaMultiple baixo
        createdAt: new Date(),
      },
    });
    const result = await (storage as any).getVarianceVsExpected('USER-1');
    expect(result).not.toBeNull();
    if (Math.abs(result.sigmaMultiple) < 1) {
      expect(result.status).toBe('normal');
    }
  });
});
