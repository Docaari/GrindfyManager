/**
 * WalletActivityPanel — Bankroll-Reform 2026-05-05
 *
 * Renderiza dentro de WalletDetailPanel:
 *   - Tabs "Resultados" | "Movimentacoes"
 *   - Tab Resultados: LineChart 2 series (results + rakeback) + total no canto.
 *   - Tab Movimentacoes: cards Entradas/Saidas + lista de transactions
 *     (excluindo session_result, manual_report, rakeback).
 *   - Abaixo: lista paginada das ultimas movimentacoes (founder pediu render
 *     real — antes era placeholder).
 */
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

interface Tx {
  id: string;
  occurredAt: string;
  direction: "in" | "out";
  nativeAmount: string;
  nativeCurrency: string;
  reason: string;
  note?: string | null;
  sessionId?: string | null;
  source?: string | null;
  previousNativeBalance?: string;
  newNativeBalance?: string;
}

interface TxResp {
  transactions: Tx[];
  pagination?: { total: number; limit: number; offset: number };
  summary?: any;
}

interface Props {
  walletId: string;
  nativeCurrency: string;
}

const RESULT_REASONS = new Set(["session_result", "manual_report"]);
const RAKEBACK_REASONS = new Set(["rakeback"]);
const MOVEMENT_EXCLUDE = new Set(["session_result", "manual_report", "rakeback"]);

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
    case "deposit":
      return "Deposito";
    case "withdrawal":
      return "Saque";
    case "session_result":
      return "Resultado de sessao";
    case "manual_report":
      return "Saldo reportado";
    case "rakeback":
      return "Rakeback";
    case "manual_adjustment":
      return "Ajuste";
    case "transfer_in":
      return "Transferencia recebida";
    case "transfer_out":
      return "Transferencia enviada";
    default:
      return reason;
  }
}

function signedAmount(t: Tx): number {
  const amt = parseFloat(t.nativeAmount);
  if (!Number.isFinite(amt)) return 0;
  return t.direction === "in" ? amt : -amt;
}

const MOVEMENTS_INITIAL = 10;

