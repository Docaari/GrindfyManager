/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Fase B — RF-02 (storage.getAbGameDistribution)
 *
 * Spec : Docs/specs/sprint-fase-b-lead-measures-2026-06-01.md (RF-02)
 * ADR  : Docs/architecture/decisions/228-fase-b-lead-measures-warmup-compliance-abgame-distribution.md (D-B6)
 *
 * Status RED: storage.getAbGameDistribution NAO existe ainda. Implementer espelha
 * getTopLessons (server/storage.ts:8157): scan de cooldown_logs (completedAt!=null
 * AND startedAt>=cutoff) lendo abGameAnswers + agregacao JS + tokenizeLessons.
 *
 * Shape esperado (ADR Shapes TS finais):
 *   {
 *     journaledSessions: number;      // linhas com >=1 campo de abGameAnswers preenchido
 *     aGameItemCount: number;         // itens nao-vazios em aGame somados
 *     bGameItemCount: number;         // itens nao-vazios em bGame somados
 *     cGameEntryCount: number;        // linhas com cGame string nao-vazia
 *     avgAGamePerSession: number;     // 0 se journaledSessions=0
 *     avgBGamePerSession: number;     // 0 se journaledSessions=0
 *     abShare: { aGamePct: number; bGamePct: number }; // soma 1 quando a+b>0; {0,0} senao
 *     cGameThemes: Array<{ token: string; count: number }>; // tokenizeLessons([...cGames,...lessons]) top-30
 *   }
 *
 * AbGameAnswers = { aGame: string[]; bGame: string[]; cGame: string; lesson: string }
 *   (shared/schema.ts:3500)
 *
 * Mock de db: scan retorna rows {abGameAnswers}. tokenizeLessons NAO e mockado
 * (usamos o real — e PII-safe e deterministico). Aggregacao em JS e testavel
 * exatamente (lesson #3 shape real do scan).
 *
 * Lessons: #3, #9, #11 (degrade sem fabricar), #30 (.test.ts = node).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('drizzle-orm', async () => {
  const actual: any = await vi.importActual('drizzle-orm');
  return { ...actual, relations: actual.relations ?? vi.fn(() => ({})) };
});

type Row = Record<string, any>;

const dbState = vi.hoisted(() => ({
  cooldownRows: [] as Row[],
}));

vi.mock('../../../server/db', () => {
  const make = () => vi.fn(() => chain);
  const chain: any = {};
  chain.select = make();
  chain.from = make();
  chain.where = make();
  chain.groupBy = make();
  chain.orderBy = make();
  chain.limit = make();
  // terminal thenable -> sempre devolve as rows de cooldown configuradas
  chain.then = (resolve: any) =>
    Promise.resolve(dbState.cooldownRows).then(resolve);
  return { db: chain, pool: {} };
});

import { storage } from '../../../server/storage';

function row(answers: any): Row {
  return { abGameAnswers: answers };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.cooldownRows = [];
});

// ===========================================================================
// Shape / existencia
// ===========================================================================

describe('storage.getAbGameDistribution — shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.getAbGameDistribution).toBe('function');
  });

  it('aceita signature (userId, period)', () => {
    expect(storage.getAbGameDistribution.length).toBeGreaterThanOrEqual(1);
  });

  it('retorna shape canonico vazio quando sem dados (200-like, todos zeros/[])', async () => {
    dbState.cooldownRows = [];
    const out = await storage.getAbGameDistribution('USER-0001', '30d');
    expect(out).toMatchObject({
      journaledSessions: 0,
      aGameItemCount: 0,
      bGameItemCount: 0,
      cGameEntryCount: 0,
      avgAGamePerSession: 0,
      avgBGamePerSession: 0,
      abShare: { aGamePct: 0, bGamePct: 0 },
      cGameThemes: [],
    });
  });
});

// ===========================================================================
// Cenario 8 — Happy: contagens + medias + abShare
// ===========================================================================

describe('storage.getAbGameDistribution — happy path', () => {
  it('5 logs, 12 itens A e 6 itens B -> contagens, medias, abShare', async () => {
    dbState.cooldownRows = [
      row({ aGame: ['a', 'b', 'c'], bGame: ['x', 'y'], cGame: 'tilt cedo', lesson: 'respirar fundo' }),
      row({ aGame: ['a', 'b', 'c'], bGame: ['x'], cGame: '', lesson: 'foco' }),
      row({ aGame: ['a', 'b'], bGame: ['x', 'y'], cGame: 'cansaco', lesson: '' }),
      row({ aGame: ['a', 'b'], bGame: ['x'], cGame: '', lesson: '' }),
      row({ aGame: ['a', 'b'], bGame: [], cGame: '', lesson: 'paciencia' }),
    ];
    // aGame: 3+3+2+2+2 = 12 ; bGame: 2+1+2+1+0 = 6

    const out = await storage.getAbGameDistribution('USER-0001', '30d');

    expect(out.journaledSessions).toBe(5);
    expect(out.aGameItemCount).toBe(12);
    expect(out.bGameItemCount).toBe(6);
    expect(out.avgAGamePerSession).toBeCloseTo(12 / 5, 5);
    expect(out.avgBGamePerSession).toBeCloseTo(6 / 5, 5);
    expect(out.abShare.aGamePct).toBeCloseTo(12 / 18, 5); // 0.667
    expect(out.abShare.bGamePct).toBeCloseTo(6 / 18, 5); // 0.333
    expect(out.abShare.aGamePct + out.abShare.bGamePct).toBeCloseTo(1, 5);
  });
});

