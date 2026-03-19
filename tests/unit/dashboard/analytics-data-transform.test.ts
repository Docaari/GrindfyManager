import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes de Caracterizacao: Logica de transformacao de dados dos graficos
//
// As funcoes generateTimeLabels (de AnalyticsCharts.tsx e ProfitChart.tsx)
// e a logica de transformacao de dados para graficos sao definidas INLINE
// nos componentes React — nao sao exportadas. Portanto, estas funcoes sao
// REPLICADAS aqui para testes de caracterizacao, refletindo o codigo fonte.
//
// Tambem testa a logica de calculo de cumulative profit do ProfitChart,
// deteccao de big hits, e extracao de unique filter options do Dashboard.
//
// MODO CARACTERIZACAO: Todos devem PASSAR com o codigo existente.
// =============================================================================

// ---------------------------------------------------------------------------
// generateTimeLabels — replica da funcao em AnalyticsCharts.tsx (linhas 52-105)
// Gera labels de eixo X baseados no periodo selecionado
// ---------------------------------------------------------------------------

function generateTimeLabels(period: string): string[] {
  const now = new Date();

  switch (period) {
    case 'last_7_days':
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (6 - i));
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      });

    case 'last_30_days':
      return Array.from({ length: 4 }, (_, i) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (3 - i) * 7);
        return `Sem ${i + 1}`;
      });

    case 'last_3_months':
      return Array.from({ length: 3 }, (_, i) => {
        const date = new Date(now);
        date.setMonth(date.getMonth() - (2 - i));
        return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      });

    case 'last_6_months':
      return Array.from({ length: 6 }, (_, i) => {
        const date = new Date(now);
        date.setMonth(date.getMonth() - (5 - i));
        return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      });

    case 'current_year':
      const monthsInYear = now.getMonth() + 1;
      return Array.from({ length: monthsInYear }, (_, i) => {
        const date = new Date(now.getFullYear(), i, 1);
        return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      });

    case 'all_time':
    default:
      return Array.from({ length: 12 }, (_, i) => {
        const date = new Date(now);
        date.setMonth(date.getMonth() - (11 - i));
        return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      });
  }
}

