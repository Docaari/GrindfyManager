/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Feature: Ajuste manual do resultado final da sessao (grind-live)
 * Spec:  Docs/specs/grind-live-manual-session-result.md (RF-02, RF-03, RF-04, RF-05)
 * ADR:   Docs/architecture/decisions/244-grind-live-manual-session-result.md (D1, D3, D5)
 * Fluxo: Docs/architecture/diagrams/grind-live-manual-session-result/
 *          finalize-with-manual-result-sequence.mermaid
 *          manual-result-value-decision-flow.mermaid
 *
 * COMPONENTE SOB TESTE: client/src/components/grind-session-live/SessionSummaryModal.tsx
 *
 * -----------------------------------------------------------------------------
 * CONTRATO NOVO exigido do implementer (nada disso existe ainda)
 * -----------------------------------------------------------------------------
 * 1. Prop nova, no mesmo padrao de `bankrollManagementEnabled` (gate `!== false`,
 *    fail-open: undefined = ON):
 *      manualResultEnabled?: boolean
 *
 * 2. Callback estendido — o override precisa carregar profit E roi, porque
 *    `walletProfitUsd` sozinho nao descreve o resultado (D1 sobrescreve os tres
 *    campos do PUT):
 *      onEndSession(
 *        walletProfitUsd?: number,
 *        manualOverride?: { profitUsd: number; roi: number | null } | null,
 *      ): void
 *    - SEM ajuste: chamada IDENTICA a de hoje —
 *        onEndSession(showProfitCard ? totalProfitUSD : undefined)
 *      e o 2o argumento ausente/undefined/null (nao-regressao, RNF).
 *    - COM ajuste: onEndSession(manualProfitUsd, { profitUsd, roi }) — o 1o
 *      argumento tambem vira o valor manual, INCLUSIVE sem wallets (D1:
 *      walletProfitUsd = resultado manual "mesmo sem wallets").
 *
 * 3. data-testid estaveis (lesson #2). Os cinco da spec §Notas de Implementacao:
 *      manual-session-result-toggle   (acao "Ajustar")
 *      manual-session-result-input    (<input type="number" step="0.01">)
 *      manual-session-result-reset    (acao "Desfazer ajuste")
 *      manual-session-result-error    (erro de validacao, role="alert")
 *      session-result-adjusted-badge  (rotulo "ajustado manualmente")
 *    + tres necessarios para asserir os cards SEM heuristica de DOM por texto
 *      (o grid "Estatisticas da Sessao" hoje nao tem nenhum testid):
 *      summary-stat-invested   (card "Investido"  — NUNCA muda)
 *      summary-stat-profit     (card "Profit")
 *      summary-stat-roi        (card "ROI")
 *
 * 4. Helper puro `computeAdjustedResult` de `../manual-session-result` faz a
 *    matematica. Nada de calculo inline no JSX (RF-03).
 *
 * -----------------------------------------------------------------------------
 * Notas tecnicas
 * -----------------------------------------------------------------------------
 * - Componentes carregados via `await import(...)`, nunca `require()`
 *   (lessons #14/#26). Este arquivo NAO mistura os dois estilos (lesson #38).
 * - `apiRequest` devolve JSON ja parseado (lesson #13) — o mock resolve objeto,
 *   nao Response.
 * - jsdom aplica value sanitization em `<input type="number">`: escrever "abc"
 *   ou "-" resulta em `e.target.value === ""`. Os testes desses casos, na
 *   pratica, exercitam o mesmo caminho do campo vazio — o que importa e que
 *   nenhum deles pode virar 0. O caso nao-finito REAL e "1e999" (literal
 *   numerico valido para o input, `Number(...) === Infinity`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: any[]) => trackMock(...args),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/grind/active', vi.fn()],
  Link: ({ children }: any) => children,
}));

// -----------------------------------------------------------------------------
// Fixtures — shape REAL de summaryData (GrindSessionLive.generateSessionSummary)
// e de reconcilableWallets (GET /reconcilable-wallets). Lesson #3.
// -----------------------------------------------------------------------------

const baseSummary = {
  sessionId: 'ses_1',
  volume: 10,
  invested: 1000,
  profit: 180,
  roi: 18,
  fts: 2,
  wins: 1,
  bestResult: null,
  breaksRecorded: 1,
  mentalAverages: {
    focus: 8,
    energy: 7,
    confidence: 8,
    emotionalIntelligence: 8,
    interference: 2,
  },
  objectiveStatus: 'completed',
  sessionTime: '04:00',
  objectives: '',
  quickNotes: [],
  endTime: '2026-08-01T22:00:00Z',
  abiMed: 100,
  duration: 240,
};

