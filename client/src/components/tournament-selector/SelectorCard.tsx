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
  formatBankrollOvershootLabel,
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
  /**
   * TS-C (UX 2026-04-24): limite USD da banca, passado pelo SelectorPanel
   * via useBankroll. Quando presente + tournament.buyInUSD, o badge de
   * "Fora do bankroll" exibe delta absoluto e percentual ("$25 acima (50%)").
   */
  bankrollHardLimitUSD?: number | null;
  /**
   * RF-03 (Sprint TS-3): perfil do player p/ esconder a linha "Seu ROI" em
   * cold-start (<50 torneios). Quando ausente, exibe.
   */
  playerProfile?: { totalTournaments?: number; coldStart?: any };
}

// RF-03 (TS-3): bucket dominante = sinal com maior (score * weight) excluindo
// `siteRoi` (mesma regra do scorer/rationale). Map para label PT-BR + sample.
type DominantBucket = {
  key: string;
  label: string;
  value: number;
  sample: number;
};

function pickDominantBucket(tournament: SelectorTournament): DominantBucket | null {
  const s: any = tournament.signals ?? {};
  const candidates: Array<{ key: string; label: string }> = [
    { key: "buyInRoi", label: `Buy-in ${tournament.buyIn ? `$${tournament.buyIn}` : ""}`.trim() },
    {
      key: "categoryRoi",
      label: tournament.category ?? "categoria",
    },
    { key: "speedRoi", label: tournament.speed ?? "speed" },
    { key: "dayOfWeekRoi", label: "dia da semana" },
    { key: "timeOfDayRoi", label: "horario" },
    { key: "fieldRoi", label: "field" },
  ];
  let best: { key: string; label: string; contribution: number } | null = null;
  for (const c of candidates) {
    const sig = s[c.key];
    if (!sig) continue;
    const contribution = (sig.score ?? 0) * (sig.weight ?? 0);
    if (!best || contribution > best.contribution) {
      best = { key: c.key, label: c.label, contribution };
    }
  }
  if (!best) return null;
  const sig = s[best.key];
  return {
    key: best.key,
    label: best.label,
    value: Number(sig.value ?? 0),
    sample: Number(sig.sample ?? 0),
  };
}

function isColdStart(profile?: SelectorCardProps["playerProfile"]): boolean {
  if (!profile) return false;
  const total = profile.totalTournaments ?? null;
  if (total == null) return profile.coldStart === "pure" || profile.coldStart === "partial";
  return total < 50;
}

export function SelectorCard({
  tournament,
  onAdded,
  onOpenDetails,
  filtersApplied,
  invalidateQueryKey,
  bankrollHardLimitUSD,
  playerProfile,
}: SelectorCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const color = getGradeColor(tournament.grade);
  const Icon = GRADE_ICON_MAP[color.icon] ?? HelpCircle;

  // TS-C (UX 2026-04-24): compute delta $/% contra hardLimit, se disponivel.
  const bankrollOvershootLabel = formatBankrollOvershootLabel(
    tournament.buyInUSD,
    bankrollHardLimitUSD,
  );

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

            {/* Sprint D / RF-03.4 (ADR-186) — badge ticket disponivel. */}
            {tournament.availableTicket && (
              <div
                data-testid="selector-card-ticket-badge"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 text-xs font-semibold mt-2"
                aria-label={`Ticket disponivel valor ${tournament.availableTicket.valueUsd}`}
              >
                <span>Ticket disponivel (${Number(tournament.availableTicket.valueUsd).toFixed(2)})</span>
                {(tournament.ticketBoost ?? 0) > 0 && (
                  <span className="bg-emerald-600/30 rounded-full px-1.5 py-0.5">+{tournament.ticketBoost} score</span>
                )}
              </div>
            )}

            {/* RF-03 (TS-3): linha "Seu ROI" no bucket dominante. Cold start oculta. */}
            {(() => {
              const cold = isColdStart(playerProfile) || (tournament as any).coldStart === "pure";
              if (cold) return null;
              const dom = pickDominantBucket(tournament);
              if (!dom) return null;
              const sample = dom.sample;
              const isLowSample = sample < 15;
              const sign = dom.value >= 0 ? "+" : "";
              const formattedRoi = `${sign}${dom.value.toFixed(0)}%`;
              const ariaLabel = isLowSample
                ? `Sample baixo no bucket ${dom.label}`
                : `Seu ROI em ${dom.label}: ${
                    dom.value >= 0 ? "mais" : "menos"
                  } ${Math.abs(dom.value).toFixed(0)} porcento, ${sample} amostras`;
              return (
                <div
                  data-testid="selector-card-own-roi"
                  aria-label={ariaLabel}
                  className="flex flex-wrap items-center gap-1 mt-2 text-xs text-muted-foreground sm:flex-row"
                >
                  {isLowSample ? (
                    <span>Sample baixo — Score baseado em poucos dados</span>
                  ) : (
                    <span>
                      Seu ROI em {dom.label}: <strong>{formattedRoi}</strong> ({sample} torneios)
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Warnings */}
            <div className="flex flex-wrap gap-1.5 mt-2" data-testid="selector-card-warnings">
              {/*
                Sprint TS-3 RF-04 (ADR-178): badge + linha "Acima do bankroll".
                bankrollWarning eh independente do legacy bankrollOk:
                - mode='warn' + above_hard_limit -> badge vermelho
                - mode='warn' + above_soft_limit -> badge amarelo (variant outline)
                - mode='hide' nunca mostra warning (omitido do payload)
                - mode='all' nunca mostra warning (campo eh null)
              */}
              {tournament.bankrollWarning ? (
                <Badge
                  variant={tournament.bankrollWarning.reason === "above_hard_limit" ? "destructive" : "outline"}
                  data-testid={
                    tournament.bankrollWarning.reason === "above_hard_limit"
                      ? "warn-bankroll"
                      : "warn-bankroll-soft"
                  }
                  title={`Buy-in $${tournament.bankrollWarning.buyInUSD.toFixed(0)} acima do limite $${tournament.bankrollWarning.limitUSD.toFixed(0)}`}
                >
                  {tournament.bankrollWarning.reason === "above_hard_limit"
                    ? `Acima do bankroll: buy-in $${tournament.bankrollWarning.buyInUSD.toFixed(0)} (limite $${tournament.bankrollWarning.limitUSD.toFixed(0)})`
                    : `Acima do soft: $${tournament.bankrollWarning.buyInUSD.toFixed(0)} (soft $${tournament.bankrollWarning.limitUSD.toFixed(0)})`}
                </Badge>
              ) : (
                !tournament.bankrollOk && (
                  <Badge variant="destructive" data-testid="warn-bankroll">
                    {bankrollOvershootLabel}
                  </Badge>
                )
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
