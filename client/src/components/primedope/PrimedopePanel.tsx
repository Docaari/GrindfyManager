// =============================================================================
// Sprint F4 W1 — PrimedopePanel (B.0..B.5 wrapper)
//
// Container layout: header + onboarding + wizard + result + atribuicao.
// =============================================================================

import * as React from "react";
import { PrimedopeOnboardingCards } from "./PrimedopeOnboardingCards";
import { PrimedopeWizard } from "./PrimedopeWizard";
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
    sim.mutate({
      ...input,
      bankrollUsd,
    });
  };

  return (
    <section
      data-testid="primedope-panel"
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <header>
        <h1 className="text-xl font-semibold">PrimeDope variance simulation</h1>
      </header>

      {bankrollUsd <= 0 ? (
        <div data-testid="primedope-panel-empty-no-bankroll">
          <EmptyState
            icon="Wallet"
            title="Cadastre wallets primeiro."
            description="Para simular variance, precisamos do saldo consolidado USD."
          />
        </div>
      ) : (
        <>
          <PrimedopeOnboardingCards />
          <PrimedopeWizard
            userId={userId}
            profileLetter={profileLetter}
            dayOfWeek={dayOfWeek}
            onRun={handleRun}
          />
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
        </>
      )}

      <footer
        data-testid="primedope-panel-attribution"
        className="border-t border-border pt-2 text-center text-[10px] text-muted-foreground"
      >
        Powered by{" "}
        <a
          href="https://www.primedope.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          PrimeDope.com
        </a>
      </footer>
    </section>
  );
}

export default PrimedopePanel;