const walletUsd = {
  walletId: 'w_acr',
  name: 'ACR Main',
  platform: 'ACR',
  nativeCurrency: 'USD',
  expectedPreviousBalance: 1000,
  expectedDelta: 180,
  expectedClosingBalance: 1180,
  hadActivityInSession: true,
  contributingTournaments: ['st_1'],
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function loadModal() {
  const mod = await import('../SessionSummaryModal');
  return mod.default;
}

function makeProps(overrides: any = {}) {
  return {
    show: true,
    summaryData: baseSummary,
    finalNotes: '',
    setFinalNotes: vi.fn(),
    onContinueSession: vi.fn(),
    onEndSession: vi.fn(),
    bankrollManagementEnabled: true,
    reconcilableWallets: [],
    missingPlatforms: [],
    usdConversionRates: { BRL: 5.2 },
    manualResultEnabled: true,
    ...overrides,
  };
}

/** Abre o campo de ajuste e digita `value` (string crua, como o usuario). */
function openAndType(value: string) {
  fireEvent.click(screen.getByTestId('manual-session-result-toggle'));
  const input = screen.getByTestId('manual-session-result-input');
  fireEvent.change(input, { target: { value } });
  return input as HTMLInputElement;
}

beforeEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({});
  toastMock.mockClear();
  trackMock.mockClear();
});

// =============================================================================
// RF-02 — gate pela preferencia (D3, fail-open)
// =============================================================================

describe('RF-02 — campo de ajuste gateado por manualResultEnabled', () => {
  it('preferencia OFF: manual-session-result-toggle NAO existe no DOM', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ manualResultEnabled: false })} />));
    expect(screen.queryByTestId('manual-session-result-toggle')).toBeNull();
  });

  it('preferencia OFF: manual-session-result-input NAO existe no DOM (criterio RF-02)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ manualResultEnabled: false })} />));
    expect(screen.queryByTestId('manual-session-result-input')).toBeNull();
  });

  it('preferencia OFF: badge de ajuste NAO existe (zero diff visual)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ manualResultEnabled: false })} />));
    expect(screen.queryByTestId('session-result-adjusted-badge')).toBeNull();
  });

  it('preferencia ON: manual-session-result-toggle renderiza', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ manualResultEnabled: true })} />));
    expect(screen.getByTestId('manual-session-result-toggle')).toBeTruthy();
  });

  it('preferencia undefined (settings carregando / 404): renderiza — fail-open ON', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ manualResultEnabled: undefined })} />));
    expect(screen.queryByTestId('manual-session-result-toggle')).not.toBeNull();
  });

  it('campo comeca FECHADO: input so aparece apos acionar "Ajustar"', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps()} />));
    expect(screen.queryByTestId('manual-session-result-input')).toBeNull();
    fireEvent.click(screen.getByTestId('manual-session-result-toggle'));
    expect(screen.getByTestId('manual-session-result-input')).toBeTruthy();
  });
});

// =============================================================================
// RF-02 — pre-preenchimento (base calculada)
// =============================================================================

