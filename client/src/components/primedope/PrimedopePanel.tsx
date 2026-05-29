// =============================================================================
// Sprint F4 W1 — PrimedopePanel (B.0..B.5 wrapper)
//
// Container layout: header + onboarding + wizard + result + atribuicao.
// =============================================================================

import * as React from "react";
import { PrimedopeOnboardingCards } from "./PrimedopeOnboardingCards";
import { PrimedopeWizard } from "./PrimedopeWizard";
import AggregationWizard from "./AggregationWizard";
import { PrimedopeResult } from "./PrimedopeResult";
import { EmptyState } from "@/components/empty-state";
import { usePrimedopeSimulation } from "@/hooks/usePrimedopeSimulation";

interface PrimedopePanelProps {
  userId: string;
  bankrollUsd: number;
  profileLetter?: "A" | "B" | "C";
  dayOfWeek?: number;
}

export function PrimedopePanel({
  userId,
  bankrollUsd,
  profileLetter = "A",
  dayOfWeek = 0,
}: PrimedopePanelProps): React.ReactElement {
  const sim = usePrimedopeSimulation();

  const handleRun = (input: any) => {
    // ADR-215 D2: bankrollUsd habilita Risk of Ruin no engine
    sim.mutate({
      ...input,
      bankrollUsd: bankrollUsd > 0 ? bankrollUsd : undefined,
    });
  };

  return (
    <section
      data-testid="primedope-panel"
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <header>
        <h1 className="text-xl font-semibold">Simulador de Variância MTT</h1>
      </header>

      {/* A calculadora funciona SEM bankroll — só o Risk of Ruin precisa dele.
          Antes o painel inteiro ficava escondido se o user não tinha wallet. */}
      {bankrollUsd <= 0 ? (
        <div
          data-testid="primedope-panel-no-bankroll-hint"
          className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
        >
          Cadastre wallets pra liberar o <strong>Risk of Ruin</strong> (probabilidade
          de quebrar a banca). A simulação de variância funciona normalmente sem isso.
        </div>
      ) : null}

      <PrimedopeOnboardingCards />
      <AggregationWizard profileLetter={profileLetter} onRun={handleRun} />
      <PrimedopeResult
        result={sim.data as any}
        isLoading={sim.isPending}
        error={
          sim.error
            ? {
                statusCode: (sim.error as any)?.statusCode ?? 500,
                errorType: (sim.error as any)?.errorType,
                retryAfterMs: (sim.error as any)?.retryAfterMs,
                inputHash: (sim.error as any)?.inputHash,
                timestamp: new Date().toISOString(),
              }
            : undefined
        }
      />

      {/* VR-1 RF-05: PrimeDope attribution footer removed (native engine) */}
    </section>
  );
}

export default PrimedopePanel;
