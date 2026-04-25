/**
 * OverrideConfirmDialog — Sprint W-1 (RF-05, ADR-027)
 *
 * Confirmacao dupla para override do gate (score < 6 mas decide jogar).
 * Microcopy literal da spec secao 9.1 / 10.3.
 */

import { Button } from "@/components/ui/button";

export interface OverrideConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function OverrideConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: OverrideConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="override-confirm-title"
      aria-describedby="override-confirm-description"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg space-y-4">
        <h2 id="override-confirm-title" className="text-xl font-semibold">
          Tem certeza?
        </h2>
        <p id="override-confirm-description" className="text-sm">
          Tem certeza? Sessoes em estado mental abaixo de 6 sao
          estatisticamente -EV.
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            className="bg-amber-600 hover:bg-amber-700 text-white border-amber-700"
          >
            Sim, registrar override
          </Button>
        </div>
      </div>
    </div>
  );
}
