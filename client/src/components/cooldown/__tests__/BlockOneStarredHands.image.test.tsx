import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Spot-Screenshots — BlockOneStarredHands extension (cooldown)
//
// Spec: Docs/specs/spot-screenshots.md (RF-03 botao camera no cooldown,
//        RF-06 lightbox, RF-07 delete)
//
// Componente existente em:
//   client/src/components/cooldown/BlockOneStarredHands.tsx
//
// Esta suite NAO substitui os testes existentes (BlockOneStarredHands.test.tsx);
// adiciona casos novos de captura de imagem. Implementer estende o componente
// com:
//   - Botao de camera por bloco torneio (data-testid="cooldown-spot-camera-${tid}")
//   - Dropzone por bloco
//   - Paste handler dentro do bloco em foco
//   - Thumbnail clicavel quando spot tem imageUrl
//   - Lightbox (data-testid="spot-lightbox") com botao delete
//   - Cap 10/sessao cross-tournament desabilita todos os botoes de camera
//
// Props esperadas adicionais (mantendo retro-compat):
//   onUploadImage?: (sessionTournamentId, buffer, mimeType) => void
//   onDeleteStar?: (starId: string) => void  // ja existe
//   currentSpotsForSession?: number          // total da sessao para cap 10
// =============================================================================

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

import { BlockOneStarredHands } from '@/components/cooldown/BlockOneStarredHands';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const GIF_BYTES = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);

function makeFile(buf: Buffer, mime: string, name = 'paste.png') {
  return new File([buf], name, { type: mime });
}

const tournaments = [
  {
    id: 'st_low',
    sessionId: 'ses_1',
    site: 'PokerStars',
    name: '$5 Mini',
    buyIn: '5',
    rebuys: 0,
    result: 'pending',
    status: 'completed',
    fromPlannedTournament: false,
  },
  {
    id: 'st_high',
    sessionId: 'ses_1',
    site: 'GGNetwork',
    name: '$50 Big',
    buyIn: '50',
    rebuys: 0,
    result: 'pending',
    status: 'completed',
    fromPlannedTournament: false,
  },
];

const starredHandsWithImage = [
  {
    id: 'sh_1',
    sessionTournamentId: 'st_high',
    type: 'tilt',
    spot: 'river',
    notes: 'AKs vs JJ',
    imageUrl: '/api/starred-hands/sh_1/image',
    imageMime: 'image/png',
  },
];

const starredHandsNoImage = [
  {
    id: 'sh_2',
    sessionTournamentId: 'st_low',
    type: 'leak',
    spot: 'flop',
    notes: 'mini-bluff bad',
    // sem imageUrl — spot legado
  },
];

beforeEach(() => {
  toastMock.mockClear();
});

// =============================================================================
// Botao de captura por torneio
// =============================================================================

