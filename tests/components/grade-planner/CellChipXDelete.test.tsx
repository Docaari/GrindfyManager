/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint coach-page-reform-1 — RF-06: Hover X delete em CellChip.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-06.
 * Diagrama: x-delete-gate-flow.mermaid
 *
 * Comportamento canonico (founder confirmou 2026-05-07):
 *   - mouseenter no wrapper -> arma timer (armedAt = Date.now()).
 *   - 1000ms apos armed: isArmed=true, X opacity 1.0, click chama onRemove.
 *   - mouseleave ANTES de 1000ms: armedAt = null, reset.
 *   - mouseleave DEPOIS de 1000ms: armed preservado.
 *   - Click no body do chip: ignora gate (popover abre normalmente).
 *   - Click no X durante grace: noop (preventDefault + stopPropagation).
 *
 * data-testid: tournament-chip-x-delete-{tournamentId}
 *
 * Lessons:
 *   #2 — testid estavel.
 *   #14 — await import().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';

// Mock dependencies que CellChip pode puxar (TournamentChip, etc).
// Mantemos o real do TournamentChip para preservar comportamento DOM.

async function loadCellChip() {
  // CellChip e exportado de WeekGrid.tsx; pode ser interno (sem export).
  // Implementer: extrair CellChip como named export (ou criar arquivo dedicado).
  // RED: tentar importar como named export do WeekGrid OU de arquivo proprio.
  try {
    // @ts-expect-error - red phase
    const mod: any = await import('@/components/grade-planner/CellChip');
    return mod.CellChip ?? mod.default;
  } catch {
    // Fallback: WeekGrid pode exportar CellChip.
    // @ts-expect-error - red phase
    const mod: any = await import('@/components/grade-planner/WeekGrid');
    return mod.CellChip;
  }
}

const sampleTournament = {
  id: 'TOURN-1',
  name: 'Sunday Million',
  site: 'PokerStars',
  buyIn: '109',
  time: '20:00',
  type: 'Vanilla',
  speed: 'Normal',
};

beforeEach(() => {
  cleanup();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CellChip — hover X delete: visibilidade e gate timing (RF-06.1, RF-06.2)', () => {
  it('renderiza X delete com testid tournament-chip-x-delete-{id}', async () => {
    const CellChip = await loadCellChip();
    if (!CellChip) {
      throw new Error('CellChip nao foi carregado — implementer precisa exportar');
    }

    const onClick = vi.fn();
    const onRemove = vi.fn();
    const { container } = render(
      <CellChip tournament={sampleTournament} onClick={onClick} onRemove={onRemove} />
    );

    // X esta no DOM (mesmo invisivel via opacity).
    expect(screen.getByTestId('tournament-chip-x-delete-TOURN-1')).toBeInTheDocument();
  });

  it('mouseenter arma o gate (X aparece com opacity reduzida durante grace)', async () => {
    const CellChip = await loadCellChip();
    const onRemove = vi.fn();
    const { container } = render(
      <CellChip tournament={sampleTournament} onClick={vi.fn()} onRemove={onRemove} />
    );

    // Wrapper externo do CellChip (com classe `group` ou similar).
    // Identificamos via container raiz da render.
    const xButton = screen.getByTestId('tournament-chip-x-delete-TOURN-1');
    const wrapper = xButton.closest('[class*="group"]') ?? container.firstElementChild!;

    fireEvent.mouseEnter(wrapper as Element);

    // Imediatamente apos mouseenter: X esta em grace (aria-disabled=true).
    expect(xButton.getAttribute('aria-disabled')).toBe('true');
  });

  it('apos 1000ms o gate libera (aria-disabled=false)', async () => {
    const CellChip = await loadCellChip();
    const onRemove = vi.fn();
    const { container } = render(
      <CellChip tournament={sampleTournament} onClick={vi.fn()} onRemove={onRemove} />
    );

    const xButton = screen.getByTestId('tournament-chip-x-delete-TOURN-1');
    const wrapper = xButton.closest('[class*="group"]') ?? container.firstElementChild!;

    fireEvent.mouseEnter(wrapper as Element);

    // Avanca 1100ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(xButton.getAttribute('aria-disabled')).toBe('false');
  });
});

describe('CellChip — click no X (RF-06.3)', () => {
  it('click ANTES de 1000ms: onRemove NAO chamado', async () => {
    const CellChip = await loadCellChip();
    const onRemove = vi.fn();
    const { container } = render(
      <CellChip tournament={sampleTournament} onClick={vi.fn()} onRemove={onRemove} />
    );

    const xButton = screen.getByTestId('tournament-chip-x-delete-TOURN-1');
    const wrapper = xButton.closest('[class*="group"]') ?? container.firstElementChild!;

    fireEvent.mouseEnter(wrapper as Element);

    // Avanca apenas 500ms (ainda em grace).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    fireEvent.click(xButton);

    expect(onRemove).not.toHaveBeenCalled();
  });

  it('click APOS 1000ms: onRemove(tournamentId) eh chamado', async () => {
    const CellChip = await loadCellChip();
    const onRemove = vi.fn();
    const { container } = render(
      <CellChip tournament={sampleTournament} onClick={vi.fn()} onRemove={onRemove} />
    );

    const xButton = screen.getByTestId('tournament-chip-x-delete-TOURN-1');
    const wrapper = xButton.closest('[class*="group"]') ?? container.firstElementChild!;

    fireEvent.mouseEnter(wrapper as Element);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    fireEvent.click(xButton);

    expect(onRemove).toHaveBeenCalledWith('TOURN-1');
  });
});

