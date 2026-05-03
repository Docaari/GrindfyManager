// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint UX-Biblioteca-1 / RF-02
//
// Spec: Docs/specs/ux-biblioteca-1.md RF-02
// ADR:  Docs/architecture/decisions/103-library-access-requests-table.md
//
// Componente target: client/src/components/biblioteca/AccessRequestDialog.tsx (NAO EXISTE)
//
// Comportamentos:
//   - Render form com nome (pre-fill, editavel) + plano (read-only chip) + motivo
//   - Submit chama apiRequest('POST', '/api/library/access-requests', { name, reason })
//   - 201: toast sucesso + onSubmitted callback
//   - 409: toast warning "ja tem pedido em analise"
//   - 429: toast "rate limit"
//   - 5xx: toast destrutivo + modal aberto
//   - Validacao Zod inline: name 2-120, reason 20-1000
//
// Lessons aplicadas:
//   #2  data-testid estavel (access-request-*)
//   #13 apiRequest retorna JSON parseado, nao Response
//   #14 vi.hoisted para spies em vi.mock
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Lesson #14 — vi.hoisted para spy compartilhado entre vi.mock e testes.
const { apiRequestMock, toastMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: { invalidateQueries: vi.fn() },
  getCsrfToken: () => null,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

// Componente target — RED phase, ainda nao existe.
// @ts-expect-error - componente nao existe
import { AccessRequestDialog } from '../AccessRequestDialog';

const baseUser = {
  id: 'u-1',
  userPlatformId: 'USER-0001',
  email: 'player@test.com',
  username: 'player1',
  name: 'Joao Player',
  firstName: 'Joao',
  lastName: 'Player',
  subscriptionPlan: 'basic',
};

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockReset();
  toastMock.mockReset();
});

afterEach(() => {
  cleanup();
});

// =============================================================================
// Render basico — RF-02
// =============================================================================
describe('<AccessRequestDialog> — render basico (RF-02)', () => {
  it('deve renderizar quando open=true', () => {
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    expect(screen.getByTestId('access-request-dialog')).toBeInTheDocument();
  });

  it('NAO deve renderizar conteudo quando open=false', () => {
    render(
      <AccessRequestDialog
        open={false}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('access-request-dialog')).toBeNull();
  });

  it('deve pre-preencher campo "Nome" com user.name', () => {
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    const nameField = screen.getByTestId(
      'access-request-name-input',
    ) as HTMLInputElement;
    expect(nameField.value).toBe('Joao Player');
  });

  it('quando user.name eh ausente, deve usar firstName + lastName', () => {
    const user = { ...baseUser, name: undefined };
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={user}
        onSubmitted={vi.fn()}
      />,
    );
    const nameField = screen.getByTestId(
      'access-request-name-input',
    ) as HTMLInputElement;
    expect(nameField.value).toBe('Joao Player');
  });

  it('quando name + first + last ausentes, deve usar username', () => {
    const user = {
      ...baseUser,
      name: undefined,
      firstName: undefined,
      lastName: undefined,
    };
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={user}
        onSubmitted={vi.fn()}
      />,
    );
    const nameField = screen.getByTestId(
      'access-request-name-input',
    ) as HTMLInputElement;
    expect(nameField.value).toBe('player1');
  });

  it('deve exibir plano atual como chip read-only (nao input)', () => {
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    const planChip = screen.getByTestId('access-request-plan-chip');
    expect(planChip).toBeInTheDocument();
    expect(planChip.textContent ?? '').toMatch(/basic/i);
    // Garantir que NAO eh input.
    expect(planChip.tagName).not.toBe('INPUT');
    expect(planChip.tagName).not.toBe('TEXTAREA');
  });

  it('deve renderizar textarea de motivo', () => {
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId('access-request-reason-textarea'),
    ).toBeInTheDocument();
  });

  it('deve renderizar botao "Enviar pedido"', () => {
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    expect(screen.getByTestId('access-request-submit')).toBeInTheDocument();
  });
});

