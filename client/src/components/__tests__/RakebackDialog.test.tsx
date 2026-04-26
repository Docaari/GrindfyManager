import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Bankroll-3 — RakebackDialog (RF-03, RF-04, RF-05, RF-07)
//
// Spec: Docs/specs/rakeback-reporting.md
//
// data-testids estaveis (referencia direta ao componente real):
//   rakeback-dialog
//   rakeback-wallet-select        — modo page_header (sem wallet pre-selecionada)
//   rakeback-wallet-pinned        — modo wallet_menu (wallet pre-selecionada)
//   rakeback-currency-symbol      — sufixo de moeda no label de valor
//   rakeback-amount-input
//   rakeback-occurredAt-input
//   rakeback-note-input
//   rakeback-error-alert
//   rakeback-cancel
//   rakeback-submit
//
// Telemetria: console.log com prefixo '[telemetry][rakeback]' + nome do evento.
// Seguro pra spy do console.log e validacao do nome+payload.
//
// Mock de apiRequest segue contrato real: erro joga Error com .response = {
//   status, data: { code, ... } }.
// =============================================================================

import { RakebackDialog } from '../bankroll/RakebackDialog';

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (args: any) => toastMock(args),
}));

const apiRequestMock = vi.fn();
const invalidateQueriesMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: (...a: any[]) => invalidateQueriesMock(...a),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
  },
  getCsrfToken: () => null,
}));

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockClear();
  invalidateQueriesMock.mockClear();
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const walletBRL = {
  id: 'wlt_brl',
  name: 'Suprema Main',
  platform: 'Suprema',
  nativeCurrency: 'BRL',
  balance: '1180.00',
  status: 'active' as const,
};

const walletUSD = {
  id: 'wlt_usd',
  name: 'PokerStars Global',
  platform: 'PokerStars',
  nativeCurrency: 'USD',
  balance: '500.00',
  status: 'active' as const,
};

const walletArchived = {
  id: 'wlt_arc',
  name: 'GG Old',
  platform: 'GGNetwork',
  nativeCurrency: 'USD',
  balance: '0.00',
  status: 'archived' as const,
};

function makeError(status: number, code?: string, message = 'erro') {
  const err: any = new Error(message);
  err.response = { status, data: { code } };
  return err;
}

// =============================================================================
// 1. Render — page_header source (select)
// =============================================================================

describe('<RakebackDialog> — render (RF-03 + RF-04)', () => {
  it('source=page_header: mostra select de carteira', () => {
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletBRL, walletUSD]}
          source="page_header"
        />,
      ),
    );

    expect(screen.getByTestId('rakeback-dialog')).toBeTruthy();
    expect(screen.getByTestId('rakeback-wallet-select')).toBeTruthy();
    expect(screen.queryByTestId('rakeback-wallet-pinned')).toBeFalsy();
  });

  it('source=wallet_menu + preSelectedWalletId: NAO mostra select; mostra wallet pinned', () => {
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletBRL, walletUSD]}
          preSelectedWalletId={walletUSD.id}
          source="wallet_menu"
        />,
      ),
    );

    expect(screen.queryByTestId('rakeback-wallet-select')).toBeFalsy();
    const pinned = screen.getByTestId('rakeback-wallet-pinned');
    expect(pinned).toBeTruthy();
    expect(pinned.textContent).toContain('PokerStars Global');
  });

  it('mostra inputs de amount, note e occurredAt', () => {
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletBRL]}
          source="page_header"
        />,
      ),
    );

    expect(screen.getByTestId('rakeback-amount-input')).toBeTruthy();
    expect(screen.getByTestId('rakeback-note-input')).toBeTruthy();
    expect(screen.getByTestId('rakeback-occurredAt-input')).toBeTruthy();
  });

  it('exibe currency symbol da wallet selecionada (BRL -> R$)', () => {
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletBRL]}
          source="page_header"
        />,
      ),
    );

    const symbol = screen.getByTestId('rakeback-currency-symbol');
    expect(symbol.textContent).toContain('R$');
  });

  it('exibe currency symbol da wallet selecionada (USD -> $)', () => {
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletUSD]}
          source="page_header"
        />,
      ),
    );

    const symbol = screen.getByTestId('rakeback-currency-symbol');
    expect(symbol.textContent).toContain('$');
  });

  it('open=false: nao renderiza nada', () => {
    render(
      wrap(
        <RakebackDialog
          open={false}
          onOpenChange={() => {}}
          wallets={[walletBRL]}
          source="page_header"
        />,
      ),
    );

    expect(screen.queryByTestId('rakeback-dialog')).toBeFalsy();
  });
});

