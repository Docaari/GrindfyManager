import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: Leak Detection (Coach Tecnico)
//
// Testa o modulo de deteccao automatica de leaks baseado em regras (rule-based).
// Modulo alvo: server/coachLeakDetection.ts (AINDA NAO EXISTE)
//
// Todos devem FALHAR (red phase) — Implementer criara o modulo.
// =============================================================================

// O modulo que o Implementer vai criar
import { detectLeaks, type Leak } from '../../../server/coachLeakDetection';

// ---------------------------------------------------------------------------
// Tipos de dados de entrada para o leak detector
// ---------------------------------------------------------------------------
type LeakDetectionInput = {
  analyticsByCategory: Array<{
    category: string;
    speed: string;
    roi: number;
    count: number;
  }>;
  analyticsBySite: Array<{
    site: string;
    roi: number;
    count: number;
  }>;
  overallRoi: number;
  earlyFinishRate: number;
  finalTables: number;
  cravadas: number;
  analyticsByMonth: Array<{
    month: string;
    roi: number;
    count: number;
  }>;
  totalTournaments: number;
  lastStudySessionDays?: number; // dias desde a ultima sessao de estudo
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseInput: LeakDetectionInput = {
  analyticsByCategory: [
    { category: 'Vanilla', speed: 'Regular', roi: 15.0, count: 200 },
    { category: 'PKO', speed: 'Turbo', roi: -8.2, count: 45 },
    { category: 'Vanilla', speed: 'Turbo', roi: -6.0, count: 80 },
    { category: 'PKO', speed: 'Regular', roi: 10.0, count: 100 },
  ],
  analyticsBySite: [
    { site: 'PokerStars', roi: 15.3, count: 800 },
    { site: 'GGPoker', roi: 2.0, count: 400 },
    { site: '888poker', roi: -5.0, count: 50 },
  ],
  overallRoi: 12.5,
  earlyFinishRate: 16.5,
  finalTables: 45,
  cravadas: 3,
  analyticsByMonth: [
    { month: '2026-01', roi: 18.0, count: 200 },
    { month: '2026-02', roi: 15.0, count: 180 },
    { month: '2026-03', roi: 12.0, count: 190 },
    { month: '2025-10', roi: 20.0, count: 160 },
    { month: '2025-11', roi: 22.0, count: 170 },
    { month: '2025-12', roi: 19.0, count: 180 },
  ],
  totalTournaments: 1500,
  lastStudySessionDays: 45,
};

// ---------------------------------------------------------------------------
// Deteccao de leak: ROI negativo por formato
// ---------------------------------------------------------------------------
describe('Leak: ROI negativo por formato (category + speed)', () => {
  it('deve detectar leak quando ROI < -5% com N >= 30 torneios', () => {
    const leaks = detectLeaks(baseInput);

    const formatLeaks = leaks.filter((l: Leak) => l.type === 'roi_by_format');
    expect(formatLeaks.length).toBeGreaterThanOrEqual(1);

    // PKO Turbo com ROI -8.2% e 45 torneios deve ser detectado
    const pkoTurboLeak = formatLeaks.find((l: Leak) =>
      l.description.includes('PKO') && l.description.includes('Turbo')
    );
    expect(pkoTurboLeak).toBeDefined();
  });

  it('deve detectar multiplos formatos com ROI negativo', () => {
    const leaks = detectLeaks(baseInput);

    const formatLeaks = leaks.filter((l: Leak) => l.type === 'roi_by_format');
    // PKO Turbo (-8.2%, 45 torneios) e Vanilla Turbo (-6.0%, 80 torneios)
    expect(formatLeaks.length).toBe(2);
  });

  it('NAO deve detectar leak quando ROI e negativo mas acima de -5%', () => {
    const input = {
      ...baseInput,
      analyticsByCategory: [
        { category: 'Vanilla', speed: 'Turbo', roi: -3.0, count: 50 },
      ],
    };
    const leaks = detectLeaks(input);

    const formatLeaks = leaks.filter((l: Leak) => l.type === 'roi_by_format');
    expect(formatLeaks.length).toBe(0);
  });

  it('NAO deve reportar leak com amostra insuficiente (< 30 torneios)', () => {
    const input = {
      ...baseInput,
      analyticsByCategory: [
        { category: 'PKO', speed: 'Hyper', roi: -20.0, count: 15 },
      ],
    };
    const leaks = detectLeaks(input);

    const formatLeaks = leaks.filter((l: Leak) => l.type === 'roi_by_format');
    expect(formatLeaks.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Deteccao de leak: Performance fraca em site especifico
// ---------------------------------------------------------------------------
describe('Leak: Performance fraca em site especifico', () => {
  it('deve detectar quando ROI de um site < ROI geral - 10pp com N >= 30', () => {
    const leaks = detectLeaks(baseInput);

    const siteLeaks = leaks.filter((l: Leak) => l.type === 'weak_site');
    // 888poker: ROI -5.0 vs overall 12.5 = diferenca de 17.5pp
    expect(siteLeaks.length).toBeGreaterThanOrEqual(1);

    const leak888 = siteLeaks.find((l: Leak) => l.description.includes('888poker'));
    expect(leak888).toBeDefined();
  });

  it('NAO deve detectar site com ROI proximo ao geral', () => {
    const input = {
      ...baseInput,
      analyticsBySite: [
        { site: 'PokerStars', roi: 13.0, count: 500 },
        { site: 'GGPoker', roi: 11.0, count: 400 },
      ],
      overallRoi: 12.5,
    };
    const leaks = detectLeaks(input);

    const siteLeaks = leaks.filter((l: Leak) => l.type === 'weak_site');
    expect(siteLeaks.length).toBe(0);
  });

  it('NAO deve reportar site com amostra insuficiente (< 30 torneios)', () => {
    const input = {
      ...baseInput,
      analyticsBySite: [
        { site: 'Bodog', roi: -20.0, count: 10 },
      ],
    };
    const leaks = detectLeaks(input);

    const siteLeaks = leaks.filter((l: Leak) => l.type === 'weak_site');
    expect(siteLeaks.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Deteccao de leak: Early bust excessivo
// ---------------------------------------------------------------------------
describe('Leak: Early bust excessivo', () => {
  it('deve detectar quando earlyFinish% > 15%', () => {
    const leaks = detectLeaks(baseInput);

    const earlyBustLeaks = leaks.filter((l: Leak) => l.type === 'early_bust');
    expect(earlyBustLeaks.length).toBe(1);
    expect(earlyBustLeaks[0].description).toContain('16.5');
  });

  it('NAO deve detectar quando earlyFinish% <= 15%', () => {
    const input = { ...baseInput, earlyFinishRate: 14.0 };
    const leaks = detectLeaks(input);

    const earlyBustLeaks = leaks.filter((l: Leak) => l.type === 'early_bust');
    expect(earlyBustLeaks.length).toBe(0);
  });

  it('deve detectar no limite exato (15.1% detecta, 15.0% nao)', () => {
    const inputAt15 = { ...baseInput, earlyFinishRate: 15.0 };
    const leaksAt15 = detectLeaks(inputAt15);
    expect(leaksAt15.filter((l: Leak) => l.type === 'early_bust').length).toBe(0);

    const inputAbove15 = { ...baseInput, earlyFinishRate: 15.1 };
    const leaksAbove = detectLeaks(inputAbove15);
    expect(leaksAbove.filter((l: Leak) => l.type === 'early_bust').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Deteccao de leak: Baixa conversao de final table
// ---------------------------------------------------------------------------
describe('Leak: Baixa conversao de final table (cravadas/FTs < 10%)', () => {
  it('deve detectar quando cravadas/FTs < 10% e FTs >= 10', () => {
    // baseInput: cravadas=3, finalTables=45 => 6.67%
    const leaks = detectLeaks(baseInput);

    const ftLeaks = leaks.filter((l: Leak) => l.type === 'low_ft_conversion');
    expect(ftLeaks.length).toBe(1);
  });

  it('NAO deve detectar quando conversao >= 10%', () => {
    const input = { ...baseInput, cravadas: 5, finalTables: 45 }; // 11.1%
    const leaks = detectLeaks(input);

    const ftLeaks = leaks.filter((l: Leak) => l.type === 'low_ft_conversion');
    expect(ftLeaks.length).toBe(0);
  });

  it('NAO deve detectar quando FTs < 10 (amostra insuficiente)', () => {
    const input = { ...baseInput, cravadas: 0, finalTables: 5 };
    const leaks = detectLeaks(input);

    const ftLeaks = leaks.filter((l: Leak) => l.type === 'low_ft_conversion');
    expect(ftLeaks.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Deteccao de leak: Tendencia declinante
// ---------------------------------------------------------------------------
describe('Leak: Tendencia declinante (3 meses recentes vs 3 anteriores)', () => {
  it('deve detectar quando ROI dos ultimos 3 meses < ROI dos 3 anteriores em >5pp', () => {
    // baseInput: recentes (jan-mar 2026) avg ~15.0%, anteriores (out-dez 2025) avg ~20.3%
    // Diferenca ~5.3pp — deve detectar
    const leaks = detectLeaks(baseInput);

    const trendLeaks = leaks.filter((l: Leak) => l.type === 'declining_trend');
    expect(trendLeaks.length).toBe(1);
  });

  it('NAO deve detectar quando diferenca <= 5pp', () => {
    const input = {
      ...baseInput,
      analyticsByMonth: [
        { month: '2026-01', roi: 18.0, count: 200 },
        { month: '2026-02', roi: 19.0, count: 180 },
        { month: '2026-03', roi: 17.0, count: 190 },
        { month: '2025-10', roi: 20.0, count: 160 },
        { month: '2025-11', roi: 21.0, count: 170 },
        { month: '2025-12', roi: 19.0, count: 180 },
      ],
    };
    const leaks = detectLeaks(input);

    const trendLeaks = leaks.filter((l: Leak) => l.type === 'declining_trend');
    expect(trendLeaks.length).toBe(0);
  });

  it('NAO deve detectar com menos de 6 meses de dados', () => {
    const input = {
      ...baseInput,
      analyticsByMonth: [
        { month: '2026-03', roi: 5.0, count: 100 },
        { month: '2026-02', roi: 6.0, count: 100 },
      ],
    };
    const leaks = detectLeaks(input);

    const trendLeaks = leaks.filter((l: Leak) => l.type === 'declining_trend');
    expect(trendLeaks.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Ordenacao por severidade
// ---------------------------------------------------------------------------
describe('Ordenacao de leaks por severidade', () => {
  it('deve retornar leaks ordenados por severidade (maior primeiro)', () => {
    const leaks = detectLeaks(baseInput);

    for (let i = 1; i < leaks.length; i++) {
      expect(leaks[i - 1].severity).toBeGreaterThanOrEqual(leaks[i].severity);
    }
  });

  it('cada leak deve ter type, description e severity', () => {
    const leaks = detectLeaks(baseInput);

    for (const leak of leaks) {
      expect(leak).toHaveProperty('type');
      expect(leak).toHaveProperty('description');
      expect(leak).toHaveProperty('severity');
      expect(typeof leak.type).toBe('string');
      expect(typeof leak.description).toBe('string');
      expect(typeof leak.severity).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// Edge case: usuario sem torneios
// ---------------------------------------------------------------------------
describe('Edge case: usuario sem torneios', () => {
  it('deve retornar lista vazia quando nao ha dados', () => {
    const emptyInput: LeakDetectionInput = {
      analyticsByCategory: [],
      analyticsBySite: [],
      overallRoi: 0,
      earlyFinishRate: 0,
      finalTables: 0,
      cravadas: 0,
      analyticsByMonth: [],
      totalTournaments: 0,
    };

    const leaks = detectLeaks(emptyInput);
    expect(leaks).toEqual([]);
  });

  it('deve retornar volume_insuficiente quando total < 500 torneios', () => {
    const input = {
      ...baseInput,
      totalTournaments: 200,
      // Limpar outros dados que poderiam gerar leaks
      analyticsByCategory: [],
      analyticsBySite: [],
      earlyFinishRate: 10,
      finalTables: 0,
      cravadas: 0,
      analyticsByMonth: [],
    };
    const leaks = detectLeaks(input);

    const volumeLeaks = leaks.filter((l: Leak) => l.type === 'insufficient_volume');
    expect(volumeLeaks.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Deteccao de leak: Falta de estudo
// ---------------------------------------------------------------------------
describe('Leak: Falta de estudo', () => {
  it('deve detectar quando nao ha sessao de estudo nos ultimos 30 dias', () => {
    const input = { ...baseInput, lastStudySessionDays: 45 };
    const leaks = detectLeaks(input);

    const studyLeaks = leaks.filter((l: Leak) => l.type === 'no_study');
    expect(studyLeaks.length).toBe(1);
  });

  it('NAO deve detectar quando ha sessao de estudo recente', () => {
    const input = { ...baseInput, lastStudySessionDays: 10 };
    const leaks = detectLeaks(input);

    const studyLeaks = leaks.filter((l: Leak) => l.type === 'no_study');
    expect(studyLeaks.length).toBe(0);
  });

  it('NAO deve detectar quando lastStudySessionDays e undefined (sem dados)', () => {
    const input = { ...baseInput, lastStudySessionDays: undefined };
    const leaks = detectLeaks(input);

    const studyLeaks = leaks.filter((l: Leak) => l.type === 'no_study');
    expect(studyLeaks.length).toBe(0);
  });
});
