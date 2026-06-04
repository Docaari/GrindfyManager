/**
 * OverallWalletPanel — Bankroll-Reform 2026-05-05 (founder request)
 *
 * Visao consolidada das wallets:
 *   - Header: saldo agregado por moeda nativa (USD, BRL, EUR, etc)
 *   - Tabs:
 *     - Resultados: chart multi-line (1 linha por wallet) com evolucao do
 *       saldo apos cada report (RESULT_REASONS apenas — sem movimentos).
 *     - Movimentacoes: cards Entradas/Saidas globais + lista de tx (excluindo
 *       results/manual_report/rakeback).
 *   - Sem botoes de acao (read-only).
 */
import React, { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";

interface WalletProp {
  id: string;
  name: string;
  platform: string;
  nativeCurrency: string;
  balance: string;
  status: "active" | "archived";
  color?: string | null;
}

interface Tx {
  id: string;
  walletId?: string;
  occurredAt: string;
  direction: "in" | "out";
  nativeAmount: string;
  nativeCurrency: string;
  reason: string;
  note?: string | null;
  previousNativeBalance?: string;
  newNativeBalance?: string;
}

interface Props {
  wallets: WalletProp[];
}

const RESULT_REASONS = new Set(["session_result", "manual_report"]);
const RAKEBACK_REASONS = new Set(["rakeback"]);
const MOVEMENT_EXCLUDE = new Set(["session_result", "manual_report", "rakeback"]);

// Paleta consistente por wallet (fallback quando wallet.color === null).
const PALETTE = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
];

function currencySymbol(ccy: string): string {
  if (ccy === "USD") return "$";
  if (ccy === "BRL") return "R$";
  if (ccy === "EUR") return "€";
  if (ccy === "GBP") return "£";
  return ccy;
}

function fmt(n: number, locale = "pt-BR"): string {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case "deposit": return "Deposito";
    case "withdrawal": return "Saque";
    case "manual_adjustment": return "Ajuste";
    case "transfer_in": return "Transferencia recebida";
    case "transfer_out": return "Transferencia enviada";
    case "fee": return "Taxa";
    default: return reason;
  }
}

