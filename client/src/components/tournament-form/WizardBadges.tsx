import { Badge } from "@/components/ui/badge";
import {
  TYPE_COLORS,
  TYPE_LABELS_PT_BR,
  MODIFIER_COLORS,
  MODIFIER_LABELS_PT_BR,
  type TournamentPrimaryType,
} from "@shared/tournamentTypes";

// =============================================================================
// Sprint 2 - RF-06 WizardBadges
//
// Header com 1-3 badges:
//   - Sempre 1 badge para tipo primario
//   - +1 "Flight" se isFlight=true
//   - +1 "Live" se isLive=true
// =============================================================================

export interface WizardBadgesProps {
  type: TournamentPrimaryType;
  isFlight: boolean;
  isLive: boolean;
}

export default function WizardBadges({ type, isFlight, isLive }: WizardBadgesProps) {
  const typeColor = TYPE_COLORS[type];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        data-testid={`wizard-badge-type-${type}`}
        className={`${typeColor.bg} ${typeColor.text} border-transparent`}
      >
        {TYPE_LABELS_PT_BR[type]}
      </Badge>
      {isFlight && (
        <Badge
          data-testid="wizard-badge-mod-isFlight"
          className={`${MODIFIER_COLORS.isFlight.bg} ${MODIFIER_COLORS.isFlight.text} border-transparent`}
        >
          {MODIFIER_LABELS_PT_BR.isFlight}
        </Badge>
      )}
      {isLive && (
        <Badge
          data-testid="wizard-badge-mod-isLive"
          className={`${MODIFIER_COLORS.isLive.bg} ${MODIFIER_COLORS.isLive.text} border-transparent`}
        >
          {MODIFIER_LABELS_PT_BR.isLive}
        </Badge>
      )}
    </div>
  );
}