describe('RF-02 — valor pre-preenchido vem da base calculada', () => {
  it('COM wallets reconciliaveis: pre-preenche com totalProfitUSD (card "Lucro Total da Sessao")', async () => {
    const Modal = await loadModal();
    // totalProfitUSD = reported(1180, default = expectedClosingBalance) - opening(1000) = 180
    render(
      wrap(<Modal {...makeProps({ reconcilableWallets: [walletUsd] })} />),
    );
    fireEvent.click(screen.getByTestId('manual-session-result-toggle'));
    const input = screen.getByTestId('manual-session-result-input') as HTMLInputElement;
    expect(Number(input.value)).toBeCloseTo(180, 2);
  });

  it('COM wallets: pre-preenchimento acompanha o saldo digitado (base dinamica)', async () => {
    const Modal = await loadModal();
    render(
      wrap(<Modal {...makeProps({ reconcilableWallets: [walletUsd] })} />),
    );
    // Saldo reportado 1300 -> totalProfitUSD = 1300 - 1000 = 300.
    fireEvent.change(screen.getByTestId('wallet-balance-input-w_acr'), {
      target: { value: '1300' },
    });
    fireEvent.click(screen.getByTestId('manual-session-result-toggle'));
    const input = screen.getByTestId('manual-session-result-input') as HTMLInputElement;
    expect(Number(input.value)).toBeCloseTo(300, 2);
  });

  it('SEM wallets: pre-preenche com summaryData.profit (card "Profit")', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    fireEvent.click(screen.getByTestId('manual-session-result-toggle'));
    const input = screen.getByTestId('manual-session-result-input') as HTMLInputElement;
    expect(Number(input.value)).toBeCloseTo(180, 2);
  });

  it('SEM wallets, base negativa: pre-preenche com o prejuizo calculado', async () => {
    const Modal = await loadModal();
    render(
      wrap(
        <Modal
          {...makeProps({
            reconcilableWallets: [],
            summaryData: { ...baseSummary, profit: -430.25 },
          })}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId('manual-session-result-toggle'));
    const input = screen.getByTestId('manual-session-result-input') as HTMLInputElement;
    expect(Number(input.value)).toBeCloseTo(-430.25, 2);
  });

  it('input e numerico com step 0.01 (aceita decimais e negativo)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps()} />));
    fireEvent.click(screen.getByTestId('manual-session-result-toggle'));
    const input = screen.getByTestId('manual-session-result-input') as HTMLInputElement;
    expect(input.getAttribute('type')).toBe('number');
    expect(input.getAttribute('step')).toBe('0.01');
  });
});

// =============================================================================
// RF-02 / RF-03 — cards refletem o ajuste; Investido NUNCA muda
// =============================================================================

describe('RF-03 — cards de resultado e ROI refletem o ajuste', () => {
  it('SEM wallets: digitar -120.5 exibe -$120.50 no card Profit (criterio RF-02)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('-120.5');
    expect(screen.getByTestId('summary-stat-profit').textContent).toContain('120.50');
  });

  it('SEM wallets: digitar -120.5 mostra o card Profit com sinal negativo', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('-120.5');
    expect(screen.getByTestId('summary-stat-profit').textContent).toContain('-');
  });

  it('SEM wallets: ROI recalcula para ~-12% (manual -120.5 / investido 1000)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('-120.5');
    // -120.5 / 1000 * 100 = -12.05. A exibicao arredonda a 1 casa, e -12.05 em
    // ponto flutuante pode sair "-12.0" ou "-12.1" no toFixed(1). O contrato que
    // importa e "deixou de ser +18.0 e virou ~-12" — asserimos o prefixo estavel.
    expect(screen.getByTestId('summary-stat-roi').textContent).toContain('-12.');
  });

  it('SEM wallets: digitar +250 recalcula ROI para +25.0%', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    expect(screen.getByTestId('summary-stat-roi').textContent).toContain('25.0');
  });

  it('Investido NAO muda com o ajuste (invariante RF-03)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    const before = screen.getByTestId('summary-stat-invested').textContent;
    openAndType('9999');
    expect(screen.getByTestId('summary-stat-invested').textContent).toBe(before);
  });

  it('Investido NAO muda nem com ajuste negativo enorme', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('-50000');
    expect(screen.getByTestId('summary-stat-invested').textContent).toContain('1000.00');
  });

  it('COM wallets: o card "Lucro Total da Sessao" passa a exibir o valor ajustado', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [walletUsd] })} />));
    openAndType('420.75');
    expect(screen.getByTestId('session-total-profit-card').textContent).toContain('420.75');
  });

  it('badge "ajustado manualmente" aparece quando ha ajuste ativo', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    expect(screen.getByTestId('session-result-adjusted-badge')).toBeTruthy();
  });

  it('badge NAO aparece antes de qualquer ajuste', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    expect(screen.queryByTestId('session-result-adjusted-badge')).toBeNull();
  });

  it('investido 0: ROI exibe "—" e NUNCA 0% (criterio RF-03 / D4)', async () => {
    const Modal = await loadModal();
    render(
      wrap(
        <Modal
          {...makeProps({
            reconcilableWallets: [],
            summaryData: { ...baseSummary, invested: 0, roi: 0 },
          })}
        />,
      ),
    );
    openAndType('50');
    const roiText = screen.getByTestId('summary-stat-roi').textContent ?? '';
    expect(roiText).toContain('—');
    expect(roiText).not.toContain('0.0%');
  });
});

// =============================================================================
// RF-02 — "Desfazer ajuste"
// =============================================================================

