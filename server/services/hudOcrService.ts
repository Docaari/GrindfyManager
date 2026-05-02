// =============================================================================
// Sprint Stats-V3 — hudOcrService (RF-09)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-09 OCR Claude Haiku 4.5 + cache)
// ADR  : 065 (OCR via Claude Vision)
//
// Responsibilities:
//   1. SHA256 hash do buffer (cache key).
//   2. Cache lookup em hud_stat_snapshots.ocr_raw_response (storage call).
//   3. Anthropic Messages API com retry 1x para 5xx.
//   4. Parse JSON robust (com fallback regex para markdown ```json blocks).
//   5. Fuzzy match dos labels extraidos contra catalog (RF-10).
//
// Lessons aplicadas:
//   #5 vi.fn() nao eh constructor: import dinamico + new Anthropic() em try/catch.
//   #10 DRY de prompts: usa OCR_SYSTEM_PROMPT do hudOcrPrompt.ts.
// =============================================================================

import crypto from "crypto";
import { buildOcrPrompt } from "./hudOcrPrompt";
import {
  fuzzyMatchStat,
  type FuzzyMatchKind,
} from "../../shared/hud-fuzzy-match";
import {
  HUD_STAT_CATALOG,
  type HudGroupId,
} from "../../shared/hud-stat-catalog";
import { resolveSection } from "../../shared/hud-section-aliases";

export interface OcrExtractedStatRaw {
  label: string;
  value: number;
  confidence: number;
  /**
   * V3.5 (ADR-067): heading visual bruto extraido pelo LLM. null quando nao
   * houver heading visivel acima da stat.
   */
  section?: string | null;
}

export interface OcrMatchedStat {
  id: string;
  label: string;
  value: number;
  confidence: number;
  matchedBy: FuzzyMatchKind;
  /**
   * V3.5: HudGroupId resolvido a partir de section (raw heading) via
   * SECTION_ALIASES. null quando heading bruto ausente OR nao ha alias.
   */
  section?: HudGroupId | null;
  /**
   * V3.5: heading bruto reportado pelo LLM (texto livre antes de
   * resolveSection). Audit field para debug pos-fato.
   */
  rawSection?: string | null;
}

export interface OcrUnmatchedStat {
  label: string;
  value: number | string;
  confidence: number;
  section?: HudGroupId | null;
  rawSection?: string | null;
}

export interface OcrCacheEntry {
  image_sha256: string;
  raw_stats: OcrExtractedStatRaw[];
  matched_stats: OcrMatchedStat[];
  unmatched_stats: OcrUnmatchedStat[];
}

export interface OcrServiceResult {
  imageSha256: string;
  rawStats: OcrExtractedStatRaw[];
  matchedStats: OcrMatchedStat[];
  unmatchedStats: OcrUnmatchedStat[];
  cached: boolean;
  rawResponseText?: string;
}

export interface CacheLookup {
  (sha: string): Promise<OcrCacheEntry | null>;
}

