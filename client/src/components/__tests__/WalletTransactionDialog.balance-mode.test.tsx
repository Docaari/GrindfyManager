import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Bankroll-2.1 — WalletTransactionDialog Balance Mode (RF-01..RF-07)
//
// Spec: Docs/specs/wallet-balance-mode.md
// Sequence: Docs/architecture/flows/bankroll/sequence-wallet-tx-balance-mode.mermaid
//
// CONTRATO ASSUMIDO PELO TEST-WRITER (resolve ambiguidades para Implementer):
//
// data-testids estaveis (toda interacao usa getByTestId — NUNCA heuristicas
// de DOM tree, conforme licao 2026-04-24 sobre LimitCounterWrapper):
//   wallet-tx-mode-toggle           — container do toggle de modo (pai)
//   wallet-tx-mode-movement         — botao/tab "Movimento" (modo legado)
//   wallet-tx-mode-balance          — botao/tab "Reportar saldo" (modo novo)
//   wallet-tx-amount-input          — input de valor (existe em modo movement)
//   wallet-tx-balance-input         — input de saldo (existe em modo balance)
//   wallet-tx-balance-hint          — hint "Saldo atual: R$ X,XX"
//   wallet-tx-balance-preview       — preview "+R$ 67,00 (lucro)" / etc.
//   wallet-tx-balance-mismatch-alert — alerta inline em 409
//   wallet-tx-balance-refresh-button — botao "Atualizar" no alerta 409
//   wallet-tx-submit                — botao salvar
//   wallet-tx-reason-select         — select de reason (compartilhado)
//
// Atributos auxiliares:
//   data-sign="positive"|"negative"|"zero" no preview — sinaliza cor sem
//   testar classes CSS especificas (mais resiliente que assertar text-green-*).
//
// Mock de apiRequest: o queryClient.ts real lanca um Error com prop .response
// (linha 13-19 de client/src/lib/queryClient.ts):
//   Object.assign(new Error(message), { response: { status, data } })
// O mock segue esse contrato real.
//
// IMPORTANTE: o componente atual (WalletTransactionDialog.tsx) NAO tem suporte
// a balance mode ainda. Esses testes sao TDD red phase: vao falhar ate o
// implementer adicionar o toggle, hint, preview, balance input, alert 409.
// =============================================================================

import { WalletTransactionDialog } from '../bankroll/WalletTransactionDialog';

// Mock toast (pode ou nao ser usado pelo componente)
const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (args: any) => toastMock(args),
}));

// Mock apiRequest com contrato REAL do queryClient (Error com .response)
const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
  },
  getCsrfToken: () => null,
}));

// Mock fetch (componente usa para useQuery do consolidated)
const fetchMock = vi.fn();
beforeEach(() => {
  apiRequestMock.mockReset();
  fetchMock.mockReset();
  toastMock.mockClear();
  global.fetch = fetchMock as any;
  // Default: consolidated retorna vazio (sem impacto na maioria dos testes)
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => ({
      totalUSD: '1180.00',
      byWallet: [{ walletId: 'wlt_1', fxRateUSDPerNative: '5.0' }],
    }),
    text: async () => '',
  }));
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const baseWallet = {
  id: 'wlt_1',
  name: 'Suprema Main',
  platform: 'Suprema',
  nativeCurrency: 'BRL',
  balance: '1180.00',
  status: 'active' as const,
};

function makeMismatchError(currentBalance: number) {
  // Replica contrato real do queryClient.ts:
  //   const error = new Error(message);
  //   error.response = { status, data };
  return Object.assign(new Error('balance_mismatch'), {
    response: {
      status: 409,
      data: { code: 'balance_mismatch', currentBalance },
    },
  });
}

// =============================================================================
// 1. Toggle de modo
// =============================================================================

