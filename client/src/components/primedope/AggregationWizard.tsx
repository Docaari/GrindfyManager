import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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

export default function AggregationWizard({ onRun, profileLetter: initialProfile }: AggregationWizardProps = {}) {
  const [mode, setMode] = useState<"period" | "day">("period");
  const [profile, setProfile] = useState(initialProfile ?? "A");
  const [weeks, setWeeks] = useState(12);
  const [dailyInvestment, setDailyInvestment] = useState("");
  const [editedGroups, setEditedGroups] = useState<AggGroup[] | null>(null);
  const [rawInputs, setRawInputs] = useState<
    Record<string, string>
  >({});

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

  const isEmpty = !groups.length && !isLoading;

  return (
    <div data-testid="aggregation-wizard">
      {/* Mode toggle */}
      <div data-testid="aggregation-mode-toggle" className="flex gap-2 mb-4">
        <button
          data-testid="mode-por-periodo"
          aria-pressed={mode === "period" ? "true" : "false"}
          onClick={() => setMode("period")}
          className={mode === "period" ? "font-bold" : ""}
        >
          Por período
        </button>
        <button
          data-testid="mode-por-dia"
          aria-pressed={mode === "day" ? "true" : "false"}
          onClick={() => setMode("day")}
          className={mode === "day" ? "font-bold" : ""}
        >
          Por dia
        </button>
      </div>

      {/* Profile selector */}
      <div className="flex gap-2 mb-4">
        {(["A", "B", "C"] as const).map((p) => (
          <button
            key={p}
            data-testid={`profile-selector-${p}`}
            onClick={() => setProfile(p)}
            className={profile === p ? "font-bold" : ""}
          >
            Perfil {p}
          </button>
        ))}
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-4">
        {PERIODS.map((pd) => (
          <button
            key={pd.weeks}
            data-testid={`period-${pd.weeks}`}
            onClick={() => setWeeks(pd.weeks)}
            className={weeks === pd.weeks ? "font-bold" : ""}
          >
            {pd.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {isEmpty && (
        <p data-testid="empty-state">
          Adicione torneios na aba Grade para simular.
        </p>
      )}

      {/* Aggregated table */}
      {scaledGroups.length > 0 && (
        <>
          {/* Daily investment input */}
          <div className="mb-4">
            <label>
              Investimento diário
              <input
                data-testid="daily-investment-input"
                type="number"
                value={dailyInvestment}
                onChange={(e) => setDailyInvestment(e.target.value)}
                placeholder="Ex: 1500"
                className="ml-2 border px-2 py-1"
              />
            </label>
          </div>

          <table data-testid="aggregation-table" className="w-full">
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Buy-in</th>
                <th>Field</th>
                <th>ROI</th>
                <th>Count</th>
                <th>Fonte</th>
              </tr>
            </thead>
            <tbody>
              {scaledGroups.map((g, i) => (
                <tr key={`${g.tier}-${g.type}`} data-testid={`group-row-${i}`}>
                  <td>{g.name}</td>
                  <td data-testid={`buyin-display-${i}`}>
                    {g.buyIn.toFixed(0)}
                  </td>
                  <td>
                    <input
                      data-testid={`field-input-${i}`}
                      type="text"
                      value={
                        rawInputs[`field-${i}`] ??
                        (editedGroups?.[i]?.field?.toString() ??
                        g.field.toString())
                      }
                      onChange={(e) =>
                        handleGroupEdit(i, "field", e.target.value)
                      }
                      className="w-20 border px-1"
                    />
                  </td>
                  <td>
                    <input
                      data-testid={`roi-input-${i}`}
                      type="text"
                      value={
                        rawInputs[`roi-${i}`] ??
                        (editedGroups?.[i]?.roi?.toString() ?? g.roi.toString())
                      }
                      onChange={(e) =>
                        handleGroupEdit(i, "roi", e.target.value)
                      }
                      className="w-20 border px-1"
                    />
                  </td>
                  <td>
                    <input
                      data-testid={`count-input-${i}`}
                      type="text"
                      value={
                        rawInputs[`count-${i}`] ??
                        (editedGroups?.[i]?.count?.toString() ??
                        g.count.toString())
                      }
                      onChange={(e) =>
                        handleGroupEdit(i, "count", e.target.value)
                      }
                      className="w-20 border px-1"
                    />
                  </td>
                  <td>
                    {g.source === "historical" ? (
                      <span
                        data-testid={`badge-hist-${i}`}
                        className="text-blue-500 text-xs font-bold"
                      >
                        hist
                      </span>
                    ) : (
                      <span
                        data-testid={`badge-est-${i}`}
                        className="text-yellow-500 text-xs font-bold"
                      >
                        est
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            data-testid="simulate-button"
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
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
            Simular
          </button>
        </>
      )}
    </div>
  );
}
