import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Star, X, TrendingUp, ShieldCheck, Clock } from "lucide-react";

interface SavedHighlight {
  id: string; site: string; familyKey: string; groupName: string | null;
  buyInTier: string | null; type: string | null;
  metrics: any; reasons: Array<{ kind: string; label: string }> | null; source: string | null;
}

const reasonIcon = (k: string) =>
  k === "roi" ? <TrendingUp className="w-3 h-3" /> : k === "low_variance" ? <ShieldCheck className="w-3 h-3" /> : <Clock className="w-3 h-3" />;

/**
 * Faixa de cards (familias) salvos, fixada no topo da pagina Torneios.
 * `sites` filtra pela(s) plataforma(s) selecionada(s); vazio = todas.
 */
export function SavedHighlightsStrip({ sites }: { sites: string[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: highlights } = useQuery({
    queryKey: ["/api/library/highlights"],
    queryFn: async () => (await apiRequest("GET", "/api/library/highlights")) as SavedHighlight[],
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/library/highlights/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/library/highlights"] });
      toast({ title: "Removido" });
    },
  });

  const filtered = (highlights || []).filter((h) => sites.length === 0 || sites.includes(h.site));
  if (filtered.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Star className="w-4 h-4 text-yellow-400" />
        <h3 className="text-lg font-bold">Destaques salvos</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((h) => {
          const roi = h.metrics?.roi;
          return (
            <div key={h.id} className="bg-gradient-to-br from-yellow-900/20 to-gray-800/40 border border-yellow-700/30 rounded-lg p-3 relative">
              <button
                onClick={() => remove.mutate(h.id)}
                className="absolute top-2 right-2 text-gray-500 hover:text-red-400"
                aria-label="Remover destaque"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="text-white font-medium text-sm truncate pr-5">{h.groupName || h.familyKey}</div>
              {typeof roi === "number" && (
                <div className={`text-lg font-bold ${roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {roi >= 0 ? "+" : ""}{roi.toFixed(1)}% ROI
                </div>
              )}
              <div className="flex flex-wrap gap-1 mt-1">
                {(h.reasons || []).map((r, i) => (
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
