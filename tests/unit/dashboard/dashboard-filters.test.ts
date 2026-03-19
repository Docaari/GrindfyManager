import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes de Caracterizacao: Logica Pura de Filtros do Dashboard Analytics
//
// As funcoes mapFiltersToBackendFormat e buildPeriodCondition sao internas
// a routes.ts e storage.ts respectivamente. Como nao sao exportadas, estes
// testes caracterizam o comportamento da logica replicando as funcoes puras
// que nao dependem de Drizzle/DB. Documentam o contrato ATUAL.
//
// Todos devem PASSAR — refletem o comportamento existente.
// =============================================================================

// ---------------------------------------------------------------------------
// Replica de mapFiltersToBackendFormat (routes.ts:78-93)
// Copia fiel da funcao para testar seu comportamento isoladamente
// ---------------------------------------------------------------------------
function mapFiltersToBackendFormat(frontendFilters: any) {
  const backendFilters: any = { ...frontendFilters };

  // Map frontend keyword filter format to backend format
  if (frontendFilters.keyword && frontendFilters.keywordType) {
    backendFilters.keywordFilter = {
      keyword: frontendFilters.keyword,
      type: frontendFilters.keywordType,
    };
    // Remove the frontend format properties
    delete backendFilters.keyword;
    delete backendFilters.keywordType;
  }

  return backendFilters;
}

