// =============================================================================
// Abreviacao de nome de torneio para a grade semanal.
//
// A grade mostra sete dias lado a lado; nome inteiro ("Zodiac Mystery Bounty
// King") empurra as colunas e obriga scroll horizontal. Aqui o nome vira uma
// versao curta e ainda reconhecivel — o nome completo continua no tooltip.
//
// Ordem das regras (importa):
//   1. tira o buy-in do comeco ("$25 GGMasters" -> "GGMasters"), porque o chip
//      ja mostra o valor em destaque;
//   2. tira o nome da plataforma, que ja aparece como icone/sigla;
//   3. troca expressoes conhecidas ("Main Event" -> "ME");
//   4. troca palavras conhecidas ("Mystery" -> "Myst");
//   5. corta no limite de caracteres, sem quebrar palavra quando da.
//
// Funcao pura: usada no client e testavel sem DOM.
// =============================================================================

/** Expressoes de duas ou mais palavras — aplicadas antes dos tokens soltos. */
const PHRASE_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bmain\s+event\b/gi, "ME"],
  [/\bbounty\s+hunters?\b/gi, "BH"],
  [/\bmystery\s+bounty\b/gi, "MB"],
  [/\bdouble\s+stack\b/gi, "2Stack"],
  [/\blate\s+night\b/gi, "LN"],
  [/\bhigh\s+roller\b/gi, "HR"],
  [/\bsit\s*&\s*go\b/gi, "S&G"],
  [/\bfinal\s+table\b/gi, "FT"],
];

/** Palavras isoladas. Chave em minusculo; valor mantem a caixa desejada. */
const TOKEN_ABBREVIATIONS: Record<string, string> = {
  bounty: "Bty",
  hunters: "Htrs",
  mystery: "Myst",
  progressive: "Prog",
  knockout: "KO",
  championship: "Champ",
  champion: "Champ",
  deepstack: "DS",
  freezeout: "FO",
  satellite: "Sat",
  qualifier: "Qual",
  showdown: "Shwd",
  midnight: "Mdnt",
  afternoon: "Aft",
  morning: "Mrng",
  special: "Spc",
  daily: "Dly",
  weekly: "Wkly",
  monthly: "Mtly",
  edition: "Ed",
  masters: "Mstrs",
  series: "Ser",
  league: "Lg",
  global: "Glb",
  turbo: "Trb",
  hyper: "Hyp",
  omaha: "PLO",
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sex",
  saturday: "Sab",
  sunday: "Dom",
};

/** Plataformas cujo nome no titulo e redundante (o chip ja mostra o icone). */
const SITE_TOKENS = [
  "pokerstars",
  "partypoker",
  "party",
  "888poker",
  "ggpoker",
  "gg",
  "wpn",
  "wpt",
  "ipoker",
  "coinpoker",
  "chico",
  "bodog",
  "suprema",
  "americas cardroom",
  "acr",
];

export interface AbbreviateOptions {
  /** Limite de caracteres do resultado (default 20). */
  maxChars?: number;
  /** Plataforma do torneio — removida do nome quando aparece nele. */
  site?: string | null;
}

/**
 * Versao curta do nome do torneio para caber na celula da grade.
 * Retorna string vazia quando nao ha nome utilizavel.
 */
export function abbreviateTournamentName(
  rawName: string | null | undefined,
  options: AbbreviateOptions = {},
): string {
  const maxChars = options.maxChars ?? 20;
  if (!rawName || typeof rawName !== "string") return "";

  let out = rawName.trim();
  if (out === "") return "";

  // 1. buy-in no comeco do nome — o chip ja mostra o valor.
  out = out.replace(/^\$\s?\d+(?:[.,]\d+)?k?\s*/i, "");

  // 2. plataforma redundante (so quando sobra algo depois).
  const siteCandidates = options.site
    ? [options.site.toLowerCase(), ...SITE_TOKENS]
    : SITE_TOKENS;
  for (const site of siteCandidates) {
    if (!site) continue;
    const escaped = site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stripped = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ").trim();
    if (stripped !== "" && stripped.length !== out.length) out = stripped;
  }

  // 3. expressoes conhecidas.
  for (const [pattern, replacement] of PHRASE_ABBREVIATIONS) {
    out = out.replace(pattern, replacement);
  }

  // 4. palavras conhecidas.
  out = out
    .split(/\s+/)
    .map((word) => {
      const key = word.toLowerCase().replace(/[^a-z&]/g, "");
      const abbrev = TOKEN_ABBREVIATIONS[key];
      if (!abbrev) return word;
      // preserva pontuacao colada (ex: "Mystery," -> "Myst,")
      return word.replace(new RegExp(key, "i"), abbrev);
    })
    .join(" ");

  out = out.replace(/\s{2,}/g, " ").trim();
  if (out.length <= maxChars) return out;

  // 5. corte — tenta terminar em palavra inteira antes de cair no corte seco.
  const hard = out.slice(0, maxChars - 1);
  const lastSpace = hard.lastIndexOf(" ");
  const base = lastSpace >= Math.floor(maxChars * 0.6) ? hard.slice(0, lastSpace) : hard;
  return `${base.trimEnd()}…`;
}