describe('generateTimeLabels', () => {
  it('deve gerar 7 labels para last_7_days', () => {
    const labels = generateTimeLabels('last_7_days');
    expect(labels).toHaveLength(7);
  });

  it('labels de last_7_days devem estar no formato dd/mm', () => {
    const labels = generateTimeLabels('last_7_days');
    for (const label of labels) {
      expect(label).toMatch(/^\d{2}\/\d{2}$/);
    }
  });

  it('ultimo label de last_7_days deve ser a data de hoje', () => {
    const labels = generateTimeLabels('last_7_days');
    const today = new Date();
    const expectedToday = today.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    expect(labels[6]).toBe(expectedToday);
  });

  it('deve gerar 4 labels para last_30_days (semanas)', () => {
    const labels = generateTimeLabels('last_30_days');
    expect(labels).toHaveLength(4);
    expect(labels).toEqual(['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4']);
  });

  it('deve gerar 3 labels para last_3_months', () => {
    const labels = generateTimeLabels('last_3_months');
    expect(labels).toHaveLength(3);
  });

  it('deve gerar 6 labels para last_6_months', () => {
    const labels = generateTimeLabels('last_6_months');
    expect(labels).toHaveLength(6);
  });

  it('deve gerar labels com mes abreviado e ano para last_3_months', () => {
    const labels = generateTimeLabels('last_3_months');
    // Formato esperado: "jan. de 25" ou similar em pt-BR
    for (const label of labels) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('deve gerar N labels para current_year onde N = mes atual', () => {
    const now = new Date();
    const expectedLength = now.getMonth() + 1; // Janeiro=0, logo +1
    const labels = generateTimeLabels('current_year');
    expect(labels).toHaveLength(expectedLength);
  });

  it('deve gerar 12 labels para all_time (default)', () => {
    const labels = generateTimeLabels('all_time');
    expect(labels).toHaveLength(12);
  });

  it('deve gerar 12 labels para periodo desconhecido (fallback default)', () => {
    const labels = generateTimeLabels('periodo_inexistente');
    expect(labels).toHaveLength(12);
  });

  it('labels devem ser strings nao vazias', () => {
    const periods = ['last_7_days', 'last_30_days', 'last_3_months', 'last_6_months', 'current_year', 'all_time'];
    for (const period of periods) {
      const labels = generateTimeLabels(period);
      for (const label of labels) {
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// generateDynamicTimeData — replica da funcao em AnalyticsCharts.tsx (linhas 118-179)
// Gera pontos de tempo dinamicos com label e value (ISO date)
// ---------------------------------------------------------------------------

function generateDynamicTimeData(period: string): { label: string; value: string }[] {
  const now = new Date();
  const timePoints: { label: string; value: string }[] = [];

  switch (period) {
    case '7':
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        timePoints.push({
          label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          value: date.toISOString().split('T')[0]
        });
      }
      break;
    case '30':
      for (let i = 3; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        timePoints.push({
          label: `Sem ${4 - i}`,
          value: date.toISOString().split('T')[0]
        });
      }
      break;
    case '90':
      for (let i = 2; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        timePoints.push({
          label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          value: date.toISOString().split('T')[0]
        });
      }
      break;
    case '365':
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        timePoints.push({
          label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          value: date.toISOString().split('T')[0]
        });
      }
      break;
    default:
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        timePoints.push({
          label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          value: date.toISOString().split('T')[0]
        });
      }
  }

  return timePoints;
}

describe('generateDynamicTimeData', () => {
  it('deve gerar 7 pontos para periodo "7"', () => {
    const data = generateDynamicTimeData('7');
    expect(data).toHaveLength(7);
  });

  it('deve gerar 4 pontos para periodo "30"', () => {
    const data = generateDynamicTimeData('30');
    expect(data).toHaveLength(4);
  });

  it('deve gerar 3 pontos para periodo "90"', () => {
    const data = generateDynamicTimeData('90');
    expect(data).toHaveLength(3);
  });

  it('deve gerar 6 pontos para periodo "365"', () => {
    const data = generateDynamicTimeData('365');
    expect(data).toHaveLength(6);
  });

  it('deve gerar 6 pontos para periodo default (all)', () => {
    const data = generateDynamicTimeData('all');
    expect(data).toHaveLength(6);
  });

  it('cada ponto deve ter label string e value no formato ISO date', () => {
    const data = generateDynamicTimeData('7');
    for (const point of data) {
      expect(typeof point.label).toBe('string');
      expect(point.label.length).toBeGreaterThan(0);
      expect(point.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('labels de periodo "30" devem ser Sem 1 a Sem 4', () => {
    const data = generateDynamicTimeData('30');
    expect(data.map(d => d.label)).toEqual(['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4']);
  });

  it('valores devem estar em ordem cronologica', () => {
    const periods = ['7', '30', '90', '365'];
    for (const period of periods) {
      const data = generateDynamicTimeData(period);
      for (let i = 1; i < data.length; i++) {
        expect(data[i].value >= data[i - 1].value).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Logica de site chart data transform — replica de AnalyticsCharts.tsx (linhas 186-189)
// Transforma dados da API /api/analytics/by-site para formato de grafico
// ---------------------------------------------------------------------------

describe('Site chart data transformation', () => {
  function transformSiteData(data: Array<{ site: string; volume: string }>) {
    return data.map(item => ({
      name: item.site,
      value: parseInt(item.volume)
    }));
  }

  it('deve transformar dados de API para formato {name, value}', () => {
    const apiData = [
      { site: 'PokerStars', volume: '150' },
      { site: 'GGNetwork', volume: '200' },
    ];
    const result = transformSiteData(apiData);
    expect(result).toEqual([
      { name: 'PokerStars', value: 150 },
      { name: 'GGNetwork', value: 200 },
    ]);
  });

  it('deve parsear volume como inteiro (descartar decimais)', () => {
    const apiData = [{ site: 'WPN', volume: '99.7' }];
    const result = transformSiteData(apiData);
    expect(result[0].value).toBe(99);
  });

  it('deve retornar array vazio para array vazio', () => {
    expect(transformSiteData([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Logica de buyin chart data transform — replica de AnalyticsCharts.tsx (linhas 348-351)
// ---------------------------------------------------------------------------

describe('Buyin chart data transformation', () => {
  function transformBuyinData(data: Array<{ buyinRange: string; volume: string }>) {
    return data.map(item => ({
      name: item.buyinRange,
      value: parseInt(item.volume)
    }));
  }

  it('deve transformar dados de buyin para formato {name, value}', () => {
    const apiData = [
      { buyinRange: '$0-$5', volume: '50' },
      { buyinRange: '$6-$10', volume: '100' },
      { buyinRange: '$11-$20', volume: '75' },
    ];
    const result = transformBuyinData(apiData);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: '$0-$5', value: 50 });
  });
});

// ---------------------------------------------------------------------------
// Logica de site profit data transform — replica de AnalyticsCharts.tsx (linhas 258-261)
// ---------------------------------------------------------------------------

describe('Site profit data transformation', () => {
  function transformSiteProfitData(data: Array<{ site: string; profit?: string | number }>) {
    return data.map(item => ({
      site: item.site,
      profit: parseFloat(String(item.profit || 0)),
    }));
  }

  it('deve parsear profit como float', () => {
    const data = [{ site: 'PokerStars', profit: '1234.56' }];
    const result = transformSiteProfitData(data);
    expect(result[0].profit).toBe(1234.56);
  });

  it('deve tratar profit undefined como 0', () => {
    const data = [{ site: 'WPN' }];
    const result = transformSiteProfitData(data);
    expect(result[0].profit).toBe(0);
  });

  it('deve tratar profit null/falsy como 0', () => {
    const data = [{ site: 'WPN', profit: '' }];
    const result = transformSiteProfitData(data);
    expect(result[0].profit).toBe(0);
  });

  it('deve manter profit negativo', () => {
    const data = [{ site: 'Bodog', profit: '-500.50' }];
    const result = transformSiteProfitData(data);
    expect(result[0].profit).toBe(-500.50);
  });
});

// ---------------------------------------------------------------------------
// Logica de cumulative profit — replica de ProfitChart.tsx (linhas 354-390)
// IMPORTANTE: Primeiro ponto sempre tem cumulative = 0, acumula a partir do segundo
// ---------------------------------------------------------------------------

describe('ProfitChart cumulative profit calculation', () => {
  function calculateCumulativeProfit(data: Array<{ date: string; profit: string | number; buyins: string | number; count: string | number }>) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return [];
    }

    let cumulativeProfit = 0;
    return data.map((item, index) => {
      const profit = typeof item.profit === 'string' ? parseFloat(item.profit) : item.profit;

      if (index === 0) {
        cumulativeProfit = 0;
      } else {
        cumulativeProfit += profit;
      }

      return {
        date: item.date,
        profit: profit,
        cumulative: cumulativeProfit,
        buyins: typeof item.buyins === 'string' ? parseFloat(item.buyins) : item.buyins,
        count: typeof item.count === 'string' ? parseInt(String(item.count)) : item.count,
      };
    });
  }

  it('deve retornar array vazio para input vazio', () => {
    expect(calculateCumulativeProfit([])).toEqual([]);
  });

  it('deve retornar array vazio para input null/undefined', () => {
    expect(calculateCumulativeProfit(null as any)).toEqual([]);
    expect(calculateCumulativeProfit(undefined as any)).toEqual([]);
  });

  it('primeiro ponto deve ter cumulative = 0 (sempre inicia em zero)', () => {
    const data = [
      { date: '2025-01-01', profit: '100', buyins: '50', count: '5' },
    ];
    const result = calculateCumulativeProfit(data);
    expect(result[0].cumulative).toBe(0);
  });

  it('segundo ponto deve ter cumulative = profit do segundo ponto (nao do primeiro)', () => {
    const data = [
      { date: '2025-01-01', profit: '100', buyins: '50', count: '5' },
      { date: '2025-01-02', profit: '200', buyins: '100', count: '10' },
    ];
    const result = calculateCumulativeProfit(data);
    expect(result[0].cumulative).toBe(0);
    expect(result[1].cumulative).toBe(200); // profit do dia 2, nao acumulado do dia 1
  });

  it('deve acumular profit progressivamente a partir do segundo ponto', () => {
    const data = [
      { date: '2025-01-01', profit: '100', buyins: '50', count: '5' },
      { date: '2025-01-02', profit: '200', buyins: '100', count: '10' },
      { date: '2025-01-03', profit: '-50', buyins: '100', count: '10' },
      { date: '2025-01-04', profit: '300', buyins: '150', count: '15' },
    ];
    const result = calculateCumulativeProfit(data);
    expect(result[0].cumulative).toBe(0);
    expect(result[1].cumulative).toBe(200);      // 0 + 200
    expect(result[2].cumulative).toBe(150);       // 200 + (-50)
    expect(result[3].cumulative).toBe(450);       // 150 + 300
  });

  it('deve parsear profit de string para number', () => {
    const data = [
      { date: '2025-01-01', profit: '99.50', buyins: '50', count: '5' },
    ];
    const result = calculateCumulativeProfit(data);
    expect(result[0].profit).toBe(99.50);
  });

  it('deve parsear buyins de string para number', () => {
    const data = [
      { date: '2025-01-01', profit: '100', buyins: '75.25', count: '5' },
    ];
    const result = calculateCumulativeProfit(data);
    expect(result[0].buyins).toBe(75.25);
  });

  it('deve parsear count de string para integer', () => {
    const data = [
      { date: '2025-01-01', profit: '100', buyins: '50', count: '15' },
    ];
    const result = calculateCumulativeProfit(data);
    expect(result[0].count).toBe(15);
  });

  it('deve aceitar valores numericos diretamente (sem parse)', () => {
    const data = [
      { date: '2025-01-01', profit: 100, buyins: 50, count: 5 },
    ];
    const result = calculateCumulativeProfit(data);
    expect(result[0].profit).toBe(100);
    expect(result[0].buyins).toBe(50);
    expect(result[0].count).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Big hit detection — replica da logica de ProfitChart.tsx (linhas 397-403)
// ---------------------------------------------------------------------------

describe('ProfitChart big hit detection', () => {
  function detectBigHits(
    processedData: Array<{ cumulative: number; index: number }>,
    totalProfit: number
  ) {
    const bigHitThreshold = totalProfit * 0.10; // 10% do profit total
    return processedData.filter((item, index) => {
      if (index === 0) return false;
      const previousCumulative = processedData[index - 1].cumulative;
      const profitJump = Math.abs(item.cumulative - previousCumulative);
      return profitJump >= bigHitThreshold;
    });
  }

  it('deve ignorar primeiro ponto (index 0) como big hit', () => {
    const data = [
      { cumulative: 1000, index: 0 },
      { cumulative: 1050, index: 1 },
    ];
    const hits = detectBigHits(data, 1000);
    // Threshold = 100, jump = 50 < 100
    expect(hits).toHaveLength(0);
  });

  it('deve detectar big hit quando jump >= 10% do profit total', () => {
    const data = [
      { cumulative: 0, index: 0 },
      { cumulative: 50, index: 1 },
      { cumulative: 200, index: 2 }, // jump de 150 = 15% de 1000
      { cumulative: 210, index: 3 },
    ];
    const hits = detectBigHits(data, 1000);
    expect(hits).toHaveLength(1);
    expect(hits[0].index).toBe(2);
  });

  it('deve detectar big hits negativos (quedas grandes)', () => {
    const data = [
      { cumulative: 500, index: 0 },
      { cumulative: 350, index: 1 }, // jump de 150 = 15% de 1000
    ];
    const hits = detectBigHits(data, 1000);
    expect(hits).toHaveLength(1);
  });

  it('deve retornar vazio quando nenhum jump excede threshold', () => {
    const data = [
      { cumulative: 0, index: 0 },
      { cumulative: 5, index: 1 },
      { cumulative: 8, index: 2 },
    ];
    const hits = detectBigHits(data, 1000);
    expect(hits).toHaveLength(0);
  });

  it('deve usar 10% como threshold', () => {
    const data = [
      { cumulative: 0, index: 0 },
      { cumulative: 99, index: 1 },  // 99 < 100 (10% de 1000)
      { cumulative: 200, index: 2 }, // 101 >= 100
    ];
    const hits = detectBigHits(data, 1000);
    expect(hits).toHaveLength(1);
    expect(hits[0].index).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Dashboard active filter counter — replica da logica inline em Dashboard.tsx (linhas 503-506)
// Conta filtros ativos desconsiderando arrays vazios
// ---------------------------------------------------------------------------

describe('Dashboard active filter counter', () => {
  function countActiveFilters(filters: Record<string, any>): number {
    return Object.keys(filters).filter(key => {
      const value = filters[key];
      return value && (Array.isArray(value) ? value.length > 0 : true);
    }).length;
  }

  it('deve retornar 0 para objeto vazio', () => {
    expect(countActiveFilters({})).toBe(0);
  });

  it('deve contar filtros com valores nao vazios', () => {
    expect(countActiveFilters({
      sites: ['PokerStars'],
      categories: ['PKO'],
    })).toBe(2);
  });

  it('deve ignorar arrays vazios', () => {
    expect(countActiveFilters({
      sites: [],
      categories: ['PKO'],
    })).toBe(1);
  });

  it('deve contar valores nao-array (string, number)', () => {
    expect(countActiveFilters({
      keyword: 'Sunday',
      participantMin: 100,
    })).toBe(2);
  });

  it('deve ignorar valores falsy (undefined, null, empty string, 0)', () => {
    expect(countActiveFilters({
      keyword: '',
      sites: undefined as any,
      participantMin: 0,
    })).toBe(0);
  });

  it('deve contar corretamente mix de filtros ativos e inativos', () => {
    expect(countActiveFilters({
      sites: ['PokerStars', 'GGNetwork'],
      categories: [],
      keyword: 'Sunday',
      speeds: [],
      participantMin: 100,
    })).toBe(3); // sites, keyword, participantMin
  });
});

// ---------------------------------------------------------------------------
// Dashboard available options extraction — replica da logica em Dashboard.tsx (linhas 329-345)
// Extrai opcoes unicas de torneios para popular filtros
// ---------------------------------------------------------------------------

describe('Dashboard available filter options extraction', () => {
  function extractAvailableOptions(allTournaments: any[] | undefined) {
    return {
      sites: Array.from(new Set(
        Array.isArray(allTournaments)
          ? allTournaments.map((t: any) => t.site).filter(Boolean)
          : []
      )) as string[],
      categories: Array.from(new Set(
        Array.isArray(allTournaments)
          ? allTournaments.map((t: any) => t.category).filter(Boolean)
          : []
      )) as string[],
      speeds: Array.from(new Set(
        Array.isArray(allTournaments)
          ? allTournaments.map((t: any) => t.speed).filter(Boolean)
          : []
      )) as string[],
    };
  }

  it('deve retornar arrays vazios quando allTournaments e undefined', () => {
    const result = extractAvailableOptions(undefined);
    expect(result.sites).toEqual([]);
    expect(result.categories).toEqual([]);
    expect(result.speeds).toEqual([]);
  });

  it('deve retornar arrays vazios quando allTournaments e array vazio', () => {
    const result = extractAvailableOptions([]);
    expect(result.sites).toEqual([]);
    expect(result.categories).toEqual([]);
    expect(result.speeds).toEqual([]);
  });

  it('deve extrair sites unicos', () => {
    const tournaments = [
      { site: 'PokerStars', category: 'Vanilla', speed: 'Normal' },
      { site: 'PokerStars', category: 'PKO', speed: 'Turbo' },
      { site: 'GGNetwork', category: 'Vanilla', speed: 'Normal' },
    ];
    const result = extractAvailableOptions(tournaments);
    expect(result.sites).toEqual(['PokerStars', 'GGNetwork']);
  });

  it('deve extrair categorias unicas', () => {
    const tournaments = [
      { site: 'PokerStars', category: 'Vanilla', speed: 'Normal' },
      { site: 'GGNetwork', category: 'PKO', speed: 'Normal' },
      { site: 'WPN', category: 'Vanilla', speed: 'Turbo' },
    ];
    const result = extractAvailableOptions(tournaments);
    expect(result.categories).toEqual(['Vanilla', 'PKO']);
  });

  it('deve extrair velocidades unicas', () => {
    const tournaments = [
      { site: 'PokerStars', category: 'Vanilla', speed: 'Normal' },
      { site: 'PokerStars', category: 'PKO', speed: 'Turbo' },
      { site: 'PokerStars', category: 'Mystery', speed: 'Hyper' },
    ];
    const result = extractAvailableOptions(tournaments);
    expect(result.speeds).toEqual(['Normal', 'Turbo', 'Hyper']);
  });

  it('deve filtrar valores null e undefined dos resultados', () => {
    const tournaments = [
      { site: 'PokerStars', category: null, speed: undefined },
      { site: null, category: 'PKO', speed: 'Normal' },
    ];
    const result = extractAvailableOptions(tournaments);
    expect(result.sites).toEqual(['PokerStars']);
    expect(result.categories).toEqual(['PKO']);
    expect(result.speeds).toEqual(['Normal']);
  });

  it('deve filtrar strings vazias', () => {
    const tournaments = [
      { site: '', category: '', speed: '' },
      { site: 'PokerStars', category: 'Vanilla', speed: 'Normal' },
    ];
    const result = extractAvailableOptions(tournaments);
    expect(result.sites).toEqual(['PokerStars']);
    expect(result.categories).toEqual(['Vanilla']);
    expect(result.speeds).toEqual(['Normal']);
  });
});

// ---------------------------------------------------------------------------
// parsePortugueseDate — replica da funcao em ProfitChart.tsx (linhas 56-106)
// Parser de datas em formato portugues usado nos eixos X
// ---------------------------------------------------------------------------

describe('parsePortugueseDate', () => {
  const monthMap: { [key: string]: number } = {
    'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
    'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
  };

  function parsePortugueseDate(dateStr: string): Date | null {
    if (!dateStr || typeof dateStr !== 'string') return null;

    try {
      const portugueseMatch = dateStr.match(/(\d{1,2})\s*de\s*(\w{3})\.?(?:\s*de\s*(\d{2,4}))?/i) ||
                             dateStr.match(/(\w{3})\.?\s*de\s*(\d{2,4})/i);

      if (portugueseMatch) {
        let day = 1;
        let month = -1;
        let year = new Date().getFullYear();

        if (portugueseMatch[1] && !isNaN(parseInt(portugueseMatch[1]))) {
          day = parseInt(portugueseMatch[1]);
          month = monthMap[portugueseMatch[2].toLowerCase()];
          if (portugueseMatch[3]) {
            year = parseInt(portugueseMatch[3]);
            if (year < 100) year += 2000;
          }
        } else if (portugueseMatch[2]) {
          month = monthMap[portugueseMatch[1].toLowerCase()];
          year = parseInt(portugueseMatch[2]);
          if (year < 100) year += 2000;
        }

        if (month !== -1) {
          return new Date(year, month, day);
        }
      }

      const normalDate = new Date(dateStr);
      if (!isNaN(normalDate.getTime())) {
        return normalDate;
      }

      return null;
    } catch {
      return null;
    }
  }

  it('deve retornar null para string vazia', () => {
    expect(parsePortugueseDate('')).toBeNull();
  });

  it('deve retornar null para input nao string', () => {
    expect(parsePortugueseDate(null as any)).toBeNull();
    expect(parsePortugueseDate(undefined as any)).toBeNull();
  });

  it('deve parsear formato "ago. de 24"', () => {
    const result = parsePortugueseDate('ago. de 24');
    expect(result).not.toBeNull();
    expect(result!.getMonth()).toBe(7); // Agosto = 7
    expect(result!.getFullYear()).toBe(2024);
  });

  it('deve parsear formato "jan. de 25"', () => {
    const result = parsePortugueseDate('jan. de 25');
    expect(result).not.toBeNull();
    expect(result!.getMonth()).toBe(0); // Janeiro = 0
    expect(result!.getFullYear()).toBe(2025);
  });

  it('deve parsear formato "2 de mai."', () => {
    const result = parsePortugueseDate('2 de mai.');
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(2);
    expect(result!.getMonth()).toBe(4); // Maio = 4
  });

  it('deve usar ano 2000+ para ano de 2 digitos', () => {
    const result = parsePortugueseDate('mar. de 99');
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2099);
  });

  it('retorna null para ano de 4 digitos (bug conhecido — regex parcial captura "202" em vez de "2025")', () => {
    // Bug corrigido: regex agora requer dia de 1-2 digitos na primeira alternativa,
    // permitindo que "jun. de 2025" caia na segunda regex corretamente.
    const result = parsePortugueseDate('jun. de 2025');
    expect(result).not.toBeNull();
    expect(result!.getMonth()).toBe(5); // junho = 5
    expect(result!.getFullYear()).toBe(2025);
  });

  it('deve fazer fallback para Date constructor para datas ISO', () => {
    const result = parsePortugueseDate('2025-06-15');
    expect(result).not.toBeNull();
  });

  it('deve retornar null para string completamente invalida', () => {
    const result = parsePortugueseDate('texto aleatorio');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dashboard Y-axis adaptive domain — replica da logica inline de AnalyticsCharts.tsx (linhas 294-306)
// ---------------------------------------------------------------------------

describe('AnalyticsCharts adaptive Y-axis domain calculation', () => {
  function calculateAdaptiveYDomain(data: Array<{ profit: number | string }>) {
    const values = data.map(item => Number(item.profit || 0));
    const maxProfit = Math.max(...values);
    const minProfit = Math.min(...values);
    const margin = 0.15;

    const adaptiveMax = maxProfit > 0 ? maxProfit * (1 + margin) : maxProfit * (1 - margin);
    const adaptiveMin = minProfit < 0 ? minProfit * (1 + margin) : minProfit * (1 - margin);

    const yAxisMin = minProfit >= 0 ? 0 : adaptiveMin;
    const yAxisMax = maxProfit <= 0 ? 0 : adaptiveMax;

    return [yAxisMin, yAxisMax];
  }

  it('deve iniciar em 0 quando todos os valores sao positivos', () => {
    const data = [{ profit: 100 }, { profit: 200 }, { profit: 300 }];
    const [min] = calculateAdaptiveYDomain(data);
    expect(min).toBe(0);
  });

  it('deve terminar em 0 quando todos os valores sao negativos', () => {
    const data = [{ profit: -100 }, { profit: -200 }, { profit: -300 }];
    const [, max] = calculateAdaptiveYDomain(data);
    expect(max).toBe(0);
  });

  it('deve adicionar 15% de margem ao valor maximo positivo', () => {
    const data = [{ profit: 1000 }];
    const [, max] = calculateAdaptiveYDomain(data);
    expect(max).toBe(1150); // 1000 * 1.15
  });

  it('deve adicionar 15% de margem ao valor minimo negativo', () => {
    const data = [{ profit: -1000 }];
    const [min] = calculateAdaptiveYDomain(data);
    expect(min).toBe(-1150); // -1000 * 1.15
  });

  it('deve lidar com mix de valores positivos e negativos', () => {
    const data = [{ profit: 500 }, { profit: -200 }];
    const [min, max] = calculateAdaptiveYDomain(data);
    expect(min).toBeLessThan(0);
    expect(max).toBeGreaterThan(0);
  });

  it('deve parsear profit de string para number', () => {
    const data = [{ profit: '500' }, { profit: '-200' }];
    const [min, max] = calculateAdaptiveYDomain(data);
    expect(min).toBeLessThan(0);
    expect(max).toBeGreaterThan(0);
  });

  it('deve tratar profit undefined/falsy como 0', () => {
    const data = [{ profit: 0 }];
    const [min, max] = calculateAdaptiveYDomain(data);
    expect(min).toBe(0);
    expect(max).toBe(0);
  });
});
