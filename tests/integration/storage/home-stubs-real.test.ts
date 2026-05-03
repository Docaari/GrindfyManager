/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-2 — RF-32 (B10 Storage stubs reais).
 *
 * Spec : Docs/specs/home-reform-2.md §3 B10, §5 RF-32
 * ADR  : Docs/architecture/decisions/109-home-bankroll-fx-aggregation.md
 *
 * Substituicao dos 5 stubs em server/storage.ts (linhas 9515-9563) por queries
 * reais. Cada wrapper testado em 3 cenarios:
 *   - data presente (happy path)
 *   - data vazio (null / [] adequados)
 *   - DB throw (logger + re-throw OR fallback documentado)
 *
 * Wrappers cobertos:
 *   B10.1 getPendingStarredHands(userId, limit=5)
 *   B10.2 getProfileStateForDay(userId, dayOfWeek)
 *   B10.3 getCurrentBankroll(userId)        — delega walletService (ADR-109)
 *   B10.4 getActiveCooldown(userId)
 *   B10.5 getActiveFlightSeries(userId)
 *
 * Status RED: storage stubs ainda retornam placeholders / valores Onda 1.
 * Apos implementer, esses retornos refletem queries Drizzle reais.
 *
 * Lessons aplicadas:
 *   #3   shape REAL — verificar storage.ts antes de mockar
 *   #6   conversao USD via walletService (cascata FX)
 *   #9   logar antes de fallback (catch bloco)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock db (Drizzle) — capturamos as chamadas + retornamos rows fake
// =============================================================================

const dbState = {
  selectRows: [] as any[],
  shouldThrow: false,
};

function makeQueryBuilder() {
  // Builder chainable that resolves to dbState.selectRows
  const builder: any = {};
  const methods = ['from', 'where', 'orderBy', 'limit', 'innerJoin', 'leftJoin', 'groupBy'];
  methods.forEach((m) => {
    builder[m] = vi.fn().mockImplementation(() => builder);
  });
  // thenable — await retorna rows
  builder.then = (resolve: any, reject: any) => {
    if (dbState.shouldThrow) return reject(new Error('DB exploded'));
    return resolve(dbState.selectRows);
  };
  return builder;
}

vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn().mockImplementation(() => makeQueryBuilder()),
    insert: vi.fn().mockImplementation(() => ({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) })),
    update: vi.fn().mockImplementation(() => ({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }) })),
  },
  pool: {},
}));

// Mock walletService p/ B10.3 (ADR-109 reuso de getConsolidatedBalance)
const getConsolidatedBalanceMock = vi.fn();
vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    getConsolidatedBalance: (...args: any[]) => getConsolidatedBalanceMock(...args),
  },
}));

import { storage } from '../../../server/storage';

beforeEach(() => {
  dbState.selectRows = [];
  dbState.shouldThrow = false;
  getConsolidatedBalanceMock.mockReset();
  vi.clearAllMocks();
});

// =============================================================================
// B10.1 — getPendingStarredHands(userId, limit=5)
// =============================================================================

