import { describe, it, expect } from 'vitest';
import {
  CHART_COLORS,
  getSiteColor,
  getCategoryColor,
  getSpeedColor,
  getBuyinColor,
  getProfitColor,
} from '../../../client/src/lib/chartColors';

// =============================================================================
// Testes de Caracterizacao: Paleta de cores e helpers de client/src/lib/chartColors.ts
//
// Estas funcoes sao usadas por AnalyticsCharts, ProfitChart e DynamicCharts
// para determinar cores de graficos. Documentam o mapeamento ATUAL.
//
// MODO CARACTERIZACAO: Todos devem PASSAR com o codigo existente.
// =============================================================================

// ---------------------------------------------------------------------------
// CHART_COLORS — constante de paleta de cores
// ---------------------------------------------------------------------------

describe('CHART_COLORS', () => {
  it('deve ter mapeamento de cores para 10 sites de poker', () => {
    const expectedSites = [
      'Chico', 'WPN', 'Revolution', 'CoinPoker', 'iPoker',
      'PartyPoker', 'GGNetwork', 'Bodog', '888Poker', 'PokerStars'
    ];
    for (const site of expectedSites) {
      expect(CHART_COLORS.sites).toHaveProperty(site);
      expect(CHART_COLORS.sites[site as keyof typeof CHART_COLORS.sites]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('deve ter 5 cores para ranges de buyin (frio para quente)', () => {
    expect(CHART_COLORS.buyins).toHaveLength(5);
    for (const color of CHART_COLORS.buyins) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('deve ter cores para 3 categorias: Vanilla, PKO, Mystery', () => {
    expect(CHART_COLORS.categories).toHaveProperty('Vanilla');
    expect(CHART_COLORS.categories).toHaveProperty('PKO');
    expect(CHART_COLORS.categories).toHaveProperty('Mystery');
  });

  it('deve ter cores para 3 velocidades: Normal, Turbo, Hyper', () => {
    expect(CHART_COLORS.speeds).toHaveProperty('Normal');
    expect(CHART_COLORS.speeds).toHaveProperty('Turbo');
    expect(CHART_COLORS.speeds).toHaveProperty('Hyper');
  });

  it('deve ter array default com 8 cores', () => {
    expect(CHART_COLORS.default).toHaveLength(8);
  });

  it('deve ter cores de profit positive e negative', () => {
    expect(CHART_COLORS.profit.positive).toBe('#10b981');
    expect(CHART_COLORS.profit.negative).toBe('#ef4444');
  });
});

// ---------------------------------------------------------------------------
// getSiteColor — retorna cor para um site de poker
// ---------------------------------------------------------------------------

describe('getSiteColor', () => {
  it('deve retornar cor especifica para PokerStars', () => {
    expect(getSiteColor('PokerStars')).toBe('#ef4444');
  });

  it('deve retornar cor especifica para GGNetwork', () => {
    expect(getSiteColor('GGNetwork')).toBe('#dc2626');
  });

  it('deve retornar cor especifica para 888Poker', () => {
    expect(getSiteColor('888Poker')).toBe('#2563eb');
  });

  it('deve retornar cor especifica para WPN', () => {
    expect(getSiteColor('WPN')).toBe('#166534');
  });

  it('deve retornar cor especifica para Bodog', () => {
    expect(getSiteColor('Bodog')).toBe('#7c3aed');
  });

  it('deve retornar primeira cor default para site desconhecido', () => {
    expect(getSiteColor('SiteInexistente')).toBe(CHART_COLORS.default[0]);
  });

  it('deve retornar primeira cor default para string vazia', () => {
    expect(getSiteColor('')).toBe(CHART_COLORS.default[0]);
  });
});

// ---------------------------------------------------------------------------
// getCategoryColor — retorna cor para uma categoria de torneio
// ---------------------------------------------------------------------------

describe('getCategoryColor', () => {
  it('deve retornar azul para Vanilla', () => {
    expect(getCategoryColor('Vanilla')).toBe('#3b82f6');
  });

  it('deve retornar vermelho para PKO', () => {
    expect(getCategoryColor('PKO')).toBe('#ef4444');
  });

  it('deve retornar rosa para Mystery', () => {
    expect(getCategoryColor('Mystery')).toBe('#ec4899');
  });

  it('deve retornar primeira cor default para categoria desconhecida', () => {
    expect(getCategoryColor('Desconhecida')).toBe(CHART_COLORS.default[0]);
  });
});

// ---------------------------------------------------------------------------
// getSpeedColor — retorna cor para uma velocidade de torneio
// ---------------------------------------------------------------------------

describe('getSpeedColor', () => {
  it('deve retornar verde para Normal', () => {
    expect(getSpeedColor('Normal')).toBe('#22c55e');
  });

  it('deve retornar amarelo para Turbo', () => {
    expect(getSpeedColor('Turbo')).toBe('#eab308');
  });

  it('deve retornar vermelho para Hyper', () => {
    expect(getSpeedColor('Hyper')).toBe('#ef4444');
  });

  it('deve retornar primeira cor default para velocidade desconhecida', () => {
    expect(getSpeedColor('SuperSlow')).toBe(CHART_COLORS.default[0]);
  });
});

// ---------------------------------------------------------------------------
// getBuyinColor — retorna cor para um range de buyin
// ---------------------------------------------------------------------------

describe('getBuyinColor', () => {
  it('deve retornar primeira cor para range $0-$5', () => {
    expect(getBuyinColor('$0-$5')).toBe(CHART_COLORS.buyins[0]);
  });

  it('deve retornar segunda cor para range $6-$10', () => {
    expect(getBuyinColor('$6-$10')).toBe(CHART_COLORS.buyins[1]);
  });

  it('deve retornar terceira cor para range $11-$20', () => {
    expect(getBuyinColor('$11-$20')).toBe(CHART_COLORS.buyins[2]);
  });

  it('deve retornar quarta cor para range $21-$50', () => {
    expect(getBuyinColor('$21-$50')).toBe(CHART_COLORS.buyins[3]);
  });

  it('deve retornar quinta cor para range $51+', () => {
    expect(getBuyinColor('$51+')).toBe(CHART_COLORS.buyins[4]);
  });

  it('deve retornar primeira cor default para range desconhecido', () => {
    expect(getBuyinColor('$100-$200')).toBe(CHART_COLORS.default[0]);
  });

  it('deve retornar primeira cor default para string vazia', () => {
    expect(getBuyinColor('')).toBe(CHART_COLORS.default[0]);
  });
});

// ---------------------------------------------------------------------------
// getProfitColor — retorna cor baseada no valor de profit
// ---------------------------------------------------------------------------

describe('getProfitColor', () => {
  it('deve retornar cor positiva (verde) para profit positivo', () => {
    expect(getProfitColor(100)).toBe('#10b981');
  });

  it('deve retornar cor positiva (verde) para profit zero', () => {
    // >= 0 retorna positiva
    expect(getProfitColor(0)).toBe('#10b981');
  });

  it('deve retornar cor negativa (vermelho) para profit negativo', () => {
    expect(getProfitColor(-100)).toBe('#ef4444');
  });

  it('deve retornar cor negativa para valor negativo muito pequeno', () => {
    expect(getProfitColor(-0.01)).toBe('#ef4444');
  });

  it('deve retornar cor positiva para valor positivo muito grande', () => {
    expect(getProfitColor(999999)).toBe('#10b981');
  });
});
