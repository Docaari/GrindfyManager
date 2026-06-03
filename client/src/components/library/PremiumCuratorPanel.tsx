import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Crown } from "lucide-react";

interface CuratorItem {
  id: string;
  userId: string;
  username: string | null;
  email: string;
  site: string;
  familyKey: string;
  groupName: string | null;
  buyInTier: string | null;
  type: string | null;
  metrics: any;
  reasons: any;
  source: string | null;
  createdAt: string | null;
  alreadyInPremium: boolean;
}
interface CuratorResponse { items: CuratorItem[]; total: number }

/**
 * Painel de curadoria cross-user (RF-06/RF-07) — SO curador (o backend gateia via
 * requireGranularPermission). Lista os destaques pessoais de TODAS as contas com
 * atribuicao do dono e permite importa-los para a Premium. O botao "Importar"
 * fica desabilitado quando a familia ja esta na Premium (alreadyInPremium).
 */
export function PremiumCuratorPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/library/premium/curator/highlights"],
    queryFn: async () =>
      (await apiRequest("GET", "/api/library/premium/curator/highlights")) as CuratorResponse,
  });

  const importHighlight = useMutation({
    mutationFn: async (sourceHighlightId: string) =>
      apiRequest("POST", "/api/library/premium/import", { sourceHighlightId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/library/premium"] });
      queryClient.invalidateQueries({ queryKey: ["/api/library/premium/curator/highlights"] });
      toast({ title: "Importado para a Premium" });
    },
    onError: () => {
      toast({ title: "Não foi possível importar", variant: "destructive" });
    },
  });

  const items = data?.items ?? [];

  return (
    <div data-testid="curator-panel" className="space-y-3">
      <div className="flex items-center gap-2">
        <Crown className="w-4 h-4 text-amber-400" />
        <h3 className="text-lg font-bold">Curadoria — destaques de todas as contas</h3>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <p data-testid="curator-empty" className="text-sm text-gray-400 py-6 text-center">
          Nenhum destaque pessoal disponível para curadoria no momento.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              data-testid={`curator-item-${item.id}`}
              className="flex items-center justify-between gap-3 bg-gray-800/40 border border-gray-700 rounded-lg p-3"
            >
              <div className="min-w-0">
                <div className="text-white font-medium text-sm truncate">
                  {item.groupName || item.familyKey}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  {item.username ? `${item.username} · ` : ""}{item.email}
                </div>
                {item.alreadyInPremium && (
                  <Badge className="mt-1 text-[10px] bg-amber-600/30 text-amber-200">Já na Premium</Badge>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid={`curator-import-${item.id}`}
                disabled={item.alreadyInPremium || importHighlight.isPending}
                onClick={() => importHighlight.mutate(item.id)}
                className="shrink-0 gap-1 border-amber-500/50 text-amber-300 hover:bg-amber-900/20"
              >
                Importar para Premium
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PremiumCuratorPanel;
