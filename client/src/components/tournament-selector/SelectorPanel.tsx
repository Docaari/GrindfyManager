/**
 * Tournament Selector — SelectorPanel
 *
 * Container que junta filtros + lista de SelectorCard. Cuida de loading,
 * erro, vazio e cold start banners.
 */

import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { AlertTriangle, Info, Loader2, RefreshCw } from 'lucide-react';
import { getGradeColor } from '../../lib/scoringHelpers';
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
  DEFAULT_LOOKBACK_DAYS,
} from '../../hooks/useTournamentSelector';
import { useBankroll } from '../../hooks/useBankroll';
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
    lookbackDays: DEFAULT_LOOKBACK_DAYS,
  });
  const [selected, setSelected] = useState<SelectorTournament | null>(null);
  // TS-E polish (UX-2 2026-04-25): filtro local por grade via pill clicavel.
  // null = sem filtro (mostra todos); 'S'|'A'|'B'|'C'|'D' = filtra por grade.
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [, navigate] = useLocation();

  const queryClient = useQueryClient();
  const queryKey = buildSelectorQueryKey(filters);
  const { data, isLoading, isError, error, refetch, isFetching } = useTournamentSelector(filters);
  // TS-C (UX 2026-04-24): SelectorPanel carrega bankroll uma vez e passa
  // hardLimitUSD para cada card calcular o delta do badge.
  const { data: bankroll } = useBankroll();
  const bankrollHardLimitUSD = bankroll?.hardLimitUSD ?? bankroll?.maxBuyInUSD ?? null;

  const bankrollConfigured = data?.bankrollConfigured ?? false;
  const supremaUnavailable = data?.warnings?.includes('suprema_unavailable') ?? false;
  const coldStart = data?.playerProfile?.coldStart ?? false;

  // TS-E polish (UX-2 2026-04-25): conta torneios por grade para os pills de
  // resumo. Recalcula apenas quando data muda.
  const gradeCounts = useMemo(() => {
    const counts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    if (!data?.tournaments) return counts;
    for (const t of data.tournaments) {
      const g = t.grade as string;
      if (counts[g] !== undefined) counts[g]++;
    }
    return counts;
  }, [data?.tournaments]);

  const filteredTournaments = useMemo(() => {
    if (!data?.tournaments) return [];
    if (!gradeFilter) return data.tournaments;
    return data.tournaments.filter((t) => t.grade === gradeFilter);
  }, [data?.tournaments, gradeFilter]);

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
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Voce tem poucos torneios importados. O ranking esta usando uma heuristica generica —
              importe pelo menos 50 torneios para receber recomendacoes personalizadas.
            </span>
            <Button
              size="sm"
              onClick={() => navigate('/upload')}
              data-testid="selector-cold-start-import-cta"
              className="whitespace-nowrap"
            >
              Importar agora
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {coldStart === 'partial' && (
        <Alert data-testid="selector-cold-start-partial" className="border-yellow-500">
          <Info className="w-4 h-4" />
          <AlertTitle>Personalizando recomendacoes</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Estamos comecando a personalizar — o ranking vai ficar mais preciso conforme voce
              joga mais torneios.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/upload')}
              data-testid="selector-cold-start-import-cta"
              className="whitespace-nowrap"
            >
              Importar mais
            </Button>
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

      {/* TS-E polish (UX-2 2026-04-25): source summary pills clicaveis.
          Cada pill filtra a lista pela grade correspondente. Click no pill
          ativo desativa o filtro (toggle). */}
      {data && data.tournaments.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="selector-grade-pills">
          {(['S', 'A', 'B', 'C', 'D'] as const).map((grade) => {
            const count = gradeCounts[grade] ?? 0;
            const active = gradeFilter === grade;
            const color = getGradeColor(grade);
            return (
              <button
                key={grade}
                type="button"
                onClick={() => setGradeFilter(active ? null : grade)}
                disabled={count === 0}
                data-testid={`selector-grade-pill-${grade}`}
                aria-pressed={active}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                  active
                    ? `${color.bg} ${color.text} ring-2 ring-offset-2 ring-offset-background ring-current`
                    : count === 0
                      ? 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'
                      : `${color.bg} ${color.text} hover:brightness-110`
                }`}
              >
                <span>{grade}</span>
                <span className="bg-black/30 rounded-full px-1.5 py-0.5 tabular-nums">{count}</span>
              </button>
            );
          })}
          {gradeFilter && (
            <button
              type="button"
              onClick={() => setGradeFilter(null)}
              data-testid="selector-grade-pill-clear"
              className="inline-flex items-center rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Limpar filtro
            </button>
          )}
        </div>
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
      ) : filteredTournaments.length === 0 ? (
        <Alert data-testid="selector-panel-empty-filter">
          <Info className="w-4 h-4" />
          <AlertTitle>Nenhum torneio com grade {gradeFilter}</AlertTitle>
          <AlertDescription>
            Limpe o filtro de grade acima para ver todos os torneios.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-3" data-testid="selector-panel-list">
          {filteredTournaments.map((t) => (
            <SelectorCard
              key={`${t.source}-${t.id}`}
              tournament={t}
              onOpenDetails={setSelected}
              filtersApplied={filters as any}
              invalidateQueryKey={queryKey}
              bankrollHardLimitUSD={bankrollHardLimitUSD}
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
