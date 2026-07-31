/**
 * ImportReconciliationCard — ADR-243.
 *
 * Fecha a conta do import para o jogador: quantas linhas o arquivo tinha,
 * quantas viraram torneio, quantas eram duplicadas e quantas foram rejeitadas
 * (com o motivo de cada uma). Antes o import respondia so "N importados" e as
 * linhas descartadas sumiam sem contagem nem aviso.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileText } from "lucide-react";

export interface ImportReconciliation {
  rowsInFile: number | null;
  parsed: number;
  duplicates: number;
  inserted: number;
  rejected: number;
  dbErrors: number;
  rejectedSample?: Array<{ rowNum: number; reason: string }>;
  rejectedByReason?: Record<string, number>;
  warnings?: string[];
}

interface Props {
  reconciliation: ImportReconciliation;
  /** Rotulo do titulo — "Prévia" antes de confirmar, "Resultado" depois. */
  title?: string;
  className?: string;
}

function Metric({
  label,
  value,
  tone = "neutral",
  testId,
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "good" | "warn" | "bad";
  testId: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-green-400"
      : tone === "warn"
        ? "text-yellow-400"
        : tone === "bad"
          ? "text-red-400"
          : "text-white";
  return (
    <div className="text-center" data-testid={testId}>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

export function ImportReconciliationCard({ reconciliation: r, title, className }: Props) {
  const [showRejected, setShowRejected] = useState(false);
  const hasRejections = r.rejected > 0;
  const warnings = r.warnings ?? [];

  return (
    <Card className={`bg-gray-800 border-gray-600 ${className ?? ""}`} data-testid="import-reconciliation">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-poker-gold" />
          <span className="text-sm font-semibold text-white">
            {title ?? "Conferência do import"}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Metric
            label="linhas no arquivo"
            value={r.rowsInFile ?? "—"}
            testId="recon-rows-in-file"
          />
          <Metric label="reconhecidas" value={r.parsed} testId="recon-parsed" />
          <Metric
            label="duplicadas"
            value={r.duplicates}
            tone={r.duplicates > 0 ? "warn" : "neutral"}
            testId="recon-duplicates"
          />
          <Metric
            label="importadas"
            value={r.inserted}
            tone={r.inserted > 0 ? "good" : "neutral"}
            testId="recon-inserted"
          />
          <Metric
            label="rejeitadas"
            value={r.rejected}
            tone={hasRejections ? "bad" : "neutral"}
            testId="recon-rejected"
          />
        </div>

        {r.dbErrors > 0 && (
          <p className="text-sm text-red-400 bg-red-900/20 p-2 rounded" data-testid="recon-db-errors">
            {r.dbErrors} linhas falharam ao gravar no banco.
          </p>
        )}

        {warnings.length > 0 && (
          <ul className="space-y-2" data-testid="recon-warnings">
            {warnings.map((w, i) => (
              <li key={i} className="flex gap-2 text-sm text-yellow-300 bg-yellow-900/15 p-2 rounded">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}

        {!hasRejections && warnings.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-green-400" data-testid="recon-all-good">
            <CheckCircle2 className="h-4 w-4" />
            Todas as linhas do arquivo foram reconhecidas.
          </p>
        )}

        {hasRejections && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-300 hover:text-white px-0"
              onClick={() => setShowRejected((v) => !v)}
              data-testid="recon-toggle-rejected"
            >
              {showRejected ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              {showRejected ? "Ocultar" : "Ver"} linhas rejeitadas
            </Button>

            {showRejected && (
              <div className="mt-2 space-y-2" data-testid="recon-rejected-list">
                {Object.entries(r.rejectedByReason ?? {}).map(([reason, count]) => (
                  <div key={reason} className="text-sm text-gray-300 bg-gray-900/40 p-2 rounded">
                    <strong className="text-red-300">{count}×</strong> {reason}
                  </div>
                ))}
                {(r.rejectedSample ?? []).length > 0 && (
                  <div className="text-xs text-gray-400 max-h-40 overflow-y-auto space-y-1 pt-1">
                    {(r.rejectedSample ?? []).map((s) => (
                      <div key={s.rowNum}>
                        linha {s.rowNum}: {s.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ImportReconciliationCard;
