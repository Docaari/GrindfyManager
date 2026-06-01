// =============================================================================
// MetasNovaPage — criacao de WIG / medida (/metas/nova) — METAS-1 fatia-1 (ADR-229)
//
// Form unico com toggle WIG (D1) / medida (D2). Submit dispara POST /api/goals
// via apiRequest (JSON parseado direto, lesson #13). data-testid estaveis (#2).
// =============================================================================

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type Kind = "wig" | "measure";

export function MetasNovaPage() {
  const [kind, setKind] = useState<Kind>("measure");
  const [title, setTitle] = useState("");
  const [sourceMetric, setSourceMetric] = useState("study_minutes_week");
  const [targetValue, setTargetValue] = useState("300");
  const [baselineValue, setBaselineValue] = useState("0");
  const [targetDeadline, setTargetDeadline] = useState("");
  const [category, setCategory] = useState("study");
  const [unit, setUnit] = useState("minutes");
  const [cadence, setCadence] = useState("weekly");
  const [horizon, setHorizon] = useState("quarter");
  const [feedback, setFeedback] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      return await apiRequest("POST", "/api/goals", payload);
    },
    onSuccess: () => setFeedback("Meta criada."),
    onError: (err: any) => setFeedback(err?.message ?? "Erro ao criar meta."),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const goalType = kind === "wig" ? "performance" : "process";
    const payload: any = {
      kind,
      goalType,
      category,
      title: title || (kind === "wig" ? "Nova WIG" : "Nova medida"),
      sourceMetric,
      targetValue: Number(targetValue),
      unit,
      horizon,
    };
    if (kind === "wig") {
      payload.baselineValue = Number(baselineValue);
      payload.targetDeadline = targetDeadline;
    } else {
      payload.cadence = cadence;
    }
    mutation.mutate(payload);
  };

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Nova Meta</h1>
      <form data-testid="metas-nova-form" onSubmit={onSubmit} className="space-y-4">
        <div className="flex gap-2" role="group" aria-label="tipo de meta">
          <button
            type="button"
            data-testid="metas-kind-wig"
            aria-pressed={kind === "wig"}
            onClick={() => setKind("wig")}
          >
            Meta Global (WIG)
          </button>
          <button
            type="button"
            data-testid="metas-kind-measure"
            aria-pressed={kind === "measure"}
            onClick={() => setKind("measure")}
          >
            Medida de Direcao
          </button>
        </div>

        <label className="block">
          <span>Titulo</span>
          <input
            data-testid="metas-field-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="block">
          <span>Metrica</span>
          <input
            data-testid="metas-field-source-metric"
            value={sourceMetric}
            onChange={(e) => setSourceMetric(e.target.value)}
          />
        </label>

        <label className="block">
          <span>Alvo</span>
          <input
            data-testid="metas-field-target-value"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
          />
        </label>

        {kind === "wig" ? (
          <>
            <label className="block">
              <span>Baseline (X)</span>
              <input
                data-testid="metas-field-baseline-value"
                value={baselineValue}
                onChange={(e) => setBaselineValue(e.target.value)}
              />
            </label>
            <label className="block">
              <span>Prazo</span>
              <input
                data-testid="metas-field-target-deadline"
                value={targetDeadline}
                onChange={(e) => setTargetDeadline(e.target.value)}
              />
            </label>
          </>
        ) : (
          <label className="block">
            <span>Cadencia</span>
            <select
              data-testid="metas-field-cadence"
              value={cadence}
              onChange={(e) => setCadence(e.target.value)}
            >
              <option value="weekly">Semanal</option>
              <option value="daily">Diaria</option>
            </select>
          </label>
        )}

        <button type="submit" data-testid="metas-nova-submit" disabled={mutation.isPending}>
          Criar meta
        </button>

        {feedback ? <p data-testid="metas-nova-feedback">{feedback}</p> : null}
      </form>
    </div>
  );
}

export default MetasNovaPage;
