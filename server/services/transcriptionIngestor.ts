// =============================================================================
// TranscriptionIngestor — Sprint MP3.1 Wave A / HIGH-1 (ADR-196).
//
// Antes deste sprint, `library_lessons.transcription_preview` ficava SEMPRE
// NULL — coluna criada pela migration 0078 sem pipeline de ingestao. UI
// (LessonPickerDialog metadata) mostrava placeholder eternamente. Este
// modulo plugou a fonte oficial: Mux text tracks (closed captions auto-
// geradas ou uploaded). Trade-off: depende do Mux ter tracks `type=text`
// disponiveis no asset; quando ausente, ingestor retorna `reason:
// 'no_text_tracks'` e a coluna fica NULL (graceful — UI ja trata).
//
// Fallback futuro (Opcao B, defer MP3.2): Whisper local OR OpenAI API,
// async batch job. Documentado em ADR-196 mas nao implementado nesta wave.
//
// Lesson #5: Mux SDK usa `new Mux()`. Reuso lazy loader em
// `muxMediaProvider.ts` — provider eh shared client cached.
// Lesson #9: log antes de fallback, nao engole erros.
// Lesson #34: storage 3o arg opcional pra teste sem mockar modulo inteiro.
// =============================================================================

export interface MuxAssetClientLike {
  video: {
    assets: {
      retrieve: (assetId: string) => Promise<any>;
    };
  };
}

export interface TranscriptionIngestDeps {
  muxClient?: MuxAssetClientLike;
  fetchVttText?: (url: string) => Promise<string>;
  now?: () => Date;
}

export interface IngestResult {
  ok: boolean;
  preview?: string | null;
  reason?:
    | "no_asset"
    | "no_playback_id"
    | "no_text_tracks"
    | "fetch_failed"
    | "empty_transcript"
    | "mux_not_configured";
}

const PREVIEW_MAX = 80;
const ELLIPSIS = "…";

// Strip VTT cue metadata (timestamps, NOTE blocks, WEBVTT header, cue ids,
// speaker labels) and return concatenated speech text. Mantem espacamento
// simples; nao normaliza acentos (preview eh display, nao fingerprint).
export function extractTextFromVtt(vtt: string): string {
  if (typeof vtt !== "string" || vtt.length === 0) return "";
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];
  let skipBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      skipBlock = false;
      continue;
    }
    if (line.startsWith("WEBVTT")) continue;
    if (line.startsWith("NOTE")) {
      skipBlock = true;
      continue;
    }
    if (skipBlock) continue;
    // Timestamp cue line "00:00:01.000 --> 00:00:04.000"
    if (/\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(line))
      continue;
    // Cue identifier (numeric or short token followed by timestamp on next).
    if (/^\d+$/.test(line)) continue;
    // Stripa tags inline VTT (<v Author>, <c.classname>, <i>, <b>, etc).
    const stripped = line.replace(/<[^>]+>/g, "").trim();
    if (stripped) out.push(stripped);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

export function truncatePreview(text: string, max = PREVIEW_MAX): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (t.length <= max) return t;
  // Recorte em boundary de espaco se possivel.
  const slice = t.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const head = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return head + ELLIPSIS;
}

function buildVttUrl(playbackId: string, trackId: string): string {
  return `https://stream.mux.com/${playbackId}/text/${trackId}.vtt`;
}

async function defaultFetchVtt(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch_vtt_failed_${res.status}`);
  }
  return await res.text();
}

async function resolveMuxClient(
  injected?: MuxAssetClientLike,
): Promise<MuxAssetClientLike | null> {
  if (injected) return injected;
  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
    return null;
  }
  try {
    const mod: any = await import("@mux/mux-node");
    const Ctor = mod?.default ?? mod?.Mux ?? mod;
    return new Ctor({
      tokenId: process.env.MUX_TOKEN_ID,
      tokenSecret: process.env.MUX_TOKEN_SECRET,
    }) as MuxAssetClientLike;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("transcriptionIngestor.resolveMuxClient.error", err);
    return null;
  }
}

export async function ingestPreviewFromMux(
  input: { assetId: string | null; playbackId: string | null },
  deps?: TranscriptionIngestDeps,
): Promise<IngestResult> {
  if (!input.assetId) return { ok: false, reason: "no_asset" };
  if (!input.playbackId) return { ok: false, reason: "no_playback_id" };

  const client = await resolveMuxClient(deps?.muxClient);
  if (!client) return { ok: false, reason: "mux_not_configured" };

  let asset: any;
  try {
    asset = await client.video.assets.retrieve(input.assetId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("transcriptionIngestor.retrieveAsset.error", { err, assetId: input.assetId });
    return { ok: false, reason: "fetch_failed" };
  }

  // Mux SDK retorna { data: { tracks } } OU { tracks } dependendo da versao.
  const tracks: any[] = asset?.data?.tracks ?? asset?.tracks ?? [];
  const textTracks = tracks.filter(
    (t) =>
      (t?.type === "text" || t?.kind === "text") &&
      (t?.status ?? "ready") === "ready",
  );
  if (textTracks.length === 0) return { ok: false, reason: "no_text_tracks" };

  // Preferencia: subtitles antes de captions; uploaded antes de generated_vod.
  const sorted = textTracks.slice().sort((a, b) => {
    const aw =
      (a.text_type === "subtitles" ? 0 : 1) +
      (a.text_source === "uploaded" ? 0 : 0.1);
    const bw =
      (b.text_type === "subtitles" ? 0 : 1) +
      (b.text_source === "uploaded" ? 0 : 0.1);
    return aw - bw;
  });

  const fetchVtt = deps?.fetchVttText ?? defaultFetchVtt;
  for (const track of sorted) {
    const trackId = track?.id;
    if (!trackId) continue;
    const url = buildVttUrl(input.playbackId, String(trackId));
    let vtt: string;
    try {
      vtt = await fetchVtt(url);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("transcriptionIngestor.fetchVtt.error", { err, url });
      continue;
    }
    const text = extractTextFromVtt(vtt);
    const preview = truncatePreview(text);
    if (preview) return { ok: true, preview };
  }

  return { ok: false, reason: "empty_transcript" };
}
