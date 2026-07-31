/**
 * libraryCanonicalKey — key canonica de dedup da Biblioteca de Torneios.
 * Sprint biblioteca-administrar-dedup / Fatia 1 / ADR-200 Parte A.
 *
 * Unica definicao de "mesmo torneio" consumida por TODOS os caminhos de dedup:
 *   - server/routes/tournament-library.ts (POST — dedup manual)
 *   - server/services/libraryAutoPopulate (decideLibraryAction / ensureLibraryEntryForPlanned)
 *   - shared/library-dedup (filterNewTournaments)
 *   - deteccao de grupos de merge + backfill + sinal de lixeira (fatias futuras)
 *
 * Formato (4 componentes separados por "|"):
 *   `${site}|${timeBin}|${canonicalBuyIn}|${typePrimary}`
 *
 * NOTE: dayOfWeek NAO esta na key — torneios recorrentes (mesmo nome/horario)
 * em dias diferentes compartilham a mesma key e sao deduplicados na biblioteca.
 * O dayOfWeek e usado apenas no Grade Planner para agendar em dias especificos.
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
 * Exclui dayOfWeek: mesmo torneio em dias diferentes (recorrente) tem a mesma key.
 */
export function libraryCanonicalKey(entry: CanonicalKeyEntry): string {
  const site = (entry.site ?? "Unknown").toString();

  const timeBin = timeBinFromTime(entry.time);

  const buyInNum = parseFloat(String(entry.buyIn ?? ""));
  const canonBuyIn = canonicalBuyIn(Number.isFinite(buyInNum) ? buyInNum : 0);

  const cat = (entry.type ?? "").toString().trim();
  const typePrimary = enrichTournamentTypeFields({
    name: entry.name ?? "",
    category: cat,
  }).type;

  return `${site}|${timeBin}|${canonBuyIn}|${typePrimary}`;
}
