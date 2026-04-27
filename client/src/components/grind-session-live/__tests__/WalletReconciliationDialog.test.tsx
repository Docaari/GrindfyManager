/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-wallet-reconciliation.md
 *  - RF-02: lista wallets com hadActivityInSession + toggle "todas"
 *  - RF-03: input + preview delta em tempo real
 *  - RF-04: submit batch + tratamento 409 balance_mismatch
 *  - RF-05: botao "Sem ajuste"
 *  - RF-08: 409 already_reconciled
 *  - RF-11: PT-BR
 *  - RF-12: telemetria via console.log
 *
 * data-testid convention (estaveis, com prefixo "reconcile-"):
 *   reconcile-dialog
 *   reconcile-loading
 *   reconcile-empty
 *   reconcile-toggle-all
 *   reconcile-row-{walletId}
 *   reconcile-input-{walletId}
 *   reconcile-delta-{walletId}
 *   reconcile-error-row-{walletId}
 *   reconcile-error-alert
 *   reconcile-submit
 *   reconcile-skip
 *   reconcile-cancel
 *
 * Telemetria (RF-12) usa console.log igual rakeback:
 *   console.log('[telemetry][reconcile]', eventName, payload)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Modulo NAO existe ainda — implementer cria.
import { WalletReconciliationDialog } from '../WalletReconciliationDialog';

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

const reconcilableResponse = {
  sessionId: 'ses_1',
  alreadyReconciled: false,
  wallets: [
    {
      walletId: 'wA',
      name: 'PokerStars BR',
      platform: 'PokerStars',
      nativeCurrency: 'BRL',
      balance: 1180.0,
      expectedPreviousBalance: 1180.0,
      hadActivityInSession: true,
    },
    {
      walletId: 'wB',
      name: 'GG USD',
      platform: 'GGNetwork',
      nativeCurrency: 'USD',
      balance: 200.0,
      expectedPreviousBalance: 200.0,
      hadActivityInSession: true,
    },
  ],
};

const reconcilableResponseAll = {
  sessionId: 'ses_1',
  alreadyReconciled: false,
  wallets: [
    ...reconcilableResponse.wallets,
    {
      walletId: 'wC',
      name: 'Suprema Reserve',
      platform: 'Suprema',
      nativeCurrency: 'BRL',
      balance: 0.0,
      expectedPreviousBalance: 0.0,
      hadActivityInSession: false,
    },
  ],
};

function makeError(status: number, code?: string, extra: any = {}) {
  const err: any = new Error(code ?? `http_${status}`);
  err.response = { status, data: { code, ...extra } };
  return err;
}

// =============================================================================
// 1. Render basico (RF-02 + RF-11)
// =============================================================================

describe('<WalletReconciliationDialog> — render (RF-02, RF-11)', () => {
  it('open=false: nao renderiza', () => {
    apiRequestMock.mockResolvedValue(reconcilableResponse);
    render(
      wrap(
        <WalletReconciliationDialog
          open={false}
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );
    expect(screen.queryByTestId('reconcile-dialog')).toBeFalsy();
  });

  it('open=true: monta dialog e busca reconcilable-wallets', async () => {
    apiRequestMock.mockResolvedValue(reconcilableResponse);
    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-dialog')).toBeTruthy();
    });
    // Primeira chamada: GET /reconcilable-wallets
    expect(apiRequestMock).toHaveBeenCalled();
    const firstCall = apiRequestMock.mock.calls[0];
    expect(firstCall[0]).toBe('GET');
    expect(firstCall[1]).toContain('/api/grind-sessions/ses_1/reconcilable-wallets');
  });

  it('renderiza cada wallet com row, input e preview de delta', async () => {
    apiRequestMock.mockResolvedValue(reconcilableResponse);
    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-row-wA')).toBeTruthy();
    });
    expect(screen.getByTestId('reconcile-row-wB')).toBeTruthy();
    expect(screen.getByTestId('reconcile-input-wA')).toBeTruthy();
    expect(screen.getByTestId('reconcile-input-wB')).toBeTruthy();
    expect(screen.getByTestId('reconcile-delta-wA')).toBeTruthy();
    expect(screen.getByTestId('reconcile-delta-wB')).toBeTruthy();
  });

  it('mostra accessibility attrs role=dialog + aria-modal', async () => {
    apiRequestMock.mockResolvedValue(reconcilableResponse);
    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );
    await waitFor(() => {
      const dialog = screen.getByTestId('reconcile-dialog');
      expect(dialog.getAttribute('role')).toBe('dialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
    });
  });
});

