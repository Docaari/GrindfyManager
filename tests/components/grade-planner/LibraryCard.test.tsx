/**
 * Sprint biblioteca-enrich — LibraryCard: X de exclusao aparece apenas apos
 * LIBRARY_CARD_DELETE_REVEAL_MS com o mouse parado no card.
 *
 * client/src/components/grade-planner/LibraryCard.tsx.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';

const tournament = {
  id: 'tpl-1',
  name: 'Bounty Hunter',
  site: 'PokerStars',
  buyIn: '50',
  speed: 'Normal',
  source: 'manual',
};

async function load() {
  const mod: any = await import('@/components/grade-planner/LibraryCard');
  return { LibraryCard: mod.LibraryCard, DELAY: mod.LIBRARY_CARD_DELETE_REVEAL_MS as number };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LibraryCard — X de exclusao com delay no hover', () => {
  it('exporta um delay positivo', async () => {
    const { DELAY } = await load();
    expect(DELAY).toBeGreaterThan(0);
  });

  it('X nao aparece no render inicial', async () => {
    const { LibraryCard } = await load();
    render(<LibraryCard tournament={tournament} onTrash={vi.fn()} />);
    expect(screen.queryByTestId('library-card-delete')).not.toBeInTheDocument();
  });

  it('X ainda nao aparece logo apos mouseEnter (antes do delay)', async () => {
    const { LibraryCard, DELAY } = await load();
    vi.useFakeTimers();
    const { container } = render(<LibraryCard tournament={tournament} onTrash={vi.fn()} />);
    fireEvent.mouseEnter(container.firstChild as Element);
    act(() => {
      vi.advanceTimersByTime(DELAY - 50);
    });
    expect(screen.queryByTestId('library-card-delete')).not.toBeInTheDocument();
  });

  it('X aparece depois do delay completo de hover', async () => {
    const { LibraryCard, DELAY } = await load();
    vi.useFakeTimers();
    const { container } = render(<LibraryCard tournament={tournament} onTrash={vi.fn()} />);
    fireEvent.mouseEnter(container.firstChild as Element);
    act(() => {
      vi.advanceTimersByTime(DELAY + 10);
    });
    expect(screen.getByTestId('library-card-delete')).toBeInTheDocument();
  });

  it('sair com o mouse antes do delay cancela o X', async () => {
    const { LibraryCard, DELAY } = await load();
    vi.useFakeTimers();
    const { container } = render(<LibraryCard tournament={tournament} onTrash={vi.fn()} />);
    const card = container.firstChild as Element;
    fireEvent.mouseEnter(card);
    act(() => {
      vi.advanceTimersByTime(DELAY - 50);
    });
    fireEvent.mouseLeave(card);
    act(() => {
      vi.advanceTimersByTime(DELAY + 100);
    });
    expect(screen.queryByTestId('library-card-delete')).not.toBeInTheDocument();
  });

  it('click no X chama onTrash com o id do torneio', async () => {
    const { LibraryCard, DELAY } = await load();
    const onTrash = vi.fn();
    vi.useFakeTimers();
    const { container } = render(<LibraryCard tournament={tournament} onTrash={onTrash} />);
    fireEvent.mouseEnter(container.firstChild as Element);
    act(() => {
      vi.advanceTimersByTime(DELAY + 10);
    });
    fireEvent.click(screen.getByTestId('library-card-delete'));
    expect(onTrash).toHaveBeenCalledWith('tpl-1');
  });

  it('sem onTrash o X nunca aparece, mesmo apos hover prolongado', async () => {
    const { LibraryCard, DELAY } = await load();
    vi.useFakeTimers();
    const { container } = render(<LibraryCard tournament={tournament} />);
    fireEvent.mouseEnter(container.firstChild as Element);
    act(() => {
      vi.advanceTimersByTime(DELAY * 3);
    });
    expect(screen.queryByTestId('library-card-delete')).not.toBeInTheDocument();
  });
});
