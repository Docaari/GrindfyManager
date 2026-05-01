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
import { HUD_STAT_CATALOG } from "../../shared/hud-stat-catalog";

export interface OcrExtractedStatRaw {
  label: string;
  value: number;
  confidence: number;
}

export interface OcrMatchedStat {
  id: string;
  label: string;
  value: number;
  confidence: number;
  matchedBy: FuzzyMatchKind;
}

export interface OcrUnmatchedStat {
  label: string;
  value: number | string;
  confidence: number;
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
// -----------------------------------------------------------------------------
export function matchStatsAgainstCatalog(rawStats: OcrExtractedStatRaw[]): {
  matched: OcrMatchedStat[];
  unmatched: OcrUnmatchedStat[];
} {
  const matched: OcrMatchedStat[] = [];
  const unmatched: OcrUnmatchedStat[] = [];
  const usedIds = new Set<string>();

  for (const raw of rawStats) {
    const candidates = fuzzyMatchStat(raw.label, HUD_STAT_CATALOG, {
      maxResults: 1,
    });
    const top = candidates[0];
    if (top && !usedIds.has(top.statId)) {
      usedIds.add(top.statId);
      matched.push({
        id: top.statId,
        label: raw.label,
        value: raw.value,
        confidence: raw.confidence,
        matchedBy: top.kind,
      });
    } else {
      unmatched.push({
        label: raw.label,
        value: raw.value,
        confidence: raw.confidence,
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

  // 2. Anthropic call with retry 1x
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
      // Retry uma vez para 5xx OR sem status (network)
      if (attempt === 0 && (status === undefined || status >= 500)) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      throw err;
    }
  }
  if (!response) {
    throw lastErr ?? new Error("Anthropic OCR failed without response");
  }

  // 3. Parse JSON robust
  const textBlock = (response.content ?? []).find(
    (c: any) => c?.type === "text",
  );
  const rawText = textBlock?.text ?? "";
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
