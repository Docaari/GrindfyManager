// PRNG do motor (F1 / RF-01.4, ADR-246 D-F1-5).
//
// Semente FIXA e o que torna o Monte Carlo reproduzivel: sem ela, dois calculos
// do mesmo spot divergem e o jogador nao sabe em qual acreditar. `Math.random`
// nao serve — nao aceita semente.
//
// Sem dependencia nova (Artigo VII): mulberry32 sao 6 linhas e passa nos testes
// estatisticos usuais para o uso aqui (amostragem de combos e runouts).

/** Semente padrao. Mesmo numero do MindRiver (emenda A2) — nao ha razao de divergir. */
export const DEFAULT_SEED = 20240815;

/** Gerador determinístico em [0, 1). Mesma semente, mesma sequencia, sempre. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
