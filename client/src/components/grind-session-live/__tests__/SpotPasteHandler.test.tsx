import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Spot-Screenshots — <SpotPasteHandler />
//
// Spec: Docs/specs/spot-screenshots.md (RF-01, EC-01..05)
// Capture flow: Docs/architecture/diagrams/spot-screenshots-capture-flow.mermaid
//
// Componente NAO existe ainda — Implementer cria em:
//   client/src/components/grind-session-live/SpotPasteHandler.tsx
//
// Contrato:
//   <SpotPasteHandler
//     activeTournaments={Array<{id, name?, buyIn, site?}>}
//     sessionId={string}
//     currentSpotCount={number}        // total de spots na sessao (cap 10)
//     onUpload={(buffer: ArrayBuffer | Buffer, mimeType: string, tournamentId: string) => void}
//   />
//
// Comportamento:
//   - Listener `paste` no document, montado/desmontado com componente
//   - Paste sem imagem -> ignora silencioso
//   - Paste com foco em <input>/<textarea>/[contenteditable=true] -> ignora (deixa
//     navegador colar texto normal)
//   - Paste com 1 torneio ativo -> chama onUpload diretamente
//   - Paste com 0 torneios -> toast "Sem torneios ativos" + sem onUpload
//   - Paste com >1 torneios -> abre dialog seletor (data-testid='spot-tournament-picker-dialog')
//   - currentSpotCount >= 10 -> toast "Limite 10 spots/sessao" + sem onUpload
//
// data-testids estaveis (obrigatorio — lessons-learned ponto "data-testid em tests"):
//   - spot-tournament-picker-dialog
//   - spot-tournament-picker-option-{tournamentId}
//   - spot-tournament-picker-cancel
// =============================================================================

// Mock do hook de toast — pattern usado no projeto
const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

// @ts-expect-error - Modulo ainda nao implementado (red phase)
import { SpotPasteHandler } from '@/components/grind-session-live/SpotPasteHandler';

// Helpers para simular ClipboardEvent com files
function makeClipboardItem(buffer: Buffer, mime: string) {
  // jsdom suporta File mas nao DataTransfer/ClipboardEvent.clipboardData totalmente;
  // os listeners reais usam clipboardData.items (DataTransferItemList) ou .files.
  // Usamos um shim minimo que cobre ambos os caminhos.
  const file = new File([buffer], 'paste.png', { type: mime });
  const items = [
    {
      kind: 'file',
      type: mime,
      getAsFile: () => file,
    },
  ];
  return { items, files: [file] as any, types: ['Files'] };
}

function dispatchPaste(target: EventTarget, clipboardData: any) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as any;
  event.clipboardData = clipboardData;
  // preventDefault no listener real eh esperado quando ha imagem
  target.dispatchEvent(event);
  return event;
}

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const tournA = { id: 'st_A', name: 'GG $50', buyIn: '50', site: 'GGNetwork' };
const tournB = { id: 'st_B', name: 'Stars $22', buyIn: '22', site: 'PokerStars' };

beforeEach(() => {
  toastMock.mockClear();
});

// =============================================================================
// Listener lifecycle
// =============================================================================

