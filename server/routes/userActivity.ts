// Sprint Mini Player 2 (ADR-191 / RF-04.2) — POST /api/user-activity/batch.
//
// Reusa tabela user_activity. Aceita batch sendBeacon (cap 10 events).
//
// Body: { events: [{ action, feature?, duration?, page, metadata }] }
// Resposta: { accepted: N }

import type { Express } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";

const MAX_BATCH = 10;
const MAX_METADATA_BYTES = 10 * 1024;

const PII_KEYS = new Set([
  "email",
  "emailAddress",
  "userEmail",
  "displayName",
  "display_name",
  "name",
  "fullName",
]);

function stripPII(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripPII);
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PII_KEYS.has(k)) continue; // drop
    out[k] = stripPII(v);
  }
  return out;
}

const eventSchema = z.object({
  action: z.string().min(1).max(64),
  feature: z.string().max(64).optional().nullable(),
  duration: z.number().int().min(0).max(86400).optional().nullable(),
  page: z.string().min(1).max(64),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export async function handlePostUserActivityBatch(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    const body = req.body ?? {};
    const events = body.events;
    if (!Array.isArray(events)) {
      res.status(400).json({ message: "events array obrigatorio" });
      return;
    }
    if (events.length > MAX_BATCH) {
      res.status(400).json({ message: `cap ${MAX_BATCH} eventos por batch` });
      return;
    }
    if (events.length === 0) {
      res.status(200).json({ accepted: 0 });
      return;
    }

    const sanitized: any[] = [];
    for (const raw of events) {
      const parsed = eventSchema.safeParse(raw);
      if (!parsed.success) {
        res
          .status(400)
          .json({ message: "event invalido", details: parsed.error.issues });
        return;
      }
      const md = parsed.data.metadata
        ? stripPII(parsed.data.metadata)
        : parsed.data.metadata ?? null;
      const mdSize = md ? JSON.stringify(md).length : 0;
      if (mdSize > MAX_METADATA_BYTES) {
        res
          .status(400)
          .json({ message: `metadata > ${MAX_METADATA_BYTES}B` });
        return;
      }
      sanitized.push({
        userId,
        action: parsed.data.action,
        feature: parsed.data.feature ?? null,
        duration: parsed.data.duration ?? null,
        page: parsed.data.page,
        metadata: md,
        ipAddress: req.ip ?? null,
        userAgent: req.get?.("User-Agent") ?? null,
      });
    }

    const storage =
      injectedStorage ?? (await import("../storage")).storage;
    await storage.logUserActivityBatch(sanitized);

    res.status(200).json({ accepted: sanitized.length });
  } catch (err) {
    console.error("user_activity.batch.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

export function registerUserActivityRoutes(app: Express): void {
  app.post("/api/user-activity/batch", requireAuth, async (req, res) => {
    await handlePostUserActivityBatch(req, res);
  });
}