// ===========================================================================
// Cenario 9 — abShare div-zero guard (zero itens A e B -> 0/0, nao NaN)
// ===========================================================================

describe('storage.getAbGameDistribution — abShare div-zero guard', () => {
  it('zero itens A e B -> aGamePct/bGamePct 0 (sem NaN)', async () => {
    dbState.cooldownRows = [
      // journal preenchido apenas com cGame (sem itens A/B)
      row({ aGame: [], bGame: [], cGame: 'tilt', lesson: '' }),
      row({ aGame: [], bGame: [], cGame: 'cansaco', lesson: '' }),
    ];

    const out = await storage.getAbGameDistribution('USER-0001', '30d');

    expect(out.aGameItemCount).toBe(0);
    expect(out.bGameItemCount).toBe(0);
    expect(out.abShare.aGamePct).toBe(0);
    expect(out.abShare.bGamePct).toBe(0);
    expect(Number.isNaN(out.abShare.aGamePct)).toBe(false);
    expect(Number.isNaN(out.abShare.bGamePct)).toBe(false);
    // journaledSessions ainda conta (tem cGame preenchido)
    expect(out.journaledSessions).toBe(2);
    expect(out.cGameEntryCount).toBe(2);
  });
});

// ===========================================================================
// Cenario 10 — abGameAnswers null/ausente -> ignorado, nao quebra
// ===========================================================================

describe('storage.getAbGameDistribution — null/ausente (degrade, lesson #9)', () => {
  it('linhas com abGameAnswers null sao ignoradas sem crash', async () => {
    dbState.cooldownRows = [
      row(null),
      row(undefined),
      { /* sem abGameAnswers */ },
      row({ aGame: ['a', 'b'], bGame: ['x'], cGame: 'tilt', lesson: 'foco' }),
    ];

    const out = await storage.getAbGameDistribution('USER-0001', '30d');

    // Apenas 1 linha valida com journal preenchido
    expect(out.journaledSessions).toBe(1);
    expect(out.aGameItemCount).toBe(2);
    expect(out.bGameItemCount).toBe(1);
    expect(out.cGameEntryCount).toBe(1);
  });
});

// ===========================================================================
// Cenario 11 — abGameAnswers malformado (aGame nao-array) -> guard, nao fabrica
// ===========================================================================

describe('storage.getAbGameDistribution — malformado (lesson #11 nao fabrica)', () => {
  it('aGame nao-array / campos invalidos -> tratados como vazio, sem crash', async () => {
    dbState.cooldownRows = [
      row({ aGame: 'nao-e-array', bGame: null, cGame: 123 as any, lesson: { x: 1 } as any }),
      row({ aGame: ['valido1', 'valido2'], bGame: ['b1'], cGame: 'real', lesson: 'real lesson' }),
    ];

    const out = await storage.getAbGameDistribution('USER-0001', '30d');

    // Linha 1: aGame string nao-array -> 0 itens; bGame null -> 0; cGame numerico -> nao conta
    // Linha 2: 2 itens A, 1 item B, cGame valido
    expect(out.aGameItemCount).toBe(2);
    expect(out.bGameItemCount).toBe(1);
    expect(out.cGameEntryCount).toBe(1); // so a linha 2 tem cGame string nao-vazia
    // nao deve fabricar contagens a partir de lixo
    expect(Number.isFinite(out.avgAGamePerSession)).toBe(true);
  });
});

// ===========================================================================
// Cenario — strings vazias / whitespace nos arrays NAO contam (RF-02 §criterio)
// ===========================================================================

describe('storage.getAbGameDistribution — strings vazias/whitespace', () => {
  it('"" e "   " nos arrays nao sao contadas', async () => {
    dbState.cooldownRows = [
      row({ aGame: ['real', '', '   ', 'real2'], bGame: ['  ', ''], cGame: '   ', lesson: '' }),
    ];

    const out = await storage.getAbGameDistribution('USER-0001', '30d');

    expect(out.aGameItemCount).toBe(2); // so 'real' e 'real2'
    expect(out.bGameItemCount).toBe(0);
    // cGame '   ' (whitespace) NAO conta como entrada
    expect(out.cGameEntryCount).toBe(0);
  });
});

// ===========================================================================
// Cenario 12 — cGameThemes tokenizados (cGame + lesson), ordenados por count
// ===========================================================================

