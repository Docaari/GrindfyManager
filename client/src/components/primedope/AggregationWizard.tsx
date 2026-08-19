// =============================================================================
// AggregationWizard — UX refactor 2026-05-29 (v2)
//
// Mudancas v2 (founder feedback — calculadora MTT):
//   - Buy-in agora EDITAVEL (input com prefixo $) — antes era so display
//   - Nome do grupo editavel + adicionar/remover tipos de torneio (linhas)
//   - Removido "Investimento diario" (founder: nao deve aparecer)
//   - Payload sanitizado antes de simular: field arredondado p/ int >= 2,
//     count clamp >= 1, buyIn > 0 (corrige "Payload invalido" do backend zod)
//   - Tipografia maior (text-sm) + inputs mais largos p/ leitura/navegacao
//   - Resumo formatado (Intl pt-BR) de total de torneios + investimento
//
// Math/contrato com backend NAO muda — input shape p/ onRun preservado
// (groups + weeks). data-testids estaveis preservados (lesson #2).
// =============================================================================

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, Loader2, Plus, Trash2, Download } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
  source: "historical" | "default" | "library";
  lowSample: boolean;
  // Importacao "Grade e ROI" (biblioteca de torneios) — rastro do dado cru.
  plannedId?: string;
  totalBuyIn?: number;
  siteFeePct?: number;
  site?: string | null;
  tournamentName?: string | null;
  occurrencesPerWeek?: number;
  days?: number[];
  libRoiPct?: number | null;
  libVolume?: number;
  matchLevel?: string;
  matchScopeLabel?: string | null;
  siteSampleMissing?: boolean;
  placesPaidPct?: number; // ADR-215 D6 — ITM% (decimal, default 0.15)
  rakePct?: number; // ADR-216 — rake (decimal, default 0)
}

// Espelha o cap do backend (server/routes/primedope.ts). Passar disso derrubava
// a simulacao com "Payload invalido" sem explicar o motivo.
const MAX_SIM_GROUPS = 80;

const DEFAULT_ITM = 0.15;
const DEFAULT_RAKE = 0;

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

const DAY_LABELS: Record<number, string> = {
  0: "dom",
  1: "seg",
  2: "ter",
  3: "qua",
  4: "qui",
  5: "sex",
  6: "sab",
};

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          className="ml-1 inline-flex items-center align-middle"
          aria-label="Mais informacoes"
        >
          <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

const chipBase =
  "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors border";
const chipActive =
  "bg-primary text-primary-foreground border-primary shadow-sm";
const chipIdle =
  "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground";

const inputBase =
  "rounded-md border border-input bg-background text-foreground px-2 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Sanitiza um grupo para o contrato zod do backend (primedope.ts):
 *   field  -> inteiro >= 2 (avg historico vem float; zod exige .int())
 *   count  -> inteiro >= 1 (round pode dar 0; zod exige .positive())
 *   buyIn  -> > 0 (zod exige .positive())
 * Corrige o erro "Payload invalido" que aparecia ao simular.
 */
