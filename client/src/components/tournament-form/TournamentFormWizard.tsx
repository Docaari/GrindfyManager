import { useState } from "react";
import WizardStep1Type from "./WizardStep1Type";
import WizardStep2Modifiers from "./WizardStep2Modifiers";
import WizardStep3Conditional from "./WizardStep3Conditional";
import WizardStep4Common from "./WizardStep4Common";
import WizardBadges from "./WizardBadges";
import WizardNav from "./WizardNav";
import type { TournamentPrimaryType } from "@shared/tournamentTypes";

// =============================================================================
// Sprint 2 - RF-06: TournamentFormWizard
//
// State machine 4 steps:
//   1. Tipo primario (Vanilla/PKO/Mystery/Satellite)
//   2. Modificadores (isFlight, isLive)
//   3. Campos condicionais (skip auto se Vanilla puro)
//   4. Campos comuns (site, time, buyIn, etc.)
//
// Submit no Step 4 chama onSubmit(payload).
// =============================================================================

export interface TournamentFormWizardValue {
  type: TournamentPrimaryType | null;
  isFlight: boolean;
  isLive: boolean;
  // Campos comuns
  site: string;
  time: string;
  buyIn: string;
  name: string;
  guaranteed: string;
  position: number | null;
  prize: string;
  fieldSize: string;
  allowsAddOn: boolean;
  addOnCost: string;
  allowsReentry: boolean;
  maxReentries: number | null;
  // Campos condicionais — todos opcionais
  satelliteRewardType?: string | null;
  satelliteTargetTemplateId?: string | null;
  satelliteTargetName?: string;
  satelliteTicketValue?: string;
  satelliteExtraCash?: string;
  flightDay?: string;
  flightAdvanced?: boolean | null;
  flightParentId?: string | null;
  packageBuyIn?: string;
  packageAccommodation?: string;
  packageTravel?: string;
  packageMeals?: string;
  packageOther?: string;
  packageNotes?: string;
}

export interface TournamentFormWizardProps {
  initialValue?: Partial<TournamentFormWizardValue>;
  onSubmit: (payload: any) => void;
  isSubmitting?: boolean;
  errors?: Record<string, string | undefined>;
}

const DEFAULT_VALUE: TournamentFormWizardValue = {
  type: null,
  isFlight: false,
  isLive: false,
  site: "",
  time: "",
  buyIn: "",
  name: "",
  guaranteed: "",
  position: null,
  prize: "",
  fieldSize: "",
  allowsAddOn: false,
  addOnCost: "",
  allowsReentry: false,
  maxReentries: null,
  satelliteRewardType: null,
  satelliteTargetTemplateId: null,
  satelliteTargetName: "",
  satelliteTicketValue: "",
  satelliteExtraCash: "",
  flightDay: "",
  flightAdvanced: null,
  flightParentId: null,
  packageBuyIn: "",
  packageAccommodation: "",
  packageTravel: "",
  packageMeals: "",
  packageOther: "",
  packageNotes: "",
};

export default function TournamentFormWizard({
  initialValue,
  onSubmit,
  isSubmitting,
}: TournamentFormWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [value, setValue] = useState<TournamentFormWizardValue>({
    ...DEFAULT_VALUE,
    ...(initialValue ?? {}),
  });

  const showStep3 =
    value.type === "Satellite" || value.isFlight === true || value.isLive === true;

  const canAdvance =
    step === 1 ? value.type !== null : step === 4 ? true : true;

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(showStep3 ? 3 : 4);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 4) setStep(showStep3 ? 3 : 2);
  };

  const handleSubmit = () => {
    onSubmit({ ...value });
  };

  return (
    <div data-testid="tournament-form-wizard" data-current-step={step} className="space-y-6">
      {/* Header com badges sempre visiveis (atualizam em tempo real) */}
      {value.type && (
        <div className="flex items-center gap-3">
          <WizardBadges
            type={value.type}
            isFlight={value.isFlight}
            isLive={value.isLive}
          />
        </div>
      )}

      <div data-testid="wizard-current-step" data-step={step}>
        {step === 1 && (
          <WizardStep1Type
            value={value.type}
            onChange={(t) => setValue((v) => ({ ...v, type: t }))}
          />
        )}
        {step === 2 && (
          <WizardStep2Modifiers
            value={{ isFlight: value.isFlight, isLive: value.isLive }}
            onChange={(next) =>
              setValue((v) => ({ ...v, isFlight: next.isFlight, isLive: next.isLive }))
            }
          />
        )}
        {step === 3 && value.type && (
          <WizardStep3Conditional
            value={{ ...value, type: value.type }}
            onChange={(next) => setValue((v) => ({ ...v, ...next }))}
            onSkip={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <WizardStep4Common
            value={{
              site: value.site,
              time: value.time,
              buyIn: value.buyIn,
              name: value.name,
              guaranteed: value.guaranteed,
              position: value.position,
              prize: value.prize,
              fieldSize: value.fieldSize,
              allowsAddOn: value.allowsAddOn,
              addOnCost: value.addOnCost,
              allowsReentry: value.allowsReentry,
              maxReentries: value.maxReentries,
            }}
            onChange={(next) => setValue((v) => ({ ...v, ...next }))}
          />
        )}
      </div>

      <WizardNav
        currentStep={step}
        totalSteps={4}
        canAdvance={canAdvance}
        onBack={handleBack}
        onNext={handleNext}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
