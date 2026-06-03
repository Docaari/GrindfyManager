import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";

interface FamilyInput {
  site: string;
  familyKey: string;
  groupName?: string | null;
  buyInTier?: string | null;
  type?: string | null;
  metrics?: any;
  reasons?: any;
}

/**
 * Botao "Adicionar à Premium" (RF-01), renderizado SO para curador (isCurator).
 * Defense-in-depth UI: o backend (requireGranularPermission) e a fonte de verdade.
 * Click -> POST /api/library/premium com o snapshot da familia.
 */
export function PremiumPromoteButton({ family, isCurator }: { family: FamilyInput; isCurator: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const promote = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/library/premium", {
        site: family.site,
        familyKey: family.familyKey,
        groupName: family.groupName ?? null,
        buyInTier: family.buyInTier ?? null,
        type: family.type ?? null,
        metrics: family.metrics ?? null,
        reasons: family.reasons ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/library/premium"] });
      toast({ title: "Adicionado à Biblioteca Premium" });
    },
    onError: () => {
      toast({ title: "Não foi possível promover", variant: "destructive" });
    },
  });

  if (!isCurator) return null;

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      data-testid={`promote-${family.familyKey}`}
      disabled={promote.isPending}
      onClick={() => promote.mutate()}
      className="gap-1 border-amber-500/50 text-amber-300 hover:bg-amber-900/20"
    >
      <Crown className="w-3.5 h-3.5" />
      Adicionar à Premium
    </Button>
  );
}

export default PremiumPromoteButton;