describe('RF-02 — desfazer ajuste restaura o calculado', () => {
  it('clicar em manual-session-result-reset remove o badge de ajuste', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    expect(screen.getByTestId('session-result-adjusted-badge')).toBeTruthy();
    fireEvent.click(screen.getByTestId('manual-session-result-reset'));
    expect(screen.queryByTestId('session-result-adjusted-badge')).toBeNull();
  });

  it('apos desfazer, o card Profit volta ao valor calculado (180)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    fireEvent.click(screen.getByTestId('manual-session-result-reset'));
    expect(screen.getByTestId('summary-stat-profit').textContent).toContain('180.00');
  });

  it('apos desfazer, o ROI volta ao calculado (+18.0%)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('250');
    fireEvent.click(screen.getByTestId('manual-session-result-reset'));
    expect(screen.getByTestId('summary-stat-roi').textContent).toContain('18.0');
  });

  it('apos desfazer, finalizar NAO propaga override (2o argumento vazio)', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    render(
      wrap(<Modal {...makeProps({ reconcilableWallets: [], onEndSession })} />),
    );
    openAndType('250');
    fireEvent.click(screen.getByTestId('manual-session-result-reset'));
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(onEndSession.mock.calls[0][1] ?? null).toBeNull();
  });

  it('apos desfazer, o erro de validacao (se havia) some', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('');
    expect(screen.getByTestId('manual-session-result-error')).toBeTruthy();
    fireEvent.click(screen.getByTestId('manual-session-result-reset'));
    expect(screen.queryByTestId('manual-session-result-error')).toBeNull();
  });
});

// =============================================================================
// RF-02 — validacao de input: invalido NUNCA vira 0
// =============================================================================

describe('RF-02 — validacao: entrada invalida bloqueia, nao vira 0', () => {
  it('campo vazio: exibe manual-session-result-error', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('');
    expect(screen.getByTestId('manual-session-result-error')).toBeTruthy();
  });

  it('campo vazio: erro tem role="alert" (RNF acessibilidade)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('');
    expect(
      screen.getByTestId('manual-session-result-error').getAttribute('role'),
    ).toBe('alert');
  });

  it('campo vazio: "Finalizar Sessao" fica desabilitado (criterio RF-02)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('');
    const cta = screen.getByTestId('cta-finalize-session') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it('campo vazio: clicar em Finalizar NAO chama onEndSession', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    render(
      wrap(<Modal {...makeProps({ reconcilableWallets: [], onEndSession })} />),
    );
    openAndType('');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onEndSession).not.toHaveBeenCalled();
  });

  it('campo vazio: card Profit NAO vira $0.00 (ausencia != zero)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('');
    const txt = screen.getByTestId('summary-stat-profit').textContent ?? '';
    expect(txt).not.toContain('$0.00');
  });

  it('"abc": erro visivel e CTA desabilitado (jsdom sanitiza para "" no number input)', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('abc');
    expect(screen.getByTestId('manual-session-result-error')).toBeTruthy();
    expect((screen.getByTestId('cta-finalize-session') as HTMLButtonElement).disabled).toBe(true);
  });

  it('"-" sozinho: erro visivel e CTA desabilitado', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('-');
    expect(screen.getByTestId('manual-session-result-error')).toBeTruthy();
    expect((screen.getByTestId('cta-finalize-session') as HTMLButtonElement).disabled).toBe(true);
  });

  it('"1e999" (Infinity): erro visivel e CTA desabilitado', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('1e999');
    expect(screen.getByTestId('manual-session-result-error')).toBeTruthy();
    expect((screen.getByTestId('cta-finalize-session') as HTMLButtonElement).disabled).toBe(true);
  });

  it('corrigir o valor reabilita "Finalizar Sessao"', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    const input = openAndType('');
    expect((screen.getByTestId('cta-finalize-session') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: '42' } });
    expect((screen.getByTestId('cta-finalize-session') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('manual-session-result-error')).toBeNull();
  });

  it('"0" e valor VALIDO (sessao que zerou) — sem erro, CTA habilitado', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('0');
    expect(screen.queryByTestId('manual-session-result-error')).toBeNull();
    expect((screen.getByTestId('cta-finalize-session') as HTMLButtonElement).disabled).toBe(false);
  });

  it('"-0.01" e aceito e exibido como prejuizo', async () => {
    const Modal = await loadModal();
    render(wrap(<Modal {...makeProps({ reconcilableWallets: [] })} />));
    openAndType('-0.01');
    expect(screen.queryByTestId('manual-session-result-error')).toBeNull();
    expect(screen.getByTestId('summary-stat-profit').textContent).toContain('0.01');
  });
});