describe('<WalletTransactionDialog> — toggle de modo (RF-01)', () => {
  it('abre por default em modo "Movimento" (toggle visivel)', () => {
    render(wrap(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={baseWallet} />,
    ));

    // Toggle visivel
    const toggle = screen.queryByTestId('wallet-tx-mode-toggle')
      || screen.queryByTestId('wallet-tx-mode-movement');
    expect(toggle).toBeTruthy();
    // Modo movement: input de valor existe
    expect(screen.queryByTestId('wallet-tx-amount-input')).toBeTruthy();
    // Modo balance: input de saldo NAO deve existir ainda
    expect(screen.queryByTestId('wallet-tx-balance-input')).toBeFalsy();
  });

  it('click em "Reportar saldo" oculta input de movimento e mostra balance input', async () => {
    const user = userEvent.setup();
    render(wrap(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={baseWallet} />,
    ));

    const balanceModeBtn = screen.getByTestId('wallet-tx-mode-balance');
    await user.click(balanceModeBtn);

    await waitFor(() => {
      // Modo balance ativo: balance input existe
      expect(screen.queryByTestId('wallet-tx-balance-input')).toBeTruthy();
      // Modo movement: amount input NAO existe (ou esta hidden — testamos absence)
      expect(screen.queryByTestId('wallet-tx-amount-input')).toBeFalsy();
    });
  });

  it('voltar para "Movimento" restaura input de valor (RF-07 — modo legado intacto)', async () => {
    const user = userEvent.setup();
    render(wrap(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={baseWallet} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));
    await waitFor(() => expect(screen.queryByTestId('wallet-tx-balance-input')).toBeTruthy());

    await user.click(screen.getByTestId('wallet-tx-mode-movement'));
    await waitFor(() => {
      expect(screen.queryByTestId('wallet-tx-amount-input')).toBeTruthy();
      expect(screen.queryByTestId('wallet-tx-balance-input')).toBeFalsy();
    });
  });
});

// =============================================================================
// 2. Input de balance: pre-preenche, hint, preview
// =============================================================================

describe('<WalletTransactionDialog> — input de saldo (RF-02 + RF-03)', () => {
  it('balance input fica vazio ao entrar no modo (Sprint Bankroll-Reports-Detail UX Win 1)', async () => {
    // UX R3 Win 1: input pre-vazio + autoFocus + select-all evita friccao de
    // apagar valor mock antes de digitar saldo novo. Hint "Saldo atual: X"
    // continua mostrando o valor de referencia (testado em outro it).
    const user = userEvent.setup();
    render(wrap(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={baseWallet} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));

    await waitFor(() => {
      const input = screen.getByTestId('wallet-tx-balance-input') as HTMLInputElement;
      expect(input.value).toBe('');
    });
  });

  it('hint exibe saldo atual formatado em nativeCurrency', async () => {
    const user = userEvent.setup();
    render(wrap(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={baseWallet} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));

    await waitFor(() => {
      const hint = screen.getByTestId('wallet-tx-balance-hint');
      expect(hint).toBeTruthy();
      // Texto contem "1180" e "R$" (BRL)
      expect(hint.textContent).toMatch(/1[.,]?180/);
      expect(hint.textContent).toMatch(/R\$/);
    });
  });

  it('digitar saldo MAIOR que atual: preview "+R$ 67,00 (lucro)" com data-sign=positive', async () => {
    const user = userEvent.setup();
    render(wrap(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={baseWallet} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));

    const input = await waitFor(() =>
      screen.getByTestId('wallet-tx-balance-input') as HTMLInputElement,
    );

    // Limpa e digita 1247 (delta = +67)
    await user.clear(input);
    await user.type(input, '1247');

    await waitFor(() => {
      const preview = screen.getByTestId('wallet-tx-balance-preview');
      expect(preview).toBeTruthy();
      expect(preview.getAttribute('data-sign')).toBe('positive');
      // Texto contem 67 e (lucro)
      expect(preview.textContent).toMatch(/67/);
      expect(preview.textContent).toMatch(/lucro/i);
    });
  });

  it('digitar saldo MENOR que atual: preview "-R$ 30,00 (perda)" com data-sign=negative', async () => {
    const user = userEvent.setup();
    render(wrap(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={baseWallet} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));

    const input = await waitFor(() =>
      screen.getByTestId('wallet-tx-balance-input') as HTMLInputElement,
    );

    await user.clear(input);
    await user.type(input, '1150');

    await waitFor(() => {
      const preview = screen.getByTestId('wallet-tx-balance-preview');
      expect(preview.getAttribute('data-sign')).toBe('negative');
      expect(preview.textContent).toMatch(/30/);
      expect(preview.textContent).toMatch(/perda/i);
    });
  });

  it('saldo IGUAL ao atual: preview "Saldo igual" com data-sign=zero E botao salvar desabilitado', async () => {
    const user = userEvent.setup();
    render(wrap(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={baseWallet} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));

    const input = await waitFor(() =>
      screen.getByTestId('wallet-tx-balance-input') as HTMLInputElement,
    );

    await user.clear(input);
    await user.type(input, '1180');

    await waitFor(() => {
      const preview = screen.getByTestId('wallet-tx-balance-preview');
      expect(preview.getAttribute('data-sign')).toBe('zero');
      expect(preview.textContent).toMatch(/igual/i);
    });

    const submitBtn = screen.getByTestId('wallet-tx-submit') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });
});

