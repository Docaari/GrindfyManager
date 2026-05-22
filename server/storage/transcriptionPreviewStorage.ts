// Sprint MP3.1 Wave A / H1 — backfill helper para transcription_preview.
// Lesson #36: lazy @shared/schema + fallback placeholder.

import { eq, isNull, inArray, and } from "drizzle-orm";
import { db } from "../db";
import {
  ingestPreviewFromMux,
  type TranscriptionIngestDeps,
} from "../services/transcriptionIngestor";

export interface BackfillResult {
  updated: number;
  skipped: number;
  failed: number;
  reasons: Record<string, number>;
}

export interface BackfillOpts {
  lessonIds?: string[];
  limit?: number;
  deps?: TranscriptionIngestDeps;
  onProgress?: (n: number, total: number, lessonId: string) => void;
}

async function loadTable(): Promise<any> {
  try {
    const mod: any = await import("@shared/schema");
    if (mod?.libraryLessons) return mod.libraryLessons;
  } catch (err) {
    if (process.env.NODE_ENV === "production") throw err;
    // eslint-disable-next-line no-console
    console.warn("transcriptionPreviewStorage.loadTable.fallback", { err });
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "transcriptionPreviewStorage: libraryLessons ausente em prod",
    );
  }
  // Minimal placeholder (tests com db mockado nao usam as colunas).
  return {
    id: { name: "id" },
    videoMuxAssetId: { name: "video_mux_asset_id" },
    videoMuxPlaybackId: { name: "video_mux_playback_id" },
    transcriptionPreview: { name: "transcription_preview" },
  };
}

interface LessonRow {
  id: string;
  videoMuxAssetId: string | null;
  videoMuxPlaybackId: string | null;
}

async function listCandidates(
  opts: BackfillOpts,
): Promise<LessonRow[]> {
  if (!db || typeof (db as any).select !== "function") return [];
  const tbl = await loadTable();
  const conds: any[] = [isNull(tbl.transcriptionPreview)];
  if (opts.lessonIds && opts.lessonIds.length > 0) {
    conds.push(inArray(tbl.id, opts.lessonIds));
  }
  const whereClause = conds.length === 1 ? conds[0] : and(...conds);
  let q = db
    .select({
      id: tbl.id,
      videoMuxAssetId: tbl.videoMuxAssetId,
      videoMuxPlaybackId: tbl.videoMuxPlaybackId,
    })
    .from(tbl)
    .where(whereClause);
  if (opts.limit && opts.limit > 0) {
    q = (q as any).limit(opts.limit);
  }
  const rows = await q;
  return rows as LessonRow[];
}

async function updatePreview(
  lessonId: string,
  preview: string,
): Promise<void> {
  if (!db || typeof (db as any).update !== "function") return;
  const tbl = await loadTable();
  await db
    .update(tbl)
    .set({ transcriptionPreview: preview, updatedAt: new Date() } as any)
    .where(eq(tbl.id, lessonId));
}

export async function backfillTranscriptionPreviews(
  opts: BackfillOpts = {},
): Promise<BackfillResult> {
  const candidates = await listCandidates(opts);
  const result: BackfillResult = {
    updated: 0,
    skipped: 0,
    failed: 0,
    reasons: {},
  };
  const total = candidates.length;
  for (let i = 0; i < total; i++) {
    const row = candidates[i];
    opts.onProgress?.(i + 1, total, row.id);
    const ingest = await ingestPreviewFromMux(
      { assetId: row.videoMuxAssetId, playbackId: row.videoMuxPlaybackId },
      opts.deps,
    );
    if (ingest.ok && ingest.preview) {
      try {
        await updatePreview(row.id, ingest.preview);
        result.updated++;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("backfillTranscriptionPreviews.update.error", { err, lessonId: row.id });
        result.failed++;
        result.reasons["update_failed"] = (result.reasons["update_failed"] ?? 0) + 1;
      }
    } else {
      result.skipped++;
      const reason = ingest.reason ?? "unknown";
      result.reasons[reason] = (result.reasons[reason] ?? 0) + 1;
    }
  }
  return result;
}

// Test/script helper expostos para teste unitario do orquestrador.
export { listCandidates as _listCandidatesForTests, updatePreview as _updatePreviewForTests };