// =============================================================================
// RF-04 — propagacao do valor para o finalize (onEndSession)
// =============================================================================

describe('RF-04 — onEndSession recebe o override quando ha ajuste', () => {
  it('SEM wallets + ajuste 300: 1o argumento = 300 (walletProfitUsd = manual, D1)', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    render(
      wrap(<Modal {...makeProps({ reconcilableWallets: [], onEndSession })} />),
    );
    openAndType('300');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(onEndSession.mock.calls[0][0]).toBe(300);
  });

  it('SEM wallets + ajuste 300 (investido 1000): override = { profitUsd: 300, roi: 30 }', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    render(
      wrap(<Modal {...makeProps({ reconcilableWallets: [], onEndSession })} />),
    );
    openAndType('300');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(onEndSession.mock.calls[0][1]).toEqual({ profitUsd: 300, roi: 30 });
  });

  it('COM wallets + ajuste: 1o argumento e o manual, NAO o totalProfitUSD calculado', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    render(
      wrap(
        <Modal
          {...makeProps({ reconcilableWallets: [walletUsd], onEndSession })}
        />,
      ),
    );
    openAndType('455');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(onEndSession.mock.calls[0][0]).toBe(455);
    expect(onEndSession.mock.calls[0][1]).toEqual({ profitUsd: 455, roi: 45.5 });
  });

  it('investido 0 + ajuste: override carrega roi null (nao 0)', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    render(
      wrap(
        <Modal
          {...makeProps({
            reconcilableWallets: [],
            onEndSession,
            summaryData: { ...baseSummary, invested: 0, roi: 0 },
          })}
        />,
      ),
    );
    openAndType('50');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(onEndSession.mock.calls[0][1]).toEqual({ profitUsd: 50, roi: null });
  });

  it('ajuste 0 (sessao zerada) propaga override com profitUsd 0 — nao e "sem ajuste"', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    render(
      wrap(<Modal {...makeProps({ reconcilableWallets: [], onEndSession })} />),
    );
    openAndType('0');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(onEndSession.mock.calls[0][1]).toEqual({ profitUsd: 0, roi: 0 });
  });
});

// =============================================================================
// RNF nao-regressao — SEM ajuste, a chamada e a de hoje
// =============================================================================

describe('nao-regressao — sem ajuste, onEndSession e chamado como hoje', () => {
  it('SEM wallets e sem ajuste: onEndSession(undefined) e sem override', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    render(
      wrap(<Modal {...makeProps({ reconcilableWallets: [], onEndSession })} />),
    );
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(onEndSession.mock.calls[0][0]).toBeUndefined();
    expect(onEndSession.mock.calls[0][1] ?? null).toBeNull();
  });

  it('COM wallets e sem ajuste: onEndSession(totalProfitUSD) e sem override', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    render(
      wrap(
        <Modal
          {...makeProps({ reconcilableWallets: [walletUsd], onEndSession })}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(onEndSession.mock.calls[0][0]).toBeCloseTo(180, 2);
    expect(onEndSession.mock.calls[0][1] ?? null).toBeNull();
  });

  it('preferencia OFF: onEndSession se comporta exatamente como hoje', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    render(
      wrap(
        <Modal
          {...makeProps({
            manualResultEnabled: false,
            reconcilableWallets: [walletUsd],
            onEndSession,
          })}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(onEndSession.mock.calls[0][0]).toBeCloseTo(180, 2);
    expect(onEndSession.mock.calls[0][1] ?? null).toBeNull();
  });
});

// =============================================================================
// RF-05 / D5 — o ajuste NAO toca a banca
// =============================================================================

describe('RF-05 — payload de reconcile-wallets ignora o valor manual', () => {
  it('com ajuste + saldo alterado: payload identico ao cenario sem ajuste', async () => {
    const Modal = await loadModal();
    render(
      wrap(<Modal {...makeProps({ reconcilableWallets: [walletUsd] })} />),
    );
    // Saldo digitado diferente do esperado -> reconcile e disparado.
    fireEvent.change(screen.getByTestId('wallet-balance-input-w_acr'), {
      target: { value: '1250' },
    });
    openAndType('999');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => {
      const call = apiRequestMock.mock.calls.find(
        (c: any[]) => typeof c[1] === 'string' && c[1].includes('/reconcile-wallets'),
      );
      expect(call).toBeDefined();
    });

    const call = apiRequestMock.mock.calls.find(
      (c: any[]) => typeof c[1] === 'string' && c[1].includes('/reconcile-wallets'),
    )!;
    // toEqual EXATO: nenhum campo novo pode aparecer no payload da banca.
    expect(call[2]).toEqual({
      adjustments: [
        {
          walletId: 'w_acr',
          reportedBalance: 1250,
          expectedPreviousBalance: 1000,
          expectedDelta: 180,
        },
      ],
    });
  });

  it('com ajuste e SEM alterar saldo: nenhuma chamada a /reconcile-wallets (skip preservado)', async () => {
    const Modal = await loadModal();
    render(
      wrap(<Modal {...makeProps({ reconcilableWallets: [walletUsd] })} />),
    );
    openAndType('999');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await new Promise((r) => setTimeout(r, 0));
    const reconcileCalls = apiRequestMock.mock.calls.filter(
      (c: any[]) => typeof c[1] === 'string' && c[1].includes('/reconcile-wallets'),
    );
    expect(reconcileCalls.length).toBe(0);
  });

  it('nenhuma chamada do modal carrega o valor manual em qualquer campo', async () => {
    const Modal = await loadModal();
    render(
      wrap(<Modal {...makeProps({ reconcilableWallets: [walletUsd] })} />),
    );
    fireEvent.change(screen.getByTestId('wallet-balance-input-w_acr'), {
      target: { value: '1250' },
    });
    openAndType('777.77');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    const serialized = JSON.stringify(apiRequestMock.mock.calls);
    expect(serialized).not.toContain('777.77');
  });
});

