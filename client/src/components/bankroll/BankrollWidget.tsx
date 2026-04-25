/**
 * BankrollWidget — Dashboard widget (RF-09)
 *
 * Spec: docs/specs/bankroll-management.md (RF-09)
 * - Empty state quando configured=false (CTA para /settings)
 * - Banca atual USD + BRL (via exchangeRates)
 * - Mini-sparkline dos ultimos 30d
 * - Projecao mensal oculta quando ROI30d <= 0
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface BankrollState {
  configured: boolean;
  amount: number | null;
  rule?: string;
  rulePct?: number;
  tolerance?: number;
  maxBuyInUSD: number | null;
  maxBuyInDisplay?: { USD: number | null; BRL?: number };
  snapshotCount?: number;
  lastUpdatedAt?: string | null;
}

interface BankrollHistory {
  series: Array<{ bucket: string; balance: number; movements: number; delta: number }>;
  summary: {
    netChange?: number;
    startBalance?: number;
    endBalance?: number;
  };
}

function formatUSD(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBRL(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BankrollWidget() {
  const { data: state } = useQuery<BankrollState>({
    queryKey: ["/api/bankroll"],
    queryFn: () => apiRequest("GET", "/api/bankroll"),
  });

  const { data: history } = useQuery<BankrollHistory>({
    queryKey: ["/api/bankroll/history"],
    queryFn: () => apiRequest("GET", "/api/bankroll/history"),
    enabled: !!state?.configured,
  });

  if (!state) return null;

  if (!state.configured) {
    return (
      <div
        data-testid="bankroll-widget-empty"
        className="rounded-lg border p-4 bg-card"
      >
        <h3 className="text-lg font-semibold mb-2">Banca nao configurada</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Configure sua banca para habilitar o filtro de buy-in no Tournament Selector
          e acompanhar sua evolucao financeira.
        </p>
        <a
          href="/settings"
          data-to="/settings"
          data-testid="bankroll-widget-cta"
          className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
        >
          Configure sua banca
        </a>
      </div>
    );
  }

  const amount = state.amount ?? 0;
  const amountBRL = state.maxBuyInDisplay?.BRL;
  const series = history?.series ?? [];

  // ROI simples sobre a serie (endBalance - startBalance) / startBalance
  const start = history?.summary?.startBalance ?? 0;
  const end = history?.summary?.endBalance ?? amount;
  const roi = start > 0 ? (end - start) / start : 0;
  const showProjection = roi > 0;

  // Mini-sparkline: polyline SVG
  const sparkPath = buildSparklinePath(series);

  return (
    <div className="rounded-lg border p-4 bg-card space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Banca atual</h3>
        <span className="text-xs text-muted-foreground">
          {state.rule ?? "1pct"} - max {formatUSD(state.maxBuyInUSD)} USD
        </span>
      </div>

      <div>
        <div
          data-testid="bankroll-widget-amount"
          className="text-2xl font-semibold"
        >
          ${formatUSD(amount)} USD
        </div>
        {amountBRL != null && (
          <div
            data-testid="bankroll-widget-amount-brl"
            className="text-sm text-muted-foreground"
          >
            R$ {formatBRL((amount) * (amountBRL / Math.max(state.maxBuyInUSD ?? 1, 0.0001)))}
          </div>
        )}
      </div>

      {series.length > 0 && (
        <div data-testid="bankroll-widget-sparkline" className="h-8">
          <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="w-full h-full">
            <polyline
              points={sparkPath}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="text-primary"
            />
          </svg>
        </div>
      )}

      {showProjection ? (
        <div data-testid="bankroll-widget-projection" className="text-xs text-muted-foreground">
          Projecao mensal: +{(roi * 100).toFixed(1)}%
        </div>
      ) : (
        <div data-testid="bankroll-widget-projection" className="text-xs text-muted-foreground">
          Foco em estabilizar a banca antes da proxima projecao
        </div>
      )}
    </div>
  );
}

function buildSparklinePath(series: Array<{ balance: number }>): string {
  if (!series.length) return "";
  const values = series.map((s) => s.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / Math.max(series.length - 1, 1)) * 100;
      const y = 20 - ((v - min) / range) * 18 - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export default BankrollWidget;
