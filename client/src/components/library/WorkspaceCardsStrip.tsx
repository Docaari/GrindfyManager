import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, ShieldCheck, Clock } from "lucide-react";

interface WorkspaceCard {
  id: string;
  site: string;
  familyKey: string;
  groupName: string | null;
  buyInTier: string | null;
  type: string | null;
  metrics: any;
  reasons: Array<{ kind: string; label: string }> | null;
  source: string | null;
  origin: { userId: string };
}

const reasonIcon = (k: string) =>
  k === "roi" ? <TrendingUp className="w-3 h-3" /> : k === "low_variance" ? <ShieldCheck className="w-3 h-3" /> : <Clock className="w-3 h-3" />;

const truncId = (id: string) => (id.length > 14 ? `${id.slice(0, 14)}…` : id);

/**
 * Faixa de cards salvos por contas vinculadas (Fase 4, workspace). Snapshot
 * CONGELADO — render direto de `metrics`/`reasons`, sem drill-down que
 * re-deriva. `sites` filtra pela(s) plataforma(s); vazio = todas. Renderiza
 * nada quando o workspace não tem cards.
 */
export function WorkspaceCardsStrip({ sites }: { sites: string[] }) {
  const { data: cards } = useQuery({
    queryKey: ["/api/library/highlights/workspace"],
    queryFn: async () => (await apiRequest("GET", "/api/library/highlights/workspace")) as WorkspaceCard[],
  });

  const filtered = (cards || []).filter((c) => sites.length === 0 || sites.includes(c.site));
  if (filtered.length === 0) return null;

  return (
    <div className="mb-6" data-testid="workspace-cards-strip">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-blue-400" />
        <h3 className="text-lg font-bold">Cards das contas vinculadas</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((c) => {
          const roi = c.metrics?.roi;
          return (
            <div
              key={c.id}
              data-testid={`workspace-card-${c.id}`}
              className="bg-gradient-to-br from-blue-900/20 to-gray-800/40 border border-blue-700/30 rounded-lg p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-white font-medium text-sm truncate">{c.groupName || c.familyKey}</div>
                <Badge className="text-[10px] bg-gray-700 text-gray-200 shrink-0" title={`Origem: ${c.origin.userId}`}>
                  de {truncId(c.origin.userId)}
                </Badge>
              </div>
              {typeof roi === "number" && (
                <div className={`text-lg font-bold ${roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {roi >= 0 ? "+" : ""}{roi.toFixed(1)}% ROI
                </div>
              )}
              <div className="flex flex-wrap gap-1 mt-1">
                <Badge className="text-[10px] bg-gray-700 text-gray-200">{c.site}</Badge>
                {c.buyInTier && (
                  <Badge className="text-[10px] bg-gray-700 text-gray-200">{c.buyInTier}</Badge>
                )}
                {(c.reasons || []).map((r, i) => (
                  <Badge key={i} className="text-[10px] bg-gray-700 text-gray-200 gap-1">
                    {reasonIcon(r.kind)} {r.label}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default WorkspaceCardsStrip;
