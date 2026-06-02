/**
 * BankrollHealthCard — Painel BRM/RoR ao vivo (Fase D #8, ADR-236 D-7).
 *
 * Mostra o Risk of Ruin REAL do jogador (banca atual × perfil de jogo
 * historico), alimentado por GET /api/variance/bankroll-health.
 *
 * 4 estados (dataSufficiency):
 *   ok          → card completo (RoR% + badge classificacao), sem aviso.
 *   low         → card completo + aviso "amostra pequena" (NAO esconde — #11).
 *   none        → empty-state "importe seus torneios" + CTA /upload.
 *   no_bankroll → empty-state "configure sua banca".
 *
 * useQuery isolado (lesson #29): wrapper ErrorBoundary local impede que falta de
 * QueryClientProvider derrube o /bankroll inteiro. apiRequest ja devolve JSON
 * parseado (lesson #13).
 *
 * data-testid estaveis (lesson #2): bankroll-health-card, bankroll-health-empty,
 * bankroll-health-low-sample, bankroll-health-ror, bankroll-health-classification.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { tokens } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

type RorClassification = "healthy" | "warning" | "risky";
type DataSufficiency = "ok" | "low" | "none" | "no_bankroll";

interface BankrollHealthResult {
  bankrollUsd: number;
  roiMean: number | null;
  stdDev: number | null;
  riskOfRuinPct: number | null;
  classification: RorClassification | null;
  dataSufficiency: DataSufficiency;
  sampleSize: number;
  bisOfMargin: number | null;
  groupsUsed: number;
}

const CLASSIFICATION_META: Record<
  RorClassification,
  { label: string; tone: "success" | "warn" | "danger" }
> = {
  healthy: { label: "Saudável", tone: "success" },
  warning: { label: "Atenção", tone: "warn" },
  risky: { label: "Arriscado", tone: "danger" },
};

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

function clampRor(pct: number | null): number | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, pct));
}

// ---------------------------------------------------------------------------
// ErrorBoundary local (lesson #29) — isola a sub-arvore com useQuery.
// ---------------------------------------------------------------------------
class HealthErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    // lesson #9 — log antes de esconder.
    console.error("[BankrollHealthCard] render error", err);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Conteudo (consome useQuery)
// ---------------------------------------------------------------------------
function BankrollHealthCardInner() {
  const { data, isLoading } = useQuery<BankrollHealthResult>({
    queryKey: ["/api/variance/bankroll-health"],
    queryFn: () => apiRequest("GET", "/api/variance/bankroll-health"),
  });

  if (isLoading || !data) {
    return (
      <div
        data-testid="bankroll-health-card"
        className="rounded-lg border bg-card p-5"
      >
        <div className="h-5 w-40 rounded bg-muted animate-pulse" />
        <div className="mt-4 h-8 w-24 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  const suf = data.dataSufficiency;

  // --- Empty states (none / no_bankroll) ---
  if (suf === "none" || suf === "no_bankroll") {
    const isNoBankroll = suf === "no_bankroll";
    return (
      <div
        data-testid="bankroll-health-card"
        className="rounded-lg border bg-card p-5"
      >
        <h3 className="text-sm font-semibold tracking-tight">
          Risco de Ruína (BRM)
        </h3>
        <div
          data-testid="bankroll-health-empty"
          className="mt-3 text-sm text-muted-foreground"
        >
          {isNoBankroll ? (
            <p>
              Adicione sua banca para ver o risco de ruína da sua situação atual.
            </p>
          ) : (
            <p>
              Sem histórico suficiente. Importe seus torneios para calcular o
              risco de ruína.{" "}
              <a
                href="/upload"
                className={cn("underline", tokens.color.action.text)}
              >
                Importar torneios
              </a>
            </p>
          )}
        </div>
      </div>
    );
  }

  // --- ok / low: card completo ---
  const ror = clampRor(data.riskOfRuinPct);
  const cls = data.classification
    ? CLASSIFICATION_META[data.classification]
    : null;
  const tone = cls ? tokens.color[cls.tone] : tokens.color.neutral;
  const isLow = suf === "low";

  return (
    <div
      data-testid="bankroll-health-card"
      className="rounded-lg border bg-card p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight">
          Risco de Ruína (BRM)
        </h3>
        {cls && (
          <span
            data-testid="bankroll-health-classification"
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium border",
              tone.bg,
              tone.text,
              tone.border,
            )}
          >
            {cls.label}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span
          data-testid="bankroll-health-ror"
          className={cn("text-3xl font-bold tabular-nums", tone.text)}
        >
          {fmtPct(ror)}
        </span>
        <span className="text-xs text-muted-foreground">risco de ruína</span>
      </div>

      {isLow && (
        <div
          data-testid="bankroll-health-low-sample"
          className={cn(
            "mt-3 rounded-md border px-3 py-2 text-xs",
            tokens.color.warn.bg,
            tokens.color.warn.text,
            tokens.color.warn.border,
          )}
        >
          Amostra pequena ({data.sampleSize} torneios
          {data.groupsUsed > 0 ? `, ${data.groupsUsed} grupo${data.groupsUsed === 1 ? "" : "s"} válido${data.groupsUsed === 1 ? "" : "s"}` : ""}
          ) — estimativa imprecisa.
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Banca</dt>
          <dd className="font-medium tabular-nums">{fmtUsd(data.bankrollUsd)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">ROI histórico</dt>
          <dd className="font-medium tabular-nums">
            {data.roiMean == null ? "—" : fmtPct(data.roiMean * 100)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Desvio padrão</dt>
          <dd className="font-medium tabular-nums">{fmtUsd(data.stdDev)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">BIs de margem</dt>
          <dd className="font-medium tabular-nums">
            {data.bisOfMargin == null
              ? "—"
              : Math.round(data.bisOfMargin).toLocaleString("pt-BR")}
          </dd>
        </div>
      </dl>

      {cls && (
        <p className="mt-3 text-xs text-muted-foreground">{suggestionFor(data.classification!)}</p>
      )}
    </div>
  );
}

function suggestionFor(c: RorClassification): string {
  switch (c) {
    case "healthy":
      return "Sua banca suporta bem seu volume atual.";
    case "warning":
      return "Considere subir a banca ou reduzir o ABI.";
    case "risky":
      return "Risco de ruína alto — reduza buy-ins ou reforce a banca antes de continuar.";
  }
}

export function BankrollHealthCard() {
  return (
    <HealthErrorBoundary>
      <BankrollHealthCardInner />
    </HealthErrorBoundary>
  );
}

export default BankrollHealthCard;
