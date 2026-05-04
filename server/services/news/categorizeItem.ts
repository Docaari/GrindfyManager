/**
 * Item-level news categorizer — Sprint News-3.5.
 *
 * Sources como mundopoker/superpoker tem category default 'gossip', mas postam
 * MIX de tipos de noticia:
 *   - Resultados: torneios (vence, crava, forra, vice, bracelete, anel, ITM)
 *   - Fofocas: declaracoes, polemicas, dramas, comentarios
 *
 * Founder requisitou separar (2026-05-04). Heuristica keyword-based aplicada
 * pos-fetch, override do source.category quando match resultado.
 *
 * Confiabilidade: ~85% precision via keywords expandidos PT+EN. Edge cases
 * caem no default da source (gossip).
 */

const RESULT_KEYWORDS = [
  // PT
  /\bvenc[eu]/i,
  /\bcamp[eê]/i,
  /\bcrava\b/i,
  /\bcravou\b/i,
  /\bforra(?:r|ndo|m)?\b/i,
  /\bforrou\b/i,
  /\bsoma\s+(t[ií]tulo|vice|prata|bronze)/i,
  /\bvice(?!-presi)/i,
  /\bt[ií]tulo\b/i,
  /\bbracelete\b/i,
  /\banel\b/i,
  /\bconquista(?!\sfa[mn])\b/i,
  /\bdeep\s+run\b/i,
  /\bfinal\s+table\b/i,
  /\bft\s/i,
  /\bitm\b/i,
  /\bgan(?:ha|hou|hadora?)\b/i,
  /\bleva\s+(?:US\$|R\$|€|\$)/i,
  /\bleva\s+(?:o\s+)?(?:t[ií]tulo|premio|pr[êe]mio)/i,
  /\bvice-?campe[ãa]/i,
  /\bcrava\s+o\b/i,
  /\b\d+[ºo°]\s+colocad[oa]/i,
  /\bsegundo\s+colocad/i,
  /\bterceiro\s+colocad/i,
  /\bquarto\s+colocad/i,
  /\bavança\b/i,
  /\bavanca\b/i,
  /\blidera\b/i,
  /\bbig\s+stack\b/i,
  /\bmant[eé]m\s+sequ[êe]ncia/i,
  /\bsequ[êe]ncia\s+de\s+(?:premiac|premiações|cravadas|titulos)/i,
  /\bpassa\s+por\b/i,
  /\bhit\s+gigante\b/i,
  /\bhit\s+(?:milion|enorme|grande)/i,
  // EN
  /\bwins\b/i,
  /\bvictory\b/i,
  /\bchampion(?:ship)?/i,
  /\btakes\s+down\b/i,
  /\bcrushes\b/i,
  /\b(?:final|first|second|third|fourth|fifth)\s+place/i,
  /\b\d+st\s+place/i,
  /\b\d+nd\s+place/i,
];

const GOSSIP_KEYWORDS = [
  /\bcomenta\b/i,
  /\bdeclara\b/i,
  /\bfala\s+sobre\b/i,
  /\bopina\b/i,
  /\bpol[êe]mica\b/i,
  /\bdrama\b/i,
  /\btreta\b/i,
  /\branuncia\s+(?:retiro|aposentadoria|sa[íi]da)/i,
  /\baposenta\b/i,
  /\bresponde\b/i,
  /\besclarece\b/i,
  /\bexplica\b/i,
  /\bjustifica\b/i,
  /\bse\s+defende\b/i,
  /\bse\s+manifesta\b/i,
  /\bbastidores\b/i,
  /\bentrevista\b/i,
  /\bd[íi]vida\b/i,
  /\bemprestimo\b/i,
  /\bcontrov[eé]rsia\b/i,
  /\baccusa\b/i,
  /\bacusa\b/i,
  /\brebate\b/i,
  /\brevis[ãa]o\s+de\s+prioridades/i,
  /\bcobr[aoe]\b/i,
];

export type ItemCategory =
  | "gossip"
  | "tournament-results"
  | "studies"
  | "tools"
  | "sites";

/**
 * Recategoriza item baseado em title + summary. Usa source default como
 * fallback. Apenas aplica override quando source eh 'gossip' (mundopoker,
 * superpoker) — outras categorias (sites, tools, studies) ja sao precisas.
 */
export function categorizeItem(input: {
  title: string;
  summary?: string;
  sourceCategory: string;
}): ItemCategory {
  const sc = input.sourceCategory as ItemCategory;
  // Override so para sources gossip (mundopoker/superpoker mistura coisas).
  if (sc !== "gossip") return sc;

  const text = `${input.title}\n${input.summary ?? ""}`.slice(0, 500);

  const isResult = RESULT_KEYWORDS.some((re) => re.test(text));
  const isGossip = GOSSIP_KEYWORDS.some((re) => re.test(text));

  // Resultado vence empate (e.g. "comenta vitoria" → resultado).
  if (isResult && !isGossip) return "tournament-results";
  if (isResult && isGossip) {
    // Empate: se tem keyword de drama explicito (divida, polemica), eh fofoca.
    const hasStrongGossip = /\b(d[íi]vida|pol[êe]mica|treta|drama|controv[eé]rsia)\b/i.test(text);
    return hasStrongGossip ? "gossip" : "tournament-results";
  }
  if (isGossip) return "gossip";

  // Default: items sem signals claros ficam em gossip (source default).
  return "gossip";
}
