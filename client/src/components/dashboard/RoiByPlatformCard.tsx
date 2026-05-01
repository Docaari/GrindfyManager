/**
 * RoiByPlatformCard — Sprint Bankroll-3 RF-7
 *
 * Tabela "Plataforma | Sessoes | Profit USD | ROI %" para o dashboard.
 * Default 30d, top 10 plataformas. Cores tone positivo/negativo.
 * QueryKey inclui userId (RF-12 lesson learned).
 */

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface RoiPlatformRow {
  site: string;
  sessionsCount: number;
  tournamentsCount: number;
  investedUSD: number;
  profitUSD: number;
  roiPct: number;
  /** Delta opt-in via ?compareWithPrevious=true (Implementer Round UX #3). */
  previousProfitUSD?: number;
  previousRoiPct?: number;
}

export interface RoiByPlatformCardProps {
  userId: string;
}

const PERIOD_OPTIONS = ["7d", "30d", "90d", "180d", "all"] as const;
type Period = typeof PERIOD_OPTIONS[number];

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function toneFor(profitUSD: number): "positive" | "negative" | "neutral" {
  if (profitUSD > 0) return "positive";
  if (profitUSD < 0) return "negative";
  return "neutral";
}

const TONE_COLORS: Record<"positive" | "negative" | "neutral", string> = {
  positive: "text-emerald-400",
  negative: "text-red-400",
  neutral: "text-zinc-300",
};

export const RoiByPlatformCard: React.FC<RoiByPlatformCardProps> = ({ userId }) => {
  const [period, setPeriod] = useState<Period>("30d");

  // Implementer Round UX #3: compareWithPrevious habilitado por padrao (exceto 'all').
  // Servidor ignora a flag para period='all' (sem janela anterior comparavel).
  const compareWithPrevious = period !== "all";
  const { data, isLoading } = useQuery<{
    period: string;
    generatedAt: string;
    platforms: RoiPlatformRow[];
    hasPreviousComparison?: boolean;
  }>({
    queryKey: ["/api/dashboard/roi-by-platform", userId, period, compareWithPrevious],
    queryFn: async () =>
      await apiRequest(
        "GET",
        `/api/dashboard/roi-by-platform?period=${period}&limit=10${compareWithPrevious ? "&compareWithPrevious=true" : ""}`,
      ),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div data-testid="roi-by-platform-card" className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
        <div data-testid="roi-by-platform-loading" className="animate-pulse text-zinc-400">
          Carregando ROI por plataforma...
        </div>
      </div>
    );
  }

  const platforms = data?.platforms ?? [];

  return (
    <div data-testid="roi-by-platform-card" className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-zinc-100">ROI por plataforma</h3>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="bg-zinc-800 text-zinc-200 rounded px-2 py-1 text-sm"
          aria-label="Periodo"
        >
          {PERIOD_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p === "all" ? "Todo periodo" : p}
            </option>
          ))}
        </select>
      </header>

      {platforms.length === 0 ? (
        <div data-testid="roi-by-platform-empty" className="text-sm text-zinc-400 py-6 text-center">
          Nenhuma sessao no periodo. Importe historico ou inicie uma sessao.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-400">
              <th className="text-left py-1">Plataforma</th>
              <th className="text-right py-1">Sessoes</th>
              <th className="text-right py-1">Investido</th>
              <th className="text-right py-1">Profit</th>
              <th className="text-right py-1">ROI%</th>
              {data?.hasPreviousComparison && (
                <th
                  className="text-right py-1"
                  title={`vs ${period === "7d" ? "7 dias anteriores" : period === "30d" ? "30 dias anteriores" : period === "90d" ? "90 dias anteriores" : "180 dias anteriores"}`}
                >
                  Delta
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {platforms.map((p) => {
              const tone = toneFor(p.profitUSD);
              const color = TONE_COLORS[tone];
              const delta = (p.profitUSD ?? 0) - (p.previousProfitUSD ?? 0);
              const deltaTone = toneFor(delta);
              const deltaColor = TONE_COLORS[deltaTone];
              const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "·";
              return (
                <tr key={p.site} data-testid={`roi-row-${p.site}`} data-tone={tone} className="border-t border-zinc-800">
                  <td className="py-1 text-zinc-100">{p.site}</td>
                  <td className="py-1 text-right text-zinc-200">{p.sessionsCount}</td>
                  <td className="py-1 text-right text-zinc-200">{formatUsd(p.investedUSD)}</td>
                  <td className={`py-1 text-right ${color}`}>{formatUsd(p.profitUSD)}</td>
                  <td className={`py-1 text-right ${color}`}>{p.roiPct.toFixed(2)}%</td>
                  {data?.hasPreviousComparison && (
                    <td
                      data-testid={`roi-delta-${p.site}`}
                      data-delta-tone={deltaTone}
                      className={`py-1 text-right ${deltaColor}`}
                      title={`Periodo anterior: ${formatUsd(p.previousProfitUSD ?? 0)}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <span aria-hidden="true">{arrow}</span>
                        <span>{formatUsd(delta)}</span>
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default RoiByPlatformCard;
