// =============================================================================
// ADR-242 — Evolucao Mental Editavel na Sessao (bulk-replace + medias derivadas)
//
// Spec : Docs/specs/evolucao-mental-editavel-sessao.md (RF-07 / Q-01 Opcao B)
// ADR  : 242 (Decisao 2 — medias derivadas, recalculo no server)
//
// Mode : TDD (red phase) — helper PURO computeMediasFromBreaks NAO EXISTE ainda.
//
// Contrato esperado (server/coach OU server/routes helper puro, sem db/drizzle):
//   computeMediasFromBreaks(breaks: { foco, energia, confianca,
//     inteligenciaEmocional, interferencias }[]):
//       { focoMedio, energiaMedia, confiancaMedia,
//         inteligenciaEmocionalMedia, interferenciasMedia }
//   - media aritmetica das 5 metricas do conjunto final, serializada como string
//     com 1 casa decimal (ex: "6.0"), paridade com formato decimal atual.
//   - 0 breaks => todas as medias null (ADR-242 Decisao 2; nao "fantasma").
//   - mapeamento: foco->focoMedio, energia->energiaMedia, confianca->confiancaMedia,
//     inteligenciaEmocional->inteligenciaEmocionalMedia,
//     interferencias->interferenciasMedia.
//
// Lessons: #36 helper PURO sem Date/drizzle/schema no topo (so logica). Sem emoji.
// =============================================================================

import { describe, it, expect } from 'vitest';

async function loadHelper(): Promise<any | null> {
  // Caminho canonico proposto pela feature; o implementer cria o modulo.
  const candidates = [
    '../../../server/coach/grind/computeMediasFromBreaks',
    '../../../server/routes/grind-session-medias',
    '../../../server/coach/grindSession/computeMediasFromBreaks',
  ];
  for (const p of candidates) {
    try {
      const mod = await import(/* @vite-ignore */ p);
      const fn = mod.computeMediasFromBreaks ?? mod.default;
      if (typeof fn === 'function') return fn;
    } catch {
      // tenta proximo candidato
    }
  }
  return null;
}

function brk(over: Partial<Record<string, number>> = {}): any {
  return {
    foco: 5,
    energia: 5,
    confianca: 5,
    inteligenciaEmocional: 5,
    interferencias: 5,
    ...over,
  };
}

describe('computeMediasFromBreaks (ADR-242 Decisao 2)', () => {
  it('existe e e funcao pura importavel', async () => {
    const fn = await loadHelper();
    expect(fn).not.toBeNull();
  });

  it('2 breaks energia 4 e 8 -> energiaMedia "6.0"', async () => {
    const fn = await loadHelper();
    expect(fn).not.toBeNull();
    const out = fn([brk({ energia: 4 }), brk({ energia: 8 })]);
    // aceita "6" ou "6.0" — o ADR pede 1 casa decimal como string
    expect(String(out.energiaMedia)).toMatch(/^6(\.0)?$/);
  });

  it('mapeia cada metrica para a coluna *Media correta', async () => {
    const fn = await loadHelper();
    expect(fn).not.toBeNull();
    const out = fn([
      brk({ foco: 7, energia: 6, confianca: 8, inteligenciaEmocional: 5, interferencias: 9 }),
    ]);
    expect(String(out.focoMedio)).toMatch(/^7(\.0)?$/);
    expect(String(out.energiaMedia)).toMatch(/^6(\.0)?$/);
    expect(String(out.confiancaMedia)).toMatch(/^8(\.0)?$/);
    expect(String(out.inteligenciaEmocionalMedia)).toMatch(/^5(\.0)?$/);
    expect(String(out.interferenciasMedia)).toMatch(/^9(\.0)?$/);
  });

  it('3 breaks foco 3,4,5 -> focoMedio "4.0"', async () => {
    const fn = await loadHelper();
    expect(fn).not.toBeNull();
    const out = fn([brk({ foco: 3 }), brk({ foco: 4 }), brk({ foco: 5 })]);
    expect(String(out.focoMedio)).toMatch(/^4(\.0)?$/);
  });

  it('media com 1 casa decimal quando nao inteira (ex: 5 e 6 -> "5.5")', async () => {
    const fn = await loadHelper();
    expect(fn).not.toBeNull();
    const out = fn([brk({ confianca: 5 }), brk({ confianca: 6 })]);
    expect(String(out.confiancaMedia)).toBe('5.5');
  });

  it('0 breaks -> TODAS as medias null (sem fantasma, ADR-242 Decisao 2)', async () => {
    const fn = await loadHelper();
    expect(fn).not.toBeNull();
    const out = fn([]);
    expect(out.focoMedio).toBeNull();
    expect(out.energiaMedia).toBeNull();
    expect(out.confiancaMedia).toBeNull();
    expect(out.inteligenciaEmocionalMedia).toBeNull();
    expect(out.interferenciasMedia).toBeNull();
  });

  it('1 break -> medias = valores do proprio break', async () => {
    const fn = await loadHelper();
    expect(fn).not.toBeNull();
    const out = fn([brk({ foco: 10, energia: 0, confianca: 7, inteligenciaEmocional: 3, interferencias: 2 })]);
    expect(String(out.focoMedio)).toMatch(/^10(\.0)?$/);
    expect(String(out.energiaMedia)).toMatch(/^0(\.0)?$/);
    expect(String(out.confiancaMedia)).toMatch(/^7(\.0)?$/);
  });
});
