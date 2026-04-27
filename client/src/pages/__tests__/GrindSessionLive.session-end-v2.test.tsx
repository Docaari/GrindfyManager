/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-01: reset alarmes em endSessionMutation.onSuccess + summary in-place
 *  - RF-04: handleEndSession invoca runSessionEndFlow refatorado
 *  - RF-08: summaryData.sessionId presente
 *  - RF-10: alertsSuspended derivada de 3 estados
 *  - RF-13: skip ConfirmationModal sem pendentes (P7)
 *
 * Estrategia (alinhada com reconciliation-flow.test.tsx existente): testar a
 * funcao pura runSessionEndFlow + helpers refatorados em vez de re-renderizar
 * o componente inteiro. O implementer extrai as branches descritas abaixo
 * para helpers exportaveis.
 *
 * Helpers/funcoes esperados pelo implementer (NAO existem ainda):
 *   client/src/components/grind-session-live/session-end-flow.ts  (atualizado)
 *     - runSessionEndFlowV2 — orquestrador refatorado:
 *         * NAO recebe mais completeSession (PUT vive em endSessionMutation).
 *         * Recebe wallets pre-fetched (apos PUT) e decide:
 *             - alreadyReconciled -> toast + setLocation('/grind')
 *             - wallets.length === 0 -> setLocation('/grind') direto
 *             - wallets.length > 0 -> openReconcileDialog -> depois
 *               setLocation('/grind') (NAO summary)
 *
 *   client/src/components/grind-session-live/session-end-helpers.ts (atualizado)
 *     - createEndSessionOnSuccess(deps) — factory que retorna o callback do
 *       endSessionMutation.onSuccess. Reseta alarmes + setSessionSummaryData
 *       (com sessionId) + setShowSessionSummary(true). NAO setLocation.
 *     - shouldSkipConfirmationModal(pendingTournaments): boolean (P7)
 *     - deriveAlertsSuspended({showSessionSummary, showReconcileDialog,
 *                              showConfirmationModal}): boolean (RF-10)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEndSessionOnSuccess,
  shouldSkipConfirmationModal,
  deriveAlertsSuspended,
} from '../../components/grind-session-live/session-end-helpers';
import { runSessionEndFlowV2 } from '../../components/grind-session-live/session-end-flow';

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// RF-01 — endSessionMutation.onSuccess: reset alarmes + open summary in-place
// =============================================================================

function makeEndSessionDeps(overrides: any = {}) {
  return {
    activeSessionId: 'ses_1',
    sessionAlertManagerRef: { current: { reset: vi.fn() } },
    setGenericAlerts: vi.fn(),
    setFiredGenericAlerts: vi.fn(),
    setActiveAlertCount: vi.fn(),
    setSessionSummaryData: vi.fn(),
    setShowSessionSummary: vi.fn(),
    setLocation: vi.fn(),
    queryClient: { invalidateQueries: vi.fn() },
    toast: vi.fn(),
    sessionStats: {
      volume: 5,
      invested: 50,
      profit: 100,
      roi: 50,
      fts: 1,
      wins: 0,
      mentalAverages: { focus: 8, energy: 7, confidence: 8, emotionalIntelligence: 8, interference: 2 },
      objectiveStatus: 'completed',
      sessionTime: '02:00',
      objectives: 'foo',
      quickNotes: [],
    },
    ...overrides,
  };
}

describe('endSessionMutation.onSuccess — reset alarmes (RF-01)', () => {
  it('reseta sessionAlertManagerRef.current.reset() exatamente 1x', () => {
    const deps = makeEndSessionDeps();
    const onSuccess = createEndSessionOnSuccess(deps);
    onSuccess();
    expect(deps.sessionAlertManagerRef.current.reset).toHaveBeenCalledTimes(1);
  });

  it('seta genericAlerts=[] e firedGenericAlerts=[]', () => {
    const deps = makeEndSessionDeps();
    const onSuccess = createEndSessionOnSuccess(deps);
    onSuccess();
    expect(deps.setGenericAlerts).toHaveBeenCalledWith([]);
    expect(deps.setFiredGenericAlerts).toHaveBeenCalledWith([]);
  });

  it('seta activeAlertCount=0', () => {
    const deps = makeEndSessionDeps();
    const onSuccess = createEndSessionOnSuccess(deps);
    onSuccess();
    expect(deps.setActiveAlertCount).toHaveBeenCalledWith(0);
  });
});

describe('endSessionMutation.onSuccess — abre summary in-place (RF-01, P3 fix bug P2)', () => {
  it('seta showSessionSummary=true sem setLocation', () => {
    const deps = makeEndSessionDeps();
    const onSuccess = createEndSessionOnSuccess(deps);
    onSuccess();

    expect(deps.setShowSessionSummary).toHaveBeenCalledWith(true);
    expect(deps.setLocation).not.toHaveBeenCalled();
  });

  it('summaryData inclui sessionId === activeSessionId (RF-08, fix bug P3)', () => {
    const deps = makeEndSessionDeps();
    const onSuccess = createEndSessionOnSuccess(deps);
    onSuccess();

    expect(deps.setSessionSummaryData).toHaveBeenCalledTimes(1);
    const summaryData = (deps.setSessionSummaryData as any).mock.calls[0][0];
    expect(summaryData.sessionId).toBe('ses_1');
  });

  it('summaryData propaga campos de stats (volume, profit, mentalAverages)', () => {
    const deps = makeEndSessionDeps();
    const onSuccess = createEndSessionOnSuccess(deps);
    onSuccess();

    const summaryData = (deps.setSessionSummaryData as any).mock.calls[0][0];
    expect(summaryData.volume).toBe(5);
    expect(summaryData.profit).toBe(100);
    expect(summaryData.mentalAverages?.focus).toBe(8);
  });
});

