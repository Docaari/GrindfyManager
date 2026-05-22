// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 3 / RF-05.2 / RF-05.3 / RF-05.4 - QueuePopover UI
//
// Spec: Docs/specs/sprint-mini-player-3.md RF-05.2 + D9 + D10 + D12 + D13
//
// Target: client/src/components/audio-player/QueuePopover.tsx (NOVO)
//
// Contract:
//   - Renderiza lista de QueueItem com:
//       data-testid="queue-popover"
//       data-testid="queue-item-<id>" por item
//       data-testid="queue-clear-btn"
//       data-testid="queue-repeat-btn"
//       data-testid="queue-shuffle-btn"
//   - Empty state: "Fila vazia. Adicione aulas via biblioteca." (D9)
//   - dnd-kit lazy import: se falhar carregar, ErrorBoundary fallback
//     "Queue indisponivel" (lesson #29).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

function loadModule() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/components/audio-player/QueuePopover');
}

function makeQueueItem(id: string, source: 'library' | 'spotify' = 'library') {
  return {
    id,
    addedAt: Date.now(),
    track: {
      source,
      trackId: `t-${id}`,
      title: `Track ${id}`,
      audioUrl: `/audio/${id}.mp3`,
      durationSeconds: 600,
      coverUrl: source === 'library' ? `https://cdn.example.com/${id}.jpg` : null,
    },
  };
}

const noop = () => {};

