/**
 * Tournament Selector — LibraryCardScoreBadge (RF-05)
 *
 * Badge de score que aparece nos cards da TournamentLibraryNew para os top 50
 * templates. Quando selectorScore=null, omitido.
 */

import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { getGradeColor, formatScore } from '../../lib/scoringHelpers';
import type { GradeLetter } from '../../../../shared/scoring';

function inferGradeFromScore(score: number): GradeLetter {
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

export interface LibraryCardScoreBadgeProps {
  selectorScore: number | null | undefined;
  selectorGrade?: GradeLetter | string | null;
  rationale?: string | null;
}

export function LibraryCardScoreBadge({ selectorScore, selectorGrade, rationale }: LibraryCardScoreBadgeProps) {
  if (selectorScore == null) return null;

  const grade = (selectorGrade as GradeLetter | undefined) ?? inferGradeFromScore(selectorScore);
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
