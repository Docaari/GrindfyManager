/**
 * BankrollWidget — Dashboard widget (RF-09)
 *
 * Spec: docs/specs/bankroll-management.md (RF-09)
 * - Empty state quando configured=false (CTA para /settings)
 * - Banca atual USD + BRL (via exchangeRates)
 * - Mini-sparkline dos ultimos 30d
 * - Projecao mensal oculta quando ROI30d <= 0
 */
import React, { useMemo } from "react";
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
  // MED-3 fix (UX-2 2026-04-25): backend agora expoe estes campos diretamente
  amountDisplay?: { USD: number | null; BRL?: number };
  exchangeRateBRL?: number | null;
  snapshotCount?: number;
  lastUpdatedAt?: string | null;
  // Sprint Bankroll-2 v2 (compat reverso — campos novos opcionais)
  aggregationMode?: "global" | "per_wallet";
  walletCount?: number;
}

interface BankrollHistory {
  series: Array<{ bucket: string; balance: number; movements: number; delta: number }>;
  snapshots?: Array<{ delta: any; reason: string; occurredAt: string }>;
  summary: {
    netChange?: number;
    startBalance?: number;
    endBalance?: number;
  };
}

// Sprint Bankroll-Profit-Chart 2026-05-03: sparkline considera apenas
// reasons que representam lucro/prejuizo de poker. Aportes/saques/transfers
// nao deslocam a curva (founder pediu visualizacao de performance pura).
const PROFIT_REASONS = new Set(["session_result", "rakeback", "manual_report"]);

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

  // Profit-only sparkline: filtra snapshots para reasons de lucro e acumula
  // deltas a partir de 0. Aportes/saques sao ignorados de proposito.
  // Hook precede os early returns abaixo (lessons-learned #1).
  const profitSeries = useMemo(() => {
    const snaps = history?.snapshots ?? [];
    const sorted = snaps
      .filter((s) => PROFIT_REASONS.has(s.reason))
      .slice()
      .sort(
        (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
      );
    let cum = 0;
    return sorted.map((s) => {
      const raw = typeof s.delta === "number" ? s.delta : parseFloat(String(s.delta));
      const d = Number.isFinite(raw) ? raw : 0;
      cum += d;
      return { balance: cum };
    });
  }, [history?.snapshots]);

  if (!state) return null;

  if (!state.configured) {
    return (
      <div
        data-testid="bankroll-widget-empty"
        className="rounded-lg border p-5 bg-card"
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
          className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
        >
          Configure sua banca
        </a>
      </div>
    );
  }

  const amount = state.amount ?? 0;
  // MED-3 fix (UX-2 2026-04-25): le amountDisplay.BRL direto do backend
  // (preferencial). Fallback para o calculo derivado antigo apenas quando o
  // backend nao expoe a chave nova (compat retroativa durante rollout).
  const amountBRL = state.amountDisplay?.BRL
    ?? (state.exchangeRateBRL != null ? amount * state.exchangeRateBRL : undefined);

  // ROI simples sobre a serie (endBalance - startBalance) / startBalance
  const start = history?.summary?.startBalance ?? 0;
  const end = history?.summary?.endBalance ?? amount;
  const roi = start > 0 ? (end - start) / start : 0;
  const showProjection = roi > 0;

  const sparkPath = buildSparklinePath(profitSeries);

  return (
    <div className="rounded-lg border p-5 bg-card space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Banca atual</h3>
        <span className="text-xs text-muted-foreground">
          {state.rule ?? "1pct"} · max ${formatUSD(state.maxBuyInUSD)} USD
        </span>
      </div>

      <div>
        <div
          data-testid="bankroll-widget-amount"
          className="text-3xl font-bold text-primary tabular-nums"
        >
          ${formatUSD(amount)} <span className="text-base text-muted-foreground font-medium">USD</span>
        </div>
        {amountBRL != null && (
          <div
            data-testid="bankroll-widget-amount-brl"
            className="text-sm text-muted-foreground"
          >
            R$ {formatBRL(amountBRL)}
          </div>
        )}
        {state.walletCount != null && state.walletCount > 0 && (
          <div
            data-testid="bankroll-widget-wallet-count"
            className="text-xs text-muted-foreground mt-1"
          >
            {state.walletCount} {state.walletCount === 1 ? "carteira" : "carteiras"}
          </div>
        )}
      </div>

      {profitSeries.length > 0 && (
        <div data-testid="bankroll-widget-sparkline-wrapper" className="space-y-1">
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
          <p
            data-testid="bankroll-widget-sparkline-note"
            className="text-[11px] leading-tight text-muted-foreground"
          >
            Curva considera apenas lucros e prejuizos de sessoes, rakeback e reports manuais. Aportes e retiradas sao ignorados.
          </p>
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
