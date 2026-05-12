import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint AI-1A / RF-08 — Deteccao de nivel automatica (heuristica rule-based)
//
// Modulo alvo (NAO existe ainda): server/coach/playerLevel.ts
//   export function estimatePlayerLevel(input: LevelEstimateInput): LevelEstimate
//
// Fontes:
//   - Docs/specs/sprint-ai-1a.md (RF-08 + "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/154-deteccao-nivel-rule-based.md
//
// Funcao PURA: nao le DB/env/new Date(); accountAgeMonths vem pronto no input.
// Lesson #6 (conversao USD) eh do handler, nao da funcao — ela recebe abiUSD ja
// normalizado.
//
// Niveis: sem_dados / iniciando / micro_ascensao / mid_consistente / high_stakes
//         / recreativo_serio
// Tie-break: high_stakes > mid_consistente > micro_ascensao > recreativo_serio > iniciando
// confidence: low | medium | high
// =============================================================================

const BASE: any = {
  abiUSD: 50,
  volumeAllTime: 500,
  volumeLast90d: 100,
  roiAllTime: 5,
  roiLast90d: 5,
  distinctNetworks: 2,
  accountAgeMonths: 24,
  subscriptionPlan: 'pro',
};

describe('estimatePlayerLevel — sem_dados (amostra insuficiente)', () => {
  it('volumeAllTime < 30 -> sem_dados, confidence low, note preenchido', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({ ...BASE, abiUSD: 22, volumeAllTime: 12, volumeLast90d: 5 });
    expect(out.nivel).toBe('sem_dados');
    expect(out.confidence).toBe('low');
    expect(typeof out.note).toBe('string');
    expect((out.note || '').length).toBeGreaterThan(0);
  });

  it('abiUSD == null -> sem_dados independente do volume alto', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({ ...BASE, abiUSD: null, volumeAllTime: 800, volumeLast90d: 200 });
    expect(out.nivel).toBe('sem_dados');
  });

  it('volumeAllTime < 30 vence qualquer outro sinal (curto-circuito)', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({ ...BASE, abiUSD: 320, volumeAllTime: 29, volumeLast90d: 29 });
    expect(out.nivel).toBe('sem_dados');
  });

  it('evidence reflete os inputs', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({ ...BASE, abiUSD: 15, volumeAllTime: 10, volumeLast90d: 3, distinctNetworks: 1, accountAgeMonths: 2 });
    expect(out.evidence).toEqual(expect.objectContaining({
      abiUSD: 15, volumeAllTime: 10, volumeLast90d: 3, distinctNetworks: 1, accountAgeMonths: 2,
    }));
  });
});

describe('estimatePlayerLevel — micro_ascensao', () => {
  it('abi < 33 + vol90 >= 80 -> micro_ascensao', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({
      ...BASE, abiUSD: 8, volumeAllTime: 500, volumeLast90d: 120,
      roiLast90d: 15, roiAllTime: null, accountAgeMonths: 10, distinctNetworks: 2,
    });
    expect(out.nivel).toBe('micro_ascensao');
    expect(out.confidence).toBe('medium');
  });
});

describe('estimatePlayerLevel — mid_consistente', () => {
  it('abi >= 33 + abi < 215 + vol90 >= 80 + roi90 >= -5 + accountAge >= 6 -> mid_consistente, confidence high (vol90>=150 && roiAllTime!=null)', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({
      ...BASE, abiUSD: 55, volumeAllTime: 800, volumeLast90d: 200,
      roiLast90d: -2, roiAllTime: 8, accountAgeMonths: 24,
    });
    expect(out.nivel).toBe('mid_consistente');
    expect(out.confidence).toBe('high');
  });

  it('mid_consistente com vol90 < 150 -> confidence medium', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({
      ...BASE, abiUSD: 55, volumeAllTime: 400, volumeLast90d: 90,
      roiLast90d: 2, roiAllTime: 4, accountAgeMonths: 12,
    });
    expect(out.nivel).toBe('mid_consistente');
    expect(out.confidence).toBe('medium');
  });

  it('abi mid mas roi90 sangrando (< -5) -> NAO mid_consistente (cai pro fallback iniciando ou outro)', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({
      ...BASE, abiUSD: 55, volumeAllTime: 400, volumeLast90d: 90,
      roiLast90d: -20, roiAllTime: -3, accountAgeMonths: 12,
    });
    expect(out.nivel).not.toBe('mid_consistente');
  });
});

describe('estimatePlayerLevel — high_stakes', () => {
  it('abi >= 215 + volumeAllTime >= 200 + vol90 >= 100 -> high_stakes confidence high', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({
      ...BASE, abiUSD: 320, volumeAllTime: 600, volumeLast90d: 150,
    });
    expect(out.nivel).toBe('high_stakes');
    expect(out.confidence).toBe('high');
  });

  it('high_stakes mas vol90 < 100 -> confidence medium', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({
      ...BASE, abiUSD: 250, volumeAllTime: 220, volumeLast90d: 40,
    });
    expect(out.nivel).toBe('high_stakes');
    expect(out.confidence).toBe('medium');
  });
});

