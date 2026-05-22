// Sprint Mini Player 3 (ADR-193) — Drizzle storage for audio_queue_snapshots.
// Lesson #36: lazy schema import + fallback placeholder pra mocks parciais.

import { eq, sql } from "drizzle-orm";
import { db } from "../db";

export interface AudioQueueSnapshotRow {
  userId: string;
  queue: any[];
  repeatMode: "off" | "all" | "one";
  shuffleEnabled: boolean;
  shuffledOrder: string[] | null;
  version: number;
  updatedAt: Date;
}

export interface UpsertAudioQueueInput {
  userId: string;
  queue: any[];
  repeatMode: "off" | "all" | "one";
  shuffleEnabled: boolean;
  shuffledOrder: string[] | null;
  version: number;
}

async function loadTable(): Promise<any> {
  try {
    const mod: any = await import("@shared/schema");
    if (mod?.audioQueueSnapshots) return mod.audioQueueSnapshots;
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "audioQueueSnapshotsStorage: @shared/schema.audioQueueSnapshots nao carregou",
      );
    }
    // eslint-disable-next-line no-console
    console.warn("audioQueueSnapshotsStorage.loadTable.fallback", { err });
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "audioQueueSnapshotsStorage: @shared/schema.audioQueueSnapshots ausente em prod",
    );
  }
  return {
    userId: { name: "user_id" },
    queue: { name: "queue_jsonb" },
    repeatMode: { name: "repeat_mode" },
    shuffleEnabled: { name: "shuffle_enabled" },
    shuffledOrder: { name: "shuffled_order" },
    version: { name: "version" },
    updatedAt: { name: "updated_at" },
  };
}

export async function getAudioQueueSnapshot(
  userId: string,
): Promise<AudioQueueSnapshotRow | null> {
  if (!userId) return null;
  if (!db || typeof (db as any).select !== "function") return null;
  const tbl = await loadTable();
  try {
    const rows = await db
      .select()
      .from(tbl)
      .where(eq(tbl.userId, userId))
      .limit(1);
    const row: any = rows?.[0];
    if (!row) return null;
    return {
      userId: row.userId ?? row.user_id ?? userId,
      queue: Array.isArray(row.queue) ? row.queue : [],
      repeatMode: row.repeatMode ?? row.repeat_mode ?? "off",
      shuffleEnabled: !!(row.shuffleEnabled ?? row.shuffle_enabled),
      shuffledOrder: row.shuffledOrder ?? row.shuffled_order ?? null,
      version: Number(row.version ?? 1),
      updatedAt: row.updatedAt ?? row.updated_at ?? new Date(),
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("audioQueueSnapshotsStorage.getAudioQueueSnapshot.error", err);
    return null;
  }
}

export async function upsertAudioQueueSnapshot(
  input: UpsertAudioQueueInput,
): Promise<{ version: number }> {
  if (!db || typeof (db as any).insert !== "function") {
    return { version: input.version };
  }
  const tbl = await loadTable();
  try {
    await db
      .insert(tbl)
      .values({
        userId: input.userId,
        queue: input.queue,
        repeatMode: input.repeatMode,
        shuffleEnabled: input.shuffleEnabled,
        shuffledOrder: input.shuffledOrder,
        version: input.version,
        updatedAt: new Date(),
      } as any)
      .onConflictDoUpdate({
        target: tbl.userId,
        set: {
          queue: input.queue,
          repeatMode: input.repeatMode,
          shuffleEnabled: input.shuffleEnabled,
          shuffledOrder: input.shuffledOrder,
          version: input.version,
          updatedAt: new Date(),
        } as any,
      } as any);
    return { version: input.version };
  } catch (err) {
    // MP3.1 R1 fix MEDIUM-5: rethrow para 500 chegar ao client. Antes
    // retornava success com version=input.version mascarando erros de DB
    // (constraint, fk, timeout). Handler em routes/audioQueue.ts captura e
    // responde 500 (`Erro interno`).
    // eslint-disable-next-line no-console
    console.error("audioQueueSnapshotsStorage.upsertAudioQueueSnapshot.error", err);
    throw err;
  }
}
