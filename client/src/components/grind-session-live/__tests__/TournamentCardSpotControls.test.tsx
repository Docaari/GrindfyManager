import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Spot-Screenshots — TournamentCard com botao de camera + dropzone
//
// Spec: Docs/specs/spot-screenshots.md (RF-02 botao camera; RF-04 drag-drop)
// Capture flow: Docs/architecture/diagrams/spot-screenshots-capture-flow.mermaid
//
// Wrapper de testes — Implementer extende TournamentCard.tsx existente OU cria
// um wrapper <TournamentCardSpotControls /> exposto na mesma pasta:
//   client/src/components/grind-session-live/TournamentCardSpotControls.tsx
//
// Optei pelo wrapper para nao acoplar testes a props complexas do TournamentCard
// inteiro (mode='registered' tem dezenas de props). Implementer pode escolher
// integrar diretamente no card original e re-mapear este teste.
//
// Contrato esperado:
//   <TournamentCardSpotControls
//     tournamentId={string}
//     active={boolean}
//     currentSpotsForTournament={number}
//     currentSpotsForSession={number}
//     onUpload={(buffer, mimeType, tournamentId) => void}
//   />
//
// data-testids estaveis:
//   - spot-camera-button
//   - spot-file-input
//   - spot-dropzone
// =============================================================================

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

// @ts-expect-error - Componente ainda nao implementado (red phase)
import { TournamentCardSpotControls } from '@/components/grind-session-live/TournamentCardSpotControls';

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const GIF_BYTES = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x37, 0x61,
]);

function makeFile(buf: Buffer, mime: string, name = 'screenshot.png') {
  return new File([buf], name, { type: mime });
}

beforeEach(() => {
  toastMock.mockClear();
});

// =============================================================================
// Botao de captura
// =============================================================================

