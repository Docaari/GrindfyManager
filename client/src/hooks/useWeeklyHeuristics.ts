/**
 * useWeeklyHeuristics — Sprint W-1 (RF-22)
 *
 * Le user_settings.weeklyHeuristics e expoe save() que faz
 * PUT /api/user-settings/weekly-heuristics.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface UserSettingsResponse {
  weeklyHeuristics: [string, string, string] | null;
  drillUrl?: string;
  [key: string]: any;
}

const QUERY_KEY = ["/api/user-settings"];

export function useWeeklyHeuristics() {
  const qc = useQueryClient();

  const query = useQuery<UserSettingsResponse | null>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user-settings");
      return res ?? null;
    },
    staleTime: 60_000,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async (heuristics: [string, string, string]) => {
      return apiRequest("PUT", "/api/user-settings/weekly-heuristics", {
        heuristics,
      });
    },
    onSuccess: (data: any) => {
      // Atualiza cache otimisticamente
      qc.setQueryData(QUERY_KEY, (old: UserSettingsResponse | null | undefined) => ({
        ...(old ?? {}),
        weeklyHeuristics: data?.heuristics ?? null,
      }));
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const heuristics: [string, string, string] | null =
    query.data?.weeklyHeuristics ?? null;

  return {
    heuristics,
    isLoading: query.isLoading,
    save: async (h: [string, string, string]) => {
      return mutation.mutateAsync(h);
    },
    isSaving: mutation.isPending,
  };
}
