/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint grade-planner-library-and-multi-day — RF-04 helper puro.
 * Spec: Docs/specs/grade-planner-library-and-multi-day.md §RF-04.
 * ADR:  Docs/architecture/decisions/245-grade-planner-library-viewport-and-multi-day.md
 *       §D4 + §"Contrato do helper puro" (as duas tabelas de casos abaixo saem
 *       de la LITERALMENTE — o ADR e a fonte de verdade, vence a spec).
 *
 * Modulo alvo (AINDA NAO EXISTE): shared/grade-multi-day.ts
 *   - resolveMultiDayTargets(selectedDays, getProfileForDay)
 *   - summarizeMultiDayResult(outcome, dayLabels)
 *
 * Por que este arquivo importa mais que os outros: e aqui que um erro vira
 * grade errada. Um alvo resolvido no dia errado, ou um perfil copiado do dia de
 * origem em vez do perfil daquele dia, cria torneio planejado invisivel (perfil
 * que nao esta ativo) ou em dia OFF. Falhar alto (RangeError) e barato.
 *
 * Este teste roda no projeto `server` (node): o helper e puro, sem DOM, sem I/O,
 * sem relogio. `await import` por teste para que a ausencia do modulo produza
 * N falhas contaveis em vez de um unico erro de carga do arquivo.
 *
 * Lessons: #2 (nada de heuristica), #8 (nao assertar length de enum), #25
 * (exemplo do teste tem que bater com a descricao).
 */

import { describe, it, expect, vi } from 'vitest';

async function loadHelper() {
  return await import('@shared/grade-multi-day');
}

/** Rotulos curtos indexados por dayOfWeek — paridade weekDays[].short. */
const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'] as const;

/** Constroi getProfileForDay a partir de um mapa dia -> perfil. */
function profileMap(map: Record<number, any>) {
  return (dayOfWeek: number) => map[dayOfWeek];
}

// ===========================================================================
// resolveMultiDayTargets — tabela de casos do ADR-245 (14 linhas)
// ===========================================================================

