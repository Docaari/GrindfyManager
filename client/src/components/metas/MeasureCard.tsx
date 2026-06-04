// =============================================================================
// MeasureCard — card de medida de direcao com barra de pace dupla (ADR-241 M3).
//
// Barra: preenchida = atual/alvo; marcador vertical = esperado-agora/alvo (pace).
// O jogador ve em 1 olhar se esta a frente ou atras do ritmo. Cor por status.
// RF-06: valores da medida (volume/estudo), NUNCA P&L. Testids preservados.
// =============================================================================

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";
import { MeasureLineChart } from "@/components/metas/MeasureLineChart";
import { statusVisual } from "@/components/metas/metaUi";

export interface MeasureCardData {
  id: string;
  title: string;
  sourceMetric?: string;
  current: number | null;
  target: number;
  expectedNow: number | null;
  status: string;
  horizon?: string;
  compliancePct?: number | null;
  dataSufficiency?: "ok" | "low";
  // shape completo emitido pelo scoreboard (campos extras opcionais — reviewer LOW).
  adherence?: {
    skipped: boolean;
    shortfall: number | null;
    planned?: number | null;
    actual?: number;
    overachieved?: boolean;
    note?: string | null;
  } | null;
}

function pct(value: number | null, target: number): number {
  if (value == null || !Number.isFinite(target) || target <= 0) return 0;
  const p = (value / target) * 100;
  return Math.max(0, Math.min(100, p));
}

export function MeasureCard({ m }: { m: MeasureCardData }) {
  const [showChart, setShowChart] = useState(false);
  const meta = statusVisual(m.status);
  const fillPct = pct(m.current, m.target);
  const expectedPct = m.expectedNow == null ? null : pct(m.expectedNow, m.target);
  const compliance = typeof m.compliancePct === "number" ? `${m.compliancePct}%` : "—";
  const adherenceLabel = m.adherence?.skipped
    ? "pulado conscientemente"
    : (m.adherence?.shortfall ?? 0) > 0
      ? "abaixo do plano"
      : null;

  return (
    <Card data-testid={`measure-row-${m.id}`} className="overflow-hidden">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium leading-tight">{m.title}</span>
          <span
            data-testid={`measure-status-${m.id}`}
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.pill}`}
          >
            <span className="sr-only">{m.status}</span>
            <span aria-hidden="true">{meta.label}</span>
          </span>
        </div>

        {/* Barra de pace dupla: preenchida=atual; marcador=esperado-agora. */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progresso</span>
            <span className="font-semibold text-foreground" data-testid={`measure-pct-${m.id}`}>
              {Math.round(fillPct)}%
            </span>
          </div>
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${meta.bar} transition-all`}
              style={{ width: `${fillPct}%` }}
            />
            {expectedPct != null ? (
              <div
                className={`absolute top-[-2px] h-[14px] w-[3px] rounded ${meta.marker}`}
                style={{ left: `calc(${expectedPct}% - 1.5px)` }}
                title="Onde voce deveria estar agora (pace)"
              />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              Atual <strong data-testid={`measure-current-${m.id}`} className="text-foreground">{m.current ?? "—"}</strong>
              {" / "}
              <span data-testid={`measure-target-${m.id}`}>{m.target}</span>
            </span>
            <span>
              Pace agora <strong data-testid={`measure-expected-${m.id}`} className="text-foreground">{m.expectedNow ?? "—"}</strong>
            </span>
            <span>
              Aderencia <strong data-testid={`measure-compliance-${m.id}`} className="text-foreground">{compliance}</strong>
            </span>
          </div>
        </div>

        {(m.dataSufficiency === "low" || adherenceLabel) && (
          <div className="flex flex-wrap gap-2">
            {m.dataSufficiency === "low" ? (
              <span
                data-testid={`measure-datasufficiency-${m.id}`}
                className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400"
                title="Registre mais dias para uma leitura confiavel"
              >
                amostra fraca · registre mais dias
              </span>
            ) : null}
            {adherenceLabel ? (
              <span
                data-testid={`measure-adherence-${m.id}`}
                className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {adherenceLabel}
              </span>
            ) : null}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowChart((s) => !s)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid={`measure-chart-toggle-${m.id}`}
        >
          {showChart ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showChart ? "Ocultar evolucao" : "Ver evolucao (planejado × executado)"}
        </button>
        {showChart ? <MeasureLineChart goalId={m.id} /> : null}
      </CardContent>
    </Card>
  );
}

export default MeasureCard;
