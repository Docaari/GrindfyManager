// =============================================================================
// reportSummarizer — Sprint AI-1C / RF-07 (ADR-159)
// Sprint AI-3.1 / RF-06 + RF-07 (ADR-176) — Anthropic call + cost delegados a
// `server/coach/anthropicClient.ts` + `server/coach/reportCost.ts`.
//
// Sumarizacao hierarquica Haiku->Sonnet. Quando o bundle do gerador eh
// "grande" (acima de COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS, default 20000),
// chama Haiku 4.5 para condensar o bundle preservando os numeros relevantes,
// e o Sonnet recebe a versao condensada. Bundle pequeno: no-op (retorna o
// original; `summarizerModelUsed=null`).
//
// Daily Debrief: nunca aciona (bundle sempre pequeno).
// Weekly/Monthly: pode acionar quando o usuario tem muitas sessoes/dados.
//
// Lessons: #9 (safe-deny + log antes do fallback).
// =============================================================================

import { callReportLlm } from "../coach/anthropicClient";

const DEFAULT_THRESHOLD_CHARS = 20000;
const DEFAULT_SUMMARIZER_MODEL = "claude-haiku-4-5-20251001";

function thresholdChars(): number {
  const raw = Number(process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_THRESHOLD_CHARS;
}

function summarizerModel(): string {
  return process.env.COACH_REPORT_SUMMARIZER_MODEL
    || process.env.COACH_MEMORY_MODEL
    || DEFAULT_SUMMARIZER_MODEL;
}

const SUMMARIZER_SYSTEM = `Voce eh um sumarizador de bundle de dados para o gerador de relatorios do Grindfy AI.

Recebe um JSON grande com dados do jogador (volume, ROI, profit, comparativos,
variancia, leaks, metas). Devolve uma VERSAO CONDENSADA do mesmo JSON,
preservando:
- TODOS os numeros relevantes (volume, profit, ROI, ITM, FTs, cravadas, etc).
- TODAS as comparacoes (mes anterior, 6m, 12m).
- Os 5-10 leaks/focos mais relevantes (descarte os menos significativos).
- As metas em progresso.

Remova/condense:
- Listas longas de torneios individuais -> agregue em buckets.
- Texto livre verboso.
- Campos derivaveis dos numeros principais.

Responda APENAS com o JSON condensado, sem texto antes ou depois.`.trim();

function buildSummarizerPrompt(bundle: any): string {
  // Sprint AI-3.2 / RF-D7 (ADR-203) — JSON.stringify sem pretty-print (drop
  // indent). Tokens Haiku contam whitespace; economiza ~15-30% de input tokens.
  return [
    "Bundle a condensar (preserve numeros, agregue listas longas):",
    "```json",
    JSON.stringify(bundle),
    "```",
    "",
    "Responda APENAS com o JSON condensado.",
  ].join("\n");
}

export interface SummarizeBundleResult {
  bundle: any;
  summarizerModelUsed: string | null;
  summarizedAt: Date | null;
  originalChars: number;
  summarizedChars: number | null;
}

export async function maybeSummarizeBundle(bundle: any): Promise<SummarizeBundleResult> {
  const json = JSON.stringify(bundle);
  const originalChars = json.length;
  const threshold = thresholdChars();

  if (originalChars <= threshold) {
    return {
      bundle,
      summarizerModelUsed: null,
      summarizedAt: null,
      originalChars,
      summarizedChars: null,
    };
  }

  const model = summarizerModel();

  try {
    const out = await callReportLlm({
      systemPrompt: SUMMARIZER_SYSTEM,
      userPromptBuilder: (b) => buildSummarizerPrompt(b),
      model,
      bundle,
      maxTokens: 4000,
      parseOnError: "fallback-degraded",
    });
    if (out.degradedReason || !out.content || typeof out.content !== "object") {
      console.error("report_summarizer.client_unavailable_or_parse", { originalChars, degradedReason: out.degradedReason });
      return { bundle, summarizerModelUsed: null, summarizedAt: null, originalChars, summarizedChars: null };
    }
    const summarizedChars = JSON.stringify(out.content).length;
    return {
      bundle: out.content,
      summarizerModelUsed: model,
      summarizedAt: new Date(),
      originalChars,
      summarizedChars,
    };
  } catch (err) {
    console.error("report_summarizer.error", { originalChars, err: err instanceof Error ? err.message : String(err) });
    return { bundle, summarizerModelUsed: null, summarizedAt: null, originalChars, summarizedChars: null };
  }
}
