// =============================================================================
// grade/helpers — utilitarios component-scope da Grade Planner / DayDetailZoom.
//
// Mantenha helpers genericos cross-modulo em `client/src/lib/`. Este arquivo
// hospeda apenas helpers cuja semantica esta acoplada a estrutura de DnD/slot
// do grade (droppableId conventions, time slot map).
// =============================================================================

/**
 * Extrai o slot HH:mm de um droppableId `zoom-cell-{day}-{slot}`.
 *
 * Exemplo: `parseSlotFromDroppableId("zoom-cell-2-20:00") === "20:00"`.
 * Retorna `null` quando o id nao casa com o padrao.
 */
export function parseSlotFromDroppableId(droppableId: string): string | null {
  const m = /^zoom-cell-\d+-(.+)$/.exec(droppableId);
  return m ? m[1] : null;
}

/**
 * Encontra o primeiro slot vazio em `timeSlots` (ordem do array). Usado pelo
 * mobile fallback "+" do BibliotecaEmbedded para escolher destino default.
 */
export function findFirstFreeSlot(
  plannedSlots: Record<string, unknown[]>,
  timeSlots: string[],
): string | null {
  for (const s of timeSlots) {
    const list = plannedSlots[s];
    if (!list || list.length === 0) return s;
  }
  return null;
}

export type Breakpoint = "lg" | "md" | "sm";

/**
 * Detecta o breakpoint atual a partir de `window.innerWidth`. Fallback `lg`
 * (1440px) em SSR / ambientes sem `window`.
 */
export function detectBreakpoint(): Breakpoint {
  const w = typeof window !== "undefined" ? window.innerWidth : 1440;
  if (w >= 1024) return "lg";
  if (w >= 768) return "md";
  return "sm";
}
