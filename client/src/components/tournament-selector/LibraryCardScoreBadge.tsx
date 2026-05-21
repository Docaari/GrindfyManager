/**
 * Tournament Selector — LibraryCardScoreBadge (RF-05, refactor TS-3 RF-06)
 *
 * Badge de score nos cards da TournamentLibraryNew. Server (RF-06) sempre
 * envia `selectorGrade` quando `selectorScore != null`. NAO ha mais
 * `inferGradeFromScore` local — server e fonte unica de verdade.
 */

import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { getGradeColor, formatScore } from '../../lib/scoringHelpers';
import type { GradeLetter } from '../../../../shared/scoring';

export interface LibraryCardScoreBadgeProps {
  selectorScore: number | null | undefined;
  selectorGrade?: GradeLetter | string | null;
  rationale?: string | null;
}

export function LibraryCardScoreBadge({
  selectorScore,
  selectorGrade,
  rationale,
}: LibraryCardScoreBadgeProps) {
  if (selectorScore == null) return null;

  // RF-06: server obriga selectorGrade quando score != null. Drift defensivo:
  // DEV throws (catches bug em desenvolvimento); PROD warn + render null.
  if (selectorGrade == null) {
    const msg =
      "LibraryCardScoreBadge: selectorScore presente mas selectorGrade ausente. " +
      "Server deve sempre enviar grade junto. (RF-06 — sem inferGradeFromScore local)";
    if (process.env.NODE_ENV !== "production") {
      throw new Error(msg);
    }
    console.warn(msg);
    return null;
  }

  const grade = selectorGrade as GradeLetter;
  const color = getGradeColor(grade);

  const badge = (
    <Badge
      className={`${color.bg} ${color.text} font-semibold`}
      data-testid="library-card-score-badge"
      aria-label={`Score ${formatScore(selectorScore)} grade ${grade}`}
    >
      {grade} {formatScore(selectorScore)}
    </Badge>
  );

  if (!rationale) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{rationale}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
