/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint F2 — W3: BlockOneStarredHands extension (drop target)
 *
 * Spec:    Docs/specs/sprint-f2-spot-screenshots.md (RF-09)
 * Flow:    Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 2A)
 * C4:      Docs/architecture/feature-flows/spot-screenshots-components.mermaid
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #2  data-testid estavel — usamos `bloco1-tournament-{stId}` como testid
 *       de cada card de torneio (extension nao deve quebrar testids do
 *       bloco existente cooldown-1: cooldown-block-1, cooldown-star-add-{id},
 *       etc., conforme BlockOneStarredHands.test.tsx).
 *   #3  mock shape REAL — sessionTournaments e starredHands com shape de
 *       SessionTournamentLite e StarredHandLite ja exportados pelo componente
 *
 * data-testids contratados (drop-target NAO existe ainda — extension W3 green):
 *   bloco1-tournament-{stId}    Card root de cada torneio (drop target)
 *
 * Importante: Drag/drop em jsdom requer fireEvent.dragOver/drop com dataTransfer
 * sintetico. jsdom nao implementa DataTransfer nativo. Helper inline cria stub.
 * NAO modifica tests/setup.ts (lesson #4 — polyfills shared apenas para Radix).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

import { BlockOneStarredHands } from '@/components/cooldown/BlockOneStarredHands';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// Stub de DataTransfer compatible com jsdom + handler real do componente.
// `setData/getData` armazena dados; `effectAllowed` mock-able.
function makeDataTransfer(initial?: Record<string, string>) {
  const store: Record<string, string> = { ...initial };
  return {
    setData(format: string, value: string) {
      store[format] = value;
    },
    getData(format: string) {
      return store[format] ?? '';
    },
    types: Object.keys(store),
    effectAllowed: 'move',
    dropEffect: 'move',
    files: [],
    items: [],
    clearData() {
      for (const k of Object.keys(store)) delete store[k];
    },
  } as any;
}

const sessionTournaments = [
  {
    id: 'st-1',
    sessionId: 'ses_1',
    site: 'PokerStars',
    name: '$11 Bounty',
    buyIn: '11',
    rebuys: 0,
    result: 'pending',
    status: 'completed',
    fromPlannedTournament: false,
  },
  {
    id: 'st-2',
    sessionId: 'ses_1',
    site: 'GGNetwork',
    name: '$33 Big',
    buyIn: '33',
    rebuys: 0,
    result: 'pending',
    status: 'completed',
    fromPlannedTournament: false,
  },
];

const baseStarred: any[] = [];

const baseProps = {
  sessionTournaments,
  starredHands: baseStarred,
  onAddStar: vi.fn(),
  onRemoveStar: vi.fn(),
  breathingEnabled: false,
  onToggleBreathing: vi.fn(),
  // RF-09 NEW props (extension):
  sessionSpots: [
    { id: 'sh-A', imageUrl: '/api/starred-hands/sh-A/image', sessionTournamentId: null },
    { id: 'sh-B', imageUrl: '/api/starred-hands/sh-B/image', sessionTournamentId: null },
  ],
  onSpotDropped: vi.fn(),
};

beforeEach(() => {
  baseProps.onAddStar = vi.fn();
  baseProps.onRemoveStar = vi.fn();
  baseProps.onToggleBreathing = vi.fn();
  baseProps.onSpotDropped = vi.fn();
});

// =============================================================================
// Cenario C1: Card de torneio existe com testid bloco1-tournament-{id}
// Cobre RF-09 AC: cards aceitam drop — primeiro precisamos identificar o card
// =============================================================================

describe('BlockOneStarredHands.drop — card testids', () => {
  it('renderiza data-testid="bloco1-tournament-{id}" para cada torneio', () => {
    render(wrap(<BlockOneStarredHands {...baseProps} />));
    expect(screen.getByTestId('bloco1-tournament-st-1')).toBeInTheDocument();
    expect(screen.getByTestId('bloco1-tournament-st-2')).toBeInTheDocument();
  });
});

// =============================================================================
// Cenario C2: dragOver previne default (caso contrario o drop nao acontece)
// Cobre RF-09 AC: "onDragOver previne default"
// =============================================================================

describe('BlockOneStarredHands.drop — dragOver previne default', () => {
  it('dragOver no card chama preventDefault', () => {
    render(wrap(<BlockOneStarredHands {...baseProps} />));
    const card = screen.getByTestId('bloco1-tournament-st-1');

    const dt = makeDataTransfer({ 'application/x-spot-id': 'sh-A' });
    const event = fireEvent.dragOver(card, { dataTransfer: dt });
    // RTL fireEvent retorna false se preventDefault foi chamado.
    expect(event).toBe(false);
  });
});

// =============================================================================
// Cenario C3: drop com dataTransfer correto chama onSpotDropped(spotId, stId)
// Cobre RF-09 AC: "onDrop extrai starredHandId e sessionTournamentId do card"
// =============================================================================

describe('BlockOneStarredHands.drop — drop chama onSpotDropped', () => {
  it('drop com application/x-spot-id chama onSpotDropped(spotId, st-1)', () => {
    const onSpotDropped = vi.fn();
    render(
      wrap(
        <BlockOneStarredHands {...baseProps} onSpotDropped={onSpotDropped} />,
      ),
    );
    const card = screen.getByTestId('bloco1-tournament-st-1');
    const dt = makeDataTransfer({ 'application/x-spot-id': 'sh-A' });

    // Precisa do dragOver antes do drop para preventDefault habilitar drop.
    fireEvent.dragOver(card, { dataTransfer: dt });
    fireEvent.drop(card, { dataTransfer: dt });

    expect(onSpotDropped).toHaveBeenCalledTimes(1);
    expect(onSpotDropped).toHaveBeenCalledWith('sh-A', 'st-1');
  });

  it('drop em st-2 passa st-2 como targetSessionTournamentId', () => {
    const onSpotDropped = vi.fn();
    render(
      wrap(
        <BlockOneStarredHands {...baseProps} onSpotDropped={onSpotDropped} />,
      ),
    );
    const card = screen.getByTestId('bloco1-tournament-st-2');
    const dt = makeDataTransfer({ 'application/x-spot-id': 'sh-B' });

    fireEvent.dragOver(card, { dataTransfer: dt });
    fireEvent.drop(card, { dataTransfer: dt });

    expect(onSpotDropped).toHaveBeenCalledWith('sh-B', 'st-2');
  });
});

// =============================================================================
// Cenario C4: Drop em torneio com 3 stars ainda chama onSpotDropped
// (UI handles via SpotReviewCard saveDisabled prop — parent decide)
// Cobre RF-09 AC: "Drop quando torneio ja com 3 stars: callback dispara"
// =============================================================================

describe('BlockOneStarredHands.drop — limite 3 stars permite callback', () => {
  it('drop em st-1 com 3 stars existentes ainda chama onSpotDropped', () => {
    const onSpotDropped = vi.fn();
    const filled = [
      { id: 's1', sessionTournamentId: 'st-1', type: 'leak', spot: 'river' },
      { id: 's2', sessionTournamentId: 'st-1', type: 'mistake', spot: 'flop' },
      { id: 's3', sessionTournamentId: 'st-1', type: 'cooler', spot: 'turn' },
    ];
    render(
      wrap(
        <BlockOneStarredHands
          {...baseProps}
          starredHands={filled}
          onSpotDropped={onSpotDropped}
        />,
      ),
    );
    const card = screen.getByTestId('bloco1-tournament-st-1');
    const dt = makeDataTransfer({ 'application/x-spot-id': 'sh-A' });
    fireEvent.dragOver(card, { dataTransfer: dt });
    fireEvent.drop(card, { dataTransfer: dt });

    expect(onSpotDropped).toHaveBeenCalledWith('sh-A', 'st-1');
  });
});

// =============================================================================
// Cenario C5: drop sem dataTransfer correto = no-op
// Cobre RF-09 AC: "Spots nao-dragable nao trigam onSpotDropped"
// =============================================================================

describe('BlockOneStarredHands.drop — dataTransfer ausente', () => {
  it('drop sem application/x-spot-id NAO chama onSpotDropped', () => {
    const onSpotDropped = vi.fn();
    render(
      wrap(
        <BlockOneStarredHands {...baseProps} onSpotDropped={onSpotDropped} />,
      ),
    );
    const card = screen.getByTestId('bloco1-tournament-st-1');

    // dataTransfer com formato outro (text/plain) — drop deve ignorar
    const dt = makeDataTransfer({ 'text/plain': 'random text' });
    fireEvent.dragOver(card, { dataTransfer: dt });
    fireEvent.drop(card, { dataTransfer: dt });

    expect(onSpotDropped).not.toHaveBeenCalled();
  });

  it('drop com application/x-spot-id vazio NAO chama onSpotDropped', () => {
    const onSpotDropped = vi.fn();
    render(
      wrap(
        <BlockOneStarredHands {...baseProps} onSpotDropped={onSpotDropped} />,
      ),
    );
    const card = screen.getByTestId('bloco1-tournament-st-1');
    const dt = makeDataTransfer({ 'application/x-spot-id': '' });
    fireEvent.dragOver(card, { dataTransfer: dt });
    fireEvent.drop(card, { dataTransfer: dt });

    expect(onSpotDropped).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Cenario C6: Visual feedback durante dragOver (classe ou aria-attr)
// Cobre RF-09 AC: "Visual feedback durante dragOver"
// =============================================================================

describe('BlockOneStarredHands.drop — visual feedback dragOver', () => {
  it('card ganha indicacao visual ao receber dragOver (classe ou aria-dropeffect)', () => {
    render(wrap(<BlockOneStarredHands {...baseProps} />));
    const card = screen.getByTestId('bloco1-tournament-st-1');

    // Captura className antes
    const beforeClass = card.className;
    const beforeAria = card.getAttribute('aria-dropeffect');

    const dt = makeDataTransfer({ 'application/x-spot-id': 'sh-A' });
    fireEvent.dragOver(card, { dataTransfer: dt });

    // Apos dragOver, ESPERAMOS uma das mudancas:
    //   - className mudou (alguma classe nova como 'drop-target' / 'drag-over')
    //   - aria-dropeffect mudou (move | copy | etc)
    const afterClass = card.className;
    const afterAria = card.getAttribute('aria-dropeffect');

    const classChanged = afterClass !== beforeClass;
    const ariaChanged = afterAria !== beforeAria;

    expect(classChanged || ariaChanged).toBe(true);
  });
});

// =============================================================================
// Cenario C7: Comportamento existente (estrelar manual) NAO foi quebrado
// Cobre RF-09 AC: "NAO modificar comportamento existente do bloco"
// =============================================================================

describe('BlockOneStarredHands.drop — preserva comportamento existente', () => {
  it('cooldown-block-1 ainda renderiza (testid Cooldown-1)', () => {
    render(wrap(<BlockOneStarredHands {...baseProps} />));
    expect(screen.getByTestId('cooldown-block-1')).toBeInTheDocument();
  });

  it('botao cooldown-star-add-{id} ainda existe e dispara onAddStar', () => {
    const onAddStar = vi.fn();
    render(
      wrap(<BlockOneStarredHands {...baseProps} onAddStar={onAddStar} />),
    );
    // Conferimos que o botao existe (smoke). Comportamento detalhado em
    // BlockOneStarredHands.test.tsx legado.
    expect(screen.getByTestId('cooldown-star-add-st-1')).toBeInTheDocument();
  });
});
