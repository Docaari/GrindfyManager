/**
 * Suprema Auto-Sync Job
 * Runs every hour and syncs Suprema tournaments for users with autoImportSuprema enabled.
 */

import { db } from "./db";
import { tournamentLibrary, tournamentLibrarySettings } from "@shared/schema";
import { processSupremaSync } from "@shared/library-suprema-sync";
import { fetchSupremaTournaments } from "./supremaService";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function syncUserSuprema(userId: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const supremaTournaments = await fetchSupremaTournaments(today);

  // Get all library entries (active + trashed) for dedup
  const existingLibrary = await db
    .select()
    .from(tournamentLibrary)
    .where(eq(tournamentLibrary.userId, userId));

  const newTournaments = processSupremaSync(supremaTournaments, existingLibrary);

  for (const t of newTournaments) {
    await db.insert(tournamentLibrary).values({
      id: nanoid(),
      userId,
      name: t.name,
      site: t.site,
      buyIn: t.buyIn,
      guaranteed: t.guaranteed,
      time: t.time,
      type: t.type,
      speed: t.speed,
      source: t.source,
      externalId: t.externalId,
    });
  }

  return newTournaments.length;
}

async function runSupremaAutoSync(): Promise<void> {
  try {
    // Find users with auto-import enabled
    const settings = await db
      .select()
      .from(tournamentLibrarySettings)
      .where(eq(tournamentLibrarySettings.autoImportSuprema, true));

    if (settings.length === 0) return;

    console.log(`[SupremaAutoSync] Starting sync for ${settings.length} user(s)`);

    for (const setting of settings) {
      try {
        const count = await syncUserSuprema(setting.userId);

        // Update sync status
        await db
          .update(tournamentLibrarySettings)
          .set({
            lastSupremaSync: new Date(),
            lastSupremaSyncStatus: "success",
          })
          .where(eq(tournamentLibrarySettings.userId, setting.userId));

        if (count > 0) {
          console.log(`[SupremaAutoSync] User ${setting.userId}: ${count} new tournament(s) synced`);
        }
      } catch (error: any) {
        console.error(`[SupremaAutoSync] Error syncing user ${setting.userId}:`, error.message);

        // Update sync status with error
        try {
          await db
            .update(tournamentLibrarySettings)
            .set({
              lastSupremaSync: new Date(),
              lastSupremaSyncStatus: "error",
            })
            .where(eq(tournamentLibrarySettings.userId, setting.userId));
        } catch {
          // Ignore settings update failure
        }
      }
    }

    console.log("[SupremaAutoSync] Sync cycle complete");
  } catch (error: any) {
    console.error("[SupremaAutoSync] Fatal error:", error.message);
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startSupremaAutoSync(): void {
  if (intervalId) return;
  console.log("[SupremaAutoSync] Job started (interval: 1 hour)");
  intervalId = setInterval(runSupremaAutoSync, SYNC_INTERVAL_MS);
}

export function stopSupremaAutoSync(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