// =============================================================================
// 2. Toggle "Mostrar todas wallets ativas" (RF-02)
// =============================================================================

describe('<WalletReconciliationDialog> — toggle "todas" (RF-02)', () => {
  it('default: toggle OFF, mostra apenas wallets com hadActivityInSession=true', async () => {
    apiRequestMock.mockResolvedValue(reconcilableResponse);
    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-row-wA')).toBeTruthy();
    });
    // wC (hadActivityInSession=false) NAO esta no payload retornado quando toggle off
    expect(screen.queryByTestId('reconcile-row-wC')).toBeFalsy();
  });

  it('toggle ON: refetch com includeAll=true', async () => {
    const user = userEvent.setup();
    apiRequestMock
      .mockResolvedValueOnce(reconcilableResponse)
      .mockResolvedValueOnce(reconcilableResponseAll);

    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-toggle-all')).toBeTruthy();
    });

    await user.click(screen.getByTestId('reconcile-toggle-all'));

    await waitFor(() => {
      // 2a chamada GET deve ter includeAll=true na URL
      const calls = apiRequestMock.mock.calls.filter(
        (c) => c[0] === 'GET' && String(c[1]).includes('reconcilable-wallets'),
      );
      expect(calls.length).toBeGreaterThanOrEqual(2);
      const lastCall = calls[calls.length - 1];
      expect(String(lastCall[1])).toMatch(/includeAll=true/);
    });
  });
});

// =============================================================================
// 3. Preview de delta em tempo real (RF-03)
// =============================================================================

// V1 obsoleto — V2 spec mudou comportamento (input range/step diferente).
// Cobertura V2 em WalletReconciliationDialog.v2.test.tsx.
describe.skip('<WalletReconciliationDialog> — preview delta (RF-03)', () => {
  it('input com valor maior que balance -> delta positivo, tone positive', async () => {
    apiRequestMock.mockResolvedValue(reconcilableResponse);
    const user = userEvent.setup();
    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-input-wA')).toBeTruthy();
    });

    const input = screen.getByTestId('reconcile-input-wA') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '1247');

    await waitFor(() => {
      const delta = screen.getByTestId('reconcile-delta-wA');
      // sinal positivo na string OU tone marker (data-tone / classe)
      expect(delta.textContent ?? '').toMatch(/\+/);
    });
  });

  it('input com valor menor que balance -> delta negativo', async () => {
    apiRequestMock.mockResolvedValue(reconcilableResponse);
    const user = userEvent.setup();
    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-input-wB')).toBeTruthy();
    });

    const input = screen.getByTestId('reconcile-input-wB') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '165');

    await waitFor(() => {
      const delta = screen.getByTestId('reconcile-delta-wB');
      expect(delta.textContent ?? '').toMatch(/-|saida|menor/i);
    });
  });

  it('input com valor igual ao balance -> delta zero (sem ajuste)', async () => {
    apiRequestMock.mockResolvedValue(reconcilableResponse);
    const user = userEvent.setup();
    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-input-wA')).toBeTruthy();
    });

    const input = screen.getByTestId('reconcile-input-wA') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '1180');

    await waitFor(() => {
      const delta = screen.getByTestId('reconcile-delta-wA');
      // Texto do tipo "Sem ajuste" ou "0,00"
      const text = (delta.textContent ?? '').toLowerCase();
      expect(text).toMatch(/sem ajuste|0,00/);
    });
  });
});

// =============================================================================
// 4. Submit (RF-04)
// =============================================================================