export function OverallWalletPanel({ wallets }: Props) {
  const [tab, setTab] = useState<"results" | "movements">("results");
  const [showAllMovements, setShowAllMovements] = useState(false);

  const activeWallets = useMemo(
    () => wallets.filter((w) => w.status === "active"),
    [wallets],
  );

  // Query paralelo: txs de cada wallet ativa.
  const queries = useQueries({
    queries: activeWallets.map((w) => ({
      queryKey: [`/api/wallets/${w.id}/transactions`, { limit: 200 }],
      queryFn: () => apiRequest("GET", `/api/wallets/${w.id}/transactions?limit=200`),
      staleTime: 15_000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const hasError = queries.some((q) => q.isError);

  // Mapa walletId -> tx[]
  const txByWallet = useMemo(() => {
    const map = new Map<string, Tx[]>();
    activeWallets.forEach((w, i) => {
      const data = (queries[i].data as any) ?? null;
      const txs: Tx[] = data?.transactions ?? [];
      map.set(w.id, txs.map((t) => ({ ...t, walletId: w.id })));
    });
    return map;
  }, [activeWallets, queries]);

  // ============ Saldo por moeda ============================================
  const balancesByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of activeWallets) {
      const bal = parseFloat(w.balance);
      if (!Number.isFinite(bal)) continue;
      map.set(w.nativeCurrency, (map.get(w.nativeCurrency) ?? 0) + bal);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [activeWallets]);

  // ============ Chart: multi-line (1 por wallet) ===========================
  const chartData = useMemo(() => {
    type Point = Record<string, number | string | null>;
    const pointsByDate = new Map<string, Point>();

    activeWallets.forEach((w) => {
      const txs = txByWallet.get(w.id) ?? [];
      const filtered = txs
        .filter((t) => RESULT_REASONS.has(t.reason))
        .slice()
        .sort(
          (a, b) =>
            new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
        );
      if (filtered.length === 0) return;
      // Baseline: 1 dia antes do primeiro report, saldo = previousBalance.
      const baselineDate = new Date(filtered[0].occurredAt);
      baselineDate.setDate(baselineDate.getDate() - 1);
      const baselineKey = baselineDate.toISOString().slice(0, 10);
      const baselineSaldo = parseFloat(filtered[0].previousNativeBalance ?? "0");
      const existing = pointsByDate.get(baselineKey) ?? { date: baselineKey };
      existing[w.id] = Number.isFinite(baselineSaldo) ? Math.round(baselineSaldo * 100) / 100 : 0;
      pointsByDate.set(baselineKey, existing);
      for (const t of filtered) {
        const dateKey = t.occurredAt.slice(0, 10);
        const newBal = parseFloat(t.newNativeBalance ?? "0");
        const e = pointsByDate.get(dateKey) ?? { date: dateKey };
        e[w.id] = Number.isFinite(newBal) ? Math.round(newBal * 100) / 100 : 0;
        pointsByDate.set(dateKey, e);
      }
    });

    const points = Array.from(pointsByDate.values()).sort(
      (a, b) => String(a.date).localeCompare(String(b.date)),
    );
    return points;
  }, [activeWallets, txByWallet]);

  // ============ Movimentacoes globais ======================================
  const allMovements = useMemo(() => {
    const list: Array<Tx & { walletName: string; walletCurrency: string }> = [];
    for (const w of activeWallets) {
      const txs = txByWallet.get(w.id) ?? [];
      for (const t of txs) {
        if (MOVEMENT_EXCLUDE.has(t.reason)) continue;
        list.push({ ...t, walletName: w.name, walletCurrency: w.nativeCurrency });
      }
    }
    return list.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  }, [activeWallets, txByWallet]);

  const movementTotals = useMemo(() => {
    // Totais agregados por moeda (entradas/saidas) — tabela curta.
    const byCcy = new Map<string, { in: number; out: number }>();
    for (const m of allMovements) {
      const amt = parseFloat(m.nativeAmount);
      if (!Number.isFinite(amt)) continue;
      const slot = byCcy.get(m.walletCurrency) ?? { in: 0, out: 0 };
      if (m.direction === "in") slot.in += amt;
      else slot.out += amt;
      byCcy.set(m.walletCurrency, slot);
    }
    return Array.from(byCcy.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allMovements]);

  const visibleMovements = showAllMovements ? allMovements : allMovements.slice(0, 10);

  return (
    <div data-testid="overall-wallet-panel" className="flex-1 p-5 space-y-4">
      <header className="pb-4 border-b border-border">
        <h1 className="text-xl font-bold tracking-tight">Geral</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Visao consolidada de todas as carteiras ativas
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {balancesByCurrency.length === 0 ? (
            <span className="text-sm text-muted-foreground">Nenhuma carteira ativa</span>
          ) : (
            balancesByCurrency.map(([ccy, total]) => (
              <div
                key={ccy}
                data-testid={`overall-balance-${ccy}`}
                className="text-base"
              >
                <span className="text-muted-foreground text-xs uppercase tracking-wide mr-1">
                  {ccy}
                </span>
                <span className="font-bold tabular-nums">
                  {currencySymbol(ccy)} {fmt(total)}
                </span>
              </div>
            ))
          )}
        </div>
      </header>

      {hasError && (
        <div
          data-testid="overall-wallet-error"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          Nao foi possivel carregar as movimentacoes de uma ou mais carteiras. Tente atualizar a pagina.
        </div>
      )}

      <div className="rounded-md border bg-card overflow-hidden">
        <div className="flex border-b border-border">
          <button
            type="button"
            data-testid="overall-tab-results"
            aria-pressed={tab === "results"}
            onClick={() => setTab("results")}
            className={
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px " +
              (tab === "results"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            Resultados
          </button>
          <button
            type="button"
            data-testid="overall-tab-movements"
            aria-pressed={tab === "movements"}
            onClick={() => setTab("movements")}
            className={
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px " +
              (tab === "movements"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            Movimentacoes
          </button>
        </div>

        {tab === "results" && (
          <div data-testid="overall-results-pane" className="p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Saldo por carteira (pos-reports)</h3>
              <span className="text-xs text-muted-foreground">
                Linha = saldo nativo apos cada report
              </span>
            </div>
            {isLoading ? (
              <div className="text-xs text-muted-foreground py-6 text-center">
                Carregando...
              </div>
            ) : chartData.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">
                Nenhum report manual ou resultado de sessao em nenhuma carteira.
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 8, right: 8, bottom: 0, left: -10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="date" fontSize={10} tick={{ fill: "currentColor" }} />
                    <YAxis fontSize={10} tick={{ fill: "currentColor" }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {activeWallets.map((w, i) => (
                      <Line
                        key={w.id}
                        type="monotone"
                        dataKey={w.id}
                        name={`${w.name} (${w.nativeCurrency})`}
                        stroke={w.color ?? PALETTE[i % PALETTE.length]}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        strokeWidth={2}
                        isAnimationActive={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {tab === "movements" && (
          <div data-testid="overall-movements-pane" className="p-4 space-y-3">
            {movementTotals.length === 0 ? (
              <div className="text-xs text-muted-foreground py-3 text-center">
                Nenhuma movimentacao financeira registrada.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    data-testid="overall-movements-in"
                    className="rounded-md border p-3"
                  >
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Entradas
                    </div>
                    <div className="space-y-0.5 mt-1">
                      {movementTotals.map(([ccy, totals]) => (
                        <div
                          key={ccy}
                          className="text-sm font-bold text-primary tabular-nums"
                        >
                          + {currencySymbol(ccy)} {fmt(totals.in)} <span className="text-[10px] text-muted-foreground">{ccy}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div
                    data-testid="overall-movements-out"
                    className="rounded-md border p-3"
                  >
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Saidas
                    </div>
                    <div className="space-y-0.5 mt-1">
                      {movementTotals.map(([ccy, totals]) => (
                        <div
                          key={ccy}
                          className="text-sm font-bold text-rose-400 tabular-nums"
                        >
                          - {currencySymbol(ccy)} {fmt(totals.out)} <span className="text-[10px] text-muted-foreground">{ccy}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Transacoes ({allMovements.length})
                  </h4>
                  <ul
                    data-testid="overall-movements-list"
                    className="divide-y border rounded-md"
                  >
                    {visibleMovements.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                        data-reason={m.reason}
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {reasonLabel(m.reason)}{" "}
                            <span className="text-[11px] text-muted-foreground">
                              · {m.walletName}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {new Date(m.occurredAt).toLocaleDateString("pt-BR")}
                            {m.note ? ` · ${m.note}` : ""}
                          </div>
                        </div>
                        <div
                          className={
                            "text-sm font-semibold tabular-nums shrink-0 " +
                            (m.direction === "in" ? "text-primary" : "text-rose-400")
                          }
                        >
                          {m.direction === "in" ? "+" : "-"}
                          {currencySymbol(m.walletCurrency)} {fmt(parseFloat(m.nativeAmount))}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {allMovements.length > 10 && (
                    <div className="flex justify-center pt-2">
                      <button
                        type="button"
                        data-testid="overall-movements-toggle"
                        onClick={() => setShowAllMovements((v) => !v)}
                        className="text-xs text-primary hover:underline"
                      >
                        {showAllMovements
                          ? "Ver menos"
                          : `Ver mais (${allMovements.length - 10})`}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default OverallWalletPanel;