// =============================================================================
// Edge cases — hasMissing, 409 idempotente, preservacao pos-falha do PUT
// =============================================================================

describe('edge cases do ajuste', () => {
  it('hasMissing (plataforma sem wallet): finaliza com o valor manual mesmo assim', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    render(
      wrap(
        <Modal
          {...makeProps({
            reconcilableWallets: [],
            missingPlatforms: ['GGNetwork'],
            onEndSession,
          })}
        />,
      ),
    );
    openAndType('310');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(onEndSession.mock.calls[0][1]).toEqual({ profitUsd: 310, roi: 31 });
  });

  it('409 already_reconciled: finaliza normalmente com o valor manual', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    apiRequestMock.mockRejectedValue({
      response: { status: 409, data: { code: 'already_reconciled', existingCount: 1 } },
    });
    render(
      wrap(
        <Modal
          {...makeProps({ reconcilableWallets: [walletUsd], onEndSession })}
        />,
      ),
    );
    fireEvent.change(screen.getByTestId('wallet-balance-input-w_acr'), {
      target: { value: '1250' },
    });
    openAndType('88');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(onEndSession.mock.calls[0][1]).toEqual({ profitUsd: 88, roi: 8.8 });
  });

  it('PUT falha e o modal reabre: o valor digitado e PRESERVADO no campo (RF-04)', async () => {
    const Modal = await loadModal();
    const props = makeProps({ reconcilableWallets: [] });
    const { rerender } = render(wrap(<Modal {...props} />));
    openAndType('623.45');

    // GrindSessionLive fecha o summary antes do PUT e reabre em caso de erro.
    rerender(wrap(<Modal {...props} show={false} />));
    rerender(wrap(<Modal {...props} show={true} />));

    const input = screen.getByTestId('manual-session-result-input') as HTMLInputElement;
    expect(Number(input.value)).toBeCloseTo(623.45, 2);
  });

  it('PUT falha e o modal reabre: o badge "ajustado" continua visivel', async () => {
    const Modal = await loadModal();
    const props = makeProps({ reconcilableWallets: [] });
    const { rerender } = render(wrap(<Modal {...props} />));
    openAndType('623.45');

    rerender(wrap(<Modal {...props} show={false} />));
    rerender(wrap(<Modal {...props} show={true} />));

    expect(screen.getByTestId('session-result-adjusted-badge')).toBeTruthy();
  });

  it('usdConversionRates ausente: o ajuste manual continua funcionando (valor e USD)', async () => {
    const Modal = await loadModal();
    const onEndSession = vi.fn();
    render(
      wrap(
        <Modal
          {...makeProps({
            reconcilableWallets: [{ ...walletUsd, nativeCurrency: 'BRL' }],
            usdConversionRates: undefined,
            onEndSession,
          })}
        />,
      ),
    );
    openAndType('150');
    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => expect(onEndSession).toHaveBeenCalled());
    expect(onEndSession.mock.calls[0][1]).toEqual({ profitUsd: 150, roi: 15 });
  });
});