describe('estimatePlayerLevel — recreativo_serio', () => {
  it('vol90 baixo + accountAge >= 12 + volumeAllTime >= 100 + roiAllTime > 0 -> recreativo_serio', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({
      ...BASE, abiUSD: 22, volumeAllTime: 150, volumeLast90d: 8,
      roiAllTime: 6, roiLast90d: 6, accountAgeMonths: 30,
    });
    expect(out.nivel).toBe('recreativo_serio');
    expect(out.confidence).toBe('medium');
  });
});

describe('estimatePlayerLevel — iniciando (fallback)', () => {
  it('accountAge < 6 (mas volume >= 30) -> iniciando confidence low', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({
      ...BASE, abiUSD: 15, volumeAllTime: 45, volumeLast90d: 20,
      roiAllTime: null, roiLast90d: null, accountAgeMonths: 3,
    });
    expect(out.nivel).toBe('iniciando');
    expect(out.confidence).toBe('low');
  });

  it('volumeAllTime < 100 (mas >= 30) e conta nova -> iniciando', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({
      ...BASE, abiUSD: 30, volumeAllTime: 60, volumeLast90d: 10,
      roiAllTime: -2, roiLast90d: -2, accountAgeMonths: 4,
    });
    expect(out.nivel).toBe('iniciando');
  });
});

describe('estimatePlayerLevel — tie-break (prioridade)', () => {
  it('input que bate micro_ascensao E recreativo_serio -> retorna micro_ascensao (prioridade maior)', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    // abi<33 + vol90>=80 (micro_ascensao) E accountAge>=12 + volumeAllTime>=100 + roiAllTime>0 (recreativo_serio)
    const out = estimatePlayerLevel({
      ...BASE, abiUSD: 10, volumeAllTime: 600, volumeLast90d: 120,
      roiAllTime: 8, roiLast90d: 12, accountAgeMonths: 30,
    });
    expect(out.nivel).toBe('micro_ascensao');
  });

  it('input que bate high_stakes E mid_consistente -> retorna high_stakes', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const out = estimatePlayerLevel({
      ...BASE, abiUSD: 215, volumeAllTime: 600, volumeLast90d: 150,
      roiLast90d: 2, roiAllTime: 5, accountAgeMonths: 24,
    });
    expect(out.nivel).toBe('high_stakes');
  });
});

describe('estimatePlayerLevel — humanLabel', () => {
  it('humanLabel pt-BR corresponde ao nivel', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const cases: Array<[any, string]> = [
      [{ ...BASE, abiUSD: null, volumeAllTime: 5 }, 'sem_dados'],
      [{ ...BASE, abiUSD: 15, volumeAllTime: 45, volumeLast90d: 20, accountAgeMonths: 3, roiAllTime: null, roiLast90d: null }, 'iniciando'],
      [{ ...BASE, abiUSD: 8, volumeAllTime: 500, volumeLast90d: 120, roiLast90d: 15, roiAllTime: null, accountAgeMonths: 10 }, 'micro_ascensao'],
      [{ ...BASE, abiUSD: 55, volumeAllTime: 800, volumeLast90d: 200, roiLast90d: -2, roiAllTime: 8, accountAgeMonths: 24 }, 'mid_consistente'],
      [{ ...BASE, abiUSD: 320, volumeAllTime: 600, volumeLast90d: 150 }, 'high_stakes'],
      [{ ...BASE, abiUSD: 22, volumeAllTime: 150, volumeLast90d: 8, roiAllTime: 6, roiLast90d: 6, accountAgeMonths: 30 }, 'recreativo_serio'],
    ];
    const expectedLabels: Record<string, RegExp> = {
      sem_dados: /sem dados/i,
      iniciando: /comecando|come[çc]ando/i,
      micro_ascensao: /micro grinder em ascen/i,
      mid_consistente: /mid-?stakes/i,
      high_stakes: /high-?stakes/i,
      recreativo_serio: /recreativo s[ée]rio/i,
    };
    for (const [input, expectedNivel] of cases) {
      const out = estimatePlayerLevel(input);
      expect(out.nivel).toBe(expectedNivel);
      expect(typeof out.humanLabel).toBe('string');
      expect(out.humanLabel).toMatch(expectedLabels[expectedNivel]);
    }
  });
});

describe('estimatePlayerLevel — pureza', () => {
  it('mesmo input -> mesmo output (deterministica)', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const input = { ...BASE, abiUSD: 55, volumeAllTime: 800, volumeLast90d: 200, roiLast90d: -2, roiAllTime: 8, accountAgeMonths: 24 };
    const a = estimatePlayerLevel(input);
    const b = estimatePlayerLevel(input);
    expect(a).toEqual(b);
  });

  it('nao muta o input', async () => {
    const { estimatePlayerLevel } = await import('../../../server/coach/playerLevel');
    const input = { ...BASE };
    const snapshot = JSON.stringify(input);
    estimatePlayerLevel(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
