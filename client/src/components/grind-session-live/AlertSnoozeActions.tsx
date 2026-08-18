/**
 * AlertSnoozeActions — botoes de soneca (+1min / +3min) dentro do toast de
 * alerta do Grind Live.
 *
 * Usa `ToastAction` do Radix: o clique fecha o toast automaticamente, e o
 * `onOpenChange` que o `fireAlert` instala chama `stopAlertById` — ou seja, a
 * narracao em curso para sozinha ao sonecar, sem o componente saber disso.
 *
 * `altText` e obrigatorio no Radix: e o que o leitor de tela anuncia quando o
 * toast some antes de o usuario conseguir agir.
 */

import { ToastAction } from '@/components/ui/toast';

/** Opcoes de soneca, em minutos. */
export const SNOOZE_OPTIONS = [1, 3] as const;

export type SnoozeMinutes = (typeof SNOOZE_OPTIONS)[number];

interface AlertSnoozeActionsProps {
  onSnooze: (minutes: number) => void;
}

export function AlertSnoozeActions({ onSnooze }: AlertSnoozeActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1" data-testid="alert-snooze-actions">
      {SNOOZE_OPTIONS.map((minutes) => (
        <ToastAction
          key={minutes}
          altText={`Adiar alerta em ${minutes} minuto${minutes > 1 ? 's' : ''}`}
          data-testid={`alert-snooze-${minutes}min`}
          onClick={() => onSnooze(minutes)}
          className="px-2"
        >
          +{minutes}min
        </ToastAction>
      ))}
    </div>
  );
}

export default AlertSnoozeActions;