// =============================================================================
// Submit happy path — RF-02
// =============================================================================
describe('<AccessRequestDialog> — submit happy path (RF-02)', () => {
  it('deve chamar apiRequest POST /api/library/access-requests com body correto', async () => {
    apiRequestMock.mockResolvedValueOnce({
      id: 'req-1',
      status: 'pending',
      createdAt: '2026-05-03T12:00:00.000Z',
    });
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const reason = screen.getByTestId(
      'access-request-reason-textarea',
    ) as HTMLTextAreaElement;
    await user.type(
      reason,
      'Quero estudar mentalidade e ICM porque vou jogar Sunday Million.',
    );
    await user.click(screen.getByTestId('access-request-submit'));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
    });
    const [method, url, body] = apiRequestMock.mock.calls[0];
    expect(method).toBe('POST');
    expect(url).toBe('/api/library/access-requests');
    expect(body).toEqual(
      expect.objectContaining({
        name: 'Joao Player',
        reason: expect.stringMatching(/Sunday Million/),
      }),
    );
  });

  it('NAO deve enviar subscriptionPlan no body (anti-spoofing — vem do server)', async () => {
    apiRequestMock.mockResolvedValueOnce({
      id: 'req-1',
      status: 'pending',
      createdAt: '2026-05-03T12:00:00.000Z',
    });
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const reason = screen.getByTestId(
      'access-request-reason-textarea',
    ) as HTMLTextAreaElement;
    await user.type(
      reason,
      'Conteudo motivo aqui — minimo 20 caracteres validos.',
    );
    await user.click(screen.getByTestId('access-request-submit'));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
    });
    const body = apiRequestMock.mock.calls[0][2];
    expect(body).not.toHaveProperty('subscriptionPlan');
    expect(body).not.toHaveProperty('plan');
  });

  it('em sucesso (201) deve disparar toast confirmacao "Pedido enviado"', async () => {
    apiRequestMock.mockResolvedValueOnce({
      id: 'req-1',
      status: 'pending',
      createdAt: '2026-05-03T12:00:00.000Z',
    });
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId('access-request-reason-textarea'),
      'Motivo descritivo — quero acesso para estudar.',
    );
    await user.click(screen.getByTestId('access-request-submit'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const call = toastMock.mock.calls[0][0];
    const text = (call?.title ?? '') + ' ' + (call?.description ?? '');
    expect(text.toLowerCase()).toMatch(/pedido enviado|24h/);
  });

  it('em sucesso deve invocar onSubmitted callback com status pending', async () => {
    apiRequestMock.mockResolvedValueOnce({
      id: 'req-1',
      status: 'pending',
      createdAt: '2026-05-03T12:00:00.000Z',
    });
    const onSubmitted = vi.fn();
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={onSubmitted}
      />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId('access-request-reason-textarea'),
      'Motivo bem detalhado para liberar o acesso.',
    );
    await user.click(screen.getByTestId('access-request-submit'));

    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledTimes(1);
    });
    const arg = onSubmitted.mock.calls[0][0];
    expect(arg).toEqual(
      expect.objectContaining({ status: 'pending', id: 'req-1' }),
    );
  });

  it('em sucesso deve fechar modal (onOpenChange(false))', async () => {
    apiRequestMock.mockResolvedValueOnce({
      id: 'req-1',
      status: 'pending',
      createdAt: '2026-05-03T12:00:00.000Z',
    });
    const onOpenChange = vi.fn();
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={onOpenChange}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId('access-request-reason-textarea'),
      'Motivo descritivo com mais de 20 caracteres.',
    );
    await user.click(screen.getByTestId('access-request-submit'));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

// =============================================================================
// Erros — RF-02
// =============================================================================
describe('<AccessRequestDialog> — error handling (RF-02)', () => {
  function makeApiError(status: number, message: string, extra: any = {}) {
    const err: any = new Error(message);
    err.response = { status, data: { message, ...extra } };
    return err;
  }

  it('em 409 (pending existente) deve disparar toast "ja tem pedido em analise"', async () => {
    apiRequestMock.mockRejectedValueOnce(
      makeApiError(409, 'request_already_pending', {
        existingId: 'req-old',
      }),
    );
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId('access-request-reason-textarea'),
      'Conteudo motivo aqui — minimo 20 caracteres.',
    );
    await user.click(screen.getByTestId('access-request-submit'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const call = toastMock.mock.calls[0][0];
    const text = (call?.title ?? '') + ' ' + (call?.description ?? '');
    expect(text.toLowerCase()).toMatch(/em analise|ja tem|pendente/);
  });

  it('em 429 (rate limit) deve disparar toast "muitas tentativas"', async () => {
    apiRequestMock.mockRejectedValueOnce(
      makeApiError(429, 'rate_limit_exceeded', {
        retryAfterSeconds: 1234,
      }),
    );
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId('access-request-reason-textarea'),
      'Motivo motivo motivo motivo motivo motivo.',
    );
    await user.click(screen.getByTestId('access-request-submit'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const call = toastMock.mock.calls[0][0];
    const text = (call?.title ?? '') + ' ' + (call?.description ?? '');
    expect(text.toLowerCase()).toMatch(/muitas tentativas|aguarde|rate/);
  });

  it('em 5xx deve disparar toast destrutivo + manter modal aberto', async () => {
    apiRequestMock.mockRejectedValueOnce(makeApiError(500, 'internal_error'));
    const onOpenChange = vi.fn();
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={onOpenChange}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId('access-request-reason-textarea'),
      'Motivo bem detalhado vai aqui sem problemas.',
    );
    await user.click(screen.getByTestId('access-request-submit'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    // Modal NAO deve fechar em erro 5xx.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

// =============================================================================
// Validacao Zod inline — RF-02
// =============================================================================
describe('<AccessRequestDialog> — validacao client-side', () => {
  it('submit com reason < 20 chars deve mostrar erro inline e NAO chamar API', async () => {
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId('access-request-reason-textarea'),
      'curto',
    );
    await user.click(screen.getByTestId('access-request-submit'));
    // API nao deve ser chamada.
    expect(apiRequestMock).not.toHaveBeenCalled();
    // Erro inline aparece.
    const err = screen.queryByTestId('access-request-reason-error');
    expect(err).toBeInTheDocument();
    expect((err?.textContent ?? '').toLowerCase()).toMatch(
      /minimo|curto|20/,
    );
  });

  it('submit com name vazio (apos clear) deve mostrar erro inline', async () => {
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const nameField = screen.getByTestId('access-request-name-input');
    await user.clear(nameField);
    await user.type(
      screen.getByTestId('access-request-reason-textarea'),
      'Motivo bem descritivo aqui agora.',
    );
    await user.click(screen.getByTestId('access-request-submit'));
    expect(apiRequestMock).not.toHaveBeenCalled();
    const err = screen.queryByTestId('access-request-name-error');
    expect(err).toBeInTheDocument();
  });

  it('submit com reason > 1000 chars deve mostrar erro inline', async () => {
    render(
      <AccessRequestDialog
        open={true}
        onOpenChange={vi.fn()}
        user={baseUser}
        onSubmitted={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const longReason = 'a'.repeat(1001);
    const reasonEl = screen.getByTestId('access-request-reason-textarea');
    // Bypass typing speed: usar fireEvent direto via fireEvent.change
    // userEvent.type seria muito lento para 1001 chars.
    (reasonEl as HTMLTextAreaElement).value = longReason;
    reasonEl.dispatchEvent(new Event('input', { bubbles: true }));
    await user.click(screen.getByTestId('access-request-submit'));
    expect(apiRequestMock).not.toHaveBeenCalled();
    const err = screen.queryByTestId('access-request-reason-error');
    expect(err).toBeInTheDocument();
  });
});
