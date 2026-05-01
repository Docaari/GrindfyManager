/**
 * Sprint Studies-Reform — RF-04: StatsView wrapper
 *
 * Envolve <StatsAnalyzerTab /> sem alterar internals (zona Sess 3).
 * Adiciona breadcrumb + botao "Sugerir temas baseado em leaks".
 *
 * Lessons:
 *  #11 sem default actions decorativas
 *  Isolation contract: NAO modifica StatsAnalyzerTab nem passa props customizadas.
 */

import React from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatsAnalyzerTab from '@/components/studies/StatsAnalyzerTab';

interface ActiveLeak {
  id: string;
  severity?: number;
}

export function StatsView() {
  const [, navigate] = useLocation();

  const { data: leaks = [] } = useQuery<ActiveLeak[]>({
    queryKey: ['/api/dashboard/leaks/active'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/dashboard/leaks/active', { credentials: 'include' });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
  });

  const hasLeaks = (leaks?.length ?? 0) > 0;

  function suggestThemes() {
    navigate('/estudos/temas?fromStats=leaks');
  }

  return (
    <div data-testid="studies-stats-view" className="p-6">
      <div className="flex items-center justify-between mb-4">
        <nav aria-label="Breadcrumb" className="text-sm text-gray-400">
          <span>Studies</span>
          <span className="mx-2">/</span>
          <span className="text-white">Stats Analyzer</span>
        </nav>
        <Button
          data-testid="suggest-themes-button"
          onClick={suggestThemes}
          disabled={!hasLeaks}
          title={hasLeaks ? undefined : 'Importe historicos com 50+ MTTs para detectar leaks'}
          className="bg-poker-accent text-black font-semibold"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Sugerir temas baseado em leaks
        </Button>
      </div>
      <StatsAnalyzerTab />
    </div>
  );
}

export default StatsView;
