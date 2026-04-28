/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint F2 — W3: SessionSpotsList (lista lateral cooldown)
 *
 * Spec:    Docs/specs/sprint-f2-spot-screenshots.md (RF-08)
 * Flow:    Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 2A)
 * C4:      Docs/architecture/feature-flows/spot-screenshots-components.mermaid
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #2  data-testid estavel
 *   #3  shape REAL — items vem com { id, imageUrl, sessionTournamentId, pastedAt }
 *       (subset de listPendingSpots em server/storage.ts:5167)
 *   #4  stub red-phase em SessionSpotsList.tsx
 *   #11 default minimo — sem botoes "decorativos" alem do que a spec define
 *
 * data-testids contratados:
 *   session-spots-list           container root
 *   session-spots-empty          empty state quando spots=[]
 *   session-spot-item-{id}       cada item (draggable)
 *   spot-review-later-{id}       botao "Revisar Depois" inline em cada item
 *
 * NOTA: import do componente que existe como stub null — Implementer (W3 green)
 * substitui pelo corpo real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
  getCsrfToken: () => null,
}));

import SessionSpotsList from '../SessionSpotsList';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// Stub DataTransfer — capturamos chamadas de setData para validar.
function makeDataTransfer() {
  const store: Record<string, string> = {};
  const setData = vi.fn((format: string, value: string) => {
    store[format] = value;
  });
  const getData = vi.fn((format: string) => store[format] ?? '');
  return {
    setData,
    getData,
    types: [] as string[],
    effectAllowed: 'none',
    dropEffect: 'none',
    files: [],
    items: [],
    clearData: vi.fn(),
    _store: store,
  } as any;
}

// Spots base com shape REAL do servidor (RF-04 response slice).
const baseSpots = [
  {
    id: 'sh-1',
    imageUrl: '/uploads/spot-screenshots/sh-1.png',
    sessionTournamentId: 'st-1',
    pastedAt: '2026-04-27T12:00:00.000Z',
  },
  {
    id: 'sh-2',
    imageUrl: '/uploads/spot-screenshots/sh-2.png',
    sessionTournamentId: 'st-1',
    pastedAt: '2026-04-27T12:05:00.000Z',
  },
  {
    id: 'sh-3',
    imageUrl: '/uploads/spot-screenshots/sh-3.png',
    sessionTournamentId: null,
    pastedAt: '2026-04-27T12:10:00.000Z',
  },
];

const baseProps = {
  sessionId: 'sess-1',
  spots: baseSpots,
  onPreview: vi.fn(),
  onReviewLater: vi.fn(),
};

beforeEach(() => {
  baseProps.onPreview = vi.fn();
  baseProps.onReviewLater = vi.fn();
});

// =============================================================================
// Cenario D1: Empty state quando spots=[]
// Cobre RF-08 AC: "Empty state quando sem prints"
// =============================================================================

describe('SessionSpotsList — empty state', () => {
  it('quando spots=[], renderiza session-spots-empty com mensagem default', () => {
    render(wrap(<SessionSpotsList {...baseProps} spots={[]} />));
    const empty = screen.getByTestId('session-spots-empty');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent?.toLowerCase()).toMatch(/nenhum print|sem prints|nada/);
  });

  it('quando spots=[] + emptyMessage="X", renderiza X', () => {
    render(
      wrap(
        <SessionSpotsList
          {...baseProps}
          spots={[]}
          emptyMessage="Sem prints colados nesta sessao."
        />,
      ),
    );
    expect(screen.getByTestId('session-spots-empty').textContent).toContain(
      'Sem prints colados nesta sessao.',
    );
  });
});

// =============================================================================
// Cenario D2: Lista renderiza todos os items com testid session-spot-item-{id}
// Cobre RF-08 AC: "Lista mostra apenas prints da sessao"
// =============================================================================

describe('SessionSpotsList — render items', () => {
  it('renderiza N items conforme spots.length', () => {
    render(wrap(<SessionSpotsList {...baseProps} />));
    expect(screen.getByTestId('session-spot-item-sh-1')).toBeInTheDocument();
    expect(screen.getByTestId('session-spot-item-sh-2')).toBeInTheDocument();
    expect(screen.getByTestId('session-spot-item-sh-3')).toBeInTheDocument();
  });

  it('cada item exibe um <img> apontando /api/starred-hands/{id}/image', () => {
    render(wrap(<SessionSpotsList {...baseProps} />));
    const item1 = screen.getByTestId('session-spot-item-sh-1');
    const img = item1.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toContain('/api/starred-hands/sh-1/image');
  });

  it('cada item tem atributo draggable="true"', () => {
    render(wrap(<SessionSpotsList {...baseProps} />));
    const item = screen.getByTestId('session-spot-item-sh-1');
    expect(item.getAttribute('draggable')).toBe('true');
  });
});

// =============================================================================
// Cenario D3: dragStart seta dataTransfer com application/x-spot-id
// Cobre RF-08 AC: "HTML5 native drag (dataTransfer with starredHandId)"
// =============================================================================

describe('SessionSpotsList — dragStart', () => {
  it('dragStart seta dataTransfer "application/x-spot-id" + effectAllowed="move"', () => {
    render(wrap(<SessionSpotsList {...baseProps} />));
    const item = screen.getByTestId('session-spot-item-sh-2');
    const dt = makeDataTransfer();

    fireEvent.dragStart(item, { dataTransfer: dt });

    expect(dt.setData).toHaveBeenCalledWith('application/x-spot-id', 'sh-2');
    expect(dt.effectAllowed).toBe('move');
  });
});

// =============================================================================
// Cenario D4: Click no item chama onPreview(id)
// Cobre RF-08 AC: "Click abre lightbox"
// =============================================================================

describe('SessionSpotsList — click preview', () => {
  it('click no item chama onPreview(id)', async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(
      wrap(<SessionSpotsList {...baseProps} onPreview={onPreview} />),
    );

    await user.click(screen.getByTestId('session-spot-item-sh-1'));

    expect(onPreview).toHaveBeenCalledWith('sh-1');
  });
});

// =============================================================================
// Cenario D5: Botao "Revisar Depois" por item chama onReviewLater(id)
// Cobre RF-08 AC: "Botao 'Revisar Depois' por item dispara onReviewLater"
// =============================================================================

describe('SessionSpotsList — botao Revisar Depois', () => {
  it('click em spot-review-later-{id} chama onReviewLater(id) e NAO onPreview', async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    const onReviewLater = vi.fn();
    render(
      wrap(
        <SessionSpotsList
          {...baseProps}
          onPreview={onPreview}
          onReviewLater={onReviewLater}
        />,
      ),
    );

    const btn = screen.getByTestId('spot-review-later-sh-3');
    await user.click(btn);

    expect(onReviewLater).toHaveBeenCalledWith('sh-3');
    // O click no botao nao deve borbulhar para o onPreview do item.
    expect(onPreview).not.toHaveBeenCalled();
  });
});
