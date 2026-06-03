import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Crown, X, TrendingUp, ShieldCheck, Clock, Loader2 } from "lucide-react";

interface PremiumHighlight {
  id: string; site: string; familyKey: string; groupName: string | null;
  buyInTier: string | null; type: string | null;
  metrics: any; reasons: Array<{ kind: string; label: string }> | null; source: string | null;
}
interface RecentResult { name: string; playerNick: string | null; datePlayed: string | null; position: number | null; fieldSize: number | null; prize: number }
interface Details { found: boolean; metrics: any; recentResults: RecentResult[] }

const reasonIcon = (k: string) =>
  k === "roi" ? <TrendingUp className="w-3 h-3" /> : k === "low_variance" ? <ShieldCheck className="w-3 h-3" /> : <Clock className="w-3 h-3" />;
const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(n);

function DetailDialog({ highlight }: { highlight: PremiumHighlight }) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/library/premium", highlight.id, "details"],
    queryFn: async () => (await apiRequest("GET", `/api/library/premium/${highlight.id}/details`)) as { highlight: PremiumHighlight } & Details,
  });
  return (
    <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-card border-gray-700">
      <DialogHeader>
        <DialogTitle className="text-white">{highlight.groupName || highlight.familyKey}</DialogTitle>
      </DialogHeader>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : !data?.found ? (
        <p className="text-sm text-amber-300">
          Esta família não está no seu histórico próprio — a Biblioteca Premium é curada globalmente.
          As métricas exibidas no card são do momento da promoção.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-800/50 rounded-lg p-2 text-center">
              <div className={`font-bold ${data.metrics.roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>{data.metrics.roi}%</div>
              <div className="text-xs text-gray-400">ROI (seu histórico)</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-2 text-center">
              <div className="text-white font-bold">{data.metrics.volume}</div>
              <div className="text-xs text-gray-400">Volume</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-2 text-center">
              <div className="text-white font-bold">{data.metrics.profitPerTableHour != null ? `${fmt(data.metrics.profitPerTableHour)}/h` : "—"}</div>
              <div className="text-xs text-gray-400">$/hora-mesa</div>
            </div>
          </div>
          <div className="text-sm font-semibold text-gray-300 mb-2">Últimos resultados</div>
          <div className="space-y-1">
            {data.recentResults.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-gray-800/30 rounded px-2 py-1">
                <div className="min-w-0">
                  <span className="text-white truncate">{r.name}</span>
                  {r.playerNick && <span className="text-xs text-gray-500 ml-2">@{r.playerNick}</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-400">
                    {r.position ?? "—"}{r.fieldSize ? `/${r.fieldSize}` : ""}
                  </span>
                  <span className={`font-medium ${r.prize >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(r.prize)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </DialogContent>
  );
}

/**
 * Faixa GLOBAL "Biblioteca Premium" (ADR-240), fixada no topo de Torneios acima
 * dos Destaques salvos pessoais. TODOS os autenticados veem; o botao remover (X)
 * so aparece para curador (isCurator — defense-in-depth UI; backend e a SSoT).
 * `sites` filtra pela(s) plataforma(s); vazio = todas. Lista vazia -> null.
 */
export function PremiumLibraryStrip({ sites, isCurator }: { sites: string[]; isCurator: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: highlights } = useQuery({
    queryKey: ["/api/library/premium"],
    queryFn: async () => (await apiRequest("GET", "/api/library/premium")) as PremiumHighlight[],
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/library/premium/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/library/premium"] });
      toast({ title: "Removido da Premium" });
    },
  });

  const filtered = (highlights || []).filter((h) => sites.length === 0 || sites.includes(h.site));
  if (filtered.length === 0) return null;

  return (
    <div className="mb-6" data-testid="premium-strip">
      <div className="flex items-center gap-2 mb-3">
        <Crown className="w-4 h-4 text-amber-400" />
        <h3 className="text-lg font-bold">Biblioteca Premium</h3>
        <Badge className="text-[10px] bg-amber-600/30 text-amber-200 border border-amber-500/40">Curada</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((h) => {
          const roi = h.metrics?.roi;
          return (
            <Dialog key={h.id} open={openId === h.id} onOpenChange={(o) => setOpenId(o ? h.id : null)}>
              <div
                data-testid={`premium-card-${h.id}`}
                onClick={() => setOpenId(h.id)}
                className="bg-gradient-to-br from-amber-900/25 to-gray-800/40 border border-amber-600/40 rounded-lg p-3 relative cursor-pointer hover:border-amber-400/60 transition-colors"
              >
                {isCurator && (
                  <button
                    data-testid={`premium-remove-${h.id}`}
                    onClick={(e) => { e.stopPropagation(); remove.mutate(h.id); }}
                    className="absolute top-2 right-2 text-gray-500 hover:text-red-400"
                    aria-label="Remover da Premium"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
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
              <DetailDialog highlight={h} />
            </Dialog>
          );
        })}
      </div>
    </div>
  );
}

export default PremiumLibraryStrip;
