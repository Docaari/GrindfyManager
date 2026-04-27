/**
 * GoNoGoModal — Sprint W-1 (RF-04, ADR-027)
 *
 * Modal "Nao jogar hoje" disparado quando emotionalCheckScore < 6.
 * Microcopy literal da spec secao 9.1.
 *
 * Implementacao: render condicional puro (nao usa Radix Dialog para nao
 * depender de portal — testes inspecionam document.body).
 */

import { Button } from "@/components/ui/button";

export interface GoNoGoModalProps {
  open: boolean;
  score: number;
  onCancel: () => void; // "Nao vou jogar"
  onWantsToPlay: () => void; // "Ainda quero jogar"
}

export function GoNoGoModal({ open, score, onCancel, onWantsToPlay }: GoNoGoModalProps) {
  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="go-no-go-title"
      aria-describedby="go-no-go-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg space-y-4">
        <h2 id="go-no-go-title" className="text-xl font-semibold">
          Score abaixo de 6 — considere nao jogar hoje
        </h2>
        <div id="go-no-go-description" className="text-sm space-y-2">
          <p>
            Score abaixo de 6 (atual: {score}). Por hoje, nao jogar e a decisao
            -EV-positiva.
          </p>
          <p className="font-medium">Sugestoes alternativas:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>Estudar maos starradas anteriores</li>
            <li>Descansar / dormir cedo</li>
            <li>Conversar com alguem proximo</li>
          </ul>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onWantsToPlay}
            className="border-amber-500/60 text-amber-300 hover:bg-amber-500/10"
          >
            Ainda quero jogar
          </Button>
          <Button
            type="button"
            onClick={onCancel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Nao vou jogar
          </Button>
        </div>
      </div>
    </div>
  );
}
