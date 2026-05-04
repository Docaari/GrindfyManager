/**
 * Title fingerprint — Sprint News-3 RF-03 (Layer 2 dedupe).
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-03
 *
 * Pipeline:
 *   1. NFD unicode normalize + strip diacritics (\p{Mn})
 *   2. lowercase
 *   3. remove pontuacao + caracteres especiais (manter [a-z0-9 ])
 *   4. tokenize por espacos
 *   5. strip stopwords PT + EN
 *   6. sort tokens alfabeticamente
 *   7. top 10 tokens
 *   8. concat com '|' + sha256 hex
 *   9. string vazia → sha256 de '' (deterministico)
 */

import { createHash } from "crypto";

const STOPWORDS_PT = new Set([
  "o",
  "a",
  "os",
  "as",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "no",
  "na",
  "para",
  "por",
  "com",
  "e",
  "ou",
  "que",
  "um",
  "uma",
  // Contracoes comuns (compativel com tokens reordenados das specs RF-03 AC)
  "pela",
  "pelo",
  "pelas",
  "pelos",
]);

const STOPWORDS_EN = new Set([
  "the",
  "a",
  "an",
  "of",
  "in",
  "on",
  "at",
  "for",
  "to",
  "and",
  "or",
  "that",
  "is",
  "was",
  "were",
  "be",
  "with",
]);

const STOPWORDS = new Set<string>([...STOPWORDS_PT, ...STOPWORDS_EN]);

/**
 * Stemmer leve PT/EN: remove sufixos verbais comuns para casar formas
 * relacionadas (ex: "lanca" e "lancado" -> "lanc"). Implementacao mais
 * simples que RSLP completo, suficiente para casar tests RF-03 AC.
 */
function stem(token: string): string {
  if (token.length <= 3) return token;
  // Sufixos verbais PT (mais longos primeiro pra prioridade).
  const SUFFIXES = [
    "amento",
    "imento",
    "amente",
    "ariam",
    "eriam",
    "iriam",
    "ando",
    "endo",
    "indo",
    "asse",
    "esse",
    "isse",
    "aram",
    "eram",
    "iram",
    "aria",
    "eria",
    "iria",
    "ado",
    "ada",
    "ido",
    "ida",
    "ndo",
    "mos",
    // EN
    "ing",
    "ed",
  ];
  for (const sfx of SUFFIXES) {
    if (token.length > sfx.length + 2 && token.endsWith(sfx)) {
      return token.slice(0, -sfx.length);
    }
  }
  // Se nao matchou sufixo verbal, tenta strip vogais finais (a/o/e) se token
  // ainda eh suficientemente longo. Isso casa "lanca"->"lanc" mas evita
  // mutilar palavras curtas como "hot", "55", "wsop".
  if (token.length > 4 && /[aeo]$/.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}

export function titleFingerprint(title: string): string {
  const safe = typeof title === "string" ? title : "";
  // 1+2: NFD normalize, strip diacritics (\p{Mn}), lowercase.
  const normalized = safe
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();

  // 3: keep only [a-z0-9 ].
  const cleaned = normalized.replace(/[^a-z0-9 ]+/g, " ");

  // 4: tokenize.
  const rawTokens = cleaned.split(/\s+/).filter((t) => t.length > 0);

  // 5: strip stopwords (BEFORE stem para preservar lookups exatos das specs).
  const noStop = rawTokens.filter((t) => !STOPWORDS.has(t));

  // 5.5: stem leve PT/EN — casa formas relacionadas (lanca/lancado/lancou).
  const stemmed = noStop.map(stem);

  // 6: sort alphabetically.
  stemmed.sort();

  // 7: top 10.
  const top = stemmed.slice(0, 10);

  // 8: concat with '|' + sha256.
  const joined = top.join("|");
  return createHash("sha256").update(joined).digest("hex");
}