describe('BlockOneStarredHands.image - botao camera por torneio', () => {
  it('renderiza data-testid="cooldown-spot-camera-${tournamentId}" para cada torneio', () => {
    render(
      wrap(
        <BlockOneStarredHands
          sessionTournaments={tournaments}
          starredHands={[]}
          onAddStar={vi.fn()}
          onRemoveStar={vi.fn()}
          breathingEnabled={false}
          onToggleBreathing={vi.fn()}
          // @ts-expect-error - prop nova adicionada pelo Implementer
          onUploadImage={vi.fn()}
          currentSpotsForSession={0}
        />,
      ),
    );

    expect(
      screen.getByTestId('cooldown-spot-camera-st_high'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('cooldown-spot-camera-st_low'),
    ).toBeInTheDocument();
  });

  it('cap 10/sessao atingido desabilita todos os botoes de camera (cross-tournament)', () => {
    render(
      wrap(
        <BlockOneStarredHands
          sessionTournaments={tournaments}
          starredHands={[]}
          onAddStar={vi.fn()}
          onRemoveStar={vi.fn()}
          breathingEnabled={false}
          onToggleBreathing={vi.fn()}
          // @ts-expect-error
          onUploadImage={vi.fn()}
          currentSpotsForSession={10}
        />,
      ),
    );

    expect(screen.getByTestId('cooldown-spot-camera-st_high')).toBeDisabled();
    expect(screen.getByTestId('cooldown-spot-camera-st_low')).toBeDisabled();
  });
});

// =============================================================================
// Dropzone por torneio
// =============================================================================

describe('BlockOneStarredHands.image - dropzone por torneio', () => {
  it('drop PNG valido chama onUploadImage com sessionTournamentId correto', async () => {
    const onUploadImage = vi.fn();
    render(
      wrap(
        <BlockOneStarredHands
          sessionTournaments={tournaments}
          starredHands={[]}
          onAddStar={vi.fn()}
          onRemoveStar={vi.fn()}
          breathingEnabled={false}
          onToggleBreathing={vi.fn()}
          // @ts-expect-error
          onUploadImage={onUploadImage}
          currentSpotsForSession={0}
        />,
      ),
    );

    // Dropzone por torneio — testid sufixado com o id
    const dz = screen.getByTestId('cooldown-spot-dropzone-st_high');
    const file = makeFile(PNG_BYTES, 'image/png');
    fireEvent.drop(dz, {
      dataTransfer: {
        files: [file],
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        types: ['Files'],
      },
    });

    await waitFor(() => {
      expect(onUploadImage).toHaveBeenCalled();
    });
    // Primeiro arg eh o sessionTournamentId (ordem do contrato)
    expect(onUploadImage.mock.calls[0][0]).toBe('st_high');
  });

  it('drop GIF mostra toast erro, sem onUploadImage', async () => {
    const onUploadImage = vi.fn();
    render(
      wrap(
        <BlockOneStarredHands
          sessionTournaments={tournaments}
          starredHands={[]}
          onAddStar={vi.fn()}
          onRemoveStar={vi.fn()}
          breathingEnabled={false}
          onToggleBreathing={vi.fn()}
          // @ts-expect-error
          onUploadImage={onUploadImage}
          currentSpotsForSession={0}
        />,
      ),
    );

    const dz = screen.getByTestId('cooldown-spot-dropzone-st_high');
    const file = makeFile(GIF_BYTES, 'image/gif', 'g.gif');
    fireEvent.drop(dz, {
      dataTransfer: {
        files: [file],
        items: [{ kind: 'file', type: 'image/gif', getAsFile: () => file }],
        types: ['Files'],
      },
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    expect(onUploadImage).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Thumbnail + Lightbox
// =============================================================================

describe('BlockOneStarredHands.image - thumbnail/lightbox', () => {
  it('star com imageUrl renderiza thumbnail clicavel', () => {
    render(
      wrap(
        <BlockOneStarredHands
          sessionTournaments={tournaments}
          starredHands={starredHandsWithImage}
          onAddStar={vi.fn()}
          onRemoveStar={vi.fn()}
          breathingEnabled={false}
          onToggleBreathing={vi.fn()}
          // @ts-expect-error
          onUploadImage={vi.fn()}
          currentSpotsForSession={1}
        />,
      ),
    );

    // Thumbnail por starId — data-testid="spot-thumbnail-${starId}"
    const thumb = screen.getByTestId('spot-thumbnail-sh_1');
    expect(thumb).toBeInTheDocument();
    // src deve apontar para o endpoint autenticado (RF-10)
    const img = thumb.tagName === 'IMG' ? thumb : thumb.querySelector('img');
    expect(img).toBeTruthy();
    expect((img as HTMLImageElement).src).toContain(
      '/api/starred-hands/sh_1/image',
    );
  });

  it('star sem imageUrl NAO renderiza thumbnail (mantem render textual)', () => {
    render(
      wrap(
        <BlockOneStarredHands
          sessionTournaments={tournaments}
          starredHands={starredHandsNoImage}
          onAddStar={vi.fn()}
          onRemoveStar={vi.fn()}
          breathingEnabled={false}
          onToggleBreathing={vi.fn()}
          // @ts-expect-error
          onUploadImage={vi.fn()}
          currentSpotsForSession={1}
        />,
      ),
    );

    expect(screen.queryByTestId('spot-thumbnail-sh_2')).toBeNull();
    // Mas o texto da nota continua visivel
    expect(document.body.textContent).toMatch(/mini-bluff bad/i);
  });

  it('click na thumbnail abre data-testid="spot-lightbox"', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <BlockOneStarredHands
          sessionTournaments={tournaments}
          starredHands={starredHandsWithImage}
          onAddStar={vi.fn()}
          onRemoveStar={vi.fn()}
          breathingEnabled={false}
          onToggleBreathing={vi.fn()}
          // @ts-expect-error
          onUploadImage={vi.fn()}
          currentSpotsForSession={1}
        />,
      ),
    );

    const thumb = screen.getByTestId('spot-thumbnail-sh_1');
    await user.click(thumb);

    const lightbox = await screen.findByTestId('spot-lightbox');
    expect(lightbox).toBeInTheDocument();
  });

  it('botao delete na lightbox chama onRemoveStar com starId', async () => {
    const user = userEvent.setup();
    const onRemoveStar = vi.fn();
    render(
      wrap(
        <BlockOneStarredHands
          sessionTournaments={tournaments}
          starredHands={starredHandsWithImage}
          onAddStar={vi.fn()}
          onRemoveStar={onRemoveStar}
          breathingEnabled={false}
          onToggleBreathing={vi.fn()}
          // @ts-expect-error
          onUploadImage={vi.fn()}
          currentSpotsForSession={1}
        />,
      ),
    );

    await user.click(screen.getByTestId('spot-thumbnail-sh_1'));
    const deleteBtn = await screen.findByTestId('spot-lightbox-delete');
    await user.click(deleteBtn);

    // Confirmacao inline pode existir — clicamos confirm tambem se aparecer
    const confirm = screen.queryByTestId('spot-lightbox-delete-confirm');
    if (confirm) {
      await user.click(confirm);
    }

    await waitFor(() => {
      expect(onRemoveStar).toHaveBeenCalledWith('sh_1');
    });
  });
});