describe('TournamentCardSpotControls - botao de captura', () => {
  it('renderiza botao com data-testid="spot-camera-button" quando active', () => {
    render(
      <TournamentCardSpotControls
        tournamentId="st_1"
        active={true}
        currentSpotsForTournament={0}
        currentSpotsForSession={0}
        onUpload={vi.fn()}
      />,
    );
    expect(screen.getByTestId('spot-camera-button')).toBeInTheDocument();
  });

  it('botao dispara click no <input type=file> oculto', async () => {
    const user = userEvent.setup();
    render(
      <TournamentCardSpotControls
        tournamentId="st_1"
        active={true}
        currentSpotsForTournament={0}
        currentSpotsForSession={0}
        onUpload={vi.fn()}
      />,
    );

    const input = screen.getByTestId('spot-file-input') as HTMLInputElement;
    const inputClickSpy = vi.spyOn(input, 'click');

    const btn = screen.getByTestId('spot-camera-button');
    await user.click(btn);

    expect(inputClickSpy).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cap atingido — botao disabled
  // -------------------------------------------------------------------------

  it('botao disabled + tooltip quando cap 3/torneio atingido', async () => {
    render(
      <TournamentCardSpotControls
        tournamentId="st_1"
        active={true}
        currentSpotsForTournament={3}
        currentSpotsForSession={3}
        onUpload={vi.fn()}
      />,
    );

    const btn = screen.getByTestId('spot-camera-button');
    expect(btn).toBeDisabled();
    // Tooltip eh acessivel via title OU aria-label OU data-tooltip
    const flat =
      (btn.getAttribute('title') ?? '') +
      ' ' +
      (btn.getAttribute('aria-label') ?? '') +
      ' ' +
      (btn.getAttribute('data-tooltip') ?? '');
    expect(flat).toMatch(/limite|cap|3 spots|atingido/i);
  });

  it('botao disabled quando cap 10/sessao atingido', () => {
    render(
      <TournamentCardSpotControls
        tournamentId="st_1"
        active={true}
        currentSpotsForTournament={0}
        currentSpotsForSession={10}
        onUpload={vi.fn()}
      />,
    );

    const btn = screen.getByTestId('spot-camera-button');
    expect(btn).toBeDisabled();
  });
});

// =============================================================================
// File input — selecao
// =============================================================================

describe('TournamentCardSpotControls - file input', () => {
  it('selecionar PNG valido chama onUpload', async () => {
    const onUpload = vi.fn();
    render(
      <TournamentCardSpotControls
        tournamentId="st_1"
        active={true}
        currentSpotsForTournament={0}
        currentSpotsForSession={0}
        onUpload={onUpload}
      />,
    );

    const input = screen.getByTestId('spot-file-input') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [makeFile(PNG_BYTES, 'image/png')] },
    });

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledTimes(1);
    });
    expect(onUpload.mock.calls[0][1]).toBe('image/png');
    expect(onUpload.mock.calls[0][2]).toBe('st_1');
  });

  it('selecionar GIF mostra toast erro e nao chama onUpload', async () => {
    const onUpload = vi.fn();
    render(
      <TournamentCardSpotControls
        tournamentId="st_1"
        active={true}
        currentSpotsForTournament={0}
        currentSpotsForSession={0}
        onUpload={onUpload}
      />,
    );

    const input = screen.getByTestId('spot-file-input') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [makeFile(GIF_BYTES, 'image/gif', 'animated.gif')] },
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const toastArg = toastMock.mock.calls[0][0];
    expect(JSON.stringify(toastArg)).toMatch(/formato|nao suportado|gif/i);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('selecionar arquivo > 5MB mostra toast erro e nao chama onUpload', async () => {
    const onUpload = vi.fn();
    render(
      <TournamentCardSpotControls
        tournamentId="st_1"
        active={true}
        currentSpotsForTournament={0}
        currentSpotsForSession={0}
        onUpload={onUpload}
      />,
    );

    const big = Buffer.alloc(6 * 1024 * 1024); // 6MB
    big.set(PNG_BYTES, 0);
    const input = screen.getByTestId('spot-file-input') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [makeFile(big, 'image/png', 'big.png')] },
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const toastArg = toastMock.mock.calls[0][0];
    expect(JSON.stringify(toastArg)).toMatch(/5\s?MB|tamanho|grande|maior/i);
    expect(onUpload).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Dropzone
// =============================================================================

describe('TournamentCardSpotControls - dropzone', () => {
  it('renderiza data-testid="spot-dropzone"', () => {
    render(
      <TournamentCardSpotControls
        tournamentId="st_1"
        active={true}
        currentSpotsForTournament={0}
        currentSpotsForSession={0}
        onUpload={vi.fn()}
      />,
    );
    expect(screen.getByTestId('spot-dropzone')).toBeInTheDocument();
  });

  it('drop arquivo PNG valido chama onUpload', async () => {
    const onUpload = vi.fn();
    render(
      <TournamentCardSpotControls
        tournamentId="st_1"
        active={true}
        currentSpotsForTournament={0}
        currentSpotsForSession={0}
        onUpload={onUpload}
      />,
    );

    const dz = screen.getByTestId('spot-dropzone');
    const file = makeFile(PNG_BYTES, 'image/png');
    fireEvent.drop(dz, {
      dataTransfer: {
        files: [file],
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        types: ['Files'],
      },
    });

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalled();
    });
    expect(onUpload.mock.calls[0][2]).toBe('st_1');
  });

  it('drop com multiplos arquivos: usa apenas o primeiro + toast warning', async () => {
    const onUpload = vi.fn();
    render(
      <TournamentCardSpotControls
        tournamentId="st_1"
        active={true}
        currentSpotsForTournament={0}
        currentSpotsForSession={0}
        onUpload={onUpload}
      />,
    );

    const dz = screen.getByTestId('spot-dropzone');
    const f1 = makeFile(PNG_BYTES, 'image/png', 'a.png');
    const f2 = makeFile(PNG_BYTES, 'image/png', 'b.png');
    fireEvent.drop(dz, {
      dataTransfer: {
        files: [f1, f2],
        items: [
          { kind: 'file', type: 'image/png', getAsFile: () => f1 },
          { kind: 'file', type: 'image/png', getAsFile: () => f2 },
        ],
        types: ['Files'],
      },
    });

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledTimes(1);
    });
    // Toast warning notificando que apenas o primeiro foi processado
    expect(toastMock).toHaveBeenCalled();
  });

  it('drop arquivo nao-imagem (text/plain) -> toast erro, sem onUpload', async () => {
    const onUpload = vi.fn();
    render(
      <TournamentCardSpotControls
        tournamentId="st_1"
        active={true}
        currentSpotsForTournament={0}
        currentSpotsForSession={0}
        onUpload={onUpload}
      />,
    );

    const dz = screen.getByTestId('spot-dropzone');
    const file = new File(['hello world'], 'note.txt', { type: 'text/plain' });
    fireEvent.drop(dz, {
      dataTransfer: {
        files: [file],
        items: [{ kind: 'file', type: 'text/plain', getAsFile: () => file }],
        types: ['Files'],
      },
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    expect(onUpload).not.toHaveBeenCalled();
  });
});