// V1 obsoleto — botao "Sem ajuste" V2 envia skipReconciliation=true (nao mais []).
// Cobertura V2 em WalletReconciliationDialog.v2.test.tsx.
describe.skip('<WalletReconciliationDialog> — submit (RF-04)', () => {
  it('submit envia POST /reconcile-wallets com adjustments filtrando delta=0', async () => {
    const user = userEvent.setup();
    // 1a chamada: GET reconcilable-wallets
    // 2a chamada: POST reconcile-wallets
    apiRequestMock
      .mockResolvedValueOnce(reconcilableResponse)
      .mockResolvedValueOnce({
        txCreated: [{ id: 'tx1', walletId: 'wA' }],
        skipped: 0,
      });

    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-input-wA')).toBeTruthy();
    });

    // wA: delta != 0 (1247 != 1180); wB: delta = 0 (mantem 200)
    const inputA = screen.getByTestId('reconcile-input-wA') as HTMLInputElement;
    await user.clear(inputA);
    await user.type(inputA, '1247');

    const submit = screen.getByTestId('reconcile-submit');
    await user.click(submit);

    await waitFor(() => {
      const post = apiRequestMock.mock.calls.find(
        (c) => c[0] === 'POST' && String(c[1]).includes('reconcile-wallets'),
      );
      expect(post).toBeTruthy();
      const body = post![2];
      expect(Array.isArray(body.adjustments)).toBe(true);
      // delta=0 da wB foi filtrado client-side
      expect(body.adjustments).toHaveLength(1);
      expect(body.adjustments[0].walletId).toBe('wA');
      expect(body.adjustments[0].reportedBalance).toBeCloseTo(1247, 2);
      expect(body.adjustments[0].expectedPreviousBalance).toBeCloseTo(1180, 2);
    });
  });

  it('botao "Sem ajuste" envia adjustments=[] (skip total RF-05)', async () => {
    const user = userEvent.setup();
    apiRequestMock
      .mockResolvedValueOnce(reconcilableResponse)
      .mockResolvedValueOnce({ txCreated: [], skipped: 0 });

    const onComplete = vi.fn();
    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={onComplete}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-skip')).toBeTruthy();
    });

    await user.click(screen.getByTestId('reconcile-skip'));

    // "Sem ajuste" pode: (a) chamar onComplete sem POST, OU
    //                    (b) chamar POST com adjustments=[]
    // Spec descreve "fecha sem chamar endpoint" (RF-05). Aceitamos qualquer um:
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('submit valido chama onComplete e fecha o dialog', async () => {
    const user = userEvent.setup();
    apiRequestMock
      .mockResolvedValueOnce(reconcilableResponse)
      .mockResolvedValueOnce({
        txCreated: [{ id: 'tx1', walletId: 'wA' }],
        skipped: 0,
      });

    const onOpenChange = vi.fn();
    const onComplete = vi.fn();
    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={onOpenChange}
          sessionId="ses_1"
          onComplete={onComplete}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-input-wA')).toBeTruthy();
    });

    const inputA = screen.getByTestId('reconcile-input-wA') as HTMLInputElement;
    await user.clear(inputA);
    await user.type(inputA, '1247');
    await user.click(screen.getByTestId('reconcile-submit'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// 5. Tratamento de erros (RF-04, RF-08)
// =============================================================================

describe('<WalletReconciliationDialog> — 409 balance_mismatch (RF-04, US-04)', () => {
  it('mostra alerta + refetch reconcilable-wallets', async () => {
    const user = userEvent.setup();
    apiRequestMock
      .mockResolvedValueOnce(reconcilableResponse) // 1o GET
      .mockRejectedValueOnce(
        makeError(409, 'balance_mismatch', { failedAt: { walletId: 'wA', currentBalance: 1280 } }),
      ) // POST falha
      .mockResolvedValueOnce({
        ...reconcilableResponse,
        wallets: reconcilableResponse.wallets.map((w) =>
          w.walletId === 'wA' ? { ...w, balance: 1280, expectedPreviousBalance: 1280 } : w,
        ),
      }); // 2o GET refetch

    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-input-wA')).toBeTruthy();
    });

    const inputA = screen.getByTestId('reconcile-input-wA') as HTMLInputElement;
    await user.clear(inputA);
    await user.type(inputA, '1247');
    await user.click(screen.getByTestId('reconcile-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-error-alert')).toBeTruthy();
    });
    const alert = screen.getByTestId('reconcile-error-alert');
    expect(alert.textContent ?? '').toMatch(/saldo|carteira/i);
  });
});

