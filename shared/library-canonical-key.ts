/**
 * libraryCanonicalKey — key canonica de dedup da Biblioteca de Torneios.
 * Sprint biblioteca-administrar-dedup / Fatia 1 / ADR-200 Parte A.
 *
 * Unica definicao de "mesmo torneio" consumida por TODOS os caminhos de dedup:
 *   - server/services/libraryAutoPopulate (decideLibraryAction / ensureLibraryEntryForPlanned)
 *   - shared/library-dedup (filterNewTournaments)
 *   - deteccao de grupos de merge + backfill + sinal de lixeira (fatias futuras)
 *
 * Formato (5 componentes separados por "|"):
 *   `${site}|${dayOfWeek}|${timeBin}|${canonicalBuyIn}|${typePrimary}`
 *
 * Funcao PURA, deterministica, sem I/O, sem Date.now()/random (lesson #36).
 * REUSA (nao reimplementa):
 *   - canonicalBuyIn (snap +-3%) de shared/canonical-buy-in
 *   - typePrimary via enrichTournamentTypeFields de shared/tournament-type-detector
 *   - timeBin2h (bins de 2h, ja aceita hora 0-23) de shared/time-bin
 */

import { canonicalBuyIn } from "./canonical-buy-in";
import { enrichTournamentTypeFields } from "./tournament-type-detector";
import { timeBin2h, NO_TIME_BIN } from "./time-bin";

/** Token usado quando dayOfWeek e null/ausente — isola das entries com dia. */
export const NO_DAY = "sem-dia";

/** Entry/planned-like minima relevante para a key canonica. */
export interface CanonicalKeyEntry {
  name?: string | null;
  site?: string | null;
  buyIn?: string | number | null;
  /** Horario "HH:MM" (campo de tournament_library, NAO datePlayed). */
  time?: string | null;
  type?: string | null;
  dayOfWeek?: number | null;
  [key: string]: any;
}

/**
 * Deriva o timeBin de 2h a partir do `time` "HH:MM" da entry de biblioteca.
 * `time` ausente/null/invalido -> NO_TIME_BIN. Parseia a hora inteira e delega
 * a timeBin2h (que ja aceita 0-23 direto) — uma unica definicao de "mesmo slot".
 */
function timeBinFromTime(time: string | null | undefined): string {
  if (time == null) return NO_TIME_BIN;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time).trim());
  if (!m) return NO_TIME_BIN;
  const hour = parseInt(m[1], 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return NO_TIME_BIN;
  return timeBin2h(hour);
}

/**
 * Key canonica deterministica de uma entry de biblioteca/planned.
 * Ver ADR-200 Parte A para a derivacao de cada dimensao.
 */
export function libraryCanonicalKey(entry: CanonicalKeyEntry): string {
  const site = (entry.site ?? "Unknown").toString();

  const dayOfWeek =
    typeof entry.dayOfWeek === "number" && Number.isFinite(entry.dayOfWeek)
      ? String(entry.dayOfWeek)
      : NO_DAY;

  const timeBin = timeBinFromTime(entry.time);

  const buyInNum = parseFloat(String(entry.buyIn ?? ""));
  const canonBuyIn = canonicalBuyIn(Number.isFinite(buyInNum) ? buyInNum : 0);

  const cat = (entry.type ?? "").toString().trim();
  const typePrimary = enrichTournamentTypeFields({
    name: entry.name ?? "",
    category: cat,
  }).type;

  return `${site}|${dayOfWeek}|${timeBin}|${canonBuyIn}|${typePrimary}`;
}
