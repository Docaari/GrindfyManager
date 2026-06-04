// =============================================================================
// ScoreboardHero — "Placar da Semana" (ADR-241 M1). Veredito de PROCESSO em 3s:
// "Voce esta ganhando o jogo da semana?" derivado da maioria dos status das
// medidas. + faixa de consistencia (streak, dias preenchidos). RF-06: zero P&L.
// =============================================================================

import { Flame, Trophy, TrendingDown, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ConsistencyData {
  currentStreak: number;
  longestStreak: number;
  daysFilledThisWeek: number;
  daysElapsedThisWeek: number;
  daysFilledThisMonth: number;
  daysElapsedThisMonth: number;
}

interface ScoreboardHeroProps {
  measuresStatuses: string[];
  consistency: ConsistencyData | null;
  onRegisterToday: () => void;
}

const WINNING = new Set(["ahead", "on_track", "achieved"]);

export function ScoreboardHero({ measuresStatuses, consistency, onRegisterToday }: ScoreboardHeroProps) {
  const total = measuresStatuses.length;
  const onTrack = measuresStatuses.filter((s) => WINNING.has(s)).length;
  const winning = total > 0 && onTrack >= Math.ceil(total / 2);

  const accent = winning
    ? "from-emerald-500/15 to-emerald-500/5 border-emerald-600/40"
    : "from-amber-500/15 to-amber-500/5 border-amber-600/40";
  const Icon = winning ? Trophy : TrendingDown;
  const iconCls = winning ? "text-emerald-400" : "text-amber-400";
  const title = winning ? "Voce esta ganhando o jogo da semana" : "Voce esta atras no jogo da semana";

  return (
    <div
      data-testid="metas-hero"
      className={`rounded-xl border bg-gradient-to-br ${accent} p-5`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-lg bg-background/40 p-2 ${iconCls}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-tight text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">
              {total > 0 ? (
                <>
                  <strong className="text-foreground">{onTrack}</strong> de{" "}
                  <strong className="text-foreground">{total}</strong> medidas no ritmo
                </>
              ) : (
                "Defina suas medidas de direcao para comecar a marcar o placar."
              )}
            </p>
          </div>
        </div>
        <Button onClick={onRegisterToday} data-testid="metas-register-today" className="shrink-0">
          <CalendarCheck className="mr-1.5 h-4 w-4" />
          Registrar hoje
        </Button>
      </div>

      {consistency ? (
        <div
          data-testid="metas-consistency"
          className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border/40 pt-3 text-sm"
        >
          <span className="inline-flex items-center gap-1.5">
            <Flame className={consistency.currentStreak > 0 ? "h-4 w-4 text-orange-400" : "h-4 w-4 text-muted-foreground"} />
            <strong className="text-foreground">{consistency.currentStreak}</strong>
            <span className="text-muted-foreground">{consistency.currentStreak === 1 ? "dia seguido" : "dias seguidos"}</span>
          </span>
          <span className="text-muted-foreground">
            <strong className="text-foreground">{consistency.daysFilledThisWeek}</strong>/{consistency.daysElapsedThisWeek} dias na semana
          </span>
          <span className="text-muted-foreground">
            <strong className="text-foreground">{consistency.daysFilledThisMonth}</strong>/{consistency.daysElapsedThisMonth} no mes
          </span>
          {consistency.longestStreak > 0 ? (
            <span className="text-muted-foreground">melhor serie: {consistency.longestStreak}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default ScoreboardHero;
