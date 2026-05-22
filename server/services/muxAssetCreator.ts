// Sprint Mini Player 3.2 / W-A1 (ADR-199) — Mux asset creation com generated_subtitles.
//
// Estende o codepath de upload Mux para incluir `generated_subtitles` no
// POST /video/v1/assets. Garante que toda lesson nova gere auto-caption sem
// intervencao manual no Dashboard Mux.
//
// Idioma default 'pt' (audiencia BR). Permite multi-lang via env CSV.
// Failure path: Mux 400 lang invalido -> retry sem captions + warn (best-effort).
//
// Lesson #5: Mux SDK usa `new Mux()`. Mock em teste pode passar objeto
// direto via opts.muxClient.

export interface MuxAssetCreatorClient {
  video: {
    assets: {
      create: (payload: any) => Promise<any>;
    };
  };
}

export interface CreateMuxAssetInput {
  inputUrl: string;
  playbackPolicy?: string[];
  passthrough?: string;
  [key: string]: any;
}

export interface CreateMuxAssetOpts {
  muxClient?: MuxAssetCreatorClient;
}

// Compat alias para callers que ja usam o tipo do ingestor.
export type MuxAssetClientLike = MuxAssetCreatorClient;

function parseLangsFromEnv(): string[] {
  const raw = process.env.MUX_GENERATED_SUBTITLES_LANGS;
  if (!raw || typeof raw !== "string") return ["pt"];
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return ["pt"];
  return parts;
}

function buildGeneratedSubtitlesPayload(langs: string[]): Array<{
  language_code: string;
  name: string;
}> {
  return langs.map((code) => ({
    language_code: code,
    name: code === "pt" ? "Portugues (auto)" : `${code.toUpperCase()} (auto)`,
  }));
}

/**
 * Cria asset Mux com `generated_subtitles` no payload. Caso a primeira
 * chamada falhe com HTTP 400 (lang invalido), retry sem captions + log warn.
 */
export async function createMuxAssetWithSubtitles(
  input: CreateMuxAssetInput,
  opts: CreateMuxAssetOpts = {},
): Promise<any> {
  const client = opts.muxClient ?? (await resolveMuxClient());
  if (!client) {
    throw new Error("mux_not_configured");
  }
  const langs = parseLangsFromEnv();
  const { inputUrl, playbackPolicy, passthrough, ...extra } = input;
  const basePayload: Record<string, any> = {
    ...extra,
    input: inputUrl,
    playback_policy: playbackPolicy ?? ["public"],
    ...(passthrough ? { passthrough } : {}),
  };
  const payloadWithSubs = {
    ...basePayload,
    generated_subtitles: buildGeneratedSubtitlesPayload(langs),
  };
  try {
    return await client.video.assets.create(payloadWithSubs);
  } catch (err: any) {
    const status = err?.status ?? err?.statusCode;
    if (status === 400) {
      // eslint-disable-next-line no-console
      console.warn(
        "muxAssetCreator.generated_subtitles.rejected — retry sem captions",
        { err: err?.message ?? err, langs },
      );
      // Retry sem captions (asset criado sem caption — best-effort).
      return await client.video.assets.create(basePayload);
    }
    throw err;
  }
}

async function resolveMuxClient(): Promise<MuxAssetCreatorClient | null> {
  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) return null;
  try {
    const mod: any = await import("@mux/mux-node");
    const Ctor = mod?.default ?? mod?.Mux ?? mod;
    // Lesson #5: tenta `new`, fallback factory call.
    try {
      return new Ctor({
        tokenId: process.env.MUX_TOKEN_ID,
        tokenSecret: process.env.MUX_TOKEN_SECRET,
      }) as MuxAssetCreatorClient;
    } catch {
      return Ctor({
        tokenId: process.env.MUX_TOKEN_ID,
        tokenSecret: process.env.MUX_TOKEN_SECRET,
      }) as MuxAssetCreatorClient;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("muxAssetCreator.resolveMuxClient.error", err);
    return null;
  }
}
