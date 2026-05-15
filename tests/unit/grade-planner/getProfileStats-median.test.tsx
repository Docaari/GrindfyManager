// Test-Writer (Modo TDD - Red Phase)
// Spec: Docs/specs/grade-planner-mediana-participantes.md (RF-04)
// Cobre populacao de medianFieldSize via helper computeDayStats.
//
// Decisao pragmatica do test-writer (registrada para o implementer):
//   A logica de calcular stats por dia/perfil esta inline em GradePlanner.tsx
//   (funcao calculateStats, linha ~339-380). Para testar a populacao de
//   medianFieldSize sem montar a pagina inteira, o implementer deve EXTRAIR essa
//   logica para um helper puro em `client/src/pages/grade-planner-helpers.ts`
//   exportando `computeDayStats(tournaments: any[]): DayStats`. GradePlanner.tsx
//   passa a importar deste helper. A spec deixou essa opcao em RF-04 (linha 237)
//   como recomendacao explicita ao implementer.
//
// Modulo planejado: client/src/pages/grade-planner-helpers.ts — NAO existe ainda.
// Esperado: red phase com "Cannot find module" ou medianFieldSize ausente.

import { describe, it, expect } from 'vitest';

describe('computeDayStats — populacao de medianFieldSize (RF-04)', () => {
  it('3 torneios com guaranteed/buyIn que dao estimates [200, 500, 10000] -> medianFieldSize = 500', async () => {
    const { computeDayStats } = await import('@/pages/grade-planner-helpers');

    const tournaments = [
      { buyIn: '100', guaranteed: '20000' },  // 200
      { buyIn: '100', guaranteed: '50000' },  // 500
      { buyIn: '100', guaranteed: '1000000' }, // 10000 (outlier)
    ];

    const stats = computeDayStats(tournaments);
    expect(stats.medianFieldSize).toBe(500);
  });

  it('lista vazia -> medianFieldSize = null', async () => {
    const { computeDayStats } = await import('@/pages/grade-planner-helpers');
    const stats = computeDayStats([]);
    expect(stats.medianFieldSize).toBeNull();
  });

  it('todos torneios sem guaranteed valido -> medianFieldSize = null', async () => {
    const { computeDayStats } = await import('@/pages/grade-planner-helpers');

    const tournaments = [
      { buyIn: '100', guaranteed: '0' },
      { buyIn: '100' }, // undefined
      { buyIn: '100', guaranteed: 'abc' },
    ];

    const stats = computeDayStats(tournaments);
    expect(stats.medianFieldSize).toBeNull();
  });

  it('mix: alguns sem garantido + 3 validos com estimates [300, 400, 500] -> mediana = 400 (so dos validos)', async () => {
    const { computeDayStats } = await import('@/pages/grade-planner-helpers');

    const tournaments = [
      { buyIn: '100', guaranteed: '30000' },   // 300
      { buyIn: '100', guaranteed: '0' },        // invalido (filtrado)
      { buyIn: '100', guaranteed: '40000' },   // 400
      { buyIn: '100' },                          // invalido (filtrado)
      { buyIn: '100', guaranteed: '50000' },   // 500
    ];

    const stats = computeDayStats(tournaments);
    expect(stats.medianFieldSize).toBe(400);
  });

  it('1 unico torneio com garantido valido -> mediana = seu proprio estimatedFieldSize', async () => {
    const { computeDayStats } = await import('@/pages/grade-planner-helpers');

    const tournaments = [
      { buyIn: '100', guaranteed: '50000' }, // 500
    ];

    const stats = computeDayStats(tournaments);
    expect(stats.medianFieldSize).toBe(500);
  });

  it('mix com mediana fracionaria deve ser arredondada (mediana = 300, sem decimais)', async () => {
    // [100, 500] => mediana = 300 (par, media dos dois)
    const { computeDayStats } = await import('@/pages/grade-planner-helpers');

    const tournaments = [
      { buyIn: '10', guaranteed: '1000' },   // 100
      { buyIn: '10', guaranteed: '0' },       // null filtrado
      { buyIn: '10', guaranteed: '5000' },   // 500
    ];

    const stats = computeDayStats(tournaments);
    expect(stats.medianFieldSize).toBe(300);
    // E inteiro (sem casa decimal)
    expect(Number.isInteger(stats.medianFieldSize as number)).toBe(true);
  });
});
