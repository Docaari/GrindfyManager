/**
 * MdaPopulationPanel — Sprint MDA-1 (ADR-230 / RF-06).
 *
 * Painel COLAPSAVEL "MDA da populacao" montado em StudySessionPage durante a
 * sessao de estudo. Reusa MdaReadsSection (modo compacto) com o themeId da
 * sessao. Entrega o valor central: exploit do field na mao enquanto estuda.
 */

import { useState } from "react";
import { MdaReadsSection } from "@/components/studies/MdaReadsSection";

interface MdaPopulationPanelProps {
  themeId: string;
}

export function MdaPopulationPanel({ themeId }: MdaPopulationPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div data-testid="mda-population-panel" className="rounded border">
      <button
        type="button"
        data-testid="mda-population-panel-toggle"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold"
      >
        <span>MDA da populacao</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t p-3">
          <MdaReadsSection themeId={themeId} compact />
        </div>
      )}
    </div>
  );
}

export default MdaPopulationPanel;