// =============================================================================
// 2. Validacao client-side
// =============================================================================

describe('<RakebackDialog> — validacao client-side (RF-05)', () => {
  it('botao submit comeca desabilitado (amount vazio)', () => {
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletBRL]}
          source="page_header"
        />,
      ),
    );

    const submit = screen.getByTestId('rakeback-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('amount=0 mantem submit desabilitado', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletBRL]}
          source="page_header"
        />,
      ),
    );

    const input = screen.getByTestId('rakeback-amount-input') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '0');

    const submit = screen.getByTestId('rakeback-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('amount > 0 habilita o submit', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletBRL]}
          source="page_header"
        />,
      ),
    );

    const input = screen.getByTestId('rakeback-amount-input') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '50');

    await waitFor(() => {
      const submit = screen.getByTestId('rakeback-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
    });
  });
});

// =============================================================================
// 3. Submit
// =============================================================================

describe('<RakebackDialog> — submit (RF-02 + RF-03)', () => {
  it('submit valido chama POST /api/wallets/:id/transactions com payload correto', async () => {
    apiRequestMock.mockResolvedValue({
      transaction: { id: 'wtx_rb', reason: 'rakeback', direction: 'in' },
    });

    const user = userEvent.setup();
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletBRL]}
          source="page_header"
        />,
      ),
    );

    const input = screen.getByTestId('rakeback-amount-input') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '50');

    const submit = screen.getByTestId('rakeback-submit');
    await user.click(submit);

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
    });
    const args = apiRequestMock.mock.calls[0];
    expect(args[0]).toBe('POST');
    expect(args[1]).toBe(`/api/wallets/${walletBRL.id}/transactions`);
    const body = args[2];
    expect(body.reason).toBe('rakeback');
    expect(body.direction).toBe('in');
    expect(body.nativeAmount).toBe(50);
    expect(typeof body.occurredAt).toBe('string');
  });

  it('sucesso fecha dialog e dispara toast em PT-BR', async () => {
    apiRequestMock.mockResolvedValue({ transaction: { id: 'wtx', reason: 'rakeback' } });

    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={onOpenChange}
          wallets={[walletBRL]}
          source="page_header"
        />,
      ),
    );

    const input = screen.getByTestId('rakeback-amount-input') as HTMLInputElement;
    await user.type(input, '50');
    await user.click(screen.getByTestId('rakeback-submit'));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(toastMock).toHaveBeenCalled();
    const toastArg = toastMock.mock.calls[0][0];
    expect(String(toastArg.title)).toMatch(/[Rr]akeback/);
  });

  it('sucesso invalida queries de wallets e history', async () => {
    apiRequestMock.mockResolvedValue({ transaction: { id: 'wtx', reason: 'rakeback' } });

    const user = userEvent.setup();
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletBRL]}
          source="page_header"
        />,
      ),
    );

    await user.type(screen.getByTestId('rakeback-amount-input'), '50');
    await user.click(screen.getByTestId('rakeback-submit'));

    await waitFor(() => {
      expect(invalidateQueriesMock).toHaveBeenCalled();
    });

    const queryKeys = invalidateQueriesMock.mock.calls.map((c) =>
      JSON.stringify(c[0]?.queryKey ?? c[0]),
    );
    const joined = queryKeys.join('|');
    expect(joined).toMatch(/\/api\/wallets/);
    expect(joined).toMatch(/\/api\/bankroll\/history/);
  });
});

// =============================================================================
// 4. Tratamento de erro
// =============================================================================

