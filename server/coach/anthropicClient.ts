// =============================================================================
// anthropicClient — Sprint AI-3.1 / RF-06 (ADR-176)
//
// A1-H2/H3: consolida 5 generators (quarterly, monthly, dailyDebrief, recommend
// LessonForUser, reportSummarizer) que duplicam:
//   lazy import `@anthropic-ai/sdk` -> new AnthropicCtor try/catch (lessons #5/#35)
//   -> messages.create -> JSON parse fallback -> usage capture -> log #9.
//
// API:
//   - WHITELISTED_TONES / WHITELISTED_LEVELS (constants exportadas)
//   - getAnthropicClient(injected?): Promise<any|null>
//   - callReportLlm(input): Promise<CallReportLlmResult>
//
// Comportamento:
//   - Tone/level validados sincronos antes de chamar SDK (anti-injection).
//   - Retry 3x exponencial (100/400/1600ms) em erro 429/500/network.
//   - parseOnError 'fallback-degraded' retorna degradedReason 'llm_parse_error'.
//   - parseOnError 'throw' propaga exception.
//   - degradedReason discriminated: 'no_anthropic_key' | 'llm_failed_3x' | 'llm_parse_error'.
//   - Lesson #9: log `anthropicClient.before_fallback` antes de cada retry/fallback.
//
// Lessons: #5/#35 (ctor try/catch), #9 (log antes), #34 (injected), #36 (lazy schema).
// =============================================================================

import { sleep } from "../utils/sleep";
import { isRetryableError } from "../utils/isRetryableError";

// Whitelist tones — inclui as 3 do spec AI-3.1 + as 3 legacy que callsites
// existentes (weekly/monthly/quarterly/dailyDebrief) ja usam. Reviewer pode
// consolidar depois (out of scope nesta sprint — manter back-compat).
export const WHITELISTED_TONES = [
  "neutro", "incisivo", "gentil",
  "gentle", "balanced", "direct",
] as const;

// Superset: AI-3.1 vocab + prompt-side vocab (quarterlyReport.ts ALLOWED_LEVELS).
// Latent throw risk se aiStructuredProfile.nivel contém valor do segundo set sem
// estar listado aqui — sync throw em callReportLlm degrada relatório silentmente
// pelo catch do caller. Manter sincronizado com prompts/quarterlyReport.ts.
export const WHITELISTED_LEVELS = [
  "iniciante", "intermediario", "avancado",
  "sem_dados", "iniciando", "micro_ascensao", "mid_consistente", "high_stakes", "recreativo_serio",
  "alto_volume", "low_to_mid", "mid_to_high", "high",
  // Sprint AI-3.2 — pre-existing AI-1B vocab (weekly uses 'pro' from older
  // aiStructuredProfile.nivel values). Mantem back-compat.
  "pro",
] as const;

export type CallReportLlmInput = {
  systemPrompt: string;
  userPromptBuilder: (bundle: any, opts: { tone?: string | null; level?: string | null }) => string;
  model: string;
  bundle: any;
  tone?: string | null;
  level?: string | null;
  maxTokens: number;
  parseOnError?: "fallback-degraded" | "throw";
  injectedClient?: any;
};

export type CallReportLlmResult = {
  content: any;
  usage: any;
  rawText: string;
  degradedReason?: "no_anthropic_key" | "llm_failed_3x" | "llm_parse_error" | "llm_timeout";
};

// Sprint AI-3.2 / RF-D6 (ADR-205) — cap absoluto wall-clock por job.
// Default 60s; configurável via env COACH_LLM_TIMEOUT_MS.
// Env inválido (NaN, <=0) cai pro default.
const DEFAULT_LLM_TIMEOUT_MS = 60_000;
function resolveLlmTimeoutMs(): number {
  const raw = process.env.COACH_LLM_TIMEOUT_MS;
  if (!raw) return DEFAULT_LLM_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LLM_TIMEOUT_MS;
  return n;
}

// Trunca rawText a no máximo 500 chars (defesa contra log gigante em parse error).
function truncateRawText(text: string): string {
  if (!text) return "";
  return text.length > 500 ? text.slice(0, 500) : text;
}

function isAbortError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const anyErr = err as any;
  if (anyErr.name === "AbortError") return true;
  const message = String(anyErr.message ?? "").toLowerCase();
  return message.includes("abort");
}

/**
 * Lazy import + new AnthropicCtor try/catch + factory fallback (lessons #5/#35).
 * Aceita `injected` para testes; quando passado retorna direto.
 * Retorna null se sem ANTHROPIC_API_KEY OU SDK ausente OU instanciacao falhou.
 */
