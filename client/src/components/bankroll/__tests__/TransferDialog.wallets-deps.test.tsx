/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UX-QW-3 — RF-07: TransferDialog exhaustive-deps fix.
 *
 * Spec: Docs/specs/sprint-ux-qw-3.md (RF-07)
 *
 * Problema:
 *   useEffect tinha `// eslint-disable-next-line react-hooks/exhaustive-deps`
 *   por causa da identity instavel de `wallets` (novo array em cada render).
 *
 * Fix esperado:
 *   - Derivar `walletsKey = wallets.map(w => w.id).join('|')` via useMemo.
 *   - Effect depende de [open, defaultFromWalletId, defaultToWalletId, walletsKey].
 *   - Sem eslint-disable.
 *
 * Comportamento esperado:
 *   1. Remount com NOVO array mas MESMOS ids NAO reseta state (porque walletsKey
 *      eh estavel).
 *   2. NOVO wallet adicionado (id novo) reseta state (porque walletsKey muda).
 *
 * O state observavel: o user altera amount e fxRate; entao re-render acontece
 * (parent passa novo array com mesma composicao OU array novo com wallet novo).
 *
 * Lessons aplicadas:
 *   #14/#26 await import / static
 *   #2  data-testid estavel
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
  getCsrfToken: () => null,
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function loadDialog() {
  const mod: any = await import('../TransferDialog');
  return (mod.default ?? mod.TransferDialog) as React.ComponentType<any>;
}

const baseWallets = [
  { id: 'w_usd', name: 'GG USD', platform: 'GGNetwork', nativeCurrency: 'USD', balance: '1000', status: 'active' },
  { id: 'w_brl', name: 'Suprema BRL', platform: 'Suprema', nativeCurrency: 'BRL', balance: '5000', status: 'active' },
];

describe('RF-07 TransferDialog — walletsKey estavel preserva state', () => {
  it('NOVO array com MESMOS ids NAO reseta o amount digitado', async () => {
    const Dialog = await loadDialog();

    const { rerender } = render(
      wrap(
        <Dialog
          open={true}
          onOpenChange={vi.fn()}
          wallets={baseWallets}
          defaultFromWalletId="w_usd"
          defaultToWalletId="w_brl"
        />,
      ),
    );

    const amount = screen.getByTestId('transfer-amount-input') as HTMLInputElement;
    fireEvent.change(amount, { target: { value: '250' } });
    expect(amount.value).toBe('250');

    // Re-render com array novo (mesmos ids) — simula parent que re-cria
    // o array em cada render (caso classico que causa exhaustive-deps warn).
    const newArraySameIds = baseWallets.map((w) => ({ ...w }));
    rerender(
      wrap(
        <Dialog
          open={true}
          onOpenChange={vi.fn()}
          wallets={newArraySameIds}
          defaultFromWalletId="w_usd"
          defaultToWalletId="w_brl"
        />,
      ),
    );

    const amountAfter = screen.getByTestId('transfer-amount-input') as HTMLInputElement;
    expect(amountAfter.value).toBe('250');
  });

  it('NOVO wallet adicionado (id novo) reseta o state (walletsKey muda)', async () => {
    const Dialog = await loadDialog();

    const { rerender } = render(
      wrap(
        <Dialog
          open={true}
          onOpenChange={vi.fn()}
          wallets={baseWallets}
          defaultFromWalletId="w_usd"
          defaultToWalletId="w_brl"
        />,
      ),
    );

    const amount = screen.getByTestId('transfer-amount-input') as HTMLInputElement;
    fireEvent.change(amount, { target: { value: '250' } });
    expect(amount.value).toBe('250');

    // Re-render com wallet NOVO -> walletsKey muda -> effect re-roda -> reset.
    const walletsWithNew = [
      ...baseWallets,
      {
        id: 'w_eur',
        name: 'Stars EUR',
        platform: 'PokerStars',
        nativeCurrency: 'EUR',
        balance: '2000',
        status: 'active',
      },
    ];
    rerender(
      wrap(
        <Dialog
          open={true}
          onOpenChange={vi.fn()}
          wallets={walletsWithNew}
          defaultFromWalletId="w_usd"
          defaultToWalletId="w_brl"
        />,
      ),
    );

    const amountAfter = screen.getByTestId('transfer-amount-input') as HTMLInputElement;
    // State foi resetado — input volta a string vazia (ou default '').
    expect(amountAfter.value).not.toBe('250');
  });
});