describe('<QueuePopover> RF-05', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queue vazia -> empty state PT-BR (D9)', () => {
    const { QueuePopover } = loadModule();
    render(
      <QueuePopover
        open={true}
        onOpenChange={noop}
        queue={[]}
        repeatMode="off"
        shuffleEnabled={false}
        onRemove={noop}
        onReorder={noop}
        onClear={noop}
        onSkip={noop}
        onRepeatChange={noop}
        onToggleShuffle={noop}
      />,
    );
    expect(screen.getByTestId('queue-popover')).toBeInTheDocument();
    const txt = screen.getByTestId('queue-popover').textContent ?? '';
    expect(txt).toMatch(/Fila vazia/i);
    expect(txt).toMatch(/biblioteca/i);
  });

  it('renderiza queue items com data-testid="queue-item-<id>"', () => {
    const { QueuePopover } = loadModule();
    const queue = [makeQueueItem('a'), makeQueueItem('b'), makeQueueItem('c')];
    render(
      <QueuePopover
        open={true}
        onOpenChange={noop}
        queue={queue}
        repeatMode="off"
        shuffleEnabled={false}
        onRemove={noop}
        onReorder={noop}
        onClear={noop}
        onSkip={noop}
        onRepeatChange={noop}
        onToggleShuffle={noop}
      />,
    );
    expect(screen.getByTestId('queue-item-a')).toBeInTheDocument();
    expect(screen.getByTestId('queue-item-b')).toBeInTheDocument();
    expect(screen.getByTestId('queue-item-c')).toBeInTheDocument();
  });

  it('header com count + clear/repeat/shuffle data-testids', () => {
    const { QueuePopover } = loadModule();
    const queue = [makeQueueItem('a'), makeQueueItem('b')];
    render(
      <QueuePopover
        open={true}
        onOpenChange={noop}
        queue={queue}
        repeatMode="off"
        shuffleEnabled={false}
        onRemove={noop}
        onReorder={noop}
        onClear={noop}
        onSkip={noop}
        onRepeatChange={noop}
        onToggleShuffle={noop}
      />,
    );
    expect(screen.getByTestId('queue-clear-btn')).toBeInTheDocument();
    expect(screen.getByTestId('queue-repeat-btn')).toBeInTheDocument();
    expect(screen.getByTestId('queue-shuffle-btn')).toBeInTheDocument();
    // Count "(2)" no header.
    const pop = screen.getByTestId('queue-popover');
    expect(pop.textContent ?? '').toMatch(/\(2\)/);
  });

  it('click queue-clear-btn -> onClear() chamado', () => {
    const { QueuePopover } = loadModule();
    const onClear = vi.fn();
    const queue = [makeQueueItem('a')];
    render(
      <QueuePopover
        open={true}
        onOpenChange={noop}
        queue={queue}
        repeatMode="off"
        shuffleEnabled={false}
        onRemove={noop}
        onReorder={noop}
        onClear={onClear}
        onSkip={noop}
        onRepeatChange={noop}
        onToggleShuffle={noop}
      />,
    );
    fireEvent.click(screen.getByTestId('queue-clear-btn'));
    expect(onClear).toHaveBeenCalled();
  });

  it('click queue-repeat-btn -> onRepeatChange ciclando off -> all -> one -> off', () => {
    const { QueuePopover } = loadModule();
    const onRepeatChange = vi.fn();
    const queue = [makeQueueItem('a')];
    const { rerender } = render(
      <QueuePopover
        open={true}
        onOpenChange={noop}
        queue={queue}
        repeatMode="off"
        shuffleEnabled={false}
        onRemove={noop}
        onReorder={noop}
        onClear={noop}
        onSkip={noop}
        onRepeatChange={onRepeatChange}
        onToggleShuffle={noop}
      />,
    );
    fireEvent.click(screen.getByTestId('queue-repeat-btn'));
    expect(onRepeatChange).toHaveBeenLastCalledWith('all');

    rerender(
      <QueuePopover
        open={true}
        onOpenChange={noop}
        queue={queue}
        repeatMode="all"
        shuffleEnabled={false}
        onRemove={noop}
        onReorder={noop}
        onClear={noop}
        onSkip={noop}
        onRepeatChange={onRepeatChange}
        onToggleShuffle={noop}
      />,
    );
    fireEvent.click(screen.getByTestId('queue-repeat-btn'));
    expect(onRepeatChange).toHaveBeenLastCalledWith('one');

    rerender(
      <QueuePopover
        open={true}
        onOpenChange={noop}
        queue={queue}
        repeatMode="one"
        shuffleEnabled={false}
        onRemove={noop}
        onReorder={noop}
        onClear={noop}
        onSkip={noop}
        onRepeatChange={onRepeatChange}
        onToggleShuffle={noop}
      />,
    );
    fireEvent.click(screen.getByTestId('queue-repeat-btn'));
    expect(onRepeatChange).toHaveBeenLastCalledWith('off');
  });

  it('click queue-shuffle-btn -> onToggleShuffle()', () => {
    const { QueuePopover } = loadModule();
    const onToggleShuffle = vi.fn();
    render(
      <QueuePopover
        open={true}
        onOpenChange={noop}
        queue={[makeQueueItem('a')]}
        repeatMode="off"
        shuffleEnabled={false}
        onRemove={noop}
        onReorder={noop}
        onClear={noop}
        onSkip={noop}
        onRepeatChange={noop}
        onToggleShuffle={onToggleShuffle}
      />,
    );
    fireEvent.click(screen.getByTestId('queue-shuffle-btn'));
    expect(onToggleShuffle).toHaveBeenCalled();
  });

  it('remove item: cada QueueItem expoe botao remove que chama onRemove(id)', () => {
    const { QueuePopover } = loadModule();
    const onRemove = vi.fn();
    const queue = [makeQueueItem('a'), makeQueueItem('b')];
    render(
      <QueuePopover
        open={true}
        onOpenChange={noop}
        queue={queue}
        repeatMode="off"
        shuffleEnabled={false}
        onRemove={onRemove}
        onReorder={noop}
        onClear={noop}
        onSkip={noop}
        onRepeatChange={noop}
        onToggleShuffle={noop}
      />,
    );
    const removeBtn = screen.getByTestId('queue-item-remove-a');
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('a');
  });

  it('skip item: data-testid="queue-item-skip-<id>" chama onSkip(id)', () => {
    const { QueuePopover } = loadModule();
    const onSkip = vi.fn();
    const queue = [makeQueueItem('a'), makeQueueItem('b')];
    render(
      <QueuePopover
        open={true}
        onOpenChange={noop}
        queue={queue}
        repeatMode="off"
        shuffleEnabled={false}
        onRemove={noop}
        onReorder={noop}
        onClear={noop}
        onSkip={onSkip}
        onRepeatChange={noop}
        onToggleShuffle={noop}
      />,
    );
    fireEvent.click(screen.getByTestId('queue-item-skip-b'));
    expect(onSkip).toHaveBeenCalledWith('b');
  });

  it('item Spotify mostra badge "Spotify" (R-05.3 desconectado future)', () => {
    const { QueuePopover } = loadModule();
    const queue = [makeQueueItem('a', 'spotify')];
    render(
      <QueuePopover
        open={true}
        onOpenChange={noop}
        queue={queue}
        repeatMode="off"
        shuffleEnabled={false}
        onRemove={noop}
        onReorder={noop}
        onClear={noop}
        onSkip={noop}
        onRepeatChange={noop}
        onToggleShuffle={noop}
      />,
    );
    const row = screen.getByTestId('queue-item-a');
    expect((row.textContent ?? '').match(/spotify/i)).toBeTruthy();
  });
});
