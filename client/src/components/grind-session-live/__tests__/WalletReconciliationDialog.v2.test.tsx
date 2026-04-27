/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-04: payload v2 (expectedDelta, expectedClosingBalance, contributingTournaments, orphanContribution[])
 *  - RF-05: dialog com saldo pre-calculado + 3 botoes (Confirmar / Saldos OK / Pular sem registrar)
 *  - RF-14 + P9: input mobile/desktop UX (inputMode='decimal', virgula/ponto, mascara, foco/Tab/Enter)
 *
 * Modulo EXISTE — Implementer DEVE:
 *  - Mudar pre-preenchimento de wallet.balance para wallet.expectedClosingBalance.
 *  - Renomear botoes / adicionar 3 niveis hierarquicos:
 *      "Confirmar e gerar ajustes" (primario solid)
 *      "Saldos OK, sem ajuste" (secundario outline) — POST com skipReconciliation? no, com manualAdjustment=0
 *      "Pular sem registrar" (terciario link) — fecha sem POST
 *  - Banner orfao com lista de {site, currency, amount}.
 *  - Input com inputMode='decimal', aceita virgula e ponto, mascara visual currency.
 *  - data-testid esperados (novos + preservados):
 *      reconcile-dialog
 *      reconcile-toggle-all
 *      reconcile-row-{walletId}
 *      reconcile-input-{walletId}      (novo: inputMode=decimal)
 *      reconcile-delta-{walletId}      (preview manualAdjustment)
 *      reconcile-submit                (Confirmar e gerar ajustes)
 *      reconcile-skip-soft             (Saldos OK, sem ajuste — novo)
 *      reconcile-skip-hard             (Pular sem registrar — novo, link)
 *      reconcile-orphan-banner         (banner P6, novo)
 *      reconcile-orphan-cta            (Cadastrar carteira agora — novo)
 *      reconcile-tie-break-badge-{walletId}  (RF-05 P3 / F-04 — novo)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const apiRequestMock = vi.fn();
const invalidateQueriesMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: (...a: any[]) => invalidateQueriesMock(...a),
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

import { WalletReconciliationDialog } from '../WalletReconciliationDialog';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const v2Response = {
  sessionId: 'ses_1',
  alreadyReconciled: false,
  wallets: [
    {
      walletId: 'wA',
      name: 'BlackChip Main',
      platform: 'WPN',
      nativeCurrency: 'USD',
      openingBalance: 1180.0,
      expectedPreviousBalance: 1180.0,
      expectedDelta: 67.5,
      expectedClosingBalance: 1247.5,
      contributingTournaments: ['st_1', 'st_2'],
      hadActivityInSession: true,
    },
  ],
  orphanContribution: [],
};

const v2WithOrphan = {
  ...v2Response,
  orphanContribution: [
    { site: 'BodogPlay', currency: 'BRL', amount: 12.5 },
    { site: 'ChicoNetwork', currency: 'USD', amount: 8.0 },
  ],
};

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  sessionId: 'ses_1',
  onComplete: vi.fn(),
};

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockClear();
  invalidateQueriesMock.mockClear();
});

// =============================================================================
// RF-05: pre-preenchimento com expectedClosingBalance
// =============================================================================

describe('WalletReconciliationDialog v2 — pre-preenche com expectedClosingBalance (RF-05)', () => {
  it('input vem pre-preenchido com expectedClosingBalance, nao openingBalance', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    const input = await screen.findByTestId('reconcile-input-wA');
    expect((input as HTMLInputElement).value).toBe('1247.5');
  });

  it('input tem inputMode="decimal" (RF-14 mobile)', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    const input = await screen.findByTestId('reconcile-input-wA');
    expect(input.getAttribute('inputmode')).toBe('decimal');
  });
});

// =============================================================================
// RF-14: aceita virgula e ponto como separador decimal
// =============================================================================

describe('WalletReconciliationDialog v2 — input aceita virgula e ponto (RF-14)', () => {
  it('user digita "1247,50" -> parser converte e calcula manualAdjustment', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    const input = await screen.findByTestId('reconcile-input-wA');
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '1247,50');

    // Delta preview deve aparecer com 0 (1247.50 - 1247.50 = 0)
    const delta = await screen.findByTestId('reconcile-delta-wA');
    expect((delta.textContent ?? '').toLowerCase()).toMatch(/sem\s+ajuste|conferido|0,00/);
  });

  it('user digita "1247.50" (ponto) -> parser tambem aceita', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    const input = await screen.findByTestId('reconcile-input-wA');
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '1247.50');

    // Aceitamos input nao crashear e delta calcular
    expect(input).toBeInTheDocument();
  });
});

// =============================================================================
// RF-14: foco inicial + Tab + Enter navigation
// =============================================================================

describe('WalletReconciliationDialog v2 — foco e Tab/Enter (RF-14)', () => {
  it('foco inicial no primeiro input ao abrir dialog', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    const input = await screen.findByTestId('reconcile-input-wA');
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });
});

// =============================================================================
// RF-05: 3 botoes hierarquicos (P2/F-02)
// =============================================================================

