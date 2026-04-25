import { useEffect } from "react";
import SatelliteFieldsBlock, {
  type SatelliteFieldsValue,
} from "./conditional/SatelliteFieldsBlock";
import FlightFieldsBlock, {
  type FlightFieldsValue,
} from "./conditional/FlightFieldsBlock";
import LiveFieldsBlock, {
  type LiveFieldsValue,
} from "./conditional/LiveFieldsBlock";
import type { TournamentPrimaryType } from "@shared/tournamentTypes";

// =============================================================================
// Sprint 2 - RF-06 Step 3: Campos condicionais
//
// Sub-renderiza:
//   - SatelliteFieldsBlock se type === 'Satellite'
//   - FlightFieldsBlock se isFlight === true
//   - LiveFieldsBlock se isLive === true
//
// Skip auto: callback onSkip() quando type=Vanilla + ambos modifiers false.
// =============================================================================

export interface WizardStep3Value
  extends Partial<SatelliteFieldsValue>,
    Partial<FlightFieldsValue>,
    Partial<LiveFieldsValue> {
  type: TournamentPrimaryType;
  isFlight: boolean;
  isLive: boolean;
}

export interface WizardStep3ConditionalProps {
  value: WizardStep3Value;
  onChange: (next: WizardStep3Value) => void;
  onSkip: () => void;
}

export default function WizardStep3Conditional({
  value,
  onChange,
  onSkip,
}: WizardStep3ConditionalProps) {
  const showSatellite = value.type === "Satellite";
  const showFlight = value.isFlight === true;
  const showLive = value.isLive === true;
  const shouldSkip = !showSatellite && !showFlight && !showLive;

  useEffect(() => {
    if (shouldSkip) onSkip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldSkip]);

  if (shouldSkip) return null;

  // Default values para sub-componentes (usuario pode nao ter passado todos).
  const satelliteValue: SatelliteFieldsValue = {
    satelliteRewardType: value.satelliteRewardType ?? null,
    satelliteTargetTemplateId: value.satelliteTargetTemplateId ?? null,
    satelliteTargetName: value.satelliteTargetName ?? "",
    satelliteTicketValue: value.satelliteTicketValue ?? "",
    satelliteExtraCash: value.satelliteExtraCash ?? "",
    packageBuyIn: value.packageBuyIn ?? "",
    packageAccommodation: value.packageAccommodation ?? "",
    packageTravel: value.packageTravel ?? "",
    packageMeals: value.packageMeals ?? "",
    packageOther: value.packageOther ?? "",
    packageNotes: value.packageNotes ?? "",
  };

  const flightValue: FlightFieldsValue = {
    flightDay: value.flightDay ?? "",
    flightAdvanced: value.flightAdvanced ?? null,
    flightParentId: value.flightParentId ?? null,
  };

  const liveValue: LiveFieldsValue = {
    packageBuyIn: value.packageBuyIn ?? "",
    packageAccommodation: value.packageAccommodation ?? "",
    packageTravel: value.packageTravel ?? "",
    packageMeals: value.packageMeals ?? "",
    packageOther: value.packageOther ?? "",
    packageNotes: value.packageNotes ?? "",
  };

  return (
    <div className="space-y-4">
      {showSatellite && (
        <SatelliteFieldsBlock
          value={satelliteValue}
          onChange={(next) => onChange({ ...value, ...next })}
        />
      )}
      {showFlight && (
        <FlightFieldsBlock
          value={flightValue}
          onChange={(next) => onChange({ ...value, ...next })}
        />
      )}
      {showLive && (
        <LiveFieldsBlock
          value={liveValue}
          onChange={(next) => onChange({ ...value, ...next })}
        />
      )}
    </div>
  );
}
