/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint F2 — W2: SpotScreenshotPaster (frontend)
 *
 * Spec:    Docs/specs/sprint-f2-spot-screenshots.md (RF-01 + RF-07)
 * Flow:    Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 1 — PASTE)
 * C4:      Docs/architecture/feature-flows/spot-screenshots-components.mermaid
 *
 * Lessons aplicadas (Docs/architecture/lessons-learned.md):
 *   #1  hooks primeiro (early return baseado em props vai depois das chamadas de hook)
 *   #2  data-testid estavel (sem findByText heuristico)
 *   #3  mock retorna shape REAL do servidor (not idealized)
 *   #4  vitest 4 + projects + jsdom + polyfills (ClipboardEvent / DataTransfer / File)
 *   #11 default minimo (paster nao adiciona acoes nao-spec)
 *   #12 estado persistente via TanStack Query (counter vem de prop ou query, sobrevive re-mount)
 *
 * data-testids contratados (componente NAO existe ainda - red phase):
 *   spot-paster-counter        Badge "X/10 prints"
 *   spot-paster-file-picker    Button "Adicionar print" (fallback file picker)
 *   spot-paster-file-input     <input type="file"> hidden
 *
 * Pattern fetch mock: `vi.mock('@/lib/queryClient')` + `apiRequest` (mesmo pattern de
 * SessionSummaryModal.bankroll-toggle.test.tsx). Sem MSW (projeto nao tem setup).
 *
 * Polyfills criados localmente neste arquivo (jsdom nao implementa):
 *   - ClipboardEvent / DataTransfer / DataTransferItem com items.add()
 *   - createPasteEvent helper (clipboardData read-only no jsdom puro)
 *
 * NOTA: import do componente que NAO existe ainda → red phase. Falhas esperadas:
 *   "Failed to resolve import \"../SpotScreenshotPaster\""
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Mocks de queryClient + toast (mesmo pattern de tests legados do projeto).
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
  getCsrfToken: () => null,
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

// =============================================================================
// Componente under-test
// Red-phase: SpotScreenshotPaster.tsx existe como stub que retorna null
// (necessario para Vite resolver o import; ver lesson #4 — transform errors
// em cascata se modulo nao existe). Implementer substituira pelo corpo real.
// =============================================================================
import SpotScreenshotPaster from '../SpotScreenshotPaster';

// =============================================================================
// Helpers de polyfill: ClipboardEvent/DataTransfer no jsdom puro nao tem
// `clipboardData.items` writable. Construimos um evento "paste-like" e
// dispatch-amos no window.
// =============================================================================

interface FakeDataTransferItem {
  kind: 'string' | 'file';
  type: string;
  getAsFile: () => File | null;
  getAsString?: (cb: (s: string) => void) => void;
}

function makeDataTransferItems(items: FakeDataTransferItem[]) {
  // jsdom nao tem DataTransferItemList — fabricamos um minimo viavel.
  const list: any = items.slice();
  list.add = (file: any) => list.push(file);
  return list;
}

interface PasteFixture {
  files?: File[];
  text?: string;
}

/**
 * Cria um Event 'paste' com clipboardData "fake" (incluindo getData('text')
 * para detectar texto puro). Dispatcha em `target` (default = window).
 */
function dispatchPaste(fixture: PasteFixture, target: EventTarget = window) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  const items: FakeDataTransferItem[] = [];

  if (fixture.files) {
    for (const f of fixture.files) {
      items.push({
        kind: 'file',
        type: f.type,
        getAsFile: () => f,
      });
    }
  }
  if (fixture.text) {
    items.push({
      kind: 'string',
      type: 'text/plain',
      getAsFile: () => null,
      getAsString: (cb) => cb(fixture.text!),
    });
  }

  const clipboardData = {
    items: makeDataTransferItems(items),
    types: items.map((i) => i.type),
    files: fixture.files ?? [],
    getData: (mime: string) => (mime === 'text/plain' ? fixture.text ?? '' : ''),
  };

  Object.defineProperty(event, 'clipboardData', {
    value: clipboardData,
    writable: false,
  });

  target.dispatchEvent(event);
  return event;
}

