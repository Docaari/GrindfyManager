/**
 * DurationSelector — escolha entre 6m / 15m / 30m antes de iniciar o warm-up.
 *
 * Renderizado como dialog modal. Acoes:
 *   - Selecionar modo dispara onSelect(mode)
 *   - Cancel/close dispara onCancel
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { MODE_CONFIGS, type WarmupMode } from "./durations";

const DESCRIPTIONS: Record<WarmupMode, string> = {
  "6m": "Rapido. Antes de uma sessao curta ou refresh entre blocos.",
  "15m": "Padrao. Aquece o motor com drills GTO/estudo.",
  "30m": "Profundo. Grind longo, torneios high-stakes.",
};

export interface DurationSelectorProps {
  open: boolean;
  onSelect: (mode: WarmupMode) => void;
  onCancel: () => void;
}

export function DurationSelector({ open, onSelect, onCancel }: DurationSelectorProps) {
  const modes: WarmupMode[] = ["6m", "15m", "30m"];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Escolha a duracao</DialogTitle>
          <DialogDescription>
            Tempos diferentes ativam estagios diferentes do warm-up.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {modes.map((m) => (
            <Button
              key={m}
              type="button"
              variant="outline"
              data-testid={`warmup-mode-${m}`}
              onClick={() => onSelect(m)}
              className="w-full h-auto py-4 px-4 flex items-center gap-4 text-left justify-start"
            >
              <Clock className="h-6 w-6 shrink-0" />
              <div className="flex-1">
                <div className="text-lg font-semibold">{MODE_CONFIGS[m].label}</div>
                <div className="text-xs text-muted-foreground whitespace-normal">
                  {DESCRIPTIONS[m]}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
