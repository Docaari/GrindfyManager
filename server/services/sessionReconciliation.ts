/**
 * Session Reconciliation Service — Sprint Session-End Reconciliation
 *
 * Spec: Docs/specs/session-end-wallet-reconciliation.md
 *  - RF-04: itera fail-fast por wallet, calcula delta, chama walletService
 *  - RF-08: idempotencia preflight via storage.findReconciliationMarker
 * ADR : Docs/architecture/decisions/040-session-end-wallet-reconciliation.md
 *
 * Public API:
 *   computeAdjustment(wallet, reportedBalance, expectedPreviousBalance)
 *     -> { delta, direction, nativeAmount } | null
 *     null se |delta| < 0.01 (skip silencioso, RF-04 epsilon).
 *
 *   runReconciliation(userId, sessionId, adjustments)
 *     -> { created, skipped, failed?, alreadyReconciled?, existingCount? }
 *
 * Reuso integral de walletService.recordWalletTransaction (ADR-034 + ADR-038).
 */

import { walletService } from "./walletService";
import { storage } from "../storage";

const RECONCILE_NOTE = "Reconciliacao automatica fim de sessao";

async function loadNativeCurrencyMap(userId: string): Promise<Map<string, string>> {
  const wallets = await storage.listWalletsByUser(userId, { includeArchived: true });
  const map = new Map<string, string>();
  for (const w of wallets) {
    if (w?.id && w?.nativeCurrency) {
      map.set(w.id, w.nativeCurrency);
    }
  }
  return map;
}

export interface AdjustmentInput {
  walletId: string;
  reportedBalance: number;
  expectedPreviousBalance: number;
  // V2 (RF-06): expectedDelta opcional, alimenta snapshot.
  expectedDelta?: number;
  // V2 (RF-07): contributingTournamentIds opcional, alimenta snapshot.
  contributingTournamentIds?: string[];
}

export interface ComputedAdjustment {
  delta: number;
  direction: "in" | "out";
  nativeAmount: number;
}

export interface ReconciliationFailure {
  walletId: string;
  code: string;
  message: string;
  currentBalance?: number;
}

export interface ReconciliationResult {
  created: any[];
  skipped: number;
  // V2 (RF-07): snapshots criadas em paralelo com txs.
  snapshotsCreated?: number;
  skippedByUser?: boolean;
  failed?: ReconciliationFailure;
  alreadyReconciled?: boolean;
  existingCount?: number;
}

export interface RunReconciliationOptions {
  skipReconciliation?: boolean;
}

// V2 (RF-02): export do helper para testes / consumo externo.
export {
  calculateExpectedDeltaPerWallet,
  mapSiteToWallet,
  convertToNativeCurrency,
} from "./walletReconciliation";

/**
 * computeAdjustment — calcula delta entre saldo reportado e saldo esperado.
 * Retorna null quando |delta| < 0.01 (skip silencioso, RF-04 epsilon).
 */
export function computeAdjustment(
  _wallet: { id: string; balance?: string | number; nativeCurrency?: string },
  reportedBalance: number,
  expectedPreviousBalance: number,
): ComputedAdjustment | null {
  const delta = reportedBalance - expectedPreviousBalance;
  if (!Number.isFinite(delta)) {
    return null;
  }
  // Boundary 0.01 inclusivo: usar centavos arredondados elimina ruido fp
  // (alinhado com pattern de ADR-038 em walletService).
  const diffCents = Math.round(Math.abs(delta) * 100);
  if (diffCents < 1) {
    return null;
  }
  return {
    delta,
    direction: delta > 0 ? "in" : "out",
    nativeAmount: Math.abs(delta),
  };
}

/**
 * Detecta UNIQUE violation (Postgres SQLSTATE 23505) em qualquer profundidade
 * da cadeia de err.cause. Usado para mapear race condition concorrente
 * (HIGH-02) para `already_reconciled` ao inves de erro generico.
 */
function isUniqueViolation(err: any): boolean {
  let cur: any = err;
  for (let depth = 0; cur && depth < 5; depth++) {
    if (cur?.code === "23505") return true;
    // Heuristica defensiva: drivers diferentes podem expor a mensagem
    // sem o codigo numerico — checa string como ultimo recurso.
    if (typeof cur?.message === "string" && cur.message.includes("23505")) return true;
    cur = cur.cause;
  }
  return false;
}

