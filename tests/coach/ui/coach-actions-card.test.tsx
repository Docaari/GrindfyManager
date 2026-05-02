import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Coach-2B / RF-10 — UI cards
//
// Componentes:
//   - CoachActionConfirmCard — recebe SSE tool_pending_confirmation
//   - CoachActionUndoBadge   — timer regressivo 5min
//
// Lessons:
//   - #1 hooks first: early returns DEPOIS de hooks.
//   - #2 data-testid estavel.
//   - #11 default minimo: cursor-pointer SO nos botoes.
//   - #12 estado persistente: useQuery enabled=false + setQueryData.
// =============================================================================

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function withProvider(client: QueryClient, ui: React.ReactNode) {
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('CoachActionConfirmCard — render', () => {
  it('renderiza com data-testid coach-action-confirm-<actionId> (lesson #2)', async () => {
    const { default: CoachActionConfirmCard } =
      await import('../../../client/src/components/coach/CoachActionConfirmCard');
    const qc = makeQueryClient();

    render(withProvider(qc, (
      <CoachActionConfirmCard
        actionId="act-1"
        toolName="record_wallet_transaction"
        input={{ walletId: 'w-1', amount: 50, currency: 'USD' }}
        diffPreview={{
          changed: { balanceUSD: { from: 1450, to: 1500 } },
        }}
        undoWindowMs={300_000}
      />
    )));

    expect(screen.getByTestId('coach-action-confirm-act-1')).toBeTruthy();
  });

  it('renderiza titulo amigavel da tool', async () => {
    const { default: CoachActionConfirmCard } =
      await import('../../../client/src/components/coach/CoachActionConfirmCard');
    const qc = makeQueryClient();
    render(withProvider(qc, (
      <CoachActionConfirmCard
        actionId="act-2"
        toolName="record_wallet_transaction"
        input={{}}
        diffPreview={{}}
        undoWindowMs={300_000}
      />
    )));
    // O nome amigavel pode ser "Registrar transacao" — busca por algum substring conhecido
    const card = screen.getByTestId('coach-action-confirm-act-2');
    expect(card.textContent?.toLowerCase()).toMatch(
      /registrar|transac|wallet/i,
    );
  });

  it('renderiza diff visual com valores antes/apos', async () => {
    const { default: CoachActionConfirmCard } =
      await import('../../../client/src/components/coach/CoachActionConfirmCard');
    const qc = makeQueryClient();
    render(withProvider(qc, (
      <CoachActionConfirmCard
        actionId="act-3"
        toolName="record_wallet_transaction"
        input={{ walletId: 'w-1', amount: 50, currency: 'USD' }}
        diffPreview={{
          changed: { balanceUSD: { from: 1450, to: 1500 } },
        }}
        undoWindowMs={300_000}
      />
    )));
    const card = screen.getByTestId('coach-action-confirm-act-3');
    expect(card.textContent).toContain('1450');
    expect(card.textContent).toContain('1500');
  });

  it('renderiza botoes Confirmar + Cancelar com data-testid', async () => {
    const { default: CoachActionConfirmCard } =
      await import('../../../client/src/components/coach/CoachActionConfirmCard');
    const qc = makeQueryClient();
    render(withProvider(qc, (
      <CoachActionConfirmCard
        actionId="act-4"
        toolName="log_study_session"
        input={{ topic: 'solver', durationMinutes: 60 }}
        diffPreview={{}}
        undoWindowMs={300_000}
      />
    )));
    expect(screen.getByTestId('coach-action-confirm-button-act-4')).toBeTruthy();
    expect(screen.getByTestId('coach-action-cancel-button-act-4')).toBeTruthy();
  });

  it('click Confirmar dispara mutation POST /confirm', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'act-5', status: 'completed',
        undoExpiresAt: new Date(Date.now() + 300_000).toISOString(),
      }),
    } as any);

    const { default: CoachActionConfirmCard } =
      await import('../../../client/src/components/coach/CoachActionConfirmCard');
    const qc = makeQueryClient();
    render(withProvider(qc, (
      <CoachActionConfirmCard
        actionId="act-5"
        toolName="log_study_session"
        input={{ topic: 'solver', durationMinutes: 60 }}
        diffPreview={{}}
        undoWindowMs={300_000}
      />
    )));

    const btn = screen.getByTestId('coach-action-confirm-button-act-5');
    await act(async () => { fireEvent.click(btn); });

    expect(fetchSpy).toHaveBeenCalled();
    const url = fetchSpy.mock.calls[0][0];
    expect(String(url)).toMatch(/\/api\/coach\/actions\/act-5\/confirm/);

    fetchSpy.mockRestore();
  });
});