describe('<WalletReconciliationDialog> — 409 already_reconciled (RF-08, US-05)', () => {
  it('mostra estado read-only "ja reconciliada" e chama onComplete', async () => {
    const user = userEvent.setup();
    apiRequestMock
      .mockResolvedValueOnce(reconcilableResponse)
      .mockRejectedValueOnce(makeError(409, 'already_reconciled', { existingCount: 2 }));

    const onComplete = vi.fn();
    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={onComplete}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-input-wA')).toBeTruthy();
    });

    const inputA = screen.getByTestId('reconcile-input-wA') as HTMLInputElement;
    await user.clear(inputA);
    await user.type(inputA, '1247');
    await user.click(screen.getByTestId('reconcile-submit'));

    await waitFor(() => {
      // Aceita: alert OU onComplete com flag alreadyReconciled
      const hasAlert = !!screen.queryByTestId('reconcile-error-alert');
      const completed = onComplete.mock.calls.length > 0;
      expect(hasAlert || completed).toBe(true);
    });
  });
});

describe('<WalletReconciliationDialog> — 422 wallet_archived (RF-07, US-06)', () => {
  it('refetch + remove wallet da lista', async () => {
    const user = userEvent.setup();
    apiRequestMock
      .mockResolvedValueOnce(reconcilableResponse)
      .mockRejectedValueOnce(makeError(422, 'wallet_archived', { walletId: 'wA' }))
      .mockResolvedValueOnce({
        ...reconcilableResponse,
        wallets: reconcilableResponse.wallets.filter((w) => w.walletId !== 'wA'),
      });

    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-input-wA')).toBeTruthy();
    });

    const inputA = screen.getByTestId('reconcile-input-wA') as HTMLInputElement;
    await user.clear(inputA);
    await user.type(inputA, '1247');
    await user.click(screen.getByTestId('reconcile-submit'));

    await waitFor(() => {
      const hasAlert =
        !!screen.queryByTestId('reconcile-error-alert') ||
        !!screen.queryByTestId('reconcile-error-row-wA');
      expect(hasAlert).toBe(true);
    });
  });
});

// =============================================================================
// 6. Telemetria (RF-12)
// =============================================================================

