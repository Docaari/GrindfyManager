/**
 * xAI Grok News Provider — ADR-106 §2.4.
 *
 * Sprint News-1. Implementacao real do ponto de extensao 1 (`fetchNewsItems`)
 * mapeado pelo ADR-100 §2.2. Usa endpoint OpenAI-compativel da xAI:
 *   POST https://api.x.ai/v1/chat/completions
 *
 * Requer XAI_API_KEY em env. Modelo default 'grok-3-latest' (override XAI_MODEL).
 *
 * Live Search habilitado pra category='gossip' via `search_parameters` body field
 * (xAI extension — busca posts no X de handles configurados em news_sources).
 *
 * Fallback graceful: sem API key -> retorna [] + log warn (cron skipa).
 */

import { z } from "zod";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import type { NewsItem, NewsSource } from "@shared/types/news";

// xAI Responses API (formato novo unificado). Doc: console.x.ai.
// Body shape: { model, input, response_format?, search_parameters? }.
const XAI_ENDPOINT = "https://api.x.ai/v1/responses";
const DEFAULT_MODEL = "grok-4-latest";
const TIMEOUT_MS = 90_000;

// Allowlist de hosts pros URLs retornados pelo Grok. Defesa contra LLM
// halucinando dominios ou injetando link malicioso.
const ALLOWED_HOST_SUFFIXES = [
  // veiculos BR
  "mundopoker.com.br",
  "superpoker.com.br",
  "superpoker.com",
  "mundopoker.com",
  // X / Twitter
  "x.com",
  "twitter.com",
  "t.co",
  // softwares trackers
  "hand2note.com",
  "pokertracker.com",
  "holdemmanager.com",
  "jurojin.com",
  "intuitivetable.com",
  "gtowizard.com",
  "sharkscope.com",
  // redes
  "pokerstars.com",
  "ggpoker.com",
  "americascardroom.eu",
  "americascardroom.com",
  "blackchippoker.eu",
  "partypoker.com",
  "888poker.com",
  "coinpoker.com",
  "bodog.eu",
  "bovada.lv",
  "chico.tv",
];

const grokItemSchema = z.object({
  title: z.string().min(3).max(280),
  summary: z.string().min(3).max(280),
  url: z.string().url(),
  publishedAt: z.string().min(4),
  thumbnailUrl: z.string().url().optional().nullable(),
  engagement: z
    .object({
      likes: z.number().int().nonnegative().optional(),
      views: z.number().int().nonnegative().optional(),
      comments: z.number().int().nonnegative().optional(),
    })
    .optional(),
  tags: z.array(z.string()).optional(),
});

const grokResponseSchema = z.object({
  items: z.array(grokItemSchema).max(20),
});

export interface GrokFetchOptions {
  category: NewsSource;
  platform: string;
  promptTemplate: string;
  liveSearchHandle?: string | null;
  limit?: number;
  /** Override model. Default XAI_MODEL ou 'grok-3-latest'. */
  model?: string;
}

/**
 * Sanitiza URL: deve ser http(s) + host na allowlist. Retorna null se invalido.
 */
export function sanitizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    const allowed = ALLOWED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
    return allowed ? u.toString() : null;
  } catch {
    return null;
  }
}

export function contentHash(url: string, title: string): string {
  return createHash("sha256").update(`${url}::${title}`).digest("hex");
}

const RESULT_PATTERNS = [
  /\bvence\b/i,
  /\bvenceu\b/i,
  /\bvitoria\b/i,
  /\bvit[oó]ria\b/i,
  /\bcrava\b/i,
  /\bcravou\b/i,
  /\bcravada\b/i,
  /\bcampe[aã]o\b/i,
  /\bprimeiro lugar\b/i,
  /\bITM\b/i,
  /\bdeep run\b/i,
  /\bfaturou\b/i,
  /\bleva (?:o|a) titulo\b/i,
  /\bbi-?campe[aã]o\b/i,
  /\bgan(?:ha|hou)\b.+\$/i,
];

export function looksLikeTournamentResult(title: string, summary: string): boolean {
  const text = `${title} ${summary}`;
  return RESULT_PATTERNS.some((re) => re.test(text));
}

function isApiKeyConfigured(): boolean {
  const key = process.env.XAI_API_KEY;
  return typeof key === "string" && key.length > 10;
}

export interface GrokNewsItemResolved extends NewsItem {
  contentHash: string;
}

/**
 * Chama xAI Grok e retorna items normalizados/sanitizados. Sem cache (caller
 * decide cache + dedup). Retorna [] em caso de erro/timeout/empty (graceful).
 */