/**
 * runReconciliation — orquestra batch fail-fast por wallet ATOMICAMENTE.
 *
 * CRITICAL-01 fix (reviewer pre-merge): toda a operacao roda em UMA transaction
 * abrangente. Cada wallet_transaction + session_wallet_snapshot commitam juntos
 * ou nada eh persistido. Snapshot orfao (tx commitada sem snapshot) e idempotencia
 * quebrada (snapshot UNIQUE violation depois de tx ja commitada) eram possiveis
 * antes do refactor — agora sao impossiveis.
 *
 * HIGH-02 fix: mesmo race UNIQUE concorrente — 2 callers passam preflight, ambos
 * abrem tx, ambos tentam INSERT em session_wallet_snapshots. O segundo viola
 * UNIQUE (sessionId, walletId) -> 23505 -> tx rollback (incluindo wallet_transaction
 * dele). Mapeado para `alreadyReconciled` antes de retornar para caller.
 *
 * 1. Preflight FORA da tx (rapido, sem lock): se snapshot ou marker indicam
 *    sessao ja reconciliada, retorna sem abrir tx.
 * 2. Dentro da tx (atomico):
 *    a. Re-check snapshot (com tx) — defesa adicional contra race.
 *    b. Itera adjustments: calcula delta -> recordWalletTransaction(tx) ->
 *       createSessionWalletSnapshot(tx) IMEDIATAMENTE apos.
 *    c. skipReconciliation=true: cria snapshots em UMA tx (todos ou nada).
 *    d. Erro qualquer (balance_mismatch, wallet_archived, UNIQUE 23505): throw
 *       -> tx aborta -> rollback completo de wallet_txs + snapshots.
 * 3. Apos commit: invalida cache uma vez para userId.
 */
