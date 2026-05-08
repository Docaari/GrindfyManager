/**
 * useThemeSearch — Sprint Estudos-Habito-1 (RF-1.1).
 *
 * Hook autocomplete de themes para o StudyLogDialog.
 *
 * - GET /api/study-themes -> retorna array (curated + user custom).
 * - Busca por substring case-insensitive.
 * - Curated themes ordenados antes de user custom.
 *
 * Lessons:
 *   #1  hooks first
 *   #30 hook test em .test.ts roda em jsdom
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

export interface ThemeSearchItem {
  id: string;
  name: string;
  isCurated?: boolean;
  slug?: string | null;
  color?: string;
  emoji?: string;
}

export interface UseThemeSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: ThemeSearchItem[];
  isLoading: boolean;
}

async function fetchThemes(): Promise<ThemeSearchItem[]> {
  const res = await fetch("/api/study-themes", { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  if (Array.isArray(data)) return data as ThemeSearchItem[];
  if (Array.isArray((data as any)?.items)) return (data as any).items;
  return [];
}

export function useThemeSearch(): UseThemeSearchReturn {
  const [query, setQuery] = React.useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/study-themes"],
    queryFn: fetchThemes,
    staleTime: 60_000,
    retry: false,
  });

  const results = React.useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    const filtered = query
      ? list.filter((t) => (t.name || "").toLowerCase().includes(query.toLowerCase()))
      : list;
    // Curated antes de custom.
    return [...filtered].sort((a, b) => {
      const ac = a.isCurated ? 0 : 1;
      const bc = b.isCurated ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [data, query]);

  return { query, setQuery, results, isLoading };
}

export default useThemeSearch;
