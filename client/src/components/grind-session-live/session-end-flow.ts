/**
 * runSessionEndFlow — Sprint Session-End Reconciliation (RF-01)
 *
 * Spec: Docs/specs/session-end-wallet-reconciliation.md
 *
 * Orquestra o passo intermediario de reconciliacao entre o PUT
 * /api/grind-sessions/:id (status=completed) e a abertura do
 * SessionSummaryModal.
 *
 * Comportamento:
 *  1. completeSession (PUT). Em caso de erro fatal -> onError + summary direto.
 *  2. fetchReconcilable (GET reconcilable-wallets).
 *     - falha -> toast + summary direto.
 *     - alreadyReconciled=true -> toast informativo + summary direto.
 *     - wallets.length === 0 -> summary direto.
 *  3. openReconcileDialog -> aguarda usuario interagir; resolve com
 *     { skipped?, alreadyReconciled?, created? } ou void.
 *  4. openSummaryModal sempre executa ao final (nao-bloqueante).
 */

export interface ReconcileWalletEntry {
  walletId: string;
  name?: string;
  nativeCurrency?: string;
  balance?: number;
  expectedPreviousBalance?: number;
  hadActivityInSession?: boolean;
  [key: string]: any;
}

export interface FetchReconcilableResult {
  wallets: ReconcileWalletEntry[];
  alreadyReconciled: boolean;
}

export interface RunSessionEndFlowDeps {
  sessionId: string;
  completeSession: () => Promise<void>;
  fetchReconcilable: () => Promise<FetchReconcilableResult>;
  openReconcileDialog: () => Promise<{ skipped?: boolean; alreadyReconciled?: boolean; created?: any[] } | void>;
  openSummaryModal: () => void;
  toast: (msg: any) => void;
  onError: (err: unknown) => void;
}

// =============================================================================
// V2 — runSessionEndFlowV2 (Spec session-end-reconciliation-v2)
// =============================================================================

import { emitReconcileSkippedNoWallets } from "@/lib/session-end/telemetry";

export interface RunSessionEndFlowV2Deps {
  sessionId: string;
  fetchReconcilable: () => Promise<{
    wallets: ReconcileWalletEntry[];
    alreadyReconciled: boolean;
    orphanContribution?: any[];
  }>;
  openReconcileDialog: () => Promise<any>;
  setLocation: (path: string) => void;
  toast: (msg: any) => void;
  onError?: (err: unknown) => void;
}

/**
 * runSessionEndFlowV2 — RF-04 (apos summary "Finalizar Sessao" clicked).
 *
 * 1. fetchReconcilable. Falha -> toast + setLocation('/grind').
 * 2. alreadyReconciled=true -> toast + setLocation('/grind').
 * 3. wallets=[] -> emit reconcile_skipped_no_wallets + setLocation('/grind').
 * 4. wallets>0 -> openReconcileDialog -> setLocation('/grind').
 *
 * NAO chama summary modal (summary ja foi aberto pelo endSessionMutation.onSuccess).
 */
export async function runSessionEndFlowV2(deps: RunSessionEndFlowV2Deps): Promise<void> {
  let reconcilable: { wallets: ReconcileWalletEntry[]; alreadyReconciled: boolean };
  try {
    reconcilable = await deps.fetchReconcilable();
  } catch (err) {
    deps.toast({
      title: "Nao foi possivel carregar carteiras para reconciliacao",
      variant: "destructive",
    });
    if (deps.onError) deps.onError(err);
    deps.setLocation("/grind");
    return;
  }

  if (reconcilable.alreadyReconciled) {
    deps.toast({ title: "Esta sessao ja foi reconciliada anteriormente" });
    deps.setLocation("/grind");
    return;
  }

  const wallets = Array.isArray(reconcilable.wallets) ? reconcilable.wallets : [];
  if (wallets.length === 0) {
    try {
      emitReconcileSkippedNoWallets({ sessionId: deps.sessionId });
    } catch {
      // ignore
    }
    deps.setLocation("/grind");
    return;
  }

  try {
    await deps.openReconcileDialog();
  } catch {
    // dialog rejeitou — segue para redirect
  }

  deps.setLocation("/grind");
}

/**
 * Runs the session-end flow with the reconciliation step. Always opens
 * the summary modal at the end (errors are signaled via toast/onError but
 * never block the user from seeing the summary).
 */
export async function runSessionEndFlow(deps: RunSessionEndFlowDeps): Promise<void> {
  // 1. PUT status=completed
  try {
    await deps.completeSession();
  } catch (err) {
    deps.onError(err);
    deps.openSummaryModal();
    return;
  }

  // 2. GET reconcilable-wallets
  let reconcilable: FetchReconcilableResult;
  try {
    reconcilable = await deps.fetchReconcilable();
  } catch (err) {
    deps.toast({
      title: "Nao foi possivel carregar carteiras para reconciliacao",
      variant: "destructive",
    });
    deps.openSummaryModal();
    return;
  }

  // 3a. Idempotencia preflight (RF-08)
  if (reconcilable.alreadyReconciled) {
    deps.toast({
      title: "Esta sessao ja foi reconciliada anteriormente",
    });
    deps.openSummaryModal();
    return;
  }

  // 3b. Sem wallets elegiveis
  if (!Array.isArray(reconcilable.wallets) || reconcilable.wallets.length === 0) {
    deps.openSummaryModal();
    return;
  }

  // 4. Abre dialog e aguarda resolucao
  try {
    await deps.openReconcileDialog();
  } catch {
    // dialog rejeitou — nao bloqueia summary
  }

  // 5. Sempre abre summary
  deps.openSummaryModal();
}
