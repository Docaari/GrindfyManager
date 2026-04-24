/**
 * Tournament Selector — SelectorCard (RF-04)
 *
 * Card de torneio ranqueado pelo Tournament Selector. Mostra score, grade,
 * rationale, sinais primarios e botao para adicionar a grade.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trophy, Star, CheckCircle2, AlertCircle, XCircle, HelpCircle, Plus, Check } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useToast } from '../../hooks/use-toast';
import { apiRequest } from '../../lib/queryClient';
import {
  getGradeColor,
  getGradeLabel,
  getConfidenceLabel,
  formatScore,
} from '../../lib/scoringHelpers';
import type { SelectorTournament } from '../../../../shared/scoring';

const GRADE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  trophy: Trophy,
  star: Star,
  check: CheckCircle2,
  alert: AlertCircle,
  x: XCircle,
  help: HelpCircle,
};

export interface SelectorCardProps {
  tournament: SelectorTournament;
  onAdded?: (t: SelectorTournament) => void;
  onOpenDetails?: (t: SelectorTournament) => void;
  filtersApplied?: Record<string, unknown>;
  invalidateQueryKey?: readonly unknown[];
}

export function SelectorCard({
  tournament,
  onAdded,
  onOpenDetails,
  filtersApplied,
  invalidateQueryKey,
}: SelectorCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const color = getGradeColor(tournament.grade);
  const Icon = GRADE_ICON_MAP[color.icon] ?? HelpCircle;

  const addMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/planned-tournaments', {
        dayOfWeek: tournament.dayOfWeek,
        site: tournament.site,
        time: tournament.time,
        type: tournament.category ?? 'PKO',
        speed: tournament.speed,
        name: tournament.name,
        buyIn: String(tournament.buyIn),
        externalId: tournament.source === 'suprema' ? tournament.id : null,
        libraryTemplateId: tournament.source === 'library' ? tournament.id : null,
        metadata: {
          fromSelector: true,
          selectorScore: tournament.score,
          selectorGrade: tournament.grade,
          selectorConfidence: tournament.confidence,
          selectorSignals: tournament.signals,
          filtersApplied: filtersApplied ?? null,
          bankrollOk: tournament.bankrollOk,
        },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Adicionado a grade',
        description: `Score ${tournament.score} (${tournament.grade} - ${getGradeLabel(tournament.grade)})`,
      });
      if (invalidateQueryKey) {
        queryClient.invalidateQueries({ queryKey: invalidateQueryKey });
      }
      queryClient.invalidateQueries({ queryKey: ['planned-tournaments'] });
      onAdded?.(tournament);
    },
    onError: (err: any) => {
      const status = err?.response?.status;
      const message = status === 403
        ? 'Limite do plano atingido. Faca upgrade para adicionar mais torneios.'
        : err?.message ?? 'Erro ao adicionar torneio a grade.';
      toast({ title: 'Falha', description: message, variant: 'destructive' });
    },
  });

  const buttonDisabled = tournament.alreadyInGrid || addMutation.isPending;
  const buttonLabel = tournament.alreadyInGrid
    ? 'Ja na grade'
    : addMutation.isPending
      ? 'Adicionando...'
      : 'Adicionar a grade';

  return (
    <Card data-testid="selector-card" className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Score badge */}
          <div className={`flex flex-col items-center justify-center rounded-lg ${color.bg} ${color.text} p-3 min-w-[70px]`}
            data-testid="selector-card-grade-badge"
            aria-label={`Grade ${tournament.grade} - ${getGradeLabel(tournament.grade)}`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-2xl font-bold leading-none mt-1">{formatScore(tournament.score)}</span>
            <span className="text-xs font-semibold mt-0.5">{tournament.grade}</span>
          </div>

          {/* Body */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold truncate" data-testid="selector-card-name">{tournament.name}</h3>
              <span className="text-sm font-medium whitespace-nowrap" data-testid="selector-card-buyin">
                ${tournament.buyIn.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              <span>{tournament.site}</span>
              <span>•</span>
              <span>{tournament.time}</span>
              {tournament.speed && (
                <>
                  <span>•</span>
                  <span>{tournament.speed}</span>
                </>
              )}
              {tournament.category && (
                <>
                  <span>•</span>
                  <span>{tournament.category}</span>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground italic mt-2" data-testid="selector-card-rationale">
              {tournament.rationale}
            </p>

            {/* Warnings */}
            <div className="flex flex-wrap gap-1.5 mt-2" data-testid="selector-card-warnings">
              {!tournament.bankrollOk && (
                <Badge variant="destructive" data-testid="warn-bankroll">Fora do bankroll</Badge>
              )}
              {tournament.warnings.includes('unfamiliar_site') && (
                <Badge variant="outline" data-testid="warn-site">Site novo</Badge>
              )}
              {tournament.warnings.includes('never_played_category') && (
                <Badge variant="outline" data-testid="warn-category">Categoria nunca jogada</Badge>
              )}
              {tournament.warnings.includes('low_sample') && (
                <Badge variant="outline" data-testid="warn-sample">Baixa amostra</Badge>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary" data-testid="confidence-badge">
                      {getConfidenceLabel(tournament.confidence)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Confianca derivada do tamanho de amostra dos buckets primarios (buy-in + categoria).
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3">
          <Button
            variant={tournament.alreadyInGrid ? 'outline' : 'default'}
            size="sm"
            onClick={() => addMutation.mutate()}
            disabled={buttonDisabled}
            aria-label={buttonLabel}
            data-testid="selector-card-add-button"
          >
            {tournament.alreadyInGrid ? (
              <Check className="w-4 h-4 mr-1" />
            ) : (
              <Plus className="w-4 h-4 mr-1" />
            )}
            {buttonLabel}
          </Button>
          {onOpenDetails && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenDetails(tournament)}
              data-testid="selector-card-details-button"
              aria-label="Ver detalhes do score"
            >
              Detalhes
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
