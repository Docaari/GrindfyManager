// Sprint Mini Player 2 (RF-NEW.1) — Sleep Timer control no MiniPlayerBar.

import React from "react";
import { Moon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export interface SleepTimerControlProps {
  activeMinutes: number | null;
  remainingSeconds: number | null;
  onActivate: (minutes: number) => void;
  onCancel: () => void;
}

const PRESETS = [15, 30, 45, 60, 90];

export function SleepTimerControl({
  activeMinutes,
  remainingSeconds,
  onActivate,
  onCancel,
}: SleepTimerControlProps) {
  const [open, setOpen] = React.useState(false);
  const isActive = activeMinutes !== null;
  const remainingMin =
    remainingSeconds !== null
      ? Math.max(0, Math.ceil(remainingSeconds / 60))
      : null;
  const ariaLabel = isActive
    ? `Timer de sono: ${remainingMin} minutos restantes`
    : "Timer de sono inativo";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="mini-player-sleep-timer-button"
          aria-label={ariaLabel}
          className="hidden md:inline-flex items-center gap-1 rounded p-2 hover:bg-muted"
        >
          <Moon className="h-4 w-4" aria-hidden="true" />
          {isActive && remainingMin !== null && (
            <span className="text-xs">{remainingMin}m</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-2">
          <p className="text-sm font-medium">Pausar audio em:</p>
          <ul className="space-y-1">
            {PRESETS.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onActivate(m);
                    setOpen(false);
                  }}
                  data-testid={`sleep-timer-preset-${m}`}
                >
                  {m} min
                </button>
              </li>
            ))}
          </ul>
          {isActive && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                onCancel();
                setOpen(false);
              }}
              data-testid="sleep-timer-cancel"
            >
              Cancelar timer
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SleepTimerControl;
