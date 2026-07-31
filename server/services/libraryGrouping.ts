/**
 * Library tournament grouping — deterministic two-level keys.
 *
 * Sprint library-evolution Fase 1. Substitui o matcher guloso O(n^2)
 * order-dependent de storage.ts (groupTournamentsBySimilarity) por chaves
 * compostas deterministicas O(n):
 *
 *   familia  = `${site}|${buyInTier}|${typePrimary}|${speed}`   (separa por velocidade)
 *   especifico = `${familyKey}|${nameSignature}`   (speed ja na familia)
 *
 * Buy-in passa por canonicalBuyIn (snap de ruido de fee/arredondamento) ANTES
 * de tierar, para que $21.60 e $22 caiam no mesmo tier sem mesclar $5 com $500.
 * O agrupamento e 100% deterministico (independe da ordem das linhas) — sem
 * passe fuzzy: a assinatura canonica do nome (nameSignature) ja colapsa as
 * variantes de mesma serie. Ver plano keen-jumping-petal.
 */
import { bucketBuyIn } from "../scoring/buildScoringInput";
import { FIELD_BUCKETS } from "../scoring/scoringConstants";
import { enrichTournamentTypeFields } from "../../shared/tournament-type-detector";
import { detectSpeedFromName, fastestSpeed } from "../../shared/speed-detector";
import { timeBin2h } from "../../shared/time-bin";
// canonicalBuyIn extraido para shared/ (ADR-200 Parte A) para ser reusado pela
// key canonica sem arrastar deps server-only. Re-exportado aqui para preservar
// os call sites existentes (storage.ts, tests/services/libraryGrouping).
import { canonicalBuyIn } from "../../shared/canonical-buy-in";
export { canonicalBuyIn };
import { dayOfWeek } from "../../shared/day-of-week";
import {
  type GroupDim,
  CANONICAL_DIM_ORDER,
  DEFAULT_RECIPE,
} from "../../shared/library-grouping-dims";

export interface GroupedSpecific {
  fineKey: string;
  nameSignature: string;
  speed: string;
  representative: any;
  tournaments: any[];
}

export interface GroupedFamily {
  familyKey: string;
  site: string;
  buyInTier: string;
  type: string;
  speed: string;
  // Sprint torneios-library-grouping: faixa de field-size + janela de horario
  // passam a definir a familia (founder: field e horario importam).
  fieldBucket: string;
  timeBin: string;
  // Sprint torneios-custom-families: dia da semana como dimensao opcional.
  dayOfWeek: string;
  representative: any;
  tournaments: any[];
  specifics: GroupedSpecific[];
}

/**
 * Normaliza velocidade de um torneio para um SpeedBucket canonico. Parsers so
 * emitem Normal/Turbo/Hyper (csvParser.detectSpeed); default "Normal" quando
 * ausente — NUNCA "Regular" (bucket fantasma que nao casa com dado real nem com
 * o filtro inArray(tournaments.speed, ...)).
 */
export function normalizeSpeed(t: any): string {
  // Sprint torneios-library-grouping: read-side derive. Antes confiava cego no
  // campo gravado (Hyper sub-detectado em imports antigos -> tudo "Normal").
  // Agora pega a velocidade MAIS RAPIDA entre o valor gravado e o derivado do
  // nome, corrigindo dado legado sem re-import.
  const raw = (t?.speed ?? "").toString().trim() || "Normal";
  const fromName = detectSpeedFromName(t?.name ?? "");
  return fastestSpeed(raw, fromName);
}

/**
 * Faixa de field-size (reusa FIELD_BUCKETS do scoring). "sem-field" quando o
 * torneio nao tem fieldSize (comum em CSV sem essa coluna) — assim grupos com
 * field conhecido nao se misturam com os sem dado.
 */
export function fieldBucketOf(t: any): string {
  const fs = Number(t?.fieldSize ?? t?.fieldSizeEstimate ?? NaN);
  if (!Number.isFinite(fs) || fs <= 0) return "sem-field";
  for (const b of FIELD_BUCKETS) {
    if (fs >= b.min && fs < b.max) return b.bucket;
  }
  return FIELD_BUCKETS[FIELD_BUCKETS.length - 1].bucket;
}

/** Janela de ~2h derivada de datePlayed (NO_TIME_BIN quando ausente). */
export function timeBinOf(t: any): string {
  return timeBin2h(t?.datePlayed ?? t?.startTime ?? null);
}

/** Dia da semana derivado de datePlayed (fallback startTime; NO_DAY quando ausente). */
export function dayOfWeekOf(t: any): string {
  return dayOfWeek(t?.datePlayed ?? t?.startTime ?? null);
}

export function buyInTier(raw: number): string {
  return bucketBuyIn(canonicalBuyIn(raw));
}

