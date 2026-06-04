// =============================================================================
// ADR-242 — Evolucao Mental Editavel na Sessao (Decisao 2 — medias derivadas)
//
// Helper PURO: recalcula as 5 medias da sessao como media aritmetica simples dos
// breaks resultantes, serializadas como string com 1 casa decimal (ex: "6.0"),
// paridade com o formato decimal das colunas grind_sessions.*Media.
//
// 0 breaks => todas as medias null (sem "fantasma").
//
// Mapeamento metrica -> coluna:
//   foco -> focoMedio
//   energia -> energiaMedia
//   confianca -> confiancaMedia
//   inteligenciaEmocional -> inteligenciaEmocionalMedia
//   interferencias -> interferenciasMedia
//
// Lesson #36: sem Date/drizzle/schema no topo (so logica pura).
// =============================================================================

interface BreakMetrics {
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
}

export interface DerivedMedias {
  focoMedio: string | null;
  energiaMedia: string | null;
  confiancaMedia: string | null;
  inteligenciaEmocionalMedia: string | null;
  interferenciasMedia: string | null;
}

function avgToString(values: number[]): string {
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / values.length;
  return mean.toFixed(1);
}

export function computeMediasFromBreaks(
  breaks: BreakMetrics[],
): DerivedMedias {
  if (!breaks || breaks.length === 0) {
    return {
      focoMedio: null,
      energiaMedia: null,
      confiancaMedia: null,
      inteligenciaEmocionalMedia: null,
      interferenciasMedia: null,
    };
  }

  return {
    focoMedio: avgToString(breaks.map((b) => Number(b.foco))),
    energiaMedia: avgToString(breaks.map((b) => Number(b.energia))),
    confiancaMedia: avgToString(breaks.map((b) => Number(b.confianca))),
    inteligenciaEmocionalMedia: avgToString(
      breaks.map((b) => Number(b.inteligenciaEmocional)),
    ),
    interferenciasMedia: avgToString(breaks.map((b) => Number(b.interferencias))),
  };
}

export default computeMediasFromBreaks;
