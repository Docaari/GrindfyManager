interface CellDisplayInfo {
  visible: any[];
  overflow: number;
  hasOverflow: boolean;
}

/**
 * GP-D polish (UX-2 2026-04-25): ordena por prioridade ASC (1=Alta primeiro)
 * antes de cortar pelo maxVisible. Antes, torneios eram exibidos na ordem do
 * array — torneios caros (priority=1) podiam acabar escondidos no overflow
 * enquanto torneios baixa-prioridade (priority=3) ocupavam os slots visiveis.
 *
 * Tie-breaker estavel: quando torneios tem mesma prioridade, mantem a ordem
 * original. Suporta `priority` ou `prioridade` (ambos os campos sao usados
 * no codebase). Default 2 (Media) quando ausente.
 */
export function getCellDisplayInfo(tournaments: any[], maxVisible: number): CellDisplayInfo {
  const indexed = tournaments.map((t, idx) => ({
    t,
    idx,
    priority: (t.priority ?? t.prioridade ?? 2) as number,
  }));
  indexed.sort((a, b) => a.priority - b.priority || a.idx - b.idx);
  const visible = indexed.slice(0, maxVisible).map((x) => x.t);
  const overflow = tournaments.length - visible.length;

  return {
    visible,
    overflow,
    hasOverflow: overflow > 0,
  };
}