describe('CellChip — mouseleave reset (RF-06.2)', () => {
  it('mouseleave ANTES de 1000ms reseta o timer (re-hover reinicia)', async () => {
    const CellChip = await loadCellChip();
    const onRemove = vi.fn();
    const { container } = render(
      <CellChip tournament={sampleTournament} onClick={vi.fn()} onRemove={onRemove} />
    );

    const xButton = screen.getByTestId('tournament-chip-x-delete-TOURN-1');
    const wrapper = (xButton.closest('[class*="group"]') ?? container.firstElementChild!) as Element;

    // Hover, 500ms passam, mouseleave.
    fireEvent.mouseEnter(wrapper);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.mouseLeave(wrapper);

    // Avanca mais 800ms (totalizando 1300ms desde o primeiro enter).
    // Se nao houvesse reset, gate ja teria liberado. Mas como reset ocorreu,
    // gate continua nao-armado.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    // Re-hover: gate reinicia do zero.
    fireEvent.mouseEnter(wrapper);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.click(xButton);

    // 500ms < 1000ms: ainda em grace, onRemove nao chamado.
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('mouseleave DEPOIS de 1000ms preserva armed (re-entry mantem clicavel)', async () => {
    const CellChip = await loadCellChip();
    const onRemove = vi.fn();
    const { container } = render(
      <CellChip tournament={sampleTournament} onClick={vi.fn()} onRemove={onRemove} />
    );

    const xButton = screen.getByTestId('tournament-chip-x-delete-TOURN-1');
    const wrapper = (xButton.closest('[class*="group"]') ?? container.firstElementChild!) as Element;

    fireEvent.mouseEnter(wrapper);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    // Saiu apos gate completo.
    fireEvent.mouseLeave(wrapper);

    // Re-entry imediato.
    fireEvent.mouseEnter(wrapper);

    // Click — gate ja estava armado, deve passar.
    fireEvent.click(xButton);

    expect(onRemove).toHaveBeenCalledWith('TOURN-1');
  });
});

describe('CellChip — body click ignora gate (RF-06.6)', () => {
  it('click no body do chip (nao no X) abre popover normalmente — gate ignorado', async () => {
    const CellChip = await loadCellChip();
    const onClick = vi.fn();
    const onRemove = vi.fn();
    const { container } = render(
      <CellChip tournament={sampleTournament} onClick={onClick} onRemove={onRemove} />
    );

    // Procurar elemento que NAO eh o X — o TournamentChip body.
    // Body do chip nao tem testid especifico mas e o filho direto do wrapper.
    const xButton = screen.getByTestId('tournament-chip-x-delete-TOURN-1');
    const wrapper = (xButton.closest('[class*="group"]') ?? container.firstElementChild!) as HTMLElement;
    // Pegamos o primeiro descendant que NAO seja o X.
    const body = Array.from(wrapper.querySelectorAll('*')).find(
      (el) => el !== xButton && !xButton.contains(el) && !el.contains(xButton)
    ) as HTMLElement | undefined;

    if (body) {
      fireEvent.click(body);
      // onClick (handler do TournamentChip body) deve ter sido chamado OU
      // o popover deve ter aberto. Ambas evidencias mostram que gate foi ignorado.
      expect(onClick.mock.calls.length + (document.body.querySelectorAll('[role="dialog"], [data-state="open"]').length))
        .toBeGreaterThan(0);
    } else {
      // Fallback: clica no wrapper (sem hover previo).
      fireEvent.click(wrapper);
      // Sem hover -> gate nao armou. Body click deve abrir popover.
      // Aceita: onClick chamado OU popover aberto.
      expect(onClick).toHaveBeenCalled();
    }
  });
});

describe('CellChip — aria-label dinamico (RF-06.4)', () => {
  it('aria-label muda durante grace vs apos gate', async () => {
    const CellChip = await loadCellChip();
    const onRemove = vi.fn();
    const { container } = render(
      <CellChip tournament={sampleTournament} onClick={vi.fn()} onRemove={onRemove} />
    );

    const xButton = screen.getByTestId('tournament-chip-x-delete-TOURN-1');
    const wrapper = (xButton.closest('[class*="group"]') ?? container.firstElementChild!) as Element;

    // Antes de qualquer hover: nao armado, aria-label = aguarde.
    const initialLabel = xButton.getAttribute('aria-label') || '';
    expect(/aguarde|1s/i.test(initialLabel)).toBe(true);

    // Durante grace.
    fireEvent.mouseEnter(wrapper);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const graceLabel = xButton.getAttribute('aria-label') || '';
    expect(/aguarde|1s/i.test(graceLabel)).toBe(true);

    // Apos gate.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const armedLabel = xButton.getAttribute('aria-label') || '';
    expect(/remover/i.test(armedLabel)).toBe(true);
    expect(/aguarde|1s/i.test(armedLabel)).toBe(false);
  });
});

describe('CellChip — sem onRemove prop: nao renderiza X', () => {
  it('quando onRemove ausente, X nao renderiza (X e opcional)', async () => {
    const CellChip = await loadCellChip();
    render(<CellChip tournament={sampleTournament} onClick={vi.fn()} />);
    expect(screen.queryByTestId('tournament-chip-x-delete-TOURN-1')).not.toBeInTheDocument();
  });
});
