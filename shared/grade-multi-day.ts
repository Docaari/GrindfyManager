// =============================================================================
// Sprint grade-planner-library-and-multi-day — RF-04 (ADR-245 §D4/§D5).
//
// Regra pura de "quais dias marcados viram torneio planejado, e por que os
// outros nao" + composicao do UNICO toast do lote.
//
// Puro de proposito: nao le relogio, nao faz I/O, nao ativa perfil, nao importa
// client/ nem server/. E aqui que um erro vira grade errada (torneio criado no
// dia errado ou num perfil que nao esta ativo), entao dia fora de 0..6 falha
// alto em vez de virar alvo silencioso.
// =============================================================================

/** Perfil ativo de um dia, na forma que GradePlanner.getActiveProfile devolve. */
export type ActiveProfileLetter = "A" | "B" | "C";
export type DayProfile = ActiveProfileLetter | "OFF" | null | undefined;

/** Razao nomeada do descarte. Nunca booleano solto, nunca razao inventada. */
export type MultiDaySkipReason = "day_off" | "no_active_profile";

export interface MultiDayTarget {
  /** 0..6, domingo-primeiro (paridade Date#getDay). */
  dayOfWeek: number;
  /** Perfil ativo DAQUELE dia — nunca copiado do dia de origem. */
  profile: ActiveProfileLetter;
}

export interface MultiDaySkipped {
  dayOfWeek: number;
  reason: MultiDaySkipReason;
}

export interface ResolveMultiDayTargetsResult {
  targets: MultiDayTarget[];
  skipped: MultiDaySkipped[];
}

/** Resultado observado do lote, por dia. */
export interface MultiDayOutcome {
  /** dayOfWeek com POST 2xx. */
  created: readonly number[];
  /** dayOfWeek com POST rejeitado. */
  failed: readonly number[];
  /** Veio de resolveMultiDayTargets. */
  skipped: readonly MultiDaySkipped[];
}

export interface MultiDayToast {
  title: string;
  description?: string;
  variant?: "destructive";
}

/** Quantos dias a semana tem — teto do lote e tamanho exigido de `dayLabels`. */
const DAYS_IN_WEEK = 7;

/** Texto PT-BR de cada razao, na ordem em que os grupos aparecem no toast. */
const SKIP_REASON_ORDER: readonly MultiDaySkipReason[] = [
  "day_off",
  "no_active_profile",
];

const SKIP_REASON_LABEL: Record<MultiDaySkipReason, string> = {
  day_off: "dia OFF",
  no_active_profile: "dia sem perfil ativo",
};

const ACTIVE_PROFILES: readonly string[] = ["A", "B", "C"];

function assertValidDay(dayOfWeek: number): void {
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > DAYS_IN_WEEK - 1) {
    throw new RangeError(
      `dayOfWeek invalido: ${String(dayOfWeek)} (esperado inteiro 0..6)`,
    );
  }
}

/**
 * Traduz "dias marcados nos chips" em "onde criar" + "o que foi pulado e por que".
 *
 * Dias duplicados sao deduplicados (primeira ocorrencia). `targets` e `skipped`
 * saem ordenados por dayOfWeek crescente, para o toast e o lote ficarem
 * deterministicos qualquer que seja a ordem em que o jogador clicou nos chips.
 *
 * @throws RangeError quando algum dia nao e inteiro em 0..6 — erro de
 *         programacao (os 7 chips sao a unica fonte), nao estado do jogador.
 */