describe('storage.getAbGameDistribution — cGameThemes (tokeniza cGame + lesson)', () => {
  it('combina cGame + lesson via tokenizeLessons, sem frase crua, ordenado desc', async () => {
    dbState.cooldownRows = [
      row({ aGame: [], bGame: [], cGame: 'paciencia paciencia', lesson: 'paciencia foco' }),
      row({ aGame: [], bGame: [], cGame: 'foco', lesson: 'volume' }),
    ];

    const out = await storage.getAbGameDistribution('USER-0001', '30d');

    expect(Array.isArray(out.cGameThemes)).toBe(true);
    // 'paciencia' aparece 3x (cGame x2 + lesson x1) -> top token
    const tokens = out.cGameThemes.map((t) => t.token);
    expect(tokens).toContain('paciencia');
    const paciencia = out.cGameThemes.find((t) => t.token === 'paciencia');
    expect(paciencia?.count).toBe(3);
    // 'foco' aparece 2x (cGame + lesson)
    const foco = out.cGameThemes.find((t) => t.token === 'foco');
    expect(foco?.count).toBe(2);
    // ordenacao desc por count
    for (let i = 1; i < out.cGameThemes.length; i++) {
      expect(out.cGameThemes[i - 1].count).toBeGreaterThanOrEqual(out.cGameThemes[i].count);
    }
    // PII: nenhum token e frase crua (todos > 3 chars, palavras isoladas)
    for (const t of out.cGameThemes) {
      expect(t.token).not.toMatch(/\s/);
      expect(t.token.length).toBeGreaterThan(3);
    }
  });

  it('cGameThemes vazio quando sem cGame nem lesson', async () => {
    dbState.cooldownRows = [
      row({ aGame: ['a'], bGame: ['b'], cGame: '', lesson: '' }),
    ];
    const out = await storage.getAbGameDistribution('USER-0001', '30d');
    expect(out.cGameThemes).toEqual([]);
  });
});

// ===========================================================================
// Cenario 13 — journaledSessions conta so logs com >=1 campo preenchido
// ===========================================================================

describe('storage.getAbGameDistribution — journaledSessions', () => {
  it('conta apenas linhas com ao menos um campo de abGameAnswers preenchido', async () => {
    dbState.cooldownRows = [
      row({ aGame: [], bGame: [], cGame: '', lesson: '' }), // totalmente vazio -> NAO conta
      row({ aGame: ['a'], bGame: [], cGame: '', lesson: '' }), // tem A -> conta
      row({ aGame: [], bGame: [], cGame: 'tilt', lesson: '' }), // tem C -> conta
      row({ aGame: [], bGame: [], cGame: '', lesson: 'foco' }), // tem lesson -> conta
    ];

    const out = await storage.getAbGameDistribution('USER-0001', '30d');

    expect(out.journaledSessions).toBe(3);
  });
});

// ===========================================================================
// Cenario 14 — periodo aceito (7d/30d/90d) nao quebra
// ===========================================================================

describe('storage.getAbGameDistribution — periodos aceitos', () => {
  it.each(['7d', '30d', '90d'] as const)('period=%s nao quebra e retorna shape', async (p) => {
    dbState.cooldownRows = [
      row({ aGame: ['a'], bGame: ['b'], cGame: 'tilt', lesson: 'foco' }),
    ];
    const out = await storage.getAbGameDistribution('USER-0001', p);
    expect(out).toMatchObject({
      journaledSessions: expect.any(Number),
      abShare: { aGamePct: expect.any(Number), bGamePct: expect.any(Number) },
    });
  });
});

// ===========================================================================
// Cenario — journaledSessions=0 -> medias 0, abShare {0,0}, cGameThemes []
// ===========================================================================

describe('storage.getAbGameDistribution — journaledSessions=0 edge', () => {
  it('todas as linhas vazias -> medias 0, abShare {0,0}, sem NaN', async () => {
    dbState.cooldownRows = [
      row({ aGame: [], bGame: [], cGame: '', lesson: '' }),
      row(null),
    ];

    const out = await storage.getAbGameDistribution('USER-0001', '30d');

    expect(out.journaledSessions).toBe(0);
    expect(out.avgAGamePerSession).toBe(0);
    expect(out.avgBGamePerSession).toBe(0);
    expect(out.abShare).toEqual({ aGamePct: 0, bGamePct: 0 });
    expect(out.cGameThemes).toEqual([]);
  });
});

// ===========================================================================
// PRIVACIDADE (R5) — texto livre cru NUNCA aparece na resposta
// ===========================================================================

describe('storage.getAbGameDistribution — privacidade do texto livre (R5)', () => {
  it('frase crua de cGame/lesson nunca aparece na resposta serializada', async () => {
    const frase = 'tomei tilt depois de uma bad beat horrivel na bolha';
    dbState.cooldownRows = [
      row({ aGame: [], bGame: [], cGame: frase, lesson: 'aprendi a respirar antes de reagir' }),
    ];

    const out = await storage.getAbGameDistribution('USER-0001', '30d');
    const serialized = JSON.stringify(out);

    expect(serialized).not.toContain(frase);
    expect(serialized).not.toContain('aprendi a respirar antes de reagir');
    // tokens individuais (>3 chars) podem aparecer, mas nunca a frase inteira
  });
});
