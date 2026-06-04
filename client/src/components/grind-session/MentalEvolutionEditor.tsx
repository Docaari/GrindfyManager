import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// =============================================================================
// ADR-242 — Evolucao Mental Editavel na Sessao (RF-05/RF-06/RF-07)
//
// - Le a serie de break feedbacks via GET /api/break-feedbacks?sessionId=.
// - Mantem um draft local editavel (add/edit/remove). NADA e persistido ate
//   "Salvar Alteracoes" (Q-03 salvar junto).
// - Grafico Recharts (linha temporal das 5 metricas, eixo Y fixo 0-10).
// - 5 medias derivadas read-only (media aritmetica do draft em tempo real).
// - "Salvar Alteracoes" -> 1 PUT /api/grind-sessions/:id/break-feedbacks com a
//   serie inteira do draft (bulk-replace atomico).
//
// O componente expoe getDraftPayload via ref para o save global do modal poder
// disparar a persistencia da serie junto com o save da sessao (integracao).
// =============================================================================

const METRIC_FIELDS = [
  { key: "foco", label: "Foco", color: "#3b82f6" },
  { key: "energia", label: "Energia", color: "#22c55e" },
  { key: "confianca", label: "Confianca", color: "#a855f7" },
  { key: "inteligenciaEmocional", label: "Int. Emocional", color: "#f59e0b" },
  { key: "interferencias", label: "Interferencias", color: "#ef4444" },
] as const;

type MetricKey = (typeof METRIC_FIELDS)[number]["key"];

interface DraftBreak {
  id?: string;
  breakTime: string;
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
  notes: string | null;
}

interface BulkResponse {
  breaks: any[];
  medias: Record<string, string | null>;
  breakCount: number;
}

export interface MentalEvolutionEditorHandle {
  getDraftPayload: () => { breaks: DraftBreak[] };
  saveDraft: () => Promise<BulkResponse | void>;
}

interface MentalEvolutionEditorProps {
  sessionId: string;
}

function toDraft(row: any): DraftBreak {
  return {
    id: row.id,
    breakTime:
      typeof row.breakTime === "string"
        ? row.breakTime
        : new Date(row.breakTime).toISOString(),
    foco: Number(row.foco ?? 5),
    energia: Number(row.energia ?? 5),
    confianca: Number(row.confianca ?? 5),
    inteligenciaEmocional: Number(row.inteligenciaEmocional ?? 5),
    interferencias: Number(row.interferencias ?? 5),
    notes: row.notes ?? null,
  };
}

function clampMetric(value: number): number {
  if (Number.isNaN(value)) return 5;
  return Math.min(10, Math.max(0, value));
}

function deriveMedia(draft: DraftBreak[], key: MetricKey): string | null {
  if (draft.length === 0) return null;
  const sum = draft.reduce((acc, b) => acc + Number(b[key]), 0);
  return (sum / draft.length).toFixed(1);
}