export async function fetchGrokNews(
  opts: GrokFetchOptions,
): Promise<GrokNewsItemResolved[]> {
  if (!isApiKeyConfigured()) {
    console.warn("[grokNewsProvider] XAI_API_KEY ausente — retornando []");
    return [];
  }

  const limit = Math.min(20, Math.max(1, opts.limit ?? 5));
  const model = opts.model ?? process.env.XAI_MODEL ?? DEFAULT_MODEL;

  const systemPrompt = buildSystemPrompt(opts.category);
  const userPrompt = buildUserPrompt(opts, limit);

  // xAI Responses API: campo `input` aceita string OU array {role,content}.
  // Usar array preserva separacao system/user (boa pratica).
  const body: Record<string, any> = {
    model,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  };

  // NOTE: xAI deprecated `search_parameters` em favor da Agent Tools API.
  // Onda 1 News-1: chamada sem live search — Grok retorna best-effort baseado
  // no knowledge interno do modelo. TODO Onda 3.5: migrar para tools API com
  // web_search/x_search tools quando provider validado em prod.

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(XAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[grokNewsProvider] xAI HTTP error", res.status, text.slice(0, 500));
      return [];
    }
    const json: any = await res.json();
    // xAI Responses API: output em json.output[].content[].text OU json.output_text
    // (helper agregado). Fallback robusto pra ambos os shapes.
    let content: string | undefined =
      typeof json?.output_text === "string" ? json.output_text : undefined;
    if (!content && Array.isArray(json?.output)) {
      const parts: string[] = [];
      for (const o of json.output) {
        if (Array.isArray(o?.content)) {
          for (const c of o.content) {
            if (typeof c?.text === "string") parts.push(c.text);
            else if (typeof c?.content === "string") parts.push(c.content);
          }
        }
      }
      if (parts.length > 0) content = parts.join("\n");
    }
    // Fallback chat-completions shape (caso modelo retorne em formato antigo)
    if (!content && typeof json?.choices?.[0]?.message?.content === "string") {
      content = json.choices[0].message.content;
    }
    if (typeof content !== "string") {
      console.warn("[grokNewsProvider] resposta sem content", JSON.stringify(json).slice(0, 500));
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.error("[grokNewsProvider] JSON.parse falhou", err);
      return [];
    }
    const validated = grokResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn("[grokNewsProvider] schema invalido", validated.error.issues.slice(0, 3));
      return [];
    }
    const now = new Date().toISOString();
    const out: GrokNewsItemResolved[] = [];
    for (const raw of validated.data.items) {
      const url = sanitizeUrl(raw.url);
      if (!url) continue;
      // Re-route: items que vierem em 'gossip' mas sao claramente resultados de
      // torneio sao movidos pra 'tournament-results'. Heuristica leve via regex.
      const inferredCategory =
        opts.category === "gossip" && looksLikeTournamentResult(raw.title, raw.summary)
          ? "tournament-results"
          : opts.category;
      out.push({
        id: nanoid(),
        source: inferredCategory,
        platform: opts.platform,
        title: raw.title,
        summary: raw.summary,
        url,
        publishedAt: raw.publishedAt,
        fetchedAt: now,
        thumbnailUrl: raw.thumbnailUrl ?? null,
        engagement: raw.engagement,
        tags: raw.tags,
        contentHash: contentHash(url, raw.title),
      });
    }
    return out;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn("[grokNewsProvider] timeout apos", TIMEOUT_MS, "ms");
    } else {
      console.error("[grokNewsProvider] fetch erro", err?.message ?? err);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function buildSystemPrompt(category: NewsSource): string {
  const base =
    "Voce e um agregador de noticias de poker. Retorna SEMPRE JSON valido no formato " +
    `{ "items": [{ "title", "summary", "url", "publishedAt", "thumbnailUrl?", "engagement?": {"likes","views","comments"}, "tags?": [] }] }. ` +
    "Sem texto fora do JSON. summary <=280 chars. publishedAt em ISO 8601. " +
    "URL deve ser fonte oficial (site do produto, veiculo conhecido, post original no X).";
  switch (category) {
    case "tools":
      return (
        base +
        " Foco: atualizacoes de software de poker (trackers, HUDs, solvers, table managers): " +
        "novas versoes, features, bugfixes, integracoes. EVITA: noticias de redes de poker, " +
        "resultados de torneios, fofocas."
      );
    case "sites":
      return (
        base +
        " Foco: anuncios oficiais de redes de poker (PokerStars, GG, WPN, etc): lancamentos, " +
        "promos, novas series, mudancas de software/regras. EVITA: resultados de torneios " +
        "individuais (ex: 'Joao venceu X'), fofocas pessoais, software trackers."
      );
    case "market":
      return (
        base +
        " Foco: lancamentos de software/redes, atualizacoes de versao, novas features. " +
        "EVITA: especulacao, opinioes editoriais, fofocas pessoais."
      );
    case "gossip":
      return (
        base +
        " Foco: pautas hypadas dos veiculos brasileiros de poker (MundoPoker, SuperPoker) " +
        "ou posts de pros brasileiros no X com alto engajamento. " +
        "EVITA TOTALMENTE: resultados de torneios (cravadas, vitorias, ITM, primeiro lugar). " +
        "Itens com 'venceu', 'crava', 'campeao', 'primeiro lugar', 'ITM grande' DEVEM ser excluidos. " +
        "INCLUI: comportamentos polemicos, anuncios pessoais, declaracoes, threads opinionatas, drama."
      );
    case "tournament-results":
      return (
        base +
        " Foco: cravadas, ITM grandes, vitorias notaveis em torneios online de brasileiros. " +
        "INCLUI valor do premio em USD quando disponivel via tag 'prize:USD'."
      );
    case "studies":
      return (
        base +
        " Foco: artigos tecnicos, blog posts, video aulas curtas, threads de estudo de poker " +
        "(ranges, GTO, ICM, MTT theory). Apenas conteudo educacional — nao promocional."
      );
    default:
      return base;
  }
}

function buildUserPrompt(opts: GrokFetchOptions, limit: number): string {
  const tpl = opts.promptTemplate.replace(/\{\{platform\}\}/g, opts.platform);
  return `${tpl}\n\nRetorna ate ${limit} items. Idioma: portugues brasileiro quando aplicavel.`;
}