// V1 obsoleto — RF-11 V2 renomeou eventos (reconcile_dialog_view -> reconcile_dialog_opened etc).
// Cobertura V2 em tests/integration/telemetry/session-end-events.test.ts.
describe.skip('<WalletReconciliationDialog> — telemetria (RF-12)', () => {
  it('reconcile_dialog_view ao montar com open=true', async () => {
    apiRequestMock.mockResolvedValue(reconcilableResponse);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      render(
        wrap(
          <WalletReconciliationDialog
            open
            onOpenChange={() => {}}
            sessionId="ses_1"
            onComplete={() => {}}
          />,
        ),
      );
      await waitFor(() => {
        const events = spy.mock.calls
          .filter((c) => String(c[0] ?? '').includes('[telemetry][reconcile]'))
          .map((c) => c[1]);
        expect(events).toContain('reconcile_dialog_view');
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('reconcile_submit_success em 2xx', async () => {
    apiRequestMock
      .mockResolvedValueOnce(reconcilableResponse)
      .mockResolvedValueOnce({ txCreated: [{ id: 'tx1' }], skipped: 0 });

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      render(
        wrap(
          <WalletReconciliationDialog
            open
            onOpenChange={() => {}}
            sessionId="ses_1"
            onComplete={() => {}}
          />,
        ),
      );
      await waitFor(() => {
        expect(screen.getByTestId('reconcile-input-wA')).toBeTruthy();
      });
      const input = screen.getByTestId('reconcile-input-wA') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, '1247');
      await user.click(screen.getByTestId('reconcile-submit'));

      await waitFor(() => {
        const events = spy.mock.calls
          .filter((c) => String(c[0] ?? '').includes('[telemetry][reconcile]'))
          .map((c) => c[1]);
        expect(events).toContain('reconcile_submit_success');
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('reconcile_submit_error em 4xx/5xx', async () => {
    apiRequestMock
      .mockResolvedValueOnce(reconcilableResponse)
      .mockRejectedValueOnce(makeError(500, 'unknown'));

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      render(
        wrap(
          <WalletReconciliationDialog
            open
            onOpenChange={() => {}}
            sessionId="ses_1"
            onComplete={() => {}}
          />,
        ),
      );
      await waitFor(() => {
        expect(screen.getByTestId('reconcile-input-wA')).toBeTruthy();
      });
      const input = screen.getByTestId('reconcile-input-wA') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, '1247');
      await user.click(screen.getByTestId('reconcile-submit'));

      await waitFor(() => {
        const events = spy.mock.calls
          .filter((c) => String(c[0] ?? '').includes('[telemetry][reconcile]'))
          .map((c) => c[1]);
        expect(events).toContain('reconcile_submit_error');
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('reconcile_skip_total quando clica "Sem ajuste"', async () => {
    apiRequestMock.mockResolvedValueOnce(reconcilableResponse);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      render(
        wrap(
          <WalletReconciliationDialog
            open
            onOpenChange={() => {}}
            sessionId="ses_1"
            onComplete={() => {}}
          />,
        ),
      );
      await waitFor(() => {
        expect(screen.getByTestId('reconcile-skip')).toBeTruthy();
      });
      await user.click(screen.getByTestId('reconcile-skip'));

      await waitFor(() => {
        const events = spy.mock.calls
          .filter((c) => String(c[0] ?? '').includes('[telemetry][reconcile]'))
          .map((c) => c[1]);
        expect(events).toContain('reconcile_skip_total');
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('payload de telemetria nao contem nomes de wallet (sem PII)', async () => {
    apiRequestMock.mockResolvedValue(reconcilableResponse);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      render(
        wrap(
          <WalletReconciliationDialog
            open
            onOpenChange={() => {}}
            sessionId="ses_1"
            onComplete={() => {}}
          />,
        ),
      );
      await waitFor(() => {
        const calls = spy.mock.calls.filter((c) =>
          String(c[0] ?? '').includes('[telemetry][reconcile]'),
        );
        expect(calls.length).toBeGreaterThanOrEqual(1);
        const viewCall = calls.find((c) => c[1] === 'reconcile_dialog_view');
        expect(viewCall).toBeTruthy();
        const payload = JSON.stringify(viewCall![2] ?? {});
        // Nao deve conter o nome humano da wallet (apenas walletId/sessionId)
        expect(payload).not.toMatch(/PokerStars BR/);
        expect(payload).not.toMatch(/GG USD/);
      });
    } finally {
      spy.mockRestore();
    }
  });
});

// =============================================================================
// 7. Edge cases (filtra delta=0, sessao sem wallets, etc)
// =============================================================================

// V1 obsoleto — input type/step + button disabled regras V2 mudaram.
// Cobertura V2 em WalletReconciliationDialog.v2.test.tsx.
describe.skip('<WalletReconciliationDialog> — edge cases', () => {
  it('GET retorna wallets=[] -> mostra estado vazio (data-testid reconcile-empty)', async () => {
    apiRequestMock.mockResolvedValue({
      sessionId: 'ses_1',
      alreadyReconciled: false,
      wallets: [],
    });

    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );

    await waitFor(() => {
      // pode mostrar reconcile-empty OU chamar onComplete direto — qualquer um aceito
      const empty = screen.queryByTestId('reconcile-empty');
      const dialog = screen.queryByTestId('reconcile-dialog');
      expect(empty || dialog).toBeTruthy();
    });
  });

  it('botao submit desabilitado quando todos deltas sao zero', async () => {
    apiRequestMock.mockResolvedValue(reconcilableResponse);
    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-submit')).toBeTruthy();
    });

    const submit = screen.getByTestId('reconcile-submit') as HTMLButtonElement;
    // Sem editar nada -> todos inputs pre-preenchidos = balance -> delta zero
    expect(submit.disabled).toBe(true);
  });

  it('input rejeita texto nao-numerico (tipo=number / step=0.01) e aceita negativos (HIGH-1)', async () => {
    apiRequestMock.mockResolvedValue(reconcilableResponse);
    render(
      wrap(
        <WalletReconciliationDialog
          open
          onOpenChange={() => {}}
          sessionId="ses_1"
          onComplete={() => {}}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('reconcile-input-wA')).toBeTruthy();
    });
    const input = screen.getByTestId('reconcile-input-wA') as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.step).toBe('0.01');
    // HIGH-1: spec RF-03 permite saldo reportado negativo (wallet pode
    // ficar negativa apos rebuy/staking). Sem atributo min="0".
    expect(input.min).toBe('');
  });
});
