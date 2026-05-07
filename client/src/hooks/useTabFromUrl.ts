/**
 * useTabFromUrl — Sprint coach-page-reform-1 RF-01.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-01.
 *
 * Hook devolve [activeTab, setActiveTab]. Sincroniza estado com ?tab= via
 * Wouter v3 useLocation + useSearch.
 *
 * Comportamento:
 *   - default: cai em defaultTab quando ?tab= ausente.
 *   - valido: pega valor de ?tab= se for um dos validTabs.
 *   - invalido: cai em defaultTab + limpa param via replaceState.
 *   - setActiveTab: atualiza URL via setLocation com {replace: true}.
 *   - popstate: tab reage a navegacao back/forward (re-render do consumer).
 */

import { useEffect, useCallback, useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';

export function useTabFromUrl(
  validTabs: string[],
  defaultTab: string
): readonly [string, (slug: string) => void] {
  const [pathname, setLocation] = useLocation();
  const search = useSearch();

  // Le ?tab= e valida.
  const { activeTab, isInvalid } = useMemo(() => {
    const params = new URLSearchParams(search ?? '');
    const raw = params.get('tab');
    if (!raw) {
      return { activeTab: defaultTab, isInvalid: false };
    }
    if (validTabs.includes(raw)) {
      return { activeTab: raw, isInvalid: false };
    }
    return { activeTab: defaultTab, isInvalid: true };
  }, [search, validTabs, defaultTab]);

  // setActiveTab atualiza URL via setLocation com {replace: true}.
  const setActiveTab = useCallback(
    (slug: string) => {
      if (!validTabs.includes(slug)) {
        // Slug invalido: nao atualiza URL.
        return;
      }
      const params = new URLSearchParams(search ?? '');
      params.set('tab', slug);
      const path = `${pathname}?${params.toString()}`;
      setLocation(path, { replace: true });
    },
    [pathname, search, setLocation, validTabs]
  );

  // Limpa param invalido (silencioso). Apos cleanup, isInvalid vira false; nao loopa.
  useEffect(() => {
    if (!isInvalid) return;
    const params = new URLSearchParams(search ?? '');
    params.delete('tab');
    const queryStr = params.toString();
    const path = queryStr ? `${pathname}?${queryStr}` : pathname;
    setLocation(path, { replace: true });
  }, [isInvalid, pathname, search, setLocation]);

  return [activeTab, setActiveTab] as const;
}
