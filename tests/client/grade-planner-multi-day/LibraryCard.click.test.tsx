/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint grade-planner-library-and-multi-day — RF-03 clique no card.
 * Spec: Docs/specs/grade-planner-library-and-multi-day.md §RF-03.
 * ADR:  Docs/architecture/decisions/245-...-multi-day.md §D3 (defesa 1) e §C6.
 *
 * Contrato novo em client/src/components/grade-planner/LibraryCard.tsx:
 *   onCardClick?: () => void   // OPCIONAL — sem ela o card se comporta como hoje
 *
 * Quando presente, o card ganha cursor-pointer, role="button", title citando
 * "clique para escolher os dias" e o data-testid `library-card-${id}`.
 *
 * O QUE ESTE ARQUIVO NAO COBRE, de proposito: "arrastar ate a celula / ate a
 * lixeira nao abre o modal". O bloqueio de clique pos-drag do
 * react-beautiful-dnd nao roda em jsdom (ADR §D3 "Consequencia declarada"). A
 * parte testavel dessa protecao esta em
 * tests/unit/grade-planner/library-click-guard.test.ts; o resto e verificacao
 * de navegador.
 *
 * O que ESTE arquivo cobre da protecao: a defesa 1 — o X de excluir e o "+"
 * inline fazem stopPropagation e nunca abrem o modal.
 *
 * Lessons: #14/#26/#38 (await import, nunca require), #2 (data-testid estavel).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const LIBRARY_ROW = {
  id: 'lib-42',
  name: 'Bounty Builder HR',
  site: 'PokerStars',
  buyIn: '109',
  guaranteed: '50000',
  time: '18:45',
  type: 'PKO',
  speed: 'Turbo',
  source: 'manual',
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1440 });
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderCard(override: Record<string, any> = {}) {
  const React = await import('react');
  const { render, screen, fireEvent } = await import('@testing-library/react');
  const { LibraryCard } = await import(
    '@/components/grade-planner/LibraryCard'
  );

  const props: Record<string, any> = {
    tournament: LIBRARY_ROW,
    onCardClick: vi.fn(),
    ...override,
  };

  const result = render(React.createElement(LibraryCard as any, props));
  return { ...result, screen, fireEvent, props };
}

describe('LibraryCard — clique abre o fluxo de escolha de dias', () => {
  it('expoe data-testid library-card-${id} para o teste achar o card', async () => {
    const { screen } = await renderCard();
    expect(await screen.findByTestId('library-card-lib-42')).toBeInTheDocument();
  });

  it('clicar no card chama onCardClick', async () => {
    const { screen, fireEvent, props } = await renderCard();
    fireEvent.click(await screen.findByTestId('library-card-lib-42'));
    expect(props.onCardClick).toHaveBeenCalledTimes(1);
  });

  it('card clicavel anuncia role=button (acessibilidade — RNF da spec)', async () => {
    const { screen } = await renderCard();
    expect(
      (await screen.findByTestId('library-card-lib-42')).getAttribute('role'),
    ).toBe('button');
  });

  it('card clicavel tem title citando a escolha de dias', async () => {
    const { screen } = await renderCard();
    const title = (await screen.findByTestId('library-card-lib-42')).getAttribute(
      'title',
    );
    expect(title).toBeTruthy();
    expect(title).toMatch(/dias/i);
  });

  it('o modo compacto tambem responde ao clique (ADR §C6 — e o mesmo card)', async () => {
    const { screen, fireEvent, props } = await renderCard({ compact: true });
    fireEvent.click(await screen.findByTestId('library-card-lib-42'));
    expect(props.onCardClick).toHaveBeenCalledTimes(1);
  });
});

describe('LibraryCard — back-compat sem onCardClick (BibliotecaEmbedded)', () => {
  it('sem a prop, clicar no card nao quebra e o card nao vira role=button', async () => {
    const { screen, fireEvent } = await renderCard({ onCardClick: undefined });
    const card = await screen.findByTestId('library-card-lib-42');
    expect(card.getAttribute('role')).not.toBe('button');
    expect(() => fireEvent.click(card)).not.toThrow();
  });
});

describe('LibraryCard — os controles internos nao abrem o modal (stopPropagation)', () => {
  it('o "+" inline mobile chama onAddInline e NAO chama onCardClick', async () => {
    const onAddInline = vi.fn();
    const { screen, fireEvent, props } = await renderCard({
      showAddInlineButton: true,
      onAddInline,
    });
    fireEvent.click(await screen.findByTestId('library-card-add-inline-lib-42'));
    expect(onAddInline).toHaveBeenCalledTimes(1);
    expect(props.onCardClick).not.toHaveBeenCalled();
  });

  it('o "+" inline do modo compacto tambem nao abre o modal', async () => {
    const onAddInline = vi.fn();
    const { screen, fireEvent, props } = await renderCard({
      compact: true,
      showAddInlineButton: true,
      onAddInline,
    });
    fireEvent.click(await screen.findByTestId('library-card-add-inline-lib-42'));
    expect(onAddInline).toHaveBeenCalledTimes(1);
    expect(props.onCardClick).not.toHaveBeenCalled();
  });

  it('o X de excluir manda o card para a lixeira e NAO chama onCardClick', async () => {
    const React = await import('react');
    const { render, screen, fireEvent, act } = await import(
      '@testing-library/react'
    );
    const { LibraryCard, LIBRARY_CARD_DELETE_REVEAL_MS } = await import(
      '@/components/grade-planner/LibraryCard'
    );

    const onTrash = vi.fn();
    const onCardClick = vi.fn();

    // Timers falsos so DEPOIS dos imports dinamicos — congelar antes trava o
    // module runner do Vitest.
    vi.useFakeTimers();

    render(
      React.createElement(LibraryCard as any, {
        tournament: LIBRARY_ROW,
        onTrash,
        onCardClick,
      }),
    );

    const card = screen.getByTestId('library-card-lib-42');
    fireEvent.mouseEnter(card);
    act(() => {
      vi.advanceTimersByTime(LIBRARY_CARD_DELETE_REVEAL_MS + 50);
    });

    fireEvent.click(screen.getByTestId('library-card-delete'));

    expect(onTrash).toHaveBeenCalledWith('lib-42');
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
