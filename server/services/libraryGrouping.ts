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
 * Agrupa torneios em familias (coarse) com especificos aninhados (fine).
 * Deterministico: o resultado independe da ordem das linhas de entrada.
 */
export function groupTournaments(tournaments: any[]): GroupedFamily[] {
  const familyMap = new Map<string, GroupedFamily>();

  for (const t of tournaments) {
    const site = (t.site ?? "Unknown").toString();
    const tier = buyInTier(parseFloat(String(t.buyIn ?? 0)));
    const type = typePrimary(t);
    const speed = normalizeSpeed(t);
    const fieldBucket = fieldBucketOf(t);
    const timeBin = timeBinOf(t);
    // 6 dimensoes definem a familia (founder): site, ABI, tipo, velocidade,
    // faixa de field-size, janela de horario (~2h).
    const familyKey = `${site}|${tier}|${type}|${speed}|${fieldBucket}|${timeBin}`;

    let fam = familyMap.get(familyKey);
    if (!fam) {
      fam = {
        familyKey,
        site,
        buyInTier: tier,
        type,
        speed,
        fieldBucket,
        timeBin,
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
