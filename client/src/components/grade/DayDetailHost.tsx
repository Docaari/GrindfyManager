// =============================================================================
// Sprint day-detail-zoom-1 — DayDetailHost (RF-04 feature-flag)
//
// Decide entre <DayDetailZoom> (default) e <DayDetailDrawer> (legacy) baseado
// em ?detail=drawer. Conflito ?detail=drawer&day=Tue -> drawer ganha.
// =============================================================================

import * as React from "react";
import { useDayZoomState } from "@/hooks/useDayZoomState";
import { DayDetailZoom } from "@/components/grade/DayDetailZoom";
import { DayDetailDrawer } from "@/components/grade/DayDetailDrawer";

export interface DayDetailHostProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayOfWeek: number;
  profileLetter: "A" | "B" | "C";
  /** Container DOM para DialogPortal — propagado para zoom. */
  portalContainer?: HTMLElement | null;
  /** Quando true, coluna OFF: DnD disabled. */
  dayProfileOff?: boolean;
  onEdit?: () => void;
}

export function DayDetailHost(props: DayDetailHostProps): React.ReactElement | null {
  const { mode } = useDayZoomState();
  const {
    open,
    onOpenChange,
    dayOfWeek,
    profileLetter,
    portalContainer,
    dayProfileOff,
    onEdit,
  } = props;

  if (!open) return null;

  if (mode === "drawer") {
    return (
      <DayDetailDrawer
        open={open}
        onOpenChange={onOpenChange}
        dayOfWeek={dayOfWeek}
        profileLetter={profileLetter}
        onEdit={onEdit}
      />
    );
  }

  return (
    <DayDetailZoom
      open={open}
      onOpenChange={onOpenChange}
      dayOfWeek={dayOfWeek}
      profileLetter={profileLetter}
      portalContainer={portalContainer}
      dayProfileOff={dayProfileOff}
    />
  );
}

export default DayDetailHost;
