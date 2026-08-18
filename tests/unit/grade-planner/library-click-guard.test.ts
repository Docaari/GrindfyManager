/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint grade-planner-library-and-multi-day — RF-03, defesa 3 do ADR-245 §D3.
 * Spec: Docs/specs/grade-planner-library-and-multi-day.md §RF-03.
 * ADR:  Docs/architecture/decisions/245-...-multi-day.md §D3 e §Q3/Opcao A.
 *
 * O QUE ESTE ARQUIVO PROTEGE (e o que ele explicitamente NAO protege):
 *
 * O ADR empilha tres defesas contra "arrastei o card e ganhei um modal de
 * criacao por cima":
 *   1. stopPropagation no X de excluir e no "+" inline  -> coberto em
 *      tests/client/grade-planner-multi-day/LibraryCard.click.test.tsx
 *   2. bloqueio de clique pos-drag do react-beautiful-dnd -> NAO roda em jsdom.
 *      So tem cobertura em navegador. Nao ha teste aqui para isso, de proposito.
 *   3. guarda propria por estado `dragging` + janela curta apos onDragEnd ->
 *      E ESTE ARQUIVO. E a unica das tres que da para exercitar de forma
 *      deterministica sem depender do interno de uma lib descontinuada.
 *
 * Modulo alvo (AINDA NAO EXISTE):
 *   client/src/components/grade-planner/library-click-guard.ts
 *     export const LIBRARY_CLICK_POST_DRAG_BLOCK_MS: number
 *     export function shouldIgnoreLibraryCardClick(input: {
 *       dragging: 'cell' | 'library' | null;   // estado vivo do GradePlanner
 *       lastDragEndAt: number | null;          // Date.now() do ultimo onDragEnd
 *       now: number;                           // relogio injetado (helper puro)
 *     }): boolean
 *
 * Nota de contrato imposta pelo teste: o ADR diz que a guarda "vive no
 * GradePlanner". Renderizar GradePlanner inteiro em jsdom para exercitar sete
 * linhas de decisao seria caro e fragil (useQuery x N, react-resizable-panels,
 * rbd). Regra pura -> helper puro com teste unitario (.claude/rules/02).
 * O GradePlanner passa a CONSUMIR este helper; o estado continua dele.
 *
 * O relogio entra injetado (`now`) porque teste preso a Date.now() real fica
 * dependente de escalonamento — o helper nao le relogio.
 *
 * Nenhuma assercao pina o valor de LIBRARY_CLICK_POST_DRAG_BLOCK_MS: os limites
 * sao calculados A PARTIR da constante exportada. Escolher 150ms ou 400ms e
 * decisao do implementer; o que o teste protege e a forma da janela.
 */

import { describe, it, expect } from 'vitest';

async function loadGuard() {
  // Caminho relativo (nao alias) por paridade com os vizinhos deste diretorio,
  // que ja importam de client/src assim em teste do projeto node.
  return await import(
    '../../../client/src/components/grade-planner/library-click-guard'
  );
}

describe('shouldIgnoreLibraryCardClick — guarda por estado dragging', () => {
  it('ignora o clique enquanto um card da biblioteca esta sendo arrastado', async () => {
    const { shouldIgnoreLibraryCardClick } = await loadGuard();
    expect(
      shouldIgnoreLibraryCardClick({
        dragging: 'library',
        lastDragEndAt: null,
        now: 1_000_000,
      }),
    ).toBe(true);
  });

  it('ignora o clique enquanto um card da GRADE esta sendo arrastado', async () => {
    const { shouldIgnoreLibraryCardClick } = await loadGuard();
    expect(
      shouldIgnoreLibraryCardClick({
        dragging: 'cell',
        lastDragEndAt: null,
        now: 1_000_000,
      }),
    ).toBe(true);
  });

  it('deixa passar o clique limpo — sem arrasto em curso e sem arrasto recente', async () => {
    const { shouldIgnoreLibraryCardClick } = await loadGuard();
    expect(
      shouldIgnoreLibraryCardClick({
        dragging: null,
        lastDragEndAt: null,
        now: 1_000_000,
      }),
    ).toBe(false);
  });
});

describe('shouldIgnoreLibraryCardClick — janela curta apos onDragEnd', () => {
  it('ignora o clique disparado no mesmo instante do onDragEnd (soltar na lixeira/celula)', async () => {
    const { shouldIgnoreLibraryCardClick } = await loadGuard();
    const end = 1_000_000;
    expect(
      shouldIgnoreLibraryCardClick({
        dragging: null,
        lastDragEndAt: end,
        now: end,
      }),
    ).toBe(true);
  });

  it('ignora o clique que chega 1ms antes do fim da janela pos-arrasto', async () => {
    const { shouldIgnoreLibraryCardClick, LIBRARY_CLICK_POST_DRAG_BLOCK_MS } =
      await loadGuard();
    const end = 1_000_000;
    expect(
      shouldIgnoreLibraryCardClick({
        dragging: null,
        lastDragEndAt: end,
        now: end + LIBRARY_CLICK_POST_DRAG_BLOCK_MS - 1,
      }),
    ).toBe(true);
  });

  it('deixa passar o clique que chega depois do fim da janela pos-arrasto', async () => {
    const { shouldIgnoreLibraryCardClick, LIBRARY_CLICK_POST_DRAG_BLOCK_MS } =
      await loadGuard();
    const end = 1_000_000;
    expect(
      shouldIgnoreLibraryCardClick({
        dragging: null,
        lastDragEndAt: end,
        now: end + LIBRARY_CLICK_POST_DRAG_BLOCK_MS + 1,
      }),
    ).toBe(false);
  });

  it('ignora o clique quando o relogio anda para tras (now anterior ao onDragEnd)', async () => {
    const { shouldIgnoreLibraryCardClick } = await loadGuard();
    const end = 1_000_000;
    expect(
      shouldIgnoreLibraryCardClick({
        dragging: null,
        lastDragEndAt: end,
        now: end - 50,
      }),
    ).toBe(true);
  });
});

describe('LIBRARY_CLICK_POST_DRAG_BLOCK_MS — forma da constante', () => {
  it('e um numero finito e positivo (janela existe de fato)', async () => {
    const { LIBRARY_CLICK_POST_DRAG_BLOCK_MS } = await loadGuard();
    expect(Number.isFinite(LIBRARY_CLICK_POST_DRAG_BLOCK_MS)).toBe(true);
    expect(LIBRARY_CLICK_POST_DRAG_BLOCK_MS).toBeGreaterThan(0);
  });
});
