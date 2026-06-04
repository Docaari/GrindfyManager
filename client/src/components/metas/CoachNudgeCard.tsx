// =============================================================================
// CoachNudgeCard — leitura do placar pelo Coach IA (ADR-241 M5). Cadencia de
// responsabilizacao 4DX: aparece SO quando ha sinal (medida em risco/atrasada OU
// streak quebrado) e cobra o processo com linguagem A4 (sem culpa). RF-06: zero
// P&L. CTA leva ao chat do Coach. Client-side (deriva do placar + consistencia).
// =============================================================================

import { Link } from "wouter";
import { MessageSquare, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MeasureCardData } from "@/components/metas/MeasureCard";
import type { ConsistencyData } from "@/components/metas/ScoreboardHero";

interface CoachNudgeCardProps {
  measures: MeasureCardData[];
  consistency: ConsistencyData | null;
}

const AT_RISK = new Set(["behind", "at_risk"]);

// Monta a frase de cobranca (A4: descreve o comportamento, nao julga).
function buildMessage(measures: MeasureCardData[], consistency: ConsistencyData | null): string | null {
  const behind = measures.filter((m) => AT_RISK.has(m.status));
  const streakBroke = !!consistency && measures.length > 0 && consistency.currentStreak === 0;

  if (behind.length > 0) {
    const names = behind.slice(0, 2).map((m) => `"${m.title}"`).join(" e ");
    const extra = behind.length > 2 ? ` (+${behind.length - 2})` : "";
    return `${names}${extra} ${behind.length === 1 ? "esta atras" : "estao atras"} do pace desta semana. Quer montar um plano pra recuperar?`;
  }
  if (streakBroke) {
    return "Sua serie de registros zerou. Bora retomar a cadencia? Registre o dia de hoje e me chama pra revisar a semana.";
  }
  return null;
}

export function CoachNudgeCard({ measures, consistency }: CoachNudgeCardProps) {
  const message = buildMessage(measures, consistency);
  if (!message) return null;

  return (
    <div
      data-testid="metas-coach-nudge"
      className="flex flex-col gap-3 rounded-xl border border-amber-600/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-amber-500/15 p-2 text-amber-400">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">O Coach notou seu placar</p>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
      <Link href="/coach-ai">
        <Button variant="outline" className="shrink-0" data-testid="metas-coach-nudge-cta">
          <MessageSquare className="mr-1.5 h-4 w-4" />
          Falar com o Coach
        </Button>
      </Link>
    </div>
  );
}

export default CoachNudgeCard;
