/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Fase B — RF-01 (storage.getWarmupComplianceMetrics)
 *
 * Spec : Docs/specs/sprint-fase-b-lead-measures-2026-06-01.md (RF-01)
 * ADR  : Docs/architecture/decisions/228-fase-b-lead-measures-warmup-compliance-abgame-distribution.md (D-B4/D-B5)
 *
 * Status RED: storage.getWarmupComplianceMetrics NAO existe ainda. O Implementer
 * vai escrever espelhando getCooldownComplianceMetrics (server/storage.ts:8026).
 *
 * Shape esperado (ADR D-B5 / Shapes TS finais):
 *   {
 *     total: number;                  // grind_sessions status='completed' AND date>=cutoff
 *     completed: number;              // warmup_rituals completedAt!=null AND version='full' AND startedAt>=cutoff
 *     complianceRate: number;         // total>0 ? Math.min(1, completed/total) : 0
 *     abortedCount: number;           // warmup_rituals version='aborted' no periodo
 *     decisionNotToPlayCount: number; // SUBCONJUNTO de completed: version='full' AND decisionToPlay=false
 *     overrideUsedCount: number;      // version='full' AND overrideUsed=true
 *   }
 *
 * ESTRATEGIA DE MOCK (lesson #3 — shape REAL Drizzle):
 *   O metodo (espelhando o cooldown) fara N queries db.select(...).from(table).where(and(...)).
 *   - count() agregado em SQL para `total` (grind_sessions) e para os contadores de warmup.
 *   - O Implementer pode usar 1 scan + agregacao JS, OU varios count() — o ADR nao trava.
 *   Para nao acoplar ao numero/ordem de queries (anti-pattern: testar implementacao),
 *   o mock de `db` roteia o resultado pela TABELA inspecionada em `.from(...)` e por
 *   estado capturado em `.where(...)`. Cada terminal (await da chain) devolve as rows
 *   apropriadas. Assim o teste valida COMPORTAMENTO (numeros corretos dado o dataset),
 *   nao a forma exata da query.
 *
 *   Para suportar AMBAS as implementacoes possiveis (count() SQL agregado vs scan+JS),
 *   o mock devolve, ao final da chain sobre `warmup_rituals`, o conjunto de RITUAIS
 *   crus; e sobre `grind_sessions`, as SESSOES cruas. Se o Implementer optar por
 *   count() em SQL, este mock NAO conseguira servir o count agregado — por isso o
 *   teste tambem aceita o caminho count() roteando por heuristica de shape do select
 *   (presenca de `count` no objeto de colunas). Ver helper `installDbDataset`.
 *
 * Lessons aplicadas: #3 (shape real), #9 (degrade sem fabricar), #30 (.test.ts = node).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// drizzle-orm parcial precisa de `relations` senao @shared/schema quebra ao carregar (lesson #36)
vi.mock('drizzle-orm', async () => {
  const actual: any = await vi.importActual('drizzle-orm');
  return { ...actual, relations: actual.relations ?? vi.fn(() => ({})) };
});

// ---------------------------------------------------------------------------
// Mock db (Drizzle chain) roteado por tabela + shape do select (lesson #3)
// ---------------------------------------------------------------------------
type Row = Record<string, any>;

const dbState = vi.hoisted(() => ({
  // rows crus por "tabela logica" — populadas por installDbDataset
  warmupRows: [] as Row[],
  grindRows: [] as Row[],
  // marcador de qual tabela a chain corrente esta consultando
  currentTable: null as null | 'warmup' | 'grind' | 'other',
  // shape de colunas do select corrente (para detectar count() agregado)
  currentSelectShape: null as null | Record<string, any>,
}));

function classifyTable(arg: any): 'warmup' | 'grind' | 'other' {
  // Drizzle table objects expoem Symbol/strings internos; usamos o nome da tabela
  // serializado. Em runtime de teste, warmupRituals / grindSessions sao objetos
  // com `Symbol(drizzle:Name)`. Fazemos best-effort por string.
  const s = String(
    arg?.[Symbol.for?.('drizzle:Name')] ??
      arg?._?.name ??
      arg?.tableName ??
      arg?.name ??
      JSON.stringify(Object.keys(arg ?? {})),
  ).toLowerCase();
  if (s.includes('warmup')) return 'warmup';
  if (s.includes('grind')) return 'grind';
  // fallback por presenca de colunas conhecidas
  if (arg?.version || arg?.overrideUsed || arg?.decisionToPlay) return 'warmup';
  if (arg?.status && arg?.date) return 'grind';
  return 'other';
}

vi.mock('../../../server/db', () => {
  const make = (fn?: (...a: any[]) => any) =>
    vi.fn((...args: any[]) => {
      fn?.(...args);
      return chain;
    });

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

  // Terminal: a chain e thenable. Resolve para as rows da tabela atual.
  chain.then = (resolve: any) => {
    const table = dbState.currentTable;
    const shape = dbState.currentSelectShape ?? {};
    const isCountSelect =
      'count' in shape && Object.keys(shape).length === 1;

    let rows: Row[] = [];
    if (table === 'warmup') rows = dbState.warmupRows;
    else if (table === 'grind') rows = dbState.grindRows;

    // reset por seguranca entre awaits
    dbState.currentTable = null;
    dbState.currentSelectShape = null;

    if (isCountSelect) {
      // Implementer usou count() agregado em SQL — devolvemos 1 linha {count}.
      // O mock NAO sabe o predicado SQL exato, entao count = tamanho do dataset
      // bruto da tabela. Por isso os datasets nos testes ja vem PRE-FILTRADOS
      // para o predicado que aquela query especifica deveria aplicar — ver nota.
      return Promise.resolve([{ count: rows.length }]).then(resolve);
    }
    return Promise.resolve(rows).then(resolve);
  };

  return { db: chain, pool: {} };
});

import { storage } from '../../../server/storage';

/**
 * NOTA SOBRE count() AGREGADO:
 * O cooldown original usa count() em SQL com predicados distintos por metrica.
 * Um mock de db NAO consegue reproduzir o predicado SQL. Para tornar o teste
 * deterministico SEM acoplar a implementacao, usamos a estrategia de SCAN:
 * configuramos `warmupRows`/`grindRows` com o dataset COMPLETO e o teste assume
 * que o Implementer FILTRA EM JS apos um scan (caminho recomendado para os
 * contadores auxiliares, ja que abortedCount/decisionNotToPlayCount/overrideUsedCount
 * vem "do mesmo SELECT" — ADR D-B5 "todos baratos, do mesmo scan").
 *
 * Se o Implementer preferir count() SQL por metrica, estes testes de NUMEROS
 * exatos podem nao bater (o mock devolveria sempre len(dataset)). Documentado
 * como contradicao-conhecida (lesson #25): o test-writer recomenda o caminho
 * SCAN+JS (alinhado a "do mesmo scan" do ADR) para os auxiliares. Os testes de
 * SHAPE (funcao existe / assinatura) cobrem ambos os caminhos.
 */

beforeEach(() => {
  vi.clearAllMocks();
  dbState.warmupRows = [];
  dbState.grindRows = [];
  dbState.currentTable = null;
  dbState.currentSelectShape = null;
});

// ===========================================================================
// Shape / existencia
// ===========================================================================

describe('storage.getWarmupComplianceMetrics — shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.getWarmupComplianceMetrics).toBe('function');
  });

  it('aceita signature (userId, period)', () => {
    expect(storage.getWarmupComplianceMetrics.length).toBeGreaterThanOrEqual(1);
  });

  it('retorna o shape canonico (campos do ADR D-B5)', async () => {
    dbState.grindRows = [];
    dbState.warmupRows = [];
    const out = await storage.getWarmupComplianceMetrics('USER-0001', '30d');
    expect(out).toMatchObject({
      total: expect.any(Number),
      completed: expect.any(Number),
      complianceRate: expect.any(Number),
      abortedCount: expect.any(Number),
      decisionNotToPlayCount: expect.any(Number),
      overrideUsedCount: expect.any(Number),
    });
  });
});