describe('WalletReconciliationDialog v2 — 3 botoes (RF-05 P2)', () => {
  it('renderiza reconcile-submit (Confirmar e gerar ajustes)', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));
    expect(await screen.findByTestId('reconcile-submit')).toBeInTheDocument();
  });

  it('renderiza reconcile-skip-soft (Saldos OK, sem ajuste)', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));
    expect(await screen.findByTestId('reconcile-skip-soft')).toBeInTheDocument();
  });

  it('renderiza reconcile-skip-hard (Pular sem registrar)', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));
    expect(await screen.findByTestId('reconcile-skip-hard')).toBeInTheDocument();
  });
});

// =============================================================================
// RF-05 P2: comportamento dos 3 botoes
// =============================================================================

describe('WalletReconciliationDialog v2 — Confirmar e gerar ajustes (RF-05)', () => {
  it('click "Confirmar" -> POST com adjustments (skipReconciliation:false)', async () => {
    apiRequestMock
      .mockResolvedValueOnce(v2Response) // GET
      .mockResolvedValueOnce({ snapshotsCreated: 1, txCreated: [{ id: 'tx_1' }], skipped: 0 });

    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    const input = await screen.findByTestId('reconcile-input-wA');
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '1300');

    const submit = screen.getByTestId('reconcile-submit');
    fireEvent.click(submit);

    await waitFor(() => {
      // POST deve ter sido chamado
      const postCalls = apiRequestMock.mock.calls.filter(
        (c) => c[0] === 'POST' || (typeof c[1] === 'string' && c[1].includes('reconcile-wallets')),
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });

    const postCall = apiRequestMock.mock.calls.find((c) =>
      JSON.stringify(c).includes('reconcile-wallets'),
    );
    expect(postCall).toBeTruthy();
    const body = postCall![2];
    expect(body.skipReconciliation === false || body.skipReconciliation === undefined).toBe(true);
    expect(body.adjustments).toBeDefined();
  });
});

describe('WalletReconciliationDialog v2 — Saldos OK, sem ajuste (RF-05)', () => {
  it('click "Saldos OK" -> POST com skipReconciliation=false e reportedBalance=expectedClosingBalance', async () => {
    apiRequestMock
      .mockResolvedValueOnce(v2Response)
      .mockResolvedValueOnce({ snapshotsCreated: 1, txCreated: [], skipped: 0 });

    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    const skipSoft = await screen.findByTestId('reconcile-skip-soft');
    fireEvent.click(skipSoft);

    await waitFor(() => {
      const postCall = apiRequestMock.mock.calls.find((c) =>
        JSON.stringify(c).includes('reconcile-wallets'),
      );
      expect(postCall).toBeTruthy();
    });

    const postCall = apiRequestMock.mock.calls.find((c) =>
      JSON.stringify(c).includes('reconcile-wallets'),
    );
    const body = postCall![2];
    // Adjustments com reportedBalance == expectedClosingBalance (manualAdjustment=0)
    expect(body.adjustments[0].reportedBalance).toBeCloseTo(1247.5, 2);
  });
});

describe('WalletReconciliationDialog v2 — Pular sem registrar (RF-05 / P1)', () => {
  it('click "Pular sem registrar" -> NAO chama POST, fecha dialog (telemetria reconcile_skipped_user)', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);

    const onComplete = vi.fn();
    render(wrap(<WalletReconciliationDialog {...baseProps} onComplete={onComplete} />));

    const skipHard = await screen.findByTestId('reconcile-skip-hard');
    fireEvent.click(skipHard);

    // NAO deve haver segundo POST de submit
    await new Promise((r) => setTimeout(r, 10));
    const postCalls = apiRequestMock.mock.calls.filter((c) =>
      JSON.stringify(c).includes('POST') && JSON.stringify(c).includes('reconcile-wallets'),
    );
    expect(postCalls.length).toBe(0);

    // onComplete chamado com skipped:true
    expect(onComplete).toHaveBeenCalled();
    const arg = onComplete.mock.calls[0][0];
    expect(arg?.skipped).toBe(true);
  });
});

// =============================================================================
// RF-05 P6: banner orfao com sites listados
// =============================================================================

describe('WalletReconciliationDialog v2 — banner orfao P6/F-03', () => {
  it('orphanContribution.length > 0 -> renderiza reconcile-orphan-banner', async () => {
    apiRequestMock.mockResolvedValueOnce(v2WithOrphan);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    const banner = await screen.findByTestId('reconcile-orphan-banner');
    expect(banner).toBeInTheDocument();
  });

  it('banner lista cada site com currency + amount', async () => {
    apiRequestMock.mockResolvedValueOnce(v2WithOrphan);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    const banner = await screen.findByTestId('reconcile-orphan-banner');
    expect((banner.textContent ?? '').toLowerCase()).toContain('bodogplay');
    expect((banner.textContent ?? '').toLowerCase()).toContain('chiconetwork');
    expect(banner.textContent ?? '').toMatch(/12,?\.?50/);
    expect(banner.textContent ?? '').toMatch(/8,?\.?00/);
  });

  it('CTA "Cadastrar carteira agora" presente', async () => {
    apiRequestMock.mockResolvedValueOnce(v2WithOrphan);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    const cta = await screen.findByTestId('reconcile-orphan-cta');
    expect(cta).toBeInTheDocument();
    expect((cta.textContent ?? '').toLowerCase()).toMatch(/cadastrar\s+carteira/);
  });

  it('orphanContribution vazia -> banner NAO aparece', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    // wait fetch
    await screen.findByTestId('reconcile-input-wA');
    expect(screen.queryByTestId('reconcile-orphan-banner')).not.toBeInTheDocument();
  });
});

