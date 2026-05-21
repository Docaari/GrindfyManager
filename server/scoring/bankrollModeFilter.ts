// =============================================================================
// bankrollModeFilter — Sprint TS-3 RF-04 (ADR-178)
//
// Aplica o tristate `bankrollMode` (all | hide | warn) ao array de torneios
// scored, anexando `bankrollWarning` quando relevante.
//
// Exports:
//   - applyBankrollMode(tournaments, bankroll, mode) -> { tournaments, warnings }
//   - resolveBankrollModeParam(query) -> mode | undefined
//   - resolveBankrollModeWithDefault({ query, userSettings }) -> mode
//   - buildSelectorTelemetryMetadata({ ... }) -> metadata object
//
// Funcoes puras. Caller decide telemetria / persistencia. Score nao muda
// (calibracao RF-05 preservada).
// =============================================================================

export type BankrollMode = "all" | "hide" | "warn";

export interface BankrollRules {
  bankrollConfigured: boolean;
  bankrollAmountUSD: number | null;
  rule: string;
  softLimitUSD: number | null;
  hardLimitUSD: number | null;
  rulePct: number;
}

export interface BankrollWarning {
  reason: "above_hard_limit" | "above_soft_limit";
  limitUSD: number;
  buyInUSD: number;
  rulePct: number;
}

export interface AnnotatedTournament {
  buyInUSD: number;
  bankrollWarning?: BankrollWarning | null;
  [k: string]: any;
}

const VALID_MODES: ReadonlySet<BankrollMode> = new Set(["all", "hide", "warn"]);

function classifyTournament(buyInUSD: number, br: BankrollRules): BankrollWarning | null {
  if (!br.bankrollConfigured || br.hardLimitUSD == null || br.softLimitUSD == null) return null;
  if (buyInUSD > br.hardLimitUSD) {
    return { reason: "above_hard_limit", limitUSD: br.hardLimitUSD, buyInUSD, rulePct: br.rulePct };
  }
  if (buyInUSD > br.softLimitUSD) {
    return { reason: "above_soft_limit", limitUSD: br.softLimitUSD, buyInUSD, rulePct: br.rulePct };
  }
  return null;
}

export function applyBankrollMode<T extends AnnotatedTournament>(
  tournaments: T[],
  bankroll: BankrollRules,
  mode: BankrollMode,
): { tournaments: (T & { bankrollWarning: BankrollWarning | null })[]; warnings: string[] } {
  const out: (T & { bankrollWarning: BankrollWarning | null })[] = [];
  const warnings: string[] = [];

  // Sem bankroll configurado: comporta como 'all' independente do mode.
  if (!bankroll.bankrollConfigured) {
    for (const t of tournaments) out.push({ ...t, bankrollWarning: null });
    return { tournaments: out, warnings };
  }

  for (const t of tournaments) {
    const cls = classifyTournament(t.buyInUSD, bankroll);
    if (mode === "all") {
      out.push({ ...t, bankrollWarning: null });
      continue;
    }
    if (mode === "hide") {
      if (cls?.reason === "above_hard_limit") continue;
      out.push({ ...t, bankrollWarning: null });
      continue;
    }
    // mode === 'warn'
    out.push({ ...t, bankrollWarning: cls });
  }
  return { tournaments: out, warnings };
}

export function resolveBankrollModeParam(query: {
  bankrollMode?: string | BankrollMode;
  bankrollFilter?: boolean | string;
}): BankrollMode | undefined {
  if (query.bankrollMode && VALID_MODES.has(query.bankrollMode as BankrollMode)) {
    return query.bankrollMode as BankrollMode;
  }
  if (query.bankrollFilter !== undefined && query.bankrollFilter !== null) {
    const truthy = query.bankrollFilter === true || query.bankrollFilter === "true";
    return truthy ? "hide" : "all";
  }
  return undefined;
}

export async function resolveBankrollModeWithDefault(args: {
  query: { bankrollMode?: string; bankrollFilter?: boolean | string };
  userSettings?: { tournament_selector_bankroll_mode?: string | null } | null;
}): Promise<BankrollMode> {
  const fromParam = resolveBankrollModeParam(args.query ?? {});
  if (fromParam) return fromParam;
  const persisted = args.userSettings?.tournament_selector_bankroll_mode;
  if (persisted && VALID_MODES.has(persisted as BankrollMode)) return persisted as BankrollMode;
  return "warn";
}

export type InvokedBy = "widget" | "coach_tool" | "admin_dashboard";

export interface SelectorTelemetryInput {
  bankrollMode: BankrollMode;
  invokedBy: InvokedBy;
  source?: string;
  cacheHit?: boolean;
  [k: string]: any;
}

export function buildSelectorTelemetryMetadata(input: SelectorTelemetryInput): Record<string, any> {
  return {
    bankrollMode: input.bankrollMode,
    invokedBy: input.invokedBy,
    source: input.source ?? "both",
    cacheHit: input.cacheHit ?? false,
    ...Object.fromEntries(
      Object.entries(input).filter(
        ([k]) => !["bankrollMode", "invokedBy", "source", "cacheHit"].includes(k),
      ),
    ),
  };
}
