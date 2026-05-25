// =============================================================================
// Sprint day-detail-zoom-1 — DayHoverTooltip (RF-04 b)
//
// Spec: Docs/specs/sprint-day-detail-zoom-1.md §RF-04(b).
// ADR: Docs/architecture/decisions/210-day-detail-zoom-architecture.md §5.
//
// Tooltip Radix `delayDuration={800}` que envolve o botao "Detalhes" no header
// das colunas da WeekGrid. Lazy fetch via useDayDetail (`enabled: hovering`).
// Mostra 4 KPIs read-only (Total/ABI/Investimento/Cobertura banca).
//
// Mobile (`<768`): retorna apenas children — sem hover.
// =============================================================================

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDayDetail } from "@/hooks/useDayDetail";
import { formatUsd } from "@/lib/format-usd";

export interface DayHoverTooltipProps {
  dayOfWeek: number;
  profileLetter: "A" | "B" | "C";
  children: React.ReactNode;
}

export function DayHoverTooltip({
  dayOfWeek,
  profileLetter,
  children,
}: DayHoverTooltipProps): React.ReactElement {
  // Hooks ANTES de early return (lesson #1).
  const isMobile = useIsMobile();
  const [hovering, setHovering] = React.useState(false);
  // Lazy fetch: enabled apenas quando hovering. useDayDetail ja respeita
  // `enabled: open && ...`.
  const query = useDayDetail({
    open: hovering && !isMobile,
    profileLetter,
    dayOfWeek,
  });
  const data = (query as any)?.data;

  if (isMobile) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider delayDuration={800}>
      <Tooltip
        onOpenChange={(o) => {
          setHovering(o);
        }}
      >
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          data-testid={`day-hover-tooltip-${dayOfWeek}`}
          className="bg-gray-900 border border-gray-700 text-white p-3 rounded-md min-w-[180px]"
        >
          <div className="space-y-1 text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-gray-400">Total</span>
              <span className="text-white font-medium">
                {data?.cards?.totalTournaments ?? "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400">ABI</span>
              <span className="text-white font-medium">
                {data?.cards?.abiUsd != null
                  ? formatUsd(data.cards.abiUsd)
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400">Investimento</span>
              <span className="text-white font-medium">
                {data?.cards?.investmentUsd != null
                  ? formatUsd(data.cards.investmentUsd)
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400">Banca</span>
              <span className="text-white font-medium">
                {data?.cards?.bankrollNeeded != null
                  ? formatUsd(data.cards.bankrollNeeded)
                  : "—"}
              </span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default DayHoverTooltip;
