import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-03 — MessageFeedbackActions
//
// Componente: client/src/components/coach/MessageFeedbackActions.tsx (AINDA NAO EXISTE)
// Hook consumido: client/src/hooks/useCoachFeedback.ts (AINDA NAO EXISTE)
//
// Requisitos:
//   - Renderiza 2 botoes (thumbs up / thumbs down) apenas em mensagens do assistant
//   - Click up: POST /api/coach/messages/:id/feedback {rating: 'up'}
//   - Click down: abre popover com <Textarea maxLength=500> + "Pular" / "Enviar feedback"
//   - "Pular" envia POST sem comment
//   - "Enviar feedback" envia POST com comment
//   - Re-click no mesmo rating: DELETE /api/coach/messages/:id/feedback
//   - Click no oposto: POST substituindo (spec usa 'rating' como campo)
//   - Optimistic update
//   - Error 4xx/5xx: rollback + toast de erro
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-03)
// =============================================================================

import { MessageFeedbackActions } from '../MessageFeedbackActions';

// Mock de fetch
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as any;
});

// Mock toast
const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (args: any) => toastMock(args),
}));
beforeEach(() => toastMock.mockClear());

// Mock apiRequest (hook pode usar apiRequest OU fetch direto — testamos fetch direto)
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async (method: string, url: string, body?: any) => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err: any = new Error(`HTTP ${res.status}`);
      err.response = { status: res.status };
      throw err;
    }
    try {
      return await res.json();
    } catch {
      return {};
    }
  }),
  getCsrfToken: () => null,
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function mockResponse(status: number, body: any = {}) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any);
}

