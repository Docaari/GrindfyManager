/**
 * Sprint UX-QW-2 — RF-07
 *
 * Extracao dos chips de lente (Mental/Selecao/Tecnico) de CoachAI.tsx + adicao
 * de Tooltip explicativo e linha de status "Foco da conversa: X".
 *
 * Spec RF-07:
 *   - Wrapper <Tooltip> em cada chip (texto canonico explicando que NAO sao
 *     agentes diferentes, apenas focos da mesma conversa).
 *   - Linha de status abaixo dos chips.
 *
 * Lessons aplicadas:
 *   #2  data-testid estavel (coach-lens-chip-{value}, coach-lens-tooltip-{value},
 *       coach-lens-status).
 *   #11 sem default decorativo.
 *   #27 Radix Tooltip reage a onMouseEnter/onFocus (hover via userEvent).
 */

import React from 'react';
import { Brain, Trophy, GraduationCap, type LucideIcon } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { CoachType } from '@/hooks/useCoachChat';

const LENS_OPTIONS: ReadonlyArray<{
  value: CoachType;
  icon: LucideIcon;
  label: string;
}> = [
  { value: 'mental', icon: Brain, label: 'Mental' },
  { value: 'tournament', icon: Trophy, label: 'Selecao' },
  { value: 'technical', icon: GraduationCap, label: 'Tecnico' },
];

const TOOLTIP_TEXT =
  'Foco desta conversa — voce pode mudar a qualquer momento. Nao sao agentes diferentes.';

export interface CoachLensChipsProps {
  coachType: CoachType;
  onChangeCoachType: (value: CoachType) => void;
}

export function CoachLensChips({
  coachType,
  onChangeCoachType,
}: CoachLensChipsProps) {
  const currentLabel =
    LENS_OPTIONS.find((l) => l.value === coachType)?.label ?? '';

  // Sprint UX-QW-2: TooltipProvider local para o componente funcionar
  // standalone em testes que NAO envolvem o App (que ja tem provider global).
  // TooltipProvider Radix eh idempotente — aninhar com o global do App.tsx
  // nao quebra.
  return (
    <TooltipProvider>
      <div className="flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800">
          <span className="text-xs text-gray-500">Foco:</span>
          {LENS_OPTIONS.map((lens) => {
            const Icon = lens.icon;
            const isActive = coachType === lens.value;
            return (
              <Tooltip key={lens.value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-testid={`coach-lens-chip-${lens.value}`}
                    onClick={() => onChangeCoachType(lens.value)}
                    aria-pressed={isActive}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors',
                      isActive
                        ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                        : 'text-gray-400 hover:text-gray-200 border border-gray-700 hover:bg-gray-800',
                    )}
                  >
                    <Icon size={14} />
                    {lens.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  data-testid={`coach-lens-tooltip-${lens.value}`}
                >
                  {TOOLTIP_TEXT}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <p
          data-testid="coach-lens-status"
          className="text-xs text-gray-500 px-4 pb-2"
        >
          Foco da conversa: {currentLabel}
        </p>
      </div>
    </TooltipProvider>
  );
}

export default CoachLensChips;
