// =============================================================================
// Sprint F4 W1 — PrimedopeWizard (RF-02, RF-17..RF-21, RF-26)
//
// Selector + Buckets table + edit toggle + Run/Reuse buttons + warnings.
//
// Reviewer fix HIGH #2: GETs migrados para apiRequest (refresh-on-401).
// =============================================================================

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface BucketRow {
  name: string;
  network: string;
  count: number;
  buyinUsd: number;
  buyinOriginal?: number;
  currency: string;
  playersAvg: number;
  placesPaid: number;
  rakePct: number;
  roiPct: number;
  walletMissing?: boolean;
}

interface PrefillResponse {
  buckets: BucketRow[];
  fxRatesUsed: Record<string, number>;
  defaultsFlags: string[];
}

interface PrimedopeWizardProps {
  userId: string;
  profileLetter?: "A" | "B" | "C";
  dayOfWeek?: number;
  multiplier?: 1 | 4 | 12 | 52;
  onRun?: (input: any) => void;
}

const ALLOWED_MULTIPLIERS = [1, 4, 12, 52] as const;
const PROFILES = ["A", "B", "C"] as const;
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function PrimedopeWizard({
  userId,
  profileLetter: profileLetterProp,
  dayOfWeek: dayOfWeekProp,
  multiplier: multiplierProp,
  onRun,
}: PrimedopeWizardProps): React.ReactElement {
  // Hooks ANTES de qualquer early return (Rules of Hooks)
  const [profileLetter, setProfileLetter] = React.useState<"A" | "B" | "C">(
    profileLetterProp ?? "A",
  );
  const [dayOfWeek, setDayOfWeek] = React.useState<number>(dayOfWeekProp ?? 0);
  const [multiplier, setMultiplier] = React.useState<1 | 4 | 12 | 52>(
    multiplierProp ?? 1,
  );
  const [editOriginal, setEditOriginal] = React.useState(false);
  const [edits, setEdits] = React.useState<
    Record<string, Record<string, number | string>>
  >({});
  const [showDiscardDialog, setShowDiscardDialog] = React.useState(false);
  const [pendingChange, setPendingChange] = React.useState<
    null | (() => void)
  >(null);

  const prefillKey = ["primedope-prefill", profileLetter, dayOfWeek, multiplier];
  const { data: prefill } = useQuery<PrefillResponse, Error>({
    queryKey: prefillKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        profileLetter,
        dayOfWeek: String(dayOfWeek),
        multiplier: String(multiplier),
      });
      return (await apiRequest(
        "GET",
        `/api/primedope/buckets-prefill?${params.toString()}`,
      )) as PrefillResponse;
    },
    staleTime: 30_000,
  });

  const runsKey = ["primedope-runs", profileLetter, dayOfWeek];
  const { data: runs } = useQuery<any[], Error>({
    queryKey: runsKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        profileLetter,
        dayOfWeek: String(dayOfWeek),
        limit: "1",
      });
      try {
        const body = await apiRequest(
          "GET",
          `/api/primedope/runs?${params.toString()}`,
        );
        return Array.isArray(body) ? body : body?.items ?? [];
      } catch {
        // Silencioso: lista de "ultimos runs" e melhor-esforco; ausencia de
        // dados nao deve quebrar o wizard.
        return [];
      }
    },
    staleTime: 30_000,
  });

  const buckets = prefill?.buckets ?? [];
  const defaultsFlags = new Set(prefill?.defaultsFlags ?? []);
  const hasWalletMissing = buckets.some((b) => b.walletMissing);
  const hasEdits = Object.keys(edits).length > 0;

  const tryProfileChange = (next: "A" | "B" | "C") => {
    if (hasEdits) {
      setShowDiscardDialog(true);
      setPendingChange(() => () => {
        setProfileLetter(next);
        setEdits({});
      });
      return;
    }
    setProfileLetter(next);
  };

  const handleEdit = (idx: number, field: string, value: number | string) => {
    setEdits((prev) => ({
      ...prev,
      [String(idx)]: { ...(prev[String(idx)] ?? {}), [field]: value },
    }));
  };

  const handleRun = () => {
    if (!buckets.length || !onRun) return;
    onRun({
      profileLetter,
      dayOfWeek,
      multiplier,
      buckets: buckets.map((b, i) => ({
        ...b,
        ...(edits[String(i)] ?? {}),
      })),
    });
  };

  return (
    <section
      data-testid="primedope-wizard"
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <header className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="text-xs">
          Perfil
          <select
            data-testid="primedope-wizard-profile-select"
            className="mt-1 w-full rounded border border-border bg-background p-2"
            value={profileLetter}
            onChange={(e) =>
              tryProfileChange(e.target.value as "A" | "B" | "C")
            }
          >
            {PROFILES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Dia
          <select
            data-testid="primedope-wizard-day-select"
            className="mt-1 w-full rounded border border-border bg-background p-2"
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                Dia {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Multiplicador
          <select
            data-testid="primedope-wizard-multiplier-select"
            className="mt-1 w-full rounded border border-border bg-background p-2"
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value) as any)}
          >
            {ALLOWED_MULTIPLIERS.map((m) => (
              <option key={m} value={m}>
                {m}x
              </option>
            ))}
          </select>
        </label>
      </header>

      {hasWalletMissing ? (
        <div
          data-testid="wizard-wallet-missing-warning"
          className="rounded border border-amber-500 bg-amber-100/40 p-2 text-xs text-amber-900"
        >
          Algumas moedas usadas nesta grade nao tem wallet correspondente. Cadastre wallets para FX preciso.
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            data-testid="wizard-edit-original-toggle"
            checked={editOriginal}
            onChange={(e) => setEditOriginal(e.target.checked)}
          />
          Editar buyin moeda original
        </label>
        {hasEdits ? (
          <span
            data-testid="wizard-diff-badge"
            className="rounded bg-amber-200 px-2 py-1 text-[10px] text-amber-900"
          >
            Voce editou {Object.keys(edits).length} de {buckets.length} buckets
          </span>
        ) : null}
      </div>

      <div data-testid="primedope-wizard-buckets-table">
        {buckets.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum bucket disponivel — adicione torneios na grade para este dia.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left">Nome</th>
                <th className="text-right">Buy-in USD</th>
                {buckets.some((b) => b.currency !== "USD") ? (
                  <th className="text-right">Buy-in Original</th>
                ) : null}
                <th className="text-right">Players</th>
                <th className="text-right">Rake %</th>
                <th className="text-right">ROI %</th>
                <th className="text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, idx) => {
                const rowEdits = edits[String(idx)] ?? {};
                const roiEstimated = defaultsFlags.has(`${idx}:roiPct`);
                const playersEstimated = defaultsFlags.has(`${idx}:playersAvg`);
                const rakeEstimated = defaultsFlags.has(`${idx}:rakePct`);
                return (
                  <tr key={idx} data-testid={`bucket-row-${idx}`}>
                    <td>{b.name}</td>
                    <td className="text-right">
                      <input
                        type="number"
                        step="0.01"
                        data-testid={`bucket-buyin-usd-${idx}`}
                        defaultValue={b.buyinUsd}
                        readOnly={b.currency !== "USD"}
                        onChange={(e) =>
                          handleEdit(idx, "buyinUsd", Number(e.target.value))
                        }
                        className="w-24 rounded border border-border bg-background p-1 text-right"
                      />
                    </td>
                    {b.currency !== "USD" ? (
                      <td className="text-right">
                        <input
                          type="number"
                          step="0.01"
                          data-testid={`bucket-buyin-original-${idx}`}
                          defaultValue={b.buyinOriginal}
                          readOnly={!editOriginal}
                          onChange={(e) =>
                            handleEdit(
                              idx,
                              "buyinOriginal",
                              Number(e.target.value),
                            )
                          }
                          className="w-24 rounded border border-border bg-background p-1 text-right"
                        />
                      </td>
                    ) : buckets.some((bb) => bb.currency !== "USD") ? (
                      <td />
                    ) : null}
                    <td className="text-right">
                      <input
                        type="number"
                        data-testid={`bucket-players-${idx}`}
                        defaultValue={b.playersAvg}
                        onChange={(e) =>
                          handleEdit(idx, "playersAvg", Number(e.target.value))
                        }
                        className="w-20 rounded border border-border bg-background p-1 text-right"
                      />
                      {playersEstimated ? (
                        <span
                          data-testid={`bucket-players-estimated-badge-${idx}`}
                          className="ml-1 text-[10px] text-amber-700"
                        >
                          ≈est
                        </span>
                      ) : null}
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        step="0.01"
                        data-testid={`bucket-rake-${idx}`}
                        defaultValue={b.rakePct}
                        onChange={(e) =>
                          handleEdit(idx, "rakePct", Number(e.target.value))
                        }
                        className="w-16 rounded border border-border bg-background p-1 text-right"
                      />
                      {rakeEstimated ? (
                        <span
                          data-testid={`bucket-rake-estimated-badge-${idx}`}
                          className="ml-1 text-[10px] text-amber-700"
                        >
                          ≈est
                        </span>
                      ) : null}
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        step="0.01"
                        data-testid={`bucket-roi-${idx}`}
                        defaultValue={b.roiPct}
                        onChange={(e) =>
                          handleEdit(idx, "roiPct", Number(e.target.value))
                        }
                        className="w-16 rounded border border-border bg-background p-1 text-right"
                      />
                      {roiEstimated ? (
                        <span
                          data-testid={`bucket-roi-estimated-badge-${idx}`}
                          className="ml-1 text-[10px] text-amber-700"
                        >
                          ≈est
                        </span>
                      ) : null}
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        data-testid={`bucket-count-${idx}`}
                        defaultValue={b.count}
                        onChange={(e) =>
                          handleEdit(idx, "count", Number(e.target.value))
                        }
                        className="w-12 rounded border border-border bg-background p-1 text-right"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <footer className="flex items-center gap-3">
        <Button
          data-testid="simulate-run-button"
          variant="default"
          disabled={buckets.length === 0}
          onClick={handleRun}
        >
          Simular
        </Button>
        <Button
          data-testid="reuse-last-run-button"
          variant="outline"
          disabled={!runs || runs.length === 0}
        >
          Reusar ultimo run
        </Button>
      </footer>

      {showDiscardDialog ? (
        <div
          data-testid="wizard-discard-edits-dialog"
          role="dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        >
          <div className="rounded-lg bg-background p-4 shadow">
            <p className="text-sm">
              Voce tem edicoes nao salvas. Descartar?
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDiscardDialog(false);
                  setPendingChange(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  if (pendingChange) pendingChange();
                  setShowDiscardDialog(false);
                  setPendingChange(null);
                }}
              >
                Descartar e continuar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default PrimedopeWizard;