export function resolveMultiDayTargets(
  selectedDays: readonly number[],
  getProfileForDay: (dayOfWeek: number) => DayProfile,
): ResolveMultiDayTargetsResult {
  const uniqueDays: number[] = [];
  const seen = new Set<number>();
  for (const day of selectedDays) {
    assertValidDay(day);
    if (seen.has(day)) continue;
    seen.add(day);
    uniqueDays.push(day);
  }

  // Copia antes de ordenar: o array do chamador nao e mutado.
  uniqueDays.sort((a, b) => a - b);

  const targets: MultiDayTarget[] = [];
  const skipped: MultiDaySkipped[] = [];

  for (const dayOfWeek of uniqueDays) {
    const profile = getProfileForDay(dayOfWeek);
    if (profile === "OFF") {
      skipped.push({ dayOfWeek, reason: "day_off" });
      continue;
    }
    if (typeof profile === "string" && ACTIVE_PROFILES.includes(profile)) {
      targets.push({ dayOfWeek, profile: profile as ActiveProfileLetter });
      continue;
    }
    // null, undefined ou valor fora de A|B|C|OFF. Nao e fallback silencioso:
    // o dia e pulado e a razao vai nomeada para o toast.
    skipped.push({ dayOfWeek, reason: "no_active_profile" });
  }

  return { targets, skipped };
}

function labelsFor(days: readonly number[], dayLabels: readonly string[]): string {
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => {
      assertValidDay(day);
      return dayLabels[day];
    })
    .join(", ");
}

function buildSkippedClause(
  skipped: readonly MultiDaySkipped[],
  dayLabels: readonly string[],
): string | null {
  if (skipped.length === 0) return null;
  const groups: string[] = [];
  for (const reason of SKIP_REASON_ORDER) {
    const days = skipped.filter((s) => s.reason === reason).map((s) => s.dayOfWeek);
    if (days.length === 0) continue;
    groups.push(`${labelsFor(days, dayLabels)} (${SKIP_REASON_LABEL[reason]})`);
  }
  if (groups.length === 0) return null;
  return `Pulados: ${groups.join("; ")}`;
}

/**
 * Compoe O UNICO toast do lote.
 *
 * `dayLabels` tem 7 rotulos curtos indexados por dayOfWeek ("Dom".."Sab") —
 * injetados porque shared/ nao importa client/, onde os rotulos moram.
 *
 * Nunca reporta sucesso quando houve falha: qualquer item em `failed` torna o
 * toast `destructive`.
 *
 * @throws RangeError quando created, failed e skipped estao todos vazios
 *         (estado inalcancavel: Salvar fica desabilitado com zero dias).
 * @throws RangeError quando dayLabels nao tem exatamente 7 entradas.
 */
export function summarizeMultiDayResult(
  outcome: MultiDayOutcome,
  dayLabels: readonly string[],
): MultiDayToast {
  if (dayLabels.length !== DAYS_IN_WEEK) {
    throw new RangeError(
      `dayLabels precisa de exatamente ${DAYS_IN_WEEK} rotulos (recebeu ${dayLabels.length})`,
    );
  }

  const createdCount = outcome.created.length;
  const failedCount = outcome.failed.length;
  const skippedCount = outcome.skipped.length;

  if (createdCount === 0 && failedCount === 0 && skippedCount === 0) {
    throw new RangeError(
      "summarizeMultiDayResult chamado com lote vazio (sem criados, falhos ou pulados)",
    );
  }

  const clauses: string[] = [];
  if (failedCount > 0) {
    clauses.push(`Falhou em ${labelsFor(outcome.failed, dayLabels)}`);
  }
  const skippedClause = buildSkippedClause(outcome.skipped, dayLabels);
  if (skippedClause) clauses.push(skippedClause);

  const description = clauses.length > 0 ? clauses.join(". ") : undefined;

  if (failedCount > 0) {
    const attempted = createdCount + failedCount;
    return {
      title:
        createdCount === 0
          ? "Nao foi possivel adicionar"
          : `Adicionado a ${createdCount} de ${attempted} dias`,
      description,
      variant: "destructive",
    };
  }

  if (createdCount === 0) {
    return { title: "Nenhum dia valido", description, variant: "destructive" };
  }

  return {
    title: `Torneio adicionado a ${createdCount} ${createdCount === 1 ? "dia" : "dias"}`,
    description,
  };
}
