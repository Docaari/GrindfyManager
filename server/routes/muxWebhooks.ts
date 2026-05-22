// Sprint Mini Player 3.2 / W-A2 (ADR-199) — Mux webhook handler.
//
// Recebe events Mux (POST /api/mux/webhooks) e dispara o ingestor de
// transcription preview quando uma track text fica `ready`.
//
// Security:
//  - HMAC SHA-256 valido obrigatorio (Mux-Signature header).
//  - Replay window 5min (timestamp dentro do header).
//  - timingSafeEqual para evitar timing attacks.
//
// Robustez:
//  - Sempre responde 200 em erro interno (evita Mux retry agressivo).
//  - Idempotente (lesson com preview ja populado -> no-op).
//
// Lesson #34: handler aceita 3o arg `injectedDeps?` para teste isolado.

import crypto from "crypto";
import { ingestPreviewFromMux as defaultIngest } from "../services/transcriptionIngestor";

const REPLAY_WINDOW_SEC = 5 * 60; // 5min

interface LessonForWebhook {
  id: string;
  videoMuxPlaybackId?: string | null;
  transcriptionPreview?: string | null;
  transcriptionPreviews?: Record<string, string> | null;
}

export interface MuxWebhookDeps {
  ingestPreviewFromMux?: (
    input: { assetId: string | null; playbackId: string | null },
  ) => Promise<{ ok: boolean; preview?: string | null; reason?: string }>;
  getLessonByMuxAssetId?: (assetId: string) => Promise<LessonForWebhook | null>;
  updatePreview?: (
    lessonId: string,
    preview: string,
    meta?: any,
  ) => Promise<void>;
}

function parseSignatureHeader(
  header: string | undefined | null,
): { ts: number; v1: string } | null {
  if (!header || typeof header !== "string") return null;
  const parts = header.split(",").map((p) => p.trim());
  let ts: number | null = null;
  let v1: string | null = null;
  for (const part of parts) {
    if (part.startsWith("t=")) {
      const n = Number(part.slice(2));
      if (Number.isFinite(n)) ts = n;
    } else if (part.startsWith("v1=")) {
      v1 = part.slice(3);
    }
  }
  if (ts === null || v1 === null) return null;
  return { ts, v1 };
}

function verifySignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return false;
  // Replay window check.
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - parsed.ts) > REPLAY_WINDOW_SEC) return false;
  // Compute HMAC.
  const bodyStr =
    typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const payload = `${parsed.ts}.${bodyStr}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  // Lengths podem diferir se tampered — timingSafeEqual exige mesmo length.
  if (expected.length !== parsed.v1.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(parsed.v1, "utf8"),
    );
  } catch {
    return false;
  }
}

function getHeader(req: any, name: string): string | undefined {
  const lower = name.toLowerCase();
  if (typeof req.header === "function") {
    const v = req.header(lower);
    if (v) return String(v);
  }
  if (typeof req.get === "function") {
    const v = req.get(lower);
    if (v) return String(v);
  }
  if (req.headers && typeof req.headers === "object") {
    const v = req.headers[lower] ?? req.headers[name];
    if (Array.isArray(v)) return v[0];
    if (v) return String(v);
  }
  return undefined;
}

export async function handleMuxWebhook(
  req: any,
  res: any,
  injectedDeps?: MuxWebhookDeps,
): Promise<void> {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (!secret) {
    // Boot fail: webhook registrado sem secret eh erro de configuracao.
    // Lanca para que o framework retorne 500 (test aceita throw OR status 500).
    throw new Error("MUX_WEBHOOK_SECRET_MISSING");
  }

  const signature = getHeader(req, "mux-signature");
  if (!signature) {
    res.status(401).json({ error: "missing_signature" });
    return;
  }
  // Raw body resolution priority:
  //  1. req.rawBody (testes injetam explicitamente Buffer)
  //  2. req.body when it's a Buffer (PROD: express.raw middleware)
  //  3. JSON.stringify(req.body) (fallback legado — nao usado em prod)
  let rawBody: Buffer | string;
  if (req.rawBody) {
    rawBody = req.rawBody;
  } else if (Buffer.isBuffer(req.body)) {
    rawBody = req.body;
  } else if (req.body) {
    rawBody = JSON.stringify(req.body);
  } else {
    rawBody = "";
  }
  if (!verifySignature(rawBody, signature, secret)) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  // Parse event payload: se req.body for Buffer (PROD), parse JSON;
  // se ja for objeto (tests), usa direto.
  let event: any;
  if (Buffer.isBuffer(req.body)) {
    try {
      event = JSON.parse(req.body.toString("utf8"));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("muxWebhook.body_parse_failed", { err });
      res.status(400).json({ error: "invalid_json" });
      return;
    }
  } else {
    event = req.body ?? {};
  }
  const type = event?.type;
  // Apenas video.asset.track.ready com type='text' eh relevante.
  if (type !== "video.asset.track.ready") {
    res.status(200).json({ ok: true, ignored: type ?? "unknown" });
    return;
  }
  const data = event?.data ?? {};
  if (data?.type !== "text") {
    res.status(200).json({ ok: true, ignored: "non_text_track" });
    return;
  }

  const assetId = data?.asset_id ?? data?.assetId ?? null;
  if (!assetId) {
    res.status(200).json({ ok: true, ignored: "missing_asset_id" });
    return;
  }

  const deps = injectedDeps ?? {};
  const ingest = deps.ingestPreviewFromMux ?? defaultIngest;
  const getLesson =
    deps.getLessonByMuxAssetId ?? defaultGetLessonByMuxAssetId;
  const updatePreview = deps.updatePreview ?? defaultUpdatePreview;

  try {
    const lesson = await getLesson(String(assetId));
    if (!lesson) {
      // eslint-disable-next-line no-console
      console.warn("muxWebhook.lesson_not_found", { assetId });
      res.status(200).json({ ok: true, ignored: "lesson_not_found" });
      return;
    }
    // Idempotencia: short-circuit se ja populado.
    const hasLegacy =
      typeof lesson.transcriptionPreview === "string" &&
      lesson.transcriptionPreview.length > 0;
    const hasJsonb =
      lesson.transcriptionPreviews &&
      typeof lesson.transcriptionPreviews === "object" &&
      Object.keys(lesson.transcriptionPreviews).length > 0;
    if (hasLegacy || hasJsonb) {
      res.status(200).json({ ok: true, ignored: "already_populated" });
      return;
    }
    const result = await ingest({
      assetId: String(assetId),
      playbackId: lesson.videoMuxPlaybackId ?? null,
    });
    if (result.ok && result.preview) {
      try {
        await updatePreview(lesson.id, result.preview, { lang: "pt" });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("muxWebhook.update.error", { err, lessonId: lesson.id });
      }
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("muxWebhook.handler.error", { err });
    // Mesmo em erro, retorna 200 para evitar Mux retry agressivo.
    res.status(200).json({ ok: false, error: "internal" });
  }
}

async function defaultGetLessonByMuxAssetId(
  assetId: string,
): Promise<LessonForWebhook | null> {
  try {
    const { db } = await import("../db");
    if (!db || typeof (db as any).select !== "function") return null;
    const schemaMod: any = await import("@shared/schema");
    const tbl = schemaMod?.libraryLessons;
    if (!tbl) return null;
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(tbl)
      .where(eq(tbl.videoMuxAssetId, assetId))
      .limit(1);
    return (rows as any[])[0] ?? null;
  } catch {
    return null;
  }
}

async function defaultUpdatePreview(
  lessonId: string,
  preview: string,
  meta?: { lang?: string },
): Promise<void> {
  try {
    const { writeTranscriptionPreview } = await import(
      "../storage/transcriptionPreviewStorage"
    );
    await writeTranscriptionPreview(lessonId, meta?.lang ?? "pt", preview);
  } catch {
    // ignore
  }
}