describe('<MessageFeedbackActions>', () => {
  describe('renderizacao base', () => {
    it('renderiza dois botoes: thumbs up + thumbs down', () => {
      render(wrap(<MessageFeedbackActions messageId="m1" isUserMessage={false} />));
      const up =
        screen.queryByRole('button', { name: /gostei|thumbs up|util/i }) ||
        screen.queryByLabelText(/gostei|util|thumbs up/i);
      const down =
        screen.queryByRole('button', { name: /nao gostei|thumbs down|inutil/i }) ||
        screen.queryByLabelText(/nao gostei|inutil|thumbs down/i);
      expect(up).toBeTruthy();
      expect(down).toBeTruthy();
    });

    it('NAO renderiza nada quando isUserMessage=true', () => {
      const { container } = render(
        wrap(<MessageFeedbackActions messageId="m1" isUserMessage={true} />)
      );
      // Aceita render vazio ou container sem buttons
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBe(0);
    });
  });

  describe('thumbs up', () => {
    it('click envia POST /api/coach/messages/m1/feedback com {rating:"up"}', async () => {
      mockResponse(200, { ok: true });
      const user = userEvent.setup();
      render(wrap(<MessageFeedbackActions messageId="m1" isUserMessage={false} />));

      const up = screen.getByLabelText(/gostei|util|thumbs up/i);
      await user.click(up);

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const [url, opts] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('/api/coach/messages/m1/feedback');
      expect(String(opts.method).toUpperCase()).toBe('POST');
      const body = JSON.parse(opts.body);
      // Spec usa tanto 'feedback' quanto 'rating' — aceita ambos
      const ratingField = body.rating || body.feedback;
      expect(ratingField).toBe('up');
    });

    it('apos sucesso, botao up mostra estado ativo (cor/classe mudou)', async () => {
      mockResponse(200, { ok: true });
      const user = userEvent.setup();
      render(wrap(<MessageFeedbackActions messageId="m1" isUserMessage={false} />));

      const up = screen.getByLabelText(/gostei|util|thumbs up/i);
      await user.click(up);

      await waitFor(() => {
        // Ativo = text-green-400 ou aria-pressed="true" ou data-active=true
        const pressed = up.getAttribute('aria-pressed') === 'true';
        const dataActive = up.getAttribute('data-active') === 'true';
        const hasGreen = /green/.test(up.className);
        expect(pressed || dataActive || hasGreen).toBe(true);
      });
    });
  });

  describe('thumbs down + comment', () => {
    it('click em thumbs down abre popover com textarea + botoes "Pular" e "Enviar feedback"', async () => {
      const user = userEvent.setup();
      render(wrap(<MessageFeedbackActions messageId="m1" isUserMessage={false} />));

      const down = screen.getByLabelText(/nao gostei|inutil|thumbs down/i);
      await user.click(down);

      await waitFor(() => {
        const ta = document.querySelector('textarea');
        expect(ta).toBeTruthy();
        expect(ta!.getAttribute('maxlength')).toBe('500');
      });

      const pular = screen.queryByRole('button', { name: /pular/i });
      const enviar = screen.queryByRole('button', { name: /enviar feedback/i });
      expect(pular).toBeTruthy();
      expect(enviar).toBeTruthy();
    });

    it('"Enviar feedback" envia POST com comment', async () => {
      mockResponse(200, { ok: true });
      const user = userEvent.setup();
      render(wrap(<MessageFeedbackActions messageId="m1" isUserMessage={false} />));

      const down = screen.getByLabelText(/nao gostei|inutil|thumbs down/i);
      await user.click(down);

      const ta = await waitFor(() => {
        const t = document.querySelector('textarea');
        if (!t) throw new Error('textarea not found');
        return t;
      });
      await user.type(ta as HTMLTextAreaElement, 'Resposta muito generica');

      const enviar = screen.getByRole('button', { name: /enviar feedback/i });
      await user.click(enviar);

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const [url, opts] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('/api/coach/messages/m1/feedback');
      expect(String(opts.method).toUpperCase()).toBe('POST');
      const body = JSON.parse(opts.body);
      const ratingField = body.rating || body.feedback;
      expect(ratingField).toBe('down');
      expect(body.comment).toBe('Resposta muito generica');
    });

    // HIGH-3: paste programatico que excede 500 chars deve ser truncado para
    // 500 no payload do POST (defesa em profundidade — atributo maxLength do
    // Textarea bloqueia digitacao mas nao paste programatico).
    it('paste de 600 chars → comment no body tem exatamente 500 chars', async () => {
      mockResponse(200, { ok: true });
      const user = userEvent.setup();
      render(wrap(<MessageFeedbackActions messageId="m1" isUserMessage={false} />));

      const down = screen.getByLabelText(/nao gostei|inutil|thumbs down/i);
      await user.click(down);

      const ta = await waitFor(() => {
        const t = document.querySelector('textarea');
        if (!t) throw new Error('textarea not found');
        return t;
      });

      // Forca o valor (paste programatico) — bypass do maxLength da DOM.
      // Usamos fireEvent direto via dispatchEvent para escapar do limit do DOM.
      const longText = 'A'.repeat(600);
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      nativeSetter?.call(ta, longText);
      ta.dispatchEvent(new Event('input', { bubbles: true }));

      const enviar = screen.getByRole('button', { name: /enviar feedback/i });
      await user.click(enviar);

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const [, opts] = fetchMock.mock.calls[0];
      const body = JSON.parse(opts.body);
      const ratingField = body.rating || body.feedback;
      expect(ratingField).toBe('down');
      // Comment deve ter exatamente 500 chars (truncamento defensivo).
      expect(typeof body.comment).toBe('string');
      expect(body.comment.length).toBe(500);
    });

    it('"Pular" envia POST sem comment', async () => {
      mockResponse(200, { ok: true });
      const user = userEvent.setup();
      render(wrap(<MessageFeedbackActions messageId="m1" isUserMessage={false} />));

      const down = screen.getByLabelText(/nao gostei|inutil|thumbs down/i);
      await user.click(down);

      await waitFor(() => {
        expect(document.querySelector('textarea')).toBeTruthy();
      });

      const pular = screen.getByRole('button', { name: /pular/i });
      await user.click(pular);

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const [, opts] = fetchMock.mock.calls[0];
      const body = JSON.parse(opts.body);
      const ratingField = body.rating || body.feedback;
      expect(ratingField).toBe('down');
      // Spec explicita: "Pular" envia sem comment. Pode vir undefined ou ausente.
      expect(body.comment === undefined || body.comment === '' || body.comment === null).toBe(true);
    });
  });

  describe('toggle e substituicao', () => {
    it('re-click do mesmo thumbs ativo chama DELETE', async () => {
      // 1o click: POST up
      mockResponse(200, { ok: true });
      const user = userEvent.setup();
      render(wrap(<MessageFeedbackActions messageId="m1" isUserMessage={false} />));

      const up = screen.getByLabelText(/gostei|util|thumbs up/i);
      await user.click(up);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      // 2o click: DELETE
      mockResponse(200, { ok: true });
      await user.click(up);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      const [url2, opts2] = fetchMock.mock.calls[1];
      expect(String(url2)).toContain('/api/coach/messages/m1/feedback');
      expect(String(opts2.method).toUpperCase()).toBe('DELETE');
    });

    it('click no rating oposto apos um rating existente: segue a spec (DELETE+POST em sequencia OU POST de substituicao OU toast de aviso)', async () => {
      // Spec RF-03: "Mudanca de thumbs-up → thumbs-down executa POST substituindo (nao DELETE+POST)"
      // Contudo, em 409 conflito, mostra toast "Feedback ja existe. Remova primeiro."
      // Aceitamos qualquer um dos 3 caminhos.
      mockResponse(200, { ok: true });
      const user = userEvent.setup();
      render(wrap(<MessageFeedbackActions messageId="m1" isUserMessage={false} />));

      const up = screen.getByLabelText(/gostei|util|thumbs up/i);
      await user.click(up);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      // Agora clica no thumbs down
      mockResponse(200, { ok: true }); // Possivel POST ou DELETE
      mockResponse(200, { ok: true }); // Possivel POST se foi DELETE+POST

      const down = screen.getByLabelText(/nao gostei|inutil|thumbs down/i);
      await user.click(down);

      // down pode abrir popover → nesse caso o teste so verifica que o popover abriu.
      // Se a spec mandar POST direto, chamaram fetch novamente; se abriu popover para
      // textarea, apenas chegamos ao ponto de interacao.
      await waitFor(() => {
        const popoverOpened = !!document.querySelector('textarea');
        const fetchedAgain = fetchMock.mock.calls.length >= 2;
        const toastShown = toastMock.mock.calls.length > 0;
        expect(popoverOpened || fetchedAgain || toastShown).toBe(true);
      });
    });
  });

  describe('erros', () => {
    it('erro 409 mostra toast "Feedback ja existe. Remova primeiro."', async () => {
      mockResponse(409, { message: 'Feedback ja existe' });
      const user = userEvent.setup();
      render(wrap(<MessageFeedbackActions messageId="m1" isUserMessage={false} />));

      const up = screen.getByLabelText(/gostei|util|thumbs up/i);
      await user.click(up);

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalled();
      });
      const anyToast = toastMock.mock.calls.map((c) => JSON.stringify(c[0])).join(' ');
      expect(anyToast).toMatch(/ja existe|remova|409|erro/i);
    });

    it('erro 500 faz rollback visual do estado ativo', async () => {
      mockResponse(500, { message: 'erro interno' });
      const user = userEvent.setup();
      render(wrap(<MessageFeedbackActions messageId="m1" isUserMessage={false} />));

      const up = screen.getByLabelText(/gostei|util|thumbs up/i);
      // Optimistic update: UI deve ter ficado ativa ANTES do response
      await user.click(up);

      // Apos rollback, up nao deve estar em estado ativo
      await waitFor(() => {
        const pressed = up.getAttribute('aria-pressed') === 'true';
        const dataActive = up.getAttribute('data-active') === 'true';
        const hasGreen = /green/.test(up.className);
        expect(pressed || dataActive || hasGreen).toBe(false);
      });
    });
  });

  describe('optimistic update', () => {
    it('UI mostra estado ativo imediatamente (sincronamente) antes do response chegar', async () => {
      // Nunca resolve — simula pending
      let resolveRequest: (v: any) => void = () => {};
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          })
      );

      const user = userEvent.setup();
      render(wrap(<MessageFeedbackActions messageId="m1" isUserMessage={false} />));

      const up = screen.getByLabelText(/gostei|util|thumbs up/i);
      await user.click(up);

      // Imediatamente (sem waitFor): estado deve estar ativo
      const pressed = up.getAttribute('aria-pressed') === 'true';
      const dataActive = up.getAttribute('data-active') === 'true';
      const hasGreen = /green/.test(up.className);
      expect(pressed || dataActive || hasGreen).toBe(true);

      // Cleanup — resolve pending request
      resolveRequest({ ok: true, status: 200, json: async () => ({}) });
    });
  });
});
