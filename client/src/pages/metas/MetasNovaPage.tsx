// =============================================================================
// MetasNovaPage — criacao de WIG / medida (/metas/nova) — ADR-229 + ADR-241
//
// Form unico com toggle WIG (D1) / medida (D2). Submit dispara POST /api/goals
// via apiRequest (JSON parseado direto, lesson #13). Inputs shadcn + selects
// NATIVOS (lesson #27 — Radix Select interage por onMouseDown, fragil em RTL).
// ADR-241: data de inicio + prazo EXPLICITOS em toda meta.
// data-testid estaveis (#2): metas-nova-form, metas-kind-*, metas-nova-submit.
// =============================================================================

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  GOAL_CATEGORIES,
  GOAL_UNITS,
  GOAL_HORIZONS,
  WIG_HORIZONS,
  GOAL_CADENCES,
} from "@shared/goals";
import { HORIZON_LABEL, todayYmd, localYmd } from "@/components/metas/metaUi";

type Kind = "wig" | "measure";

// ADR-241 — catalogo de metricas. `kinds` = onde a metrica e permitida (resultado
// = so WIG, RF-04). `grind` = suporta fonte selecionavel Grind|Historico
// (profit/volume); as demais sao Historico (getPerformanceByPeriod com FX).
type MetricDef = { base: string; label: string; kinds: Kind[]; grind: boolean };
const METRICS: MetricDef[] = [
  { base: "sessions_per_week", label: "Sessoes por semana", kinds: ["measure"], grind: false },
  { base: "grind_days", label: "Dias de grind", kinds: ["measure"], grind: false },
  { base: "study_minutes_week", label: "Minutos de estudo / semana", kinds: ["measure"], grind: false },
  { base: "study_sessions_count", label: "Sessoes de estudo", kinds: ["measure"], grind: false },
  { base: "bankroll_usd", label: "Banca (USD)", kinds: ["measure", "wig"], grind: false },
  { base: "volume", label: "Volume (torneios)", kinds: ["measure", "wig"], grind: true },
  { base: "profit", label: "Profit (USD)", kinds: ["wig"], grind: true },
  { base: "roi_pct", label: "ROI %", kinds: ["wig"], grind: false },
  { base: "itm_pct", label: "ITM %", kinds: ["wig"], grind: false },
  { base: "abi", label: "ABI (buy-in medio)", kinds: ["wig"], grind: false },
];

const CATEGORY_LABEL: Record<string, string> = {
  financial_brm: "Financeiro / BRM",
  volume_grind: "Volume / Grind",
  study: "Estudo",
  mental_tilt: "Mental / Tilt",
  process_routine: "Processo / Rotina",
  longevity_burnout: "Longevidade / Burnout",
  leak_focus: "Foco em leak",
};
const UNIT_LABEL: Record<string, string> = {
  usd: "USD",
  pct: "%",
  minutes: "minutos",
  sessions: "sessoes",
  days: "dias",
  boolean: "sim/nao",
};
const selectCls =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function plusDaysYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localYmd(d);
}

function initialKind(): Kind {
  if (typeof window === "undefined") return "measure";
  const k = new URLSearchParams(window.location.search).get("kind");
  return k === "wig" ? "wig" : "measure";
}

