import { describe, it, expect } from 'vitest';
import {
  buildSiteInsight,
  buildBuyinInsight,
  buildCategoryInsight,
  buildDayOfWeekInsight,
  buildFieldInsight,
  buildPositionInsight,
  buildTabInsight,
  formatUsd,
  formatPct,
  num,
  MIN_BUCKET_VOLUME,
  LOW_SAMPLE_VOLUME,
} from '../../../client/src/lib/dashboard-insights';

// =============================================================================
// O contrato mais importante deste modulo nao e "gerar frase bonita", e
// NAO AFIRMAR o que o dado nao sustenta. Os testes de amostra curta e de
// ausencia de dado valem mais que os de texto.
// =============================================================================

const bigBucket = (label: string, roi: number, extra: Partial<any> = {}) => ({
  site: label,
  category: label,
  speed: label,
  buyinRange: label,
  volume: 100,
  profit: 1000,
  buyins: 10000,
  roi,
  avgProfit: 10,
  ...extra,
});

describe('helpers', () => {
  it('num aceita string do Postgres, numero e lixo', () => {
    expect(num('12.5')).toBe(12.5);
    expect(num(3)).toBe(3);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num('abc')).toBe(0);
    expect(num(NaN)).toBe(0);
  });

  it('formatUsd arredonda e marca negativo', () => {
    expect(formatUsd(1234.6)).toBe('$1.235');
    expect(formatUsd(-820.2)).toBe('-$820');
    expect(formatUsd(0)).toBe('$0');
  });

  it('formatPct mantem uma casa', () => {
    expect(formatPct(18.04)).toBe('18.0%');
    expect(formatPct(-4.25)).toBe('-4.3%');
  });
});

describe('silencio quando o dado nao sustenta', () => {
  it('devolve null sem dado', () => {
    expect(buildSiteInsight(null)).toBeNull();
    expect(buildSiteInsight([])).toBeNull();
    expect(buildSiteInsight(undefined)).toBeNull();
  });

  it('devolve null com uma unica faixa (nao ha com o que comparar)', () => {
    expect(buildSiteInsight([bigBucket('ACR', 20)])).toBeNull();
  });

  it('devolve null quando todas as faixas estao abaixo do minimo tolerado', () => {
    const tiny = [
      { site: 'ACR', volume: 3, profit: 500, buyins: 100, roi: 500 },
      { site: 'GG', volume: 2, profit: -50, buyins: 80, roi: -60 },
    ];
    expect(buildSiteInsight(tiny)).toBeNull();
  });

  it('ignora faixa sem volume — um torneio premiado nao vira "melhor faixa"', () => {
    const data = [
      bigBucket('ACR', 12),
      bigBucket('GG', -5),
      { site: 'Fantasma', volume: 0, profit: 9999, buyins: 0, roi: 9999 },
    ];
    const insight = buildSiteInsight(data);
    expect(insight).not.toBeNull();
    expect(insight!.headline).not.toContain('Fantasma');
  });
});

describe('amostra curta', () => {
  it('marca lowSample quando as faixas ficam entre o minimo tolerado e o ideal', () => {
    const data = [
      { site: 'ACR', volume: LOW_SAMPLE_VOLUME + 1, profit: 300, buyins: 1000, roi: 30 },
      { site: 'GG', volume: LOW_SAMPLE_VOLUME + 2, profit: -200, buyins: 1000, roi: -20 },
    ];
    const insight = buildSiteInsight(data);
    expect(insight!.lowSample).toBe(true);
  });

  it('nao marca lowSample quando todas passam do volume ideal', () => {
    const data = [bigBucket('ACR', 18), bigBucket('GG', -4)];
    const insight = buildSiteInsight(data);
    expect(insight!.lowSample).toBe(false);
  });

  it('faixa abaixo do minimo nao entra na comparacao quando ha faixas grandes', () => {
    const data = [
      bigBucket('ACR', 10),
      bigBucket('GG', -3),
      { site: 'Micro', volume: MIN_BUCKET_VOLUME - 1, profit: 5000, buyins: 100, roi: 900 },
    ];
    const insight = buildSiteInsight(data);
    expect(insight!.headline).not.toContain('Micro');
    expect(insight!.lowSample).toBe(false);
  });
});

describe('gargalo = onde o dinheiro sangra, nao o pior percentual', () => {
  it('escolhe a faixa negativa com MAIOR investimento', () => {
    const data = [
      { site: 'ACR', volume: 200, profit: 4000, buyins: 20000, roi: 20 },
      // ROI pior, mas quase nao joga
      { site: 'Nicho', volume: 40, profit: -400, buyins: 800, roi: -50 },
      // ROI menos ruim, mas e onde o dinheiro esta
      { site: 'GG', volume: 300, profit: -1500, buyins: 30000, roi: -5 },
    ];
    const insight = buildSiteInsight(data);
    expect(insight!.detail).toContain('GG');
    expect(insight!.detail).not.toContain('Nicho —');
    expect(insight!.tone).toBe('bad');
  });

  it('sem faixa negativa, o tom e positivo e fala de alocacao', () => {
    const data = [bigBucket('ACR', 25), bigBucket('GG', 8)];
    const insight = buildSiteInsight(data);
    expect(insight!.tone).toBe('good');
    expect(insight!.detail).toContain('alocação');
  });
});

