/**
 * Sprint Bankroll-Reports-Detail (RF-05) — getGrindSessionHistory
 *
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 * ADR-069 + ADR-070
 *
 * Helper unificado que retorna union de:
 *   - sessoes registradas (grind_sessions) com campos de profit/torneios/snapshot.
 *   - manual_reports clusterizados (D5: 5min ou wallet repetida).
 *
 * Reusado por:
 *   - server/routes/grind-sessions.ts (endpoint GET /api/grind-sessions/history)
 *   - server/coach/tools/readUserBankrollHistory.ts (RF-07)
 *
 * Lessons aplicaveis:
 *   #3 — mock shape REAL de wallet_transactions / bankroll_snapshots / wallets.
 *   #6 — profitUsd via delta_usd_at_time (FX-aware).
 *   #11 — detailsAvailable controla habilitar botao no frontend.
 */

import { storage } from "../storage";

export type HistoryFilter = "all" | "sessions" | "reports";

export interface SessionHistoryEntry {
  type: "session";
  id: string;
  occurredAt: string;
  completedAt: string;
  profitUsd: number;
  tournamentsCount: number;
  platformsAffected: string[];
  detailsAvailable: boolean;
  status?: string;
}

export interface ManualReportHistoryEntry {
  type: "manual_report";
  id: string;
  occurredAt: string;
  profitUsd: number;
  transactionIds: string[];
  platformsAffected: string[];
  detailsAvailable: boolean;
}

export type HistoryEntry = SessionHistoryEntry | ManualReportHistoryEntry;

export interface GetGrindSessionHistoryOptions {
  filter?: HistoryFilter;
  limit?: number;
}

const CLUSTER_WINDOW_MS = 5 * 60 * 1000; // D5: 5min

function parseDecimal(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? 0 : n;
}

function tsOf(v: any): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  return new Date(v).getTime();
}

/**
 * Cluster D5: agrupa manual_report transactions ASC.
 * - Inicia cluster com primeira tx.
 * - Adiciona proxima se: gap <= 5min E wallet ainda nao apareceu no cluster.
 * - Senao fecha cluster e abre novo.
 */
function clusterManualReports(
  txs: any[],
  walletById: Map<string, any>,
): ManualReportHistoryEntry[] {
  if (txs.length === 0) return [];
  // ASC by occurredAt
  const sorted = [...txs].sort((a, b) => tsOf(a.occurredAt) - tsOf(b.occurredAt));

  const clusters: any[][] = [];
  let current: any[] = [];
  let clusterWallets: Set<string> = new Set();
  let clusterStartTs = 0;

  for (const tx of sorted) {
    const ts = tsOf(tx.occurredAt);
    if (current.length === 0) {
      current = [tx];
      clusterWallets = new Set([tx.walletId]);
      clusterStartTs = ts;
      continue;
    }
    const withinWindow = ts - clusterStartTs <= CLUSTER_WINDOW_MS;
    const walletRepeats = clusterWallets.has(tx.walletId);
    if (withinWindow && !walletRepeats) {
      current.push(tx);
      clusterWallets.add(tx.walletId);
    } else {
      clusters.push(current);
      current = [tx];
      clusterWallets = new Set([tx.walletId]);
      clusterStartTs = ts;
    }
  }
  if (current.length > 0) clusters.push(current);

  return clusters.map((cluster) => {
    // Timestamp = mais antigo (cluster start)
    const oldest = cluster[0];
    const id = `mr_${oldest.id}`;
    let profitUsd = 0;
    const platformsSet = new Set<string>();
    let allDetailsOk = true;
    for (const tx of cluster) {
      const usd = tx.usdAmount != null ? parseDecimal(tx.usdAmount) : 0;
      const signed = tx.direction === "in" ? usd : -usd;
      profitUsd += signed;
      const wallet = walletById.get(tx.walletId);
      if (wallet?.platform) platformsSet.add(wallet.platform);
      // D8 data_corrupt: balance_after_native NULL
      if (tx.balanceAfterNative == null && tx.newNativeBalance == null) {
        // tolerated — derivacao por aritmetica de native ainda funciona
      }
    }
    return {
      type: "manual_report" as const,
      id,
      occurredAt: oldest.occurredAt instanceof Date
        ? oldest.occurredAt.toISOString()
        : new Date(oldest.occurredAt).toISOString(),
      profitUsd,
      transactionIds: cluster.map((t) => t.id),
      platformsAffected: Array.from(platformsSet),
      detailsAvailable: allDetailsOk, // D8: manual_report sempre tem before computado
    };
  });
}

