/**
 * Tournament Selector Calibration Dashboard — Sprint TS-3 RF-05 (ADR-179)
 *
 * Pagina admin restrita. Mostra "Score vs ROI realizado" cohort 30/90/180d.
 * Acessibilidade reduzida (a11y exception ADR-179 §4).
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useUserRole } from "@/hooks/useUserRole";
import { apiRequest } from "@/lib/queryClient";

type Bucket = {
  grade: string;
  adds: number;
  realized: number;
  realizedRoiPct: number;
  expectedRoiPct: number;
  discrepancyPct: number;
};

type Payload =
  | {
      insufficientData: true;
      currentVolume: number;
      requiredVolume: number;
      lookbackDays: number;
    }
  | {
      lookbackDays: number;
      totalAdds: number;
      realizedAdds: number;
      buckets: Bucket[];
      warnings: string[];
      generatedAt?: string;
    };

const LOOKBACKS = [30, 90, 180];

function discrepancyClass(d: number, adds: number): string {
  if (adds < 20) return "text-muted-foreground";
  const abs = Math.abs(d);
  if (abs > 5) return "text-red-600 bg-red-50 alert delta-negative";
  return "text-green-700 delta-positive";
}

export default function CalibrationDashboard() {
  const role = useUserRole();
  const [, navigate] = useLocation();
  const [lookback, setLookback] = useState<number>(90);

  useEffect(() => {
    if (role && !role.isAdmin) {
      navigate("/home");
    }
  }, [role, navigate]);

  const { data, isLoading } = useQuery<Payload>({
    queryKey: ["admin-selector-calibration", lookback],
    queryFn: async () => {
      return apiRequest(
        "GET",
        `/api/admin/tournament-selector/calibration?lookbackDays=${lookback}`,
      ) as Promise<Payload>;
    },
    enabled: !!role?.isAdmin,
  });

  if (!role?.isAdmin) return null;

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-4">Calibracao do Tournament Selector</h1>
        <div className="flex gap-2 mb-4" role="group" aria-label="Lookback">
          {LOOKBACKS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLookback(n)}
              aria-pressed={n === lookback}
              className={
                n === lookback
                  ? "px-3 py-1 rounded bg-primary text-primary-foreground"
                  : "px-3 py-1 rounded border"
              }
            >
              {n}d
            </button>
          ))}
        </div>
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (data && (data as any).insufficientData) {
    const d = data as Extract<Payload, { insufficientData: true }>;
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-4">Calibracao do Tournament Selector</h1>
        <div className="flex gap-2 mb-4" role="group" aria-label="Lookback">
          {LOOKBACKS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLookback(n)}
              aria-pressed={n === lookback}
              className={
                n === lookback
                  ? "px-3 py-1 rounded bg-primary text-primary-foreground"
                  : "px-3 py-1 rounded border"
              }
            >
              {n}d
            </button>
          ))}
        </div>
        <div
          data-testid="calibration-empty-insufficient"
          className="rounded border p-4 bg-muted/50"
        >
          Aguardando volume telemetria - atual {d.currentVolume} de {d.requiredVolume} minimo.
          Calibracao estatistica nao e confiavel abaixo deste limite.
        </div>
      </div>
    );
  }

  const ready = data as Extract<Payload, { buckets: Bucket[] }> | undefined;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-2">Calibracao do Tournament Selector</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Dados <strong>realized</strong> (post-hoc); causalidade vs preditividade nao confirmada -
        use como sinal, nao como verdade absoluta.
      </p>
      <div className="flex gap-2 mb-4" role="group" aria-label="Lookback">
        {LOOKBACKS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setLookback(n)}
            aria-pressed={n === lookback}
            className={
              n === lookback
                ? "px-3 py-1 rounded bg-primary text-primary-foreground"
                : "px-3 py-1 rounded border"
            }
          >
            {n}d
          </button>
        ))}
      </div>
      {ready && (
        <table
          className="w-full border-collapse text-sm"
          data-testid="calibration-table"
        >
          <thead>
            <tr className="bg-muted">
              <th scope="col" className="text-left p-2">Grade</th>
              <th scope="col" className="text-right p-2">Adds</th>
              <th scope="col" className="text-right p-2">Realized</th>
              <th scope="col" className="text-right p-2">ROI realizado %</th>
              <th scope="col" className="text-right p-2">ROI esperado %</th>
              <th scope="col" className="text-right p-2">Discrepancia</th>
            </tr>
          </thead>
          <tbody>
            {ready.buckets.map((b) => (
              <tr
                key={b.grade}
                data-testid={`calibration-row-${b.grade}`}
                className={discrepancyClass(b.discrepancyPct, b.adds)}
              >
                <td className="p-2">{b.grade}</td>
                <td className="p-2 text-right">{b.adds}</td>
                <td className="p-2 text-right">{b.realized}</td>
                <td className="p-2 text-right">{b.realizedRoiPct.toFixed(1)}</td>
                <td className="p-2 text-right">{b.expectedRoiPct.toFixed(1)}</td>
                <td className="p-2 text-right">{b.discrepancyPct.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ready?.warnings?.length ? (
        <ul className="mt-4 text-sm text-amber-700">
          {ready.warnings.map((w) => (
            <li key={w}>! {w}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 text-xs text-muted-foreground">
        Sample agregado: {ready?.totalAdds ?? 0} adds.
      </div>
    </div>
  );
}