// =============================================================================
// 3. Reason default em modo balance
// =============================================================================

describe('<WalletTransactionDialog> — reason default em modo balance (RF-04 Q4)', () => {
  it('ao entrar em modo balance, reason select pre-seleciona "session_result"', async () => {
    const user = userEvent.setup();
    render(wrap(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={baseWallet} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));

    await waitFor(() => {
      const reasonSelect = screen.getByTestId('wallet-tx-reason-select') as HTMLSelectElement;
      expect(reasonSelect.value).toBe('session_result');
    });
  });
});

// =============================================================================
// 4. Submit em modo balance — derivacao do body (RF-04)
// =============================================================================

describe('<WalletTransactionDialog> — submit em modo balance (RF-04)', () => {
  it('submit envia body com direction, nativeAmount=|delta|, expectedPreviousBalance, reason', async () => {
    apiRequestMock.mockResolvedValueOnce({
      transaction: { id: 'wtx_new' },
      wallet: { id: 'wlt_1', balance: '1247' },
    });

    const user = userEvent.setup();
    render(wrap(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={baseWallet} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));

    const input = await waitFor(() =>
      screen.getByTestId('wallet-tx-balance-input') as HTMLInputElement,
    );

    await user.clear(input);
    await user.type(input, '1247');

    const submitBtn = screen.getByTestId('wallet-tx-submit');
    await user.click(submitBtn);

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());

    const [method, url, body] = apiRequestMock.mock.calls[0];
    expect(method).toBe('POST');
    expect(String(url)).toContain('/api/wallets/wlt_1/transactions');
    expect(body.direction).toBe('in');
    expect(body.nativeAmount).toBeCloseTo(67, 2);
    expect(body.expectedPreviousBalance).toBeCloseTo(1180, 2);
    // ADR-069 (Sprint Bankroll-Reports-Detail): modo balance SEM sessionIdProp
    // gera reason='manual_report' (mutuamente exclusivo com session_result).
    expect(body.reason).toBe('manual_report');
    expect(body.sessionId).toBeUndefined();
  });

  it('saldo menor: body tem direction=out e nativeAmount = |delta|', async () => {
    apiRequestMock.mockResolvedValueOnce({
      transaction: { id: 'wtx_loss' },
      wallet: { id: 'wlt_1', balance: '1100' },
    });

    const user = userEvent.setup();
    render(wrap(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={baseWallet} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));

    const input = await waitFor(() =>
      screen.getByTestId('wallet-tx-balance-input') as HTMLInputElement,
    );
    await user.clear(input);
    await user.type(input, '1100');

    await user.click(screen.getByTestId('wallet-tx-submit'));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());

    const [, , body] = apiRequestMock.mock.calls[0];
    expect(body.direction).toBe('out');
    expect(body.nativeAmount).toBeCloseTo(80, 2);
    expect(body.expectedPreviousBalance).toBeCloseTo(1180, 2);
  });
});

// =============================================================================
// 5. Tratamento de 409 balance_mismatch (RF-06)
// =============================================================================

