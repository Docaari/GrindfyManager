/**
 * tournamentInsertMapper — Sprint import-otimizacao (ADR-243).
 *
 * PROBLEMA QUE ESTE MODULO RESOLVE
 * Havia TRES mapeamentos ParsedTournament -> row de INSERT, cada um com uma lista
 * de campos diferente:
 *   - `POST /api/upload-history`        28 campos
 *   - `POST /api/upload-with-duplicates` 22 campos  <- fluxo que a UI usa
 *   - `mapParsedToInsertRows` (`POST /api/upload`) 22 campos
 * Consequencia medida no DB do founder (126.108 torneios): `rake` e
 * `duration_seconds` 100% nulos, `converted_to_usd` nunca gravado (o que ainda
 * ativava dupla conversao no guard de leitura), `players_per_table`/`structure`/
 * `game_type` perdidos — TODOS eles extraidos corretamente pelo parser e mortos
 * no INSERT. Ou seja: o campo que sobrevivia dependia do botao clicado na UI.
 *
 * Agora existe UM mapeamento. Contrato: todo campo de `ParsedTournament` tem
 * destino explicito aqui ou esta na lista `INTENTIONALLY_NOT_PERSISTED`.
 *
 * IMPORTANTE (multi-rede): este modulo NAO interpreta CSV. Cada rede tem seu
 * parser e sua semantica; aqui so persistimos o que o parser daquela rede
 * produziu. Campo que a rede nao traz fica null (nao 0, nao false) — lesson #7.
 */

import { enrichTournamentTypeFields } from "@shared/tournament-type-detector";
import { parseSharkscopeFlags } from "@shared/sharkscope-flags";
import type { ParsedTournament } from "../csvParser";

/**
 * Campos de ParsedTournament que de proposito NAO viram coluna:
 *  - userId          -> vem do contexto de auth, escrito separado
 *  - format          -> escrito (coluna format), listado aqui so por clareza? nao: e persistido
 *  - nameSynthesized -> sinal de auditoria do import, vive no importSummary
 *  - maxReentries    -> coluna existe e e persistida
 */
export const INTENTIONALLY_NOT_PERSISTED: readonly string[] = ["userId", "nameSynthesized"];

function decimalOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return String(n);
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export interface MapOptions {
  /** Upload que originou as linhas — habilita desfazer import (ADR-243). */
  uploadId?: string | null;
}

/**
 * Converte UMA linha parseada na row de INSERT de `tournaments`.
 * Deterministica exceto pelo fallback `datePlayed ?? new Date()` (comportamento
 * legado preservado: linha sem data valida nao chega aqui — o parser rejeita).
 */
export function buildTournamentInsertRow(
  t: ParsedTournament & Record<string, any>,
  userPlatformId: string,
  opts: MapOptions = {},
): Record<string, any> {
  // Bandeiras declaradas pelo export (hoje so SharkScope) vencem heuristica de
  // nome para tipo primario / add-on / re-entry / deep-stack.
  const flagSignals = Array.isArray(t.flags) && t.flags.length > 0
    ? parseSharkscopeFlags(t.flags.join(" "))
    : null;

  const enriched = enrichTournamentTypeFields({
    name: t.name,
    category: t.category,
    flagSignals: flagSignals
      ? {
          primaryType: flagSignals.primaryType,
          allowsAddOn: flagSignals.allowsAddOn,
          allowsReentry: flagSignals.allowsReentry,
          deepStack: flagSignals.deepStack,
          isMultiDay: flagSignals.isMultiDay,
        }
      : null,
  });

  const buyInNum = Number(t.buyIn ?? 0);
  const rakeNum = Number(t.rake ?? 0);
  // launch-fix P1#2: addOnCost = stake (SEM rake), pois buyIn = stake + rake.
  const stakeOnly = Math.max(0, buyInNum - rakeNum);

  // `category` legado espelha `type` quando o parser nao mandou nada util.
  const preservedCategory = t.category && String(t.category).trim() !== ""
    ? t.category
    : enriched.type;

  return {
    userId: userPlatformId,
    name: String(t.name).trim(),
    buyIn: buyInNum.toString(),
    prize: t.prize?.toString() ?? "0",
    position: t.position || null,
    datePlayed: t.datePlayed ?? new Date(),
    site: t.site,
    format: t.format,
    type: enriched.type,
    category: preservedCategory,
    isFlight: enriched.isFlight,
    allowsAddOn: enriched.allowsAddOn,
    // ADR-251: rebuy vem das bandeiras (export) ou do campo ja parseado.
    allowsRebuy: flagSignals?.allowsRebuy === true || t.allowsRebuy === true,
    addOnCost: enriched.allowsAddOn ? stakeOnly.toString() : null,
    allowsReentry: enriched.allowsReentry,
    maxReentries: intOrNull(t.maxReentries),
    speed: t.speed,
    fieldSize: t.fieldSize || null,
    finalTable: t.finalTable || false,
    bigHit: t.bigHit || false,
    currency: t.currency || "USD",
    prizePool: decimalOrNull(t.prizePool),
    reentries: t.reentries || 0,
    tournamentId: t.tournamentId || null,

    // Fase 3 (library-evolution) — antes só o path /api/upload-history gravava.
    durationSeconds: intOrNull(t.durationSeconds),
    playersPerTable: intOrNull(t.playersPerTable),
    structure: t.structure ?? null,
    gameType: t.gameType ?? null,
    startingStackBb: intOrNull(t.startingStackBb ?? enriched.startingStackBb),
    deepStack: t.deepStack ?? enriched.deepStack ?? false,

    // ADR-243 — campos que o parser extraia e nenhum path persistia.
    rake: decimalOrNull(t.rake) ?? "0",
    convertedToUSD: t.convertedToUSD === true,
    grossPrize: decimalOrNull(t.grossPrize),
    bountyPrize: decimalOrNull(t.bountyPrize),
    playerNick: t.playerNick ?? null,
    endDate: t.endDate ?? null,
    fieldTotalEntries: intOrNull(t.fieldTotalEntries),
    flags: Array.isArray(t.flags) && t.flags.length > 0 ? t.flags : null,
    buyInNative: decimalOrNull(t.buyInNative),
    prizeNative: decimalOrNull(t.prizeNative),
    fxRateUsed: decimalOrNull(t.fxRateUsed),
    fxSource: t.fxSource ?? null,
    fxRateDate: t.fxRateDate ?? null,
    sourceTimezone: t.sourceTimezone ?? null,
    uploadId: opts.uploadId ?? null,
  };
}

/** Versao em lote. Mesma semantica, um unico ponto de verdade. */
export function mapParsedToInsertRows(
  parsed: Array<ParsedTournament & Record<string, any>>,
  userPlatformId: string,
  opts: MapOptions = {},
): Array<Record<string, any>> {
  return parsed.map((t) => buildTournamentInsertRow(t, userPlatformId, opts));
}