describe('resolveMultiDayTargets — tabela de casos do ADR-245', () => {
  it('um dia com perfil B devolve um alvo e nenhum pulado (ADR caso 1)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const out = resolveMultiDayTargets([3], profileMap({ 3: 'B' }));
    expect(out.targets).toEqual([{ dayOfWeek: 3, profile: 'B' }]);
    expect(out.skipped).toEqual([]);
  });

  it('dia ativo + dia OFF + dia sem perfil devolve 1 alvo e 2 pulados com razoes distintas (ADR caso 2)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const out = resolveMultiDayTargets(
      [3, 4, 5],
      profileMap({ 3: 'B', 4: 'OFF', 5: null }),
    );
    expect(out.targets).toEqual([{ dayOfWeek: 3, profile: 'B' }]);
    expect(out.skipped).toEqual([
      { dayOfWeek: 4, reason: 'day_off' },
      { dayOfWeek: 5, reason: 'no_active_profile' },
    ]);
  });

  it('tres dias no mesmo perfil viram tres alvos (ADR caso 3)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const out = resolveMultiDayTargets(
      [1, 2, 3],
      profileMap({ 1: 'A', 2: 'A', 3: 'A' }),
    );
    expect(out.targets).toEqual([
      { dayOfWeek: 1, profile: 'A' },
      { dayOfWeek: 2, profile: 'A' },
      { dayOfWeek: 3, profile: 'A' },
    ]);
    expect(out.skipped).toEqual([]);
  });

  it('cada alvo herda o perfil DAQUELE dia, nao o do dia de origem (ADR caso 4)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const out = resolveMultiDayTargets(
      [1, 2, 3],
      profileMap({ 1: 'A', 2: 'B', 3: 'C' }),
    );
    expect(out.targets).toEqual([
      { dayOfWeek: 1, profile: 'A' },
      { dayOfWeek: 2, profile: 'B' },
      { dayOfWeek: 3, profile: 'C' },
    ]);
    expect(out.skipped).toEqual([]);
  });

  it('entrada vazia nao e erro — devolve alvos e pulados vazios (ADR caso 5)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const out = resolveMultiDayTargets([], profileMap({}));
    expect(out.targets).toEqual([]);
    expect(out.skipped).toEqual([]);
  });

  it('dias duplicados sao deduplicados em um unico alvo (ADR caso 6)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const out = resolveMultiDayTargets([4, 4, 4], profileMap({ 4: 'C' }));
    expect(out.targets).toEqual([{ dayOfWeek: 4, profile: 'C' }]);
    expect(out.skipped).toEqual([]);
  });

  it('saida sai ordenada por dayOfWeek crescente qualquer que seja a ordem da entrada (ADR caso 7)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const out = resolveMultiDayTargets(
      [5, 1, 3],
      profileMap({ 1: 'A', 3: 'B', 5: 'C' }),
    );
    expect(out.targets).toEqual([
      { dayOfWeek: 1, profile: 'A' },
      { dayOfWeek: 3, profile: 'B' },
      { dayOfWeek: 5, profile: 'C' },
    ]);
  });

  it('dois dias OFF viram dois pulados com razao day_off e nenhum alvo (ADR caso 8)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const out = resolveMultiDayTargets([0, 6], profileMap({ 0: 'OFF', 6: 'OFF' }));
    expect(out.targets).toEqual([]);
    expect(out.skipped).toEqual([
      { dayOfWeek: 0, reason: 'day_off' },
      { dayOfWeek: 6, reason: 'day_off' },
    ]);
  });

  it('perfil undefined vira pulado com razao no_active_profile (ADR caso 9)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const out = resolveMultiDayTargets([2], profileMap({ 2: undefined }));
    expect(out.targets).toEqual([]);
    expect(out.skipped).toEqual([{ dayOfWeek: 2, reason: 'no_active_profile' }]);
  });

  it('perfil desconhecido (fora de A|B|C|OFF) NAO lanca — vira no_active_profile (ADR caso 10)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const out = resolveMultiDayTargets([2], profileMap({ 2: 'X' }));
    expect(out.targets).toEqual([]);
    expect(out.skipped).toEqual([{ dayOfWeek: 2, reason: 'no_active_profile' }]);
  });

  it('dia 7 (acima do intervalo) lanca RangeError (ADR caso 11)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    expect(() => resolveMultiDayTargets([7], profileMap({}))).toThrow(RangeError);
  });

  it('dia -1 (abaixo do intervalo) lanca RangeError (ADR caso 12)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    expect(() => resolveMultiDayTargets([-1], profileMap({}))).toThrow(RangeError);
  });

  it('dia nao inteiro (1.5) lanca RangeError (ADR caso 13)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    expect(() => resolveMultiDayTargets([1.5], profileMap({}))).toThrow(RangeError);
  });

  it('os 7 dias ativos viram 7 alvos — o teto e a propria semana (ADR caso 14)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const out = resolveMultiDayTargets(
      [0, 1, 2, 3, 4, 5, 6],
      () => 'A' as any,
    );
    expect(out.targets).toEqual([
      { dayOfWeek: 0, profile: 'A' },
      { dayOfWeek: 1, profile: 'A' },
      { dayOfWeek: 2, profile: 'A' },
      { dayOfWeek: 3, profile: 'A' },
      { dayOfWeek: 4, profile: 'A' },
      { dayOfWeek: 5, profile: 'A' },
      { dayOfWeek: 6, profile: 'A' },
    ]);
    expect(out.skipped).toEqual([]);
  });
});

