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

import { Fragment, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Info, Loader2, Plus, Trash2 } from "lucide-react";
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
  source: "historical" | "default";
  lowSample: boolean;
  placesPaidPct?: number; // ADR-215 D6 — ITM% (decimal, default 0.15)
  rakePct?: number; // ADR-216 — rake (decimal, default 0.07)
  payoutStructure?: PayoutStructure; // ADR-217
  avgEntries?: number; // ADR-217 — re-entry (bullets médios; default 1)
}

type PayoutStructure = "standard" | "flat" | "topheavy" | "satellite";

const DEFAULT_ITM = 0.15;
// Rake default = média MTT da GGPoker (#1 site). GG cobra ~5-9% conforme buy-in
// (maior buy-in = rake menor); 7% é o meio representativo. Founder 2026-05-29.
const DEFAULT_RAKE = 0.07;
const DEFAULT_STRUCTURE: PayoutStructure = "standard";

// ADR-217: ITM% default por estrutura (consenso indústria). Satélite ~10%.
const ITM_BY_STRUCTURE: Record<PayoutStructure, number> = {
  standard: 0.15,
  flat: 0.2,
  topheavy: 0.12,
  satellite: 0.1,
};

const STRUCTURE_OPTIONS: { value: PayoutStructure; label: string }[] = [
  { value: "standard", label: "Padrão" },
  { value: "flat", label: "Flat" },
  { value: "topheavy", label: "Top-Heavy" },
  { value: "satellite", label: "Satélite" },
];

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

