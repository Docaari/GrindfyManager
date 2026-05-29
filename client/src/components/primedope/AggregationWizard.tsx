// =============================================================================
// AggregationWizard — UX refactor 2026-05-29
//
// Mudancas (sem quebrar contrato de testes — data-testids preservados):
//   - Design tokens (bg-card/bg-background/text-foreground) p/ contraste dark+light
//   - Mode toggle + profile + period como chips visuais (active=primary)
//   - Inputs com bg-background + text-foreground + foco accent
//   - Tooltips Info (Lucide) explicando ROI decimal/Field/Count/Buy-in USD
//   - Helper inline mostrando "ROI X% = decimal Y" lado a lado
//   - Daily investment com prefixo USD$ + placeholder claro
//   - Disclaimer Monte Carlo collapsible
//   - Loading skeleton enquanto query roda
//   - Simulate via componente Button (estilo consistente)
//
// Math/contrato com backend NAO muda — input shape p/ onRun preservado.
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AggGroup {
  name: string;
  tier: string;
  type: string;
  buyIn: number;
  field: number;
  roi: number;
  countPerWeek: number;
  count: number;
  isPKO: boolean;
  source: "historical" | "default";
  lowSample: boolean;
}

interface AggMeta {
  profileLetter: string;
  weeks: number;
  daysInProfile: number;
  tournamentsPerWeek: number;
  weeklyInvestment: number;
}

interface AggResponse {
  groups: AggGroup[];
  meta: AggMeta;
}

const PERIODS = [
  { weeks: 1, label: "1 Semana" },
  { weeks: 4, label: "1 Mês" },
  { weeks: 12, label: "1 Trimestre" },
  { weeks: 52, label: "1 Ano" },
] as const;

