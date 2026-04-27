/**
 * SessionWalletSnapshotsTable — RF-09 (P10/F-10, P12).
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *
 * Carrega GET /api/grind-sessions/:id/wallet-snapshots e renderiza:
 *   >=640px (desktop): tabela com 6 colunas.
 *   <640px (mobile):   cards verticais.
 *
 * Vazia: exibe mensagem "Snapshots indisponiveis para esta sessao".
 *
 * data-testid:
 *   session-snapshots-table | session-snapshots-cards
 *   session-snapshot-row-{walletId}
 *   session-snapshot-card-{walletId}
 *   session-snapshot-skipped-badge-{walletId}
 *   session-snapshots-empty-message
 */
import React, { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  ResponsiveSnapshotTableRow,
  ResponsiveSnapshotCard,
  type SnapshotRowData,
} from "../grind-session-live/ResponsiveSnapshotRow";

interface SessionWalletSnapshotsResponse {
  sessionId: string;
  snapshots: Array<
    SnapshotRowData & { contributingTournamentIds?: string[] }
  >;
}

interface SessionWalletSnapshotsTableProps {
  sessionId: string;
}

function useIsMobile(maxWidth = 640): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return false;
    try {
      return window.matchMedia(`(max-width: ${maxWidth - 1}px)`).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(`(max-width: ${maxWidth - 1}px)`);
    } catch {
      return;
    }
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    return undefined;
  }, [maxWidth]);

  return isMobile;
}

export function SessionWalletSnapshotsTable({
  sessionId,
}: SessionWalletSnapshotsTableProps) {
  const [snapshots, setSnapshots] = useState<SnapshotRowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile(640);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/grind-sessions/${sessionId}/wallet-snapshots`;
        const data = (await apiRequest("GET", url)) as SessionWalletSnapshotsResponse;
        if (cancelled) return;
        const items = Array.isArray(data?.snapshots) ? data.snapshots : [];
        setSnapshots(items);
      } catch (err: any) {
        if (cancelled) return;
        setError("Falha ao carregar snapshots");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground" data-testid="session-snapshots-loading">
        Carregando snapshots...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="text-sm text-amber-700"
        data-testid="session-snapshots-error"
      >
        {error}
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div
        data-testid="session-snapshots-empty-message"
        className="text-sm text-muted-foreground"
      >
        Snapshots indisponiveis para esta sessao
      </div>
    );
  }

  if (isMobile) {
    return (
      <div data-testid="session-snapshots-cards" className="space-y-3">
        {snapshots.map((s) => (
          <ResponsiveSnapshotCard key={s.walletId} snap={s} />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table
        data-testid="session-snapshots-table"
        className="min-w-full text-left border-collapse"
      >
        <thead>
          <tr className="text-xs text-muted-foreground uppercase">
            <th className="px-3 py-2">Carteira</th>
            <th className="px-3 py-2">Inicial</th>
            <th className="px-3 py-2">Final</th>
            <th className="px-3 py-2">Delta esperado</th>
            <th className="px-3 py-2">Ajuste manual</th>
            <th className="px-3 py-2">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <ResponsiveSnapshotTableRow key={s.walletId} snap={s} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SessionWalletSnapshotsTable;