describe('SpotPasteHandler - listener lifecycle', () => {
  it('registra listener paste no mount e remove no unmount', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const onUpload = vi.fn();

    const { unmount } = render(
      <SpotPasteHandler
        activeTournaments={[tournA]}
        sessionId="ses_1"
        currentSpotCount={0}
        onUpload={onUpload}
      />,
    );

    expect(addSpy).toHaveBeenCalledWith('paste', expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('paste', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

// =============================================================================
// Paste sem imagem ou em campo de texto
// =============================================================================

describe('SpotPasteHandler - ignora paste sem imagem', () => {
  it('paste sem clipboardData.items eh ignorado (sem onUpload, sem toast)', () => {
    const onUpload = vi.fn();
    render(
      <SpotPasteHandler
        activeTournaments={[tournA]}
        sessionId="ses_1"
        currentSpotCount={0}
        onUpload={onUpload}
      />,
    );

    dispatchPaste(document, { items: [], files: [], types: ['text/plain'] });

    expect(onUpload).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('paste de texto puro (kind=string) eh ignorado', () => {
    const onUpload = vi.fn();
    render(
      <SpotPasteHandler
        activeTournaments={[tournA]}
        sessionId="ses_1"
        currentSpotCount={0}
        onUpload={onUpload}
      />,
    );

    dispatchPaste(document, {
      items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
      files: [],
      types: ['text/plain'],
    });

    expect(onUpload).not.toHaveBeenCalled();
  });
});

describe('SpotPasteHandler - ignora paste em <input>/<textarea>/contenteditable', () => {
  it('paste com <input> focado nao captura (deixa navegador colar texto)', () => {
    const onUpload = vi.fn();
    render(
      <>
        <input data-testid="some-input" defaultValue="" />
        <SpotPasteHandler
          activeTournaments={[tournA]}
          sessionId="ses_1"
          currentSpotCount={0}
          onUpload={onUpload}
        />
      </>,
    );

    // Foca o input
    const input = screen.getByTestId('some-input');
    (input as HTMLInputElement).focus();
    expect(document.activeElement).toBe(input);

    dispatchPaste(document, makeClipboardItem(PNG_BYTES, 'image/png'));

    expect(onUpload).not.toHaveBeenCalled();
  });

  it('paste com <textarea> focado nao captura', () => {
    const onUpload = vi.fn();
    render(
      <>
        <textarea data-testid="some-textarea" />
        <SpotPasteHandler
          activeTournaments={[tournA]}
          sessionId="ses_1"
          currentSpotCount={0}
          onUpload={onUpload}
        />
      </>,
    );

    const ta = screen.getByTestId('some-textarea');
    (ta as HTMLTextAreaElement).focus();

    dispatchPaste(document, makeClipboardItem(PNG_BYTES, 'image/png'));

    expect(onUpload).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Paste com 1 torneio ativo (auto-attach)
// =============================================================================

describe('SpotPasteHandler - 1 torneio ativo (auto-attach)', () => {
  it('paste com 1 torneio chama onUpload(buffer, mimeType, tournamentId)', async () => {
    const onUpload = vi.fn();
    render(
      <SpotPasteHandler
        activeTournaments={[tournA]}
        sessionId="ses_1"
        currentSpotCount={0}
        onUpload={onUpload}
      />,
    );

    dispatchPaste(document, makeClipboardItem(PNG_BYTES, 'image/png'));

    // O componente pode ler o file de forma async (FileReader/arrayBuffer).
    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledTimes(1);
    });
    const args = onUpload.mock.calls[0];
    // args[0] = buffer-like, args[1] = mime, args[2] = tournamentId
    expect(args[1]).toBe('image/png');
    expect(args[2]).toBe('st_A');
  });
});

// =============================================================================
// Paste com 0 torneios ativos
// =============================================================================

describe('SpotPasteHandler - 0 torneios ativos', () => {
  it('toast "Sem torneios ativos" + onUpload nao chamado', async () => {
    const onUpload = vi.fn();
    render(
      <SpotPasteHandler
        activeTournaments={[]}
        sessionId="ses_1"
        currentSpotCount={0}
        onUpload={onUpload}
      />,
    );

    dispatchPaste(document, makeClipboardItem(PNG_BYTES, 'image/png'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const toastArg = toastMock.mock.calls[0][0];
    expect(JSON.stringify(toastArg)).toMatch(/torneio|tournament|sem torneios|Adicione/i);
    expect(onUpload).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Paste com >1 torneios ativos -> dialog seletor
// =============================================================================

describe('SpotPasteHandler - >1 torneios ativos (dialog seletor)', () => {
  it('paste abre dialog data-testid="spot-tournament-picker-dialog"', async () => {
    const onUpload = vi.fn();
    render(
      <SpotPasteHandler
        activeTournaments={[tournA, tournB]}
        sessionId="ses_1"
        currentSpotCount={0}
        onUpload={onUpload}
      />,
    );

    dispatchPaste(document, makeClipboardItem(PNG_BYTES, 'image/png'));

    const dialog = await screen.findByTestId('spot-tournament-picker-dialog');
    expect(dialog).toBeInTheDocument();
    // Sem onUpload ainda (usuario precisa escolher)
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('selecionar torneio no dialog chama onUpload com o tournamentId escolhido', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(
      <SpotPasteHandler
        activeTournaments={[tournA, tournB]}
        sessionId="ses_1"
        currentSpotCount={0}
        onUpload={onUpload}
      />,
    );

    dispatchPaste(document, makeClipboardItem(PNG_BYTES, 'image/png'));

    const optionB = await screen.findByTestId(
      'spot-tournament-picker-option-st_B',
    );
    await user.click(optionB);

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledTimes(1);
    });
    expect(onUpload.mock.calls[0][2]).toBe('st_B');
  });

  it('cancelar dialog fecha sem chamar onUpload', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(
      <SpotPasteHandler
        activeTournaments={[tournA, tournB]}
        sessionId="ses_1"
        currentSpotCount={0}
        onUpload={onUpload}
      />,
    );

    dispatchPaste(document, makeClipboardItem(PNG_BYTES, 'image/png'));

    const cancel = await screen.findByTestId('spot-tournament-picker-cancel');
    await user.click(cancel);

    expect(onUpload).not.toHaveBeenCalled();
    // Dialog deve fechar
    await waitFor(() => {
      expect(
        screen.queryByTestId('spot-tournament-picker-dialog'),
      ).not.toBeInTheDocument();
    });
  });
});

// =============================================================================
// Cap 10/sessao
// =============================================================================

describe('SpotPasteHandler - cap 10 spots/sessao', () => {
  it('currentSpotCount=10 -> toast "Limite 10 spots/sessao" + sem onUpload', async () => {
    const onUpload = vi.fn();
    render(
      <SpotPasteHandler
        activeTournaments={[tournA]}
        sessionId="ses_1"
        currentSpotCount={10}
        onUpload={onUpload}
      />,
    );

    dispatchPaste(document, makeClipboardItem(PNG_BYTES, 'image/png'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const toastArg = toastMock.mock.calls[0][0];
    expect(JSON.stringify(toastArg)).toMatch(/10|limite|cap/i);
    expect(onUpload).not.toHaveBeenCalled();
  });
});
