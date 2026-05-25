// =============================================================================
// Sprint VR-1 — usePrimedopeSimulation hook (RF-04)
//
// Refactored to call native engine at /api/variance/simulate.
// Removed: abort controller, rate limit check, raw fetch with signal.
// Kept: invalidate home-overview, toast on success/error.
//
// ADR-211: native Monte Carlo engine replaces external PrimeDope fetch.
// =============================================================================

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/queryClient";

export interface VarianceSimulationInput {
  groups: Array<{
    name: string;
    buyIn: number;
    field: number;
    roi: number;
    count: number;
    isPKO: boolean;
  }>;
  weeks: 1 | 4 | 12 | 52;
  simulations?: number;
  seed?: number;
}

export function usePrimedopeSimulation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation<any, Error, any>({
    mutationFn: async (input: any) => {
      const csrf = getCsrfToken();
      const res = await fetch("/api/variance/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const text = await res.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (!res.ok) {
        const err = new Error(
          (body && body.message) || `simulate HTTP ${res.status}`,
        );
        (err as any).statusCode = res.status;
        (err as any).body = body;
        throw err;
      }
      return body;
    },
    onSuccess: (data) => {
      try {
        queryClient.invalidateQueries({
          queryKey: ["home-overview"],
          refetchType: "none",
        });
      } catch {}
      try {
        const pct = data?.profitablePct;
        const ev = data?.ev;
        toast({
          title: "Simulacao concluida",
          description: `Chance de lucro: ${typeof pct === "number" ? pct.toFixed(1) : "?"}% | EV: $${typeof ev === "number" ? ev.toFixed(0) : "?"}`,
        });
      } catch {}
    },
    onError: (err: any) => {
      try {
        toast({
          title: "Falha na simulacao",
          description: err?.message ?? "Tente novamente.",
          variant: "destructive" as any,
        });
      } catch {}
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    data: mutation.data,
    error: mutation.error,
  };
}

export default usePrimedopeSimulation;