/**
 * Calcula detailsAvailable para uma sessao.
 *
 * Precedence D7:
 *   - true se snapshot session-bound (auto-cooldown) com sourceRefId=cooldownLogId.
 *   - true se ha snapshot before (occurredAt <= startedAt) E after (>= completedAt).
 *   - false caso contrario (sessao legacy sem cobertura).
 */
function sessionDetailsAvailable(
  session: any,
  snapshots: any[],
): boolean {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return false;
  const cooldownLogId = session.cooldownLogId ?? null;
  if (cooldownLogId) {
    const hit = snapshots.find(
      (s) => s.origin === "auto-cooldown" && s.sourceRefId === cooldownLogId,
    );
    if (hit) return true;
  }
  const startTs = tsOf(session.startTime ?? session.startedAt);
  const endTs = tsOf(session.completedAt ?? session.endTime);
  if (!startTs || !endTs) return false;
  let hasBefore = false;
  let hasAfter = false;
  for (const s of snapshots) {
    const sTs = tsOf(s.occurredAt ?? s.createdAt);
    if (sTs <= startTs) hasBefore = true;
    if (sTs >= endTs) hasAfter = true;
  }
  return hasBefore && hasAfter;
}

function buildSessionEntry(session: any, snapshots: any[]): SessionHistoryEntry {
  const startedAt = session.startTime ?? session.startedAt ?? session.date;
  const completedAt = session.completedAt ?? session.endTime ?? startedAt;
  const profitNative = parseDecimal(session.profit);
  // V1 simplificado: profit ja em USD (ROI calc upstream). Fallback 0 se ausente.
  const tournamentsCount = Number(session.volume ?? 0) || 0;
  return {
    type: "session",
    id: session.id,
    occurredAt: startedAt instanceof Date
      ? startedAt.toISOString()
      : startedAt
        ? new Date(startedAt).toISOString()
        : new Date(0).toISOString(),
    completedAt: completedAt instanceof Date
      ? completedAt.toISOString()
      : completedAt
        ? new Date(completedAt).toISOString()
        : new Date(0).toISOString(),
    profitUsd: profitNative,
    tournamentsCount,
    platformsAffected: [], // V1: nao agrega per-tournament platform aqui
    detailsAvailable: sessionDetailsAvailable(session, snapshots),
    status: session.status,
  };
}

export async function getGrindSessionHistory(
  userId: string,
  opts: GetGrindSessionHistoryOptions = {},
): Promise<HistoryEntry[]> {
  const filter: HistoryFilter = opts.filter ?? "all";
  const limit = opts.limit ?? 50;

  const includeSessions = filter === "all" || filter === "sessions";
  const includeReports = filter === "all" || filter === "reports";

  // Snapshots para detailsAvailable (D7).
  let snapshots: any[] = [];
  if (includeSessions) {
    try {
      const storageAny = storage as any;
      if (typeof storageAny.getBankrollSnapshots === "function") {
        snapshots = (await storageAny.getBankrollSnapshots(userId, { limit: 200 })) ?? [];
      }
    } catch (err) {
      console.warn(
        "[grindSessionHistory] getBankrollSnapshots falhou:",
        (err as any)?.message,
      );
    }
  }

  let sessionEntries: SessionHistoryEntry[] = [];
  if (includeSessions) {
    try {
      const sessions = (await (storage as any).getGrindSessions(userId)) ?? [];
      sessionEntries = sessions.map((s: any) => buildSessionEntry(s, snapshots));
    } catch (err) {
      console.warn(
        "[grindSessionHistory] getGrindSessions falhou:",
        (err as any)?.message,
      );
    }
  }

  let manualEntries: ManualReportHistoryEntry[] = [];
  if (includeReports) {
    try {
      const txs = (await (storage as any).listWalletTransactionsByUser?.(userId, {
        reason: ["manual_report"],
        limit: 500,
      })) ?? [];
      let walletsCatalog: any[] = [];
      try {
        walletsCatalog = (await storage.getActiveWalletsByUser(userId)) ?? [];
      } catch (err) {
        // segue com catalog vazio — platform = ''.
      }
      const walletById = new Map<string, any>(walletsCatalog.map((w: any) => [w.id, w]));
      manualEntries = clusterManualReports(txs, walletById);
    } catch (err) {
      console.warn(
        "[grindSessionHistory] listWalletTransactionsByUser falhou:",
        (err as any)?.message,
      );
    }
  }

  const all: HistoryEntry[] = [...sessionEntries, ...manualEntries];
  // Ordena DESC por occurredAt (mais recente primeiro).
  all.sort((a, b) => tsOf(b.occurredAt) - tsOf(a.occurredAt));
  return all.slice(0, limit);
}