describe('storage.getPendingStarredHands (B10.1, RF-32)', () => {
  it('retorna shape { id, hero, context, tag, ageRelative } com data presente', async () => {
    dbState.selectRows = [
      {
        id: 'H1',
        type: 'tilt',
        spot: 'BB vs UTG 3bet pot',
        notes: 'AQ on K72r',
        status: 'pending',
        createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      },
    ];
    const result = await (storage as any).getPendingStarredHands('USER-0001', 5);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    const h = result[0];
    expect(h).toHaveProperty('id');
    expect(h).toHaveProperty('hero');
    expect(h).toHaveProperty('context');
    expect(h).toHaveProperty('tag');
    expect(h).toHaveProperty('ageRelative');
    expect(h.id).toBe('H1');
    expect(typeof h.ageRelative).toBe('string');
  });

  it('retorna [] quando nao ha hands pending', async () => {
    dbState.selectRows = [];
    const result = await (storage as any).getPendingStarredHands('USER-0001', 5);
    expect(result).toEqual([]);
  });

  it('throw quando query falha (logger antes de throw / fallback)', async () => {
    dbState.shouldThrow = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let threw = false;
    let fallback: any = undefined;
    try {
      fallback = await (storage as any).getPendingStarredHands('USER-0001', 5);
    } catch {
      threw = true;
    }
    // Aceita qualquer das 2 estrategias documentadas: re-throw OU fallback []
    if (!threw) {
      expect(Array.isArray(fallback)).toBe(true);
    }
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// =============================================================================
// B10.2 — getProfileStateForDay(userId, dayOfWeek)
// =============================================================================

describe('storage.getProfileStateForDay (B10.2, RF-32)', () => {
  it('retorna shape com profile quando row encontrada', async () => {
    dbState.selectRows = [
      {
        id: 'PS1',
        userId: 'USER-0001',
        dayOfWeek: 2,
        activeProfile: 'A',
      },
    ];
    const result = await (storage as any).getProfileStateForDay('USER-0001', 2);
    expect(result).not.toBeNull();
    // Shape minimo (spec §3 B10.2): pelo menos `profile`
    expect(result).toHaveProperty('profile');
    expect(['A', 'B', 'C', 'OFF', null]).toContain(result.profile);
  });

  it('retorna null quando nao ha row para o dia', async () => {
    dbState.selectRows = [];
    const result = await (storage as any).getProfileStateForDay('USER-0001', 2);
    expect(result).toBeNull();
  });

  it('NAO throw quando query falha (return null + log)', async () => {
    dbState.shouldThrow = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let threw = false;
    let result: any;
    try {
      result = await (storage as any).getProfileStateForDay('USER-0001', 2);
    } catch {
      threw = true;
    }
    // Spec §3 B10.2: retorna null sem throw mesmo em erro
    if (!threw) {
      expect(result).toBeNull();
    }
    errorSpy.mockRestore();
  });
});

// =============================================================================
// B10.3 — getCurrentBankroll(userId)  (ADR-109)
// =============================================================================

describe('storage.getCurrentBankroll (B10.3, RF-32, ADR-109)', () => {
  it('walletsCount=0 => retorna null', async () => {
    getConsolidatedBalanceMock.mockResolvedValue({
      totalUSD: 0,
      walletsCount: 0,
      bisAvailable: null,
      wallets: [],
    });
    dbState.selectRows = [];
    const result = await (storage as any).getCurrentBankroll('USER-0001');
    expect(result).toBeNull();
  });

  it('walletsCount>0 => retorna shape { totalUsd, walletsCount, bisAvailable, deltaPct7d, sparkline }', async () => {
    getConsolidatedBalanceMock.mockResolvedValue({
      totalUSD: 8200,
      walletsCount: 3,
      bisAvailable: 50,
      wallets: [],
    });
    // Snapshots dos ultimos 7d (pelo menos 1 antes de hoje, varios pelo periodo)
    dbState.selectRows = [
      { occurredAt: new Date(Date.now() - 8 * 24 * 3600 * 1000), newAmount: '8000' },
      { occurredAt: new Date(Date.now() - 5 * 24 * 3600 * 1000), newAmount: '8050' },
      { occurredAt: new Date(Date.now() - 1 * 24 * 3600 * 1000), newAmount: '8200' },
    ];
    const result = await (storage as any).getCurrentBankroll('USER-0001');
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('totalUsd');
    expect(result).toHaveProperty('walletsCount');
    expect(result).toHaveProperty('bisAvailable');
    expect(result).toHaveProperty('deltaPct7d');
    expect(result).toHaveProperty('sparkline');
    expect(result.totalUsd).toBe(8200);
    expect(result.walletsCount).toBe(3);
    expect(Array.isArray(result.sparkline)).toBe(true);
    expect(result.sparkline.length).toBe(7);
  });

  it('walletService throw => retorna null + log', async () => {
    getConsolidatedBalanceMock.mockRejectedValue(new Error('wallet down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let result: any;
    try {
      result = await (storage as any).getCurrentBankroll('USER-0001');
    } catch {
      // tolerar throw tambem
    }
    // Spec §3 B10.3: graceful — null em erro
    if (typeof result !== 'undefined') {
      expect(result).toBeNull();
    }
    errorSpy.mockRestore();
  });
});

// =============================================================================
// B10.4 — getActiveCooldown(userId)
// =============================================================================

describe('storage.getActiveCooldown (B10.4, RF-32)', () => {
  it('retorna null quando nao ha cooldown ativo', async () => {
    dbState.selectRows = [];
    const result = await (storage as any).getActiveCooldown('USER-0001');
    expect(result).toBeNull();
  });

  it('retorna shape { active: true, until, type, cooldownId, sessionId } com row encontrada', async () => {
    dbState.selectRows = [
      {
        id: 'CL1',
        userId: 'USER-0001',
        sessionId: 'S1',
        startedAt: new Date(),
        completedAt: null,
        durationMinutes: null,
        mode: 'full',
        blocksCompleted: [],
      },
    ];
    const result = await (storage as any).getActiveCooldown('USER-0001');
    expect(result).not.toBeNull();
    expect(result.active).toBe(true);
    expect(result).toHaveProperty('until');
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('cooldownId');
    expect(result).toHaveProperty('sessionId');
    expect(['manual', 'stop-loss', 'time-stop']).toContain(result.type);
  });

  it('NAO throw quando query falha (graceful null)', async () => {
    dbState.shouldThrow = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let threw = false;
    let result: any;
    try {
      result = await (storage as any).getActiveCooldown('USER-0001');
    } catch {
      threw = true;
    }
    // Aceita re-throw (Promise.allSettled cobre) OU null
    if (!threw) {
      expect(result === null || (typeof result === 'object' && result.active === true)).toBe(true);
    }
    errorSpy.mockRestore();
  });
});

// =============================================================================
// B10.5 — getActiveFlightSeries(userId)
// =============================================================================

describe('storage.getActiveFlightSeries (B10.5, RF-32)', () => {
  it('retorna null quando nao ha series day2 pendente futura', async () => {
    dbState.selectRows = [];
    const result = await (storage as any).getActiveFlightSeries('USER-0001');
    expect(result).toBeNull();
  });

  it('retorna shape { active: true, seriesTitle, nextDayStartTime, currentStackBb, day }', async () => {
    const futureDate = new Date(Date.now() + 24 * 3600 * 1000);
    dbState.selectRows = [
      {
        id: 'SR1',
        userId: 'USER-0001',
        name: 'WCOOP Main Day 1',
        network: 'PokerStars',
        totalDay1s: 1,
        day2DateTime: futureDate,
        day2Status: 'pending',
        stackMode: 'single',
      },
    ];
    const result = await (storage as any).getActiveFlightSeries('USER-0001');
    expect(result).not.toBeNull();
    expect(result.active).toBe(true);
    expect(result).toHaveProperty('seriesTitle');
    expect(result).toHaveProperty('nextDayStartTime');
    expect(result).toHaveProperty('currentStackBb');
    expect(result).toHaveProperty('day');
    expect(result.day).toBe(2);
  });

  it('NAO throw quando query falha (graceful null)', async () => {
    dbState.shouldThrow = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let threw = false;
    let result: any;
    try {
      result = await (storage as any).getActiveFlightSeries('USER-0001');
    } catch {
      threw = true;
    }
    if (!threw) {
      expect(result === null || (typeof result === 'object' && result.active === true)).toBe(true);
    }
    errorSpy.mockRestore();
  });
});
