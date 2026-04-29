// =============================================================================
// Sprint F4 W1 — PrimedopeOnboardingCards (RF-16, ADR-056)
//
// 3 cards educativos com dismiss em localStorage.
// =============================================================================

import * as React from "react";
import { Button } from "@/components/ui/button";

const KEY_MASTER = "primedope_onboarding_dismissed";
const KEY_CARD = (n: number) => `primedope_onboarding_dismissed_card_${n}`; // 1..3

interface PrimedopeOnboardingCardsProps {
  onCtaClick?: () => void;
  hasRunsHistory?: boolean;
}

interface CardDef {
  index: number; // 0..2
  storageKey: number; // 1..3
  title: string;
  description: string;
}

const CARDS: CardDef[] = [
  {
    index: 0,
    storageKey: 1,
    title: "O que e variance simulation?",
    description:
      "Simulacao Monte Carlo da sua grade: quantifica variancia e probabilidade de runs ruins antes de jogar.",
  },
  {
    index: 1,
    storageKey: 2,
    title: "Como ler RoR (Risk of Ruin)?",
    description:
      "RoR mostra a chance de zerar a banca dado o volume e ROI esperado. Quanto menor, mais sustentavel.",
  },
  {
    index: 2,
    storageKey: 3,
    title: "Diferenca ROI vs EV?",
    description:
      "ROI e relativo ao buy-in (em %). EV e o valor esperado em USD por unidade de tempo. Ambos sao usados em conjunto.",
  },
];

function readFlag(key: string): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function setFlag(key: string, value: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {}
}

export function PrimedopeOnboardingCards({
  onCtaClick,
  hasRunsHistory = false,
}: PrimedopeOnboardingCardsProps): React.ReactElement | null {
  // Hooks ANTES de early-return (Rules of Hooks)
  const [tick, setTick] = React.useState(0);
  const masterDismissed = readFlag(KEY_MASTER);
  const dismissedCards = React.useMemo(
    () => CARDS.map((c) => readFlag(KEY_CARD(c.storageKey))),
    [tick],
  );

  const remaining = CARDS.filter((_, i) => !dismissedCards[i]);

  // Auto-master: quando todos os 3 individuais sao dismissed, auto-set master flag
  React.useEffect(() => {
    if (masterDismissed) return;
    if (dismissedCards.every(Boolean)) {
      setFlag(KEY_MASTER, "1");
      setTick((t) => t + 1);
    }
  }, [dismissedCards, masterDismissed]);

  if (hasRunsHistory) return null;
  if (masterDismissed) return null;
  if (remaining.length === 0) return null;

  const handleDismissCard = (storageKey: number) => {
    setFlag(KEY_CARD(storageKey), "1");
    setTick((t) => t + 1);
  };

  const handleCta = () => {
    setFlag(KEY_MASTER, "1");
    setTick((t) => t + 1);
    onCtaClick?.();
  };

  const handleMasterDismiss = () => {
    setFlag(KEY_MASTER, "1");
    setTick((t) => t + 1);
  };

  return (
    <section
      data-testid="primedope-onboarding"
      className="rounded-lg border border-border bg-card p-4 space-y-3"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Conheca o variance simulation</h2>
        <button
          type="button"
          data-testid="primedope-onboarding-master-dismiss"
          onClick={handleMasterDismiss}
          className="text-xs text-muted-foreground hover:underline"
        >
          Nao mostrar mais
        </button>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {CARDS.map((c) => {
          if (dismissedCards[c.index]) return null;
          return (
            <div
              key={c.storageKey}
              data-testid={`primedope-onboarding-card-${c.index}`}
              className="rounded-md border border-border bg-background p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium">{c.title}</h3>
                <button
                  type="button"
                  data-testid={`primedope-onboarding-card-${c.index}-dismiss`}
                  onClick={() => handleDismissCard(c.storageKey)}
                  aria-label="Dispensar"
                  className="text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{c.description}</p>
            </div>
          );
        })}
      </div>

      <div className="pt-2">
        <Button
          data-testid="primedope-onboarding-cta"
          variant="default"
          onClick={handleCta}
        >
          Comece sua primeira simulacao
        </Button>
      </div>
    </section>
  );
}

export default PrimedopeOnboardingCards;