// ===========================================================================
// Cenario 1 — Happy: 10 sessoes completed, 7 warmup full -> complianceRate 0.7
// ===========================================================================

describe('storage.getWarmupComplianceMetrics — happy path (SCAN+JS)', () => {
  it('10 grind completed + 7 warmup full -> total=10, completed=7, rate=0.7', async () => {
    dbState.grindRows = Array.from({ length: 10 }, (_, i) => ({
      id: `S-${i}`,
      status: 'completed',
    }));
    // 7 rituais full completos (completedAt != null, version='full')
    dbState.warmupRows = Array.from({ length: 7 }, (_, i) => ({
      id: `W-${i}`,
      version: 'full',
      completedAt: new Date(),
      decisionToPlay: true,
      overrideUsed: false,
    }));

    const out = await storage.getWarmupComplianceMetrics('USER-0001', '30d');

    expect(out.total).toBe(10);
    expect(out.completed).toBe(7);
    expect(out.complianceRate).toBeCloseTo(0.7, 5);
  });
});

// ===========================================================================
// Cenario 2 — Clamp: completed (8) > total (5) -> complianceRate = 1.0
// ===========================================================================

describe('storage.getWarmupComplianceMetrics — clamp em 1 (R1)', () => {
  it('completed > total -> complianceRate = 1.0 (Math.min)', async () => {
    dbState.grindRows = Array.from({ length: 5 }, (_, i) => ({
      id: `S-${i}`,
      status: 'completed',
    }));
    dbState.warmupRows = Array.from({ length: 8 }, (_, i) => ({
      id: `W-${i}`,
      version: 'full',
      completedAt: new Date(),
      decisionToPlay: true,
      overrideUsed: false,
    }));

    const out = await storage.getWarmupComplianceMetrics('USER-0001', '30d');

    expect(out.total).toBe(5);
    expect(out.completed).toBe(8);
    expect(out.complianceRate).toBe(1);
    expect(out.complianceRate).toBeLessThanOrEqual(1);
  });
});

// ===========================================================================
// Cenario 3 — version='aborted' NAO conta em completed, conta em abortedCount
// ===========================================================================