// Sprint torneios-library-grouping (ajuste founder): torneios desconsiderados
// na Biblioteca de Torneios. PLO (variante Omaha) fora do escopo MTT-Holdem;
// Freeroll / buy-in 0 nao tem ABI/ROI significativo. Escopo = SO a biblioteca
// (nao mexe no historico/dashboard).
const LIBRARY_PLO_RE = /\bplo/i; // PLO, PLO8, PLO5, PLO Hi/Lo — boundary evita "diplomat"
const LIBRARY_FREEROLL_RE = /\bfree\s?roll/i;

export function isExcludedFromLibrary(t: any): boolean {
  const name = (t?.name ?? "").toString();
  if (LIBRARY_PLO_RE.test(name)) return true;
  if (LIBRARY_FREEROLL_RE.test(name)) return true;
  const buyIn = parseFloat(String(t?.buyIn ?? 0));
  if (!Number.isFinite(buyIn) || buyIn <= 0) return true;
  return false;
}

function typePrimary(t: any): string {
  // Sprint torneios-library-grouping: read-side derive via SSoT
  // enrichTournamentTypeFields. Eleva Vanilla->Satellite quando o nome indica
  // (corrige satelites que cairam em Vanilla por deteccao antiga no import),
  // resolve Bounty->PKO etc. Mantem PKO/Mystery explicitos.
  const cat = (t.type ?? t.category ?? "").toString().trim();
  return enrichTournamentTypeFields({ name: t?.name ?? "", category: cat }).type;
}

/**
 * Subset MINIMO de limpeza compartilhado por nameSignature (key) e pela geracao
 * de nome de exibicao (generateSpecificName no storage) — evita drift no que e
 * comum aos dois. PRESERVA o casing e as palavras de tipo/velocidade (boas pra
 * exibicao); remove so o que e ruido em ambos os usos: $amounts, episodios
 * (Day 1A/#123), horarios, "N-day event".
 */