function MentalEvolutionEditorInner(
  { sessionId }: MentalEvolutionEditorProps,
  ref: React.Ref<MentalEvolutionEditorHandle>,
) {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["break-feedbacks", sessionId],
    queryFn: async () =>
      apiRequest("GET", `/api/break-feedbacks?sessionId=${sessionId}`),
    enabled: !!sessionId,
  });

  const [draft, setDraft] = React.useState<DraftBreak[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  // Hidrata o draft a partir da serie do servidor (ASC por breakTime).
  React.useEffect(() => {
    if (hydrated) return;
    if (Array.isArray(data)) {
      const sorted = [...data]
        .map(toDraft)
        .sort(
          (a, b) =>
            new Date(a.breakTime).getTime() - new Date(b.breakTime).getTime(),
        );
      setDraft(sorted);
      setHydrated(true);
    }
  }, [data, hydrated]);

  const mutation = useMutation<BulkResponse, unknown, { breaks: DraftBreak[] }>({
    mutationFn: async (vars: { breaks: DraftBreak[] }) =>
      apiRequest(
        "PUT",
        `/api/grind-sessions/${sessionId}/break-feedbacks`,
        vars,
      ),
    onSuccess: () => {
      // lesson #21 — invalidar por prefixo de queryKey.
      queryClient.invalidateQueries({ queryKey: ["break-feedbacks", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
    },
  });

  const buildPayload = React.useCallback(
    () => ({
      breaks: draft.map((b) => ({
        ...(b.id ? { id: b.id } : {}),
        breakTime: b.breakTime,
        foco: b.foco,
        energia: b.energia,
        confianca: b.confianca,
        inteligenciaEmocional: b.inteligenciaEmocional,
        interferencias: b.interferencias,
        notes: b.notes ?? null,
      })),
    }),
    [draft],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      getDraftPayload: () => buildPayload(),
      saveDraft: async () => mutation.mutateAsync(buildPayload()),
    }),
    [buildPayload, mutation],
  );

  const handleAdd = () => {
    const now = new Date().toISOString();
    setDraft((prev) => [
      ...prev,
      {
        breakTime: now,
        foco: 5,
        energia: 5,
        confianca: 5,
        inteligenciaEmocional: 5,
        interferencias: 5,
        notes: "",
      },
    ]);
  };

  const handleRemove = (index: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMetricChange = (index: number, key: MetricKey, raw: string) => {
    const value = clampMetric(parseInt(raw, 10));
    setDraft((prev) =>
      prev.map((b, i) => (i === index ? { ...b, [key]: value } : b)),
    );
  };

  const handleBreakTimeChange = (index: number, raw: string) => {
    setDraft((prev) =>
      prev.map((b, i) => (i === index ? { ...b, breakTime: raw } : b)),
    );
  };

  const handleNotesChange = (index: number, raw: string) => {
    setDraft((prev) =>
      prev.map((b, i) => (i === index ? { ...b, notes: raw } : b)),
    );
  };

  const handleSave = () => {
    mutation.mutate(buildPayload());
  };

  const chartData = draft.map((b, i) => ({
    label: `#${i + 1}`,
    foco: b.foco,
    energia: b.energia,
    confianca: b.confianca,
    inteligenciaEmocional: b.inteligenciaEmocional,
    interferencias: b.interferencias,
  }));

  const isEmpty = draft.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">Evolucao mental por medicao</h4>
        <p className="text-xs text-muted-foreground">
          Serie granular editavel dos reports de break ao longo da sessao.
        </p>
      </div>

      {isLoading && !hydrated ? (
        <div className="text-xs text-muted-foreground">Carregando medicoes...</div>
      ) : null}

      {/* Grafico de evolucao */}
      {isEmpty ? (
        <div
          data-testid="mental-evolution-empty"
          className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground"
        >
          Nenhuma medicao registrada nesta sessao
        </div>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 10]} />
              <Tooltip />
              <Legend />
              {METRIC_FIELDS.map((m) => (
                <Line
                  key={m.key}
                  type="monotone"
                  dataKey={m.key}
                  name={m.label}
                  stroke={m.color}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Medias derivadas read-only */}
      <div
        data-testid="mental-evolution-medias"
        className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-5"
      >
        <div className="col-span-2 text-xs text-muted-foreground sm:col-span-5">
          Media da sessao (resumo derivado das medicoes)
        </div>
        {METRIC_FIELDS.map((m) => {
          const media = deriveMedia(draft, m.key);
          return (
            <div
              key={m.key}
              data-testid={`mental-evolution-media-${m.key === "energia" ? "energia" : m.key}`}
              className="text-center"
            >
              <div className="text-[11px] text-muted-foreground">{m.label}</div>
              <div className="text-sm font-semibold">{media ?? "-"}</div>
            </div>
          );
        })}
      </div>

      {/* Lista editavel de reports */}
      <div className="space-y-3">
        {draft.map((b, i) => (
          <div
            key={b.id ?? `new-${i}`}
            data-testid={`mental-evolution-report-${i}`}
            className="space-y-2 rounded-md border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Input
                type="datetime-local"
                aria-label="Horario da medicao"
                value={toLocalDatetime(b.breakTime)}
                onChange={(e) =>
                  handleBreakTimeChange(i, fromLocalDatetime(e.target.value))
                }
                className="max-w-[220px]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid={`mental-evolution-remove-${i}`}
                onClick={() => handleRemove(i)}
              >
                Remover
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {METRIC_FIELDS.map((m) => (
                <label key={m.key} className="text-xs">
                  <span className="block text-muted-foreground">{m.label}</span>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    data-testid={`mental-evolution-${m.key}-${i}`}
                    value={b[m.key]}
                    onChange={(e) => handleMetricChange(i, m.key, e.target.value)}
                  />
                </label>
              ))}
            </div>

            <Textarea
              placeholder="Notas (opcional)"
              maxLength={500}
              value={b.notes ?? ""}
              onChange={(e) => handleNotesChange(i, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="mental-evolution-add"
          onClick={handleAdd}
        >
          Adicionar medicao
        </Button>
        <Button
          type="button"
          data-testid="mental-evolution-save"
          onClick={handleSave}
        >
          Salvar Alteracoes
        </Button>
      </div>
    </div>
  );
}

// datetime-local helpers (input usa horario local sem timezone suffix).
function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetime(local: string): string {
  if (!local) return new Date().toISOString();
  const d = new Date(local);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export const MentalEvolutionEditor = React.forwardRef<
  MentalEvolutionEditorHandle,
  MentalEvolutionEditorProps
>(MentalEvolutionEditorInner);

export default MentalEvolutionEditor;