describe('resolveMultiDayTargets — invariantes de forma', () => {
  it('NaN como dia lanca RangeError (nao vira alvo silencioso)', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    expect(() => resolveMultiDayTargets([Number.NaN], profileMap({}))).toThrow(
      RangeError,
    );
  });

  it('nao muta o array de entrada ao ordenar a saida', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const input = [5, 1, 3];
    resolveMultiDayTargets(input, profileMap({ 1: 'A', 3: 'B', 5: 'C' }));
    expect(input).toEqual([5, 1, 3]);
  });

  it('nao ativa perfil: getProfileForDay e apenas lido, uma vez por dia distinto', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const spy = vi.fn((d: number) => (d === 3 ? 'B' : 'OFF'));
    resolveMultiDayTargets([3, 3, 4], spy as any);
    const daysAsked = spy.mock.calls.map((c) => c[0]).sort();
    expect(daysAsked).toEqual([3, 4]);
  });

  it('pulados tambem saem ordenados por dayOfWeek crescente', async () => {
    const { resolveMultiDayTargets } = await loadHelper();
    const out = resolveMultiDayTargets(
      [6, 0, 2],
      profileMap({ 0: 'OFF', 2: null, 6: 'OFF' }),
    );
    expect(out.skipped.map((s) => s.dayOfWeek)).toEqual([0, 2, 6]);
  });
});

// ===========================================================================
// summarizeMultiDayResult — tabela de casos do ADR-245 (9 linhas)
// ===========================================================================

describe('summarizeMultiDayResult — tabela de casos do ADR-245', () => {
  it('1 criado, nada mais — titulo no singular, sem descricao e sem variant (ADR caso 1)', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    const toast = summarizeMultiDayResult(
      { created: [3], failed: [], skipped: [] },
      DAY_LABELS,
    );
    expect(toast.title).toBe('Torneio adicionado a 1 dia');
    expect(toast.description).toBeUndefined();
    expect(toast.variant).toBeUndefined();
  });

  it('3 criados, nada mais — titulo no plural (ADR caso 2)', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    const toast = summarizeMultiDayResult(
      { created: [3, 4, 5], failed: [], skipped: [] },
      DAY_LABELS,
    );
    expect(toast.title).toBe('Torneio adicionado a 3 dias');
    expect(toast.description).toBeUndefined();
    expect(toast.variant).toBeUndefined();
  });

  it('criados + pulados do mesmo motivo — um unico grupo na clausula Pulados (ADR caso 3)', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    const toast = summarizeMultiDayResult(
      {
        created: [3],
        failed: [],
        skipped: [
          { dayOfWeek: 4, reason: 'no_active_profile' },
          { dayOfWeek: 5, reason: 'no_active_profile' },
        ],
      },
      DAY_LABELS,
    );
    expect(toast.title).toBe('Torneio adicionado a 1 dia');
    expect(toast.description).toBe('Pulados: Qui, Sex (dia sem perfil ativo)');
    expect(toast.variant).toBeUndefined();
  });

  it('pulados por motivos diferentes viram dois grupos separados por ponto e virgula (ADR caso 4)', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    const toast = summarizeMultiDayResult(
      {
        created: [3],
        failed: [],
        skipped: [
          { dayOfWeek: 4, reason: 'day_off' },
          { dayOfWeek: 5, reason: 'no_active_profile' },
        ],
      },
      DAY_LABELS,
    );
    expect(toast.title).toBe('Torneio adicionado a 1 dia');
    expect(toast.description).toBe(
      'Pulados: Qui (dia OFF); Sex (dia sem perfil ativo)',
    );
    expect(toast.variant).toBeUndefined();
  });

  it('falha parcial reporta N de M e vira destructive — nunca sucesso puro (ADR caso 5)', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    const toast = summarizeMultiDayResult(
      { created: [1, 2], failed: [3], skipped: [] },
      DAY_LABELS,
    );
    expect(toast.title).toBe('Adicionado a 2 de 3 dias');
    expect(toast.description).toBe('Falhou em Qua');
    expect(toast.variant).toBe('destructive');
  });

  it('falha parcial + pulados — pulados fora do denominador, clausulas concatenadas (ADR caso 6)', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    const toast = summarizeMultiDayResult(
      {
        created: [1],
        failed: [2, 3],
        skipped: [{ dayOfWeek: 4, reason: 'day_off' }],
      },
      DAY_LABELS,
    );
    expect(toast.title).toBe('Adicionado a 1 de 3 dias');
    expect(toast.description).toBe('Falhou em Ter, Qua. Pulados: Qui (dia OFF)');
    expect(toast.variant).toBe('destructive');
  });

  it('todos os POSTs falharam — titulo de falha total, destructive (ADR caso 7)', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    const toast = summarizeMultiDayResult(
      { created: [], failed: [1, 2], skipped: [] },
      DAY_LABELS,
    );
    expect(toast.title).toBe('Nao foi possivel adicionar');
    expect(toast.description).toBe('Falhou em Seg, Ter');
    expect(toast.variant).toBe('destructive');
  });

  it('nenhum dia valido (so pulados) — destructive, sem denominador (ADR caso 8)', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    const toast = summarizeMultiDayResult(
      {
        created: [],
        failed: [],
        skipped: [
          { dayOfWeek: 4, reason: 'day_off' },
          { dayOfWeek: 5, reason: 'day_off' },
        ],
      },
      DAY_LABELS,
    );
    expect(toast.title).toBe('Nenhum dia valido');
    expect(toast.description).toBe('Pulados: Qui, Sex (dia OFF)');
    expect(toast.variant).toBe('destructive');
  });

  it('lote inteiramente vazio lanca RangeError (estado inalcancavel) (ADR caso 9)', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    expect(() =>
      summarizeMultiDayResult(
        { created: [], failed: [], skipped: [] },
        DAY_LABELS,
      ),
    ).toThrow(RangeError);
  });
});

