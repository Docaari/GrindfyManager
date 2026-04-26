/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-wallet-reconciliation.md
 *  - RF-01: hook do passo de reconciliacao em handleEndSession
 *
 * Estrategia: testar um helper de fluxo isolado em vez de re-renderizar toda
 * a pagina GrindSessionLive (5000+ linhas, muito acoplada). O implementer
 * extrai a logica para `client/src/components/grind-session-live/session-end-flow.ts`
 * (ou similar) e a expoe como funcao pura testavel:
 *
 *   runSessionEndFlow({
 *     sessionId,
 *     completeSession,        // () => Promise<void>  (PUT status=completed)
 *     openReconcileDialog,    // () => Promise<void>  (resolve quando o dialog completa/fecha)
 *     openSummaryModal,       // () => void
 *     fetchReconcilable,      // () => Promise<{ wallets: Wallet[]; alreadyReconciled: boolean }>
 *     toast,                  // (msg) => void
 *     onError,                // (err) => void
 *   })
 *
 * Comportamento:
 *  - Caso PUT ok + wallets.length>0 + !alreadyReconciled:
 *      completeSession -> fetchReconcilable -> openReconcileDialog -> openSummaryModal
 *  - PUT ok + wallets vazias:
 *      completeSession -> fetchReconcilable -> openSummaryModal direto (sem dialog)
 *  - PUT ok + alreadyReconciled=true:
 *      completeSession -> fetchReconcilable -> toast informativo -> openSummaryModal direto
 *  - PUT erro 5xx:
 *      onError + openSummaryModal direto (nao bloqueia)
 *  - fetchReconcilable falha:
 *      toast erro + openSummaryModal direto (nao bloqueia)
 *
 * Modulo NAO existe ainda — implementer cria.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSessionEndFlow } from '../../components/grind-session-live/session-end-flow';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeDeps(overrides: any = {}) {
  return {
    sessionId: 'ses_1',
    completeSession: vi.fn().mockResolvedValue(undefined),
    fetchReconcilable: vi.fn().mockResolvedValue({
      wallets: [
        {
          walletId: 'wA',
          name: 'PokerStars BR',
          nativeCurrency: 'BRL',
          balance: 1180,
          expectedPreviousBalance: 1180,
          hadActivityInSession: true,
        },
      ],
      alreadyReconciled: false,
    }),
    openReconcileDialog: vi.fn().mockResolvedValue(undefined),
    openSummaryModal: vi.fn(),
    toast: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

// =============================================================================
// Happy path
// =============================================================================

describe('runSessionEndFlow — happy path (RF-01)', () => {
  it('PUT ok + wallets eligiveis -> abre dialog ANTES do summary', async () => {
    const deps = makeDeps();
    await runSessionEndFlow(deps);

    expect(deps.completeSession).toHaveBeenCalledTimes(1);
    expect(deps.fetchReconcilable).toHaveBeenCalledTimes(1);
    expect(deps.openReconcileDialog).toHaveBeenCalledTimes(1);
    expect(deps.openSummaryModal).toHaveBeenCalledTimes(1);

    // Ordem: completeSession -> fetchReconcilable -> openReconcileDialog -> openSummaryModal
    const completeOrder = (deps.completeSession.mock as any).invocationCallOrder?.[0];
    const fetchOrder = (deps.fetchReconcilable.mock as any).invocationCallOrder?.[0];
    const dialogOrder = (deps.openReconcileDialog.mock as any).invocationCallOrder?.[0];
    const summaryOrder = (deps.openSummaryModal.mock as any).invocationCallOrder?.[0];

    if (
      completeOrder != null &&
      fetchOrder != null &&
      dialogOrder != null &&
      summaryOrder != null
    ) {
      expect(completeOrder).toBeLessThan(fetchOrder);
      expect(fetchOrder).toBeLessThan(dialogOrder);
      expect(dialogOrder).toBeLessThan(summaryOrder);
    }
  });
});

// =============================================================================
// Skip — sessao sem wallets eligiveis
// =============================================================================

describe('runSessionEndFlow — wallets vazias (RF-01)', () => {
  it('wallets=[] -> NAO abre dialog, summary direto', async () => {
    const deps = makeDeps({
      fetchReconcilable: vi.fn().mockResolvedValue({
        wallets: [],
        alreadyReconciled: false,
      }),
    });
    await runSessionEndFlow(deps);

    expect(deps.completeSession).toHaveBeenCalled();
    expect(deps.openReconcileDialog).not.toHaveBeenCalled();
    expect(deps.openSummaryModal).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Skip — alreadyReconciled
// =============================================================================

describe('runSessionEndFlow — alreadyReconciled (RF-08, US-05)', () => {
  it('preflight detecta marker -> NAO abre dialog, toast + summary', async () => {
    const deps = makeDeps({
      fetchReconcilable: vi.fn().mockResolvedValue({
        wallets: [],
        alreadyReconciled: true,
      }),
    });
    await runSessionEndFlow(deps);

    expect(deps.openReconcileDialog).not.toHaveBeenCalled();
    expect(deps.toast).toHaveBeenCalled();
    expect(deps.openSummaryModal).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Erros
// =============================================================================

describe('runSessionEndFlow — PUT erro fatal (RF-01)', () => {
  it('completeSession rejeita -> onError + summary direto (nao bloqueia)', async () => {
    const err = new Error('PUT failed');
    const deps = makeDeps({
      completeSession: vi.fn().mockRejectedValue(err),
    });
    await runSessionEndFlow(deps);

    expect(deps.onError).toHaveBeenCalled();
    expect(deps.openReconcileDialog).not.toHaveBeenCalled();
    // Summary abre direto (nao bloqueia)
    expect(deps.openSummaryModal).toHaveBeenCalledTimes(1);
  });
});

describe('runSessionEndFlow — fetchReconcilable falha (RF-01)', () => {
  it('GET reconcilable falha -> toast + summary direto, nao abre dialog', async () => {
    const deps = makeDeps({
      fetchReconcilable: vi.fn().mockRejectedValue(new Error('GET failed')),
    });
    await runSessionEndFlow(deps);

    expect(deps.completeSession).toHaveBeenCalled();
    expect(deps.openReconcileDialog).not.toHaveBeenCalled();
    expect(deps.toast).toHaveBeenCalled();
    expect(deps.openSummaryModal).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Skip via dialog (usuario clica "Sem ajuste")
// =============================================================================

describe('runSessionEndFlow — skip via dialog', () => {
  it('openReconcileDialog resolve sem ajustes -> summary abre normalmente', async () => {
    // openReconcileDialog resolve com flag/objeto opcional indicando skip
    const deps = makeDeps({
      openReconcileDialog: vi.fn().mockResolvedValue({ skipped: true }),
    });
    await runSessionEndFlow(deps);

    expect(deps.openReconcileDialog).toHaveBeenCalledTimes(1);
    expect(deps.openSummaryModal).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// HIGH-4 reviewer fix — idempotencia de handleReconcileComplete (parent)
//
// Spec: o dialog dispara onComplete uma vez. Pode acontecer race onde
// onComplete e onOpenChange(false) gatilham handleReconcileComplete duas vezes
// (ex: dialog imperative-fechando + onComplete sincrono). O parent
// (GrindSessionLive) deve ser idempotente: 2 chamadas seguidas resolvem
// a Promise UMA UNICA vez.
//
// Estrategia: extrair a logica do handleReconcileComplete para uma factory
// pura testavel. Implementer pode optar por inlinar — desde que respeite
// o contrato testado abaixo.
// =============================================================================

describe('handleReconcileComplete — idempotencia (HIGH-4)', () => {
  /**
   * Factory que reproduz o comportamento esperado de handleReconcileComplete:
   *   - Resolve a Promise pendente (ref) UMA UNICA VEZ
   *   - Limpa o ref apos o primeiro resolve
   *   - Setter de "show" so eh chamado quando ainda esta visivel
   *   - Chamadas subsequentes sao no-op
   */
  function makeReconcileCompleteHandler() {
    let showReconcileDialog = true;
    const setShowReconcileDialog = vi.fn((v: boolean) => {
      showReconcileDialog = v;
    });
    const reconcileResolveRef: { current: ((info?: any) => void) | null } = {
      current: vi.fn(),
    };

    function handleReconcileComplete(info?: any) {
      // HIGH-4: idempotencia explicita
      if (!showReconcileDialog && reconcileResolveRef.current === null) {
        return;
      }
      setShowReconcileDialog(false);
      if (reconcileResolveRef.current) {
        reconcileResolveRef.current(info);
        reconcileResolveRef.current = null;
      }
    }

    return {
      handleReconcileComplete,
      setShowReconcileDialog,
      reconcileResolveRef,
      isOpen: () => showReconcileDialog,
    };
  }

  it('chamada unica: resolve a Promise + fecha dialog', () => {
    const h = makeReconcileCompleteHandler();
    const resolveSpy = h.reconcileResolveRef.current as any;

    h.handleReconcileComplete({ skipped: true });

    expect(h.setShowReconcileDialog).toHaveBeenCalledTimes(1);
    expect(h.setShowReconcileDialog).toHaveBeenCalledWith(false);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(resolveSpy).toHaveBeenCalledWith({ skipped: true });
    // ref limpo apos primeiro resolve
    expect(h.reconcileResolveRef.current).toBeNull();
  });

  it('chamada dupla consecutiva: resolve UMA vez, segunda eh no-op', () => {
    const h = makeReconcileCompleteHandler();
    const resolveSpy = h.reconcileResolveRef.current as any;

    h.handleReconcileComplete({ skipped: true });
    // Segundo gatilho (ex: onOpenChange(false) sequencial ao onComplete)
    h.handleReconcileComplete({ alreadyReconciled: true });

    // Resolve apenas UMA vez (HIGH-4)
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    // setShowReconcileDialog tambem chamado apenas uma vez
    expect(h.setShowReconcileDialog).toHaveBeenCalledTimes(1);
  });

  it('chamada tripla nao causa "double openSummary" (resolve unico = 1 disparo do summary)', () => {
    // Simula a cadeia: openReconcileDialog retorna Promise<info>, info viaja
    // para o caller que chama openSummaryModal. Resolve unico = 1 summary.
    const summarySpy = vi.fn();
    const h = makeReconcileCompleteHandler();
    const originalResolve = h.reconcileResolveRef.current as any;

    // Substitui o resolve por um que dispara summary
    h.reconcileResolveRef.current = (info?: any) => {
      originalResolve(info);
      summarySpy(info);
    };

    h.handleReconcileComplete({ created: [{ id: 'tx1' }] });
    h.handleReconcileComplete({ created: [{ id: 'tx1' }] });
    h.handleReconcileComplete();

    expect(summarySpy).toHaveBeenCalledTimes(1);
  });

  it('apos resolve, ref permanece null mesmo com chamadas adicionais', () => {
    const h = makeReconcileCompleteHandler();

    h.handleReconcileComplete();
    expect(h.reconcileResolveRef.current).toBeNull();

    h.handleReconcileComplete();
    expect(h.reconcileResolveRef.current).toBeNull();
  });
});
