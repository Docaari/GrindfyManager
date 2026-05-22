// Sprint Mini Player 3 / RF-05.5 / RF-05.6 — POST/GET /api/audio/queue.
// ADR-193. Persistencia server-side opcional (last-write-wins por `version`).
// Lazy storage injection (lesson #34) — handler aceita 3o arg p/ tests.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";

const MAX_QUEUE_ITEMS = 50;

// MP3.1 M1: Zod per-item validation. Antes: validatePayload manual checava
// apenas shape macro (queue array, repeatMode enum). Itens individuais
// passavam livres — um cliente malicioso podia enviar title:10MB ou
// trackId binario quebrando a UI alheia ao sincronizar. Schema strict + caps
// alinhados com server limits (varchar 200 title, etc).
const audioTrackSchema = z
  .object({
    source: z.enum(["library", "spotify"]),
    trackId: z.string().min(1).max(128),
    title: z.string().min(1).max(200),
    audioUrl: z.string().max(2000).optional(),
    coverUrl: z.string().max(500).nullable().optional(),
    courseTitle: z.string().max(200).nullable().optional(),
    durationSeconds: z.number().nonnegative().finite().optional(),
    spotifyUri: z.string().max(200).optional(),
  })
  .strict();

const queueItemSchema = z
  .object({
    id: z.string().min(1).max(64),
    track: audioTrackSchema,
    addedAt: z.number().nonnegative().finite(),
  })
  .strict();

const audioQueueBodySchema = z
  .object({
    queue: z.array(queueItemSchema).max(MAX_QUEUE_ITEMS),
    repeatMode: z.enum(["off", "all", "one"]),
    shuffleEnabled: z.boolean(),
    shuffledOrder: z.array(z.string().min(1).max(64)).nullable().optional(),
    version: z.number().int().positive().finite(),
  })
  .strict();

export type AudioQueueBody = z.infer<typeof audioQueueBodySchema>;

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

function validatePayload(
  body: any,
):
  | { ok: true; data: AudioQueueBody }
  | { ok: false; reason: string; details?: unknown } {
  const parsed = audioQueueBodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.join(".") ?? "body";
    return {
      ok: false,
      reason: `invalid_${path}`,
      details: parsed.error.issues.slice(0, 5),
    };
  }
  return { ok: true, data: parsed.data };
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
      res.status(400).json({ message: validation.reason, issues: validation.details });
      return;
    }

    const data = validation.data;
    const storage = await resolveStorage(deps?.storage);

    // Last-write-wins: server version >= client.version -> 409.
    const current = await storage.getAudioQueueSnapshot(userId);
    if (current && current.version >= data.version) {
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
      queue: data.queue,
      repeatMode: data.repeatMode,
      shuffleEnabled: data.shuffleEnabled,
      shuffledOrder: data.shuffledOrder ?? null,
      version: data.version,
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
