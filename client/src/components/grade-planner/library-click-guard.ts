// =============================================================================
// Sprint grade-planner-library-and-multi-day — RF-03, defesa 3 do ADR-245 §D3.
//
// Guarda contra "arrastei o card da biblioteca e ganhei um modal de criacao por
// cima". O ADR empilha tres defesas:
//   1. stopPropagation no X de excluir e no "+" inline (LibraryCard);
//   2. bloqueio de clique pos-drag do react-beautiful-dnd (implicito, so roda
//      em navegador);
//   3. esta guarda, alimentada pelo estado `dragging` / `lastDragEndAt` do
//      GradePlanner. E a unica das tres que da para exercitar de forma
//      deterministica, porque nao depende do interno de uma lib descontinuada.
//
// Regra pura: o relogio entra injetado (`now`), o helper nao le Date.now().
// =============================================================================

/**
 * Janela apos o `onDragEnd` em que o clique no card e ignorado.
 *
 * Derivada do proposito, nao de gosto: precisa cobrir o `click` que o navegador
 * despacha logo depois do `mouseup` do arrasto (mesmo tick de interacao) e nada
 * alem disso — um clique deliberado do jogador vem bem depois.
 */
export const LIBRARY_CLICK_POST_DRAG_BLOCK_MS = 250;

export interface LibraryCardClickGuardInput {
  /** Estado vivo do GradePlanner: o que esta sendo arrastado agora. */
  dragging: "cell" | "library" | null;
  /** Date.now() do ultimo onDragEnd, ou null se nunca houve arrasto. */
  lastDragEndAt: number | null;
  /** Relogio injetado. */
  now: number;
}

/**
 * `true` quando o clique deve ser descartado: ha arrasto em curso, ou o arrasto
 * acabou de terminar (inclusive com o relogio andando para tras, caso em que
 * nao da para afirmar que o clique e limpo — na duvida, descarta).
 */
export function shouldIgnoreLibraryCardClick(
  input: LibraryCardClickGuardInput,
): boolean {
  const { dragging, lastDragEndAt, now } = input;

  if (dragging !== null) return true;
  if (lastDragEndAt === null) return false;

  const elapsed = now - lastDragEndAt;
  if (elapsed < 0) return true;
  return elapsed < LIBRARY_CLICK_POST_DRAG_BLOCK_MS;
}