describe('summarizeMultiDayResult — invariantes de composicao', () => {
  it('dayLabels sem exatamente 7 entradas lanca RangeError', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    expect(() =>
      summarizeMultiDayResult(
        { created: [3], failed: [], skipped: [] },
        ['Dom', 'Seg', 'Ter'],
      ),
    ).toThrow(RangeError);
  });

  it('dayLabels com 8 entradas tambem lanca RangeError', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    expect(() =>
      summarizeMultiDayResult({ created: [3], failed: [], skipped: [] }, [
        'Dom',
        'Seg',
        'Ter',
        'Qua',
        'Qui',
        'Sex',
        'Sab',
        'Extra',
      ]),
    ).toThrow(RangeError);
  });

  it('grupo day_off vem antes de no_active_profile mesmo com skipped fora de ordem', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    const toast = summarizeMultiDayResult(
      {
        created: [3],
        failed: [],
        skipped: [
          { dayOfWeek: 5, reason: 'no_active_profile' },
          { dayOfWeek: 4, reason: 'day_off' },
        ],
      },
      DAY_LABELS,
    );
    expect(toast.description).toBe(
      'Pulados: Qui (dia OFF); Sex (dia sem perfil ativo)',
    );
  });

  it('dias dentro de um grupo de pulados saem em ordem crescente', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    const toast = summarizeMultiDayResult(
      {
        created: [0],
        failed: [],
        skipped: [
          { dayOfWeek: 6, reason: 'day_off' },
          { dayOfWeek: 2, reason: 'day_off' },
          { dayOfWeek: 4, reason: 'day_off' },
        ],
      },
      DAY_LABELS,
    );
    expect(toast.description).toBe('Pulados: Ter, Qui, Sab (dia OFF)');
  });

  it('qualquer item em failed torna o toast destructive, mesmo com maioria criada', async () => {
    const { summarizeMultiDayResult } = await loadHelper();
    const toast = summarizeMultiDayResult(
      { created: [0, 1, 2, 3, 4, 5], failed: [6], skipped: [] },
      DAY_LABELS,
    );
    expect(toast.variant).toBe('destructive');
    expect(toast.title).toBe('Adicionado a 6 de 7 dias');
  });
});
