// =============================================================================
// MuxMediaProvider — Sprint Biblioteca-1 / RF-03 (ADR-072).
//
// Encapsula `@mux/mux-node` para isolar vendor lock. Surface:
//   createPlaybackToken({ playbackId, userPlatformId })
//     -> { url, expiresAt: ISO8601, watermarkText }
//   uploadAsset({ fileBuffer, mimeType })
//     -> { assetId, playbackId }
//
// TTL signed URL = 4h (D8). Watermark text = userPlatformId (CSS overlay no
// frontend; SDK so propaga em metadata).
//
// Fallback de dev: se env Mux ausente, lanca `mux_not_configured` — caller
// transforma em 503 (graceful).
//
// Lesson #5: Mux SDK usa `new Mux()`. Mock SDK em tests cria classe real.
// Provider envolve construcao em try/catch — so falha NA chamada, nao no
// boot, para nao quebrar dev sem env.
// =============================================================================

// SDK Mux importado via namespace lazy para que vi.mock (hoisted no test)
// consiga substituir a classe sem TDZ no import-time. Usamos import() dinamico
// async resolvido de forma sincrona via cache cumulativo.
const FOUR_HOURS_SECONDS = 4 * 60 * 60;

let _muxCtorCache: any = null;
let _muxLoadPromise: Promise<any> | null = null;

async function loadMuxClass(): Promise<any> {
  if (_muxCtorCache) return _muxCtorCache;
  if (!_muxLoadPromise) {
    _muxLoadPromise = import("@mux/mux-node").then((mod: any) => {
      const ctor = mod?.default ?? mod?.Mux ?? mod;
      _muxCtorCache = ctor;
      return ctor;
    });
  }
  return _muxLoadPromise;
}

/**
 * @internal Test-only helper. Used by vitest to reset Mux SDK class cache
 * between tests when vi.mock recreates the mock module. Not part of public API.
 */
export function _resetMuxCacheForTests(): void {
  _muxCtorCache = null;
  _muxLoadPromise = null;
}

export interface CreatePlaybackTokenInput {
  playbackId: string;
  userPlatformId: string;
}

export interface CreatePlaybackTokenOutput {
  url: string;
  expiresAt: string; // ISO8601
  watermarkText: string;
}

export interface UploadAssetInput {
  fileBuffer: Buffer;
  mimeType: string;
}

export interface UploadAssetOutput {
  assetId: string;
  playbackId: string;
}

export interface MuxProvider {
  createPlaybackToken(input: CreatePlaybackTokenInput): Promise<CreatePlaybackTokenOutput>;
  uploadAsset(input: UploadAssetInput): Promise<UploadAssetOutput>;
}

async function makeClient(): Promise<any> {
  // Lesson #5: protege contra `new` falhar em ambiente test sem env real.
  const tokenId = process.env.MUX_TOKEN_ID ?? "dev-token-id";
  const tokenSecret = process.env.MUX_TOKEN_SECRET ?? "dev-token-secret";
  try {
    const MuxCtor = await loadMuxClass();
    const client = new MuxCtor({ tokenId, tokenSecret });
    return client;
  } catch (err) {
    // Lesson #9: log antes do fallback para nao engolir erros silenciosamente.
    console.error("[muxMediaProvider] failed to construct Mux client", err);
    // Fallback: SDK lancou. Cria objeto mock com chamadas que vao explodir.
    return {
      video: { assets: { create: async () => { throw new Error("mux_not_configured"); } } },
      jwt: { signPlaybackId: () => { throw new Error("mux_not_configured"); } },
    };
  }
}

export function createMuxProvider(): MuxProvider {
  // Cliente cacheado por instancia do provider — evita reinicializar SDK por chamada.
  let clientPromise: Promise<any> | null = null;
  function client(): Promise<any> {
    if (!clientPromise) clientPromise = makeClient();
    return clientPromise;
  }

  return {
    async createPlaybackToken({ playbackId, userPlatformId }) {
      if (!process.env.MUX_SIGNING_KEY || !process.env.MUX_SIGNING_KEY_ID) {
        throw new Error("mux_not_configured: MUX_SIGNING_KEY or MUX_SIGNING_KEY_ID missing");
      }
      const expiresInSec = FOUR_HOURS_SECONDS;
      // P1 (biblioteca-launch-fix): incluir `user_id` claim no JWT signed.
      // SDK Mux propaga `config.params` para o body claims do JWT — visivel
      // na verificacao do token (logs Mux + audit trail). Watermark CSS no
      // frontend continua sendo deterrent VISUAL, nao defesa criptografica
      // (token soh impede playback nao-autorizado; pirata legitimado pode
      // gravar tela). Audit pode correlacionar leak <-> user_id via Mux logs.
      const tokenArgs = {
        keyId: process.env.MUX_SIGNING_KEY_ID,
        keySecret: process.env.MUX_SIGNING_KEY,
        expiration: `${expiresInSec}s`,
        type: "video",
        params: {
          user_id: userPlatformId,
        },
      };
      // SDK 14.x: client.jwt.signPlaybackId(playbackId, options)
      const c = await client();
      let signedToken: string;
      try {
        signedToken = await c.jwt.signPlaybackId(playbackId, tokenArgs);
      } catch (err) {
        throw new Error(
          `mux_not_configured: failed to sign playbackId (${err instanceof Error ? err.message : String(err)})`,
        );
      }
      const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
      const url = `https://stream.mux.com/${playbackId}.m3u8?token=${signedToken}`;
      return {
        url,
        expiresAt,
        watermarkText: userPlatformId,
      };
    },

    async uploadAsset({ fileBuffer, mimeType }) {
      if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
        throw new Error("mux_not_configured: MUX_TOKEN_ID or MUX_TOKEN_SECRET missing");
      }
      // F9 / Sprint Biblioteca-1 (placeholder): este caminho usa
      // `tbd://manifest-runtime` como input.url, o que *NAO funciona* em
      // producao real do Mux. Para o Curso 01 da Sprint 1, os videos sao
      // subidos manualmente pelo founder via dashboard Mux e o
      // `videoMuxPlaybackId` eh gravado no DB pelo CSV manifest (nao por
      // este uploader). Sprint Biblioteca-2 implementara Mux Direct Upload
      // URLs (https://docs.mux.com/guides/upload-files-directly) que
      // permitem upload binario via PUT signed URL antes de criar o asset.
      //
      // Sprint MP3.2 / W-A1 (ADR-199): asset creation passa por
      // `createMuxAssetWithSubtitles` para incluir `generated_subtitles`
      // (auto-captioning Mux). Idioma default 'pt'; multi-lang via env CSV
      // MUX_GENERATED_SUBTITLES_LANGS. Retry sem captions se Mux 400.
      const c = await client();
      const { createMuxAssetWithSubtitles } = await import("./muxAssetCreator");
      const created = await createMuxAssetWithSubtitles(
        {
          inputUrl: "tbd://manifest-runtime",
          playbackPolicy: ["public"],
          metadata: { mime: mimeType, size: fileBuffer.length },
        } as any,
        { muxClient: c as any },
      );
      const assetId = String(created?.id ?? "");
      const playbackId = String(created?.playback_ids?.[0]?.id ?? "");
      return { assetId, playbackId };
    },
  };
}