export function stripNameNoise(name: string): string {
  if (!name) return "";
  let s = name;
  s = s.replace(/\$[\d,]+\s*(gtd|guaranteed)?/gi, " "); // prize amounts
  s = s.replace(/\$[\d.]+(k|m)?/gi, " "); // dollar amounts
  s = s.replace(/\b(episode|day|fase|phase|flight|ep|dia)\s*\d+[a-z]?\b/gi, " "); // Day 1A
  s = s.replace(/#\s*\d+/g, " "); // #123
  s = s.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, " "); // times
  s = s.replace(/\s*[-–—]\s*\d+-day\s+event/gi, " "); // "2-Day Event"
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Assinatura canonica do nome para match exato (sem threshold): aplica
 * stripNameNoise + strip agressivo (formato/velocidade/stack-depth/max) +
 * lowercase, tokeniza len>=2, dedup, ordena.
 */
export function nameSignature(name: string): string {
  let s = stripNameNoise(name).toLowerCase();
  s = s.replace(/[[(]?\s*\d{1,3}\s*bb\s*[\])]?/gi, " "); // stack depth [10BB]
  s = s.replace(/\bdeep\s?stack\b/gi, " ");
  s = s.replace(
    /\b(turbo|hyper|super|progressive|knockout|pko|bounty|mystery|mtt|nlhe|deep|rebuy|addon|add-on)\b/gi,
    " ",
  );
  s = s.replace(/\b\d+\s*(re|max|heads-up|hu|handed)\b/gi, " "); // 6-max etc
  s = s.replace(/\b\d+-(max|handed)\b/gi, " ");
  s = s.replace(/[^\w\s]/g, " "); // punctuation
  s = s.replace(/\s+/g, " ").trim();
  const tokens = Array.from(
    new Set(s.split(" ").filter((w) => w.length >= 2)),
  ).sort();
  return tokens.join(" ");
}

/**
 * Normaliza uma receita: descarta dims desconhecidas, deduplica e reordena pela
 * ordem canonica. A receita e um CONJUNTO de dimensoes — `[timeBin,abi,site]` e
 * `[site,abi,timeBin]` viram a mesma receita canonica `[site,abi,timeBin]` (e a
 * mesma familyKey). Compartilhado com o parser de `groupBy` na rota.
 */
export function canonicalizeRecipe(recipe: GroupDim[]): GroupDim[] {
  const seen = new Set<GroupDim>();
  for (const d of recipe) {
    if (CANONICAL_DIM_ORDER.includes(d)) seen.add(d);
  }
  return CANONICAL_DIM_ORDER.filter((d) => seen.has(d));
}

/**
 * Re-deriva a receita embutida numa familyKey + o site (quando a dim site faz
 * parte da receita). Chave legada (sem prefixo "g1:") -> DEFAULT_RECIPE + site do
 * 1o segmento. Chave "g1:dims|valores" -> dims do header + site do indice de site.
 */
export function parseFamilyKey(familyKey: string): {
  recipe: GroupDim[];
  site: string | null;
} {
  const key = String(familyKey);
  if (key.startsWith("g1:")) {
    const sep = key.indexOf("|");
    const header = sep >= 0 ? key.slice(3, sep) : key.slice(3);
    const recipe = header.split(",").filter(Boolean) as GroupDim[];
    const values = sep >= 0 ? key.slice(sep + 1).split("|") : [];
    const siteIdx = recipe.indexOf("site");
    const site = siteIdx >= 0 ? values[siteIdx] ?? null : null;
    return { recipe, site };
  }
  return { recipe: DEFAULT_RECIPE, site: key.split("|")[0] };
}

/**
 * Agrupa torneios em familias (coarse) com especificos aninhados (fine).
 * Deterministico: o resultado independe da ordem das linhas de entrada.
 *
 * `recipe` define quais dimensoes compoem a familia. A receita DEFAULT (as 6
 * legadas) produz a familyKey legada byte-a-byte (sem prefixo) — qualquer drift
 * orfana saved_tournament_highlights / premium_library_highlights. Receitas
 * customizadas usam chave auto-descritiva "g1:dims|valores".
 */
export function groupTournaments(
  tournaments: any[],
  recipe: GroupDim[] = DEFAULT_RECIPE,
): GroupedFamily[] {
  const familyMap = new Map<string, GroupedFamily>();
  const canon = canonicalizeRecipe(recipe);
  // Receita canonica == DEFAULT_RECIPE (as 6 legadas) -> chave sem prefixo.
  const useDefault =
    canon.length === DEFAULT_RECIPE.length &&
    canon.every((d, i) => d === DEFAULT_RECIPE[i]);

  for (const t of tournaments) {
    // Mapa dim->valor computado UMA vez por torneio; reusado para a familyKey E
    // para os campos nomeados de exibicao (sem re-derivar no caminho custom). A
    // SEPARACAO e ditada exclusivamente pela familyKey/receita.
    const dims: Record<GroupDim, string> = {
      site: (t.site ?? "Unknown").toString(),
      abi: buyInTier(parseFloat(String(t.buyIn ?? 0))),
      type: typePrimary(t),
      speed: normalizeSpeed(t),
      fieldBucket: fieldBucketOf(t),
      timeBin: timeBinOf(t),
      dayOfWeek: dayOfWeekOf(t),
    };

    const familyKey = useDefault
      ? // Byte-compat: identica a chave legada de 6 dimensoes.
        `${dims.site}|${dims.abi}|${dims.type}|${dims.speed}|${dims.fieldBucket}|${dims.timeBin}`
      : "g1:" + canon.join(",") + "|" + canon.map((d) => dims[d]).join("|");

    let fam = familyMap.get(familyKey);
    if (!fam) {
      fam = {
        familyKey,
        site: dims.site,
        buyInTier: dims.abi,
        type: dims.type,
        speed: dims.speed,
        fieldBucket: dims.fieldBucket,
        timeBin: dims.timeBin,
        dayOfWeek: dims.dayOfWeek,
        representative: t,
        tournaments: [],
        specifics: [],
      };
      familyMap.set(familyKey, fam);
    }
    fam.tournaments.push(t);
  }

  // Segundo passe: clusteriza especificos dentro de cada familia.
  for (const fam of Array.from(familyMap.values())) {
    fam.specifics = clusterSpecifics(fam.familyKey, fam.tournaments);
    // Representative determinista = maior cluster.
    const top = fam.specifics.reduce(
      (best, s) => (s.tournaments.length > best.tournaments.length ? s : best),
      fam.specifics[0],
    );
    if (top) fam.representative = top.representative;
  }

  // Ordem determinista de saida (independe da ordem de insercao no Map).
  return Array.from(familyMap.values()).sort((a, b) =>
    a.familyKey < b.familyKey ? -1 : a.familyKey > b.familyKey ? 1 : 0,
  );
}

function clusterSpecifics(familyKey: string, list: any[]): GroupedSpecific[] {
  const byKey = new Map<string, GroupedSpecific>();

  for (const t of list) {
    const sig = nameSignature(t.name ?? "");
    // speed ja faz parte da familyKey (separacao por velocidade); o especifico
    // separa so por nameSignature. spec.speed espelha a familia (consumido em
    // storage.generateSpecificName / metrics) e e identico p/ todos da familia.
    const speed = normalizeSpeed(t);
    const fineKey = `${familyKey}|${sig}`;
    let spec = byKey.get(fineKey);
    if (!spec) {
      spec = {
        fineKey,
        nameSignature: sig,
        speed,
        representative: t,
        tournaments: [],
      };
      byKey.set(fineKey, spec);
    }
    spec.tournaments.push(t);
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.fineKey < b.fineKey ? -1 : a.fineKey > b.fineKey ? 1 : 0,
  );
}