export async function getAnthropicClient(injected?: any): Promise<any | null> {
  if (injected) return injected;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  let AnthropicCtor: any;
  try {
    const sdkMod: any = await import("@anthropic-ai/sdk");
    AnthropicCtor = sdkMod.default ?? sdkMod.Anthropic ?? sdkMod;
  } catch {
    return null;
  }
  if (!AnthropicCtor) return null;
  let client: any = null;
  try {
    client = new AnthropicCtor({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch {
    try {
      client = AnthropicCtor({ apiKey: process.env.ANTHROPIC_API_KEY });
    } catch {
      client = null;
    }
  }
  if (!client) return null;
  return client;
}

export async function callReportLlm(input: CallReportLlmInput): Promise<CallReportLlmResult> {
  const {
    systemPrompt,
    userPromptBuilder,
    model,
    bundle,
    tone,
    level,
    maxTokens,
    parseOnError = "fallback-degraded",
    injectedClient,
  } = input;

  // Validacao SINCRONA whitelist tone/level (anti-injection). Throw antes de
  // chamar LLM. Aceita null/undefined.
  if (tone != null) {
    if (!(WHITELISTED_TONES as readonly string[]).includes(String(tone))) {
      throw new Error(`anthropicClient: tone fora da whitelist: ${tone}`);
    }
  }
  if (level != null) {
    if (!(WHITELISTED_LEVELS as readonly string[]).includes(String(level))) {
      throw new Error(`anthropicClient: level fora da whitelist: ${level}`);
    }
  }

  // Client null path -> degradedReason no_anthropic_key.
  const client = await getAnthropicClient(injectedClient);
  if (!client || !client.messages || typeof client.messages.create !== "function") {
    return {
      content: {},
      usage: null,
      rawText: "",
      degradedReason: "no_anthropic_key",
    };
  }

  const userMsg = userPromptBuilder(bundle, { tone: tone ?? null, level: level ?? null });

  // Sprint AI-3.2 / RF-D6 (ADR-205) — AbortSignal cap absoluto wall-clock.
  // Pos-reviewer CRITICAL-1: `signal` vai no SEGUNDO arg (RequestOptions) do
  // Anthropic SDK — passar no body é silentmente ignorado e cap nunca dispara.
  const capMs = resolveLlmTimeoutMs();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), capMs);
  // Não segura o event-loop em testes/CLI long-running.
  if (typeof (timeoutHandle as any).unref === "function") {
    (timeoutHandle as any).unref();
  }

  try {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await client.messages.create(
          {
            model,
            max_tokens: maxTokens,
            system: [
              { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
            ],
            messages: [{ role: "user", content: userMsg }],
          },
          { signal: controller.signal },
        );
        const text = Array.isArray(response?.content)
          ? response.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
          : (typeof response?.content === "string" ? response.content : "");
        let parsed: any;
        try {
          const m = text.match(/\{[\s\S]*\}/);
          parsed = m ? JSON.parse(m[0]) : JSON.parse(text);
        } catch {
          // parse error — lesson #9: log antes do fallback.
          // Sprint AI-3.2 / RF-C10 (Q#15) — inclui rawText (truncado a 500 chars)
          // pra debug em produção.
          console.warn("anthropicClient.before_fallback", {
            reason: "llm_parse_error",
            model,
            attempt,
            rawText: truncateRawText(text),
          });
          if (parseOnError === "throw") {
            throw new Error("anthropicClient: JSON parse error");
          }
          return {
            content: {},
            usage: response?.usage ?? null,
            rawText: text,
            degradedReason: "llm_parse_error",
          };
        }
        return {
          content: parsed ?? {},
          usage: response?.usage ?? null,
          rawText: text,
        };
      } catch (err) {
        // Sprint AI-3.2 / RF-D6 — cap dispara → degradedReason='llm_timeout'
        // (distinto de llm_failed_3x retry exhaust).
        if (controller.signal.aborted || isAbortError(err)) {
          console.warn("anthropicClient.before_fallback", {
            reason: "timeout",
            model,
            attempt,
            capMs,
          });
          if (parseOnError === "throw") {
            throw err;
          }
          return {
            content: {},
            usage: null,
            rawText: "",
            degradedReason: "llm_timeout",
          };
        }
        const retryable = isRetryableError(err) && attempt < MAX_ATTEMPTS;
        // Lesson #9: log antes do fallback/retry.
        console.warn("anthropicClient.before_fallback", {
          reason: retryable ? "retry" : (attempt >= MAX_ATTEMPTS ? "llm_failed_3x" : "non_retryable"),
          model,
          attempt,
          error: err instanceof Error ? err.message : String(err),
        });
        if (retryable) {
          const backoffMs = 100 * Math.pow(4, attempt - 1); // 100, 400, 1600
          await sleep(backoffMs);
          continue;
        }
        // Nao retryable OU exhausted -> sai do loop e retorna degraded.
        if (parseOnError === "throw") {
          throw err;
        }
        break;
      }
    }
    return {
      content: {},
      usage: null,
      rawText: "",
      degradedReason: "llm_failed_3x",
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