describe('CoachActionUndoBadge — timer + undo', () => {
  it('renderiza com data-testid coach-action-undo-<actionId>', async () => {
    const { default: CoachActionUndoBadge } =
      await import('../../../client/src/components/coach/CoachActionUndoBadge');
    const qc = makeQueryClient();
    render(withProvider(qc, (
      <CoachActionUndoBadge
        actionId="act-u1"
        undoExpiresAt={new Date(Date.now() + 5 * 60 * 1000).toISOString()}
      />
    )));
    expect(screen.getByTestId('coach-action-undo-act-u1')).toBeTruthy();
  });

  it('exibe contagem regressiva inicial em 5:00', async () => {
    const { default: CoachActionUndoBadge } =
      await import('../../../client/src/components/coach/CoachActionUndoBadge');
    const qc = makeQueryClient();
    render(withProvider(qc, (
      <CoachActionUndoBadge
        actionId="act-u2"
        undoExpiresAt={new Date(Date.now() + 5 * 60 * 1000).toISOString()}
      />
    )));
    const badge = screen.getByTestId('coach-action-undo-act-u2');
    expect(badge.textContent).toMatch(/5:00|4:59|4:5\d/);
  });

  it('apos undoExpiresAt expirar, botao Desfazer fica disabled', async () => {
    vi.useFakeTimers();
    const { default: CoachActionUndoBadge } =
      await import('../../../client/src/components/coach/CoachActionUndoBadge');
    const qc = makeQueryClient();
    render(withProvider(qc, (
      <CoachActionUndoBadge
        actionId="act-u3"
        undoExpiresAt={new Date(Date.now() + 5 * 60 * 1000).toISOString()}
      />
    )));

    // Avanca 5 min + 1 seg
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    });

    const btn = screen.getByTestId('coach-action-undo-button-act-u3') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent?.toLowerCase()).toMatch(/expirad|expir/i);
  });

  it('click Desfazer dentro da janela dispara POST /undo', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'act-u4', status: 'undone' }),
    } as any);

    const { default: CoachActionUndoBadge } =
      await import('../../../client/src/components/coach/CoachActionUndoBadge');
    const qc = makeQueryClient();
    render(withProvider(qc, (
      <CoachActionUndoBadge
        actionId="act-u4"
        undoExpiresAt={new Date(Date.now() + 5 * 60 * 1000).toISOString()}
      />
    )));

    const btn = screen.getByTestId('coach-action-undo-button-act-u4');
    await act(async () => { fireEvent.click(btn); });

    expect(fetchSpy).toHaveBeenCalled();
    const url = fetchSpy.mock.calls[0][0];
    expect(String(url)).toMatch(/\/api\/coach\/actions\/act-u4\/undo/);
    fetchSpy.mockRestore();
  });

  it('lesson #11 default minimo: cursor-help nos textos informativos, NAO cursor-pointer', async () => {
    const { default: CoachActionUndoBadge } =
      await import('../../../client/src/components/coach/CoachActionUndoBadge');
    const qc = makeQueryClient();
    const { container } = render(withProvider(qc, (
      <CoachActionUndoBadge
        actionId="act-u5"
        undoExpiresAt={new Date(Date.now() + 5 * 60 * 1000).toISOString()}
      />
    )));
    // Apenas botoes devem ter cursor-pointer
    const pointers = container.querySelectorAll('.cursor-pointer');
    pointers.forEach(el => {
      expect(el.tagName === 'BUTTON' || el.getAttribute('role') === 'button').toBe(true);
    });
  });
});

describe('Estado persistente entre re-mount (lesson #12)', () => {
  it('CoachActionUndoBadge le state via queryKey [coach-action, id]', async () => {
    const { default: CoachActionUndoBadge } =
      await import('../../../client/src/components/coach/CoachActionUndoBadge');
    const qc = makeQueryClient();
    qc.setQueryData(['coach-action', 'act-persist'], {
      id: 'act-persist', status: 'completed',
      undoExpiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
    });

    render(withProvider(qc, (
      <CoachActionUndoBadge
        actionId="act-persist"
        undoExpiresAt={new Date(Date.now() + 4 * 60 * 1000).toISOString()}
      />
    )));
    const badge = screen.getByTestId('coach-action-undo-act-persist');
    expect(badge).toBeTruthy();
  });
});