describe('storage.getWarmupComplianceMetrics — version aborted', () => {
  it('aborted nao entra em completed; entra em abortedCount', async () => {
    dbState.grindRows = Array.from({ length: 4 }, (_, i) => ({
      id: `S-${i}`,
      status: 'completed',
    }));
    dbState.warmupRows = [
      { id: 'W-1', version: 'full', completedAt: new Date(), decisionToPlay: true, overrideUsed: false },
      { id: 'W-2', version: 'full', completedAt: new Date(), decisionToPlay: true, overrideUsed: false },
      // abortado: completedAt null + version='aborted'
      { id: 'W-3', version: 'aborted', completedAt: null, decisionToPlay: null, overrideUsed: false },
      { id: 'W-4', version: 'aborted', completedAt: null, decisionToPlay: null, overrideUsed: false },
    ];

    const out = await storage.getWarmupComplianceMetrics('USER-0001', '30d');

    expect(out.completed).toBe(2); // so os 2 full
    expect(out.abortedCount).toBe(2);
  });
});

// ===========================================================================
// Cenario 4 — version='full' com decisionToPlay=false CONTA positivo
// ===========================================================================

describe('storage.getWarmupComplianceMetrics — decisionToPlay=false conta positivo', () => {
  it('full + decisionToPlay=false permanece em completed (nao penaliza)', async () => {
    dbState.grindRows = Array.from({ length: 3 }, (_, i) => ({
      id: `S-${i}`,
      status: 'completed',
    }));
    dbState.warmupRows = [
      { id: 'W-1', version: 'full', completedAt: new Date(), decisionToPlay: true, overrideUsed: false },
      { id: 'W-2', version: 'full', completedAt: new Date(), decisionToPlay: false, overrideUsed: false },
      { id: 'W-3', version: 'full', completedAt: new Date(), decisionToPlay: false, overrideUsed: false },
    ];

    const out = await storage.getWarmupComplianceMetrics('USER-0001', '30d');

    // 3 full -> todos contam em completed (decisionToPlay nao filtra)
    expect(out.completed).toBe(3);
    // decisionNotToPlayCount = subconjunto: full AND decisionToPlay=false
    expect(out.decisionNotToPlayCount).toBe(2);
  });
});

// ===========================================================================
// Cenario 5 — total=0 -> complianceRate 0 (sem div por zero)
// ===========================================================================

describe('storage.getWarmupComplianceMetrics — total=0', () => {
  it('sem sessoes completed -> complianceRate=0 (sem NaN/Infinity)', async () => {
    dbState.grindRows = [];
    dbState.warmupRows = [
      { id: 'W-1', version: 'full', completedAt: new Date(), decisionToPlay: true, overrideUsed: false },
    ];

    const out = await storage.getWarmupComplianceMetrics('USER-0001', '30d');

    expect(out.total).toBe(0);
    expect(out.complianceRate).toBe(0);
    expect(Number.isFinite(out.complianceRate)).toBe(true);
  });
});

// ===========================================================================
// Cenario 7 — overrideUsedCount correto (DEC-B2)
// ===========================================================================

describe('storage.getWarmupComplianceMetrics — overrideUsedCount', () => {
  it('conta full AND overrideUsed=true', async () => {
    dbState.grindRows = Array.from({ length: 5 }, (_, i) => ({
      id: `S-${i}`,
      status: 'completed',
    }));
    dbState.warmupRows = [
      { id: 'W-1', version: 'full', completedAt: new Date(), decisionToPlay: true, overrideUsed: true },
      { id: 'W-2', version: 'full', completedAt: new Date(), decisionToPlay: true, overrideUsed: true },
      { id: 'W-3', version: 'full', completedAt: new Date(), decisionToPlay: true, overrideUsed: false },
      // aborted com override nunca conta (aborted nao e full)
      { id: 'W-4', version: 'aborted', completedAt: null, decisionToPlay: null, overrideUsed: true },
    ];

    const out = await storage.getWarmupComplianceMetrics('USER-0001', '30d');

    expect(out.overrideUsedCount).toBe(2);
  });
});

// ===========================================================================
// Cenario 6/degrade — periodo aplica cutoff (semantica de janela)
// Validacao leve: a funcao deve aceitar 7d/30d/90d sem quebrar e devolver shape.
// (O cutoff exato e SQL — nao reproduzivel no mock; validamos que period e
//  repassado e nao quebra — lesson #9 nao fabrica.)
// ===========================================================================

describe('storage.getWarmupComplianceMetrics — periodos aceitos', () => {
  it.each(['7d', '30d', '90d'] as const)('period=%s nao quebra e retorna shape', async (p) => {
    dbState.grindRows = [{ id: 'S-1', status: 'completed' }];
    dbState.warmupRows = [
      { id: 'W-1', version: 'full', completedAt: new Date(), decisionToPlay: true, overrideUsed: false },
    ];
    const out = await storage.getWarmupComplianceMetrics('USER-0001', p);
    expect(out).toMatchObject({ total: expect.any(Number), completed: expect.any(Number) });
  });
});
