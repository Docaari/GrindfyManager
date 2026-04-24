/**
 * Tournament Selector — SelectorPanel
 *
 * Container que junta filtros + lista de SelectorCard. Cuida de loading,
 * erro, vazio e cold start banners.
 */

import { useState } from 'react';
import { AlertTriangle, Info, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { SelectorCard } from './SelectorCard';
import { SelectorFilters } from './SelectorFilters';
import { SelectorDetailsModal } from './SelectorDetailsModal';
import {
  useTournamentSelector,
  type TournamentSelectorFilters,
  buildSelectorQueryKey,
} from '../../hooks/useTournamentSelector';
import { useQueryClient } from '@tanstack/react-query';
import type { SelectorTournament } from '../../../../shared/scoring';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface SelectorPanelProps {
  initialDate?: string;
}

export function SelectorPanel({ initialDate }: SelectorPanelProps) {
  const [filters, setFilters] = useState<TournamentSelectorFilters>({
    date: initialDate ?? todayISO(),
    sources: 'suprema,library',
    minScore: 0,
    minSample: 0,
    bankrollFilter: false,
    lookbackDays: 90,
  });
  const [selected, setSelected] = useState<SelectorTournament | null>(null);

  const queryClient = useQueryClient();
  const queryKey = buildSelectorQueryKey(filters);
  const { data, isLoading, isError, error, refetch, isFetching } = useTournamentSelector(filters);

  const bankrollConfigured = data?.bankrollConfigured ?? false;
  const supremaUnavailable = data?.warnings?.includes('suprema_unavailable') ?? false;
  const coldStart = data?.playerProfile?.coldStart ?? false;

  return (
    <div className="space-y-4" data-testid="selector-panel">
      <SelectorFilters
        filters={filters}
        onChange={setFilters}
        bankrollConfigured={bankrollConfigured}
      />

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground" data-testid="selector-panel-summary">
          {data
            ? `${data.totalReturned} de ${data.totalAvailable} torneios`
            : isLoading
              ? 'Calculando ranking...'
              : ''}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey });
            refetch();
          }}
          data-testid="selector-panel-refresh"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {coldStart === 'pure' && (
        <Alert data-testid="selector-cold-start-pure" className="border-orange-500">
          <Info className="w-4 h-4" />
          <AlertTitle>Importe mais historico</AlertTitle>
          <AlertDescription>
            Voce tem poucos torneios importados. O ranking esta usando uma heuristica generica —
            importe pelo menos 50 torneios para receber recomendacoes personalizadas.
          </AlertDescription>
        </Alert>
      )}
      {coldStart === 'partial' && (
        <Alert data-testid="selector-cold-start-partial" className="border-yellow-500">
          <Info className="w-4 h-4" />
          <AlertTitle>Personalizando recomendacoes</AlertTitle>
          <AlertDescription>
            Estamos comecando a personalizar — o ranking vai ficar mais preciso conforme voce
            joga mais torneios.
          </AlertDescription>
        </Alert>
      )}

      {supremaUnavailable && (
        <Alert variant="destructive" data-testid="selector-suprema-unavailable">
          <AlertTriangle className="w-4 h-4" />
          <AlertTitle>Suprema offline</AlertTitle>
          <AlertDescription>
            Nao conseguimos carregar a programacao da Suprema. Mostrando apenas torneios da biblioteca.
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3" data-testid="selector-panel-loading">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : isError ? (
        <Alert variant="destructive" data-testid="selector-panel-error">
          <AlertTitle>Erro ao carregar</AlertTitle>
          <AlertDescription>
            {(error as Error)?.message ?? 'Falha ao buscar dados do Tournament Selector.'}
          </AlertDescription>
          <Button size="sm" className="mt-2" onClick={() => refetch()} data-testid="selector-panel-retry">
            Tentar novamente
          </Button>
        </Alert>
      ) : !data || data.tournaments.length === 0 ? (
        <Alert data-testid="selector-panel-empty">
          <Info className="w-4 h-4" />
          <AlertTitle>Nenhum torneio disponivel</AlertTitle>
          <AlertDescription>
            Tente alterar a data, ajustar os filtros, ou importar mais opcoes para sua biblioteca.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-3" data-testid="selector-panel-list">
          {data.tournaments.map((t) => (
            <SelectorCard
              key={`${t.source}-${t.id}`}
              tournament={t}
              onOpenDetails={setSelected}
              filtersApplied={filters as any}
              invalidateQueryKey={queryKey}
            />
          ))}
        </div>
      )}

      <SelectorDetailsModal
        tournament={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </div>
  );
}
