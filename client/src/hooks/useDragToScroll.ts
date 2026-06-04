import { useCallback, useRef } from "react";

/**
 * Pan-to-scroll: agarrar uma area vazia do container e arrastar com o mouse
 * para rolar horizontalmente (estilo mapa/Trello). Usado na grade semanal do
 * GradePlanner para alcancar as colunas da direita (Dom/Sab) quando a grade
 * excede a largura do painel.
 *
 * Cuidados (a grade compartilha o mesmo espaco de pointer com outras acoes):
 * - NAO inicia pan quando o pointerdown cai num elemento interativo
 *   (chip arrastavel do react-beautiful-dnd, botoes A/B/C, links, inputs) —
 *   deixa o drag-and-drop de torneios e os cliques funcionarem.
 * - So pana com o mouse (pointerType 'mouse'); touch usa o scroll nativo do
 *   overflow-x-auto (evita brigar com o gesto de rolagem do dedo).
 * - So vira "pan" apos mover > THRESHOLD px; abaixo disso e tratado como
 *   clique (ex.: clicar celula vazia para adicionar torneio). Apos um pan
 *   real, suprime o `click` subsequente para nao disparar a acao da celula.
 */

const THRESHOLD_PX = 5;

const INTERACTIVE_SELECTOR =
  '[data-rbd-drag-handle-draggable-id],button,a,input,select,textarea,[role="button"],[data-no-pan]';

export function useDragToScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const state = useRef({
    active: false,
    moved: false,
    startX: 0,
    startScroll: 0,
    pointerId: -1,
  });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest(INTERACTIVE_SELECTOR)) return;
    state.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      pointerId: e.pointerId,
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = state.current;
    if (!s.active) return;
    const el = ref.current;
    if (!el) return;
    const dx = e.clientX - s.startX;
    if (!s.moved && Math.abs(dx) < THRESHOLD_PX) return;
    if (!s.moved) {
      s.moved = true;
      try {
        el.setPointerCapture(s.pointerId);
      } catch {
        /* ignore */
      }
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
    }
    el.scrollLeft = s.startScroll - dx;
  }, []);

  const end = useCallback(() => {
    const s = state.current;
    const el = ref.current;
    if (s.moved && el) {
      el.style.cursor = "";
      el.style.userSelect = "";
      try {
        el.releasePointerCapture(s.pointerId);
      } catch {
        /* ignore */
      }
      // Suprime o click que vem logo apos o pan (evita disparar a acao da
      // celula vazia / abrir popover ao soltar).
      const suppress = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      el.addEventListener("click", suppress, { capture: true, once: true });
    }
    s.active = false;
    s.moved = false;
  }, []);

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerLeave: end,
    },
  };
}
