/**
 * useSetupItems — Reform 2026-05-05 (ADR-120).
 *
 * GET /api/user-settings (le warmupSetupItems)
 * PUT /api/user-settings/warmup-setup-items (persiste lista custom)
 *
 * Substitui setupItemsStore localStorage. Defaults aplicados client-side
 * quando server retorna null.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { DEFAULT_SETUP_ITEMS } from "@/components/warmup/setupItemsStore";

interface UserSettingsResponse {
  warmupSetupItems: string[] | null;
  [key: string]: any;
}

const QUERY_KEY = ["/api/user-settings"];

export function useSetupItems() {
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
    mutationFn: async (items: string[] | null) => {
      return apiRequest("PUT", "/api/user-settings/warmup-setup-items", { items });
    },
    onSuccess: (data: any) => {
      qc.setQueryData(QUERY_KEY, (old: UserSettingsResponse | null | undefined) => ({
        ...(old ?? {}),
        warmupSetupItems: data?.items ?? null,
      }));
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const persisted = query.data?.warmupSetupItems ?? null;
  const items = persisted && persisted.length > 0 ? persisted : DEFAULT_SETUP_ITEMS.slice();

  return {
    items,
    isLoading: query.isLoading,
    save: async (next: string[] | null) => {
      return mutation.mutateAsync(next);
    },
    isSaving: mutation.isPending,
  };
}