describe('<WalletTransactionDialog> — 409 balance_mismatch (RF-06)', () => {
  it('em 409, dialog NAO fecha e exibe alerta inline com currentBalance', async () => {
    apiRequestMock.mockRejectedValueOnce(makeMismatchError(1247.5));

    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(wrap(
      <WalletTransactionDialog open onOpenChange={onOpenChange} wallet={baseWallet} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));

    const input = await waitFor(() =>
      screen.getByTestId('wallet-tx-balance-input') as HTMLInputElement,
    );
    await user.clear(input);
    await user.type(input, '1247');

    await user.click(screen.getByTestId('wallet-tx-submit'));

    await waitFor(() => {
      const alert = screen.queryByTestId('wallet-tx-balance-mismatch-alert');
      expect(alert).toBeTruthy();
      // Texto contem "1247" formatado (qualquer separador)
      expect(alert!.textContent).toMatch(/1[.,]?247/);
    });

    // Dialog NAO fechou
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // Botao Atualizar visivel
    expect(screen.queryByTestId('wallet-tx-balance-refresh-button')).toBeTruthy();
  });

  it('click em "Atualizar" faz refetch da wallet, atualiza hint e preview, preserva input', async () => {
    apiRequestMock.mockRejectedValueOnce(makeMismatchError(1247.5));

    // Refetch da wallet via fetch — segundo chamada de fetch retorna nova wallet.
    let fetchCallCount = 0;
    fetchMock.mockImplementation(async (url: string) => {
      fetchCallCount++;
      // Primeira chamada: consolidated (no abrir do dialog).
      // Chamadas subsequentes: refetch da wallet apos 409.
      if (String(url).includes('/api/wallets/wlt_1') && !String(url).includes('/transactions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            wallet: { ...baseWallet, balance: '1247.50' },
            recentTransactions: [],
            lastTransactionAt: null,
          }),
          text: async () => '',
        };
      }
      // Default: consolidated
      return {
        ok: true,
        status: 200,
        json: async () => ({
          totalUSD: '1180.00',
          byWallet: [{ walletId: 'wlt_1', fxRateUSDPerNative: '5.0' }],
        }),
        text: async () => '',
      };
    });

    const user = userEvent.setup();
    render(wrap(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={baseWallet} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));
    const input = await waitFor(() =>
      screen.getByTestId('wallet-tx-balance-input') as HTMLInputElement,
    );

    await user.clear(input);
    await user.type(input, '1247');

    await user.click(screen.getByTestId('wallet-tx-submit'));

    // Aguarda alerta 409
    const refreshBtn = await waitFor(() =>
      screen.getByTestId('wallet-tx-balance-refresh-button'),
    );

    // O valor digitado pelo usuario (1247) deve ser preservado.
    expect(parseFloat((input as HTMLInputElement).value.replace(',', '.'))).toBeCloseTo(1247, 2);

    // Click em Atualizar
    await user.click(refreshBtn);

    // Apos refresh, hint precisa refletir 1247.50 (novo balance)
    await waitFor(() => {
      const hint = screen.getByTestId('wallet-tx-balance-hint');
      expect(hint.textContent).toMatch(/1[.,]?247/);
    });

    // Input do usuario preservado (ainda 1247)
    expect(parseFloat((input as HTMLInputElement).value.replace(',', '.'))).toBeCloseTo(1247, 2);

    // Preview recomputado: 1247 - 1247.50 = -0.50 (data-sign=negative ou zero
    // se diff < 0.01 — aqui diff > 0.01, entao negative)
    await waitFor(() => {
      const preview = screen.getByTestId('wallet-tx-balance-preview');
      const sign = preview.getAttribute('data-sign');
      // Diff = -0.50 -> negative
      expect(sign).toBe('negative');
    });
  });
});

// =============================================================================
// 6. Backward-compat: modo movement intacto (RF-07)
// =============================================================================

describe('<WalletTransactionDialog> — modo movement preservado (RF-07)', () => {
  it('em modo movement, body do POST NAO contem expectedPreviousBalance', async () => {
    apiRequestMock.mockResolvedValueOnce({
      transaction: { id: 'wtx_legacy' },
      wallet: { id: 'wlt_1', balance: '1230' },
    });

    const user = userEvent.setup();
    render(wrap(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={baseWallet} />,
    ));

    // NAO troca modo — fica em movement default

    const amountInput = screen.getByTestId('wallet-tx-amount-input') as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, '50');

    await user.click(screen.getByTestId('wallet-tx-submit'));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());

    const [, , body] = apiRequestMock.mock.calls[0];
    expect(body.expectedPreviousBalance).toBeUndefined();
    expect(body.nativeAmount).toBeCloseTo(50, 2);
  });
});