function makeImageFile(opts: {
  name?: string;
  type?: string;
  sizeBytes?: number;
} = {}): File {
  const { name = 'spot.png', type = 'image/png', sizeBytes = 1024 } = opts;
  // Cria buffer com tamanho aproximado (jsdom File aceita Blob parts).
  const buf = new Uint8Array(sizeBytes);
  return new File([buf], name, { type });
}

// =============================================================================
// Wrappers para QueryClient (paster pode usar query/mutation).
// =============================================================================

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// =============================================================================
// Setup
// =============================================================================

const baseProps = {
  sessionId: 'sess-1',
  usedCount: 0,
  // maxCount default: 10
  onUploaded: vi.fn(),
  onError: vi.fn(),
};

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockClear();
  baseProps.onUploaded.mockClear();
  baseProps.onError.mockClear();
});

afterEach(() => {
  // Garante limpeza de listeners globais que o componente possa ter deixado
  // entre tests (inteiro testado em "cleanup remove listener no unmount").
});

// =============================================================================
// Cenario A1: Render counter
// Cobre RF-07 AC: "Counter visivel no header X/10"
// =============================================================================

describe('SpotScreenshotPaster — render counter', () => {
  it('renderiza badge spot-paster-counter com 0/10 quando usedCount=0', () => {
    render(wrap(<SpotScreenshotPaster {...baseProps} />));
    const counter = screen.getByTestId('spot-paster-counter');
    expect(counter).toBeInTheDocument();
    expect(counter.textContent).toMatch(/0\s*\/\s*10/);
  });

  it('counter atualiza com prop re-render para 5/10', () => {
    const { rerender } = render(wrap(<SpotScreenshotPaster {...baseProps} />));
    expect(screen.getByTestId('spot-paster-counter').textContent).toMatch(/0\s*\/\s*10/);

    rerender(wrap(<SpotScreenshotPaster {...baseProps} usedCount={5} />));
    expect(screen.getByTestId('spot-paster-counter').textContent).toMatch(/5\s*\/\s*10/);
  });

  it('respeita prop maxCount custom (counter "3/7")', () => {
    render(
      wrap(
        <SpotScreenshotPaster
          {...baseProps}
          usedCount={3}
          maxCount={7}
        />,
      ),
    );
    expect(screen.getByTestId('spot-paster-counter').textContent).toMatch(/3\s*\/\s*7/);
  });
});

// =============================================================================
// Cenario A2: File picker fallback
// Cobre RF-01 AC: "botao 'Adicionar print' abre file picker"
// =============================================================================