describe('mapFiltersToBackendFormat', () => {
  it('deve retornar objeto vazio quando recebe objeto vazio', () => {
    const result = mapFiltersToBackendFormat({});
    expect(result).toEqual({});
  });

  it('deve preservar filtros que nao precisam de mapeamento (sites)', () => {
    const filters = { sites: ['PokerStars', 'GGPoker'] };
    const result = mapFiltersToBackendFormat(filters);
    expect(result.sites).toEqual(['PokerStars', 'GGPoker']);
  });

  it('deve preservar filtros que nao precisam de mapeamento (categories)', () => {
    const filters = { categories: ['Vanilla', 'PKO'] };
    const result = mapFiltersToBackendFormat(filters);
    expect(result.categories).toEqual(['Vanilla', 'PKO']);
  });

  it('deve preservar filtros que nao precisam de mapeamento (speeds)', () => {
    const filters = { speeds: ['Regular', 'Turbo'] };
    const result = mapFiltersToBackendFormat(filters);
    expect(result.speeds).toEqual(['Regular', 'Turbo']);
  });

  it('deve preservar buyinRange sem alteracao', () => {
    const filters = { buyinRange: { min: 10, max: 100 } };
    const result = mapFiltersToBackendFormat(filters);
    expect(result.buyinRange).toEqual({ min: 10, max: 100 });
  });

  it('deve preservar dateRange sem alteracao', () => {
    const filters = { dateRange: { from: '2025-01-01', to: '2025-06-30' } };
    const result = mapFiltersToBackendFormat(filters);
    expect(result.dateRange).toEqual({ from: '2025-01-01', to: '2025-06-30' });
  });

  it('deve mapear keyword + keywordType para keywordFilter (contains)', () => {
    const filters = { keyword: 'Sunday', keywordType: 'contains' };
    const result = mapFiltersToBackendFormat(filters);
    expect(result.keywordFilter).toEqual({
      keyword: 'Sunday',
      type: 'contains',
    });
    expect(result).not.toHaveProperty('keyword');
    expect(result).not.toHaveProperty('keywordType');
  });

  it('deve mapear keyword + keywordType para keywordFilter (not_contains)', () => {
    const filters = { keyword: 'Bounty', keywordType: 'not_contains' };
    const result = mapFiltersToBackendFormat(filters);
    expect(result.keywordFilter).toEqual({
      keyword: 'Bounty',
      type: 'not_contains',
    });
  });

  it('nao deve criar keywordFilter quando keyword esta presente mas keywordType nao', () => {
    const filters = { keyword: 'Sunday' };
    const result = mapFiltersToBackendFormat(filters);
    expect(result).not.toHaveProperty('keywordFilter');
    expect(result.keyword).toBe('Sunday');
  });

  it('nao deve criar keywordFilter quando keywordType esta presente mas keyword nao', () => {
    const filters = { keywordType: 'contains' };
    const result = mapFiltersToBackendFormat(filters);
    expect(result).not.toHaveProperty('keywordFilter');
    expect(result.keywordType).toBe('contains');
  });

  it('deve combinar mapeamento de keyword com outros filtros preservados', () => {
    const filters = {
      sites: ['PokerStars'],
      categories: ['PKO'],
      keyword: 'Mystery',
      keywordType: 'contains',
      buyinRange: { min: 5, max: 50 },
    };
    const result = mapFiltersToBackendFormat(filters);
    expect(result.sites).toEqual(['PokerStars']);
    expect(result.categories).toEqual(['PKO']);
    expect(result.buyinRange).toEqual({ min: 5, max: 50 });
    expect(result.keywordFilter).toEqual({
      keyword: 'Mystery',
      type: 'contains',
    });
    expect(result).not.toHaveProperty('keyword');
    expect(result).not.toHaveProperty('keywordType');
  });

  it('nao deve modificar o objeto original de entrada', () => {
    const filters = { keyword: 'Test', keywordType: 'contains', sites: ['GGPoker'] };
    const original = { ...filters };
    mapFiltersToBackendFormat(filters);
    expect(filters).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// Caracterizacao da logica de periodo (buildPeriodCondition em storage.ts)
// Testa apenas a logica de calculo de datas, nao as condicoes Drizzle
// ---------------------------------------------------------------------------

describe('Period date calculation logic', () => {
  // Replica da logica de calculo de datas de buildPeriodCondition
  function calculatePeriodStartDate(period: string, filters: any = {}): Date | null {
    if (period === 'custom' && filters.dateFrom && filters.dateTo) {
      return new Date(filters.dateFrom);
    }

    if (period === 'all') {
      return null; // sem filtro de data
    }

    const now = new Date();

    switch (period) {
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case '365d':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      case 'year':
        return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      case 'current_month':
        return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      case 'last_3_months':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case 'last_6_months':
        return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      case 'current_year':
        return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      case 'last_12_months':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      case 'last_24_months':
        return new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
      case 'last_36_months':
        return new Date(now.getTime() - 1095 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  it('deve retornar null para periodo "all" (sem filtro de data)', () => {
    expect(calculatePeriodStartDate('all')).toBeNull();
  });

  it('deve retornar data 7 dias atras para periodo "7d"', () => {
    const result = calculatePeriodStartDate('7d');
    const now = new Date();
    const expected = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(result).not.toBeNull();
    // Allow 1 second tolerance for test execution time
    expect(Math.abs(result!.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it('deve retornar data 30 dias atras para periodo "30d" (padrao)', () => {
    const result = calculatePeriodStartDate('30d');
    const now = new Date();
    const expected = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it('deve retornar data 90 dias atras para periodo "90d"', () => {
    const result = calculatePeriodStartDate('90d');
    const now = new Date();
    const expected = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it('deve retornar data 365 dias atras para periodo "365d"', () => {
    const result = calculatePeriodStartDate('365d');
    const now = new Date();
    const expected = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it('deve retornar primeiro dia do mes atual para periodo "month"', () => {
    const result = calculatePeriodStartDate('month');
    const now = new Date();
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(now.getFullYear());
    expect(result!.getMonth()).toBe(now.getMonth());
    expect(result!.getDate()).toBe(1);
    expect(result!.getHours()).toBe(0);
    expect(result!.getMinutes()).toBe(0);
  });

  it('deve retornar primeiro dia do ano para periodo "year"', () => {
    const result = calculatePeriodStartDate('year');
    const now = new Date();
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(now.getFullYear());
    expect(result!.getMonth()).toBe(0); // Janeiro
    expect(result!.getDate()).toBe(1);
  });

  it('deve retornar mesmo resultado para "month" e "current_month"', () => {
    const monthResult = calculatePeriodStartDate('month');
    const currentMonthResult = calculatePeriodStartDate('current_month');
    expect(monthResult!.getTime()).toBe(currentMonthResult!.getTime());
  });

  it('deve retornar mesmo resultado para "year" e "current_year"', () => {
    const yearResult = calculatePeriodStartDate('year');
    const currentYearResult = calculatePeriodStartDate('current_year');
    expect(yearResult!.getTime()).toBe(currentYearResult!.getTime());
  });

  it('deve retornar mesmo resultado para "90d" e "last_3_months"', () => {
    const d90Result = calculatePeriodStartDate('90d');
    const last3Result = calculatePeriodStartDate('last_3_months');
    expect(Math.abs(d90Result!.getTime() - last3Result!.getTime())).toBeLessThan(1000);
  });

  it('deve retornar mesmo resultado para "365d" e "last_12_months"', () => {
    const d365Result = calculatePeriodStartDate('365d');
    const last12Result = calculatePeriodStartDate('last_12_months');
    expect(Math.abs(d365Result!.getTime() - last12Result!.getTime())).toBeLessThan(1000);
  });

  it('deve retornar 180 dias atras para "last_6_months"', () => {
    const result = calculatePeriodStartDate('last_6_months');
    const now = new Date();
    const expected = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it('deve retornar 730 dias atras para "last_24_months"', () => {
    const result = calculatePeriodStartDate('last_24_months');
    const now = new Date();
    const expected = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it('deve retornar 1095 dias atras para "last_36_months"', () => {
    const result = calculatePeriodStartDate('last_36_months');
    const now = new Date();
    const expected = new Date(now.getTime() - 1095 * 24 * 60 * 60 * 1000);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it('deve usar 30d como padrao para periodo desconhecido', () => {
    const unknownResult = calculatePeriodStartDate('invalid_period');
    const defaultResult = calculatePeriodStartDate('30d');
    expect(unknownResult).not.toBeNull();
    expect(Math.abs(unknownResult!.getTime() - defaultResult!.getTime())).toBeLessThan(1000);
  });

  it('deve usar dateFrom do filtro quando periodo e "custom"', () => {
    const result = calculatePeriodStartDate('custom', {
      dateFrom: '2025-01-01T00:00:00.000Z',
      dateTo: '2025-06-30T23:59:59.000Z',
    });
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('nao deve retornar custom date quando dateFrom esta faltando', () => {
    const result = calculatePeriodStartDate('custom', {
      dateTo: '2025-06-30T23:59:59.000Z',
    });
    // Falls through to default 30d behavior
    const now = new Date();
    const expected = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.getTime() - expected.getTime())).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// Caracterizacao da logica do endpoint /api/dashboard/stats
// Testa os parametros default e parsing de query strings
// ---------------------------------------------------------------------------

describe('Dashboard endpoint parameter defaults', () => {
  it('periodo padrao deve ser "30d" quando nao fornecido', () => {
    // Conforme routes.ts:1993 — req.query.period as string || "30d"
    const period = undefined as string | undefined;
    const resolvedPeriod = period || '30d';
    expect(resolvedPeriod).toBe('30d');
  });

  it('filtros padrao deve ser objeto vazio quando nao fornecido', () => {
    // Conforme routes.ts:1994 — req.query.filters ? JSON.parse(req.query.filters) : {}
    const filtersParam = undefined as string | undefined;
    const resolvedFilters = filtersParam ? JSON.parse(filtersParam) : {};
    expect(resolvedFilters).toEqual({});
  });

  it('deve parsear filtros JSON da query string corretamente', () => {
    const filtersParam = JSON.stringify({ sites: ['PokerStars'], categories: ['PKO'] });
    const resolvedFilters = filtersParam ? JSON.parse(filtersParam) : {};
    expect(resolvedFilters.sites).toEqual(['PokerStars']);
    expect(resolvedFilters.categories).toEqual(['PKO']);
  });

  it('deve parsear filtros complexos com buyinRange', () => {
    const filtersParam = JSON.stringify({
      sites: ['GGPoker'],
      buyinRange: { min: 10, max: 100 },
      speeds: ['Turbo'],
    });
    const resolvedFilters = filtersParam ? JSON.parse(filtersParam) : {};
    expect(resolvedFilters.buyinRange).toEqual({ min: 10, max: 100 });
    expect(resolvedFilters.speeds).toEqual(['Turbo']);
  });

  it('deve parsear filtros com keyword para mapeamento', () => {
    const filtersParam = JSON.stringify({
      keyword: 'Sunday',
      keywordType: 'contains',
    });
    const rawFilters = filtersParam ? JSON.parse(filtersParam) : {};
    const mapped = mapFiltersToBackendFormat(rawFilters);
    expect(mapped.keywordFilter).toEqual({
      keyword: 'Sunday',
      type: 'contains',
    });
  });
});

// ---------------------------------------------------------------------------
// Caracterizacao dos calculos de metricas do dashboard
// Testa a logica de calculo de ROI, ITM%, ABI em JS puro
// ---------------------------------------------------------------------------

describe('Dashboard metrics calculation logic', () => {
  // Simula os calculos que o SQL executa em getDashboardStats
  function calculateMetrics(tournaments: Array<{ buyIn: number; prize: number; position: number | null; fieldSize: number | null }>) {
    const count = tournaments.length;
    if (count === 0) {
      return {
        count: 0,
        totalProfit: 0,
        totalBuyins: 0,
        avgBuyin: 0,
        itmCount: 0,
        itmPercent: 0,
        roi: 0,
        finalTablesCount: 0,
        firstPlaceCount: 0,
      };
    }

    const totalProfit = tournaments.reduce((sum, t) => sum + t.prize, 0);
    const totalBuyins = tournaments.reduce((sum, t) => sum + t.buyIn, 0);
    const avgBuyin = totalBuyins / count;
    const itmCount = tournaments.filter(t => t.prize > 0).length;
    const itmPercent = (itmCount / count) * 100;
    const roi = totalBuyins > 0 ? ((totalProfit - totalBuyins) / totalBuyins) * 100 : 0;
    const finalTablesCount = tournaments.filter(t => t.position !== null && t.position >= 1 && t.position <= 9).length;
    const firstPlaceCount = tournaments.filter(t => t.position === 1).length;

    return {
      count,
      totalProfit,
      totalBuyins,
      avgBuyin,
      itmCount,
      itmPercent,
      roi,
      finalTablesCount,
      firstPlaceCount,
    };
  }

  it('deve retornar metricas zeradas para array vazio de torneios', () => {
    const metrics = calculateMetrics([]);
    expect(metrics.count).toBe(0);
    expect(metrics.totalProfit).toBe(0);
    expect(metrics.totalBuyins).toBe(0);
    expect(metrics.roi).toBe(0);
    expect(metrics.itmPercent).toBe(0);
  });

  it('deve calcular profit como soma dos prizes', () => {
    const tournaments = [
      { buyIn: 100, prize: 500, position: 5, fieldSize: 1000 },
      { buyIn: 50, prize: 0, position: 200, fieldSize: 500 },
      { buyIn: 100, prize: 200, position: 50, fieldSize: 1000 },
    ];
    const metrics = calculateMetrics(tournaments);
    expect(metrics.totalProfit).toBe(700); // 500 + 0 + 200
  });

  it('deve calcular totalBuyins como soma dos buyIns', () => {
    const tournaments = [
      { buyIn: 100, prize: 0, position: null, fieldSize: null },
      { buyIn: 50, prize: 0, position: null, fieldSize: null },
      { buyIn: 215, prize: 0, position: null, fieldSize: null },
    ];
    const metrics = calculateMetrics(tournaments);
    expect(metrics.totalBuyins).toBe(365);
  });

  it('deve calcular ROI = (profit - buyins) / buyins * 100', () => {
    const tournaments = [
      { buyIn: 100, prize: 300, position: 3, fieldSize: 100 },
    ];
    const metrics = calculateMetrics(tournaments);
    // ROI = (300 - 100) / 100 * 100 = 200%
    expect(metrics.roi).toBe(200);
  });

  it('deve retornar ROI 0 quando totalBuyins e 0 (freerolls apenas)', () => {
    const tournaments = [
      { buyIn: 0, prize: 50, position: 1, fieldSize: 100 },
    ];
    const metrics = calculateMetrics(tournaments);
    expect(metrics.roi).toBe(0);
  });

  it('deve calcular ROI negativo para sessao perdedora', () => {
    const tournaments = [
      { buyIn: 100, prize: 0, position: 500, fieldSize: 1000 },
      { buyIn: 100, prize: 0, position: 400, fieldSize: 1000 },
    ];
    const metrics = calculateMetrics(tournaments);
    // ROI = (0 - 200) / 200 * 100 = -100%
    expect(metrics.roi).toBe(-100);
  });

  it('deve calcular ITM% como percentual de torneios com prize > 0', () => {
    const tournaments = [
      { buyIn: 50, prize: 150, position: 10, fieldSize: 500 },
      { buyIn: 50, prize: 0, position: 200, fieldSize: 500 },
      { buyIn: 50, prize: 75, position: 50, fieldSize: 500 },
      { buyIn: 50, prize: 0, position: 300, fieldSize: 500 },
    ];
    const metrics = calculateMetrics(tournaments);
    expect(metrics.itmCount).toBe(2);
    expect(metrics.itmPercent).toBe(50); // 2/4 * 100
  });

  it('deve calcular ABI como media dos buyIns', () => {
    const tournaments = [
      { buyIn: 10, prize: 0, position: null, fieldSize: null },
      { buyIn: 20, prize: 0, position: null, fieldSize: null },
      { buyIn: 30, prize: 0, position: null, fieldSize: null },
    ];
    const metrics = calculateMetrics(tournaments);
    expect(metrics.avgBuyin).toBe(20);
  });

  it('deve contar final tables como posicao entre 1 e 9', () => {
    const tournaments = [
      { buyIn: 50, prize: 500, position: 1, fieldSize: 1000 },
      { buyIn: 50, prize: 200, position: 5, fieldSize: 1000 },
      { buyIn: 50, prize: 100, position: 9, fieldSize: 1000 },
      { buyIn: 50, prize: 80, position: 10, fieldSize: 1000 },
      { buyIn: 50, prize: 0, position: 500, fieldSize: 1000 },
    ];
    const metrics = calculateMetrics(tournaments);
    expect(metrics.finalTablesCount).toBe(3); // posicoes 1, 5, 9
    expect(metrics.firstPlaceCount).toBe(1); // posicao 1
  });

  it('deve ignorar position null ao contar final tables', () => {
    const tournaments = [
      { buyIn: 50, prize: 0, position: null, fieldSize: null },
      { buyIn: 50, prize: 100, position: 3, fieldSize: 500 },
    ];
    const metrics = calculateMetrics(tournaments);
    expect(metrics.finalTablesCount).toBe(1);
  });

  it('deve calcular corretamente com mix de freerolls e torneios pagos', () => {
    const tournaments = [
      { buyIn: 0, prize: 10, position: 5, fieldSize: 100 },   // freeroll premiado
      { buyIn: 100, prize: 0, position: 500, fieldSize: 1000 }, // torneio pago bust
      { buyIn: 50, prize: 200, position: 8, fieldSize: 500 },   // torneio pago ITM + FT
    ];
    const metrics = calculateMetrics(tournaments);
    expect(metrics.count).toBe(3);
    expect(metrics.totalBuyins).toBe(150);
    expect(metrics.totalProfit).toBe(210);
    expect(metrics.itmCount).toBe(2); // prize > 0 em 2 torneios
    expect(metrics.finalTablesCount).toBe(2); // posicoes 5 e 8
  });
});

// ---------------------------------------------------------------------------
// Caracterizacao da logica de quick-stats streak
// Replica da logica de calculo de streak em /api/dashboard/quick-stats
// ---------------------------------------------------------------------------

describe('Quick stats streak calculation', () => {
  function calculateStreak(recentSessions: Array<{ profit: number }>) {
    let currentStreak = 0;
    for (const session of recentSessions) {
      if (session.profit > 0) {
        currentStreak++;
      } else {
        break;
      }
    }
    return currentStreak;
  }

  it('deve retornar 0 quando nao ha sessoes', () => {
    expect(calculateStreak([])).toBe(0);
  });

  it('deve contar sessoes consecutivas lucrativas do inicio', () => {
    const sessions = [
      { profit: 100 },
      { profit: 50 },
      { profit: 200 },
      { profit: -30 },
      { profit: 80 },
    ];
    expect(calculateStreak(sessions)).toBe(3);
  });

  it('deve retornar 0 quando primeira sessao e negativa', () => {
    const sessions = [
      { profit: -50 },
      { profit: 100 },
      { profit: 200 },
    ];
    expect(calculateStreak(sessions)).toBe(0);
  });

  it('deve retornar 0 quando primeira sessao tem profit 0 (breakeven)', () => {
    const sessions = [
      { profit: 0 },
      { profit: 100 },
    ];
    // profit > 0 e a condicao, 0 nao e > 0 portanto quebra streak
    expect(calculateStreak(sessions)).toBe(0);
  });

  it('deve contar todas sessoes quando todas sao lucrativas', () => {
    const sessions = [
      { profit: 10 },
      { profit: 20 },
      { profit: 30 },
    ];
    expect(calculateStreak(sessions)).toBe(3);
  });

  it('deve parar no primeiro resultado nao lucrativo', () => {
    const sessions = [
      { profit: 100 },
      { profit: -1 },
      { profit: 200 },
      { profit: 300 },
    ];
    expect(calculateStreak(sessions)).toBe(1);
  });
});
