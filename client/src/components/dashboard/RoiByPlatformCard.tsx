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

export const RoiByPlatformCard: React.FC<RoiByPlatformCardProps> = ({ userId }) => {
  const [period, setPeriod] = useState<Period>("30d");

  const { data, isLoading } = useQuery<{ period: string; generatedAt: string; platforms: RoiPlatformRow[] }>({
    queryKey: ["/api/dashboard/roi-by-platform", userId, period],
    queryFn: async () =>
      await apiRequest("GET", `/api/dashboard/roi-by-platform?period=${period}&limit=10`),
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
            </tr>
          </thead>
          <tbody>
            {platforms.map((p) => {
              const tone = p.profitUSD > 0 ? "positive" : p.profitUSD < 0 ? "negative" : "neutral";
              const color =
                tone === "positive" ? "text-emerald-400" : tone === "negative" ? "text-red-400" : "text-zinc-300";
              return (
                <tr key={p.site} data-testid={`roi-row-${p.site}`} data-tone={tone} className="border-t border-zinc-800">
                  <td className="py-1 text-zinc-100">{p.site}</td>
                  <td className="py-1 text-right text-zinc-200">{p.sessionsCount}</td>
                  <td className="py-1 text-right text-zinc-200">{formatUsd(p.investedUSD)}</td>
                  <td className={`py-1 text-right ${color}`}>{formatUsd(p.profitUSD)}</td>
                  <td className={`py-1 text-right ${color}`}>{p.roiPct.toFixed(2)}%</td>
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
