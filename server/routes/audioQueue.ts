// Sprint Mini Player 3 / RF-05.5 / RF-05.6 — POST/GET /api/audio/queue.
// ADR-193. Persistencia server-side opcional (last-write-wins por `version`).
// Lazy storage injection (lesson #34) — handler aceita 3o arg p/ tests.

import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";

const VALID_REPEAT = new Set(["off", "all", "one"]);
const MAX_QUEUE_ITEMS = 50;

interface InjectedDeps {
  storage?: {
    getAudioQueueSnapshot: (userId: string) => Promise<any | null>;
    upsertAudioQueueSnapshot: (input: any) => Promise<{ version: number }>;
  };
}

async function resolveStorage(injected?: InjectedDeps["storage"]) {
  if (injected) return injected;
  return await import("../storage/audioQueueSnapshotsStorage");
}

function validatePayload(body: any): { ok: true } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "invalid_body" };
  if (!Array.isArray(body.queue)) return { ok: false, reason: "queue_not_array" };
  if (body.queue.length > MAX_QUEUE_ITEMS)
    return { ok: false, reason: "queue_too_long" };
  if (typeof body.repeatMode !== "string" || !VALID_REPEAT.has(body.repeatMode))
    return { ok: false, reason: "invalid_repeat_mode" };
  if (typeof body.shuffleEnabled !== "boolean")
    return { ok: false, reason: "invalid_shuffle" };
  if (body.shuffledOrder != null && !Array.isArray(body.shuffledOrder))
    return { ok: false, reason: "invalid_shuffled_order" };
  if (typeof body.version !== "number" || !Number.isFinite(body.version))
    return { ok: false, reason: "invalid_version" };
  return { ok: true };
}

export async function handlePostAudioQueue(
  req: Request,
  res: Response,
  deps?: InjectedDeps,
): Promise<void> {
  try {
    const userId = (req as any).user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    const body = (req as any).body ?? {};
    const validation = validatePayload(body);
    if (!validation.ok) {
      res.status(400).json({ message: validation.reason });
      return;
    }

    const storage = await resolveStorage(deps?.storage);

    // Last-write-wins: server version >= client.version -> 409.
    const current = await storage.getAudioQueueSnapshot(userId);
    if (current && current.version >= body.version) {
      res.status(409).json({
        message: "version_conflict",
        version: current.version,
        queue: current.queue,
        repeatMode: current.repeatMode,
        shuffleEnabled: current.shuffleEnabled,
        shuffledOrder: current.shuffledOrder,
      });
      return;
    }

    const result = await storage.upsertAudioQueueSnapshot({
      userId,
      queue: body.queue,
      repeatMode: body.repeatMode,
      shuffleEnabled: body.shuffleEnabled,
      shuffledOrder: body.shuffledOrder ?? null,
      version: body.version,
    });

    res.status(200).json({ accepted: true, version: result.version });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("audioQueue.handlePostAudioQueue.error", err);
    res.status(500).json({ message: "Erro interno" });
  }
}

// MP3.1 R1 fix CRITICAL-3: route registration (antes os handlers existiam
// mas a rota nunca era plugada em routes/index.ts).
export function registerAudioQueueRoutes(app: Express): void {
  app.post("/api/audio/queue", requireAuth, async (req, res) => {
    await handlePostAudioQueue(req, res);
  });
  app.get("/api/audio/queue", requireAuth, async (req, res) => {
    await handleGetAudioQueue(req, res);
  });
}

export async function handleGetAudioQueue(
  req: Request,
  res: Response,
  deps?: InjectedDeps,
): Promise<void> {
  try {
    const userId = (req as any).user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    const storage = await resolveStorage(deps?.storage);
    const row = await storage.getAudioQueueSnapshot(userId);
    if (!row) {
      res.status(404).json({ message: "queue_not_found" });
      return;
    }
    res.status(200).json({
      queue: row.queue ?? [],
      repeatMode: row.repeatMode ?? "off",
      shuffleEnabled: !!row.shuffleEnabled,
      shuffledOrder: row.shuffledOrder ?? null,
      version: row.version ?? 1,
      updatedAt: row.updatedAt,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("audioQueue.handleGetAudioQueue.error", err);
    res.status(500).json({ message: "Erro interno" });
  }
}
