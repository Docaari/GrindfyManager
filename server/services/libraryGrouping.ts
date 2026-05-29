/**
 * Library tournament grouping — deterministic two-level keys.
 *
 * Sprint library-evolution Fase 1. Substitui o matcher guloso O(n^2)
 * order-dependent de storage.ts (groupTournamentsBySimilarity) por chaves
 * compostas deterministicas O(n):
 *
 *   familia  = `${site}|${buyInTier}|${typePrimary}`   (agrega Regular/Turbo/Hyper)
 *   especifico = `${familyKey}|${nameSignature}|${speed}`
 *
 * Buy-in passa por canonicalBuyIn (snap de ruido de fee/arredondamento) ANTES
 * de tierar, para que $21.60 e $22 caiam no mesmo tier sem mesclar $5 com $500.
 * O agrupamento e 100% deterministico (independe da ordem das linhas) — sem
 * passe fuzzy: a assinatura canonica do nome (nameSignature) ja colapsa as
 * variantes de mesma serie. Ver plano keen-jumping-petal.
 */
import { bucketBuyIn } from "../scoring/buildScoringInput";

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
  representative: any;
  tournaments: any[];
  specifics: GroupedSpecific[];
}

/**
 * Snap de buy-in para inteiro "redondo" quando dentro da tolerancia relativa
 * de ±3% (com um floor minimo de $0.15 para capturar centavos de fee). Colapsa
 * ruido de fee ($20+$1.60 -> 21.60 -> 22) sem snapar buy-ins baixos legitimos
 * ($1.50 nao vira $2; $5.50 nao vira $6).
 */
export function canonicalBuyIn(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const tol = Math.max(raw * 0.03, 0.15);
  const rounded = Math.round(raw);
  if (Math.abs(rounded - raw) <= tol) return rounded;
  return raw;
}

export function buyInTier(raw: number): string {
  return bucketBuyIn(canonicalBuyIn(raw));
}

function typePrimary(t: any): string {
  const ty = (t.type ?? "").toString().trim();
  if (ty) return ty;
  const cat = (t.category ?? "").toString().trim();
  return cat || "Vanilla";
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
 * Agrupa torneios em familias (coarse) com especificos aninhados (fine).
 * Deterministico: o resultado independe da ordem das linhas de entrada.
 */
export function groupTournaments(tournaments: any[]): GroupedFamily[] {
  const familyMap = new Map<string, GroupedFamily>();

  for (const t of tournaments) {
    const site = (t.site ?? "Unknown").toString();
    const tier = buyInTier(parseFloat(String(t.buyIn ?? 0)));
    const type = typePrimary(t);
    const familyKey = `${site}|${tier}|${type}`;

    let fam = familyMap.get(familyKey);
    if (!fam) {
      fam = {
        familyKey,
        site,
        buyInTier: tier,
        type,
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
    const speed = (t.speed ?? "Regular").toString();
    const fineKey = `${familyKey}|${sig}|${speed}`;
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