// =============================================================================
// runSessionEndFlowV2 — apos summary "Finalizar Sessao", roda dialog (RF-04)
// =============================================================================

function makeRunFlowDeps(overrides: any = {}) {
  return {
    sessionId: 'ses_1',
    fetchReconcilable: vi.fn().mockResolvedValue({
      wallets: [
        {
          walletId: 'wA',
          name: 'BlackChip Main',
          platform: 'WPN',
          nativeCurrency: 'USD',
          openingBalance: 1180,
          expectedPreviousBalance: 1180,
          expectedDelta: 67.5,
          expectedClosingBalance: 1247.5,
          contributingTournaments: ['st_1'],
          hadActivityInSession: true,
        },
      ],
      alreadyReconciled: false,
      orphanContribution: [],
    }),
    openReconcileDialog: vi.fn().mockResolvedValue(undefined),
    setLocation: vi.fn(),
    toast: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

describe('runSessionEndFlowV2 — fluxo summary -> reconcile (RF-04)', () => {
  it('wallets.length > 0 -> openReconcileDialog chamado', async () => {
    const deps = makeRunFlowDeps();
    await runSessionEndFlowV2(deps);
    expect(deps.openReconcileDialog).toHaveBeenCalledTimes(1);
  });

  it('apos dialog, setLocation("/grind") chamado', async () => {
    const deps = makeRunFlowDeps();
    await runSessionEndFlowV2(deps);
    expect(deps.setLocation).toHaveBeenCalledWith('/grind');
  });

  it('wallets.length === 0 -> setLocation direto, NAO abre dialog', async () => {
    const deps = makeRunFlowDeps({
      fetchReconcilable: vi.fn().mockResolvedValue({
        wallets: [],
        alreadyReconciled: false,
        orphanContribution: [],
      }),
    });
    await runSessionEndFlowV2(deps);

    expect(deps.openReconcileDialog).not.toHaveBeenCalled();
    expect(deps.setLocation).toHaveBeenCalledWith('/grind');
  });

  it('alreadyReconciled=true -> toast + setLocation, NAO abre dialog', async () => {
    const deps = makeRunFlowDeps({
      fetchReconcilable: vi.fn().mockResolvedValue({
        wallets: [],
        alreadyReconciled: true,
      }),
    });
    await runSessionEndFlowV2(deps);

    expect(deps.openReconcileDialog).not.toHaveBeenCalled();
    expect(deps.toast).toHaveBeenCalled();
    expect(deps.setLocation).toHaveBeenCalledWith('/grind');
  });

  it('fetchReconcilable falha -> toast + setLocation, NAO abre dialog', async () => {
    const deps = makeRunFlowDeps({
      fetchReconcilable: vi.fn().mockRejectedValue(new Error('GET failed')),
    });
    await runSessionEndFlowV2(deps);

    expect(deps.openReconcileDialog).not.toHaveBeenCalled();
    expect(deps.toast).toHaveBeenCalled();
    expect(deps.setLocation).toHaveBeenCalledWith('/grind');
  });
});

// =============================================================================
// RF-13 / P7 — Skip ConfirmationModal sem pendentes
// =============================================================================

describe('shouldSkipConfirmationModal — P7 / RF-01 paragrafo skip', () => {
  it('pendingTournaments=[] -> true (skip)', () => {
    expect(shouldSkipConfirmationModal([])).toBe(true);
  });

  it('pendingTournaments com 1 item -> false (renderiza modal)', () => {
    expect(shouldSkipConfirmationModal([{ id: 't1', status: 'registered' }])).toBe(false);
  });

  it('pendingTournaments com N itens -> false', () => {
    expect(
      shouldSkipConfirmationModal([
        { id: 't1', status: 'registered' },
        { id: 't2', status: 'registered' },
      ]),
    ).toBe(false);
  });
});

// =============================================================================
// RF-10 — alertsSuspended derivada
// =============================================================================

describe('deriveAlertsSuspended — RF-10', () => {
  it('todos modais false -> alertsSuspended=false', () => {
    expect(
      deriveAlertsSuspended({
        showSessionSummary: false,
        showReconcileDialog: false,
        showConfirmationModal: false,
      }),
    ).toBe(false);
  });

  it('showSessionSummary=true -> alertsSuspended=true', () => {
    expect(
      deriveAlertsSuspended({
        showSessionSummary: true,
        showReconcileDialog: false,
        showConfirmationModal: false,
      }),
    ).toBe(true);
  });

  it('showReconcileDialog=true -> alertsSuspended=true', () => {
    expect(
      deriveAlertsSuspended({
        showSessionSummary: false,
        showReconcileDialog: true,
        showConfirmationModal: false,
      }),
    ).toBe(true);
  });

  it('showConfirmationModal=true -> alertsSuspended=true', () => {
    expect(
      deriveAlertsSuspended({
        showSessionSummary: false,
        showReconcileDialog: false,
        showConfirmationModal: true,
      }),
    ).toBe(true);
  });

  it('multiplas flags true -> ainda true', () => {
    expect(
      deriveAlertsSuspended({
        showSessionSummary: true,
        showReconcileDialog: true,
        showConfirmationModal: true,
      }),
    ).toBe(true);
  });
});