describe('<RakebackDialog> — tratamento de erro (RF-05)', () => {
  it('400 invalid_rakeback_direction -> mensagem inline em PT-BR', async () => {
    apiRequestMock.mockRejectedValue(makeError(400, 'invalid_rakeback_direction'));

    const user = userEvent.setup();
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletBRL]}
          source="page_header"
        />,
      ),
    );

    await user.type(screen.getByTestId('rakeback-amount-input'), '50');
    await user.click(screen.getByTestId('rakeback-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('rakeback-error-alert')).toBeTruthy();
    });
    const alert = screen.getByTestId('rakeback-error-alert');
    expect(alert.textContent).toMatch(/[Rr]akeback/);
    expect(alert.textContent).toMatch(/credito|entrada/);
  });

  it('409 wallet_archived -> mensagem inline e refetch wallets', async () => {
    apiRequestMock.mockRejectedValue(makeError(409, 'wallet_archived'));

    const user = userEvent.setup();
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletBRL]}
          source="page_header"
        />,
      ),
    );

    await user.type(screen.getByTestId('rakeback-amount-input'), '50');
    await user.click(screen.getByTestId('rakeback-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('rakeback-error-alert')).toBeTruthy();
    });
    const alert = screen.getByTestId('rakeback-error-alert');
    expect(alert.textContent).toMatch(/arquivada/i);
    // Refetch de wallets
    const queryKeys = invalidateQueriesMock.mock.calls.map((c) =>
      JSON.stringify(c[0]?.queryKey ?? c[0]),
    );
    expect(queryKeys.join('|')).toMatch(/\/api\/wallets/);
  });

  it('422 wallet_archived (variante) -> tambem mostra alerta', async () => {
    apiRequestMock.mockRejectedValue(makeError(422, 'wallet_archived'));

    const user = userEvent.setup();
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletBRL]}
          source="page_header"
        />,
      ),
    );

    await user.type(screen.getByTestId('rakeback-amount-input'), '50');
    await user.click(screen.getByTestId('rakeback-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('rakeback-error-alert')).toBeTruthy();
    });
  });

  it('em erro, dialog NAO fecha', async () => {
    apiRequestMock.mockRejectedValue(makeError(500, 'unknown', 'server boom'));

    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={onOpenChange}
          wallets={[walletBRL]}
          source="page_header"
        />,
      ),
    );

    await user.type(screen.getByTestId('rakeback-amount-input'), '50');
    await user.click(screen.getByTestId('rakeback-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('rakeback-error-alert')).toBeTruthy();
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

// =============================================================================
// 5. Telemetria
// =============================================================================

describe('<RakebackDialog> — telemetria (RF-07)', () => {
  it('rakeback_dialog_view ao montar com open=true', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      render(
        wrap(
          <RakebackDialog
            open
            onOpenChange={() => {}}
            wallets={[walletBRL]}
            source="page_header"
          />,
        ),
      );

      const calls = spy.mock.calls.filter((c) =>
        String(c[0] ?? '').includes('[telemetry][rakeback]'),
      );
      const events = calls.map((c) => c[1]);
      expect(events).toContain('rakeback_dialog_view');
    } finally {
      spy.mockRestore();
    }
  });

  it('rakeback_dialog_view payload inclui source correto (page_header)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      render(
        wrap(
          <RakebackDialog
            open
            onOpenChange={() => {}}
            wallets={[walletBRL]}
            source="page_header"
          />,
        ),
      );

      const viewCall = spy.mock.calls.find(
        (c) =>
          String(c[0] ?? '').includes('[telemetry][rakeback]') && c[1] === 'rakeback_dialog_view',
      );
      expect(viewCall).toBeTruthy();
      expect(viewCall![2]?.source).toBe('page_header');
    } finally {
      spy.mockRestore();
    }
  });

  it('rakeback_submit_success emitido no 200', async () => {
    apiRequestMock.mockResolvedValue({ transaction: { id: 'wtx' } });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      render(
        wrap(
          <RakebackDialog
            open
            onOpenChange={() => {}}
            wallets={[walletBRL]}
            source="page_header"
          />,
        ),
      );

      await user.type(screen.getByTestId('rakeback-amount-input'), '50');
      await user.click(screen.getByTestId('rakeback-submit'));

      await waitFor(() => {
        const events = spy.mock.calls.map((c) => c[1]);
        expect(events).toContain('rakeback_submit_success');
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('rakeback_submit_error emitido em 4xx/5xx', async () => {
    apiRequestMock.mockRejectedValue(makeError(400, 'invalid_rakeback_direction'));
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      render(
        wrap(
          <RakebackDialog
            open
            onOpenChange={() => {}}
            wallets={[walletBRL]}
            source="page_header"
          />,
        ),
      );

      await user.type(screen.getByTestId('rakeback-amount-input'), '50');
      await user.click(screen.getByTestId('rakeback-submit'));

      await waitFor(() => {
        const events = spy.mock.calls.map((c) => c[1]);
        expect(events).toContain('rakeback_submit_error');
      });
    } finally {
      spy.mockRestore();
    }
  });
});

// =============================================================================
// 6. Wallets archived nao aparecem no select (RF-03)
// =============================================================================

describe('<RakebackDialog> — filtra wallets archived (RF-03)', () => {
  it('select nao lista wallets archived', () => {
    render(
      wrap(
        <RakebackDialog
          open
          onOpenChange={() => {}}
          wallets={[walletBRL, walletArchived]}
          source="page_header"
        />,
      ),
    );

    const select = screen.getByTestId('rakeback-wallet-select') as HTMLSelectElement;
    const optionTexts = Array.from(select.querySelectorAll('option')).map(
      (o) => o.textContent ?? '',
    );
    const joined = optionTexts.join('|');
    expect(joined).not.toMatch(/GG Old/);
  });
});