function sanitizeForSimulate(g: AggGroup): AggGroup {
  const field = Math.max(2, Math.min(100000, Math.round(Number(g.field) || 2)));
  const count = Math.max(1, Math.min(50000, Math.round(Number(g.count) || 1)));
  const buyIn = Math.max(0.01, Number(g.buyIn) || 0.01);
  const roi = Number.isFinite(Number(g.roi)) ? Number(g.roi) : 0;
  // ITM% (decimal): zod backend exige [0.05, 0.5]
  const itm = Math.max(
    0.05,
    Math.min(0.5, Number(g.placesPaidPct ?? DEFAULT_ITM) || DEFAULT_ITM),
  );
  // Rake (decimal): zod backend exige [0, 0.5]
  const rake = Math.max(
    0,
    Math.min(0.5, Number(g.rakePct ?? DEFAULT_RAKE) || 0),
  );
  return {
    ...g,
    name: (g.name || "Grupo").trim() || "Grupo",
    buyIn,
    field,
    count,
    roi,
    isPKO: !!g.isPKO,
    placesPaidPct: itm,
    rakePct: rake,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AggregationWizard({
  onRun,
  profileLetter: initialProfile,
}: AggregationWizardProps = {}) {
  const [mode, setMode] = useState<"period" | "day">("period");
  const [profile, setProfile] = useState(initialProfile ?? "A");
  const [weeks, setWeeks] = useState(12);
  const [editedGroups, setEditedGroups] = useState<AggGroup[] | null>(null);
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  // Importacao da grade + ROI da biblioteca (1 linha por torneio planejado).
  const [imported, setImported] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMeta, setImportMeta] = useState<{
    lineCount: number;
    plannedCount: number;
    matchedCount: number;
    activeDays: number[];
    skippedInactive: number;
  } | null>(null);

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
    // Import da grade vence a agregacao por bucket — nao clobbera as linhas
    // importadas quando a query de buckets responde.
    if (imported) return;
    if (data?.groups) {
      setEditedGroups(data.groups.map((g) => ({ ...g })));
      setRawInputs({});
    }
  }, [data, imported]);

  const importGradeAndRoi = async (opts?: { silent?: boolean }) => {
    setImporting(true);
    if (!opts?.silent) setImportError(null);
    try {
      const res: any = await apiRequest(
        "GET",
        `/api/variance/grade-roi?profileLetter=${profile}&weeks=${weeks}`,
      );
      const rows: any[] = Array.isArray(res?.rows) ? res.rows : [];
      if (rows.length === 0) {
        const skipped = Number(res?.meta?.skippedInactive) || 0;
        setImportError(
          skipped > 0
            ? `Nenhum dia da semana esta com o perfil ${profile} ativo — ${skipped} torneio(s) do perfil ficaram de fora. Ative o perfil ${profile} em algum dia na aba Grade.`
            : `Nenhum torneio na grade do perfil ${profile}.`,
        );
        setEditedGroups([]);
        setImportMeta(null);
        setImporting(false);
        return;
      }
      setEditedGroups(
        rows.map((r) => ({
          name: r.name,
          tier: r.tier,
          type: r.type,
          buyIn: Number(r.buyIn) || 0,
          field: Number(r.field) || 500,
          roi: Number(r.roi) || 0,
          countPerWeek: Number(r.countPerWeek) || 1,
          count: Number(r.count) || weeks,
          isPKO: !!r.isPKO,
          source: r.source === "library" ? "library" : "default",
          lowSample: !!r.lowSample,
          placesPaidPct: Number(r.placesPaidPct) || DEFAULT_ITM,
          rakePct: Number(r.rakePct) || DEFAULT_RAKE,
          plannedId: r.plannedId,
          totalBuyIn: Number(r.totalBuyIn) || undefined,
          siteFeePct: Number(r.siteFeePct) || undefined,
          site: r.site ?? null,
          tournamentName: r.tournamentName ?? null,
          occurrencesPerWeek: Number(r.occurrencesPerWeek) || 1,
          days: Array.isArray(r.days) ? r.days : [],
          libRoiPct: r.libRoiPct ?? null,
          libVolume: Number(r.libVolume) || 0,
          matchLevel: r.matchLevel,
          matchScopeLabel: r.matchScopeLabel ?? null,
          siteSampleMissing: !!r.siteSampleMissing,
        })),
      );
      setImportMeta({
        lineCount: Number(res?.meta?.lineCount) || rows.length,
        plannedCount: Number(res?.meta?.plannedCount) || rows.length,
        matchedCount: Number(res?.meta?.matchedCount) || 0,
        activeDays: Array.isArray(res?.meta?.activeDays)
          ? res.meta.activeDays
          : [],
        skippedInactive: Number(res?.meta?.skippedInactive) || 0,
      });
      setImportError(null);
      setRawInputs({});
      setImported(true);
    } catch (err: any) {
      console.error("[AggregationWizard] importGradeAndRoi falhou", err);
      setImportError(
        err?.message ?? "Nao foi possivel importar a grade agora.",
      );
    } finally {
      setImporting(false);
    }
  };

  // Trocar perfil/periodo depois de importar re-puxa a grade correspondente
  // (senao a tabela ficaria mostrando a grade do perfil anterior).
  useEffect(() => {
    if (!imported) return;
    void importGradeAndRoi({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, weeks]);

  const groups = editedGroups ?? data?.groups ?? [];

  const handleGroupEdit = (
    index: number,
    field: "name" | "buyIn" | "roi" | "field" | "count" | "itm" | "rake",
    value: string,
  ) => {
    setRawInputs((prev) => ({ ...prev, [`${field}-${index}`]: value }));
    setEditedGroups((prev) => {
      const next = [...(prev ?? groups)];
      // itm/rake sao digitados em PERCENT na UI, guardados em DECIMAL (engine).
      if (field === "itm") {
        next[index] = { ...next[index], placesPaidPct: (Number(value) || 0) / 100 };
      } else if (field === "rake") {
        next[index] = { ...next[index], rakePct: (Number(value) || 0) / 100 };
      } else {
        const parsed = field === "name" ? value : Number(value) || 0;
        next[index] = { ...next[index], [field]: parsed };
      }
      return next;
    });
  };

  const addGroup = () => {
    setEditedGroups((prev) => {
      const base = prev ?? groups;
      const newGroup: AggGroup = {
        name: "Novo torneio",
        tier: "mid",
        type: "Vanilla",
        buyIn: 50,
        field: 500,
        roi: 0.1,
        countPerWeek: 0,
        count: Math.max(1, weeks),
        isPKO: false,
        source: "default",
        lowSample: false,
        placesPaidPct: DEFAULT_ITM,
        rakePct: DEFAULT_RAKE,
      };
      return [...base, newGroup];
    });
  };

  const removeGroup = (index: number) => {
    setEditedGroups((prev) => {
      const base = prev ?? groups;
      const next = base.filter((_, i) => i !== index);
      return next;
    });
    // limpa rawInputs do indice removido (reindexa visualmente no proximo render)
    setRawInputs({});
  };

  const isEmpty = !groups.length && !isLoading && mode === "period";

  // Resumo formatado
  const totalCount = groups.reduce((s, g) => s + (Number(g.count) || 0), 0);
  const totalInvest = groups.reduce(
    (s, g) => s + (Number(g.buyIn) || 0) * (Number(g.count) || 0),
    0,
  );
  // EV esperado da grade = soma de (investimento da linha x ROI da linha).
  const totalEv = groups.reduce(
    (s, g) =>
      s +
      (Number(g.buyIn) || 0) * (Number(g.count) || 0) * (Number(g.roi) || 0),
    0,
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div
        data-testid="aggregation-wizard"
        className="space-y-5 rounded-lg border border-border bg-card p-5 text-foreground"
      >
        {/* Header + disclaimer */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              Configuração da simulação
            </h2>
            <p className="text-sm text-muted-foreground">
              Escolha perfil, período e ajuste buy-in/ROI/field/quantidade antes
              de simular. Valores em{" "}
              <span className="font-medium text-foreground">USD</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDisclaimer((v) => !v)}
            className="shrink-0 text-sm text-amber-600 dark:text-amber-500 hover:underline"
          >
            {showDisclaimer ? "Ocultar" : "Como funciona / limitações"}
          </button>
        </div>

        {/* Aviso de leaks sempre visivel (founder: leaks devem aparecer na pagina) */}
        <button
          type="button"
          data-testid="known-leaks-banner"
          onClick={() => setShowDisclaimer(true)}
          className="flex w-full items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-500/15"
        >
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Modelo aproximado:</strong> tem leaks conhecidos (rake, ITM,
            satélite, PKO, estrutura de payout). Clique para ver o que ainda não
            é modelado com precisão.
          </span>
        </button>

        {showDisclaimer ? (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-2.5">
            <div className="space-y-1.5">
              <p>
                <strong className="text-foreground">Monte Carlo:</strong> rodamos
                10.000 simulacoes do seu volume planejado. Cada torneio sorteia
                uma posicao (distribuicao calibrada pelo ROI liquido alvo) e
                calcula o payout pela tabela power-law tipica do field.
              </p>
              <p>
                Os percentis (P15/P85, P2.5/P97.5) mostram{" "}
                <em>onde 70% / 95%</em> dos cenarios caem — nao predicao, mas
                distribuicao da variancia esperada dado seu edge declarado.
              </p>
              <p>
                <strong className="text-foreground">Rake + ITM</strong> agora sao
                editaveis por torneio. Rake entra no custo real e na calibracao
                do edge (prize pool = field × buy-in, rake fora — modelo
                PrimeDope/MTTDB). ITM% controla quantas posicoes pagam.
              </p>
            </div>

            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2.5">
              <p className="mb-1 font-semibold text-amber-700 dark:text-amber-400">
                Leaks conhecidos (o que o modelo AINDA nao captura com
                precisao):
              </p>
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  <strong>Payout sintético:</strong> usa curva power-law por
                  faixa de field, não a estrutura real de pagamentos de cada
                  torneio.
                </li>
                <li>
                  <strong>PKO/bounty simplificado:</strong> achata a curva, mas
                  não modela o pool de bounty como fluxo de EV separado
                  (subestima upside/variância de PKO).
                </li>
                <li>
                  <strong>Satélite:</strong> tratado como torneio normal —
                  payout flat de assentos (todos ganham o mesmo) ainda não é
                  modelado.
                </li>
                <li>
                  <strong>Sem re-entry / rebuy / add-on:</strong> não multiplica
                  custo nem ajusta field efetivo.
                </li>
                <li>
                  <strong>Sem late registration / ICM / deals</strong> de mesa
                  final.
                </li>
                <li>
                  <strong>Field fixo (média):</strong> usa o tamanho médio, não
                  a variação real de field por torneio.
                </li>
                <li>
                  <strong>ROI como ponto fixo:</strong> assume o ROI declarado
                  exato, sem a incerteza própria da amostra.
                </li>
                <li>
                  <strong>Independência entre torneios</strong> e drawdown só
                  com granularidade semanal (swings intra-dia subestimados).
                </li>
              </ul>
              <p className="mt-1.5 text-[11px]">
                Use como referência de risco, não garantia. Roadmap de
                melhorias:{" "}
                <span className="font-mono">
                  docs/specs/sprint-variance-calculator-poker-fidelity.md
                </span>
                .
              </p>
            </div>
          </div>
        ) : null}

        {/* Mode toggle */}
        <div className="space-y-2">
          <div className="flex items-center text-sm font-medium text-muted-foreground">
            Modo
            <InfoTip text="'Por periodo' agrega torneios do seu historico nesse perfil. 'Por dia' (legacy) filtra so o dia da semana." />
          </div>
          <div
            data-testid="aggregation-mode-toggle"
            role="tablist"
            className="inline-flex rounded-md border border-border bg-background p-0.5"
          >
            <button
              type="button"
              role="tab"
              data-testid="mode-por-periodo"
              aria-pressed={mode === "period" ? "true" : "false"}
              onClick={() => setMode("period")}
              className={cn(
                "rounded px-3.5 py-1.5 text-sm transition-colors",
                mode === "period"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Por período
            </button>
            <button
              type="button"
              role="tab"
              data-testid="mode-por-dia"
              aria-pressed={mode === "day" ? "true" : "false"}
              onClick={() => setMode("day")}
              className={cn(
                "rounded px-3.5 py-1.5 text-sm transition-colors",
                mode === "day"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Por dia
            </button>
          </div>
        </div>

        {/* Profile + period in same row on md+ */}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center text-sm font-medium text-muted-foreground">
              Perfil do dia
              <InfoTip text="A = volume alto (~6 dias/sem). B = misto. C = leve. Vem da configuracao da Grade." />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["A", "B", "C"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  data-testid={`profile-selector-${p}`}
                  onClick={() => setProfile(p)}
                  aria-pressed={profile === p ? "true" : "false"}
                  className={cn(chipBase, profile === p ? chipActive : chipIdle)}
                >
                  Perfil {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center text-sm font-medium text-muted-foreground">
              Período simulado
              <InfoTip text="Quantas semanas de grind agregar. Periodos longos suavizam variancia (mais torneios = distribuicao mais centrada)." />
            </div>
            <div className="flex flex-wrap gap-2">
              {PERIODS.map((pd) => (
                <button
                  key={pd.weeks}
                  type="button"
                  data-testid={`period-${pd.weeks}`}
                  onClick={() => setWeeks(pd.weeks)}
                  aria-pressed={weeks === pd.weeks ? "true" : "false"}
                  className={cn(
                    chipBase,
                    weeks === pd.weeks ? chipActive : chipIdle,
                  )}
                >
                  {pd.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Importar Grade e ROI — 1 linha por torneio planejado, rotulado e
            com o ROI do jogador vindo da Biblioteca de Torneios. */}
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/20 p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="import-grade-roi-button"
            disabled={importing}
            onClick={() => void importGradeAndRoi()}
          >
            {importing ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            Importar Grade e ROI
          </Button>
          <p className="text-xs text-muted-foreground">
            Puxa os torneios do perfil {profile} nos dias em que ele esta ativo
            (ignora dias OFF e dias de outro perfil), rotula pelo padrao da
            Biblioteca, traz seu ROI naquele tipo de torneio — limitado a faixa
            realista de -20% a +40% — e o rake padrao de cada site.
          </p>
          {importMeta ? (
            <span
              data-testid="import-grade-meta"
              className="text-xs text-muted-foreground"
            >
              {importMeta.lineCount} linhas · {importMeta.plannedCount} torneios
              na semana · {importMeta.matchedCount} com amostra do proprio site
              {importMeta.activeDays.length > 0
                ? ` · dias com perfil ${profile} ativo: ${importMeta.activeDays
                    .map((d) => DAY_LABELS[d] ?? d)
                    .join(", ")}`
                : ""}
              {importMeta.skippedInactive > 0
                ? ` · ${importMeta.skippedInactive} fora (dia OFF ou de outro perfil)`
                : ""}
            </span>
          ) : null}
          {importError ? (
            <span
              data-testid="import-grade-error"
              className="text-xs text-red-500"
            >
              {importError}
            </span>
          ) : null}
        </div>

        {/* Loading state */}
        {isLoading && mode === "period" ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando agregacao de torneios...
          </div>
        ) : null}

        {/* Empty state */}
        {isEmpty ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
            <p data-testid="empty-state">
              Adicione torneios na aba Grade para simular.
            </p>
            <p className="mt-1 text-xs">
              Sem grade salva, nao conseguimos agregar buckets por perfil.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={addGroup}
            >
              <Plus className="mr-1 h-4 w-4" />
              Adicionar tipo manualmente
            </Button>
          </div>
        ) : null}

        {/* Aggregated table */}
        {groups.length > 0 && (
          <div className="space-y-3">
            {/* Resumo */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                Total de torneios:{" "}
                <span className="font-semibold text-foreground">
                  {intFmt.format(totalCount)}
                </span>
              </span>
              <span className="text-muted-foreground">
                Investimento total:{" "}
                <span className="font-semibold text-foreground">
                  ${intFmt.format(Math.round(totalInvest))}
                </span>
              </span>
              <span className="text-muted-foreground">
                EV esperado:{" "}
                <span
                  data-testid="grade-ev-total"
                  className={cn(
                    "font-semibold",
                    totalEv > 0
                      ? "text-emerald-500"
                      : totalEv < 0
                        ? "text-red-500"
                        : "text-foreground",
                  )}
                >
                  {totalEv < 0 ? "-" : ""}$
                  {intFmt.format(Math.round(Math.abs(totalEv)))}
                </span>
              </span>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table
                data-testid="aggregation-table"
                className="w-full text-sm"
              >
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">Torneio</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      <span className="inline-flex items-center justify-end">
                        Buy-in (USD)
                        <InfoTip text="Buy-in medio USD do bucket (parte que vai pro prize pool). Editavel — ajuste para simular subida/descida de stake." />
                      </span>
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      <span className="inline-flex items-center justify-end">
                        Rake %
                        <InfoTip text="Taxa do site sobre o buy-in (ex: $100+$9 = 9%). Entra no CUSTO real e na calibracao do edge (ADR-216). Prize pool = field x buy-in (rake fora). Default 0." />
                      </span>
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      <span className="inline-flex items-center justify-end">
                        Field
                        <InfoTip text="Tamanho medio do field (jogadores). Afeta variancia: campo maior = top-heavy = upside maior porem rarefeito." />
                      </span>
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      <span className="inline-flex items-center justify-end">
                        ITM %
                        <InfoTip text="% do field que entra no dinheiro (places paid). Standard ~15%, Flat ~20%, Turbo/Steep ~10-12%. Mais ITM = payouts menores porem mais frequentes. Default 15%." />
                      </span>
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      <span className="inline-flex items-center justify-end">
                        ROI (decimal)
                        <InfoTip text="ROI LIQUIDO (ja descontado rake) em decimal: 0.10 = 10%, 0.20 = 20%. Negativo: -0.05 = -5%." />
                      </span>
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      <span className="inline-flex items-center justify-end">
                        Quantidade
                        <InfoTip text="Quantos torneios desse bucket entram na simulacao durante o periodo escolhido." />
                      </span>
                    </th>
                    <th className="px-3 py-2.5 text-center font-medium">Fonte</th>
                    <th className="px-2 py-2.5 text-center font-medium sr-only">
                      Remover
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {groups.map((g, i) => {
                    const roiRaw =
                      rawInputs[`roi-${i}`] ??
                      (editedGroups?.[i]?.roi?.toString() ?? g.roi.toString());
                    const roiNum = Number(roiRaw);
                    const roiPctDisplay = Number.isFinite(roiNum)
                      ? `${(roiNum * 100).toFixed(1)}%`
                      : "—";

                    return (
                      <tr
                        key={`${g.tier}-${g.type}-${i}`}
                        data-testid={`group-row-${i}`}
                        className="hover:bg-muted/20"
                      >
                        <td className="px-3 py-2.5 text-foreground">
                          <input
                            data-testid={`name-input-${i}`}
                            type="text"
                            value={
                              rawInputs[`name-${i}`] ??
                              (editedGroups?.[i]?.name ?? g.name)
                            }
                            onChange={(e) =>
                              handleGroupEdit(i, "name", e.target.value)
                            }
                            className={cn(inputBase, "w-full min-w-[120px]")}
                          />
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                            {g.isPKO ? <span>PKO</span> : null}
                            {g.tournamentName ? <span>{g.tournamentName}</span> : null}
                            {g.occurrencesPerWeek && g.occurrencesPerWeek > 0 ? (
                              <span data-testid={`row-frequency-${i}`}>
                                {g.occurrencesPerWeek}x/semana
                                {g.days && g.days.length > 0
                                  ? ` · ${g.days
                                      .map((d) => DAY_LABELS[d] ?? d)
                                      .join(", ")}`
                                  : ""}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="relative inline-block">
                            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                              $
                            </span>
                            <input
                              data-testid={`buyin-input-${i}`}
                              type="text"
                              inputMode="decimal"
                              value={
                                rawInputs[`buyIn-${i}`] ??
                                (editedGroups?.[i]?.buyIn?.toString() ??
                                  g.buyIn.toString())
                              }
                              onChange={(e) =>
                                handleGroupEdit(i, "buyIn", e.target.value)
                              }
                              className={cn(
                                inputBase,
                                "w-24 pl-5 text-right font-mono",
                              )}
                            />
                          </div>
                          {g.totalBuyIn ? (
                            <div
                              data-testid={`buyin-total-hint-${i}`}
                              className="mt-0.5 text-[10px] text-muted-foreground"
                              title="Voce paga o buy-in total; a coluna mostra so a parte que vai ao prize pool. A diferenca e a taxa do site, aplicada na coluna Rake."
                            >
                              total ${g.totalBuyIn}
                              {g.siteFeePct ? ` · taxa ${g.siteFeePct}%` : ""}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="relative inline-block">
                            <input
                              data-testid={`rake-input-${i}`}
                              type="text"
                              inputMode="decimal"
                              value={
                                rawInputs[`rake-${i}`] ??
                                (
                                  (editedGroups?.[i]?.rakePct ??
                                    g.rakePct ??
                                    DEFAULT_RAKE) * 100
                                ).toString()
                              }
                              onChange={(e) =>
                                handleGroupEdit(i, "rake", e.target.value)
                              }
                              className={cn(
                                inputBase,
                                "w-16 pr-5 text-right font-mono",
                              )}
                            />
                            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                              %
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            data-testid={`field-input-${i}`}
                            type="text"
                            inputMode="numeric"
                            value={
                              rawInputs[`field-${i}`] ??
                              (editedGroups?.[i]?.field?.toString() ??
                                g.field.toString())
                            }
                            onChange={(e) =>
                              handleGroupEdit(i, "field", e.target.value)
                            }
                            className={cn(
                              inputBase,
                              "w-24 text-right font-mono",
                            )}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="relative inline-block">
                            <input
                              data-testid={`itm-input-${i}`}
                              type="text"
                              inputMode="decimal"
                              value={
                                rawInputs[`itm-${i}`] ??
                                (
                                  (editedGroups?.[i]?.placesPaidPct ??
                                    g.placesPaidPct ??
                                    DEFAULT_ITM) * 100
                                ).toString()
                              }
                              onChange={(e) =>
                                handleGroupEdit(i, "itm", e.target.value)
                              }
                              className={cn(
                                inputBase,
                                "w-16 pr-5 text-right font-mono",
                              )}
                            />
                            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                              %
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              data-testid={`roi-input-${i}`}
                              type="text"
                              inputMode="decimal"
                              value={roiRaw}
                              onChange={(e) =>
                                handleGroupEdit(i, "roi", e.target.value)
                              }
                              className={cn(
                                inputBase,
                                "w-20 text-right font-mono",
                              )}
                            />
                            <span
                              data-testid={`roi-pct-display-${i}`}
                              className={cn(
                                "min-w-[48px] text-right text-xs",
                                roiNum > 0
                                  ? "text-emerald-500"
                                  : roiNum < 0
                                    ? "text-red-500"
                                    : "text-muted-foreground",
                              )}
                            >
                              {roiPctDisplay}
                            </span>
                          </div>
                          {g.matchLevel === "none" ? (
                            <div
                              data-testid={`roi-library-hint-${i}`}
                              className="mt-0.5 text-[10px] text-amber-500"
                              title="A Biblioteca nao tem nenhum torneio parecido. O ROI e um ponto de partida, nao um dado seu."
                            >
                              sem amostra na biblioteca · ROI padrao 15%
                            </div>
                          ) : g.libRoiPct !== null && g.libRoiPct !== undefined ? (
                            <div
                              data-testid={`roi-library-hint-${i}`}
                              className={cn(
                                "mt-0.5 text-[10px]",
                                g.siteSampleMissing
                                  ? "text-amber-500/80"
                                  : "text-muted-foreground",
                              )}
                              title={
                                g.siteSampleMissing
                                  ? "A Biblioteca nao tem torneios desse site nessa faixa. O ROI vem da sua media no mesmo tipo e faixa de buy-in, somando todos os sites."
                                  : "ROI e volume que constam na Biblioteca de Torneios para esse tipo de torneio (valor cru, sem o limite de -20%/+40%)"
                              }
                            >
                              {g.siteSampleMissing
                                ? `sem amostra${g.site ? ` de ${g.site}` : ""} · sua media em ${g.matchScopeLabel}: `
                                : "biblioteca: "}
                              {g.libRoiPct.toFixed(1)}% ·{" "}
                              {intFmt.format(Number(g.libVolume) || 0)} torneios
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            data-testid={`count-input-${i}`}
                            type="text"
                            inputMode="numeric"
                            value={
                              rawInputs[`count-${i}`] ??
                              (editedGroups?.[i]?.count?.toString() ??
                                g.count.toString())
                            }
                            onChange={(e) =>
                              handleGroupEdit(i, "count", e.target.value)
                            }
                            className={cn(
                              inputBase,
                              "w-24 text-right font-mono",
                            )}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {g.source === "library" ? (
                            <span
                              data-testid={`badge-lib-${i}`}
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                g.siteSampleMissing
                                  ? "bg-amber-500/15 text-amber-500"
                                  : "bg-emerald-500/15 text-emerald-500",
                              )}
                              title={
                                g.siteSampleMissing
                                  ? "Aproximacao: sua media no mesmo tipo/faixa, sem amostra desse site"
                                  : "ROI vindo da Biblioteca de Torneios (seu historico real)"
                              }
                            >
                              {g.siteSampleMissing ? "aprox" : "lib"}
                            </span>
                          ) : g.source === "historical" ? (
                            <span
                              data-testid={`badge-hist-${i}`}
                              className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-500"
                              title="Calculado do seu historico real"
                            >
                              hist
                            </span>
                          ) : (
                            <span
                              data-testid={`badge-est-${i}`}
                              className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500"
                              title="Estimativa (default) — amostra insuficiente"
                            >
                              est
                            </span>
                          )}
                          {g.lowSample ? (
                            <div
                              className="mt-0.5 text-[10px] text-amber-500/70"
                              title="Amostra pequena — valor pouco confiavel"
                            >
                              n baixo
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <button
                            type="button"
                            data-testid={`remove-group-${i}`}
                            onClick={() => removeGroup(i)}
                            aria-label={`Remover ${g.name}`}
                            title="Remover este tipo de torneio"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Adicionar tipo */}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="add-group-button"
                onClick={addGroup}
              >
                <Plus className="mr-1 h-4 w-4" />
                Adicionar tipo de torneio
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                {groups.length > MAX_SIM_GROUPS
                  ? `${groups.length} linhas — a simulacao aceita ate ${MAX_SIM_GROUPS}. Junte ou remova linhas.`
                  : "Edicoes ficam ativas so nesta sessao — nao alteram o historico."}
              </p>
              <Button
                data-testid="simulate-button"
                disabled={groups.length === 0 || groups.length > MAX_SIM_GROUPS}
                title={
                  groups.length > MAX_SIM_GROUPS
                    ? `A simulacao aceita ate ${MAX_SIM_GROUPS} linhas. Remova ou junte linhas antes de simular.`
                    : undefined
                }
                onClick={() => {
                  if (onRun && groups.length > 0) {
                    onRun({
                      groups: groups.map(sanitizeForSimulate),
                      weeks,
                    });
                  }
                }}
              >
                Simular variância
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