export async function runReconciliation(
  userId: string,
  sessionId: string,
  adjustments: AdjustmentInput[],
  options: RunReconciliationOptions = {},
): Promise<ReconciliationResult> {
  const skipReconciliation = !!options.skipReconciliation;

  // V2 (RF-04): snapshot table eh fonte primaria; marker eh fallback secundario.
  // Preflight sem lock — caminho comum (ja reconciliado) evita abrir tx.
  // Queries independentes -> Promise.all corta latencia ~50%.
  const [snapshotPreflight, marker] = await Promise.all([
    storage.findSessionWalletSnapshot(sessionId, userId).catch(() => null),
    storage.findReconciliationMarker(sessionId, userId),
  ]);

  if (snapshotPreflight) {
    return {
      alreadyReconciled: true,
      existingCount: 1,
      created: [],
      skipped: 0,
    };
  }
  const existingCount = marker?.count ?? 0;
  if (existingCount > 0) {
    return {
      alreadyReconciled: true,
      existingCount,
      created: [],
      skipped: 0,
    };
  }

  const currencyMap = await loadNativeCurrencyMap(userId);
  const resolveCurrency = (walletId: string): string =>
    currencyMap.get(walletId) ?? "USD";

  // Sentinela usada para sair da tx via throw quando ja-reconciliado eh
  // detectado dentro do tx wrapper (race fechada). Caller faz unwrap.
  const ALREADY_RECONCILED_SENTINEL = Symbol("already_reconciled_sentinel");

  // Sentinela analoga para failure mid-batch (fail-fast). throw forca rollback
  // do wallet_transaction recem-criado pela linha anterior, garantindo atomicidade
  // total — created/snapshotsCreated retornados serao SEMPRE 0 quando ha failure
  // (porque tudo dentro da tx eh revertido). Mantemos o shape do return para
  // back-compat com mapping HTTP no router.
  const FAIL_FAST_SENTINEL = Symbol("fail_fast_sentinel");

  type TxResult = {
    created: any[];
    skipped: number;
    snapshotsCreated: number;
    skippedByUser?: boolean;
  };

  try {
    const result = await storage.transaction(async (tx: any) => {
      // Re-check dentro da tx: protege contra race onde 2 callers passam
      // preflight ao mesmo tempo. Se snapshot existe agora, aborta sem
      // tocar wallet_transactions.
      const innerSnap = tx.findSessionWalletSnapshot
        ? await tx.findSessionWalletSnapshot(sessionId, userId).catch(() => null)
        : null;
      if (innerSnap) {
        const e: any = new Error("already_reconciled");
        e.__sentinel = ALREADY_RECONCILED_SENTINEL;
        e.existingCount = 1;
        throw e;
      }

      const created: any[] = [];
      let skipped = 0;
      let snapshotsCreated = 0;

      if (skipReconciliation) {
        for (const adj of adjustments) {
          await tx.createSessionWalletSnapshot({
            userId,
            sessionId,
            walletId: adj.walletId,
            nativeCurrency: resolveCurrency(adj.walletId),
            openingBalance: adj.expectedPreviousBalance,
            closingBalance: null,
            expectedDelta: adj.expectedDelta ?? 0,
            manualAdjustment: null,
            contributingTournamentIds: adj.contributingTournamentIds ?? [],
            reason: "session_result",
            walletTransactionId: null,
          });
          snapshotsCreated++;
        }
        return {
          created: [],
          skipped: 0,
          snapshotsCreated,
          skippedByUser: true,
        } satisfies TxResult;
      }

      for (const adj of adjustments) {
        const computed = computeAdjustment(
          { id: adj.walletId },
          adj.reportedBalance,
          adj.expectedPreviousBalance,
        );

        let txId: string | null = null;

        if (computed === null) {
          skipped++;
        } else {
          try {
            const r = await walletService.recordWalletTransaction(
              userId,
              adj.walletId,
              {
                direction: computed.direction,
                nativeAmount: computed.nativeAmount,
                reason: "session_result",
                source: "auto_session",
                sessionId,
                expectedPreviousBalance: adj.expectedPreviousBalance,
                note: RECONCILE_NOTE,
                occurredAt: new Date(),
              } as any,
              tx,
            );
            created.push(r.transaction);
            txId = r.transaction?.id ?? null;
          } catch (err: any) {
            // fail-fast: marca failure e aborta tx (rollback de tudo).
            const code = err?.code ?? "unknown";
            const message = err?.message ?? "Erro ao reconciliar";
            const failure: ReconciliationFailure = {
              walletId: adj.walletId,
              code,
              message,
            };
            if (typeof err?.currentBalance === "number") {
              failure.currentBalance = err.currentBalance;
            }
            const sentinel: any = new Error(message);
            sentinel.__sentinel = FAIL_FAST_SENTINEL;
            sentinel.failure = failure;
            throw sentinel;
          }
        }

        // V2 (RF-07): cria snapshot IMEDIATAMENTE apos tx no MESMO tx.
        // Falha aqui (ex: 23505 UNIQUE) -> rollback automatico da tx do passo
        // anterior + de tudo antes. Errors sao mapeados pelo catch externo.
        const expectedDelta = adj.expectedDelta ?? 0;
        const closingBalance = adj.reportedBalance;
        const manualAdjustment = Number.isFinite(expectedDelta)
          ? closingBalance - (adj.expectedPreviousBalance + expectedDelta)
          : 0;
        await tx.createSessionWalletSnapshot({
          userId,
          sessionId,
          walletId: adj.walletId,
          nativeCurrency: resolveCurrency(adj.walletId),
          openingBalance: adj.expectedPreviousBalance,
          closingBalance,
          expectedDelta,
          manualAdjustment,
          contributingTournamentIds: adj.contributingTournamentIds ?? [],
          reason: "session_result",
          walletTransactionId: txId,
        });
        snapshotsCreated++;
      }

      return { created, skipped, snapshotsCreated } satisfies TxResult;
    });

    // Apos commit do outer tx: invalida cache uma vez (CRITICAL-01:
    // walletService.recordWalletTransaction recebeu externalTx e nao invalidou).
    // Bankroll-Launch-Fix P1 #5: invalidar tambem quando ha snapshots criados
    // (caso "skipReconciliation" cria snapshots sem tx + caso onde todas
    // adjustments tem |delta| < 0.01 mas snapshots foram gravados). Sem isso,
    // /api/wallets cache fica stale apos finish + UX mostra saldos antigos.
    const shouldInvalidate =
      (result as any).created.length > 0 ||
      ((result as any).snapshotsCreated ?? 0) > 0;
    if (shouldInvalidate) {
      try {
        const { selectorCache } = await import("./selectorCache");
        const { bankrollCache } = await import("./bankrollCache");
        const { walletCache } = await import("./walletCache");
        try { selectorCache.invalidateAllForUser(userId); } catch (e) {
          console.error("[reconcile] selectorCache invalidate failed", e);
        }
        try { bankrollCache.invalidateAllForUser(userId); } catch (e) {
          console.error("[reconcile] bankrollCache invalidate failed", e);
        }
        try { walletCache.invalidateAllForUser(userId); } catch (e) {
          console.error("[reconcile] walletCache invalidate failed", e);
        }
      } catch (e) {
        console.error("[reconcile] cache module import failed", e);
      }
    }

    return result;
  } catch (err: any) {
    // Sentinela: ja-reconciliado (race intra-tx).
    if (err?.__sentinel === ALREADY_RECONCILED_SENTINEL) {
      return {
        alreadyReconciled: true,
        existingCount: err.existingCount ?? 1,
        created: [],
        skipped: 0,
      };
    }
    // Sentinela: fail-fast (mid-batch). tx ja foi rollback'ada pelo throw.
    if (err?.__sentinel === FAIL_FAST_SENTINEL && err.failure) {
      return {
        created: [],
        skipped: 0,
        snapshotsCreated: 0,
        failed: err.failure as ReconciliationFailure,
      };
    }
    // HIGH-02: UNIQUE violation em snapshot dentro da tx -> race concorrente
    // (2 callers passaram preflight, ambos tentaram criar snapshot). Mapeia
    // para already_reconciled. tx do segundo caller foi automaticamente
    // revertida (incluindo wallet_transaction recem-criada).
    if (isUniqueViolation(err)) {
      return {
        alreadyReconciled: true,
        existingCount: 1,
        created: [],
        skipped: 0,
      };
    }
    // Erro inesperado dentro da tx (DB down, etc): re-throw para router 500.
    throw err;
  }
}
