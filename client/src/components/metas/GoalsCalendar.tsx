// =============================================================================
// GoalsCalendar — calendario de metas (ADR-241), inspirado no ResultsCalendar
// do new-nash. Grid mensal date-fns. Cor da celula = ESTADO DE PROCESSO do
// relatorio do dia (preenchido / parcial / vazio). RF-06: NUNCA cor por P&L.
// Clicar num dia chama onDayClick(YMD).
// =============================================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  isFuture,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { isDailyLogFilled } from "@shared/goals";
import { localYmd } from "@/components/metas/metaUi";

export interface DailyLogLite {
  logDate: string; // YYYY-MM-DD
  note?: string | null;
  tournamentsPlayed?: number | null;
  studyHours?: number | null;
  measuresExercised?: Array<{ measureId: string }> | null;
  learning?: string | null;
  didGood?: string | null;
  didBad?: string | null;
}

interface GoalsCalendarProps {
  logsByDate: Record<string, DailyLogLite>;
  onDayClick: (ymd: string) => void;
  onMonthChange?: (monthStartYmd: string, monthEndYmd: string) => void;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

export function GoalsCalendar({ logsByDate, onDayClick, onMonthChange }: GoalsCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const goToMonth = (next: Date) => {
    setCurrentMonth(next);
    onMonthChange?.(localYmd(startOfMonth(next)), localYmd(endOfMonth(next)));
  };

  return (
    <div data-testid="goals-calendar">
      <div className="mb-3 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="goals-calendar-prev"
          onClick={() => goToMonth(subMonths(currentMonth, 1))}
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold capitalize" data-testid="goals-calendar-month">
          {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="goals-calendar-next"
          onClick={() => goToMonth(addMonths(currentMonth, 1))}
          aria-label="Proximo mes"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 text-center text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {days.map((day) => {
          const key = localYmd(day);
          const log = logsByDate[key];
          const filled = isDailyLogFilled(log);
          const inMonth = isSameMonth(day, currentMonth);
          const future = isFuture(day) && !isToday(day);
          const disabled = future;

          const base =
            "relative flex h-16 flex-col items-start justify-start rounded-md border p-1 text-left text-xs transition";
          const tone = disabled
            ? "border-border bg-muted/20 text-muted-foreground/50 cursor-not-allowed"
            : filled
              ? "border-emerald-600/60 bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer"
              : "border-border bg-muted/30 hover:bg-muted/60 cursor-pointer";
          const dim = inMonth ? "" : "opacity-40";

          return (
            <button
              key={key}
              type="button"
              data-testid={`goals-calendar-day-${key}`}
              data-filled={filled ? "true" : "false"}
              disabled={disabled}
              onClick={() => !disabled && onDayClick(key)}
              className={`${base} ${tone} ${dim}`}
            >
              <span className={`font-medium ${isToday(day) ? "text-primary" : ""}`}>
                {day.getDate()}
              </span>
              {!disabled && (
                <span className="absolute right-1 top-1">
                  {filled ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Circle className="h-3 w-3 text-muted-foreground/40" />
                  )}
                </span>
              )}
              {filled && typeof log?.tournamentsPlayed === "number" && log.tournamentsPlayed > 0 ? (
                <span className="mt-auto text-[10px] text-muted-foreground">
                  {log.tournamentsPlayed} MTT
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default GoalsCalendar;