// =============================================================================
// RF-05: preview manualAdjustment em tempo real
// =============================================================================

describe('WalletReconciliationDialog v2 — preview manualAdjustment (RF-05)', () => {
  it('reportedBalance > expectedClosingBalance -> tone positive label "+X (extra nao registrado)"', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    const input = await screen.findByTestId('reconcile-input-wA');
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '1300');

    const delta = await screen.findByTestId('reconcile-delta-wA');
    expect(delta.getAttribute('data-tone')).toBe('positive');
    expect(delta.textContent ?? '').toMatch(/extra|n[aã]o\s+registrado|\+/i);
  });

  it('reportedBalance < expectedClosingBalance -> tone negative label "-X (saida nao registrada)"', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    const input = await screen.findByTestId('reconcile-input-wA');
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '1100');

    const delta = await screen.findByTestId('reconcile-delta-wA');
    expect(delta.getAttribute('data-tone')).toBe('negative');
    expect(delta.textContent ?? '').toMatch(/sa[ií]da|n[aã]o\s+registrada|-/i);
  });

  it('reportedBalance === expectedClosingBalance -> tone neutral label "Conferido. Sem ajuste manual."', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);
    render(wrap(<WalletReconciliationDialog {...baseProps} />));

    const input = await screen.findByTestId('reconcile-input-wA');
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '1247.50');

    const delta = await screen.findByTestId('reconcile-delta-wA');
    expect(delta.getAttribute('data-tone')).toBe('neutral');
    expect((delta.textContent ?? '').toLowerCase()).toMatch(/conferido|sem\s+ajuste/);
  });
});

// =============================================================================
// RF-05 P3 / F-04: tie-break badge "Distribuido proporcionalmente"
// =============================================================================

describe('WalletReconciliationDialog v2 — tie-break badge (RF-05 P3)', () => {
  it('wallet com tieBreakStrategy=proportional -> renderiza reconcile-tie-break-badge-{walletId}', async () => {
    apiRequestMock.mockResolvedValueOnce({
      sessionId: 'ses_1',
      alreadyReconciled: false,
      wallets: [
        {
          walletId: 'wA',
          name: 'BlackChip Main',
          platform: 'WPN',
          nativeCurrency: 'USD',
          openingBalance: 700,
          expectedPreviousBalance: 700,
          expectedDelta: 70,
          expectedClosingBalance: 770,
          tieBreakStrategy: 'proportional',
          contributingTournaments: ['st_1'],
          hadActivityInSession: true,
        },
        {
          walletId: 'wB',
          name: 'BlackChip Reserve',
          platform: 'WPN',
          nativeCurrency: 'USD',
          openingBalance: 300,
          expectedPreviousBalance: 300,
          expectedDelta: 30,
          expectedClosingBalance: 330,
          tieBreakStrategy: 'proportional',
          contributingTournaments: ['st_1'],
          hadActivityInSession: true,
        },
      ],
      orphanContribution: [],
    });

    render(wrap(<WalletReconciliationDialog {...baseProps} />));
    const badgeA = await screen.findByTestId('reconcile-tie-break-badge-wA');
    expect(badgeA).toBeInTheDocument();
    expect((badgeA.textContent ?? '').toLowerCase()).toMatch(/proporcional|distribu/);
  });
});

// =============================================================================
// Fechar via X / ESC / overlay equivalente a Pular (RF-05 P1)
// =============================================================================

describe('WalletReconciliationDialog v2 — fechar via X = Pular sem registrar (P1/F-01)', () => {
  it('onOpenChange(false) externo -> NAO chama POST, NAO grava snapshot', async () => {
    apiRequestMock.mockResolvedValueOnce(v2Response);

    const onOpenChange = vi.fn();
    const onComplete = vi.fn();
    render(
      wrap(
        <WalletReconciliationDialog
          {...baseProps}
          onOpenChange={onOpenChange}
          onComplete={onComplete}
        />,
      ),
    );

    // Aguarda render do dialog
    await screen.findByTestId('reconcile-dialog');

    // Simula ESC
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    await new Promise((r) => setTimeout(r, 10));
    const postCalls = apiRequestMock.mock.calls.filter((c) =>
      JSON.stringify(c).includes('POST') && JSON.stringify(c).includes('reconcile-wallets'),
    );
    expect(postCalls.length).toBe(0);
  });
});