describe('ABI', () => {
  it('usa lucro medio por torneio, nao ROI, na frase principal', () => {
    const data = [
      { buyinRange: '$20-29', volume: 200, profit: 4000, buyins: 5000, roi: 80, avgProfit: 20 },
      { buyinRange: '$71-130', volume: 100, profit: -1000, buyins: 9000, roi: -11, avgProfit: -10 },
    ];
    const insight = buildBuyinInsight(data);
    expect(insight!.headline).toContain('lucro médio');
    expect(insight!.headline).toContain('$20');
  });
});

describe('dia da semana', () => {
  it('fala em dinheiro e nomeia o dia ruim', () => {
    const data = [
      { dayName: 'Domingo', volume: 140, profit: '-820', roi: '-9' },
      { dayName: 'Quinta', volume: 90, profit: '610', roi: '12' },
      { dayName: 'Terça', volume: 80, profit: '100', roi: '3' },
    ];
    const insight = buildDayOfWeekInsight(data);
    expect(insight!.headline).toContain('Domingo');
    expect(insight!.headline).toContain('-$820');
    expect(insight!.headline).toContain('Quinta');
    expect(insight!.tone).toBe('bad');
  });

  it('quando nenhum dia esta no vermelho, nao inventa problema', () => {
    const data = [
      { dayName: 'Domingo', volume: 100, profit: '100', roi: '2' },
      { dayName: 'Quinta', volume: 100, profit: '900', roi: '15' },
    ];
    const insight = buildDayOfWeekInsight(data);
    expect(insight!.tone).toBe('good');
    expect(insight!.headline).toContain('Nenhum dia');
  });
});

describe('participantes', () => {
  it('aponta o desalinhamento entre onde rende e onde esta o volume', () => {
    const data = [
      { fieldRange: '<100', volume: 400, profit: '-500', buyins: '12000', roi: '-4', itmCount: 120 },
      { fieldRange: '1500-3000', volume: 100, profit: '3000', buyins: '4000', roi: '75', itmCount: 12 },
    ];
    const insight = buildFieldInsight(data);
    expect(insight!.headline).toContain('1500-3000');
    expect(insight!.headline).toContain('<100');
    expect(insight!.headline).toContain('ITM');
    expect(insight!.tone).toBe('bad');
  });

  it('reconhece quando volume e ROI estao no mesmo lugar', () => {
    const data = [
      { fieldRange: '<100', volume: 400, profit: '4000', buyins: '12000', roi: '33', itmCount: 120 },
      { fieldRange: '1500-3000', volume: 60, profit: '100', buyins: '4000', roi: '2', itmCount: 6 },
    ];
    const insight = buildFieldInsight(data);
    expect(insight!.tone).toBe('good');
  });
});

describe('posicao na mesa final', () => {
  it('acusa saida precoce quando 7-9 domina', () => {
    const data = [
      { position: 9, volume: '30' }, { position: 8, volume: '25' }, { position: 7, volume: '20' },
      { position: 6, volume: '8' }, { position: 5, volume: '6' }, { position: 4, volume: '5' },
      { position: 3, volume: '3' }, { position: 2, volume: '2' }, { position: 1, volume: '1' },
    ];
    const insight = buildPositionInsight(data);
    expect(insight!.tone).toBe('bad');
    expect(insight!.headline).toContain('7º-9º');
    expect(insight!.detail).toContain('3-handed');
  });

  it('reconhece boa conversao quando o top 3 pesa', () => {
    const data = [
      { position: 1, volume: '20' }, { position: 2, volume: '18' }, { position: 3, volume: '15' },
      { position: 9, volume: '5' }, { position: 8, volume: '5' }, { position: 7, volume: '5' },
    ];
    const insight = buildPositionInsight(data);
    expect(insight!.tone).toBe('good');
  });

  it('cala quando ha mesas finais de menos', () => {
    expect(buildPositionInsight([{ position: 1, volume: '2' }])).toBeNull();
  });

  it('ignora posicao fora de 1-9 (dado sujo nao vira estatistica)', () => {
    const data = [
      { position: 1, volume: '10' }, { position: 2, volume: '10' }, { position: 3, volume: '10' },
      { position: 250, volume: '9999' },
      { position: 0, volume: '9999' },
    ];
    const insight = buildPositionInsight(data);
    expect(insight!.headline).toContain('top 3');
  });
});

describe('buildTabInsight (despacho)', () => {
  it('roteia cada aba para o construtor certo', () => {
    const payload = {
      siteAnalytics: [bigBucket('ACR', 12), bigBucket('GG', -3)],
      categoryAnalytics: [bigBucket('Vanilla', 12), bigBucket('PKO', -3)],
    };
    expect(buildTabInsight('por-site', payload)!.headline).toContain('ACR');
    expect(buildTabInsight('por-tipo', payload)!.headline).toContain('Vanilla');
  });

  it('aba sem dica configurada devolve null', () => {
    expect(buildTabInsight('evolution', {})).toBeNull();
    expect(buildTabInsight('inexistente', {})).toBeNull();
  });
});

describe('categoria', () => {
  it('compara tipos de torneio', () => {
    const data = [
      { category: 'Vanilla', volume: 300, profit: 3000, buyins: 20000, roi: 15 },
      { category: 'PKO', volume: 250, profit: -900, buyins: 18000, roi: -5 },
    ];
    const insight = buildCategoryInsight(data);
    expect(insight!.headline).toContain('Vanilla');
    expect(insight!.headline).toContain('PKO');
    expect(insight!.detail).toContain('PKO');
  });
});
