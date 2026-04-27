import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// =============================================================================
// DashboardGoodMorningSplash — Sprint Cooldown-2
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 4 + Sleep Gate suave)
//
// Splash mostrado quando user.dashboardSnoozedUntil > now() (efeito do
// cool-down Bloco 4 com sleepIntent=true). CTA "Pronto para a proxima?"
// limpa o snooze via PATCH /api/users/me {dashboardSnoozedUntil: null}.
// =============================================================================

export interface DashboardGoodMorningSplashProps {
  onDismiss?: () => void;
}

export function DashboardGoodMorningSplash({
  onDismiss,
}: DashboardGoodMorningSplashProps) {
  const queryClient = useQueryClient();

  const clearMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", "/api/users/me", {
        dashboardSnoozedUntil: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      onDismiss?.();
    },
  });

  return (
    <div
      data-testid="dashboard-good-morning-splash"
      role="dialog"
      aria-label="Bom dia"
      className="rounded-2xl border border-amber-300/40 bg-gradient-to-br from-amber-50/10 to-amber-100/5 p-8 text-center"
    >
      <h2 className="text-3xl font-bold mb-3">Bom dia!</h2>
      <p className="text-gray-300 mb-6">
        Voce concluiu seu cool-down ontem. Descanso eh parte do jogo.
      </p>
      <button
        type="button"
        data-testid="dashboard-good-morning-cta"
        onClick={() => clearMutation.mutate()}
        disabled={clearMutation.isPending}
        className="rounded-md bg-poker-green px-6 py-3 text-white font-semibold hover:bg-poker-green/90 disabled:opacity-60"
      >
        {clearMutation.isPending ? "..." : "Pronto para a proxima?"}
      </button>
    </div>
  );
}

export default DashboardGoodMorningSplash;