/** decimal (0.07) -> string percent ("7") sem ruido de float IEEE754. */
const pctStr = (dec: number) => String(Math.round(dec * 1e6) / 1e4);

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
  const structure: PayoutStructure = g.payoutStructure ?? DEFAULT_STRUCTURE;
  const entries = Math.max(1, Math.min(10, Number(g.avgEntries ?? 1) || 1));
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
    payoutStructure: structure,
    avgEntries: entries,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AggregationWizard({
  onRun,
  profileLetter: initialProfile,
}: AggregationWizardProps = {}) {
  // VR-CALC-2: fonte dos buckets — grade planejada (default) vs histórico CSV.
  const [source, setSource] = useState<"planned" | "history">("planned");
  const [lastDays, setLastDays] = useState(30);
  // Período do histórico: atalho "últimos N dias" OU intervalo personalizado.
  const [histMode, setHistMode] = useState<"lastDays" | "range">("lastDays");
  const [histFrom, setHistFrom] = useState("");
  const [histTo, setHistTo] = useState("");
  const [mode, setMode] = useState<"period" | "day">("period");
  const [profile, setProfile] = useState(initialProfile ?? "A");
  const [weeks, setWeeks] = useState(12);
  const [editedGroups, setEditedGroups] = useState<AggGroup[] | null>(null);
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery<AggResponse>({
    queryKey: ["buckets-aggregate", profile, weeks],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/variance/buckets-aggregate?profileLetter=${profile}&weeks=${weeks}`,
      ),
    enabled: source === "planned" && mode === "period",
  });

  // VR-CALC-2: agregação do histórico real (uploads CSV) por período.
  // Intervalo personalizado só dispara quando from<=to preenchidos.
  const histRangeReady =
    histMode === "lastDays" || (!!histFrom && !!histTo && histFrom <= histTo);
  const histQueryParam =
    histMode === "lastDays"
      ? `lastDays=${lastDays}`
      : `from=${histFrom}&to=${histTo}`;
  const { data: histData, isLoading: histLoading } = useQuery<AggResponse>({
    queryKey: ["history-aggregate", histMode, lastDays, histFrom, histTo, weeks],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/variance/history-aggregate?${histQueryParam}&weeks=${weeks}`,
      ),
    enabled: source === "history" && histRangeReady,
  });

  const activeData = source === "history" ? histData : data;
  const activeLoading = source === "history" ? histLoading : isLoading;

  useEffect(() => {
    if (activeData?.groups) {
      setEditedGroups(activeData.groups.map((g) => ({ ...g })));
      setRawInputs({});
    }
  }, [activeData]);

  const groups = editedGroups ?? activeData?.groups ?? [];

  const handleGroupEdit = (
    index: number,
    field: "name" | "buyIn" | "roi" | "field" | "count" | "itm" | "rake" | "entries",
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
      } else if (field === "entries") {
        next[index] = { ...next[index], avgEntries: Number(value) || 1 };
      } else {
        const parsed = field === "name" ? value : Number(value) || 0;
        next[index] = { ...next[index], [field]: parsed };
      }
      return next;
    });
  };

  // ADR-217: trocar estrutura ajusta o ITM% default da estrutura (a menos que
  // o usuário já tenha customizado o ITM nesta linha via rawInputs).
  const handleStructureChange = (index: number, structure: PayoutStructure) => {
    setEditedGroups((prev) => {
      const next = [...(prev ?? groups)];
      const itmTouched = rawInputs[`itm-${index}`] !== undefined;
      next[index] = {
        ...next[index],
        payoutStructure: structure,
        ...(itmTouched ? {} : { placesPaidPct: ITM_BY_STRUCTURE[structure] }),
      };
      return next;
    });
  };

  const toggleRow = (index: number) => {
    setExpandedRows((prev) => {
      const n = new Set(prev);
      if (n.has(index)) n.delete(index);
      else n.add(index);
      return n;
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
        payoutStructure: DEFAULT_STRUCTURE,
        avgEntries: 1,
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

  const isEmpty =
    !groups.length &&
    !activeLoading &&
    (source === "history" || mode === "period");

  // Resumo formatado
  const totalCount = groups.reduce((s, g) => s + (Number(g.count) || 0), 0);
  const totalInvest = groups.reduce(
    (s, g) => s + (Number(g.buyIn) || 0) * (Number(g.count) || 0),
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

        {/* VR-CALC-2: Fonte dos buckets — grade planejada vs histórico CSV */}
        <div className="space-y-2">
          <div className="flex items-center text-sm font-medium text-muted-foreground">
            Fonte dos dados
            <InfoTip text="'Grade planejada' usa a grade que voce montou. 'Meu historico' importa os torneios reais que voce upou (CSV) no periodo escolhido — ROI/field/buy-in vem dos seus numeros reais." />
          </div>
          <div
            data-testid="aggregation-source-toggle"
            role="tablist"
            className="inline-flex rounded-md border border-border bg-background p-0.5"
          >
            <button
              type="button"
              role="tab"
              data-testid="source-planned"
              aria-pressed={source === "planned" ? "true" : "false"}
              onClick={() => setSource("planned")}
              className={cn(
                "rounded px-3.5 py-1.5 text-sm transition-colors",
                source === "planned"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Grade planejada
            </button>
            <button
              type="button"
              role="tab"
              data-testid="source-history"
              aria-pressed={source === "history" ? "true" : "false"}
              onClick={() => setSource("history")}
              className={cn(
                "rounded px-3.5 py-1.5 text-sm transition-colors",
                source === "history"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Meu histórico
            </button>
          </div>
        </div>

        {/* Mode toggle — só na grade planejada (legacy) */}
        {source === "planned" ? (
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
        ) : null}

        {/* Profile/Período-histórico + período simulado in same row on md+ */}
        <div className="grid gap-5 md:grid-cols-2">
          {source === "planned" ? (
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
                    className={cn(
                      chipBase,
                      profile === p ? chipActive : chipIdle,
                    )}
                  >
                    Perfil {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center text-sm font-medium text-muted-foreground">
                Período do histórico
                <InfoTip text="Só torneios com data dentro desse período entram. Importa do seu histórico real upado via CSV (/upload)." />
              </div>
              {/* Sub-toggle: atalho últimos N dias vs intervalo personalizado */}
              <div
                data-testid="hist-mode-toggle"
                role="tablist"
                className="inline-flex rounded-md border border-border bg-background p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  data-testid="hist-mode-lastdays"
                  aria-pressed={histMode === "lastDays" ? "true" : "false"}
                  onClick={() => setHistMode("lastDays")}
                  className={cn(
                    "rounded px-3 py-1 text-xs transition-colors",
                    histMode === "lastDays"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Últimos N dias
                </button>
                <button
                  type="button"
                  role="tab"
                  data-testid="hist-mode-range"
                  aria-pressed={histMode === "range" ? "true" : "false"}
                  onClick={() => setHistMode("range")}
                  className={cn(
                    "rounded px-3 py-1 text-xs transition-colors",
                    histMode === "range"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Intervalo
                </button>
              </div>

              {histMode === "lastDays" ? (
                <div className="flex flex-wrap gap-2">
                  {[
                    { d: 7, label: "7 dias" },
                    { d: 30, label: "30 dias" },
                    { d: 90, label: "90 dias" },
                    { d: 365, label: "1 ano" },
                  ].map((opt) => (
                    <button
                      key={opt.d}
                      type="button"
                      data-testid={`hist-period-${opt.d}`}
                      onClick={() => setLastDays(opt.d)}
                      aria-pressed={lastDays === opt.d ? "true" : "false"}
                      className={cn(
                        chipBase,
                        lastDays === opt.d ? chipActive : chipIdle,
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    data-testid="hist-from"
                    value={histFrom}
                    max={histTo || undefined}
                    onChange={(e) => setHistFrom(e.target.value)}
                    className={cn(inputBase, "w-[150px]")}
                    aria-label="Data inicial"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <input
                    type="date"
                    data-testid="hist-to"
                    value={histTo}
                    min={histFrom || undefined}
                    onChange={(e) => setHistTo(e.target.value)}
                    className={cn(inputBase, "w-[150px]")}
                    aria-label="Data final"
                  />
                  {histMode === "range" && (!histFrom || !histTo) ? (
                    <span
                      data-testid="hist-range-hint"
                      className="text-[11px] text-amber-600 dark:text-amber-500"
                    >
                      Escolha início e fim
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          )}

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

        {/* Loading state */}
        {activeLoading ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {source === "history"
              ? "Carregando seu histórico no período..."
              : "Carregando agregacao de torneios..."}
          </div>
        ) : null}

        {/* Empty state */}
        {isEmpty ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
            {source === "history" ? (
              <>
                <p data-testid="empty-state">
                  Nenhum torneio no período selecionado.
                </p>
                <p className="mt-1 text-xs">
                  Importe seu histórico em /upload (CSV) ou amplie o período.
                </p>
              </>
            ) : (
              <>
                <p data-testid="empty-state">
                  Adicione torneios na aba Grade para simular.
                </p>
                <p className="mt-1 text-xs">
                  Sem grade salva, nao conseguimos agregar buckets por perfil.
                </p>
              </>
            )}
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
                        <InfoTip text="Taxa do site sobre o buy-in (ex: $100+$9 = 9%). Entra no CUSTO real e na calibracao do edge (ADR-216). Prize pool = field x buy-in (rake fora). Default 7% (media MTT GGPoker; GG cobra ~5-9% conforme buy-in)." />
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
                    <th className="px-2 py-2.5 text-center font-medium">
                      <span className="inline-flex items-center justify-center">
                        Avançado
                        <InfoTip text="Estrutura de payout (Padrão/Flat/Top-Heavy/Satélite) + re-entries (bullets médios por torneio). Afeta variância e custo." />
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

                    const structure: PayoutStructure =
                      editedGroups?.[i]?.payoutStructure ??
                      g.payoutStructure ??
                      DEFAULT_STRUCTURE;
                    return (
                      <Fragment key={`${g.tier}-${g.type}-${i}`}>
                      <tr
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
                          {g.isPKO ? (
                            <span className="mt-0.5 inline-block text-[10px] text-muted-foreground">
                              PKO
                            </span>
                          ) : null}
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
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="relative inline-block">
                            <input
                              data-testid={`rake-input-${i}`}
                              type="text"
                              inputMode="decimal"
                              value={
                                rawInputs[`rake-${i}`] ??
                                pctStr(
                                  editedGroups?.[i]?.rakePct ??
                                    g.rakePct ??
                                    DEFAULT_RAKE,
                                )
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
                                pctStr(
                                  editedGroups?.[i]?.placesPaidPct ??
                                    g.placesPaidPct ??
                                    DEFAULT_ITM,
                                )
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
                        <td className="px-2 py-2.5 text-center">
                          <button
                            type="button"
                            data-testid={`advanced-toggle-${i}`}
                            onClick={() => toggleRow(i)}
                            aria-expanded={expandedRows.has(i) ? "true" : "false"}
                            aria-label="Opções avançadas"
                            title="Estrutura + re-entries"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 transition-transform",
                                expandedRows.has(i) ? "rotate-180" : "",
                              )}
                            />
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {g.source === "historical" ? (
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
                      {/* Painel avançado (ADR-217): estrutura + re-entries.
                          Sempre montado (CSS-hidden) — testids acessíveis. */}
                      <tr
                        data-testid={`advanced-panel-${i}`}
                        className={cn(
                          "bg-muted/10",
                          expandedRows.has(i) ? "" : "hidden",
                        )}
                      >
                        <td colSpan={10} className="px-4 py-3">
                          <div className="flex flex-wrap items-end gap-4">
                            <div className="space-y-1">
                              <label
                                htmlFor={`structure-${i}`}
                                className="block text-xs font-medium text-muted-foreground"
                              >
                                Estrutura de payout
                              </label>
                              <select
                                id={`structure-${i}`}
                                data-testid={`structure-select-${i}`}
                                value={structure}
                                onChange={(e) =>
                                  handleStructureChange(
                                    i,
                                    e.target.value as PayoutStructure,
                                  )
                                }
                                className={cn(inputBase, "w-40")}
                              >
                                {STRUCTURE_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label
                                htmlFor={`entries-${i}`}
                                className="flex items-center text-xs font-medium text-muted-foreground"
                              >
                                Re-entries (bullets médios)
                                <InfoTip text="Média de buy-ins gastos por torneio devido a re-entry/rebuy. 1 = sem re-entry; 1.6 = re-entra ~60% das vezes. Aumenta o custo real e a calibração do edge." />
                              </label>
                              <input
                                id={`entries-${i}`}
                                data-testid={`entries-input-${i}`}
                                type="text"
                                inputMode="decimal"
                                value={
                                  rawInputs[`entries-${i}`] ??
                                  (editedGroups?.[i]?.avgEntries ?? 1).toString()
                                }
                                onChange={(e) =>
                                  handleGroupEdit(i, "entries", e.target.value)
                                }
                                className={cn(inputBase, "w-24 text-right font-mono")}
                              />
                            </div>
                            {structure === "satellite" ? (
                              <p className="text-[11px] text-muted-foreground max-w-[260px]">
                                Satélite: payout flat (todos os assentos valem
                                igual). Variância muito menor — só cashar ou não.
                              </p>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      </Fragment>
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
                Edicoes ficam ativas so nesta sessao — nao alteram o historico.
              </p>
              <Button
                data-testid="simulate-button"
                disabled={groups.length === 0}
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
