// =============================================================================
// Zona de descarte da grade — aparece no rodape quando um torneio comeca a ser
// arrastado (da grade ou da biblioteca) e some quando o drag termina.
//
// Por que fica SEMPRE montado (e nao renderizado no onDragStart):
// react-beautiful-dnd mede os droppables no lift. Um Droppable que nasce no
// meio do drag nao entra na medicao e nunca recebe o drop. Entao o elemento
// vive o tempo todo, invisivel e sem capturar clique (opacity 0 +
// pointer-events-none), e so acende no drag. Nada de transform no container —
// deslocar a caixa depois da medicao bagunca a deteccao de colisao do rbd.
// =============================================================================

import { Trash2 } from "lucide-react";
import { StrictModeDroppable as Droppable } from "./StrictModeDroppable";

export const GRADE_TRASH_DROPPABLE_ID = "grade-trash";

export interface DragTrashZoneProps {
  /** Origem do item em drag: null = nao ha drag em andamento. */
  dragging: "cell" | "library" | null;
}

export function DragTrashZone({ dragging }: DragTrashZoneProps) {
  const active = dragging !== null;

  return (
    <Droppable droppableId={GRADE_TRASH_DROPPABLE_ID}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          data-testid="grade-trash-zone"
          data-active={active ? "true" : "false"}
          data-over={snapshot.isDraggingOver ? "true" : "false"}
          aria-hidden={!active}
          className={
            // z-[55]: acima da barra do mini player (z-40), abaixo dos dialogs
            // (z-[60]). Altura curta de proposito — a zona compete por drop
            // com as celulas que estiverem no rodape da viewport.
            "fixed inset-x-0 bottom-0 z-[55] flex h-24 items-end justify-center " +
            "px-6 pb-3 transition-opacity duration-200 " +
            (active
              ? "opacity-100"
              : "pointer-events-none opacity-0")
          }
        >
          {/* Veu que funde a zona com o fundo da pagina. */}
          <div
            className={
              "pointer-events-none absolute inset-0 backdrop-blur-[2px] transition-colors duration-200 " +
              (snapshot.isDraggingOver
                ? "bg-gradient-to-t from-red-950/70 via-red-950/25 to-transparent"
                : "bg-gradient-to-t from-gray-950/85 via-gray-950/40 to-transparent")
            }
          />

          <div
            className={
              "relative flex w-full max-w-3xl items-center justify-center gap-3 rounded-2xl border border-dashed " +
              "px-6 py-4 text-sm font-medium transition-all duration-200 " +
              (snapshot.isDraggingOver
                ? "border-red-400 bg-red-500/15 text-red-200 shadow-[0_0_30px_-8px_rgba(248,113,113,0.6)]"
                : "border-gray-600/70 bg-gray-900/70 text-gray-300")
            }
          >
            <Trash2
              className={
                "transition-transform duration-200 " +
                (snapshot.isDraggingOver
                  ? "h-6 w-6 scale-110 text-red-300"
                  : "h-5 w-5 text-gray-400")
              }
            />
            <span>
              {snapshot.isDraggingOver
                ? "Solte para remover"
                : dragging === "library"
                  ? "Arraste ate aqui para mandar para a lixeira da biblioteca"
                  : "Arraste ate aqui para tirar da grade"}
            </span>
          </div>

          {/* Placeholder obrigatorio do rbd — sem tamanho proprio aqui. */}
          <span className="hidden">{provided.placeholder}</span>
        </div>
      )}
    </Droppable>
  );
}

export default DragTrashZone;