export function WalletActivityPanel({ walletId, nativeCurrency }: Props) {
  const [tab, setTab] = useState<"results" | "movements">("results");
  const [showAll, setShowAll] = useState(false);
  const [showAllMovements, setShowAllMovements] = useState(false);

  const { data, isLoading } = useQuery<TxResp>({
    queryKey: [`/api/wallets/${walletId}/transactions`, { limit: 200 }],
    queryFn: () => apiRequest("GET", `/api/wallets/${walletId}/transactions?limit=200`),
    staleTime: 15_000,
  });

  const transactions = data?.transactions ?? [];

  // ============ Chart data: results tab =============================
  // Linha "Saldo": evolucao do saldo absoluto da wallet apos cada report
  //   (session_result + manual_report). Founder espera ver curva indo de
  //   X (saldo prev do primeiro report) ate Y (saldo new do ultimo report).
  // Linha "Rakeback": cumulativo de rakeback recebido (separado).
  // Baseline ancorado em (firstReportPrevBalance, 0) 1 dia antes da primeira
  //   tx — garante 2 pontos minimo pra Recharts plotar linha.
  // Total canto: (saldoFinal - saldoInicial) + cumRakeback. Positivo = lucro.
  const chartData = useMemo(() => {
    const filtered = transactions
      .filter(
        (t) => RESULT_REASONS.has(t.reason) || RAKEBACK_REASONS.has(t.reason),
      )
      .slice()
      .sort(
        (a, b) =>
          new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
      );
    const points: Array<{ date: string; saldo: number | null; rakeback: number }> = [];
    if (filtered.length === 0) {
      return { points, totalDelta: 0, totalRakeback: 0, baselineSaldo: 0, finalSaldo: 0 };
    }
    let cumRakeback = 0;
    let lastSaldo = parseFloat(filtered[0].previousNativeBalance ?? "0");
    if (!Number.isFinite(lastSaldo)) lastSaldo = 0;
    const baselineSaldo = lastSaldo;
    const baselineDate = new Date(filtered[0].occurredAt);
    baselineDate.setDate(baselineDate.getDate() - 1);
    points.push({
      date: baselineDate.toISOString().slice(0, 10),
      saldo: Math.round(baselineSaldo * 100) / 100,
      rakeback: 0,
    });
    for (const t of filtered) {
      if (RESULT_REASONS.has(t.reason)) {
        const newBal = parseFloat(t.newNativeBalance ?? String(lastSaldo));
        if (Number.isFinite(newBal)) lastSaldo = newBal;
      } else if (RAKEBACK_REASONS.has(t.reason)) {
        cumRakeback += signedAmount(t);
      }
      points.push({
        date: t.occurredAt.slice(0, 10),
        saldo: Math.round(lastSaldo * 100) / 100,
        rakeback: Math.round(cumRakeback * 100) / 100,
      });
    }
    return {
      points,
      totalDelta: lastSaldo - baselineSaldo,
      totalRakeback: cumRakeback,
      baselineSaldo,
      finalSaldo: lastSaldo,
    };
  }, [transactions]);

  const resultsNet = chartData.totalDelta + chartData.totalRakeback;

  // ============ Movements tab =======================================
  const movements = useMemo(
    () => transactions.filter((t) => !MOVEMENT_EXCLUDE.has(t.reason)),
    [transactions],
  );
  const movementTotals = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const t of movements) {
      const amt = parseFloat(t.nativeAmount);
      if (!Number.isFinite(amt)) continue;
      if (t.direction === "in") totalIn += amt;
      else totalOut += amt;
    }
    return { totalIn, totalOut };
  }, [movements]);

  // ============ Lista de movimentos (founder fix) ===================
  const allTxsSorted = useMemo(
    () =>
      transactions
        .slice()
        .sort(
          (a, b) =>
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        ),
    [transactions],
  );
  const visibleTxs = showAll ? allTxsSorted : allTxsSorted.slice(0, 10);

  return (
    <div data-testid="wallet-activity-panel" className="space-y-4">
      <div className="rounded-md border bg-card overflow-hidden">
        <div
          data-testid="wallet-activity-tabs"
          className="flex border-b border-border"
        >
          <button
            type="button"
            data-testid="wallet-activity-tab-results"
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
            data-testid="wallet-activity-tab-movements"
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
          <div data-testid="wallet-activity-results-pane" className="p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Resultados x Rakeback</h3>
              <div
                data-testid="wallet-activity-results-total"
                className={
                  "text-lg font-bold tabular-nums " +
                  (resultsNet >= 0 ? "text-primary" : "text-rose-400")
                }
              >
                {resultsNet >= 0 ? "+" : ""}
                {currencySymbol(nativeCurrency)} {fmt(resultsNet)}
              </div>
            </div>
            {chartData.points.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">
                Nenhum resultado registrado nesta carteira.
              </div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData.points}
                    margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
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
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="saldo"
                      name="Saldo apos reports"
                      stroke="hsl(var(--primary))"
                      dot={{ r: 4, fill: "hsl(var(--primary))" }}
                      activeDot={{ r: 6 }}
                      strokeWidth={2}
                      isAnimationActive={false}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="rakeback"
                      name="Rakeback acumulado"
                      stroke="#f59e0b"
                      dot={{ r: 3, fill: "#f59e0b" }}
                      activeDot={{ r: 5 }}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {tab === "movements" && (
          <div
            data-testid="wallet-activity-movements-pane"
            className="p-4 space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div
                data-testid="wallet-activity-movements-in"
                className="rounded-md border p-3"
              >
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  Entradas
                </div>
                <div className="text-lg font-bold text-primary tabular-nums mt-1">
                  + {currencySymbol(nativeCurrency)} {fmt(movementTotals.totalIn)}
                </div>
              </div>
              <div
                data-testid="wallet-activity-movements-out"
                className="rounded-md border p-3"
              >
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  Saidas
                </div>
                <div className="text-lg font-bold text-rose-400 tabular-nums mt-1">
                  - {currencySymbol(nativeCurrency)} {fmt(movementTotals.totalOut)}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Transacoes e transferencias
              </h4>
              {movements.length === 0 ? (
                <div className="text-xs text-muted-foreground py-3 text-center">
                  Nenhuma movimentacao financeira registrada.
                </div>
              ) : (
                <>
                  <ul
                    data-testid="wallet-activity-movements-list"
                    className="divide-y border rounded-md"
                  >
                    {(showAllMovements
                      ? movements
                      : movements.slice(0, MOVEMENTS_INITIAL)
                    ).map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                        data-reason={t.reason}
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{reasonLabel(t.reason)}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {new Date(t.occurredAt).toLocaleDateString("pt-BR")}
                            {t.note ? ` · ${t.note}` : ""}
                          </div>
                        </div>
                        <div
                          className={
                            "text-sm font-semibold tabular-nums shrink-0 " +
                            (t.direction === "in" ? "text-primary" : "text-rose-400")
                          }
                        >
                          {t.direction === "in" ? "+" : "-"}
                          {currencySymbol(t.nativeCurrency)} {fmt(parseFloat(t.nativeAmount))}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {movements.length > MOVEMENTS_INITIAL && (
                    <div className="flex justify-center pt-2">
                      <button
                        type="button"
                        data-testid="wallet-activity-movements-toggle"
                        onClick={() => setShowAllMovements((v) => !v)}
                        className="text-xs text-primary hover:underline"
                      >
                        {showAllMovements
                          ? "Ver menos"
                          : `Ver mais (${movements.length - MOVEMENTS_INITIAL})`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lista de movimentos (founder fix: era placeholder, agora real) */}
      <div className="rounded-md border bg-card">
        <div className="flex items-baseline justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Ultimas movimentacoes</h3>
          {allTxsSorted.length > 10 && (
            <button
              type="button"
              data-testid="wallet-activity-toggle-all"
              onClick={() => setShowAll((v) => !v)}
              className="text-xs text-primary hover:underline"
            >
              {showAll ? "Ver menos" : `Ver mais (${allTxsSorted.length - 10})`}
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="px-4 py-6 text-xs text-muted-foreground text-center">
            Carregando...
          </div>
        ) : allTxsSorted.length === 0 ? (
          <div className="px-4 py-6 text-xs text-muted-foreground text-center">
            Nenhum movimento registrado.
          </div>
        ) : (
          <ul
            data-testid="wallet-activity-tx-list"
            className="divide-y"
          >
            {visibleTxs.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                data-testid={`wallet-activity-tx-${t.id}`}
                data-reason={t.reason}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {reasonLabel(t.reason)}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {new Date(t.occurredAt).toLocaleString("pt-BR")}
                    {t.note ? ` · ${t.note}` : ""}
                  </div>
                </div>
                <div
                  className={
                    "text-sm font-semibold tabular-nums shrink-0 " +
                    (t.direction === "in" ? "text-primary" : "text-rose-400")
                  }
                >
                  {t.direction === "in" ? "+" : "-"}
                  {currencySymbol(t.nativeCurrency)} {fmt(parseFloat(t.nativeAmount))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default WalletActivityPanel;