interface AggregationWizardProps {
  onRun?: (input: { groups: AggGroup[]; weeks: number }) => void;
  profileLetter?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          className="ml-1 inline-flex items-center align-middle"
          aria-label="Mais informacoes"
        >
          <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

const chipBase =
  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors border";
const chipActive =
  "bg-primary text-primary-foreground border-primary shadow-sm";
const chipIdle =
  "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground";

const inputBase =
  "rounded-md border border-input bg-background text-foreground px-2 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ─── Component ──────────────────────────────────────────────────────────────

export default function AggregationWizard({
  onRun,
  profileLetter: initialProfile,
}: AggregationWizardProps = {}) {
  const [mode, setMode] = useState<"period" | "day">("period");
  const [profile, setProfile] = useState(initialProfile ?? "A");
  const [weeks, setWeeks] = useState(12);
  const [dailyInvestment, setDailyInvestment] = useState("");
  const [editedGroups, setEditedGroups] = useState<AggGroup[] | null>(null);
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const { data, isLoading } = useQuery<AggResponse>({
    queryKey: ["buckets-aggregate", profile, weeks],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/variance/buckets-aggregate?profileLetter=${profile}&weeks=${weeks}`,
      ),
    enabled: mode === "period",
  });

  useEffect(() => {
    if (data?.groups) {
      setEditedGroups(data.groups.map((g) => ({ ...g })));
      setRawInputs({});
    }
  }, [data]);

  const groups = editedGroups ?? data?.groups ?? [];

  const scaledGroups = useCallback(() => {
    if (!dailyInvestment || !data?.meta) return groups;
    const target = Number(dailyInvestment);
    if (!target || target <= 0) return groups;

    const currentDaily =
      data.meta.weeklyInvestment / Math.max(data.meta.daysInProfile, 1);
    if (currentDaily <= 0) return groups;

    const factor = target / currentDaily;
    return groups.map((g) => ({
      ...g,
      buyIn: Math.round(g.buyIn * factor * 100) / 100,
    }));
  }, [groups, dailyInvestment, data])();

  const handleGroupEdit = (
    index: number,
    field: "roi" | "field" | "count",
    value: string,
  ) => {
    setRawInputs((prev) => ({ ...prev, [`${field}-${index}`]: value }));
    setEditedGroups((prev) => {
      const next = [...(prev ?? groups)];
      next[index] = { ...next[index], [field]: Number(value) || 0 };
      return next;
    });
  };

  const isEmpty = !groups.length && !isLoading && mode === "period";

  return (
    <TooltipProvider delayDuration={150}>
      <div
        data-testid="aggregation-wizard"
        className="space-y-4 rounded-lg border border-border bg-card p-4 text-foreground"
      >
        {/* Header + disclaimer */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              Configuracao da simulacao
            </h2>
            <p className="text-xs text-muted-foreground">
              Escolha perfil, periodo e ajuste ROI/Field/Count antes de simular.
              Valores em <span className="font-medium text-foreground">USD</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDisclaimer((v) => !v)}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground underline"
          >
            {showDisclaimer ? "Ocultar" : "Como funciona?"}
          </button>
        </div>

        {showDisclaimer ? (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1.5">
            <p>
              <strong className="text-foreground">Monte Carlo:</strong> rodamos
              10.000 simulacoes do seu volume planejado. Cada torneio sorteia
              uma posicao (distribuicao calibrada por ROI alvo) e calcula o
              payout pela tabela power-law tipica do field.
            </p>
            <p>
              Os percentis (P15/P85, P2.5/P97.5) mostram <em>onde 70% / 95%</em> dos
              cenarios caem — nao predicao, mas distribuicao da variancia
              esperada dado seu edge declarado.
            </p>
            <p>
              <strong className="text-foreground">Limitacoes:</strong> assume
              independencia entre torneios, ITM fixo em 15% do field, sem
              skill drift no periodo. Use como referencia de risco, nao garantia.
            </p>
          </div>
        ) : null}

        {/* Mode toggle */}
        <div className="space-y-1.5">
          <div className="flex items-center text-xs font-medium text-muted-foreground">
            Modo
            <InfoTip text="'Por periodo' agrega torneios do seu historico nesse perfil. 'Por dia' (legacy) filtra so o dia da semana." />
          </div>
          <div
            data-testid="aggregation-mode-toggle"
            role="tablist"
            className="inline-flex rounded-md border border-border bg-background p-0.5"
          >
            <button
              type="button"
              role="tab"
              data-testid="mode-por-periodo"
              aria-pressed={mode === "period" ? "true" : "false"}
              onClick={() => setMode("period")}
              className={cn(
                "rounded px-3 py-1 text-xs transition-colors",
                mode === "period"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Por período
            </button>
            <button
              type="button"
              role="tab"
              data-testid="mode-por-dia"
              aria-pressed={mode === "day" ? "true" : "false"}
              onClick={() => setMode("day")}
              className={cn(
                "rounded px-3 py-1 text-xs transition-colors",
                mode === "day"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Por dia
            </button>
          </div>
        </div>

        {/* Profile + period in same row on md+ */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center text-xs font-medium text-muted-foreground">
              Perfil do dia
              <InfoTip text="A = volume alto (~6 dias/sem). B = misto. C = leve. Vem da configuracao da Grade." />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["A", "B", "C"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  data-testid={`profile-selector-${p}`}
                  onClick={() => setProfile(p)}
                  aria-pressed={profile === p ? "true" : "false"}
                  className={cn(chipBase, profile === p ? chipActive : chipIdle)}
                >
                  Perfil {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center text-xs font-medium text-muted-foreground">
              Periodo simulado
              <InfoTip text="Quantas semanas de grind agregar. Periodos longos suavizam variancia (mais torneios = distribuicao mais centrada)." />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PERIODS.map((pd) => (
                <button
                  key={pd.weeks}
                  type="button"
                  data-testid={`period-${pd.weeks}`}
                  onClick={() => setWeeks(pd.weeks)}
                  aria-pressed={weeks === pd.weeks ? "true" : "false"}
                  className={cn(
                    chipBase,
                    weeks === pd.weeks ? chipActive : chipIdle,
                  )}
                >
                  {pd.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading state */}
        {isLoading && mode === "period" ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Carregando agregacao de torneios...
          </div>
        ) : null}

        {/* Empty state */}
        {isEmpty ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
            <p data-testid="empty-state">
              Adicione torneios na aba Grade para simular.
            </p>
            <p className="mt-1 text-xs">
              Sem grade salva, nao conseguimos agregar buckets por perfil.
            </p>
          </div>
        ) : null}

        {/* Aggregated table */}
        {scaledGroups.length > 0 && (
          <div className="space-y-3">
            {/* Daily investment input */}
            <div className="space-y-1.5">
              <label
                htmlFor="agg-daily-investment"
                className="flex items-center text-xs font-medium text-muted-foreground"
              >
                Investimento diario (opcional)
                <InfoTip text="Reescala todos os buy-ins proporcionalmente para bater esse alvo diario USD. Util pra simular 'e se eu subir/descer de stake'." />
              </label>
              <div className="relative max-w-[220px]">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  USD$
                </span>
                <input
                  id="agg-daily-investment"
                  data-testid="daily-investment-input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={dailyInvestment}
                  onChange={(e) => setDailyInvestment(e.target.value)}
                  placeholder="Ex: 1500"
                  className={cn(inputBase, "w-full pl-12")}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table
                data-testid="aggregation-table"
                className="w-full text-xs"
              >
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Grupo</th>
                    <th className="px-2 py-2 text-right font-medium">
                      <span className="inline-flex items-center justify-end">
                        Buy-in
                        <InfoTip text="Buy-in medio USD do bucket. Reescala automaticamente quando 'investimento diario' eh preenchido." />
                      </span>
                    </th>
                    <th className="px-2 py-2 text-right font-medium">
                      <span className="inline-flex items-center justify-end">
                        Field
                        <InfoTip text="Tamanho medio do field (jogadores). Afeta variancia: campo maior = top-heavy = upside maior porem rarefeito." />
                      </span>
                    </th>
                    <th className="px-2 py-2 text-right font-medium">
                      <span className="inline-flex items-center justify-end">
                        ROI (decimal)
                        <InfoTip text="ROI em formato decimal: 0.10 = 10%, 0.20 = 20%. Para ROI negativo use sinal: -0.05 = -5%." />
                      </span>
                    </th>
                    <th className="px-2 py-2 text-right font-medium">
                      <span className="inline-flex items-center justify-end">
                        Count
                        <InfoTip text="Quantos torneios desse bucket entram na simulacao durante o periodo escolhido." />
                      </span>
                    </th>
                    <th className="px-2 py-2 text-center font-medium">Fonte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {scaledGroups.map((g, i) => {
                    const roiRaw =
                      rawInputs[`roi-${i}`] ??
                      (editedGroups?.[i]?.roi?.toString() ??
                        g.roi.toString());
                    const roiNum = Number(roiRaw);
                    const roiPctDisplay = Number.isFinite(roiNum)
                      ? `${(roiNum * 100).toFixed(1)}%`
                      : "—";

                    return (
                      <tr
                        key={`${g.tier}-${g.type}`}
                        data-testid={`group-row-${i}`}
                        className="hover:bg-muted/20"
                      >
                        <td className="px-2 py-2 text-foreground">
                          <div className="font-medium">{g.name}</div>
                          {g.isPKO ? (
                            <span className="text-[10px] text-muted-foreground">
                              PKO
                            </span>
                          ) : null}
                        </td>
                        <td
                          data-testid={`buyin-display-${i}`}
                          className="px-2 py-2 text-right font-mono text-foreground"
                        >
                          {g.buyIn.toFixed(0)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            data-testid={`field-input-${i}`}
                            type="text"
                            inputMode="numeric"
                            value={
                              rawInputs[`field-${i}`] ??
                              (editedGroups?.[i]?.field?.toString() ??
                                g.field.toString())
                            }
                            onChange={(e) =>
                              handleGroupEdit(i, "field", e.target.value)
                            }
                            className={cn(inputBase, "w-20 text-right font-mono")}
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              data-testid={`roi-input-${i}`}
                              type="text"
                              inputMode="decimal"
                              value={roiRaw}
                              onChange={(e) =>
                                handleGroupEdit(i, "roi", e.target.value)
                              }
                              className={cn(
                                inputBase,
                                "w-20 text-right font-mono",
                              )}
                            />
                            <span
                              data-testid={`roi-pct-display-${i}`}
                              className={cn(
                                "min-w-[44px] text-right text-[10px]",
                                roiNum > 0
                                  ? "text-emerald-500"
                                  : roiNum < 0
                                  ? "text-red-500"
                                  : "text-muted-foreground",
                              )}
                            >
                              {roiPctDisplay}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            data-testid={`count-input-${i}`}
                            type="text"
                            inputMode="numeric"
                            value={
                              rawInputs[`count-${i}`] ??
                              (editedGroups?.[i]?.count?.toString() ??
                                g.count.toString())
                            }
                            onChange={(e) =>
                              handleGroupEdit(i, "count", e.target.value)
                            }
                            className={cn(inputBase, "w-20 text-right font-mono")}
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          {g.source === "historical" ? (
                            <span
                              data-testid={`badge-hist-${i}`}
                              className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-500"
                              title="Calculado do seu historico real"
                            >
                              hist
                            </span>
                          ) : (
                            <span
                              data-testid={`badge-est-${i}`}
                              className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500"
                              title="Estimativa (default) — amostra insuficiente"
                            >
                              est
                            </span>
                          )}
                          {g.lowSample ? (
                            <div
                              className="mt-0.5 text-[10px] text-amber-500/70"
                              title="Amostra pequena — valor pouco confiavel"
                            >
                              n baixo
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                Edicoes ficam ativas so nesta sessao — nao alteram o historico.
              </p>
              <Button
                data-testid="simulate-button"
                disabled={scaledGroups.length === 0}
                onClick={() => {
                  if (onRun && scaledGroups.length > 0) {
                    onRun({
                      groups: scaledGroups.map((g) => ({
                        ...g,
                        roi: g.roi,
                        field: g.field,
                        count: g.count,
                      })),
                      weeks,
                    });
                  }
                }}
              >
                Simular variancia
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