export function MetasNovaPage() {
  const [, navigate] = useLocation();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [title, setTitle] = useState("");
  // sourceMetric guarda a BASE; a fonte (grind/history) e separada (ADR-241).
  const [sourceMetric, setSourceMetric] = useState(() => (initialKind() === "wig" ? "profit" : "study_minutes_week"));
  const [dataSource, setDataSource] = useState<"grind" | "history">("history");
  const [targetValue, setTargetValue] = useState("300");
  const [baselineValue, setBaselineValue] = useState("0");
  const [startDate, setStartDate] = useState(todayYmd());
  const [targetDeadline, setTargetDeadline] = useState(plusDaysYmd(90));
  const [category, setCategory] = useState("study");
  const [unit, setUnit] = useState("minutes");
  const [cadence, setCadence] = useState("weekly");
  const [horizon, setHorizon] = useState<string>("quarter");
  const [feedback, setFeedback] = useState<string | null>(null);

  const horizonOptions = kind === "wig" ? WIG_HORIZONS : GOAL_HORIZONS;
  const metricsForKind = METRICS.filter((m) => m.kinds.includes(kind));
  const selectedMetric = METRICS.find((m) => m.base === sourceMetric);
  const queryClient = useQueryClient();

  // Troca de tipo (WIG/medida): se a metrica atual nao vale no novo tipo, reseta.
  function switchKind(next: Kind) {
    setKind(next);
    if (next === "wig" && !(WIG_HORIZONS as readonly string[]).includes(horizon)) setHorizon("quarter");
    const stillValid = METRICS.find((m) => m.base === sourceMetric)?.kinds.includes(next);
    if (!stillValid) setSourceMetric(next === "wig" ? "profit" : "study_minutes_week");
  }

  const mutation = useMutation({
    mutationFn: async (payload: any) => apiRequest("POST", "/api/goals", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals/scoreboard"] });
      setFeedback("Meta criada com sucesso.");
      setTimeout(() => navigate("/metas"), 600);
    },
    onError: (err: any) => setFeedback(err?.message ?? "Erro ao criar meta."),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const goalType = kind === "wig" ? "performance" : "process";
    const safeHorizon = (horizonOptions as readonly string[]).includes(horizon)
      ? horizon
      : (horizonOptions[0] as string);
    const payload: any = {
      kind,
      goalType,
      category,
      // titulo vazio cai no fallback (contrato dos testes metas-1 — submit sempre POSTa).
      title: title.trim() || (kind === "wig" ? "Nova WIG" : "Nova medida"),
      // ADR-241 — encoda a fonte selecionavel (base@grind/base@history) so para
      // metricas grind-capable; as demais vao como base (default historico).
      sourceMetric: selectedMetric?.grind ? `${sourceMetric}@${dataSource}` : sourceMetric,
      targetValue: Number(targetValue),
      unit,
      horizon: safeHorizon,
      startDate,
    };
    if (kind === "wig") {
      payload.baselineValue = Number(baselineValue);
      payload.targetDeadline = targetDeadline;
    } else {
      payload.cadence = cadence;
      payload.deadline = targetDeadline;
    }
    mutation.mutate(payload);
  };

  return (
    <div className="p-6">
      <PageHeader title="Nova Meta" subtitle="Defina uma WIG (meta global) ou uma medida de direcao." />
      <form data-testid="metas-nova-form" onSubmit={onSubmit} className="max-w-xl space-y-4">
        {/* Toggle tipo */}
        <div className="flex gap-2" role="group" aria-label="tipo de meta">
          <button
            type="button"
            data-testid="metas-kind-wig"
            aria-pressed={kind === "wig"}
            onClick={() => switchKind("wig")}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition",
              kind === "wig"
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            Meta Global (WIG)
          </button>
          <button
            type="button"
            data-testid="metas-kind-measure"
            aria-pressed={kind === "measure"}
            onClick={() => switchKind("measure")}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition",
              kind === "measure"
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            Medida de Direcao
          </button>
        </div>

        <div>
          <Label htmlFor="metas-title">Titulo</Label>
          <Input
            id="metas-title"
            data-testid="metas-field-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "wig" ? "Ex: De $5k para $20k de banca" : "Ex: Estudar 300 min/semana"}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="metas-source-metric">Metrica</Label>
            <select
              id="metas-source-metric"
              data-testid="metas-field-source-metric"
              value={sourceMetric}
              onChange={(e) => setSourceMetric(e.target.value)}
              className={selectCls}
            >
              {metricsForKind.map((m) => (
                <option key={m.base} value={m.base}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="metas-category">Categoria</Label>
            <select
              id="metas-category"
              data-testid="metas-field-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={selectCls}
            >
              {GOAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c] ?? c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ADR-241 — fonte do dado selecionavel (so metricas grind-capable). */}
        {selectedMetric?.grind ? (
          <div>
            <Label htmlFor="metas-data-source">Fonte do dado</Label>
            <select
              id="metas-data-source"
              data-testid="metas-field-data-source"
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value as "grind" | "history")}
              className={selectCls}
            >
              <option value="grind">Grind ao vivo (/grind)</option>
              <option value="history">Historico importado (/upload)</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Grind = sessoes que voce registrou ao vivo. Historico = tudo que voce importou via CSV.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="metas-target">Alvo</Label>
            <Input
              id="metas-target"
              type="number"
              data-testid="metas-field-target-value"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="metas-unit">Unidade</Label>
            <select
              id="metas-unit"
              data-testid="metas-field-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={selectCls}
            >
              {GOAL_UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u] ?? u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="metas-horizon">Horizonte</Label>
            <select
              id="metas-horizon"
              data-testid="metas-field-horizon"
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              className={selectCls}
            >
              {horizonOptions.map((h) => (
                <option key={h} value={h}>
                  {HORIZON_LABEL[h] ?? h}
                </option>
              ))}
            </select>
          </div>
          {kind === "measure" ? (
            <div>
              <Label htmlFor="metas-cadence">Cadencia</Label>
              <select
                id="metas-cadence"
                data-testid="metas-field-cadence"
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                className={selectCls}
              >
                {GOAL_CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {c === "weekly" ? "Semanal" : "Diaria"}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <Label htmlFor="metas-baseline">Baseline (X de "de X para Y")</Label>
              <Input
                id="metas-baseline"
                type="number"
                data-testid="metas-field-baseline-value"
                value={baselineValue}
                onChange={(e) => setBaselineValue(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* ADR-241 — inicio + prazo explicitos. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="metas-start-date">Data de inicio</Label>
            <Input
              id="metas-start-date"
              type="date"
              data-testid="metas-field-start-date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="metas-deadline">Prazo</Label>
            <Input
              id="metas-deadline"
              type="date"
              data-testid="metas-field-target-deadline"
              value={targetDeadline}
              onChange={(e) => setTargetDeadline(e.target.value)}
            />
            {kind === "wig" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                WIG exige prazo de pelo menos 90 dias (ROI so converge em escala).
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" data-testid="metas-nova-submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Criando..." : "Criar meta"}
          </Button>
          {feedback ? (
            <p data-testid="metas-nova-feedback" className="text-sm text-muted-foreground">
              {feedback}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}

export default MetasNovaPage;
