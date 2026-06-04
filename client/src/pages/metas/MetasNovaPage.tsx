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

type Kind = "wig" | "measure";

const SOURCE_METRIC_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "sessions_per_week", label: "Sessoes por semana" },
  { value: "grind_days", label: "Dias de grind" },
  { value: "study_minutes_week", label: "Minutos de estudo / semana" },
  { value: "study_sessions_count", label: "Sessoes de estudo" },
  { value: "bankroll_usd", label: "Banca (USD)" },
  { value: "roi_pct", label: "ROI %" },
  { value: "abi", label: "ABI (buy-in medio)" },
  { value: "itm_pct", label: "ITM %" },
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
const HORIZON_LABEL: Record<string, string> = {
  week: "Semana",
  month: "Mes",
  quarter: "Trimestre",
  season: "Temporada (ano)",
};

const selectCls =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function plusDaysYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MetasNovaPage() {
  const [, navigate] = useLocation();
  const [kind, setKind] = useState<Kind>("measure");
  const [title, setTitle] = useState("");
  const [sourceMetric, setSourceMetric] = useState("study_minutes_week");
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
  const queryClient = useQueryClient();

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
      sourceMetric,
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
            onClick={() => {
              setKind("wig");
              if (!(WIG_HORIZONS as readonly string[]).includes(horizon)) setHorizon("quarter");
            }}
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
            onClick={() => setKind("measure")}
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
            <Label htmlFor="metas-source-metric">Metrica (fonte de dado)</Label>
            <select
              id="metas-source-metric"
              data-testid="metas-field-source-metric"
              value={sourceMetric}
              onChange={(e) => setSourceMetric(e.target.value)}
              className={selectCls}
            >
              {SOURCE_METRIC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
