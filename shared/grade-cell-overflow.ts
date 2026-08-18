import { getDisplayRegistrationTime } from "./grade-time";

/**
 * Ordem de exibicao DENTRO da celula: horario de registro crescente, com a
 * prioridade so desempatando. A posicao do chip precisa refletir o horario
 * porque arrastar um torneio para baixo de outro passou a definir o horario
 * dele (ver computeGradeDropUpdates). Ordenar por prioridade aqui faria o chip
 * "pular de volta" depois do drop.
 *
 * Estavel: empate de horario e prioridade mantem a ordem original.
 */
export function sortCellByTime<T extends Record<string, any>>(tournaments: T[]): T[] {
  const toMinutes = (t: T): number => {
    const display = getDisplayRegistrationTime(t as any);
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(display || "").trim());
    if (!m) return Number.MAX_SAFE_INTEGER;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };
  return tournaments
    .map((t, idx) => ({
      t,
      idx,
      minutes: toMinutes(t),
      priority: (t.priority ?? t.prioridade ?? 2) as number,
    }))
    .sort(
      (a, b) =>
        a.minutes - b.minutes || a.priority - b.priority || a.idx - b.idx,
    )
    .map((x) => x.t);
}

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
