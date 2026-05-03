/**
 * Sprint Flight-1 — RF-05: detectFlightCandidate helper.
 *
 * Spec: docs/specs/sprint-flight-1.md (RF-05, D7)
 * ADR : 090 (single source of truth = tournament_series)
 *
 * Detecta keywords de multi-flight em tournament names. Retorna metadata
 * (baseName extraido, flightDay capturado) para alimentar:
 *   - RF-06 modal pos-upload (founder valida candidatos);
 *   - RF-08 auto-link Day 1 + Day 2 quando vem juntos no mesmo CSV.
 *
 * Regex base (D7, case-insensitive, unicode-safe):
 *   \b(flight|phase|stage|day\s*\d+[a-z]?|\d+[a-z])\b
 *
 * Convencao: Day 2 tambem dispara isFlightCandidate=true (necessario pra RF-08).
 * Falsos positivos sao esperados ("Day 1 of the Year") — modal interativo trata.
 */

export interface FlightCandidate {
  isFlightCandidate: boolean;
  baseName: string;
  flightDay: string | null;
}

// Compilado uma vez (D7 — performance). 'i' case-insensitive; 'u' unicode-safe
// para nomes com acentos (ex: "Phased Brasileirao Day 1A"); 'g' para iterar
// todos matches (escolhemos o ULTIMO — flight indicator vem apos baseName).
//
// Padroes, em ordem de prioridade (regex alterna):
//   - "Day 1A", "Day1A", "Day  1A", "Day 2"  -> via "day\s*\d+[a-z]?"
//   - "Flight 3"                              -> via "flight\s+\d+"
//   - "Phase 1", "Phase 2"                    -> via "phase\s+\d+"
//   - "Stage 1", "Stage 3"                    -> via "stage\s+\d+"
//   - "1A", "1B", "1C"                        -> via "\b\d+[a-z]\b"
//
// IMPORTANTE: requeremos digito apos flight/phase/stage para evitar matchear
// "Phased" (substring de "Phase"). Tests do D7 ("Phased Day 1A") esperam que
// "Phased" seja parte do baseName, NAO do match.
const FLIGHT_KEYWORDS_REGEX =
  /(day\s*\d+[a-z]?|flight\s+\d+|phase\s+\d+|stage\s+\d+|\b\d+[a-z]\b)/giu;

export function detectFlightCandidate(name: string | null | undefined): FlightCandidate {
  if (name == null || typeof name !== 'string' || name.trim() === '') {
    return { isFlightCandidate: false, baseName: '', flightDay: null };
  }

  // Re-cria regex local pra evitar lastIndex sharing entre chamadas.
  const re = new RegExp(FLIGHT_KEYWORDS_REGEX.source, 'giu');
  const matches: { text: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(name)) !== null) {
    matches.push({ text: m[0], index: m.index });
  }

  if (matches.length === 0) {
    return { isFlightCandidate: false, baseName: name, flightDay: null };
  }

  // Heuristica: pegar o PRIMEIRO match. Tests esperam:
  //  - "Phased Day 1A" -> baseName="Phased" (cut em "Day 1A", nao em "Phased")
  //  - "Phase 1 Stage 2" -> flightDay="Phase 1" (primeiro match)
  // Como "Phased" nao matcha (sem digito), "Day 1A" eh o primeiro match.
  // Escolha = primeiro match.
  const firstMatch = matches[0];
  const matchedText = firstMatch.text;
  const matchIndex = firstMatch.index;

  // Extrai baseName: substring antes do match, removendo separadores trailing.
  let baseName = matchIndex > 0 ? name.substring(0, matchIndex) : '';
  baseName = baseName.replace(/[\s—\-|(]+$/, '').trim();
  if (!baseName) baseName = name;

  const flightDay = matchedText.trim().replace(/\s+/g, ' ');

  return {
    isFlightCandidate: true,
    baseName,
    flightDay,
  };
}
