/**
 * WarmupHistoryCard — Sprint W-1 (RF-18)
 *
 * Lista os ultimos N rituais (default 14) com badge de decisao.
 * Badge:
 *   - verde "jogou"        para version=full + decisionToPlay=true + overrideUsed=false
 *   - amarela "override"   para version=full + decisionToPlay=true + overrideUsed=true
 *   - vermelha "nao jogou" para version=aborted + decisionToPlay=false
 *   - cinza "abortou"      para version=aborted + decisionToPlay=null
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Ritual = {
  id: string;
  startedAt: string;
  completedAt?: string | null;
  version: "full" | "aborted";
  decisionToPlay: boolean | null;
  overrideUsed: boolean;
  emotionalCheckScore: number | null;
  durationMinutes: number;
};

interface ListResponse {
  items: Ritual[];
  total: number;
  limit: number;
  offset: number;
}

export interface WarmupHistoryCardProps {
  limit?: number;
}

interface BadgeInfo {
  label: string;
  className: string;
}

function decisionBadge(r: Ritual): BadgeInfo {
  if (r.version === "full") {
    if (r.overrideUsed) {
      return {
        label: "Override",
        className: "bg-amber-100 text-amber-800 border-amber-300",
      };
    }
    if (r.decisionToPlay === true) {
      return {
        label: "Jogou",
        className: "bg-emerald-100 text-emerald-800 border-emerald-300",
      };
    }
  }
  if (r.version === "aborted" && r.decisionToPlay === false) {
    return {
      label: "Nao jogou",
      className: "bg-rose-100 text-rose-800 border-rose-300",
    };
  }
  return {
    label: "Abortou",
    className: "bg-slate-100 text-slate-700 border-slate-300",
  };
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function WarmupHistoryCard({ limit = 14 }: WarmupHistoryCardProps) {
  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ["/api/warmup-rituals", { limit }],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/warmup-rituals?limit=${limit}`,
      );
      return (res ?? { items: [], total: 0, limit, offset: 0 }) as ListResponse;
    },
    staleTime: 30_000,
    retry: false,
  });

  const items = data?.items ?? [];

  return (
    <Card data-testid="warmup-history-card">
      <CardHeader>
        <CardTitle className="text-lg">Historico de warm-ups</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem historico ainda. Comece seu primeiro warm-up.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((r) => {
              const badge = decisionBadge(r);
              return (
                <li
                  key={r.id}
                  data-testid="warmup-history-item"
                  className="flex items-center justify-between py-2 gap-2"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {formatDateTime(r.startedAt)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Score {r.emotionalCheckScore ?? "—"} ·{" "}
                      {r.durationMinutes ?? 0}min
                    </span>
                  </div>
                  <span
                    data-testid={`warmup-history-badge-${r.id}`}
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