export function computeBufferSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// -----------------------------------------------------------------------------
// JSON extraction robust — handles markdown ```json fences (lesson #10)
// V3.5: aceita campo opcional `section` (string livre) por entry.
// -----------------------------------------------------------------------------
export function extractStatsJson(
  text: string,
): { stats: OcrExtractedStatRaw[] } | null {
  if (typeof text !== "string" || text.length === 0) return null;
  const tryParse = (s: string) => {
    try {
      const parsed = JSON.parse(s);
      if (parsed && Array.isArray(parsed.stats)) return parsed;
      return null;
    } catch {
      return null;
    }
  };

  // Try direct parse first
  const direct = tryParse(text.trim());
  if (direct) return direct;

  // Try ```json ... ``` markdown block
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    const inner = tryParse(fenced[1].trim());
    if (inner) return inner;
  }

  // Last resort: find first { ... } block
  const bracketed = text.match(/\{[\s\S]*\}/);
  if (bracketed) {
    const inner = tryParse(bracketed[0]);
    if (inner) return inner;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Fuzzy matching — splits OCR raw stats into matched + unmatched.
//
// MEDIUM-5: assignment global greedy. Em vez de iterar rawStats em ordem e
// tomar o top match (que pode "roubar" um stat melhor servido por outro raw
// label posterior), construimos uma lista de TODOS os pares (raw, candidato),
// ordenamos por score desc e atribuimos greedy garantindo que cada raw e cada
// statId sao usados no maximo uma vez.
//
// V3.5 (ADR-067): cada rawStat carrega `section` opcional (heading bruto). O
// matcher chama resolveSection() e passa sectionHint para fuzzyMatchStat,
// promovendo candidatos in-group e penalizando out-group. matched_stats e
// unmatched_stats ganham campos `section` (HudGroupId | null) e `rawSection`
// (string | null) para audit.
// -----------------------------------------------------------------------------
export function matchStatsAgainstCatalog(rawStats: OcrExtractedStatRaw[]): {
  matched: OcrMatchedStat[];
  unmatched: OcrUnmatchedStat[];
} {
  interface Pair {
    rawIdx: number;
    raw: OcrExtractedStatRaw;
    statId: string;
    kind: FuzzyMatchKind;
    score: number;
  }
  // Pre-resolve sections para cada raw (1x lookup por raw, evita recompute).
  const resolvedSections: Array<HudGroupId | null> = rawStats.map((r) =>
    resolveSection(r.section ?? null),
  );

  const pairs: Pair[] = [];
  for (let i = 0; i < rawStats.length; i++) {
    const raw = rawStats[i];
    const candidates = fuzzyMatchStat(raw.label, HUD_STAT_CATALOG, {
      maxResults: 5,
      sectionHint: resolvedSections[i],
    });
    for (const c of candidates) {
      pairs.push({
        rawIdx: i,
        raw,
        statId: c.statId,
        kind: c.kind,
        score: c.score,
      });
    }
  }
  // Ordena por score desc (tie-break: kind exact > substring > lev ja embutido
  // no score do fuzzy).
  pairs.sort((a, b) => b.score - a.score);

  const matched: OcrMatchedStat[] = [];
  const usedRawIdx = new Set<number>();
  const usedStatIds = new Set<string>();
  for (const p of pairs) {
    if (usedRawIdx.has(p.rawIdx) || usedStatIds.has(p.statId)) continue;
    usedRawIdx.add(p.rawIdx);
    usedStatIds.add(p.statId);
    const rawSection = p.raw.section ?? null;
    matched.push({
      id: p.statId,
      label: p.raw.label,
      value: p.raw.value,
      confidence: p.raw.confidence,
      matchedBy: p.kind,
      section: resolvedSections[p.rawIdx],
      rawSection,
    });
  }
  // raws nao alocados viram unmatched.
  const unmatched: OcrUnmatchedStat[] = [];
  for (let i = 0; i < rawStats.length; i++) {
    if (!usedRawIdx.has(i)) {
      const raw = rawStats[i];
      unmatched.push({
        label: raw.label,
        value: raw.value,
        confidence: raw.confidence,
        section: resolvedSections[i],
        rawSection: raw.section ?? null,
      });
    }
  }
  return { matched, unmatched };
}

// -----------------------------------------------------------------------------
// Anthropic client factory — lesson #5 (try/catch + fallback)
// -----------------------------------------------------------------------------
export async function getAnthropicClient(): Promise<any> {
  const mod = await import("@anthropic-ai/sdk");
  const Anthropic = (mod as any).default ?? (mod as any).Anthropic ?? mod;
  // Lesson #5: classes mockadas via vi.fn().mockImplementation funcionam com `new`
  // — mas se SDK truly export funcao em ambiente custom, fallback sem new.
  try {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch {
    return Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
}

// -----------------------------------------------------------------------------
// Gemini provider (free tier 500/day Flash 2.5 vision)
// Selected via OCR_PROVIDER=gemini env var.
// -----------------------------------------------------------------------------
async function extractStatsFromImageGemini(input: {
  buffer: Buffer;
  mime: string;
}): Promise<{ rawText: string }> {
  const mod = await import("@google/generative-ai");
  const GoogleGenerativeAI =
    (mod as any).GoogleGenerativeAI ?? (mod as any).default;
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(
      new Error("GOOGLE_API_KEY ausente — OCR Gemini indisponivel"),
      { status: 503 },
    );
  }
  const client = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.OCR_MODEL || "gemini-2.5-flash";
  const model = client.getGenerativeModel({ model: modelName });

  const { OCR_SYSTEM_PROMPT } = await import("./hudOcrPrompt");
  const base64 = input.buffer.toString("base64");

  let lastErr: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent([
        { text: OCR_SYSTEM_PROMPT },
        {
          inlineData: {
            mimeType: input.mime,
            data: base64,
          },
        },
        {
          text: "Extraia os pares label/value desta imagem seguindo o schema. Retorne apenas JSON.",
        },
      ]);
      const rawText = result?.response?.text?.() ?? "";
      return { rawText };
    } catch (err: any) {
      lastErr = err;
      const status = err?.status ?? err?.response?.status;
      const is5xx =
        typeof status === "number" && status >= 500 && status < 600;
      if (attempt === 0 && is5xx) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error("Gemini OCR failed without response");
}

// -----------------------------------------------------------------------------
// Main entry: extractStatsFromImage
// -----------------------------------------------------------------------------
export async function extractStatsFromImage(input: {
  buffer: Buffer;
  mime: string;
  cacheLookup?: CacheLookup;
}): Promise<OcrServiceResult> {
  const { buffer, mime, cacheLookup } = input;
  const sha = computeBufferSha256(buffer);

  // 1. Cache lookup
  if (cacheLookup) {
    const hit = await cacheLookup(sha);
    if (hit) {
      return {
        imageSha256: sha,
        rawStats: hit.raw_stats ?? [],
        matchedStats: hit.matched_stats ?? [],
        unmatchedStats: hit.unmatched_stats ?? [],
        cached: true,
      };
    }
  }

  // 2. Provider selection — Gemini free tier OR Anthropic Haiku
  const provider = (process.env.OCR_PROVIDER ?? "anthropic").toLowerCase();
  let rawText = "";

  if (provider === "gemini" || provider === "google") {
    const out = await extractStatsFromImageGemini({ buffer, mime });
    rawText = out.rawText;
  } else {
    const client = await getAnthropicClient();
    const params = buildOcrPrompt({ buffer, mime });

    let response: any;
    let lastErr: any;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await client.messages.create(params);
        break;
      } catch (err: any) {
        lastErr = err;
        const status = err?.status ?? err?.response?.status;
        // MEDIUM-3: retry SOMENTE para 5xx (status numerico em [500, 600)).
        // Erros sem status (network/timeout) NAO sao retryados — falham rapido
        // para nao mascarar bugs de configuracao.
        // MEDIUM-1: backoff de 500ms (era 100ms — agressivo para Anthropic API).
        const is5xx =
          typeof status === "number" && status >= 500 && status < 600;
        if (attempt === 0 && is5xx) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        throw err;
      }
    }
    if (!response) {
      throw lastErr ?? new Error("Anthropic OCR failed without response");
    }
    const textBlock = (response.content ?? []).find(
      (c: any) => c?.type === "text",
    );
    rawText = textBlock?.text ?? "";
  }

  // 3. Parse JSON robust
  const parsed = extractStatsJson(rawText);
  const rawStats: OcrExtractedStatRaw[] = parsed?.stats ?? [];

  // 4. Fuzzy match
  const { matched, unmatched } = matchStatsAgainstCatalog(rawStats);

  return {
    imageSha256: sha,
    rawStats,
    matchedStats: matched,
    unmatchedStats: unmatched,
    cached: false,
    rawResponseText: rawText,
  };
}