describe('SpotScreenshotPaster — file picker fallback', () => {
  it('button spot-paster-file-picker dispara click no input file hidden', () => {
    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    const button = screen.getByTestId('spot-paster-file-picker');
    const input = screen.getByTestId('spot-paster-file-input') as HTMLInputElement;

    expect(button).toBeInTheDocument();
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('file');

    const inputClickSpy = vi.spyOn(input, 'click');
    fireEvent.click(button);
    expect(inputClickSpy).toHaveBeenCalledTimes(1);
  });

  it('input file aceita apenas image/png, image/jpeg, image/jpg, image/webp', () => {
    render(wrap(<SpotScreenshotPaster {...baseProps} />));
    const input = screen.getByTestId('spot-paster-file-input') as HTMLInputElement;
    // Spec RF-01: gif rejeitado. Accept attribute restringe tipos no UI.
    const accept = input.accept || '';
    expect(accept).toMatch(/image\/png|image\/jpeg|image\/webp/);
    expect(accept).not.toMatch(/image\/gif/);
  });

  it('quando disabled=true, file picker button fica disabled', () => {
    render(wrap(<SpotScreenshotPaster {...baseProps} disabled={true} />));
    const button = screen.getByTestId('spot-paster-file-picker') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

// =============================================================================
// Cenario A3: Paste handler instalado em mount + removido no unmount (cleanup)
// Cobre RF-07 AC: "Cleanup remove listener no unmount"
// =============================================================================

describe('SpotScreenshotPaster — listener lifecycle', () => {
  it('registra paste listener no window em mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    const pasteRegistration = addSpy.mock.calls.find(
      (c) => c[0] === 'paste',
    );
    expect(pasteRegistration).toBeDefined();
    addSpy.mockRestore();
  });

  it('remove paste listener no unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(wrap(<SpotScreenshotPaster {...baseProps} />));

    const addedFn = (addSpy.mock.calls.find((c) => c[0] === 'paste') ?? [])[1];
    expect(addedFn).toBeDefined();

    unmount();

    const removed = removeSpy.mock.calls.find(
      (c) => c[0] === 'paste' && c[1] === addedFn,
    );
    expect(removed).toBeDefined();

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

// =============================================================================
// Cenario A4: Paste com imagem -> dispara POST /api/starred-hands/screenshot
// Cobre RF-01 AC: "Ctrl+V em area neutra cola imagem, exibe thumbnail otimista,
// contador incrementa" + RF-02 contract
// =============================================================================

describe('SpotScreenshotPaster — paste com imagem PNG', () => {
  it('dispara apiRequest POST /api/starred-hands/screenshot com FormData', async () => {
    apiRequestMock.mockResolvedValueOnce({
      id: 'sh-1',
      imageUrl: '/uploads/spot-screenshots/sh-1.png',
      expiresAt: '2026-05-11T12:34:00.000Z',
      sessionTournamentId: 'st-xyz',
      pastedAt: '2026-04-27T12:34:00.000Z',
    });

    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    dispatchPaste({ files: [makeImageFile({ type: 'image/png' })] });

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });

    const call = apiRequestMock.mock.calls[0];
    expect(call[0]).toBe('POST');
    expect(call[1]).toBe('/api/starred-hands/screenshot');
    // Multipart: body deve ser FormData
    expect(call[2]).toBeInstanceOf(FormData);
  });

  it('FormData inclui screenshot, sessionId e source=paste', async () => {
    apiRequestMock.mockResolvedValueOnce({
      id: 'sh-1',
      imageUrl: '/uploads/spot-screenshots/sh-1.png',
      expiresAt: '2026-05-11T12:34:00.000Z',
      sessionTournamentId: 'st-xyz',
      pastedAt: '2026-04-27T12:34:00.000Z',
    });

    render(
      wrap(
        <SpotScreenshotPaster
          {...baseProps}
          sessionId="sess-42"
          sessionTournamentId="st-77"
        />,
      ),
    );

    dispatchPaste({ files: [makeImageFile({ type: 'image/png' })] });

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });

    const fd = apiRequestMock.mock.calls[0][2] as FormData;
    expect(fd.get('sessionId')).toBe('sess-42');
    expect(fd.get('sessionTournamentId')).toBe('st-77');
    expect(fd.get('source')).toBe('paste');
    const screenshot = fd.get('screenshot');
    expect(screenshot).toBeInstanceOf(File);
    expect((screenshot as File).type).toBe('image/png');
  });
});

// =============================================================================
// Cenario A5: Paste com texto puro NAO faz fetch (silencioso)
// Cobre RF-01 AC: "Ctrl+V de texto puro nao gera nada (nao toast, nao request)"
// =============================================================================

describe('SpotScreenshotPaster — paste de texto puro', () => {
  it('NAO dispara apiRequest e NAO chama toast/onError', async () => {
    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    dispatchPaste({ text: 'Hello world' });

    // Pequeno delay para promessas pendentes (handler async).
    await new Promise((r) => setTimeout(r, 30));

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    expect(baseProps.onError).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Cenario A6: Paste com input em foco NAO captura
// Cobre RF-01 AC: "Ctrl+V dentro de input ou textarea NAO captura imagem"
// =============================================================================

describe('SpotScreenshotPaster — guard activeElement input/textarea', () => {
  function Testbed(props: any) {
    return (
      <div>
        <input data-testid="other-input" />
        <textarea data-testid="other-textarea" />
        <SpotScreenshotPaster {...props} />
      </div>
    );
  }

  it('NAO faz fetch quando activeElement eh INPUT', async () => {
    render(wrap(<Testbed {...baseProps} />));

    const input = screen.getByTestId('other-input') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    dispatchPaste({ files: [makeImageFile({ type: 'image/png' })] });

    await new Promise((r) => setTimeout(r, 30));
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('NAO faz fetch quando activeElement eh TEXTAREA', async () => {
    render(wrap(<Testbed {...baseProps} />));

    const ta = screen.getByTestId('other-textarea') as HTMLTextAreaElement;
    ta.focus();
    expect(document.activeElement).toBe(ta);

    dispatchPaste({ files: [makeImageFile({ type: 'image/png' })] });

    await new Promise((r) => setTimeout(r, 30));
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Cenario A7: Limite 10/10 (usedCount=maxCount) defesa client-side
// Cobre RF-01 AC: "11o paste exibe toast e NAO faz request"
// =============================================================================

describe('SpotScreenshotPaster — limite 10/10', () => {
  it('quando usedCount=10, paste de imagem NAO faz request e chama onError', async () => {
    render(wrap(<SpotScreenshotPaster {...baseProps} usedCount={10} />));

    dispatchPaste({ files: [makeImageFile({ type: 'image/png' })] });

    await new Promise((r) => setTimeout(r, 30));
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(baseProps.onError).toHaveBeenCalledTimes(1);
    const msg = String(baseProps.onError.mock.calls[0][0]);
    expect(msg.toLowerCase()).toMatch(/limite|10\/10|atingid/);
  });
});

// =============================================================================
// Cenario A8: disabled=true ignora paste
// Cobre RF-07 AC: "disabled prop bloqueia paste e file picker"
// =============================================================================

describe('SpotScreenshotPaster — disabled', () => {
  it('paste eh ignorado quando disabled=true', async () => {
    render(wrap(<SpotScreenshotPaster {...baseProps} disabled={true} />));

    dispatchPaste({ files: [makeImageFile({ type: 'image/png' })] });

    await new Promise((r) => setTimeout(r, 30));
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Cenario A9: MIME invalido (gif) -> onError + sem fetch
// Cobre RF-01 AC: "GIF rejeitado com toast claro"
// =============================================================================

describe('SpotScreenshotPaster — MIME invalido', () => {
  it('paste de image/gif chama onError "Formato invalido" e NAO faz fetch', async () => {
    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    dispatchPaste({ files: [makeImageFile({ type: 'image/gif', name: 'anim.gif' })] });

    await waitFor(() => {
      expect(baseProps.onError).toHaveBeenCalled();
    });
    const msg = String(baseProps.onError.mock.calls[0][0]);
    expect(msg.toLowerCase()).toMatch(/formato|invalid|gif|nao suportado/);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('paste de image/bmp (nao listado) chama onError', async () => {
    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    dispatchPaste({ files: [makeImageFile({ type: 'image/bmp', name: 'x.bmp' })] });

    await waitFor(() => {
      expect(baseProps.onError).toHaveBeenCalled();
    });
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Cenario A10: Tamanho > 5MB -> onError defensivo client-side
// Cobre RF-01 AC: "Print >5MB exibe toast e nao faz request"
// =============================================================================

describe('SpotScreenshotPaster — tamanho > 5MB', () => {
  it('paste de arquivo 6MB nao faz fetch e chama onError', async () => {
    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    const big = makeImageFile({
      type: 'image/png',
      sizeBytes: 6 * 1024 * 1024,
    });
    dispatchPaste({ files: [big] });

    await waitFor(() => {
      expect(baseProps.onError).toHaveBeenCalled();
    });
    const msg = String(baseProps.onError.mock.calls[0][0]);
    expect(msg.toLowerCase()).toMatch(/5\s*mb|maior|tamanho/);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Cenario A11: Resposta 201 -> chama onUploaded
// Cobre RF-01 + RF-02 AC: "Upload valido retorna 201 com { id, imageUrl, expiresAt }"
// =============================================================================

describe('SpotScreenshotPaster — onUploaded callback (201)', () => {
  it('chama onUploaded com payload do servidor (shape REAL conforme spec RF-02)', async () => {
    const serverPayload = {
      id: 'sh-201',
      imageUrl: '/uploads/spot-screenshots/sh-201.png',
      expiresAt: '2026-05-11T12:34:00.000Z',
      sessionTournamentId: 'st-xyz',
      pastedAt: '2026-04-27T12:34:00.000Z',
    };
    apiRequestMock.mockResolvedValueOnce(serverPayload);

    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    dispatchPaste({ files: [makeImageFile({ type: 'image/png' })] });

    await waitFor(() => {
      expect(baseProps.onUploaded).toHaveBeenCalledTimes(1);
    });
    expect(baseProps.onUploaded.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        id: 'sh-201',
        imageUrl: '/uploads/spot-screenshots/sh-201.png',
        expiresAt: '2026-05-11T12:34:00.000Z',
      }),
    );
  });
});

// =============================================================================
// Cenario A12: Resposta 409 (limite servidor)
// Cobre RF-02 AC: "11o upload na mesma sessao retorna 409 spot_limit_reached"
// =============================================================================

describe('SpotScreenshotPaster — resposta 409 spot_limit_reached', () => {
  it('chama onError com "Limite de prints atingido"', async () => {
    const err: any = new Error('Spot limit reached');
    err.response = {
      status: 409,
      data: { code: 'spot_limit_reached', limit: 10 },
    };
    apiRequestMock.mockRejectedValueOnce(err);

    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    dispatchPaste({ files: [makeImageFile({ type: 'image/png' })] });

    await waitFor(() => {
      expect(baseProps.onError).toHaveBeenCalled();
    });
    const msg = String(baseProps.onError.mock.calls[0][0]);
    expect(msg.toLowerCase()).toMatch(/limite|10|atingid/);
  });
});

// =============================================================================
// Cenario A13: Resposta 422 no_tournament_in_session
// Cobre RF-02 AC: "Sessao sem nenhum tournament retorna 422 no_tournament_in_session"
// =============================================================================

describe('SpotScreenshotPaster — resposta 422 no_tournament_in_session', () => {
  it('chama onError com mensagem clara sobre torneio', async () => {
    const err: any = new Error('No tournament');
    err.response = {
      status: 422,
      data: { code: 'no_tournament_in_session' },
    };
    apiRequestMock.mockRejectedValueOnce(err);

    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    dispatchPaste({ files: [makeImageFile({ type: 'image/png' })] });

    await waitFor(() => {
      expect(baseProps.onError).toHaveBeenCalled();
    });
    const msg = String(baseProps.onError.mock.calls[0][0]);
    expect(msg.toLowerCase()).toMatch(/torneio|tournament|sem/);
  });
});

// =============================================================================
// Cenario A14: Resposta 5xx generica -> onError fallback
// Cobre RF-01 AC: "Toast de erro se backend retornar 4xx/5xx"
// =============================================================================

describe('SpotScreenshotPaster — resposta 5xx', () => {
  it('chama onError com mensagem fallback ("erro" ou similar)', async () => {
    const err: any = new Error('Internal Server Error');
    err.response = { status: 500, data: { message: 'oops' } };
    apiRequestMock.mockRejectedValueOnce(err);

    render(wrap(<SpotScreenshotPaster {...baseProps} />));

    dispatchPaste({ files: [makeImageFile({ type: 'image/png' })] });

    await waitFor(() => {
      expect(baseProps.onError).toHaveBeenCalled();
    });
    const msg = String(baseProps.onError.mock.calls[0][0]);
    expect(msg.length).toBeGreaterThan(0);
  });
});
