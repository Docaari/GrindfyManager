// =============================================================================
// Sprint F4 W1 — usePrimedopeSimulation hook (RF-04, RF-05, RF-24)
//
// useMutation -> POST /api/primedope/simulate
// + AbortController (cancel)
// + onSuccess: setQueryData no cache TanStack
// + onError: tracker.emit + toast
//
// Reviewer fix HIGH #2: injetar X-CSRF-Token header manualmente.
// Mantemos raw fetch (em vez de apiRequest) porque AbortController/signal nao
// e suportado pelo helper compartilhado, e POST /simulate precisa cancelavel
// (RF-05). Refresh-on-401 ainda nao acoplado aqui — em caso de 401 a UI
// recebe error e cabe ao componente tratar; cobertura adicional fica como
// divida tecnica.
// =============================================================================

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { emit as trackerEmit } from "@/lib/tracker";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/queryClient";

export interface SimulateBucketInput {
  name: string;
  network: string;
  count: number;
  buyinOriginal: number;
  currency: string;
  playersAvg: number;
  placesPaid: number;
  rakePct: number;
  roiPct: number;
  walletMissing?: boolean;
}

export interface SimulateInput {
  profileLetter: "A" | "B" | "C";
  dayOfWeek: number;
  multiplier: 1 | 4 | 12 | 52;
  bankrollUsd: number;
  buckets: SimulateBucketInput[];
  force?: boolean;
}

export interface SimulationResultPayload {
  source: "primedope" | "cache" | "fallback-stale";
  data: any;
  histogramUrl?: string;
  randomRunsUrl?: string;
  latencyMs: number;
  inputHash?: string;
  runId?: string;
  cacheHit?: boolean;
  staleAgeMs?: number;
  cachedAtMs?: number;
}

export class PrimedopeSimulationError extends Error {
  statusCode: number;
  errorType?: string;
  retryAfterMs?: number;
  inputHash?: string;
  body?: any;
  constructor(
    message: string,
    init: {
      statusCode: number;
      errorType?: string;
      retryAfterMs?: number;
      inputHash?: string;
      body?: any;
    },
  ) {
    super(message);
    this.name = "PrimedopeSimulationError";
    this.statusCode = init.statusCode;
    this.errorType = init.errorType;
    this.retryAfterMs = init.retryAfterMs;
    this.inputHash = init.inputHash;
    this.body = init.body;
  }
}

export function usePrimedopeSimulation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const acRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      try {
        acRef.current?.abort();
      } catch {}
    };
  }, []);

  const mutation = useMutation<SimulationResultPayload, Error, SimulateInput>({
    mutationFn: async (input: SimulateInput) => {
      // Cancel previous if any
      try {
        acRef.current?.abort();
      } catch {}
      const ac = new AbortController();
      acRef.current = ac;
      const csrf = getCsrfToken();
      const res = await fetch("/api/primedope/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        credentials: "include",
        body: JSON.stringify(input),
        signal: ac.signal,
      });
      const text = await res.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (!res.ok) {
        const err = new PrimedopeSimulationError(
          (body && body.message) || `simulate HTTP ${res.status}`,
          {
            statusCode: res.status,
            errorType: body?.errorType,
            retryAfterMs: body?.retryAfterMs,
            inputHash: body?.inputHash,
            body,
          },
        );
        throw err;
      }
      return body as SimulationResultPayload;
    },
    onSuccess: (data, vars) => {
      try {
        queryClient.setQueryData(
          ["primedope-simulation", vars.profileLetter, vars.dayOfWeek],
          data,
        );
      } catch {}
      // refetchType: 'none' marca stale sem refetch — Home so refetch quando user voltar.
      try {
        queryClient.invalidateQueries({
          queryKey: ["/api/home/overview"],
          refetchType: 'none',
        });
      } catch {}
    },
    onError: (err: any) => {
      try {
        trackerEmit("primedope_simulation_error", {
          errorType: err?.errorType ?? "client_unknown",
          statusCode: err?.statusCode ?? 0,
        });
      } catch {}
      try {
        toast({
          title: "Falha na simulacao",
          description: err?.message ?? "Tente novamente em alguns segundos.",
          variant: "destructive" as any,
        });
      } catch {}
    },
  });

  const abort = React.useCallback(() => {
    try {
      acRef.current?.abort();
    } catch {}
  }, []);

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    data: mutation.data,
    error: mutation.error,
    abort,
  };
}

export default usePrimedopeSimulation;
