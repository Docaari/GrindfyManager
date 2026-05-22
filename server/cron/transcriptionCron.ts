// Sprint Mini Player 3.2 / W-A2 (ADR-199) — Transcription ingest cron tick.
//
// Roda diariamente as 04:00 UTC (~01:00 BRT — baixo trafego). Varre
// lessons com `transcription_preview IS NULL` E `mux_asset_id IS NOT NULL`,
// cap 100 por run, sleep 1s entre Mux calls (rate limit defensivo).
//
// Gates:
//  - MUX_TOKEN_ID ausente -> skip silencioso (log info 1x).
//  - TRANSCRIPTION_INGEST_ENABLED=false -> skip.
//
// Idempotente: cron + webhook (W-A2) podem rodar em paralelo. Lessons
// ja preenchidas sao excluidas da query (filter IS NULL).
//
// Lesson #34: handler aceita deps injetadas para teste isolado.

import { ingestPreviewFromMux as defaultIngest } from "../services/transcriptionIngestor";
import { sleep as defaultSleep } from "../utils/sleep";

export const TRANSCRIPTION_CRON_SCHEDULE = "0 4 * * *";
export const TRANSCRIPTION_CRON_TZ = "UTC";
const DEFAULT_LIMIT = 100;
const DEFAULT_SLEEP_MS = 1000;

export interface CandidateLesson {
  id: string;
  videoMuxAssetId: string | null;
  videoMuxPlaybackId: string | null;
}

export interface TranscriptionCronDeps {
  listCandidates?: (opts: { limit: number }) => Promise<CandidateLesson[]>;
  ingestPreviewFromMux?: (
    input: { assetId: string | null; playbackId: string | null },
  ) => Promise<{ ok: boolean; preview?: string | null; reason?: string }>;
  updatePreview?: (lessonId: string, preview: string) => Promise<void>;
  sleepFn?: (ms: number) => Promise<void>;
  sleepMs?: number;
  limit?: number;
}

export interface TranscriptionCronResult {
  skipped?: boolean;
  reason?: string;
  updated: number;
  failed: number;
  skipped_lessons: number;
  reasons: Record<string, number>;
}

function muxConfigured(): boolean {
  return !!process.env.MUX_TOKEN_ID && !!process.env.MUX_TOKEN_SECRET;
}

function ingestEnabled(): boolean {
  // Default ENABLED quando ausente; desliga apenas com "false" explicito.
  return process.env.TRANSCRIPTION_INGEST_ENABLED !== "false";
}

export async function runTranscriptionCronTick(
  deps: TranscriptionCronDeps = {},
): Promise<TranscriptionCronResult> {
  if (!ingestEnabled()) {
    return {
      skipped: true,
      reason: "disabled",
      updated: 0,
      failed: 0,
      skipped_lessons: 0,
      reasons: {},
    };
  }
  if (!muxConfigured()) {
    // eslint-disable-next-line no-console
    console.info(
      "transcriptionCron: MUX_TOKEN_ID/SECRET ausente — skip tick",
    );
    return {
      skipped: true,
      reason: "mux_not_configured",
      updated: 0,
      failed: 0,
      skipped_lessons: 0,
      reasons: {},
    };
  }

  const limit = deps.limit ?? DEFAULT_LIMIT;
  const sleepMs = deps.sleepMs ?? DEFAULT_SLEEP_MS;
  const sleepFn = deps.sleepFn ?? defaultSleep;
  const listCandidates =
    deps.listCandidates ?? defaultListCandidates;
  const ingest = deps.ingestPreviewFromMux ?? defaultIngest;
  const updatePreview = deps.updatePreview ?? defaultUpdatePreview;

  const candidates = await listCandidates({ limit });
  const result: TranscriptionCronResult = {
    updated: 0,
    failed: 0,
    skipped_lessons: 0,
    reasons: {},
  };
  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    try {
      const r = await ingest({
        assetId: row.videoMuxAssetId,
        playbackId: row.videoMuxPlaybackId,
      });
      if (r.ok && r.preview) {
        try {
          await updatePreview(row.id, r.preview);
          result.updated += 1;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("transcriptionCron.update.error", {
            err,
            lessonId: row.id,
          });
          result.failed += 1;
          result.reasons["update_failed"] =
            (result.reasons["update_failed"] ?? 0) + 1;
        }
      } else {
        result.skipped_lessons += 1;
        const reason = r.reason ?? "unknown";
        result.reasons[reason] = (result.reasons[reason] ?? 0) + 1;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("transcriptionCron.ingest.error", {
        err: (err as any)?.message ?? err,
        lessonId: row.id,
      });
      result.failed += 1;
    }
    // Sleep entre items (n-1 vezes para n items).
    if (sleepMs > 0 && i < candidates.length - 1) {
      await sleepFn(sleepMs);
    }
  }
  return result;
}

// Fallback storage implementations — lazy-loaded para nao quebrar tests que
// nao mockam `../storage/transcriptionPreviewStorage`.
async function defaultListCandidates(opts: {
  limit: number;
}): Promise<CandidateLesson[]> {
  try {
    const mod: any = await import("../storage/transcriptionPreviewStorage");
    if (typeof mod._listCandidatesForTests === "function") {
      const rows = await mod._listCandidatesForTests({ limit: opts.limit });
      return rows as CandidateLesson[];
    }
  } catch {
    // ignore
  }
  return [];
}

async function defaultUpdatePreview(
  lessonId: string,
  preview: string,
): Promise<void> {
  // Sprint MP3.2 / W-A4 (ADR-201) — escreve em transcription_previews JSONB
  // (lang='pt' default) + mirror em varchar legacy (back-compat). Mesmo
  // codepath do webhook (`server/routes/muxWebhooks.ts`).
  try {
    const { writeTranscriptionPreview } = await import(
      "../storage/transcriptionPreviewStorage"
    );
    await writeTranscriptionPreview(lessonId, "pt", preview);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("transcriptionCron.defaultUpdatePreview.error", { err, lessonId });
  }
}
