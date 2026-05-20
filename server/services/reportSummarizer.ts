// =============================================================================
// reportSummarizer — Sprint AI-1C / RF-07 (ADR-159)
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
// Lessons: #5/#35 (new AnthropicCtor + factory fallback), #9 (safe-deny).
// =============================================================================

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
  return [
    "Bundle a condensar (preserve numeros, agregue listas longas):",
    "```json",
    JSON.stringify(bundle, null, 2),
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

  let AnthropicCtor: any;
  try {
    const sdkMod = await import("@anthropic-ai/sdk");
    AnthropicCtor = (sdkMod as any).default ?? sdkMod;
  } catch {
    console.error("report_summarizer.sdk_unavailable", { originalChars });
    return { bundle, summarizerModelUsed: null, summarizedAt: null, originalChars, summarizedChars: null };
  }
  let client: any;
  try {
    client = new AnthropicCtor({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch {
    try { client = AnthropicCtor({ apiKey: process.env.ANTHROPIC_API_KEY }); } catch { client = null; }
  }
  if (!client || !client.messages || typeof client.messages.create !== "function") {
    console.error("report_summarizer.client_unavailable", { originalChars });
    return { bundle, summarizerModelUsed: null, summarizedAt: null, originalChars, summarizedChars: null };
  }

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4000,
      system: [{ type: "text", text: SUMMARIZER_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildSummarizerPrompt(bundle) }],
    });
    const text = Array.isArray(response?.content)
      ? response.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
      : (typeof response?.content === "string" ? response.content : "");
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : JSON.parse(text);
    const summarizedChars = JSON.stringify(parsed).length;
    return {
      bundle: parsed,
      summarizerModelUsed: model,
      summarizedAt: new Date(),
      originalChars,
      summarizedChars,
    };
  } catch (err) {
    console.error("report_summarizer.error", { originalChars, err: err instanceof Error ? err.message : String(err) });
    // Safe-deny: retorna bundle original se sumarizacao falhar. Sonnet aguenta.
    return { bundle, summarizerModelUsed: null, summarizedAt: null, originalChars, summarizedChars: null };
  }
}
