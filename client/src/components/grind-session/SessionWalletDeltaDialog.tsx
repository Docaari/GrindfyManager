/**
 * SessionWalletDeltaDialog — exibe banca inicial/final por carteira para uma sessao.
 *
 * Filtragem: so renderiza carteiras com movimento (expectedDelta != 0 OU
 * manualAdjustment != 0). Carteiras sem uso na sessao sao omitidas.
 *
 * Endpoint: GET /api/grind-sessions/:id/wallet-snapshots — payload
 * { sessionId, snapshots: SnapshotRowData[] }.
 */
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import type { SnapshotRowData } from "@/components/grind-session-live/ResponsiveSnapshotRow";
import { formatCurrency as formatNativeCurrency } from "@/lib/format";
import { SessionHistoryData } from "./types";

interface Props {
  session: SessionHistoryData | null;
  onClose: () => void;
  formatCurrency: (amountUsd: number) => string;
}

interface ApiPayload {
  sessionId: string;
  snapshots: SnapshotRowData[];
}

function hasMovement(s: SnapshotRowData): boolean {
  if (s.closingBalance === null) return false;
  const delta = Number(s.expectedDelta) || 0;
  const adj = Number(s.manualAdjustment) || 0;
  return delta !== 0 || adj !== 0;
}

function formatNullable(v: number | null, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return formatNativeCurrency(v, currency);
}

function formatSigned(v: number, currency: string): string {
  if (v > 0) return `+${formatNativeCurrency(v, currency)}`;
  return formatNativeCurrency(v, currency);
}

export default function SessionWalletDeltaDialog({ session, onClose, formatCurrency }: Props) {
  const isOpen = session !== null;
  const sessionId = session?.id ?? null;
  const [snapshots, setSnapshots] = useState<SnapshotRowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSnapshots([]);
    (async () => {
      try {
        const data = (await apiRequest("GET", `/api/grind-sessions/${sessionId}/wallet-snapshots`)) as ApiPayload;
        if (cancelled) return;
        setSnapshots(Array.isArray(data?.snapshots) ? data.snapshots : []);
      } catch (e) {
        if (!cancelled) setError("Não foi possível carregar os snapshots desta sessão.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const filtered = snapshots.filter(hasMovement);

  const totalDeltaUsd = session ? Number(session.profit) : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle>Detalhes das Carteiras</DialogTitle>
          <DialogDescription className="text-gray-400">
            {session ? new Date(session.date).toLocaleDateString('pt-BR', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            }) : ''}
            {' · '}
            <span className={totalDeltaUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              Resultado total: {formatCurrency(totalDeltaUsd)}
            </span>
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-6 text-center text-gray-400 text-sm">Carregando carteiras...</div>
        )}

        {!loading && error && (
          <div className="py-6 text-center text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="py-6 text-center text-gray-400 text-sm">
            Nenhuma carteira teve movimento nesta sessão.
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-500 border-b border-gray-700">
                  <th className="px-3 py-2">Carteira</th>
                  <th className="px-3 py-2">Banca Inicial</th>
                  <th className="px-3 py-2">Banca Final</th>
                  <th className="px-3 py-2">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const delta = Number(s.expectedDelta) || 0;
                  return (
                    <tr key={s.walletId} className="border-b border-gray-800">
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-100">{s.walletName ?? s.walletId}</div>
                        <div className="text-xs text-gray-500">
                          {(s.platform ?? '')} {s.nativeCurrency}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-300">
                        {formatNullable(s.openingBalance, s.nativeCurrency)}
                      </td>
                      <td className="px-3 py-3 text-gray-300">
                        {formatNullable(s.closingBalance, s.nativeCurrency)}
                      </td>
                      <td className={`px-3 py-3 font-medium ${
                        delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {formatSigned(delta, s.nativeCurrency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
