/**
 * Helper de narracao de torneio com redacao binaria (Sprint Alarmes 2.0 — RF-05).
 *
 * DP-03 RESOLVIDA: toggle binario sem threshold. O valor de buy-in nunca eh
 * narrado quando `redactBuyIn=true`, independente de threshold.
 *
 * Helper PURO: nao chama normalizeBuyInToUSD, nao depende de FX.
 */

const MAX_NAME_LENGTH = 60;

/**
 * Sanitiza string removendo caracteres perigosos para visualizacao/log
 * (anti-injection visual: `<`, `>`, `&`).
 */
function sanitize(input: string): string {
  return input.replace(/[<>&]/g, '').trim();
}

/**
 * Trunca nomes longos a 60 chars + "..." para narracoes <= 5s no TTS.
 */
function truncateName(name: string): string {
  if (name.length <= MAX_NAME_LENGTH) return name;
  return name.slice(0, MAX_NAME_LENGTH) + '...';
}

export interface BuildTournamentNarrationOptions {
  redactBuyIn: boolean;
}

export interface BuildTournamentNarrationInput {
  site: string;
  name: string;
  buyIn: string;
}

/**
 * Constroi a string de narracao TTS para um torneio.
 *
 * Modo normal (redactBuyIn=false):
 *   "{site}, {name}, buy-in {valor}"     (com buyIn presente)
 *   "{site}, {name}"                     (sem buyIn)
 *
 * Modo discreto (redactBuyIn=true):
 *   "{site}, {name}, atencao"            (NUNCA narra valor)
 *
 * Edge cases:
 *   - name vazio → fallback "Torneio"
 *   - site/name com espacos → trim
 *   - chars `< > &` → removidos
 *   - name > 60 chars → truncado + "..."
 */
export function buildTournamentNarration(
  t: BuildTournamentNarrationInput,
  opts: BuildTournamentNarrationOptions
): string {
  const site = sanitize(t.site || '');
  let name = sanitize(t.name || '');
  if (!name) name = 'Torneio';
  name = truncateName(name);

  if (opts.redactBuyIn) {
    return `${site}, ${name}, atencao`;
  }

  const buyIn = (t.buyIn || '').trim();
  if (!buyIn) {
    return `${site}, ${name}`;
  }

  return `${site}, ${name}, buy-in ${buyIn}`;
}
